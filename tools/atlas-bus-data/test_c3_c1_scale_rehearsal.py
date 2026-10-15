"""Multi-stop Run #42-order rehearsal with deterministic bounded comparison shards."""
from __future__ import annotations

import gzip
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from reconciliation_checkpoint import (create_streaming_checkpoint, iter_checkpoint_buckets,
    iter_checkpoint_bucket, stop_comparison_bucket, verify_streaming_checkpoint)
from reconciliation_projection import projection_compatibility_fingerprint
from run_reconciliation import run, PRIMARY_SNAPSHOT, TNDS_SNAPSHOT, CONTROLLED_BRANCHES
from tnds_reconciliation import EXPECTED_REGIONS

RUN_42_COUNTS = {"EA": 5908, "EM": 21798, "NE": 20677, "NW": 41451,
                 "SE": 49450, "SW": 55095, "WM": 32030, "Y": 56278}
RUN_42_TOTAL = 282687
STOPS_PER_SERVICE = 3
PROJECTED_EVIDENCE_PER_SIDE = RUN_42_TOTAL * STOPS_PER_SERVICE


def evidence_rows(prefix):
    """Three scheduled stop references per service, emitted lazily."""
    for region, service_count in RUN_42_COUNTS.items():
        for service_index in range(service_count):
            for stop_index in range(STOPS_PER_SERVICE):
                yield {"region": region, "sourceRegion": region, "serviceIndex": service_index,
                    "stopId": f"{region}-STOP-{stop_index}", "routeNumber": "46",
                    "evidenceId": f"{prefix}-{region}-{service_index:06d}-{stop_index}",
                    "sourceSnapshotId": PRIMARY_SNAPSHOT if prefix == "P" else TNDS_SNAPSHOT,
                    "nativeIds": {"preparedServiceId": f"{prefix}-{region}-{service_index:06d}"},
                    "validFrom": "2026-01-01", "validTo": "2027-01-01"}


def provenance(side, fingerprint, producer_commit):
    common = {"repository": "org/repo", "preparationCodeCommit": producer_commit,
        "checkpointProducerCommit": producer_commit, "checkpointProducerRunId": "42",
        "checkpointBranch": "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-recoverable-reconciliation",
        "sourceWindowBasis": "2026-10-13T00:00:00Z", "projectionCompatibilityFingerprint": fingerprint,
        "regionServiceCounts": RUN_42_COUNTS, "serviceCount": RUN_42_TOTAL}
    if side == "PRIMARY":
        return {**common, "sourceSnapshotId": PRIMARY_SNAPSHOT, "sourceProducerRunId": "38533475680",
            "sourceArtifactName": "atlas-reference-source-snapshot-38533475680", "sourceArtifactId": "11878857366",
            "sourceArtifactDigest": "sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658",
            "preparedSchema": "atlas-prepared-bus-data-v2"}
    return {**common, "sourceSnapshotId": TNDS_SNAPSHOT, "sourceProducerRunId": "38579244547",
        "sourceArtifactName": "atlas-tnds-quarantined-38579244547", "sourceArtifactId": "11903662011",
        "sourceArtifactDigest": "sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e",
        "preparedSchema": "atlas-prepared-bus-tnds-v1"}


