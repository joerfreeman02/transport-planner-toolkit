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
import time
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path

SNAPSHOT_SCHEMA = "atlas-bus-source-snapshot-v1"
SNAPSHOT_STATE = "ACQUIRED / UNINTERPRETED / VERIFIED"
ACQUIRING_STATE = "ACQUIRING / UNINTERPRETED"
BODS_REGIONS = ("east_anglia", "east_midlands", "london", "north_east", "north_west", "south_east", "south_west", "west_midlands", "yorkshire")
# Backward-compatible public alias; BODS_REGIONS is the canonical enumeration.
REGIONS = BODS_REGIONS
GTFS_REQUIRED_MEMBERS = {"agency.txt", "stops.txt", "routes.txt", "calendar.txt", "trips.txt", "stop_times.txt"}


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


def validate_xml_source(path: Path, expected_root: str | tuple[str, ...]) -> None:
    """Validate only that an XML source is readable and from its source family."""
    if not path.is_file() or path.stat().st_size == 0:
        raise SourceSnapshotError(f"XML source is missing or empty: {path.name}")
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError) as error:
        raise SourceSnapshotError(f"XML source is unreadable: {path.name}") from error
    local_name = str(root.tag).rsplit("}", 1)[-1].lower()
    expected_roots = (expected_root,) if isinstance(expected_root, str) else expected_root
    if not any(expected.lower() in local_name for expected in expected_roots):
        raise SourceSnapshotError(f"XML source has unexpected root for {'/'.join(expected_roots)}: {local_name}")


def validate_gtfs_archive(path: Path) -> None:
    """Validate the GTFS container contract without reading timetable records."""
    if not path.is_file() or path.stat().st_size == 0:
        raise SourceSnapshotError(f"GTFS archive is missing or empty: {path.name}")
    try:
        with zipfile.ZipFile(path) as archive:
            members = {Path(name).name for name in archive.namelist()}
            missing = sorted(GTFS_REQUIRED_MEMBERS - members)
            if missing:
                raise SourceSnapshotError(f"GTFS archive is missing required files: {', '.join(missing)}")
            if archive.testzip() is not None:
                raise SourceSnapshotError(f"GTFS archive contains a corrupt member: {path.name}")
    except zipfile.BadZipFile as error:
        raise SourceSnapshotError(f"GTFS archive is not a valid ZIP: {path.name}") from error


def validate_zip_source(path: Path) -> None:
    """Validate a quarantined raw archive as a readable, non-empty ZIP."""
    if not path.is_file() or path.stat().st_size == 0:
        raise SourceSnapshotError(f"Raw archive is missing or empty: {path.name}")
    try:
        with zipfile.ZipFile(path) as archive:
            if not archive.namelist() or archive.testzip() is not None:
                raise SourceSnapshotError(f"Raw archive is empty or corrupt: {path.name}")
    except zipfile.BadZipFile as error:
        raise SourceSnapshotError(f"Raw archive is not a valid ZIP: {path.name}") from error


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


def build_manifest(root: Path, *, source_entries: list[dict], producer_workflow: str | None = None, run_id: str | None = None, repository_commit_sha: str | None = None, reused: bool = False) -> dict:
    entries = sorted(source_entries, key=lambda item: (item.get("region") or "", item["path"]))
    created_at = now_utc()
    producer_workflow = producer_workflow or os.environ.get("GITHUB_WORKFLOW")
    run_id = run_id or os.environ.get("GITHUB_RUN_ID")
    repository_commit_sha = repository_commit_sha or os.environ.get("GITHUB_SHA")
    return {
        "schema": SNAPSHOT_SCHEMA,
        "state": SNAPSHOT_STATE,
        "diagnosticOnly": True,
        "productionEligible": False,
        "neverUseAsProductionCheckpoint": True,
        "snapshotId": hashlib.sha256("".join(item["sha256"] for item in entries).encode("ascii")).hexdigest(),
        "createdAt": created_at,
        "acquisitionTimestamp": created_at,
        "producer": {"workflow": producer_workflow, "runId": run_id, "repositoryCommitSha": repository_commit_sha,
                     "repository": os.environ.get("GITHUB_REPOSITORY"), "ref": os.environ.get("GITHUB_REF"),
                     "acquisitionTimestamp": created_at},
        "reuseMode": "FROZEN_DIAGNOSTIC_EXPLICIT" if reused else "FRESH_ACQUISITION",
        "currentSourceFreshnessClaimed": not reused,
        "reuse": {"reused": bool(reused), "source": "verified snapshot bytes" if reused else "fresh acquisition"},
        "sources": entries,
        "sourceCount": len(entries),
        "regions": list(REGIONS),
    }


