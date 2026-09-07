#!/usr/bin/env python3
"""Validate the generated public ATLAS data tree before Pages upload."""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

from refresh_bus_data import RefreshError, TNDS_REGIONS, candidate_metrics


def read_json(path: Path):
    try:
        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8") as stream:
                return json.load(stream)
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, gzip.BadGzipFile, json.JSONDecodeError) as error:
        raise RefreshError(f"Candidate data file is unreadable: {path}") from error


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
    for relative in tnds_manifest.get("services", []):
        payload = read_json(tnds / relative)
        if not payload.get("stopSchedules") or not payload.get("source", {}).get("region"):
            raise RefreshError(f"Candidate TNDS service is empty or malformed: {relative}")
    forbidden = [path for path in data.rglob("*") if path.is_file() and path.suffix.lower() in {".csv", ".zip"}]
    if forbidden:
        raise RefreshError(f"Raw source file leaked into public data: {forbidden[0].name}")
    return {**metrics, "serviceShardRecords": service_count, "stopIds": len(stop_ids)}


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
