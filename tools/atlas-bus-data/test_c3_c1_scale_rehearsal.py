"""Run #42-order cardinality rehearsal with lazy rows and regional stream shards."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
import subprocess

from reconciliation_checkpoint import create_streaming_checkpoint, verify_streaming_checkpoint
from reconciliation_projection import projection_compatibility_fingerprint
from run_reconciliation import run, PRIMARY_SNAPSHOT, TNDS_SNAPSHOT, CONTROLLED_BRANCHES
from tnds_reconciliation import EXPECTED_REGIONS

RUN_42_COUNTS = {"EA": 5908, "EM": 21798, "NE": 20677, "NW": 41451,
                 "SE": 49450, "SW": 55095, "WM": 32030, "Y": 56278}
RUN_42_TOTAL = 282687


def evidence_rows():
    for region, service_count in RUN_42_COUNTS.items():
        for service_index in range(service_count):
            # One compact stop-evidence row per service is a strict lower bound;
            # it exercises the known regional service cardinalities lazily.
            yield {"region": region, "serviceIndex": service_index,
                   "stopId": f"{region}{service_index:06d}",
                   "evidenceId": f"synthetic-{region}-{service_index:06d}"}


class C3C1ScaleRehearsalTests(unittest.TestCase):
    def test_run_42_service_order_streams_and_hashes_deterministically(self):
        self.assertEqual(sum(RUN_42_COUNTS.values()), RUN_42_TOTAL)
        provenance = {"sourceSnapshotId": "synthetic-primary", "sourceProducerRunId": "1",
            "sourceArtifactName": "synthetic", "repository": "test/repo", "preparationCodeCommit": "a" * 40,
            "checkpointProducerCommit": "a" * 40, "checkpointProducerRunId": "2",
            "checkpointBranch": "refs/heads/c3", "preparedSchema": "synthetic-v2",
            "sourceWindowBasis": "2026-10-13", "projectionCompatibilityFingerprint": "c" * 64,
            "serviceCount": RUN_42_TOTAL, "regionServiceCounts": RUN_42_COUNTS}
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary)
            first = create_streaming_checkpoint("PRIMARY", evidence_rows(), provenance, root / "first")
            second = create_streaming_checkpoint("PRIMARY", evidence_rows(), provenance, root / "second")
            self.assertEqual(first["serviceCount"], RUN_42_TOTAL)
            self.assertEqual(first["projectedEvidenceCount"], RUN_42_TOTAL)
            self.assertEqual(first["regionServiceCounts"], RUN_42_COUNTS)
            self.assertEqual(first["projectionShardCount"], 8)
            self.assertEqual(first["maximumProjectionRowsLoadedSimultaneously"], 1)
            self.assertTrue(first["incrementalHashing"])
            self.assertTrue(first["incrementalProjectionWriting"])
            self.assertEqual(first["aggregateProjectionSha256"], second["aggregateProjectionSha256"])
            verified = verify_streaming_checkpoint(root / "first", {"side": "PRIMARY",
                "sourceSnapshotId": "synthetic-primary", "projectionCompatibilityFingerprint": "c" * 64})
            self.assertEqual(verified["evidenceRowCount"], RUN_42_TOTAL)

    def test_full_checkpoint_to_incremental_ledger_rehearses_all_run_42_regional_counts(self):
        fingerprint = projection_compatibility_fingerprint()
        producer_commit = "39e142767946aa31ecf0f87544e6d7491ca90297"
        base = {"repository": "org/repo", "preparationCodeCommit": producer_commit,
            "checkpointProducerCommit": producer_commit, "checkpointProducerRunId": "42",
            "checkpointBranch": "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-recoverable-reconciliation",
            "sourceWindowBasis": "2026-10-13T00:00:00Z", "projectionCompatibilityFingerprint": fingerprint,
            "regionServiceCounts": RUN_42_COUNTS, "serviceCount": RUN_42_TOTAL}
        primary_provenance = {**base, "sourceSnapshotId": PRIMARY_SNAPSHOT, "sourceProducerRunId": "38533475680",
            "sourceArtifactName": "atlas-reference-source-snapshot-38533475680", "sourceArtifactId": "11878857366",
            "sourceArtifactDigest": "sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658",
            "preparedSchema": "atlas-prepared-bus-data-v2"}
        tnds_provenance = {**base, "sourceSnapshotId": TNDS_SNAPSHOT, "sourceProducerRunId": "38579244547",
            "sourceArtifactName": "atlas-tnds-quarantined-38579244547", "sourceArtifactId": "11903662011",
            "sourceArtifactDigest": "sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e",
            "preparedSchema": "atlas-prepared-bus-tnds-v1"}
        regional = {"schema": "atlas-tnds-region-evidence-v1", "fixtureOnly": False, "regions": {
            region: {"region": region, "acquisitionId": TNDS_SNAPSHOT, "archiveSha256": "a" * 64,
                "sourceBytes": 1, "archiveValidation": "passed", "semanticValidation": "passed",
                "normalizationValidation": "passed", "comparatorState": "COMPARATOR_VALIDATED"}
            for region in EXPECTED_REGIONS}}
        def rows(prefix):
            for region, count in RUN_42_COUNTS.items():
                for index in range(count):
                    yield {"region": region, "sourceRegion": region, "stopId": f"{prefix}{region}{index:06d}",
                        "routeNumber": "46", "evidenceId": f"{prefix}{region}-{index:06d}",
                        "sourceSnapshotId": PRIMARY_SNAPSHOT if prefix == "P" else TNDS_SNAPSHOT,
                        "nativeIds": {"prepared": f"{prefix}{index}"}, "validFrom": "2026-01-01", "validTo": "2027-01-01"}
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary)
            create_streaming_checkpoint("PRIMARY", rows("P"), primary_provenance, root / "primary",
                projection_metadata={"primaryCoverage": {"unclassifiedRemainder": 0, "preparationErrorCount": 0}, "controlStops": []})
            create_streaming_checkpoint("TNDS", rows("T"), tnds_provenance, root / "tnds",
                projection_metadata={"regionalEvidence": regional})
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
            self.assertEqual(summary["primaryServiceCount"], RUN_42_TOTAL)
            self.assertEqual(summary["tndsServiceCount"], RUN_42_TOTAL)
            self.assertEqual(summary["ledgerRowsWritten"], RUN_42_TOTAL * 2)
            self.assertEqual(summary["matchingInstrumentation"]["candidateComparisons"], 0)
            self.assertLessEqual(summary["matchingInstrumentation"]["maxProjectionRowsLoadedSimultaneously"],
                max(RUN_42_COUNTS.values()) * 2)
            self.assertEqual(summary["matchingInstrumentation"]["peakLogicalWorkingSetUnit"],
                "one canonical region from each checkpoint plus one prepared input shard during projection")


if __name__ == "__main__":
    unittest.main()