def write_manifest(root: Path, manifest: dict) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / "manifest.json"
    temporary = root / ".manifest.json.part"
    temporary.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for attempt in range(5):
        try:
            temporary.replace(path)
            break
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.1 * (attempt + 1))
    return path


def load_and_verify(root: str | Path, *, require_bods: bool = True, expected_snapshot_id: str | None = None, expected_source_count: int | None = None, expected_total_bytes: int | None = None) -> dict:
    base = Path(root).resolve()
    try:
        manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SourceSnapshotError(f"Source snapshot manifest is missing or invalid: {base}") from error
    if manifest.get("schema") != SNAPSHOT_SCHEMA or manifest.get("state") != SNAPSHOT_STATE:
        raise SourceSnapshotError("Source snapshot is not ACQUIRED / UNINTERPRETED / VERIFIED")
    if manifest.get("productionEligible") is not False or manifest.get("diagnosticOnly") is not True:
        raise SourceSnapshotError("Source snapshot has unsafe production eligibility flags")
    entries = manifest.get("sources")
    if not isinstance(entries, list) or not entries:
        raise SourceSnapshotError("Source snapshot contains no source entries")
    if manifest.get("sourceCount") != len(entries):
        raise SourceSnapshotError(f"Source snapshot manifest sourceCount mismatch: expected {len(entries)}, received {manifest.get('sourceCount')}")
    if any(path.name.endswith(".part") for path in base.rglob("*")):
        raise SourceSnapshotError("Source snapshot contains unexpected .part files")
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
        required |= {f"sources/bods/{region}.zip" for region in BODS_REGIONS}
    missing = sorted(required - seen)
    if missing:
        raise SourceSnapshotError(f"Source snapshot is incomplete; missing: {', '.join(missing)}")
    if len(seen) != len(entries):
        raise SourceSnapshotError("Source snapshot contains duplicate source paths")
    unexpected = sorted(seen - required)
    if unexpected:
        raise SourceSnapshotError(f"Source snapshot contains unexpected sources: {', '.join(unexpected)}")
    if require_bods and len(entries) != len(required):
        raise SourceSnapshotError(f"Source snapshot source count mismatch: expected {len(required)}, received {len(entries)}")
    if any("tnds" in str(item.get("path", "")).lower() for item in entries):
        raise SourceSnapshotError("TNDS raw archives are not permitted in a Bus source snapshot")
    calculated_snapshot_id = hashlib.sha256("".join(item["sha256"] for item in entries).encode("ascii")).hexdigest()
    if manifest.get("snapshotId") != calculated_snapshot_id:
        raise SourceSnapshotError("Source snapshot manifest snapshot ID does not match its recorded source hashes")
    if expected_snapshot_id and calculated_snapshot_id != expected_snapshot_id:
        raise SourceSnapshotError(f"Source snapshot ID mismatch: expected {expected_snapshot_id}, received {calculated_snapshot_id}")
    if expected_source_count is not None and len(entries) != expected_source_count:
        raise SourceSnapshotError(f"Source snapshot source count mismatch: expected {expected_source_count}, received {len(entries)}")
    total_bytes = sum(int(item.get("bytes", 0)) for item in entries)
    if expected_total_bytes is not None and total_bytes != expected_total_bytes:
        raise SourceSnapshotError(f"Source snapshot byte count mismatch: expected {expected_total_bytes}, received {total_bytes}")
    manifest["verifiedAt"] = now_utc()
    return manifest


