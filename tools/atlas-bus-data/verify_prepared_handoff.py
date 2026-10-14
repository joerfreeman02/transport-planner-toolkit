#!/usr/bin/env python3
"""Fail closed when a prepared diagnostic candidate is incomplete or mismatched."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Prepared handoff file is missing or invalid JSON: {path}") from error
    if not isinstance(value, dict):
        raise SystemExit(f"Prepared handoff file must contain a JSON object: {path}")
    return value


def verify(site: Path, expected_snapshot_id: str) -> dict:
    bus_path = site / "atlas/data/bus/manifest.json"
    status_path = site / "atlas/data/status/manifest.json"
    ledger_path = site / "diagnostic-output/coverage-ledger.json"
    gap_path = site / "diagnostic-output/gap-report.json"
    forensic_path = site / "diagnostic-output/0590B-forensic.json"
    bus = read_json(bus_path)
    status = read_json(status_path)
    ledger = read_json(ledger_path)
    gap = read_json(gap_path)
    forensic = read_json(forensic_path)

    if bus.get("schema") != "atlas-prepared-bus-data-v2":
        raise SystemExit("Prepared handoff Bus manifest schema is not atlas-prepared-bus-data-v2")
    if status.get("schema") != "atlas-bus-refresh-status-v1" or status.get("diagnosticOnly") is not True or status.get("productionEligible") is not False or status.get("validation") != "diagnostic_only":
        raise SystemExit("Prepared handoff status does not identify a diagnostic-only Bus v2 preparation")
    snapshot_id = (status.get("sources") or {}).get("sourceSnapshot", {}).get("snapshotId")
    if not snapshot_id or snapshot_id != expected_snapshot_id:
        raise SystemExit("Prepared handoff source snapshot ID does not match the verified input snapshot")
    if ledger.get("schema") != "atlas-bus-national-coverage-ledger-v1" or (ledger.get("snapshot") or {}).get("snapshotId") != expected_snapshot_id:
        raise SystemExit("Prepared handoff coverage ledger schema or source snapshot ID is invalid")
    if (ledger.get("preparedCandidate") or {}).get("schema") != "atlas-prepared-bus-data-v2":
        raise SystemExit("Prepared handoff coverage ledger does not describe a Bus v2 candidate")
    if gap.get("schema") != "atlas-bus-national-preparation-gap-report-v1":
        raise SystemExit("Prepared handoff gap report schema is invalid")
    if forensic.get("schema") != "atlas-bus-0590b-forensic-v1" or forensic.get("snapshotId") != expected_snapshot_id:
        raise SystemExit("Prepared handoff 0590B evidence schema or source snapshot ID is invalid")

    # The next structural and validation gates dereference all candidate shard
    # paths from the Bus manifest. Check path readability here to prevent a
    # misleading cascade of downstream errors.
    bus_root = bus_path.parent
    required_shards = [*bus.get("stopShards", {}).values()]
    required_shards.extend(path for paths in bus.get("serviceShards", {}).values() for path in paths)
    required_shards.extend(bus.get("groupShards", {}).values())
    required_shards.extend(bus.get("localityShards", {}).values())
    required_shards.extend(bus.get("referenceStopPointShards", {}).values())
    if not required_shards:
        raise SystemExit("Prepared handoff Bus manifest contains no candidate shards")
    for relative in required_shards:
        target = (bus_root / relative).resolve()
        if bus_root.resolve() not in target.parents or not target.is_file():
            raise SystemExit(f"Prepared handoff candidate shard is missing or unreadable: {relative}")
        try:
            if target.suffix == ".gz":
                import gzip
                with gzip.open(target, "rt", encoding="utf-8") as stream:
                    json.load(stream)
            else:
                json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise SystemExit(f"Prepared handoff candidate shard is unreadable JSON: {relative}") from error
    return {"snapshotId": snapshot_id, "requiredShardCount": len(required_shards)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-root", required=True)
    parser.add_argument("--expected-snapshot-id", required=True)
    args = parser.parse_args()
    result = verify(Path(args.site_root).resolve(), args.expected_snapshot_id)
    print(json.dumps({"schema": "atlas-prepared-output-handoff-v1", **result}, indent=2))


if __name__ == "__main__":
    main()
