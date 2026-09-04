#!/usr/bin/env python3
"""Safely build and promote ATLAS prepared bus data without deleting the active snapshot first."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

SCHEMA = "atlas-prepared-bus-data-v1"


def validate_snapshot(output: Path) -> dict:
    manifest_path = output / "manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError("Prepared bus build did not produce manifest.json.")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != SCHEMA:
        raise RuntimeError("Prepared bus manifest schema is invalid.")

    stop_shards = manifest.get("stopShards") or {}
    service_shards = manifest.get("serviceShards") or {}
    if not stop_shards:
        raise RuntimeError("Prepared bus build produced no stop shards.")

    service_paths = {
        path
        for value in service_shards.values()
        for path in (value if isinstance(value, list) else [value])
        if path
    }
    if not service_paths:
        raise RuntimeError("Prepared bus build produced no service shards.")

    referenced = set(stop_shards.values()) | service_paths
    missing = sorted(path for path in referenced if not (output / path).is_file())
    if missing:
        preview = ", ".join(missing[:5])
        raise RuntimeError(f"Prepared bus build references missing shards: {preview}")

    return manifest


def promote_snapshot(staging: Path, output: Path) -> Path | None:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    previous = None

    if output.exists():
        previous = output.with_name(f"{output.name}.previous-{timestamp}")
        output.rename(previous)

    try:
        staging.rename(output)
    except Exception:
        if previous and previous.exists() and not output.exists():
            previous.rename(output)
        raise

    return previous


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--naptan", required=True)
    parser.add_argument("--gtfs-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--snapshot-date", default=date.today().isoformat())
    parser.add_argument("--grid-size", type=float, default=0.25)
    parser.add_argument("--service-shard-key-length", type=int, default=5)
    args = parser.parse_args()

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = output.with_name(f"{output.name}.staging-{os.getpid()}")

    if staging.exists():
        raise RuntimeError(f"Refusing to overwrite existing staging directory: {staging}")

    builder = Path(__file__).with_name("build_static_index.py")
    command = [
        sys.executable,
        str(builder),
        "--naptan", args.naptan,
        "--gtfs-dir", args.gtfs_dir,
        "--output", str(staging),
        "--snapshot-date", args.snapshot_date,
        "--grid-size", str(args.grid_size),
        "--service-shard-key-length", str(args.service_shard_key_length),
    ]

    try:
        subprocess.run(command, check=True)
        manifest = validate_snapshot(staging)
        previous = promote_snapshot(staging, output)
    except Exception:
        print(
            "Prepared bus build failed. Existing active snapshot was left untouched. "
            f"Staging retained at: {staging}",
            file=sys.stderr,
        )
        raise

    result = {
        "output": str(output),
        "snapshotDate": manifest.get("snapshotDate"),
        "stopShards": len(manifest.get("stopShards") or {}),
        "serviceAreas": len(manifest.get("serviceShards") or {}),
        "previousSnapshot": str(previous) if previous else None,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
