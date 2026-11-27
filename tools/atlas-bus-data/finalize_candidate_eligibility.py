"""Mark a full production candidate eligible only after its gates have passed."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def read_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path.name}.")
    return value


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def finalize(site: Path, validation: Path, deterministic_log: Path, measurement: Path) -> dict:
    status_path = site / "atlas/data/status/manifest.json"
    bus_path = site / "atlas/data/bus/manifest.json"
    tnds_path = site / "atlas/data/bus-tnds/manifest.json"
    status, bus, tnds = read_json(status_path), read_json(bus_path), read_json(tnds_path)
    validation_result = read_json(validation)
    capacity = read_json(measurement)
    if status.get("schema") != "atlas-bus-refresh-status-v1" or status.get("status") != "validated" or status.get("validation") != "passed":
        raise ValueError("Candidate source preparation and structural validation have not passed.")
    if status.get("diagnosticOnly") is not False or status.get("reviewOnly") is not False or status.get("productionEligible") is not True or status.get("publicationEligible") is not True:
        raise ValueError("Diagnostic, review-only, or ineligible candidates cannot be promoted by this finalizer.")
    generated_at = status.get("candidateGeneratedAt")
    if not generated_at or bus.get("generatedAt") != generated_at or tnds.get("generatedAt") != generated_at:
        raise ValueError("Candidate status, Bus, and TNDS manifests do not share one generation timestamp.")
    for key in ("naptanStopCount", "bodsServiceCount", "tndsServiceCount", "stopIds"):
        if not isinstance(validation_result.get(key), int) or validation_result[key] < 1:
            raise ValueError(f"Hard validation report is missing a positive {key}.")
    if not deterministic_log.is_file() or deterministic_log.stat().st_size == 0:
        raise ValueError("Deterministic ATLAS suite evidence is missing.")
    proposed = capacity.get("proposedPublication", {})
    maximum_file_bytes = capacity.get("maximumBusNptgIbusFileBytes")
    git_blob_limit_bytes = capacity.get("gitBlobLimitBytes")
    if (capacity.get("bus", {}).get("fitsSafeLimit") is not True
            or capacity.get("bus", {}).get("projectedBlueGreenFitsSafeLimit") is not True
            or capacity.get("tnds", {}).get("coverage") != "complete-national-region-set"
            or proposed.get("bankRootCount") != 5
            or proposed.get("allRootsFitSafeLimit") is not True
            or (capacity.get("nptg") is not None and capacity.get("combinedBusAndNptg", {}).get("fitsSafeLimit") is not True)
            or (capacity.get("tflIbus") is not None and capacity.get("tflIbus", {}).get("fitsSafeLimit") is not True)
            or not isinstance(maximum_file_bytes, int) or maximum_file_bytes < 0
            or not isinstance(git_blob_limit_bytes, int) or git_blob_limit_bytes <= 0
            or maximum_file_bytes > git_blob_limit_bytes):
        raise ValueError("Candidate capacity evidence does not prove complete national coverage, combined Bus/NPTG and iBus footprint, individual-file limit, blue/green Bus space, and safe fit across the five inactive-bank roots.")
    evidence = {
        "schema": "atlas-planner-eligibility-evidence-v1",
        "state": "passed",
        "checks": {
            "sourceAndStructuralValidation": {"state": "passed", "reportSha256": digest(validation)},
            "deterministicAtlasSuite": {"state": "passed", "logSha256": digest(deterministic_log)},
            "boundedPublicationCapacity": {"state": "passed", "reportSha256": digest(measurement)},
        },
    }
    status["successfulRefreshAt"] = generated_at
    status["plannerEligible"] = True
    status["eligibilityEvidence"] = evidence
    status_path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-root", type=Path, required=True)
    parser.add_argument("--validation-report", type=Path, required=True)
    parser.add_argument("--deterministic-log", type=Path, required=True)
    parser.add_argument("--measurement", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(finalize(args.site_root, args.validation_report, args.deterministic_log, args.measurement), indent=2))


if __name__ == "__main__":
    main()
