#!/usr/bin/env python3
"""Validate the generated public ATLAS data tree before Pages upload."""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

from refresh_bus_data import RefreshError, TNDS_REGIONS, bus_candidate_metrics, candidate_metrics, validate_tnds_region_coverage

KNOWN_TNDS_QUARANTINE_REASONS = {"incomplete_runtime_sequence", "missing_timing_links"}
BUS_SCHEMAS = {"atlas-prepared-bus-data-v1", "atlas-prepared-bus-data-v2"}
V2_GROUP_SCHEMA = "atlas-prepared-logical-groups-v1"
V2_LOCALITY_SCHEMA = "atlas-prepared-nptg-localities-v1"


def read_json(path: Path):
    try:
        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8") as stream:
                return json.load(stream)
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, gzip.BadGzipFile, json.JSONDecodeError) as error:
        raise RefreshError(f"Candidate data file is unreadable: {path}") from error


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
    tnds_manifest = None
    if not bus_only:
        tnds = data / "bus-tnds"
        tnds_manifest = read_json(tnds / "manifest.json")
        if tnds_manifest.get("schema") != "atlas-prepared-bus-tnds-v1":
            raise RefreshError("Candidate TNDS manifest schema is invalid")
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
    if metrics["bodsRegionCount"] < 8:
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
                for stop_id in service.get("stopSchedules", {}):
                    if str(stop_id) not in stop_ids:
                        raise RefreshError(f"Service-to-stop reference is missing from NaPTAN shards: {stop_id}")
    if service_count == 0:
        raise RefreshError("Candidate contains no prepared services")
    tnds_service_count = 0
    for prefix, relative_paths in service_shards.items():
        if not isinstance(prefix, str) or len(prefix) != tnds_manifest["serviceShardKeyLength"] or not isinstance(relative_paths, list) or not relative_paths:
            raise RefreshError("Candidate TNDS serviceShards are malformed")
        identities = set()
        for relative in relative_paths:
            payload = read_json(tnds / relative)
            if payload.get("schema") != "atlas-prepared-bus-tnds-v1" or payload.get("stopPrefix") != prefix or not isinstance(payload.get("services"), list) or not payload["services"]:
                raise RefreshError(f"Candidate TNDS shard is empty or malformed: {relative}")
            for service in payload["services"]:
                identity = service.get("id") or service.get("source", {}).get("serviceCode")
                if not identity or identity in identities:
                    raise RefreshError(f"Candidate TNDS shard contains a duplicate or missing service identity: {relative}")
                identities.add(identity)
                validate_tnds_service(service, relative)
                relevant_ids = set(service.get("stopSchedules", {})) | set(service.get("tndsQuarantine", {}).get("affectedStopIds", []) if service.get("tndsQuarantine") else [])
                if not any(str(stop_id).startswith(prefix) for stop_id in relevant_ids):
                    raise RefreshError(f"Candidate TNDS shard contains a service unrelated to prefix {prefix}: {relative}")
                tnds_service_count += 1
    if not bus_only and (not tnds_service_count or int(tnds_manifest.get("serviceCount", 0) or 0) < 1):
        raise RefreshError("Candidate contains no prepared TNDS services")
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
