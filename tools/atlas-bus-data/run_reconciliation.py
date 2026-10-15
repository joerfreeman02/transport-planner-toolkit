"""Stream-verify regional checkpoints and write national diagnostic evidence."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import subprocess
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from reconciliation_checkpoint import (canonical_bytes, iter_checkpoint_region,
                                       verify_streaming_checkpoint, file_sha256)
from reconciliation_projection import build_controls, projection_compatibility_fingerprint
from tnds_reconciliation import EXPECTED_REGIONS, State, _current, reconcile, validate_region_manifest

CONTROLLED_BRANCHES = {
    "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-recoverable-reconciliation",
    "codex/atlas-bus-data-trust-1a-c1b-c3-recoverable-reconciliation",
    "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-region-scale-recovery-closeout",
    "codex/atlas-bus-data-trust-1a-c1b-c3-c1-region-scale-recovery-closeout",
}
PRIMARY_SNAPSHOT = "13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1"
TNDS_SNAPSHOT = "76ee662a30e5bcb0072c93f4dd3a8efe85c41446ca318a1d6f5700070f5bf058"
REFERENCE_SERVICES = ("46", "230", "231", "C")
CONTROL_EVIDENCE_LIMIT = 5000
SAMPLE_LIMIT = 20


def _date_basis(value: Any) -> date:
    if not isinstance(value, str) or not value:
        raise ValueError("Checkpoint source-window basis is missing")
    try:
        return date.fromisoformat(value[:10])
    except ValueError as error:
        raise ValueError("Checkpoint source-window basis is invalid") from error


def _read_metadata(root: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    path = root / "projection-metadata.json"
    if file_sha256(path) != manifest.get("projectionMetadataSha256"):
        raise ValueError("Checkpoint projection metadata changed after verification")
    return json.loads(path.read_text(encoding="utf-8"))


def _assert_commit_ancestor(producer_commit: str, current_commit: str, repository_root: Path) -> None:
    if len(producer_commit) != 40 or len(current_commit) != 40:
        raise ValueError("Checkpoint producer/current commit identity is malformed")
    result = subprocess.run(["git", "merge-base", "--is-ancestor", producer_commit, current_commit],
                            cwd=repository_root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    if result.returncode != 0:
        raise ValueError("Checkpoint producer commit is not an ancestor of this controlled branch commit")


def validate_checkpoint_lineage(manifest: dict[str, Any], *, branch: str, commit: str, repository: str,
                                repository_root: Path) -> None:
    if manifest.get("repository") != repository:
        raise ValueError("Checkpoint repository mismatch")
    if branch not in CONTROLLED_BRANCHES or manifest.get("checkpointBranch") not in CONTROLLED_BRANCHES:
        raise ValueError("Checkpoint branch is outside the controlled C3/C3-C1 lineage")
    if manifest.get("preparationCodeCommit") != manifest.get("checkpointProducerCommit"):
        raise ValueError("Checkpoint preparation and producer commit provenance disagree")
    _assert_commit_ancestor(str(manifest.get("checkpointProducerCommit", "")), commit, repository_root)


def _increment_counter(target: Counter, source: dict[str, Any]) -> None:
    for key, value in source.items():
        if isinstance(value, (int, float)):
            target[key] += value


def _append_bounded(target: list, items: list, limit: int = CONTROL_EVIDENCE_LIMIT) -> None:
    remaining = max(0, limit - len(target))
    if remaining:
        target.extend(items[:remaining])


def _reference_findings(site: dict[str, Any], source_windows: dict[str, Any]) -> list[dict[str, Any]]:
    findings = []
    rows = site.get("reconciliationRows", [])
    for route in REFERENCE_SERVICES:
        p_evidence = [row for row in site.get("primaryServiceEvidence", []) if str(row.get("routeNumber", "")).strip().casefold() == route.casefold()]
        t_evidence = [row for row in site.get("tndsServiceEvidence", []) if str(row.get("routeNumber", "")).strip().casefold() == route.casefold()]
        route_rows = [row for row in rows if (str(row.get("primaryRouteNumber") or row.get("tndsRouteNumber") or "").strip().casefold() == route.casefold()
            or route.casefold() in {str(value).strip().casefold() for value in row.get("primaryRouteNumberSample", []) + row.get("tndsRouteNumberSample", [])})]
        categories = sorted({str(row.get("category")) for row in route_rows})
        if any(category in {"CONFLICTING_CURRENT_EVIDENCE", "SOURCE_WINDOW_DIFFERENCE"} for category in categories):
            state = "SOURCE_WINDOW_DIFFERENCE" if "SOURCE_WINDOW_DIFFERENCE" in categories else "CONFLICTING_EVIDENCE"
        elif any(category in {"AMBIGUOUS", "AMBIGUOUS_IDENTITY_GROUP", "STRONG_COMPOSITE_CANDIDATE"} for category in categories):
            state = "UNRESOLVED_CANDIDATE"
        elif p_evidence and t_evidence:
            state = "EVIDENCED_PRIMARY_AND_TNDS"
        elif p_evidence:
            state = "EVIDENCED_PRIMARY_ONLY"
        elif t_evidence:
            state = "EVIDENCED_TNDS_ONLY"
        else:
            state = "NOT_EVIDENCED_IN_FROZEN_SOURCE_WINDOW"
        findings.append({"referenceService": route, "state": state,
            "primaryEvidenceIds": sorted(str(row.get("evidenceId")) for row in p_evidence if row.get("evidenceId"))[:50],
            "tndsEvidenceIds": sorted(str(row.get("evidenceId")) for row in t_evidence if row.get("evidenceId"))[:50],
            "reconciliationCategories": categories, "sourceWindows": source_windows,
            "explanation": ("No matching evidence row was found in either verified frozen source window; this does not assert that the service does not exist."
                if state == "NOT_EVIDENCED_IN_FROZEN_SOURCE_WINDOW" else
                "Finding is derived from verified frozen-window source rows and reconciliation categories; appearance in both sources alone does not assert exact service identity."),
            "diagnosticOnly": True, "plannerEligible": False})
    return findings


def run(primary_path: Path, tnds_path: Path, primary_expected: dict, tnds_expected: dict,
        output: Path, *, producer_run_id: str, branch: str, commit: str, repository: str) -> dict:
    primary_path, tnds_path = primary_path.resolve(), tnds_path.resolve()
    if not primary_path.is_dir() or not tnds_path.is_dir():
        raise ValueError("C3-C1 requires sharded checkpoint directories; monolithic checkpoint bundles are unsupported")
    if branch not in CONTROLLED_BRANCHES:
        raise ValueError("Checkpoint retry branch is outside the controlled C3/C3-C1 lineage")
    fingerprint = projection_compatibility_fingerprint()
    primary_expected = {**primary_expected, "projectionCompatibilityFingerprint": fingerprint}
    tnds_expected = {**tnds_expected, "projectionCompatibilityFingerprint": fingerprint}
    primary_manifest = verify_streaming_checkpoint(primary_path, primary_expected)
    tnds_manifest = verify_streaming_checkpoint(tnds_path, tnds_expected)
    for manifest in (primary_manifest, tnds_manifest):
        if manifest.get("checkpointProducerRunId") != str(producer_run_id):
            raise ValueError("Checkpoint producer run mismatch")
        validate_checkpoint_lineage(manifest, branch=branch, commit=commit,
                                    repository=repository, repository_root=Path.cwd())
    if primary_manifest.get("sourceSnapshotId") != PRIMARY_SNAPSHOT:
        raise ValueError("Primary checkpoint source snapshot mismatch")
    if tnds_manifest.get("sourceSnapshotId") != TNDS_SNAPSHOT:
        raise ValueError("TNDS checkpoint source snapshot mismatch")
    p_meta, t_meta = _read_metadata(primary_path, primary_manifest), _read_metadata(tnds_path, tnds_manifest)
    regional = t_meta.get("regionalEvidence")
    if not isinstance(regional, dict) or regional.get("fixtureOnly") is not False:
        raise ValueError("Live TNDS regional evidence is missing or fixture-only")
    coverage = validate_region_manifest(regional)
    if coverage["state"] != "NATIONAL_COMPLETE":
        raise ValueError("TNDS comparator is partial; national reconciliation is prohibited")
    primary_coverage = p_meta.get("primaryCoverage")
    if not isinstance(primary_coverage, dict) or primary_coverage.get("unclassifiedRemainder") != 0 or primary_coverage.get("preparationErrorCount") != 0:
        raise ValueError("Primary coverage ledger is missing, incomplete, or has preparation errors")
    primary_day, tnds_day = _date_basis(primary_manifest["sourceWindowBasis"]), _date_basis(tnds_manifest["sourceWindowBasis"])
    as_of = min(primary_day, tnds_day)
    source_windows = {"primary": primary_manifest["sourceWindowBasis"], "tnds": tnds_manifest["sourceWindowBasis"],
        "reconciliationAsOf": as_of.isoformat(), "asOfRule": "earliest date in the two immutable source-window bases",
        "mismatch": primary_day != tnds_day}
    output.mkdir(parents=True, exist_ok=True)
    counts: Counter[str] = Counter()
    regional_counts: dict[str, Counter] = {region: Counter() for region in (*EXPECTED_REGIONS, "LONDON")}
    matching: Counter = Counter()
    unresolved_records = p_meta.get("unresolvedPrimaryIdentityRecords", [])
    unresolved_by_region: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in unresolved_records:
        unresolved_by_region[str(item.get("region", ""))].append(item)
    unresolved_counts = Counter()
    unresolved_unique_matches: set[tuple[str, str]] = set()
    unresolved_unique_keys = {(str(item.get("region", "")), str(item.get("gtfsStopId", "")))
                              for item in unresolved_records if item.get("gtfsStopId")}
    maximum_rows_loaded = 0
    maximum_candidate_bucket = 0
    ledger_rows = 0
    ledger_row_digest = hashlib.sha256()
    samples_by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    samples_by_region: dict[str, list[dict[str, Any]]] = defaultdict(list)
    control_stops = p_meta.get("controlStops", [])
    controls = build_controls(None, [], [], control_stops)
    for site in controls.values():
        site.update({"primaryServiceEvidence": [], "tndsServiceEvidence": [], "reconciliationRows": [],
                     "exactCorroboratedEvidence": [], "primaryOnlyEvidence": [], "tndsOnlyCandidates": [],
                     "conflicts": [], "sourceWindowDifferences": [], "ambiguousEvidence": []})
    ledger_path = output / "reconciliation-ledger.json.gz"
    with ledger_path.open("wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", compresslevel=6, mtime=0) as compressed:
        compressed.write(b'{"schema":"atlas-tnds-reconciliation-ledger-c3c1-v1","asOf":')
        compressed.write(json.dumps(as_of.isoformat()).encode())
        compressed.write(b',"regionalCoverage":')
        compressed.write(canonical_bytes(coverage))
        compressed.write(b',"rows":[')
        first = True
        for region in (*EXPECTED_REGIONS, "LONDON"):
            primary_rows = list(iter_checkpoint_region(primary_path, primary_manifest, region))
            tnds_rows = list(iter_checkpoint_region(tnds_path, tnds_manifest, region))
            maximum_rows_loaded = max(maximum_rows_loaded, len(primary_rows) + len(tnds_rows))
            result = reconcile(primary_rows, tnds_rows, as_of=as_of.isoformat(),
                tnds_status=State.COMPARATOR_VALIDATED, region_manifest=regional)
            for row in result["rows"]:
                if not first: compressed.write(b",")
                first = False
                encoded = canonical_bytes(row)
                compressed.write(encoded)
                ledger_row_digest.update(encoded + b"\n")
                ledger_rows += 1
                counts[row["category"]] += 1
                regional_counts[row["region"]][row["category"]] += 1
                if len(samples_by_category[row["category"]]) < SAMPLE_LIMIT:
                    samples_by_category[row["category"]].append(row)
                if len(samples_by_region[row["region"]]) < SAMPLE_LIMIT:
                    samples_by_region[row["region"]].append(row)
                maximum_candidate_bucket = max(maximum_candidate_bucket,
                    int(result["matchingInstrumentation"].get("maxCandidateBucketSize", 0)))
            _increment_counter(matching, result["matchingInstrumentation"])
            # Capture only site rows and retain a hard cap per control report.
            regional_controls = build_controls(None,
                [row for row in primary_rows if _current(row, as_of)],
                [row for row in tnds_rows if _current(row, as_of)], control_stops)
            for name, site in controls.items():
                add = regional_controls[name]
                for key in ("primaryServiceEvidence", "tndsServiceEvidence"):
                    _append_bounded(site[key], add[key])
                stop_ids = {item["stopId"] for item in site["nearbyStops"]}
                site_rows = [row for row in result["rows"] if row.get("primaryStopId") in stop_ids or row.get("tndsStopId") in stop_ids]
                _append_bounded(site["reconciliationRows"], site_rows)
                _append_bounded(site["exactCorroboratedEvidence"], [row for row in site_rows if row.get("identityCorroborated") is True])
                _append_bounded(site["primaryOnlyEvidence"], [row for row in site_rows if row.get("category") == "PRIMARY_ONLY"])
                _append_bounded(site["tndsOnlyCandidates"], [row for row in site_rows if row.get("category") == "TNDS_ONLY_CANDIDATE"])
                _append_bounded(site["conflicts"], [row for row in site_rows if row.get("category") == "CONFLICTING_CURRENT_EVIDENCE"])
                _append_bounded(site["sourceWindowDifferences"], [row for row in site_rows if row.get("category") == "SOURCE_WINDOW_DIFFERENCE"])
                _append_bounded(site["ambiguousEvidence"], [row for row in site_rows if row.get("category") in {"AMBIGUOUS", "AMBIGUOUS_IDENTITY_GROUP"}])
            # Raw unresolved StopPoint references are compared only within their source region.
            tnds_stops = {str(row.get("stopId", "")) for row in tnds_rows}
            unresolved = unresolved_by_region.get(region, [])
            unresolved_counts["calls"] += len(unresolved)
            unresolved_counts["exactRegionScopedMatches"] += sum(1 for item in unresolved
                if item.get("gtfsStopId") and str(item["gtfsStopId"]) in tnds_stops)
            unresolved_unique_matches.update((region, str(item["gtfsStopId"])) for item in unresolved
                if item.get("gtfsStopId") and str(item["gtfsStopId"]) in tnds_stops)
        compressed.write(b']}')
    ledger_file_sha = file_sha256(ledger_path)
    counts_out = dict(sorted(counts.items()))
    regional_summary = {region: dict(sorted(regional_counts[region].items())) for region in (*EXPECTED_REGIONS, "LONDON")}
    unresolved_summary = {"schema": "atlas-primary-unresolved-reconciliation-summary-v2",
        "snapshotId": primary_manifest["sourceSnapshotId"], "sourceWindow": primary_manifest["sourceWindowBasis"],
        "unresolvedScheduledCallCount": unresolved_counts["calls"],
        "uniqueRawGtfsStopIdentityCount": len({str(item.get("gtfsStopId")) for item in unresolved_records if item.get("gtfsStopId")}),
        "uniqueRouteCount": len({str(item.get("routeId")) for item in unresolved_records if item.get("routeId")}),
        "uniqueOperatorCount": None, "operatorLineageStatus": "NOT_PRESENT_IN_COVERAGE_LEDGER_UNRESOLVED_RECORDS",
        "countsByRegion": dict(sorted(Counter(str(item.get("region", "unknown")) for item in unresolved_records).items())),
        "exactRegionScopedTndsStopReferenceCount": unresolved_counts["exactRegionScopedMatches"],
        "exactRegionScopedTndsStopReferenceUniqueIdentityCount": len(unresolved_unique_matches),
        "tndsAbsentUniqueGtfsStopIdentityCount": len(unresolved_unique_keys - unresolved_unique_matches),
        "regionScopeRule": "raw GTFS stop identity must match a TNDS stop ID in the same canonical comparator region",
        "exactServiceIdentityCorroborationCount": 0, "strongCompositeCandidateCount": None,
        "ambiguousIdentityCount": None, "lineageInsufficientCount": sum(1 for item in unresolved_records
            if not item.get("tripId") or not item.get("routeId") or not item.get("gtfsStopId")),
        "lineageStatus": "EXACT_REGION_SCOPED_RAW_STOP_REFERENCES_ONLY_NO_PLANNER_JOIN",
        "candidateAssessmentStatus": "RAW_STOP_REFERENCE_ONLY_NO_PLANNER_JOIN",
        "fuzzyMatchingUsed": False, "resolverChanged": False, "diagnosticOnly": True}
    for site in controls.values():
        site["unresolvedPrimaryIdentityEvidence"] = [item for item in unresolved_records
            if str(item.get("gtfsStopId", "")) in {stop["stopId"] for stop in site["nearbyStops"]}][:CONTROL_EVIDENCE_LIMIT]
        site["unresolvedPrimaryIdentityCount"] = len(site["unresolvedPrimaryIdentityEvidence"])
        site["primaryCoverage"] = primary_coverage
        site["tndsRegionalCoverage"] = coverage
        site["sourceWindows"] = source_windows
        site.pop("evidenceCompleteForSite", None)
        site["sourceInventoriesStructurallyComplete"] = bool(primary_coverage.get("unclassifiedRemainder") == 0 and primary_coverage.get("preparationErrorCount") == 0)
        site["comparatorNationalCoverageComplete"] = coverage["state"] == "NATIONAL_COMPLETE"
        site["siteEvidenceReviewStatus"] = "EVIDENCE_COMPILED_MANUAL_REVIEW_REQUIRED"
        site["manualAcceptancePending"] = True
        site["controlEvidenceLimit"] = CONTROL_EVIDENCE_LIMIT
        site["referenceServiceFindings"] = _reference_findings(site, source_windows) if site["site"].startswith("Pipers") else []
        site["assessmentNote"] = "Evidence derives from the verified frozen source windows. Unresolved calls retain raw GTFS identities; no resolver or planner StopPoint join is made."
    matching["maxProjectionRowsLoadedSimultaneously"] = maximum_rows_loaded
    matching["maxReconciliationCandidateBucketSize"] = maximum_candidate_bucket
    matching["ledgerRowsWritten"] = ledger_rows
    matching["primaryInputServices"] = primary_manifest["inputServiceCount"]
    matching["tndsInputServices"] = tnds_manifest["inputServiceCount"]
    matching["primaryProjectedEvidenceCount"] = primary_manifest["projectedEvidenceCount"]
    matching["tndsProjectedEvidenceCount"] = tnds_manifest["projectedEvidenceCount"]
    matching["primaryProjectionShardCount"] = primary_manifest["projectionShardCount"]
    matching["tndsProjectionShardCount"] = tnds_manifest["projectionShardCount"]
    matching["primaryRegionEvidenceCounts"] = primary_manifest["regionEvidenceCounts"]
    matching["tndsRegionEvidenceCounts"] = tnds_manifest["regionEvidenceCounts"]
    matching["peakLogicalWorkingSetUnit"] = "one canonical region from each checkpoint plus one prepared input shard during projection"
    summary = {"schema": "atlas-tnds-reconciliation-summary-c4-v1", "asOf": as_of.isoformat(),
        "asOfBasis": source_windows, "sourceSnapshots": {"primary": primary_manifest["sourceSnapshotId"], "tnds": tnds_manifest["sourceSnapshotId"]},
        "primaryEvidenceRowCount": primary_manifest["evidenceRowCount"], "tndsEvidenceRowCount": tnds_manifest["evidenceRowCount"],
        "primaryServiceCount": primary_manifest["serviceCount"], "tndsServiceCount": tnds_manifest["serviceCount"],
        "categoryCounts": counts_out, "regionalCoverage": coverage, "matchingInstrumentation": dict(matching),
        "ledgerRowsWritten": ledger_rows, "ledgerRowsSha256": ledger_row_digest.hexdigest(), "compressedLedgerSha256": ledger_file_sha,
        "diagnosticOnly": True, "plannerEligible": False, "plannerOutputChanged": False,
        "sourceAuthorityChanged": False, "publicationEligible": False, "publicationAttempted": False, "deploymentAttempted": False}
    samples = {"byCategory": dict(samples_by_category), "byRegion": dict(samples_by_region), "controls": {}}
    for name, site in controls.items():
        samples["controls"][name] = {"nearbyStops": site["nearbyStops"][:30],
            "primaryServiceEvidence": site["primaryServiceEvidence"][:30], "tndsServiceEvidence": site["tndsServiceEvidence"][:30],
            "referenceServiceFindings": site.get("referenceServiceFindings", [])}
    outputs = {
        "reconciliation-summary.json": summary,
        "reconciliation-category-counts.json": {"counts": counts_out, "ledgerRowsSha256": summary["ledgerRowsSha256"]},
        "reconciliation-regional-summary.json": {"regions": regional_summary, "coverage": coverage},
        "unresolved-primary-summary.json": unresolved_summary,
        "pipers-lane-control.json": controls["pipersLane"],
        "peterborough-queensgate-control.json": controls["peterboroughQueensgate"],
        "primary-checkpoint-manifest.json": primary_manifest,
        "tnds-checkpoint-manifest.json": tnds_manifest,
        "run-evidence.json": {"schema": "atlas-bus-reconciliation-run-evidence-v2", "producerRunId": str(producer_run_id),
            "repository": repository, "branch": branch, "commit": commit,
            "inputCheckpointHashes": {"primary": primary_manifest["aggregateProjectionSha256"], "tnds": tnds_manifest["aggregateProjectionSha256"]},
            "sourceWindows": source_windows, "diagnosticOnly": True, "plannerEligible": False,
            "plannerOutputChanged": False, "sourceAuthorityChanged": False, "publicationAttempted": False, "deploymentAttempted": False},
        "reconciliation-samples.json": samples,
    }
    for filename, value in outputs.items():
        (output / filename).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
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
    print(json.dumps({"asOf": result["asOf"], "primaryRows": result["primaryEvidenceRowCount"],
                      "tndsRows": result["tndsEvidenceRowCount"], "categories": len(result["categoryCounts"])}))


if __name__ == "__main__": main()
