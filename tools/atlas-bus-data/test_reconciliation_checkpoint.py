"""Failure-closed provenance and recovery tests for reconciliation checkpoints."""
import copy
import unittest

from reconciliation_checkpoint import PROJECTION_SCHEMA, create_checkpoint, verify_checkpoint


def fixture():
    projection = {"schema": PROJECTION_SCHEMA, "rows": [
        {"region": "EA", "stopId": "0100A", "identityBridgeValidated": False},
        {"region": "Y", "stopId": "Y0001", "identityBridgeValidated": False},
    ]}
    provenance = {"sourceSnapshotId": "snapshot-primary", "sourceProducerRunId": "38533475680",
        "artifactRestorationRunId": "500", "sourceArtifactName": "primary-source-38533475680",
        "sourceArtifactDigest": "sha256:" + "a" * 64, "repository": "org/repo",
        "preparationCodeCommit": "abc123", "preparedSchema": "v2",
        "sourceWindowBasis": "2026-10-13T00:00:00Z"}
    return create_checkpoint("PRIMARY", projection, provenance)


class ReconciliationCheckpointTests(unittest.TestCase):
    def test_checkpoint_restores_after_later_reconciliation_failure(self):
        bundle = fixture()
        self.assertEqual(verify_checkpoint(bundle, {"side": "PRIMARY", "sourceSnapshotId": "snapshot-primary"})["rowCount"], 2)

    def test_retry_requires_expected_producer_artifact_repository_snapshot_hash_and_compatibility(self):
        bundle = fixture(); manifest = bundle["manifest"]
        expected = {key: manifest[key] for key in ("side", "sourceSnapshotId", "sourceProducerRunId", "sourceArtifactName", "repository", "preparationCodeCommit", "preparedSchema", "canonicalProjectionSha256")}
        self.assertTrue(verify_checkpoint(bundle, expected)["diagnosticOnly"])
        for key, wrong in (("sourceProducerRunId", "999"), ("sourceArtifactName", "wrong"), ("repository", "other/repo"),
                           ("sourceSnapshotId", "wrong-snapshot"), ("preparationCodeCommit", "other-commit"),
                           ("preparedSchema", "v1"), ("canonicalProjectionSha256", "0" * 64)):
            with self.subTest(key=key):
                with self.assertRaisesRegex(ValueError, "mismatch"):
                    verify_checkpoint(bundle, {key: wrong})

    def test_missing_checkpoint_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "manifest is missing"):
            verify_checkpoint({}, {})

    def test_projection_corruption_fails_digest_check(self):
        bundle = fixture(); bundle["projection"]["rows"][0]["stopId"] = "CORRUPT"
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            verify_checkpoint(bundle, {})

    def test_wrong_side_fails_closed(self):
        bundle = fixture()
        with self.assertRaisesRegex(ValueError, "side mismatch"):
            verify_checkpoint(bundle, {"side": "TNDS"})

    def test_partial_regional_rows_are_visible_as_partial_not_promoted(self):
        bundle = fixture()
        self.assertEqual(bundle["manifest"]["regionRowCounts"], {"EA": 1, "Y": 1})

    def test_diagnostic_flags_are_immutable(self):
        bundle = fixture(); bundle["manifest"]["plannerEligible"] = True
        with self.assertRaisesRegex(ValueError, "flags are invalid"):
            verify_checkpoint(bundle, {})

    def test_wrong_projection_schema_is_rejected(self):
        projection = {"schema": "wrong", "rows": []}
        with self.assertRaisesRegex(ValueError, "projection schema"):
            create_checkpoint("TNDS", projection, {})

    def test_missing_provenance_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "provenance missing"):
            create_checkpoint("TNDS", {"schema": PROJECTION_SCHEMA, "rows": []}, {})

    def test_row_count_mismatch_is_rejected(self):
        bundle = fixture(); bundle["manifest"]["rowCount"] += 1
        with self.assertRaisesRegex(ValueError, "row count"):
            verify_checkpoint(bundle, {})


if __name__ == "__main__":
    unittest.main()
