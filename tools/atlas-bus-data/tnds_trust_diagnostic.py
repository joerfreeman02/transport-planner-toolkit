"""Quarantined TNDS acquisition/preparation gate used by workflow_call only."""
from __future__ import annotations
import argparse, json, math, os, shutil, subprocess, sys, zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath
from refresh_bus_data import (TNDS_REGIONS, acquire_tnds_snapshot, load_and_verify_tnds_snapshot,
                              validate_tnds_region_coverage)

SCHEMA = "atlas-tnds-trust-run-evidence-v2"
PREPARER = Path(__file__).with_name("prepare_tnds.mjs")


def _write_output(name: str, value: str) -> None:
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as stream: stream.write(f"{name}={value}\n")


def _extract_quarantined(snapshot: Path, destination: Path, manifest: dict) -> None:
    destination.mkdir(parents=True, exist_ok=False)
    extracted_paths = set()
    for entry in manifest.get("sources", []):
        region = str(entry.get("region") or "").upper()
        if region not in TNDS_REGIONS: raise ValueError("TNDS manifest contains an unexpected region")
        archive_path = snapshot / str(entry.get("path", ""))
        region_root = destination / region
        region_root.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path) as archive:
            for info in archive.infolist():
                if info.is_dir(): continue
                member = PurePosixPath(info.filename.replace("\\", "/"))
                if member.is_absolute() or ".." in member.parts or (member.parts and member.parts[0].endswith(":")):
                    raise ValueError("TNDS archive contains an unsafe path")
                target = region_root.joinpath(*member.parts)
                normalized_target = target.resolve()
                if normalized_target in extracted_paths:
                    raise ValueError("TNDS archive contains duplicate member paths")
                extracted_paths.add(normalized_target)
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as src, target.open("wb") as dst: shutil.copyfileobj(src, dst)


def immutable_prepared_at(created_at: str) -> str:
    """Validate and return the immutable original snapshot timestamp."""
    if not isinstance(created_at, str) or not created_at.strip():
        raise ValueError("TNDS snapshot createdAt is required for deterministic preparation")
    value = created_at.strip()
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
    except ValueError as error:
        raise ValueError("TNDS snapshot createdAt is invalid") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("TNDS snapshot createdAt must include a timezone")
    return value


