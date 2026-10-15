"""Verify prepared checkpoints, reconcile nationally, and emit bounded evidence."""
from __future__ import annotations

import argparse
import gzip
import json
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

from reconciliation_checkpoint import verify_checkpoint
from reconciliation_projection import build_controls
from tnds_reconciliation import EXPECTED_REGIONS, State, _current, reconcile, validate_region_manifest


def _read_bundle(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def _date_basis(value: Any) -> date:
    if not isinstance(value, str) or not value:
        raise ValueError("Checkpoint source-window basis is missing")
    try:
        return date.fromisoformat(value[:10])
    except ValueError as error:
        raise ValueError("Checkpoint source-window basis is invalid") from error


def run(primary_path: Path, tnds_path: Path, primary_expected: dict, tnds_expected: dict,
        output: Path, *, producer_run_id: str, branch: str, commit: str, repository: str) -> dict:
    primary, tnds = _read_bundle(primary_path), _read_bundle(tnds_path)
    primary_manifest = verify_checkpoint(primary, primary_expected)
    tnds_manifest = verify_checkpoint(tnds, tnds_expected)
    for manifest in (primary_manifest, tnds_manifest):
        if manifest.get("checkpointProducerRunId") != str(producer_run_id):
            raise ValueError("Checkpoint producer run mismatch")
        if manifest.get("checkpointBranch") != branch or manifest.get("preparationCodeCommit") != commit:
            raise ValueError("Checkpoint branch or code commit compatibility mismatch")
        if manifest.get("repository") != repository:
            raise ValueError("Checkpoint repository mismatch")
    p_projection, t_projection = primary["projection"], tnds["projection"]
    if p_projection.get("sourceSnapshotId") != primary_manifest["sourceSnapshotId"] or t_projection.get("sourceSnapshotId") != tnds_manifest["sourceSnapshotId"]:
        raise ValueError("Projection source snapshot identity mismatch")
    regional = t_projection.get("regionalEvidence")
    if not isinstance(regional, dict) or regional.get("fixtureOnly") is not False:
        raise ValueError("Live TNDS regional evidence is missing or fixture-only")
    coverage = validate_region_manifest(regional)
    if coverage["state"] != "NATIONAL_COMPLETE":
        raise ValueError("TNDS comparator is partial; national reconciliation is prohibited")
    primary_coverage = p_projection.get("primaryCoverage")
    if not isinstance(primary_coverage, dict) or primary_coverage.get("unclassifiedRemainder") != 0 or primary_coverage.get("preparationErrorCount") != 0:
        raise ValueError("Primary coverage ledger is missing, incomplete, or has preparation errors")
    primary_day = _date_basis(primary_manifest["sourceWindowBasis"])
    tnds_day = _date_basis(tnds_manifest["sourceWindowBasis"])
    as_of = min(primary_day, tnds_day)
    source_windows = {"primary": primary_manifest["sourceWindowBasis"], "tnds": tnds_manifest["sourceWindowBasis"],
                      "reconciliationAsOf": as_of.isoformat(), "asOfRule": "earliest date in the two immutable source-window bases",
                      "mismatch": primary_day != tnds_day}
    ledger = reconcile(p_projection.get("rows", []), t_projection.get("rows", []), as_of=as_of.isoformat(),
                       tnds_status=State.COMPARATOR_VALIDATED, region_manifest=regional)
    output.mkdir(parents=True, exist_ok=True)
    counts = ledger["categoryCounts"]
    regional_rows = defaultdict(Counter)
    for row in ledger["rows"]:
        regional_rows[row["region"]][row["category"]] += 1
    regional_summary = {region: dict(sorted(regional_rows.get(region, {}).items())) for region in (*EXPECTED_REGIONS, "LONDON")}
    unresolved = p_projection.get("unresolvedPrimaryIdentityRecords")
    unresolved = unresolved if isinstance(unresolved, list) else None
    tnds_stops = {str(row.get("stopId", "")) for row in t_projection.get("rows", [])}
    unresolved_summary = {"schema": "atlas-primary-unresolved-reconciliation-summary-v1",
        "snapshotId": primary_manifest["sourceSnapshotId"], "sourceWindow": primary_manifest["sourceWindowBasis"],
        "unresolvedScheduledCallCount": len(unresolved) if unresolved is not None else None,
        "uniqueRawGtfsStopIdentityCount": len({str(row.get("gtfsStopId", "")) for row in unresolved or [] if row.get("gtfsStopId")}),
        "uniqueRouteCount": len({str(row.get("routeId", "")) for row in unresolved or [] if row.get("routeId")}),
        "uniqueOperatorCount": None,
        "operatorLineageStatus": "NOT_PRESENT_IN_COVERAGE_LEDGER_UNRESOLVED_RECORDS",
        "countsByRegion": dict(sorted(Counter(str(row.get("region", "unknown")) for row in unresolved or []).items())),
        "exactTndsStopReferenceCount": sum(1 for row in unresolved or [] if str(row.get("gtfsStopId", "")) in tnds_stops),
        "exactTndsStopReferenceUniqueIdentityCount": len({str(row.get("gtfsStopId", "")) for row in unresolved or [] if row.get("gtfsStopId") and str(row.get("gtfsStopId", "")) in tnds_stops}),
        "tndsAbsentUniqueGtfsStopIdentityCount": len({str(row.get("gtfsStopId", "")) for row in unresolved or [] if row.get("gtfsStopId") and str(row.get("gtfsStopId", "")) not in tnds_stops}),
        "exactServiceIdentityCorroborationCount": 0,
        "strongCompositeCandidateCount": None,
        "candidateAssessmentStatus": "NO_RESOLVED_STOPPOINT_SCOPE_FOR_UNRESOLVED_GTFS_IDENTITIES",
        "ambiguousIdentityCount": None,
        "lineageInsufficientCount": sum(1 for row in unresolved or [] if not row.get("tripId") or not row.get("routeId") or not row.get("gtfsStopId")),
        "lineageStatus": "EXACT_RAW_STOP_REFERENCES_ONLY_NO_PLANNER_JOIN" if unresolved is not None else "UNRESOLVED_LEDGER_NOT_INCLUDED",
        "fuzzyMatchingUsed": False, "resolverChanged": False, "diagnosticOnly": True}
    controls = build_controls(None,
        [row for row in p_projection.get("rows", []) if _current(row, as_of)],
        [row for row in t_projection.get("rows", []) if _current(row, as_of)],
        p_projection.get("controlStops", []))
    for site in controls.values():
        nearby_ids = {item["stopId"] for item in site["nearbyStops"]}
        site["unresolvedPrimaryIdentityEvidence"] = [row for row in unresolved or []
            if str(row.get("gtfsStopId", "")) in nearby_ids or str(row.get("gtfsStopCode", "")) in nearby_ids]
        site_rows = [row for row in ledger["rows"] if row.get("primaryStopId") in nearby_ids or row.get("tndsStopId") in nearby_ids]
        site["reconciliationRows"] = site_rows
        site["exactCorroboratedEvidence"] = [row for row in site_rows if row.get("identityCorroborated") is True]
        site["primaryOnlyEvidence"] = [row for row in site_rows if row.get("category") == "PRIMARY_ONLY"]
        site["tndsOnlyCandidates"] = [row for row in site_rows if row.get("category") == "TNDS_ONLY_CANDIDATE"]
        site["conflicts"] = [row for row in site_rows if row.get("category") == "CONFLICTING_CURRENT_EVIDENCE"]
        site["sourceWindowDifferences"] = [row for row in site_rows if row.get("category") == "SOURCE_WINDOW_DIFFERENCE"]
        site["ambiguousEvidence"] = [row for row in site_rows if row.get("category") == "AMBIGUOUS"]
        site["unresolvedPrimaryIdentityCount"] = len(site["unresolvedPrimaryIdentityEvidence"]) if unresolved is not None else None
        site["primaryCoverage"] = primary_coverage
        site["tndsRegionalCoverage"] = coverage
        site["sourceWindows"] = source_windows
        site["evidenceCompleteForSite"] = bool(site["nearbyStops"]) and primary_coverage.get("unclassifiedRemainder") == 0 and coverage["state"] == "NATIONAL_COMPLETE"
        site["assessmentNote"] = "Reference routes are review controls only; reported service evidence comes from verified projections. Unresolved calls retain GTFS identities and are not mapped to a planner StopPoint."
    summary = {"schema": "atlas-tnds-reconciliation-summary-v3", "asOf": as_of.isoformat(),
        "asOfBasis": source_windows, "sourceSnapshots": {"primary": primary_manifest["sourceSnapshotId"], "tnds": tnds_manifest["sourceSnapshotId"]},
        "primaryRowCount": len(p_projection.get("rows", [])), "tndsRowCount": len(t_projection.get("rows", [])),
        "categoryCounts": counts, "regionalCoverage": coverage, "matchingInstrumentation": ledger["matchingInstrumentation"],
        "diagnosticOnly": True, "plannerEligible": False, "plannerOutputChanged": False,
        "sourceAuthorityChanged": False, "publicationEligible": False, "publicationAttempted": False,
        "deploymentAttempted": False}
    samples: dict[str, Any] = {"byCategory": {}, "byRegion": {}, "controls": {}}
    for category in sorted(counts): samples["byCategory"][category] = [row for row in ledger["rows"] if row["category"] == category][:20]
    for region in (*EXPECTED_REGIONS, "LONDON"): samples["byRegion"][region] = [row for row in ledger["rows"] if row["region"] == region][:20]
    for name, site in controls.items(): samples["controls"][name] = {"nearbyStops": site["nearbyStops"][:30],
        "primaryServiceEvidence": site["primaryServiceEvidence"][:30], "tndsServiceEvidence": site["tndsServiceEvidence"][:30]}
    outputs = {
        "reconciliation-summary.json": summary,
        "reconciliation-category-counts.json": {"counts": counts, "ledgerSha256": ledger["ledgerSha256"]},
        "reconciliation-regional-summary.json": {"regions": regional_summary, "coverage": coverage},
        "unresolved-primary-summary.json": unresolved_summary,
        "pipers-lane-control.json": controls["pipersLane"],
        "peterborough-queensgate-control.json": controls["peterboroughQueensgate"],
        "primary-checkpoint-manifest.json": primary_manifest,
        "tnds-checkpoint-manifest.json": tnds_manifest,
        "run-evidence.json": {"schema": "atlas-bus-reconciliation-run-evidence-v1", "producerRunId": str(producer_run_id),
            "repository": repository, "branch": branch, "commit": commit,
            "inputCheckpointHashes": {"primary": primary_manifest["canonicalProjectionSha256"], "tnds": tnds_manifest["canonicalProjectionSha256"]},
            "sourceWindows": source_windows, "diagnosticOnly": True, "plannerEligible": False,
            "plannerOutputChanged": False, "sourceAuthorityChanged": False, "publicationAttempted": False, "deploymentAttempted": False},
        "reconciliation-samples.json": samples,
    }
    for filename, value in outputs.items(): (output / filename).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    with gzip.open(output / "reconciliation-ledger.json.gz", "wb", compresslevel=9) as stream:
        stream.write(json.dumps(ledger, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8") + b"\n")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--primary-checkpoint", required=True); parser.add_argument("--tnds-checkpoint", required=True)
    parser.add_argument("--primary-expected", required=True); parser.add_argument("--tnds-expected", required=True)
    parser.add_argument("--output", required=True); parser.add_argument("--producer-run-id", required=True)
    parser.add_argument("--branch", required=True); parser.add_argument("--commit", required=True); parser.add_argument("--repository", required=True)
    args = parser.parse_args()
    result = run(Path(args.primary_checkpoint), Path(args.tnds_checkpoint), json.loads(Path(args.primary_expected).read_text()),
        json.loads(Path(args.tnds_expected).read_text()), Path(args.output), producer_run_id=args.producer_run_id,
        branch=args.branch, commit=args.commit, repository=args.repository)
    print(json.dumps({"asOf": result["asOf"], "primaryRows": result["primaryRowCount"], "tndsRows": result["tndsRowCount"], "categories": len(result["categoryCounts"])}))


if __name__ == "__main__": main()
