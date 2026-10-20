#!/usr/bin/env python3
"""Exhaustively audit a prepared TNDS runtime package without source access."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path

from refresh_bus_data import RefreshError, TNDS_REGIONS

MAX_RUNTIME_BYTES = 8 * 1024 * 1024
FRAGMENT_FIELDS = ("parentServiceId", "fragmentId", "fragmentOrdinal", "fragmentCount", "fragmentDepartureEvidenceCount", "parentDepartureEvidenceCount", "parentEvidenceByDayCounts")
SERVICE_DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def evidence_rows(service: dict) -> int:
    evidence = service.get("departureEvidenceByDay", {})
    if not isinstance(evidence, dict):
        raise RefreshError(f"Malformed departureEvidenceByDay for {service.get('id')}")
    return sum(len(rows) for rows in evidence.values() if isinstance(rows, list))


def evidence_hash(service: dict) -> str:
    raw = json.dumps(service.get("departureEvidenceByDay", {}), ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def audit_prepared_tnds(root: Path, measurement_path: Path | None = None) -> dict:
    root = root.resolve()
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != "atlas-prepared-bus-tnds-v2":
        raise RefreshError("Prepared TNDS manifest schema mismatch")
    if manifest.get("regions") != list(TNDS_REGIONS):
        raise RefreshError("Prepared TNDS does not contain exactly the required eight regions")
    limit = manifest.get("runtimeShardMaxBytes")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= MAX_RUNTIME_BYTES:
        raise RefreshError("Prepared TNDS runtime shard ceiling is missing or above 8 MiB")
    service_shards = manifest.get("serviceShards")
    if not isinstance(service_shards, dict) or not service_shards:
        raise RefreshError("Prepared TNDS serviceShards are missing")

    logical_ids: set[str] = set()
    ids_by_region = {region: set() for region in TNDS_REGIONS}
    logical_evidence_by_id: dict[str, int] = {}
    fragment_evidence_by_identity: dict[tuple[str, int], str] = {}
    fragment_order_by_identity: dict[tuple[str, int], dict[str, list[int]]] = {}
    fragment_expectations: dict[str, tuple[int, int]] = {}
    fragment_day_counts: dict[str, dict[str, int]] = {}
    region_fragment_sets: dict[tuple[str, str], dict[int, tuple[str, int]]] = {}
    physical_evidence_count = 0
    decompressed_sizes: list[int] = []
    descriptor_count = 0
    fragment_descriptor_count = 0
    for prefix, descriptors in service_shards.items():
        if not isinstance(prefix, str) or len(prefix) != manifest.get("serviceShardKeyLength") or not isinstance(descriptors, list) or not descriptors:
            raise RefreshError(f"Malformed TNDS stop-prefix descriptor list: {prefix}")
        prefix_ids: set[str] = set()
        for descriptor in descriptors:
            relative = descriptor.get("path") if isinstance(descriptor, dict) else None
            if not isinstance(relative, str) or not relative or not isinstance(descriptor.get("stopIds"), list):
                raise RefreshError("Malformed TNDS shard descriptor")
            target = (root / relative).resolve()
            if root not in target.parents or not target.is_file():
                raise RefreshError(f"Missing or unsafe TNDS shard: {relative}")
            declared_size = descriptor.get("uncompressedBytes")
            if isinstance(declared_size, bool) or not isinstance(declared_size, int) or not 1 <= declared_size <= limit:
                raise RefreshError(f"TNDS shard exceeds or omits its bounded size: {relative}")
            with gzip.open(target, "rb") as stream:
                content = stream.read(limit + 1)
            if len(content) > limit:
                raise RefreshError(f"TNDS shard decompresses above the bounded size: {relative}")
            if len(content) != declared_size or target.stat().st_size != descriptor.get("compressedBytes"):
                raise RefreshError(f"TNDS shard byte counts do not match its descriptor: {relative}")
            decompressed_sizes.append(len(content))
            descriptor_count += 1
            try:
                payload = json.loads(content.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise RefreshError(f"TNDS shard is not valid UTF-8 JSON: {relative}") from error
            region = str(payload.get("region", "")).upper()
            if payload.get("schema") != "atlas-prepared-bus-tnds-v2" or payload.get("stopPrefix") != prefix or region not in TNDS_REGIONS or not isinstance(payload.get("services"), list) or not payload["services"]:
                raise RefreshError(f"TNDS shard header or service list is malformed: {relative}")
            fragment_descriptor = any(field in descriptor for field in FRAGMENT_FIELDS)
            if fragment_descriptor and (not all(field in descriptor for field in FRAGMENT_FIELDS) or len(payload["services"]) != 1):
                raise RefreshError(f"TNDS fragment descriptor or physical row count is malformed: {relative}")
            if fragment_descriptor:
                fragment_descriptor_count += 1
            shard_stop_ids: set[str] = set()
            for service in payload["services"]:
                parent = str(service.get("id", ""))
                fragment = service.get("fragment")
                row_identity = fragment.get("fragmentId") if isinstance(fragment, dict) else parent
                if not parent or not row_identity or row_identity in prefix_ids:
                    raise RefreshError(f"Duplicate or missing TNDS service/fragment identity: {relative}")
                prefix_ids.add(row_identity)
                logical_ids.add(parent)
                source_region = str(service.get("source", {}).get("region", "")).upper()
                if source_region != region:
                    raise RefreshError(f"TNDS service source region disagrees with its shard: {relative}")
                ids_by_region[region].add(parent)
                count = evidence_rows(service)
                physical_evidence_count += count
                relevant = set(map(str, service.get("stopSchedules", {}))) | set(map(str, (service.get("tndsQuarantine") or {}).get("affectedStopIds", [])))
                indexed = sorted(stop_id for stop_id in relevant if stop_id.startswith(prefix))
                shard_stop_ids.update(indexed)
                if not indexed:
                    raise RefreshError(f"TNDS shard contains no stop indexed by {prefix}: {relative}")
                if fragment_descriptor:
                    expected = {
                        "parentServiceId": descriptor["parentServiceId"], "fragmentId": descriptor["fragmentId"],
                        "ordinal": descriptor["fragmentOrdinal"], "count": descriptor["fragmentCount"],
                        "fragmentDepartureEvidenceCount": descriptor["fragmentDepartureEvidenceCount"],
                        "parentDepartureEvidenceCount": descriptor["parentDepartureEvidenceCount"],
                        "parentEvidenceByDayCounts": descriptor["parentEvidenceByDayCounts"]
                    }
                    if parent != descriptor["parentServiceId"] or not isinstance(fragment, dict) or any(fragment.get(key) != value for key, value in expected.items()) or count != descriptor["fragmentDepartureEvidenceCount"]:
                        raise RefreshError(f"TNDS fragment does not match its manifest descriptor: {relative}")
                    day_counts = descriptor["parentEvidenceByDayCounts"]
                    order = fragment.get("evidenceOrderByDay")
                    evidence = service.get("departureEvidenceByDay", {})
                    if (not isinstance(day_counts, dict) or set(day_counts) != set(SERVICE_DAYS)
                            or any(isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in day_counts.values())
                            or sum(day_counts.values()) != descriptor["parentDepartureEvidenceCount"]
                            or not isinstance(order, dict) or set(order) != set(SERVICE_DAYS)):
                        raise RefreshError(f"TNDS fragment row-order metadata is malformed: {relative}")
                    order_signature = {}
                    for day in SERVICE_DAYS:
                        indexes = order[day]
                        rows = evidence.get(day, [])
                        if (not isinstance(indexes, list) or not isinstance(rows, list) or len(indexes) != len(rows)
                                or any(isinstance(index, bool) or not isinstance(index, int) or index < 0 for index in indexes)):
                            raise RefreshError(f"TNDS fragment row-order metadata is malformed: {relative}/{day}")
                        order_signature[day] = indexes
                    parent_count = descriptor["parentDepartureEvidenceCount"]
                    part_count = descriptor["fragmentCount"]
                    ordinal = descriptor["fragmentOrdinal"]
                    if isinstance(parent_count, bool) or not isinstance(parent_count, int) or parent_count < 1 or isinstance(part_count, bool) or not isinstance(part_count, int) or part_count < 2 or isinstance(ordinal, bool) or not isinstance(ordinal, int) or not 1 <= ordinal <= part_count:
                        raise RefreshError(f"TNDS fragment counts are invalid: {relative}")
                    previous = fragment_expectations.setdefault(parent, (part_count, parent_count))
                    if previous != (part_count, parent_count):
                        raise RefreshError(f"TNDS fragment parent counts disagree: {parent}")
                    previous_day_counts = fragment_day_counts.setdefault(parent, day_counts)
                    if previous_day_counts != day_counts:
                        raise RefreshError(f"TNDS fragment parent per-day evidence counts disagree: {parent}")
                    digest = evidence_hash(service)
                    fragment_identity = (parent, ordinal)
                    old_digest = fragment_evidence_by_identity.setdefault(fragment_identity, digest)
                    if old_digest != digest:
                        raise RefreshError(f"Repeated stop-prefix copy of TNDS journey fragment differs: {parent}/{ordinal}")
                    old_order = fragment_order_by_identity.setdefault(fragment_identity, order_signature)
                    if old_order != order_signature:
                        raise RefreshError(f"Repeated stop-prefix copy of TNDS journey fragment order differs: {parent}/{ordinal}")
                    region_fragment_sets.setdefault((prefix, parent), {})[ordinal] = (digest, count, order_signature)
                else:
                    if fragment is not None:
                        raise RefreshError(f"TNDS fragment is missing its manifest descriptor: {relative}")
                    old_count = logical_evidence_by_id.setdefault(parent, count)
                    if old_count != count:
                        raise RefreshError(f"Repeated stop-prefix copy of TNDS logical evidence differs: {parent}")
            if sorted(shard_stop_ids) != descriptor["stopIds"]:
                raise RefreshError(f"TNDS stop index does not match the shard contents: {relative}")

    for (prefix, parent), parts in region_fragment_sets.items():
        expected_parts, expected_evidence = fragment_expectations[parent]
        if sorted(parts) != list(range(1, expected_parts + 1)) or sum(value[1] for value in parts.values()) != expected_evidence:
            raise RefreshError(f"TNDS fragmented parent is incomplete or evidence was lost/duplicated in prefix {prefix}: {parent}")
        day_counts = fragment_day_counts[parent]
        for day in SERVICE_DAYS:
            indexes = [index for ordinal in range(1, expected_parts + 1) for index in parts[ordinal][2][day]]
            if sorted(indexes) != list(range(day_counts[day])):
                raise RefreshError(f"TNDS fragmented parent does not preserve every original row position for {prefix}/{parent}/{day}")
        prior = logical_evidence_by_id.setdefault(parent, expected_evidence)
        if prior != expected_evidence:
            raise RefreshError(f"TNDS fragmented parent evidence count disagrees across stop prefixes: {parent}")

    if len(logical_ids) != manifest.get("serviceCount") or manifest.get("logicalRecordCount", manifest.get("serviceCount")) != len(logical_ids):
        raise RefreshError("TNDS logical record count does not reconcile with unique parent identities")
    if len(decompressed_sizes) != manifest.get("runtimeShardCount") or sum(decompressed_sizes) != manifest.get("runtimeShardTotalBytes") or max(decompressed_sizes, default=0) != manifest.get("runtimeShardMaxObservedBytes"):
        raise RefreshError("TNDS runtime shard measurements do not match packaged files")
    if fragment_descriptor_count != manifest.get("fragmentRecordCount", 0):
        raise RefreshError("TNDS fragment descriptor count does not match its manifest")
    if sum(logical_evidence_by_id.values()) != manifest.get("logicalDepartureEvidenceCount"):
        raise RefreshError("TNDS logical departure-evidence count does not reconcile")
    if physical_evidence_count != manifest.get("fragmentDepartureEvidenceCount"):
        raise RefreshError("TNDS physical departure-evidence count does not reconcile")
    identity_hashes = manifest.get("regionServiceIdentitySha256")
    if not isinstance(identity_hashes, dict) or set(identity_hashes) != set(TNDS_REGIONS):
        raise RefreshError("TNDS logical identity hashes do not cover exactly eight regions")
    for region in TNDS_REGIONS:
        identities = ids_by_region[region]
        if len(identities) != manifest.get("regionServiceCounts", {}).get(region):
            raise RefreshError(f"TNDS logical service count does not reconcile for {region}")
        digest = hashlib.sha256(("\n".join(sorted(identities)) + "\n").encode("utf-8")).hexdigest()
        if digest != identity_hashes.get(region):
            raise RefreshError(f"TNDS logical service identity digest does not reconcile for {region}")
    source_conservation = None
    if measurement_path is not None:
        measurement = json.loads(measurement_path.read_text(encoding="utf-8"))
        if measurement.get("preparedRecordCount") != len(logical_ids):
            raise RefreshError("Frozen-input prepared logical record count does not match the runtime package")
        if measurement.get("perRegionRecordCounts") != manifest.get("regionServiceCounts"):
            raise RefreshError("Frozen-input prepared per-region logical record counts do not match the runtime package")
        if measurement.get("perRegionIdentitySha256") != identity_hashes:
            raise RefreshError("Frozen-input prepared logical identity hashes do not match the runtime package")
        if measurement.get("logicalDepartureEvidenceCount") != manifest.get("logicalDepartureEvidenceCount"):
            raise RefreshError("Frozen-input logical departure-evidence count does not match the runtime package")
        parsed_count = measurement.get("parsedRecordCount")
        prepared_count = measurement.get("preparedRecordCount")
        if (isinstance(parsed_count, bool) or not isinstance(parsed_count, int) or isinstance(prepared_count, bool)
                or not isinstance(prepared_count, int) or parsed_count < prepared_count):
            raise RefreshError("Frozen-input parsed/prepared logical record counts are malformed")
        ineligible_count = parsed_count - prepared_count
        declared_ineligible = measurement.get("nonRuntimeMaterializableRecordCount")
        if declared_ineligible is not None and declared_ineligible != ineligible_count:
            raise RefreshError("Frozen-input metadata-only exclusion count does not reconcile")
        if measurement.get("parsedLogicalDepartureEvidenceCount") != measurement.get("logicalDepartureEvidenceCount"):
            raise RefreshError("A source identity excluded from runtime preparation contains departure-evidence rows")
        source_conservation = {
            "frozenInputPreparedLogicalRecordCount": measurement["preparedRecordCount"],
            "packageLogicalRecordCount": len(logical_ids),
            "perRegionIdentityHashesMatch": True,
            "frozenInputLogicalDepartureEvidenceCount": measurement["logicalDepartureEvidenceCount"],
            "packageLogicalDepartureEvidenceCount": manifest["logicalDepartureEvidenceCount"],
            "allParsedLogicalRecordCount": measurement.get("parsedRecordCount"),
            "explicitlyIneligibleMetadataOnlyRecordCount": ineligible_count,
            "metadataOnlyEligibilityRule": "no scheduled departure evidence and no quarantine-affected stops",
            "excludedRecordsHaveDepartureEvidence": False,
            "sourceAcquisition": False
        }
    return {
        "schema": "atlas-s2c3-frozen-tnds-package-audit-v1",
        "regions": list(TNDS_REGIONS),
        "logicalParentCount": len(logical_ids),
        "fragmentDescriptorCount": fragment_descriptor_count,
        "fragmentedParentCount": len(fragment_expectations),
        "physicalShardCount": len(decompressed_sizes),
        "maximumDecompressedShardBytes": max(decompressed_sizes, default=0),
        "logicalDepartureEvidenceCount": sum(logical_evidence_by_id.values()),
        "physicalDepartureEvidenceCount": physical_evidence_count,
        "sourceConservation": source_conservation,
        "sourceAcquisition": False,
        "publicationAttempted": False,
        "deploymentAttempted": False
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared-root", required=True)
    parser.add_argument("--measurement-report")
    parser.add_argument("--output")
    args = parser.parse_args()
    report = audit_prepared_tnds(Path(args.prepared_root), Path(args.measurement_report) if args.measurement_report else None)
    serialized = json.dumps(report, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(serialized, encoding="utf-8")
    print(serialized, end="")


if __name__ == "__main__":
    main()