def read_prepared_handoff(prepared_root: str | Path) -> tuple[Path, dict, list[str], dict[str, int]]:
    """Read the preparer's established <output>/manifest.json contract."""
    root = Path(prepared_root)
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file(): raise RuntimeError("Prepared TNDS manifest missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != "atlas-prepared-bus-tnds-v1": raise RuntimeError("Prepared TNDS manifest schema mismatch")
    regions, counts = validate_tnds_region_coverage(manifest)
    if set(regions) != set(TNDS_REGIONS) or len(regions) != len(TNDS_REGIONS):
        raise RuntimeError("Prepared TNDS handoff does not contain exactly eight regions")
    for relative in [item for files in manifest.get("serviceShards", {}).values() for item in files]:
        target = (root / relative).resolve()
        if root.resolve() not in target.parents or not target.is_file():
            raise RuntimeError("Prepared TNDS manifest references a missing or unsafe service shard")
    return manifest_path, manifest, regions, counts


def prepare_tnds_handoff(snapshot_root: str | Path, extracted_root: str | Path, prepared_root: str | Path,
                          *, node: str = "node", date_shim: str | None = None, stage_callback=None) -> tuple[dict, Path]:
    """Verify snapshot, extract, run real preparer, and consume its emitted manifest."""
    snapshot = Path(snapshot_root)
    source_manifest = load_and_verify_tnds_snapshot(snapshot)
    prepared_at = immutable_prepared_at(source_manifest.get("createdAt"))
    _extract_quarantined(snapshot, Path(extracted_root), source_manifest)
    if stage_callback: stage_callback("PREPARATION_STARTED")
    command = [node]
    if date_shim:
        shim_path = Path(date_shim)
        command.extend(["--import", shim_path.resolve().as_uri() if shim_path.is_absolute() else date_shim])
    command.extend([str(PREPARER), "--input", str(extracted_root), "--output", str(prepared_root), "--preparedAt", prepared_at])
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        # Never forward parser output, which may contain source XML text.
        raise RuntimeError("TNDS TransXChange preparation failed")
    prepared_manifest_path, prepared_manifest, regions, counts = read_prepared_handoff(prepared_root)
    if prepared_manifest.get("generatedAt") != prepared_at:
        raise RuntimeError("Prepared TNDS generatedAt does not match immutable snapshot createdAt")
    return {"sourceManifest": source_manifest, "preparedManifest": prepared_manifest,
            "preparedAt": prepared_at, "regions": regions, "regionServiceCounts": counts}, prepared_manifest_path


def _empty_evidence() -> dict:
    return {"schema": SCHEMA, "stage": "INITIALIZING", "result": "RUNNING", "errorType": None,
            "snapshotId": None, "completedRegions": [], "expectedRegions": list(TNDS_REGIONS),
            "preparedManifestPresent": False, "diagnosticOnly": True, "plannerEligible": False,
            "publicationAttempted": False, "deploymentAttempted": False, "secretValuesIncluded": False,
            "producer": {"workflow": os.environ.get("GITHUB_WORKFLOW"), "runId": os.environ.get("GITHUB_RUN_ID"),
                         "repositoryCommitSha": os.environ.get("GITHUB_SHA"), "repository": os.environ.get("GITHUB_REPOSITORY"),
                         "ref": os.environ.get("GITHUB_REF")}}


def _persist_evidence(path: Path, record: dict) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / "run-evidence.json").write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _snapshot_facts(snapshot: Path, record: dict) -> None:
    manifest_path = snapshot / "manifest.json"
    if not manifest_path.is_file(): return
    try: manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return
    record["snapshotId"] = manifest.get("snapshotId")
    record["completedRegions"] = sorted({str(item.get("region", "")).upper() for item in manifest.get("sources", [])
                                         if isinstance(item, dict) and item.get("region")})
    record["expectedRegions"] = list(TNDS_REGIONS)
    record["snapshotState"] = manifest.get("state")
    record["producer"] = manifest.get("producer", {})


def _new_record(evidence: Path, stage: str) -> dict:
    evidence.mkdir(parents=True, exist_ok=True)
    record = _empty_evidence()
    record["stage"] = stage
    _persist_evidence(evidence, record)
    return record


def acquire_raw_checkpoint(snapshot: str | Path, evidence: str | Path) -> dict:
    """Acquire and verify immutable raw archives, without extraction/preparation."""
    snapshot, evidence = Path(snapshot), Path(evidence)
    if snapshot.exists(): raise RuntimeError("Raw TNDS checkpoint workspace already exists")
    snapshot.mkdir(parents=True)
    _write_output("snapshot_available", "true")
    record = _new_record(evidence, "ACQUISITION_STARTED")
    try:
        manifest = acquire_tnds_snapshot(snapshot, os.environ.get("TNDS_USERNAME", ""), os.environ.get("TNDS_PASSWORD", ""))
        verified = load_and_verify_tnds_snapshot(snapshot)
        if manifest.get("snapshotId") != verified.get("snapshotId"):
            raise RuntimeError("Acquired TNDS snapshot identity changed during verification")
        record.update({"stage": "RAW_SNAPSHOT_VERIFIED", "result": "RAW_SNAPSHOT_VERIFIED",
                       "snapshotId": verified["snapshotId"], "completedRegions": list(TNDS_REGIONS),
                       "snapshotState": verified["state"], "producer": verified.get("producer", {}),
                       "currentFreshnessClaimed": True, "acquisitionMode": "FRESH"})
        _persist_evidence(evidence, record)
        _write_output("snapshot_available", "true")
        return verified
    except Exception as error:
        record.update({"stage": "ACQUISITION_FAILED", "result": "FAILED", "errorType": type(error).__name__})
        _snapshot_facts(snapshot, record)
        _persist_evidence(evidence, record)
        raise


