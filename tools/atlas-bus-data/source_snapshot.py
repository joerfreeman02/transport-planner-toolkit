#!/usr/bin/env python3
"""Hash-addressed authoritative Bus source snapshots.

Snapshots are inputs to preparation, never prepared data or production
checkpoints.  The raw files may be retained in an Actions artifact/cache for
engineering reuse, but the manifest is deliberately explicit about its state
and production ineligibility.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SNAPSHOT_SCHEMA = "atlas-bus-source-snapshot-v1"
SNAPSHOT_STATE = "ACQUIRED / UNINTERPRETED"
REGIONS = ("east_anglia", "east_midlands", "london", "north_east", "north_west", "south_east", "south_west", "west_midlands", "yorkshire")


class SourceSnapshotError(ValueError):
    """The source snapshot cannot be trusted or reused."""


def now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _safe_relative(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if root.resolve() not in path.parents:
        raise SourceSnapshotError(f"Snapshot path escapes its root: {relative}")
    return path


def _entry(root: Path, relative: str, *, identity: str, fmt: str, region: str | None, acquired_at: str, remote_metadata: dict | None, acquisition: str) -> dict:
    path = _safe_relative(root, relative)
    if not path.is_file() or path.stat().st_size == 0:
        raise SourceSnapshotError(f"Snapshot source is missing or empty: {relative}")
    return {
        "path": relative.replace("\\", "/"), "format": fmt, "region": region,
        "sourceIdentity": identity, "sha256": sha256_file(path), "bytes": path.stat().st_size,
        "acquiredAt": acquired_at, "remoteMetadata": remote_metadata or {}, "acquisition": acquisition,
    }


def build_manifest(root: Path, *, source_entries: list[dict], producer_workflow: str | None = None, run_id: str | None = None, reused: bool = False) -> dict:
    entries = sorted(source_entries, key=lambda item: (item.get("region") or "", item["path"]))
    return {
        "schema": SNAPSHOT_SCHEMA,
        "state": SNAPSHOT_STATE,
        "diagnosticOnly": True,
        "productionEligible": False,
        "neverUseAsProductionCheckpoint": True,
        "snapshotId": hashlib.sha256("".join(item["sha256"] for item in entries).encode("ascii")).hexdigest(),
        "createdAt": now_utc(),
        "producer": {"workflow": producer_workflow, "runId": run_id},
        "reuse": {"reused": bool(reused), "source": "verified snapshot bytes" if reused else "fresh acquisition"},
        "sources": entries,
        "sourceCount": len(entries),
        "regions": list(REGIONS),
    }


def write_manifest(root: Path, manifest: dict) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def load_and_verify(root: str | Path, *, require_bods: bool = True) -> dict:
    base = Path(root).resolve()
    try:
        manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SourceSnapshotError(f"Source snapshot manifest is missing or invalid: {base}") from error
    if manifest.get("schema") != SNAPSHOT_SCHEMA or manifest.get("state") != SNAPSHOT_STATE:
        raise SourceSnapshotError("Source snapshot is not in ACQUIRED / UNINTERPRETED state")
    if manifest.get("productionEligible") is not False or manifest.get("diagnosticOnly") is not True:
        raise SourceSnapshotError("Source snapshot has unsafe production eligibility flags")
    entries = manifest.get("sources")
    if not isinstance(entries, list) or not entries:
        raise SourceSnapshotError("Source snapshot contains no source entries")
    seen = set()
    for item in entries:
        if not isinstance(item, dict) or not item.get("path") or not item.get("sha256"):
            raise SourceSnapshotError("Source snapshot contains a malformed source entry")
        path = _safe_relative(base, str(item["path"]))
        if not path.is_file() or sha256_file(path) != item["sha256"] or path.stat().st_size != int(item.get("bytes", -1)):
            raise SourceSnapshotError(f"Source snapshot hash/size verification failed: {item.get('path')}")
        seen.add(str(item["path"]).replace("\\", "/"))
    required = {"sources/naptan.xml", "sources/nptg.xml"}
    if require_bods:
        required |= {f"sources/bods/{region}.zip" for region in REGIONS}
    missing = sorted(required - seen)
    if missing:
        raise SourceSnapshotError(f"Source snapshot is incomplete; missing: {', '.join(missing)}")
    if any("tnds" in str(item.get("path", "")).lower() for item in entries):
        raise SourceSnapshotError("TNDS raw archives are not permitted in a Bus source snapshot")
    manifest["verifiedAt"] = now_utc()
    return manifest


def snapshot_from_staging(staging: Path, destination: Path, *, xml_sources: dict, bods: dict, producer_workflow: str | None = None, run_id: str | None = None) -> dict:
    """Copy one acquired v2 Bus source set into a reusable snapshot."""
    shutil.rmtree(destination, ignore_errors=True)
    (destination / "sources" / "bods").mkdir(parents=True, exist_ok=True)
    shutil.copy2(staging / "naptan.xml", destination / "sources/naptan.xml")
    shutil.copy2(staging / "nptg.xml", destination / "sources/nptg.xml")
    acquired_at = now_utc()
    entries = [
        _entry(destination, "sources/naptan.xml", identity=xml_sources["naptan"].get("identity", ""), fmt="xml", region=None, acquired_at=acquired_at, remote_metadata=xml_sources["naptan"].get("remoteMetadata"), acquisition="fresh"),
        _entry(destination, "sources/nptg.xml", identity=xml_sources["nptg"].get("identity", ""), fmt="xml", region=None, acquired_at=acquired_at, remote_metadata=xml_sources["nptg"].get("remoteMetadata"), acquisition="fresh"),
    ]
    for region in REGIONS:
        source = staging / "gtfs" / f"{region}.zip"
        target = destination / "sources" / "bods" / f"{region}.zip"
        shutil.copy2(source, target)
        metadata = next((item for item in bods.get("regions", []) if item.get("region") == region), {})
        entries.append(_entry(destination, f"sources/bods/{region}.zip", identity=metadata.get("identity", f"https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/{region}/"), fmt="gtfs-zip", region=region, acquired_at=acquired_at, remote_metadata=metadata.get("remoteMetadata"), acquisition="fresh"))
    return build_manifest(destination, source_entries=entries, producer_workflow=producer_workflow, run_id=run_id)


def materialise_for_preparation(root: Path, staging: Path) -> tuple[Path, Path, Path, dict]:
    manifest = load_and_verify(root)
    naptan = staging / "naptan.xml"
    nptg = staging / "nptg.xml"
    gtfs = staging / "gtfs"
    gtfs.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / "sources/naptan.xml", naptan)
    shutil.copy2(root / "sources/nptg.xml", nptg)
    for region in REGIONS:
        shutil.copy2(root / "sources/bods" / f"{region}.zip", gtfs / f"{region}.zip")
    return naptan, nptg, gtfs, manifest


def freshness_reuse_decision(root: str | Path, freshness: dict) -> dict:
    """Compare remote discriminators without treating them as byte identity."""
    manifest = load_and_verify(root)
    by_path = {item["path"]: item for item in manifest["sources"]}
    decisions = {}
    for path, probe in (("sources/naptan.xml", freshness.get("naptan", {})), ("sources/nptg.xml", freshness.get("nptg", {}))):
        expected = by_path[path].get("remoteMetadata", {})
        decisions[path] = "REUSE" if probe.get("reliable") and expected.get("metadata") == probe.get("metadata") else "ACQUIRE"
    for region in REGIONS:
        path = f"sources/bods/{region}.zip"
        expected = by_path[path].get("remoteMetadata", {})
        probe = freshness.get("bods", {}).get("regions", {}).get(region, {})
        decisions[path] = "REUSE" if probe.get("reliable") and expected.get("metadata") == probe.get("metadata") else "ACQUIRE"
    return {"reuse": all(value == "REUSE" for value in decisions.values()), "decisions": decisions, "reason": "all reliable remote discriminators unchanged" if all(value == "REUSE" for value in decisions.values()) else "one or more discriminators unavailable or changed; byte acquisition required"}


def reuse_snapshot_if_unchanged(source: str | Path, freshness_path: str | Path, destination: str | Path) -> dict:
    source_root = Path(source).resolve()
    freshness = json.loads(Path(freshness_path).read_text(encoding="utf-8"))
    decision = freshness_reuse_decision(source_root, freshness)
    if not decision["reuse"]:
        return decision
    manifest = load_and_verify(source_root)
    shutil.rmtree(destination, ignore_errors=True)
    shutil.copytree(source_root, destination)
    manifest["createdAt"] = now_utc()
    manifest["reuse"] = {"reused": True, "source": "verified snapshot bytes", "freshnessReason": decision["reason"]}
    for item in manifest["sources"]:
        item["acquisition"] = "reused"
    write_manifest(Path(destination), manifest)
    return decision


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", metavar="ROOT")
    parser.add_argument("--acquire", action="store_true", help="Acquire the authorised NaPTAN, NPTG and nine BODS sources once")
    parser.add_argument("--output", help="Snapshot destination for --acquire")
    parser.add_argument("--reuse-from", help="Existing snapshot to reuse when all remote discriminators match")
    parser.add_argument("--freshness", help="Freshness JSON produced by source_freshness.py")
    args = parser.parse_args()
    if args.verify:
        print(json.dumps(load_and_verify(args.verify), indent=2))
    elif args.acquire:
        if not args.output:
            parser.error("--acquire requires --output")
        # Lazy import keeps the contract module usable by preparation tests
        # without importing the acquisition implementation at module load.
        from refresh_bus_data import acquire_bods, acquire_prepared_data_v2_sources
        from source_freshness import probe_all
        with tempfile.TemporaryDirectory(prefix="atlas-source-acquisition-") as temporary:
            staging = Path(temporary)
            freshness = probe_all()
            naptan, nptg, xml_sources = acquire_prepared_data_v2_sources(staging)
            _gtfs, bods = acquire_bods(staging)
            xml_sources["naptan"]["remoteMetadata"] = freshness["naptan"]
            xml_sources["nptg"]["remoteMetadata"] = freshness["nptg"]
            for item in bods["regions"]:
                item["remoteMetadata"] = freshness["bods"]["regions"].get(item["region"], {})
            manifest = snapshot_from_staging(staging, Path(args.output).resolve(), xml_sources=xml_sources, bods=bods)
        load_and_verify(args.output)
        print(json.dumps(manifest, indent=2))
    elif args.reuse_from:
        if not args.freshness or not args.output:
            parser.error("--reuse-from requires --freshness and --output")
        decision = reuse_snapshot_if_unchanged(args.reuse_from, args.freshness, args.output)
        output = os.environ.get("GITHUB_OUTPUT")
        if output:
            with open(output, "a", encoding="utf-8") as stream:
                stream.write(f"reused={'true' if decision['reuse'] else 'false'}\n")
        print(json.dumps(decision, indent=2))
        if not decision["reuse"]:
            raise SystemExit(3)


if __name__ == "__main__":
    main()