def snapshot_from_staging(staging: Path, destination: Path, *, xml_sources: dict, bods: dict, producer_workflow: str | None = None, run_id: str | None = None, repository_commit_sha: str | None = None) -> dict:
    """Copy one acquired v2 Bus source set into a reusable snapshot."""
    (destination / "sources" / "bods").mkdir(parents=True, exist_ok=True)
    for source, target in ((staging / "naptan.xml", destination / "sources/naptan.xml"), (staging / "nptg.xml", destination / "sources/nptg.xml")):
        shutil.copyfile(source, target)
    acquired_at = now_utc()
    entries = [
        _entry(destination, "sources/naptan.xml", identity=xml_sources["naptan"].get("identity", ""), fmt="xml", region=None, acquired_at=acquired_at, remote_metadata=xml_sources["naptan"].get("remoteMetadata"), acquisition="fresh"),
        _entry(destination, "sources/nptg.xml", identity=xml_sources["nptg"].get("identity", ""), fmt="xml", region=None, acquired_at=acquired_at, remote_metadata=xml_sources["nptg"].get("remoteMetadata"), acquisition="fresh"),
    ]
    for region in REGIONS:
        source = staging / "gtfs" / f"{region}.zip"
        target = destination / "sources" / "bods" / f"{region}.zip"
        if not source.is_file():
            raise SourceSnapshotError(f"Staging source is missing: {source}")
        shutil.copyfile(source, target)
        metadata = next((item for item in bods.get("regions", []) if item.get("region") == region), {})
        entries.append(_entry(destination, f"sources/bods/{region}.zip", identity=metadata.get("identity", f"https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/{region}/"), fmt="gtfs-zip", region=region, acquired_at=acquired_at, remote_metadata=metadata.get("remoteMetadata"), acquisition="fresh"))
    manifest = build_manifest(destination, source_entries=entries, producer_workflow=producer_workflow, run_id=run_id, repository_commit_sha=repository_commit_sha)
    write_manifest(destination, manifest)
    return manifest


def _primary_manifest(root: Path, *, remote_freshness: dict | None = None) -> dict:
    """Load or initialise a durable primary acquisition checkpoint."""
    manifest_path = root / "manifest.json"
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise SourceSnapshotError(f"Durable acquisition manifest is invalid: {manifest_path}") from error
        if manifest.get("schema") != SNAPSHOT_SCHEMA:
            raise SourceSnapshotError("Durable acquisition manifest has an unexpected schema")
        return manifest
    timestamp = now_utc()
    manifest = {
        "schema": SNAPSHOT_SCHEMA,
        "snapshotKind": "NATIONAL BUS SOURCE SNAPSHOT",
        "state": ACQUIRING_STATE,
        "diagnosticOnly": True,
        "preparationOnly": True,
        "runtimeActive": False,
        "productionEligible": False,
        "neverUseAsProductionCheckpoint": True,
        "snapshotId": None,
        "createdAt": timestamp,
        "acquisitionTimestamp": timestamp,
        "updatedAt": timestamp,
        "producer": {"workflow": os.environ.get("GITHUB_WORKFLOW"), "runId": os.environ.get("GITHUB_RUN_ID"), "repositoryCommitSha": os.environ.get("GITHUB_SHA"), "acquisitionTimestamp": timestamp},
        "currentSourceFreshnessClaimed": False,
        "remoteFreshness": remote_freshness or {},
        "sources": [],
        "sourceCount": 2 + len(BODS_REGIONS),
        "completedSourceCount": 0,
        "progress": [],
        "regions": list(REGIONS),
    }
    write_manifest(root, manifest)
    return manifest


def _checkpoint(manifest: dict, root: Path) -> None:
    manifest["updatedAt"] = now_utc()
    manifest["completedSourceCount"] = len(manifest.get("sources", []))
    manifest["progress"] = [{"path": item["path"], "acquisition": item.get("acquisition"), "sha256": item.get("sha256"), "bytes": item.get("bytes"), "completedAt": item.get("acquiredAt")} for item in manifest.get("sources", [])]
    write_manifest(root, manifest)


