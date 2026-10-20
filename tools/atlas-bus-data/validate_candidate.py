#!/usr/bin/env python3
"""Validate the generated public ATLAS data tree before Pages upload."""
from __future__ import annotations

import argparse
import hashlib
import gzip
import json
from pathlib import Path

from refresh_bus_data import BODS_REGIONS, RefreshError, TNDS_REGIONS, bods_region_set_is_exact, bus_candidate_metrics, candidate_metrics, validate_tnds_region_coverage

KNOWN_TNDS_QUARANTINE_REASONS = {"incomplete_runtime_sequence", "missing_timing_links"}
BUS_SCHEMAS = {"atlas-prepared-bus-data-v1", "atlas-prepared-bus-data-v2"}
V2_GROUP_SCHEMA = "atlas-prepared-logical-groups-v1"
V2_LOCALITY_SCHEMA = "atlas-prepared-nptg-localities-v1"
TNDS_RUNTIME_SHARD_MAX_BYTES = 8 * 1024 * 1024
ENDPOINT_MATCH_METHODS = {"gtfs-stop-id-equals-atco-code", "gtfs-stop-code-equals-naptan-code", "unresolved"}


def read_json(path: Path):
    try:
        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8") as stream:
                return json.load(stream)
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, gzip.BadGzipFile, json.JSONDecodeError) as error:
        raise RefreshError(f"Candidate data file is unreadable: {path}") from error