def verify_reused_checkpoint(snapshot: str | Path, evidence: str | Path, *, producer_run_id: str,
                             artifact_name: str) -> dict:
    """Verify an artifact restored from its explicit Actions producer run."""
    snapshot, evidence = Path(snapshot), Path(evidence)
    record = _new_record(evidence, "RAW_SNAPSHOT_RESTORE")
    expected_name = f"atlas-tnds-quarantined-{producer_run_id}"
    try:
        if not producer_run_id.isdigit() or artifact_name != expected_name:
            raise ValueError("TNDS raw artifact run/name selector is invalid")
        verified = load_and_verify_tnds_snapshot(snapshot)
        producer = verified.get("producer") or {}
        if str(producer.get("runId") or "") != producer_run_id:
            raise ValueError("TNDS snapshot producer run does not match selected artifact run")
        expected_repository = os.environ.get("GITHUB_REPOSITORY")
        if expected_repository and producer.get("repository") != expected_repository:
            raise ValueError("TNDS snapshot repository does not match this workflow")
        record.update({"stage": "RAW_SNAPSHOT_VERIFIED", "result": "RAW_SNAPSHOT_VERIFIED",
                       "snapshotId": verified["snapshotId"], "completedRegions": list(TNDS_REGIONS),
                       "snapshotState": verified["state"], "producer": producer,
                       "acquisitionMode": "VERIFIED_REUSE", "sourceProducerRunId": producer_run_id,
                       "artifactName": artifact_name, "currentFreshnessClaimed": False})
        _persist_evidence(evidence, record)
        return verified
    except Exception as error:
        record.update({"stage": "RAW_RESTORE_FAILED", "result": "FAILED", "errorType": type(error).__name__,
                       "sourceProducerRunId": producer_run_id, "artifactName": artifact_name,
                       "currentFreshnessClaimed": False})
        _snapshot_facts(snapshot, record)
        _persist_evidence(evidence, record)
        raise


def inspect_tnds_capacity(snapshot: str | Path, *, free_bytes: int | None = None) -> dict:
    """Measure ZIP central directories only and enforce conservative free-space headroom."""
    root = Path(snapshot)
    manifest = load_and_verify_tnds_snapshot(root)
    per_region, member_count, uncompressed_total = [], 0, 0
    compressed_total = sum(int(entry["bytes"]) for entry in manifest["sources"])
    for entry in sorted(manifest["sources"], key=lambda value: value["region"]):
        archive_path = root / entry["path"]
        with zipfile.ZipFile(archive_path) as archive:
            infos = archive.infolist()
            uncompressed = sum(info.file_size for info in infos if not info.is_dir())
            members = sum(not info.is_dir() for info in infos)
        member_count += members
        uncompressed_total += uncompressed
        per_region.append({"region": entry["region"], "compressedBytes": int(entry["bytes"]),
                           "uncompressedMemberBytes": uncompressed, "memberCount": members})
    available = shutil.disk_usage(root).free if free_bytes is None else int(free_bytes)
    required = max(10 * 1024**3, 3 * uncompressed_total + compressed_total)
    report = {"schema": "atlas-tnds-capacity-preflight-v1", "snapshotId": manifest["snapshotId"],
              "compressedSourceBytes": compressed_total, "uncompressedMemberBytes": uncompressed_total,
              "memberCount": member_count,
              "expansionRatio": round(uncompressed_total / compressed_total, 6) if compressed_total else None,
              "perRegion": per_region, "runnerFreeBytes": available, "requiredFreeBytes": required,
              "headroomRule": "runnerFreeBytes >= max(10 GiB, 3 * uncompressedMemberBytes + compressedSourceBytes)",
              "status": "CAPACITY_SUFFICIENT" if available >= required else "CAPACITY_BLOCKED",
              "extractionStarted": False}
    return report


