#!/usr/bin/env python3
"""Validate the generated public ATLAS data tree before Pages upload."""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

from refresh_bus_data import RefreshError, TNDS_REGIONS, candidate_metrics

KNOWN_TNDS_QUARANTINE_REASONS = {"incomplete_runtime_sequence", "missing_timing_links"}


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


def validate(site: Path) -> dict:
    data = site / "atlas" / "data"
    bus = data / "bus"
    tnds = data / "bus-tnds"
    bus_manifest = read_json(bus / "manifest.json")
    tnds_manifest = read_json(tnds / "manifest.json")
    if bus_manifest.get("schema") != "atlas-prepared-bus-data-v1":
        raise RefreshError("Candidate NaPTAN/BODS manifest schema is invalid")
    if tnds_manifest.get("schema") != "atlas-prepared-bus-tnds-v1":
        raise RefreshError("Candidate TNDS manifest schema is invalid")
    if "services" in tnds_manifest or tnds_manifest.get("serviceShardKeyLength") != 5:
        raise RefreshError("Candidate TNDS manifest must use five-character stop-prefix service shards")
    service_shards = tnds_manifest.get("serviceShards")
    if not isinstance(service_shards, dict) or not service_shards:
        raise RefreshError("Candidate TNDS serviceShards are missing or malformed")
    metrics = candidate_metrics(site)
    if metrics["naptanStopCount"] < 1000 or metrics["bodsServiceCount"] < 1000:
        raise RefreshError("Candidate is below the expected national stop/service scale")
    if metrics["bodsRegionCount"] < 8:
        raise RefreshError("Candidate BODS regional coverage is incomplete")
    if set(tnds_manifest.get("regions", [])) != set(TNDS_REGIONS):
        raise RefreshError("Candidate TNDS regional coverage is incomplete")
    stop_ids = set()
    for relative in bus_manifest.get("stopShards", {}).values():
        payload = read_json(bus / relative)
        if payload.get("schema") != "atlas-prepared-bus-data-v1" or not payload.get("stops"):
            raise RefreshError(f"Candidate stop shard is empty or malformed: {relative}")
        stop_ids.update(str(record[0]) for record in payload["stops"] if record)
    service_count = 0
    for relative_paths in bus_manifest.get("serviceShards", {}).values():
        for relative in relative_paths:
            payload = read_json(bus / relative)
            if payload.get("schema") != "atlas-prepared-bus-data-v1" or not payload.get("services"):
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
    if not tnds_service_count or int(tnds_manifest.get("serviceCount", 0) or 0) < 1:
        raise RefreshError("Candidate contains no prepared TNDS services")
    forbidden = [path for path in data.rglob("*") if path.is_file() and path.suffix.lower() in {".csv", ".zip", ".xml"}]
    if forbidden:
        raise RefreshError(f"Raw source file leaked into public data: {forbidden[0].name}")
    return {**metrics, "serviceShardRecords": service_count, "tndsShardRecords": tnds_service_count, "stopIds": len(stop_ids)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-root", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(validate(Path(args.site_root).resolve()), indent=2))
    except RefreshError as error:
        raise SystemExit(f"Candidate validation failed: {error}")


if __name__ == "__main__":
    main()
