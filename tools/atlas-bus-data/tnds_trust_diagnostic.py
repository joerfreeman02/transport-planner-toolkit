"""Manual GitHub-only TNDS acquisition and preparation gate; no reconciliation publish."""
from __future__ import annotations
import json, os, shutil, subprocess, sys, zipfile
from pathlib import Path, PurePosixPath
from refresh_bus_data import TNDS_REGIONS, acquire_tnds_snapshot, validate_tnds_region_coverage


def _write_output(name: str, value: str) -> None:
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as stream: stream.write(f"{name}={value}\n")


def _extract_quarantined(snapshot: Path, destination: Path, manifest: dict) -> None:
    destination.mkdir(parents=True, exist_ok=False)
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
                # Preserve subfolders beneath a region-specific root so service XML stays discoverable.
                target = region_root.joinpath(*member.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as src, target.open("wb") as dst: shutil.copyfileobj(src, dst)


def run() -> dict:
    username, password = os.environ.get("TNDS_USERNAME", ""), os.environ.get("TNDS_PASSWORD", "")
    if not username or not password:
        raise RuntimeError("GitHub TNDS secret expressions did not provide both required values")
    run_temp = Path(os.environ.get("RUNNER_TEMP", ".")).resolve()
    snapshot = run_temp / "tnds-quarantined-snapshot"
    extracted = run_temp / "tnds-extracted-input"
    prepared = run_temp / "tnds-prepared-output"
    evidence = run_temp / "tnds-evidence"
    # RUNNER_TEMP is unique for each hosted run; refuse accidental reuse.
    if any(path.exists() for path in (snapshot, extracted, prepared, evidence)):
        raise RuntimeError("Run-specific TNDS workspace already exists; refusing reuse")
    manifest = acquire_tnds_snapshot(snapshot, username, password)
    if manifest.get("state") != "ACQUIRED / UNINTERPRETED / VERIFIED / QUARANTINED" or manifest.get("quarantined") is not True:
        raise RuntimeError("TNDS source snapshot did not reach verified quarantine state")
    _write_output("snapshot_created", "true")
    _extract_quarantined(snapshot, extracted, manifest)
    completed = subprocess.run(["node", "tools/atlas-bus-data/prepare_tnds.mjs", "--input", str(extracted), "--output", str(prepared)],
                               capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        # Parser output can contain source text. Never forward captured stdout/stderr to Actions logs.
        raise RuntimeError(f"TNDS TransXChange preparation failed with exit code {completed.returncode}")
    prepared_manifest_path = prepared / "atlas" / "data" / "bus-tnds" / "manifest.json"
    if not prepared_manifest_path.is_file(): raise RuntimeError("Prepared TNDS manifest missing")
    prepared_manifest = json.loads(prepared_manifest_path.read_text(encoding="utf-8"))
    regions, counts = validate_tnds_region_coverage(prepared_manifest)
    # Preparation confirms parsability/normalization; comparator validation remains unavailable
    # until an exact compatible BODS primary input is restored and joined.
    evidence.mkdir(parents=True, exist_ok=False)
    evidence_manifest = {"schema": "atlas-tnds-trust-acquisition-evidence-v1", "snapshotId": manifest.get("snapshotId"),
        "snapshotState": manifest["state"], "quarantined": True, "preparedRegions": regions,
        "regionServiceCounts": counts, "serviceCount": prepared_manifest.get("serviceCount"),
        "regionalEvidence": [{"region": region, "acquisitionId": manifest["snapshotId"],
            "archiveSha256": next(item["sha256"] for item in manifest["sources"] if item.get("region") == region),
            "sourceBytes": next(item["bytes"] for item in manifest["sources"] if item.get("region") == region),
            "archiveValidation": "passed", "semanticValidation": "passed", "normalizationValidation": "passed",
            "comparatorState": "COMPARATOR_UNAVAILABLE"} for region in regions],
        "reconciliationStatus": "PRIMARY_INPUT_NOT_RESTORED", "plannerEligible": False,
        "runtimeActive": False, "publicationAttempted": False, "deploymentAttempted": False,
        "diagnosticOnly": True, "secretValuesIncluded": False}
    (evidence / "tnds-trust-evidence.json").write_text(json.dumps(evidence_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    shutil.copyfile(prepared_manifest_path, evidence / "prepared-tnds-manifest.json")
    (evidence / "tnds-source-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    public_summary = {"snapshotId": manifest.get("snapshotId"), "regionCount": len(regions), "serviceCount": prepared_manifest.get("serviceCount"),
        "regionalComparatorState": "COMPARATOR_UNAVAILABLE", "reconciliationStatus": "PRIMARY_INPUT_NOT_RESTORED",
        "diagnosticOnly": True, "plannerEligible": False, "secretValuesIncluded": False}
    (evidence / "summary.json").write_text(json.dumps(public_summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"snapshot": str(snapshot), "evidence": str(evidence), "summary": public_summary}


def main() -> None:
    try:
        result = run()
    except Exception as error:
        # Only exception type is emitted: never interpolate exception text or source parser output.
        print(f"TNDS diagnostic gate failed safely ({type(error).__name__}).", file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps(result["summary"], sort_keys=True))


if __name__ == "__main__": main()