def capacity_checkpoint(snapshot: str | Path, evidence: str | Path) -> dict:
    evidence = Path(evidence)
    record_path = evidence / "run-evidence.json"
    record = json.loads(record_path.read_text(encoding="utf-8")) if record_path.is_file() else _new_record(evidence, "CAPACITY_CHECK")
    try:
        report = inspect_tnds_capacity(snapshot)
        (evidence / "capacity-report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        record["capacity"] = report
        if report["status"] == "CAPACITY_BLOCKED":
            record.update({"stage": "CAPACITY_BLOCKED", "result": "CAPACITY_BLOCKED", "errorType": "InsufficientRunnerSpace"})
            _persist_evidence(evidence, record)
            raise RuntimeError("TNDS capacity gate blocked preparation")
        record["stage"] = "RAW_SNAPSHOT_VERIFIED"
        record["result"] = "RAW_SNAPSHOT_VERIFIED"
        _persist_evidence(evidence, record)
        return report
    except Exception as error:
        if record.get("stage") != "CAPACITY_BLOCKED":
            record.update({"stage": "CAPACITY_BLOCKED", "result": "CAPACITY_BLOCKED", "errorType": type(error).__name__})
            _persist_evidence(evidence, record)
        raise


def prepare_checkpoint(snapshot: str | Path, evidence: str | Path, *, node: str = "node",
                       source_producer_run_id: str | None = None, reused: bool = False) -> dict:
    snapshot, evidence = Path(snapshot), Path(evidence)
    record_path = evidence / "run-evidence.json"
    record = json.loads(record_path.read_text(encoding="utf-8")) if record_path.is_file() else _new_record(evidence, "EXTRACTION")
    try:
        # Recheck immediately before extraction so capacity cannot silently go stale.
        capacity = inspect_tnds_capacity(snapshot)
        (evidence / "capacity-report.json").write_text(json.dumps(capacity, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        record["capacity"] = capacity
        if capacity["status"] != "CAPACITY_SUFFICIENT":
            record.update({"stage": "CAPACITY_BLOCKED", "result": "CAPACITY_BLOCKED", "errorType": "InsufficientRunnerSpace"})
            _persist_evidence(evidence, record)
            raise RuntimeError("TNDS capacity gate blocked preparation")
        record["stage"] = "EXTRACTION_STARTED"; _persist_evidence(evidence, record)
        extracted, prepared = snapshot.parent / "tnds-extracted-input", snapshot.parent / "tnds-prepared-output"
        def set_stage(value):
            record["stage"] = value
            _persist_evidence(evidence, record)
        handoff, manifest_path = prepare_tnds_handoff(snapshot, extracted, prepared, node=node, stage_callback=set_stage)
        record.update({"stage": "PREPARED_HANDOFF_SUCCEEDED", "result": "PREPARED_HANDOFF_SUCCEEDED",
                       "snapshotId": handoff["sourceManifest"]["snapshotId"], "completedRegions": list(TNDS_REGIONS),
                       "preparedManifestPresent": manifest_path.is_file(), "preparedAt": handoff["preparedAt"],
                       "currentFreshnessClaimed": not reused, "sourceProducerRunId": source_producer_run_id,
                       "acquisitionMode": "VERIFIED_REUSE" if reused else "FRESH"})
        _persist_evidence(evidence, record)
        verified = handoff["sourceManifest"]
        prepared_manifest = handoff["preparedManifest"]
        evidence_manifest = {"schema": "atlas-tnds-trust-acquisition-evidence-v2", "snapshotId": verified["snapshotId"],
            "snapshotState": verified["state"], "createdAt": verified["createdAt"], "producer": verified.get("producer", {}),
            "quarantined": True, "preparedAt": handoff["preparedAt"], "preparedRegions": handoff["regions"],
            "regionServiceCounts": handoff["regionServiceCounts"], "serviceCount": prepared_manifest.get("serviceCount"),
            "reconciliationStatus": "PRIMARY_INPUT_NOT_RESTORED", "plannerEligible": False,
            "runtimeActive": False, "publicationAttempted": False, "deploymentAttempted": False,
            "diagnosticOnly": True, "secretValuesIncluded": False,
            "currentFreshnessClaimed": not reused, "sourceProducerRunId": source_producer_run_id}
        (evidence / "tnds-trust-evidence.json").write_text(json.dumps(evidence_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        shutil.copyfile(manifest_path, evidence / "prepared-tnds-manifest.json")
        (evidence / "tnds-source-manifest.json").write_text(json.dumps(verified, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        summary = {"snapshotId": verified["snapshotId"], "regionCount": len(handoff["regions"]),
                   "serviceCount": prepared_manifest.get("serviceCount"), "preparedAt": handoff["preparedAt"],
                   "acquisitionMode": "VERIFIED_REUSE" if reused else "FRESH", "currentFreshnessClaimed": not reused,
                   "diagnosticOnly": True, "plannerEligible": False, "publicationAttempted": False,
                   "deploymentAttempted": False, "secretValuesIncluded": False}
        (evidence / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return {"handoff": handoff, "preparedManifestPath": manifest_path}
    except Exception as error:
        if record.get("stage") != "CAPACITY_BLOCKED":
            error_stage = "EXTRACTION_FAILED" if record.get("stage") == "EXTRACTION_STARTED" else "PREPARATION_FAILED"
            record.update({"stage": error_stage,
                           "result": "FAILED", "errorType": type(error).__name__,
                           "currentFreshnessClaimed": not reused, "sourceProducerRunId": source_producer_run_id})
            _persist_evidence(evidence, record)
        raise


def run(*, node: str | None = None, runner_temp: str | Path | None = None) -> dict:
    username, password = os.environ.get("TNDS_USERNAME", ""), os.environ.get("TNDS_PASSWORD", "")
    root = Path(runner_temp or os.environ.get("RUNNER_TEMP", ".")).resolve()
    snapshot, extracted, prepared, evidence = (root / name for name in
        ("tnds-quarantined-snapshot", "tnds-extracted-input", "tnds-prepared-output", "tnds-evidence"))
    if any(path.exists() for path in (snapshot, extracted, prepared, evidence)):
        raise RuntimeError("Run-specific TNDS workspace already exists; refusing reuse")
    evidence.mkdir(parents=True, exist_ok=False)
    record = _empty_evidence()
    _persist_evidence(evidence, record)
    _write_output("evidence_available", "true")
    snapshot.mkdir(parents=True, exist_ok=False)
    _write_output("snapshot_available", "true")
    stage = "ACQUISITION"
    record["stage"] = stage; _persist_evidence(evidence, record)
    try:
        manifest = acquire_tnds_snapshot(snapshot, username, password)
        _snapshot_facts(snapshot, record)
        if manifest.get("state") != "ACQUIRED / UNINTERPRETED / VERIFIED / QUARANTINED":
            raise RuntimeError("TNDS acquisition did not finish with a verified quarantine snapshot")
        stage = "SNAPSHOT_VERIFICATION"
        record["stage"] = stage; _persist_evidence(evidence, record)
        verified_manifest = load_and_verify_tnds_snapshot(snapshot)
        record["snapshotId"] = verified_manifest.get("snapshotId")
        record["completedRegions"] = list(TNDS_REGIONS)
        stage = "EXTRACTION_AND_PREPARATION"
        record["stage"] = stage; _persist_evidence(evidence, record)
        handoff, prepared_manifest_path = prepare_tnds_handoff(snapshot, extracted, prepared,
                                                               node=node or os.environ.get("ATLAS_NODE", "node"))
        record["preparedManifestPresent"] = prepared_manifest_path.is_file()
        record["stage"] = "PREPARED_HANDOFF"
        record["result"] = "SUCCEEDED_PREPARED_NO_COMPARATOR"
        _persist_evidence(evidence, record)
        prepared_manifest = handoff["preparedManifest"]
        evidence_manifest = {"schema": "atlas-tnds-trust-acquisition-evidence-v2", "snapshotId": verified_manifest["snapshotId"],
            "snapshotState": verified_manifest["state"], "createdAt": verified_manifest["createdAt"],
            "producer": verified_manifest.get("producer", {}), "quarantined": True,
            "preparedAt": handoff["preparedAt"], "preparedRegions": handoff["regions"],
            "regionServiceCounts": handoff["regionServiceCounts"], "serviceCount": prepared_manifest.get("serviceCount"),
            "regionalEvidence": [{"region": region, "acquisitionId": verified_manifest["snapshotId"],
                "archiveSha256": next(item["sha256"] for item in verified_manifest["sources"] if item.get("region") == region),
                "sourceBytes": next(item["bytes"] for item in verified_manifest["sources"] if item.get("region") == region),
                "archiveValidation": "passed", "semanticValidation": "passed", "normalizationValidation": "passed",
                "comparatorState": "COMPARATOR_UNAVAILABLE"} for region in handoff["regions"]],
            "reconciliationStatus": "PRIMARY_INPUT_NOT_RESTORED", "plannerEligible": False,
            "runtimeActive": False, "publicationAttempted": False, "deploymentAttempted": False,
            "diagnosticOnly": True, "secretValuesIncluded": False}
        (evidence / "tnds-trust-evidence.json").write_text(json.dumps(evidence_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        shutil.copyfile(prepared_manifest_path, evidence / "prepared-tnds-manifest.json")
        (evidence / "tnds-source-manifest.json").write_text(json.dumps(verified_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        public_summary = {"snapshotId": verified_manifest.get("snapshotId"), "regionCount": len(handoff["regions"]),
            "serviceCount": prepared_manifest.get("serviceCount"), "preparedAt": handoff["preparedAt"],
            "regionalComparatorState": "COMPARATOR_UNAVAILABLE", "reconciliationStatus": "PRIMARY_INPUT_NOT_RESTORED",
            "diagnosticOnly": True, "plannerEligible": False, "secretValuesIncluded": False}
        (evidence / "summary.json").write_text(json.dumps(public_summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return {"snapshot": str(snapshot), "evidence": str(evidence), "summary": public_summary}
    except Exception as error:
        record["stage"] = stage
        record["result"] = "FAILED"
        record["errorType"] = type(error).__name__
        _snapshot_facts(snapshot, record)
        _persist_evidence(evidence, record)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--acquire-only", action="store_true")
    modes.add_argument("--verify-reused", action="store_true")
    modes.add_argument("--capacity-only", action="store_true")
    modes.add_argument("--prepare-only", action="store_true")
    runner_temp = Path(os.environ.get("RUNNER_TEMP", "."))
    parser.add_argument("--snapshot", default=str(runner_temp / "tnds-quarantined-snapshot"))
    parser.add_argument("--evidence", default=str(runner_temp / "tnds-evidence"))
    parser.add_argument("--producer-run-id", default="")
    parser.add_argument("--artifact-name", default="")
    parser.add_argument("--node", default=os.environ.get("ATLAS_NODE", "node"))
    args = parser.parse_args()
    try:
        if args.acquire_only:
            result = acquire_raw_checkpoint(args.snapshot, args.evidence)
            output = {"snapshotId": result["snapshotId"], "state": result["state"], "regionCount": result["completedRegionCount"]}
        elif args.verify_reused:
            result = verify_reused_checkpoint(args.snapshot, args.evidence, producer_run_id=args.producer_run_id,
                                              artifact_name=args.artifact_name)
            output = {"snapshotId": result["snapshotId"], "state": result["state"], "acquisitionMode": "VERIFIED_REUSE"}
        elif args.capacity_only:
            output = capacity_checkpoint(args.snapshot, args.evidence)
        else:
            reused = bool(args.producer_run_id and args.producer_run_id != os.environ.get("GITHUB_RUN_ID"))
            result = prepare_checkpoint(args.snapshot, args.evidence, node=args.node,
                                        source_producer_run_id=args.producer_run_id or None, reused=reused)
            handoff = result["handoff"]
            output = {"snapshotId": handoff["sourceManifest"]["snapshotId"],
                      "preparedAt": handoff["preparedAt"],
                      "serviceCount": handoff["preparedManifest"].get("serviceCount"),
                      "acquisitionMode": "VERIFIED_REUSE" if reused else "FRESH"}
    except Exception as error:
        # Only exception type is emitted; no unrestricted error text or source content.
        print(f"TNDS diagnostic gate failed safely ({type(error).__name__}).", file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps(output, sort_keys=True))


if __name__ == "__main__": main()