def _verified_completed_source(root: Path, entry: dict, validator) -> bool:
    try:
        path = _safe_relative(root, str(entry["path"]))
        if not path.is_file() or path.stat().st_size != int(entry.get("bytes", -1)) or sha256_file(path) != entry.get("sha256"):
            return False
        validator(path)
        return True
    except (KeyError, TypeError, ValueError, OSError, SourceSnapshotError):
        return False


def _acquire_durable_source(root: Path, manifest: dict, *, relative: str, identity: str, fmt: str, region: str | None, remote_metadata: dict | None, downloader, validator, label: str) -> dict:
    existing = next((item for item in manifest.get("sources", []) if item.get("path") == relative), None)
    if existing and _verified_completed_source(root, existing, validator):
        target = _safe_relative(root, relative)
        target.with_name(f".{target.name}.part").unlink(missing_ok=True)
        existing["acquisition"] = "reused"
        existing["verifiedAt"] = now_utc()
        _checkpoint(manifest, root)
        return existing

    target = _safe_relative(root, relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(f".{target.name}.part")
    acquisition = "reacquired" if existing or target.exists() else "fresh"
    result = downloader(identity, partial, label=label)
    try:
        validator(partial)
    except SourceSnapshotError:
        raise
    bytes_count = partial.stat().st_size
    digest = sha256_file(partial)
    partial.replace(target)
    entry = {
        "path": relative,
        "format": fmt,
        "region": region,
        "sourceIdentity": identity,
        "sha256": digest,
        "bytes": bytes_count,
        "acquiredAt": now_utc(),
        "remoteMetadata": remote_metadata or {},
        "acquisition": acquisition,
        "structuralValidation": "passed",
    }
    manifest["sources"] = [item for item in manifest.get("sources", []) if item.get("path") != relative] + [entry]
    _checkpoint(manifest, root)
    return entry


def acquire_primary_snapshot(destination: str | Path, *, remote_freshness: dict | None = None, download_fn=None) -> dict:
    """Acquire the raw primary sources with durable per-source checkpoints.

    This function deliberately stops at download, structural validation and
    hashing. It never invokes preparation, sharding or planner intelligence.
    """
    from refresh_bus_data import BODS_DOWNLOAD_ROOT, NAPTAN_XML_URL, NPTG_XML_URL, download

    root = Path(destination).resolve()
    root.mkdir(parents=True, exist_ok=True)
    manifest = _primary_manifest(root, remote_freshness=remote_freshness)
    manifest["state"] = ACQUIRING_STATE
    manifest["productionEligible"] = False
    manifest["diagnosticOnly"] = True
    manifest["preparationOnly"] = True
    _checkpoint(manifest, root)
    downloader = download_fn or download
    freshness = remote_freshness or manifest.get("remoteFreshness") or {}
    specs = [
        ("sources/naptan.xml", NAPTAN_XML_URL, "xml", None, freshness.get("naptan"), lambda path: validate_xml_source(path, "naptan"), "NaPTAN XML source"),
        ("sources/nptg.xml", NPTG_XML_URL, "xml", None, freshness.get("nptg"), lambda path: validate_xml_source(path, ("nptg", "nationalpublictransportgazetteer")), "NPTG XML source"),
    ]
    specs.extend((f"sources/bods/{region}.zip", f"{BODS_DOWNLOAD_ROOT}{region}/", "gtfs-zip", region, freshness.get("bods", {}).get("regions", {}).get(region, {}), validate_gtfs_archive, f"BODS {region} GTFS source") for region in REGIONS)
    try:
        for relative, identity, fmt, region, metadata, validator, label in specs:
            _acquire_durable_source(root, manifest, relative=relative, identity=identity, fmt=fmt, region=region, remote_metadata=metadata, downloader=downloader, validator=validator, label=label)
    except Exception as error:
        manifest["state"] = ACQUIRING_STATE
        manifest["lastError"] = str(error)
        _checkpoint(manifest, root)
        raise

    entries = sorted(manifest["sources"], key=lambda item: item["path"])
    manifest["sources"] = entries
    manifest["snapshotId"] = hashlib.sha256("".join(item["sha256"] for item in entries).encode("ascii")).hexdigest()
    manifest["state"] = SNAPSHOT_STATE
    manifest["verifiedAt"] = now_utc()
    manifest["currentSourceFreshnessClaimed"] = True
    manifest.pop("lastError", None)
    _checkpoint(manifest, root)
    return load_and_verify(root)


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
    manifest["reuseMode"] = "METADATA_COMPATIBLE_REUSE"
    manifest["currentSourceFreshnessClaimed"] = True
    for item in manifest["sources"]:
        item["acquisition"] = "reused"
    write_manifest(Path(destination), manifest)
    return decision


def mark_frozen_reuse(source: str | Path, destination: str | Path, source_run_id: str) -> dict:
    """Reuse one exact, verified artifact without probing or claiming freshness."""
    source_root = Path(source).resolve()
    destination_root = Path(destination).resolve()
    manifest = load_and_verify(source_root)
    if not str(source_run_id).strip():
        raise SourceSnapshotError("Explicit frozen reuse requires a source workflow run ID")
    shutil.rmtree(destination_root, ignore_errors=True)
    shutil.copytree(source_root, destination_root)
    manifest["reuseMode"] = "FROZEN_DIAGNOSTIC_EXPLICIT"
    manifest["currentSourceFreshnessClaimed"] = False
    manifest["frozenReuseSourceRunId"] = str(source_run_id)
    manifest["reuse"] = {
        "reused": True,
        "source": "verified snapshot bytes",
        "reuseMode": "FROZEN_DIAGNOSTIC_EXPLICIT",
        "sourceRunId": str(source_run_id),
    }
    for item in manifest["sources"]:
        item["acquisition"] = "reused-frozen-explicit"
    write_manifest(destination_root, manifest)
    return load_and_verify(destination_root)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", metavar="ROOT")
    parser.add_argument("--expected-snapshot-id")
    parser.add_argument("--expected-source-count", type=int)
    parser.add_argument("--expected-total-bytes", type=int)
    parser.add_argument("--acquire", action="store_true", help="Acquire the authorised NaPTAN, NPTG and nine BODS sources durably and resumably")
    parser.add_argument("--acquire-tnds", action="store_true", help="Acquire raw TNDS archives into a separate quarantined snapshot")
    parser.add_argument("--output", help="Snapshot destination for --acquire")
    parser.add_argument("--tnds-output", help="TNDS snapshot destination for --acquire-tnds")
    parser.add_argument("--reuse-from", help="Existing snapshot to reuse when all remote discriminators match")
    parser.add_argument("--freshness", help="Freshness JSON produced by source_freshness.py")
    parser.add_argument("--mark-frozen-reuse", help="Copy one exact verified snapshot for explicit diagnostic reuse")
    parser.add_argument("--source-run-id", help="Producer run ID for --mark-frozen-reuse")
    args = parser.parse_args()
    if args.verify:
        print(json.dumps(load_and_verify(args.verify, expected_snapshot_id=args.expected_snapshot_id, expected_source_count=args.expected_source_count, expected_total_bytes=args.expected_total_bytes), indent=2))
    elif args.acquire:
        if not args.output:
            parser.error("--acquire requires --output")
        # Freshness probes are metadata-only; acquisition still hashes bytes.
        from source_freshness import probe_all
        print(json.dumps(acquire_primary_snapshot(args.output, remote_freshness=probe_all()), indent=2))
    elif args.acquire_tnds:
        if not args.tnds_output:
            parser.error("--acquire-tnds requires --tnds-output")
        from refresh_bus_data import acquire_tnds_snapshot
        print(json.dumps(acquire_tnds_snapshot(args.tnds_output, os.environ.get("TNDS_USERNAME", ""), os.environ.get("TNDS_PASSWORD", "")), indent=2))
    elif args.mark_frozen_reuse:
        if not args.output or not args.source_run_id:
            parser.error("--mark-frozen-reuse requires --source-run-id and --output")
        print(json.dumps(mark_frozen_reuse(args.mark_frozen_reuse, args.output, args.source_run_id), indent=2))
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