def read_bounded_tnds_json(path: Path, max_bytes: int) -> tuple[dict, int]:
    chunks = []
    total = 0
    try:
        with gzip.open(path, "rb") as stream:
            while True:
                chunk = stream.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise RefreshError(f"Candidate TNDS runtime shard exceeds the bounded {max_bytes}-byte limit: {path.name}")
                chunks.append(chunk)
        return json.loads(b"".join(chunks).decode("utf-8")), total
    except RefreshError:
        raise
    except (OSError, gzip.BadGzipFile, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RefreshError(f"Candidate TNDS runtime shard is unreadable: {path.name}") from error


def validate_tnds_service(service: dict, relative: str) -> None:
    if not isinstance(service, dict) or not service.get("source", {}).get("region"):
        raise RefreshError(f"Candidate TNDS service is empty or malformed: {relative}")
    source = service.get("source", {})
    if not service.get("id") and not source.get("serviceCode"):
        raise RefreshError(f"Candidate TNDS service has no identity: {relative}")
    schedules = service.get("stopSchedules")
    if not isinstance(schedules, dict):
        raise RefreshError(f"Candidate TNDS service has malformed stopSchedules: {relative}")
    quarantine = service.get("tndsQuarantine")
    if not quarantine:
        if not schedules:
            raise RefreshError(f"Candidate TNDS service is empty or malformed: {relative}")
        return
    if not isinstance(quarantine, dict) or quarantine.get("serviceQuarantined") not in {True, False}:
        raise RefreshError(f"Candidate TNDS quarantine metadata is malformed: {relative}")
    affected = quarantine.get("affectedStopIds")
    patterns = quarantine.get("patterns")
    if not isinstance(affected, list) or not affected or any(not isinstance(stop_id, str) or not stop_id for stop_id in affected) or len(set(affected)) != len(affected):
        raise RefreshError(f"Candidate TNDS quarantine affectedStopIds are malformed: {relative}")
    if not isinstance(patterns, list) or not patterns:
        raise RefreshError(f"Candidate TNDS quarantine patterns are malformed: {relative}")
    for pattern in patterns:
        if not isinstance(pattern, dict) or not pattern.get("patternId") or pattern.get("reasonCode") not in KNOWN_TNDS_QUARANTINE_REASONS:
            raise RefreshError(f"Candidate TNDS quarantine pattern is malformed: {relative}")
        pattern_stops = pattern.get("affectedStopIds")
        if not isinstance(pattern_stops, list) or not pattern_stops or any(stop_id not in affected for stop_id in pattern_stops):
            raise RefreshError(f"Candidate TNDS quarantine pattern scope is malformed: {relative}")
    if quarantine["serviceQuarantined"] and schedules:
        raise RefreshError(f"Candidate TNDS quarantine contains fabricated timetable schedules: {relative}")
    if not quarantine["serviceQuarantined"] and not schedules:
        raise RefreshError(f"Candidate TNDS service is empty or malformed: {relative}")


def shard_paths(mapping: dict, label: str) -> list[str]:
    if not isinstance(mapping, dict) or not mapping:
        raise RefreshError(f"Candidate {label} shards are missing or malformed")
    paths = []
    for key, configured in mapping.items():
        values = configured if isinstance(configured, list) else [configured]
        if not isinstance(key, str) or not values or any(not isinstance(value, str) or not value for value in values):
            raise RefreshError(f"Candidate {label} shards are malformed")
        paths.extend(values)
    return paths


def unpack_stop(record, fields: list[str], relative: str) -> dict:
    if not isinstance(record, list) or len(record) != len(fields):
        raise RefreshError(f"Candidate StopPoint record is malformed: {relative}")
    return dict(zip(fields, record))


def validate_v2_sidecars(bus: Path, manifest: dict, stop_ids: set[str]) -> dict:
    group_paths = shard_paths(manifest.get("groupShards"), "logical-group")
    locality_paths = shard_paths(manifest.get("localityShards"), "locality")
    groups: dict[str, dict] = {}
    localities: dict[str, dict] = {}
    for relative in group_paths:
        payload = read_json(bus / relative)
        if payload.get("schema") != V2_GROUP_SCHEMA or not isinstance(payload.get("groups"), list) or not payload["groups"]:
            raise RefreshError(f"Candidate logical-group shard is empty or malformed: {relative}")
        for group in payload["groups"]:
            identity = group.get("id") if isinstance(group, dict) else None
            if not identity or identity in groups:
                raise RefreshError(f"Candidate logical-group identity is missing or duplicated: {relative}")
            groups[identity] = group
    for relative in locality_paths:
        payload = read_json(bus / relative)
        if payload.get("schema") != V2_LOCALITY_SCHEMA or not isinstance(payload.get("localities"), list) or not payload["localities"]:
            raise RefreshError(f"Candidate locality shard is empty or malformed: {relative}")
        for locality in payload["localities"]:
            identity = locality.get("id") if isinstance(locality, dict) else None
            if not identity or identity in localities:
                raise RefreshError(f"Candidate locality identity is missing or duplicated: {relative}")
            localities[identity] = locality
    for group in groups.values():
        if group.get("status") != "active":
            continue
        members = group.get("memberStopPointIds")
        if not isinstance(members, list) or len(set(members)) != len(members):
            raise RefreshError(f"Candidate active logical-group members are malformed: {group.get('id')}")
        missing_members = group.get("missingMemberStopPointIds", [])
        if not isinstance(missing_members, list) or missing_members:
            raise RefreshError(f"Candidate active logical-group has unresolved members: {group.get('id')}")
        missing = [stop_id for stop_id in members if str(stop_id) not in stop_ids]
        if missing:
            raise RefreshError(f"Active logical-group member StopPoint is missing: {missing[0]}")
    for locality in localities.values():
        if locality.get("districtId") and locality.get("districtName") is not None and not isinstance(locality.get("districtName"), str):
            raise RefreshError(f"Candidate locality district name is missing: {locality.get('id')}")
    return {"groups": groups, "localities": localities, "groupShardCount": len(group_paths), "localityShardCount": len(locality_paths)}


def validate_endpoint_evidence(service: dict, relative: str, stop_ids: set[str]) -> None:
    evidence = service.get("endpointEvidence")
    if not isinstance(evidence, dict) or set(evidence) != {"origin", "destination"}:
        raise RefreshError(f"Candidate V2 service endpointEvidence is missing or malformed: {relative}")
    for side in ("origin", "destination"):
        entries = evidence.get(side)
        if not isinstance(entries, dict):
            raise RefreshError(f"Candidate V2 {side} endpointEvidence is malformed: {relative}")
        for key, item in entries.items():
            if not isinstance(key, str) or not key or not isinstance(item, dict):
                raise RefreshError(f"Candidate V2 endpoint evidence identity is malformed: {relative}")
            method = item.get("exactMatchMethod")
            resolved = item.get("resolvedStopPointId")
            if method not in ENDPOINT_MATCH_METHODS:
                raise RefreshError(f"Candidate V2 endpoint evidence match method is not exact or explicit unresolved: {relative}")
            if resolved and str(resolved) not in stop_ids:
                raise RefreshError(f"Candidate V2 endpoint evidence resolves to a missing StopPoint: {resolved}")
            if resolved and key != str(resolved):
                raise RefreshError(f"Candidate V2 endpoint evidence is not keyed by resolved StopPoint ID: {relative}")
            if not resolved and not key.startswith("raw:"):
                raise RefreshError(f"Candidate V2 unresolved endpoint evidence is not keyed by raw identity: {relative}")
            if item.get("stopAreas") is not None and not isinstance(item.get("stopAreas"), list):
                raise RefreshError(f"Candidate V2 endpoint StopArea evidence is malformed: {relative}")


def mark_structurally_validated(site: Path, metrics: dict) -> None:
    status_path = site / "atlas" / "data" / "status" / "manifest.json"
    try:
        status = json.loads(status_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RefreshError("Candidate status manifest is missing or invalid") from error
    if status.get("status") == "sanity_checked":
        status["status"] = "structurally_validated"
        status["structuralValidation"] = "passed"
        status["structuralValidatedAt"] = status.get("candidateGeneratedAt")
        status["preparedCounts"] = {**status.get("preparedCounts", {}), **metrics}
        status_path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")


def validate(site: Path, bus_only: bool = False) -> dict:
    data = site / "atlas" / "data"
    bus = data / "bus"
    bus_manifest = read_json(bus / "manifest.json")
    bus_schema = bus_manifest.get("schema")
    if bus_schema not in BUS_SCHEMAS:
        raise RefreshError("Candidate NaPTAN/BODS manifest schema is invalid")
    sources = bus_manifest.get("sources") if isinstance(bus_manifest.get("sources"), dict) else {}
    bods_source = sources.get("bods") if isinstance(sources.get("bods"), dict) else {}
    bods_regions = bods_source.get("regions", [])
    if bus_schema == "atlas-prepared-bus-data-v2":
        if not bods_region_set_is_exact(bods_regions):
            received = [item.get("region") if isinstance(item, dict) else None for item in bods_regions] if isinstance(bods_regions, list) else []
            raise RefreshError(f"Candidate Bus v2 BODS regions must contain exactly once: {', '.join(BODS_REGIONS)}; received: {', '.join(str(name) for name in received)}")
    tnds_manifest = None
    if not bus_only:
        tnds = data / "bus-tnds"
        tnds_manifest = read_json(tnds / "manifest.json")
        tnds_schema = tnds_manifest.get("schema")
        if tnds_schema not in {"atlas-prepared-bus-tnds-v1", "atlas-prepared-bus-tnds-v2"}:
            raise RefreshError("Candidate TNDS manifest schema is invalid")
        bounded_tnds = tnds_schema == "atlas-prepared-bus-tnds-v2"
        if bounded_tnds:
            runtime_limit = tnds_manifest.get("runtimeShardMaxBytes")
            if not isinstance(runtime_limit, int) or isinstance(runtime_limit, bool) or runtime_limit < 1 or runtime_limit > TNDS_RUNTIME_SHARD_MAX_BYTES:
                raise RefreshError(f"Candidate TNDS runtime shard ceiling must be between 1 and {TNDS_RUNTIME_SHARD_MAX_BYTES} bytes")
            if not isinstance(tnds_manifest.get("runtimeShardCount"), int) or not isinstance(tnds_manifest.get("runtimeShardTotalBytes"), int):
                raise RefreshError("Candidate TNDS runtime shard measurements are missing or malformed")
        if "services" in tnds_manifest:
            raise RefreshError("Candidate TNDS manifest contains obsolete inline services; expected five-character stop-prefix service shards")
        if tnds_manifest.get("serviceShardKeyLength") != 5:
            raise RefreshError("Candidate TNDS manifest must use five-character stop-prefix service shards")
        service_shards = tnds_manifest.get("serviceShards")
        if not isinstance(service_shards, dict) or not service_shards:
            raise RefreshError("Candidate TNDS serviceShards are missing or malformed")
        validate_tnds_region_coverage(tnds_manifest)
    else:
        service_shards = {}
    metrics = bus_candidate_metrics(site) if bus_only else candidate_metrics(site)
    if metrics["naptanStopCount"] < 1000 or metrics["bodsServiceCount"] < 1000:
        raise RefreshError("Candidate is below the expected national stop/service scale")
    if bus_schema == "atlas-prepared-bus-data-v1" and metrics["bodsRegionCount"] < 8:
        raise RefreshError("Candidate BODS regional coverage is incomplete")
    stop_ids = set()
    stop_records = []
    stop_fields = bus_manifest.get("stopFields", [])
    if bus_schema == "atlas-prepared-bus-data-v2" and (not isinstance(stop_fields, list) or len(set(stop_fields)) != len(stop_fields)):
        raise RefreshError("Candidate v2 stopFields are missing or malformed")
    for relative in bus_manifest.get("stopShards", {}).values():
        payload = read_json(bus / relative)
        if payload.get("schema") != bus_schema or not payload.get("stops"):
            raise RefreshError(f"Candidate stop shard is empty or malformed: {relative}")
        for record in payload["stops"]:
            stop = unpack_stop(record, stop_fields, relative) if bus_schema == "atlas-prepared-bus-data-v2" else {"id": record[0] if isinstance(record, list) and record else None}
            if not stop.get("id") or str(stop["id"]) in stop_ids:
                raise RefreshError(f"Candidate physical StopPoint identity is missing or duplicated: {relative}")
            stop_ids.add(str(stop["id"]))
            stop_records.append(stop)
    v2_sidecars = None
    if bus_schema == "atlas-prepared-bus-data-v2":
        v2_sidecars = validate_v2_sidecars(bus, bus_manifest, stop_ids)
        group_ids = set(v2_sidecars["groups"])
        locality_ids = set(v2_sidecars["localities"])
        for stop in stop_records:
            refs = stop.get("logicalGroupRefs")
            if not isinstance(refs, list):
                raise RefreshError(f"Candidate v2 logicalGroupRefs are malformed: {stop.get('id')}")
            for ref in refs:
                if not isinstance(ref, dict) or not ref.get("id") or not isinstance(ref.get("targetExists"), bool):
                    raise RefreshError(f"Candidate v2 logicalGroupRef is malformed: {stop.get('id')}")
                if ref["id"] not in group_ids and ref["targetExists"] is not False:
                    raise RefreshError(f"Candidate v2 logicalGroupRef is unresolved without explicit classification: {stop.get('id')}")
            locality_code = stop.get("nptgLocalityCode")
            if locality_code and f"nptg:{locality_code}" not in locality_ids and stop.get("localityResolution") != "unresolved":
                raise RefreshError(f"Candidate v2 NPTG locality reference is unresolved without explicit classification: {stop.get('id')}")
    service_count = 0
    for relative_paths in bus_manifest.get("serviceShards", {}).values():
        for relative in relative_paths:
            payload = read_json(bus / relative)
            if payload.get("schema") != bus_schema or not payload.get("services"):
                raise RefreshError(f"Candidate service shard is empty or malformed: {relative}")
            for service in payload["services"]:
                service_count += 1
                if bus_schema == "atlas-prepared-bus-data-v2":
                    validate_endpoint_evidence(service, relative, stop_ids)
                for stop_id in service.get("stopSchedules", {}):
                    if str(stop_id) not in stop_ids:
                        raise RefreshError(f"Service-to-stop reference is missing from NaPTAN shards: {stop_id}")
    if service_count == 0:
        raise RefreshError("Candidate contains no prepared services")
    tnds_service_count = 0
    tnds_service_ids: set[str] = set()
    tnds_service_ids_by_region: dict[str, set[str]] = {}
    tnds_fragment_evidence: dict[str, dict] = {}
    tnds_unfragmented_evidence: dict[str, int] = {}
    physical_tnds_evidence_count = 0
    measured_tnds_shards = []
    measured_fragment_descriptors = 0
    for prefix, relative_paths in service_shards.items():
        if not isinstance(prefix, str) or len(prefix) != tnds_manifest["serviceShardKeyLength"] or not isinstance(relative_paths, list) or not relative_paths:
            raise RefreshError("Candidate TNDS serviceShards are malformed")
        identities = set()
        fragments_by_parent: dict[str, list[dict]] = {}
        for configured in relative_paths:
            descriptor = configured if bounded_tnds else None
            relative = descriptor.get("path") if descriptor else configured
            if not isinstance(relative, str) or not relative:
                raise RefreshError("Candidate TNDS shard path is malformed")
            if bounded_tnds:
                stop_index = descriptor.get("stopIds")
                if not isinstance(stop_index, list) or not stop_index or any(not isinstance(stop_id, str) or not stop_id for stop_id in stop_index) or stop_index != sorted(set(stop_index)):
                    raise RefreshError(f"Candidate TNDS shard stop index is malformed: {relative}")
                payload, uncompressed_bytes = read_bounded_tnds_json(tnds / relative, tnds_manifest["runtimeShardMaxBytes"])
                compressed_bytes = (tnds / relative).stat().st_size
                if descriptor.get("uncompressedBytes") != uncompressed_bytes or descriptor.get("compressedBytes") != compressed_bytes:
                    raise RefreshError(f"Candidate TNDS shard size index does not match its file: {relative}")
                measured_tnds_shards.append(uncompressed_bytes)
                fragment_fields = ("parentServiceId", "fragmentId", "fragmentOrdinal", "fragmentCount", "fragmentDepartureEvidenceCount", "parentDepartureEvidenceCount", "parentEvidenceByDayCounts")
                fragment_present = [field in descriptor for field in fragment_fields]
                if any(fragment_present):
                    if not all(fragment_present) or not isinstance(descriptor["parentServiceId"], str) or not isinstance(descriptor["fragmentId"], str):
                        raise RefreshError(f"Candidate TNDS fragment descriptor is malformed: {relative}")
                    ordinal, count = descriptor["fragmentOrdinal"], descriptor["fragmentCount"]
                    if isinstance(ordinal, bool) or not isinstance(ordinal, int) or isinstance(count, bool) or not isinstance(count, int) or count < 2 or not 1 <= ordinal <= count:
                        raise RefreshError(f"Candidate TNDS fragment ordinal is malformed: {relative}")
                    fragments_by_parent.setdefault(descriptor["parentServiceId"], []).append(descriptor)
                    measured_fragment_descriptors += 1
            else:
                payload = read_json(tnds / relative)
            expected_schema = "atlas-prepared-bus-tnds-v2" if bounded_tnds else "atlas-prepared-bus-tnds-v1"
            if payload.get("schema") != expected_schema or payload.get("stopPrefix") != prefix or not isinstance(payload.get("services"), list) or not payload["services"]:
                raise RefreshError(f"Candidate TNDS shard is empty or malformed: {relative}")
            shard_stop_ids = set()
            fragment_descriptor = descriptor if bounded_tnds and any(field in descriptor for field in ("parentServiceId", "fragmentId", "fragmentOrdinal", "fragmentCount")) else None
            if fragment_descriptor and len(payload["services"]) != 1:
                raise RefreshError(f"Candidate TNDS fragment shard must contain exactly one semantic fragment: {relative}")
            for service in payload["services"]:
                identity = service.get("id") or service.get("source", {}).get("serviceCode")
                row_identity = service.get("fragment", {}).get("fragmentId") if isinstance(service.get("fragment"), dict) else identity
                if not identity or not row_identity or row_identity in identities:
                    raise RefreshError(f"Candidate TNDS shard contains a duplicate or missing service identity: {relative}")
                identities.add(row_identity)
                tnds_service_ids.add(str(identity))
                identity_parts = str(identity).split(":", 2)
                if len(identity_parts) == 3 and identity_parts[0].lower() == "tnds" and identity_parts[1].upper() in TNDS_REGIONS:
                    tnds_service_ids_by_region.setdefault(identity_parts[1].upper(), set()).add(str(identity))
                validate_tnds_service(service, relative)
                fragment = service.get("fragment")
                evidence = service.get("departureEvidenceByDay", {})
                evidence_count = sum(len(rows) for rows in evidence.values() if isinstance(rows, list)) if isinstance(evidence, dict) else 0
                physical_tnds_evidence_count += evidence_count
                if fragment_descriptor:
                    expected_fragment = {"parentServiceId": fragment_descriptor["parentServiceId"], "fragmentId": fragment_descriptor["fragmentId"], "ordinal": fragment_descriptor["fragmentOrdinal"], "count": fragment_descriptor["fragmentCount"], "fragmentDepartureEvidenceCount": fragment_descriptor["fragmentDepartureEvidenceCount"], "parentDepartureEvidenceCount": fragment_descriptor["parentDepartureEvidenceCount"], "parentEvidenceByDayCounts": fragment_descriptor["parentEvidenceByDayCounts"]}
                    if service.get("id") != fragment_descriptor["parentServiceId"] or not isinstance(fragment, dict) or any(fragment.get(key) != value for key, value in expected_fragment.items()) or evidence_count != fragment_descriptor["fragmentDepartureEvidenceCount"]:
                        raise RefreshError(f"Candidate TNDS fragment identity does not match its descriptor: {relative}")
                    parent = fragment_descriptor["parentServiceId"]
                    day_counts = fragment_descriptor["parentEvidenceByDayCounts"]
                    if not isinstance(day_counts, dict) or set(day_counts) != {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"} or any(isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in day_counts.values()):
                        raise RefreshError(f"Candidate TNDS fragment per-day evidence counts are malformed for {parent}")
                    if sum(day_counts.values()) != fragment_descriptor["parentDepartureEvidenceCount"]:
                        raise RefreshError(f"Candidate TNDS fragment evidence totals disagree for {parent}")
                    order_by_day = fragment.get("evidenceOrderByDay")
                    if not isinstance(order_by_day, dict) or set(order_by_day) != set(day_counts):
                        raise RefreshError(f"Candidate TNDS fragment row ordering is malformed for {parent}")
                    for day, rows in service.get("departureEvidenceByDay", {}).items():
                        indexes = order_by_day.get(day)
                        if not isinstance(rows, list) or not isinstance(indexes, list) or len(indexes) != len(rows) or any(isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in indexes):
                            raise RefreshError(f"Candidate TNDS fragment row ordering is malformed for {parent}/{day}")
                    state = tnds_fragment_evidence.setdefault(parent, {"count": fragment_descriptor["fragmentCount"], "parentEvidenceCount": fragment_descriptor["parentDepartureEvidenceCount"], "dayCounts": day_counts, "ordinals": {}, "orderByOrdinal": {}})
                    if state["count"] != fragment_descriptor["fragmentCount"] or state["parentEvidenceCount"] != fragment_descriptor["parentDepartureEvidenceCount"] or state["dayCounts"] != day_counts:
                        raise RefreshError(f"Candidate TNDS fragment evidence counts disagree for {parent}")
                    ordinal = fragment_descriptor["fragmentOrdinal"]
                    previous = state["ordinals"].get(ordinal)
                    if previous is not None and previous != evidence_count:
                        raise RefreshError(f"Candidate TNDS duplicate parent fragment evidence disagrees for {parent}")
                    state["ordinals"][ordinal] = evidence_count
                    order_signature = {day: order_by_day[day] for day in day_counts}
                    previous_order = state["orderByOrdinal"].get(ordinal)
                    if previous_order is not None and previous_order != order_signature:
                        raise RefreshError(f"Candidate TNDS duplicate parent fragment ordering disagrees for {parent}")
                    state["orderByOrdinal"][ordinal] = order_signature
                elif fragment is not None:
                    raise RefreshError(f"Candidate TNDS shard contains an undescribed service fragment: {relative}")
                else:
                    previous = tnds_unfragmented_evidence.setdefault(str(identity), evidence_count)
                    if previous != evidence_count:
                        raise RefreshError(f"Candidate TNDS duplicate logical record evidence disagrees for {identity}")
                relevant_ids = set(service.get("stopSchedules", {})) | set(service.get("tndsQuarantine", {}).get("affectedStopIds", []) if service.get("tndsQuarantine") else [])
                if not any(str(stop_id).startswith(prefix) for stop_id in relevant_ids):
                    raise RefreshError(f"Candidate TNDS shard contains a service unrelated to prefix {prefix}: {relative}")
                shard_stop_ids.update(str(stop_id) for stop_id in relevant_ids if str(stop_id).startswith(prefix))
                tnds_service_count += 1
            if bounded_tnds and sorted(shard_stop_ids) != descriptor["stopIds"]:
                raise RefreshError(f"Candidate TNDS shard stop index does not match its records: {relative}")
        for parent_id, descriptors in fragments_by_parent.items():
            count = descriptors[0]["fragmentCount"]
            ordinals = [descriptor["fragmentOrdinal"] for descriptor in descriptors]
            if any(descriptor["fragmentCount"] != count for descriptor in descriptors) or sorted(ordinals) != list(range(1, count + 1)):
                raise RefreshError(f"Candidate TNDS parent {parent_id} has a missing or duplicate fragment in prefix {prefix}")
    if not bus_only and (not tnds_service_count or int(tnds_manifest.get("serviceCount", 0) or 0) < 1):
        raise RefreshError("Candidate contains no prepared TNDS services")
    if bounded_tnds:
        if tnds_manifest.get("fragmentRecordCount", 0) != measured_fragment_descriptors:
            raise RefreshError("Candidate TNDS fragment descriptor count does not match its manifest")
        conserved_evidence = sum(count for count in tnds_unfragmented_evidence.values())
        for parent, state in tnds_fragment_evidence.items():
            if sorted(state["ordinals"]) != list(range(1, state["count"] + 1)) or sum(state["ordinals"].values()) != state["parentEvidenceCount"]:
                raise RefreshError(f"Candidate TNDS journey evidence was lost or duplicated for fragmented parent {parent}")
            for day, expected_count in state["dayCounts"].items():
                indexes = [index for ordinal in range(1, state["count"] + 1) for index in state["orderByOrdinal"][ordinal][day]]
                if sorted(indexes) != list(range(expected_count)):
                    raise RefreshError(f"Candidate TNDS journey order was lost or duplicated for fragmented parent {parent}/{day}")
            conserved_evidence += state["parentEvidenceCount"]
        if tnds_manifest.get("logicalDepartureEvidenceCount") is not None and conserved_evidence != tnds_manifest["logicalDepartureEvidenceCount"]:
            raise RefreshError("Candidate TNDS logical departure-evidence count does not match the packaged parent records")
        if tnds_manifest.get("fragmentDepartureEvidenceCount") is not None and physical_tnds_evidence_count != tnds_manifest["fragmentDepartureEvidenceCount"]:
            raise RefreshError("Candidate TNDS emitted departure-evidence count does not match its physical fragments")
        if len(measured_tnds_shards) != tnds_manifest["runtimeShardCount"] or sum(measured_tnds_shards) != tnds_manifest["runtimeShardTotalBytes"] or max(measured_tnds_shards, default=0) != tnds_manifest.get("runtimeShardMaxObservedBytes"):
            raise RefreshError("Candidate TNDS runtime shard measurements do not match the packaged files")
        if len(tnds_service_ids) != tnds_manifest.get("serviceCount"):
            raise RefreshError("Candidate TNDS service identity count does not match the manifest; a service may have been lost")
        if tnds_manifest.get("logicalRecordCount", tnds_manifest.get("serviceCount")) != tnds_manifest.get("serviceCount"):
            raise RefreshError("Candidate TNDS logical record and unique parent identity counts do not reconcile")
        identity_hashes = tnds_manifest.get("regionServiceIdentitySha256")
        if identity_hashes is not None:
            if not isinstance(identity_hashes, dict) or set(identity_hashes) != set(TNDS_REGIONS):
                raise RefreshError("Candidate TNDS logical identity hashes do not cover exactly eight regions")
            expected_counts = tnds_manifest.get("regionServiceCounts", {})
            for region in TNDS_REGIONS:
                identities = tnds_service_ids_by_region.get(region, set())
                if len(identities) != expected_counts.get(region):
                    raise RefreshError(f"Candidate TNDS logical identity count does not match its manifest for {region}")
                digest = hashlib.sha256(("\n".join(sorted(identities)) + "\n").encode("utf-8")).hexdigest()
                if digest != identity_hashes.get(region):
                    raise RefreshError(f"Candidate TNDS logical identity digest does not match its manifest for {region}")
    forbidden = [path for path in data.rglob("*") if path.is_file() and path.suffix.lower() in {".csv", ".zip", ".xml"}]
    if forbidden:
        raise RefreshError(f"Raw source file leaked into public data: {forbidden[0].name}")
    result = {**metrics, "serviceShardRecords": service_count, "tndsShardRecords": tnds_service_count, "stopIds": len(stop_ids), "busOnlyDiagnostic": bus_only}
    if v2_sidecars:
        result.update({"logicalGroupRecords": len(v2_sidecars["groups"]), "localityRecords": len(v2_sidecars["localities"])})
    if bus_only:
        mark_structurally_validated(site, result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-root", required=True)
    parser.add_argument("--bus-only", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(validate(Path(args.site_root).resolve(), bus_only=args.bus_only), indent=2))
    except RefreshError as error:
        raise SystemExit(f"Candidate validation failed: {error}")


if __name__ == "__main__":
    main()