class C3C1ScaleRehearsalTests(unittest.TestCase):
    def test_run_42_three_stop_evidence_per_service_is_bounded_and_reconciles_incrementally(self):
        self.assertEqual(sum(RUN_42_COUNTS.values()), RUN_42_TOTAL)
        fingerprint = projection_compatibility_fingerprint()
        producer_commit = "39e142767946aa31ecf0f87544e6d7491ca90297"
        regional = {"schema": "atlas-tnds-region-evidence-v1", "fixtureOnly": False, "regions": {
            region: {"region": region, "acquisitionId": TNDS_SNAPSHOT, "archiveSha256": "a" * 64,
                "sourceBytes": 1, "archiveValidation": "passed", "semanticValidation": "passed",
                "normalizationValidation": "passed", "comparatorState": "COMPARATOR_VALIDATED"}
            for region in EXPECTED_REGIONS}}
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary)
            primary = create_streaming_checkpoint("PRIMARY", evidence_rows("P"),
                provenance("PRIMARY", fingerprint, producer_commit), root / "primary",
                projection_metadata={"primaryCoverage": {"unclassifiedRemainder": 0, "preparationErrorCount": 0}, "controlStops": []})
            tnds = create_streaming_checkpoint("TNDS", evidence_rows("T"),
                provenance("TNDS", fingerprint, producer_commit), root / "tnds",
                projection_metadata={"regionalEvidence": regional})
            self.assertEqual(primary["serviceCount"], RUN_42_TOTAL)
            self.assertEqual(tnds["serviceCount"], RUN_42_TOTAL)
            self.assertEqual(primary["projectedEvidenceCount"], PROJECTED_EVIDENCE_PER_SIDE)
            self.assertEqual(tnds["projectedEvidenceCount"], PROJECTED_EVIDENCE_PER_SIDE)
            self.assertGreater(primary["projectedEvidenceCount"], RUN_42_TOTAL * 2)
            self.assertEqual(primary["comparisonUnitRowTarget"], 25000)
            self.assertGreater(primary["comparisonBucketCount"], 8)
            self.assertGreater(primary["oversizedStopIdentityBucketCount"], 0)
            checked_primary = verify_streaming_checkpoint(root / "primary", {"side": "PRIMARY",
                "sourceSnapshotId": PRIMARY_SNAPSHOT, "projectionCompatibilityFingerprint": fingerprint})
            checked_tnds = verify_streaming_checkpoint(root / "tnds", {"side": "TNDS",
                "sourceSnapshotId": TNDS_SNAPSHOT, "projectionCompatibilityFingerprint": fingerprint})
            p_buckets, t_buckets = set(iter_checkpoint_buckets(checked_primary)), set(iter_checkpoint_buckets(checked_tnds))
            self.assertEqual(p_buckets, t_buckets)
            same_stop_bucket = stop_comparison_bucket("EA", "EA-STOP-0")
            p_rows = list(iter_checkpoint_bucket(root / "primary", checked_primary, "EA", same_stop_bucket))
            t_rows = list(iter_checkpoint_bucket(root / "tnds", checked_tnds, "EA", same_stop_bucket))
            self.assertTrue(p_rows and t_rows)
            self.assertEqual({row["stopId"] for row in p_rows + t_rows}, {"EA-STOP-0"})
            current_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
            summary = run(root / "primary", root / "tnds",
                {"side": "PRIMARY", "sourceSnapshotId": PRIMARY_SNAPSHOT, "sourceProducerRunId": "38533475680",
                 "sourceArtifactName": "atlas-reference-source-snapshot-38533475680", "sourceArtifactId": "11878857366",
                 "sourceArtifactDigest": "sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658",
                 "repository": "org/repo", "preparedSchema": "atlas-prepared-bus-data-v2"},
                {"side": "TNDS", "sourceSnapshotId": TNDS_SNAPSHOT, "sourceProducerRunId": "38579244547",
                 "sourceArtifactName": "atlas-tnds-quarantined-38579244547", "sourceArtifactId": "11903662011",
                 "sourceArtifactDigest": "sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e",
                 "repository": "org/repo", "preparedSchema": "atlas-prepared-bus-tnds-v1"},
                root / "output", producer_run_id="42", branch=next(branch for branch in CONTROLLED_BRANCHES if "c3-c1-" in branch),
                commit=current_commit, repository="org/repo")
            metrics = summary["matchingInstrumentation"]
            self.assertEqual(summary["primaryEvidenceRowCount"], PROJECTED_EVIDENCE_PER_SIDE)
            self.assertEqual(summary["tndsEvidenceRowCount"], PROJECTED_EVIDENCE_PER_SIDE)
            self.assertLessEqual(metrics["maxCombinedComparisonUnitRows"], 25000)
            self.assertEqual(metrics["maxCombinedComparisonUnitRows"], 11816)
            self.assertLessEqual(metrics["maxPrimaryRowsLoadedForComparisonUnit"], 25000)
            self.assertEqual(metrics["maxPrimaryRowsLoadedForComparisonUnit"], 5908)
            self.assertLessEqual(metrics["maxTndsRowsLoadedForComparisonUnit"], 25000)
            self.assertEqual(metrics["maxTndsRowsLoadedForComparisonUnit"], 5908)
            self.assertEqual(metrics["largestStopIdentityBucket"], 112556)
            self.assertEqual(metrics["oversizedStopIdentityBucketCount"], 21)
            self.assertEqual(metrics["candidateComparisons"], 0)
            self.assertGreater(metrics["oversizedStopIdentityBucketCount"], 0)
            self.assertEqual(metrics["ledgerRowsWritten"], summary["ledgerRowsWritten"])
            self.assertEqual(metrics["ledgerIncrementalWriting"], True)
            self.assertIn("one normalized StopPoint identity", metrics["peakLogicalWorkingSetUnit"])
            with gzip.open(root / "output" / "reconciliation-ledger.json.gz", "rt", encoding="utf-8") as stream:
                ledger = json.load(stream)
            self.assertEqual(len(ledger["rows"]), summary["ledgerRowsWritten"])
            oversized = [row for row in ledger["rows"] if row.get("oversizedStopIdentityBucket")]
            self.assertGreater(len(oversized), 0)
            self.assertTrue(all(row["category"] == "AMBIGUOUS_IDENTITY_GROUP" for row in oversized))
            self.assertTrue(all(row["primaryEvidenceCount"] + row["tndsEvidenceCount"] > 25000 for row in oversized))
            self.assertTrue(all(row["sampleLimit"] == 20 for row in oversized))


if __name__ == "__main__":
    unittest.main()
