"""Projection fingerprints decouple reusable inputs from downstream code SHAs."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from reconciliation_checkpoint import create_streaming_checkpoint, verify_streaming_checkpoint
from run_reconciliation import validate_checkpoint_lineage

C3 = "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-recoverable-reconciliation"
C1 = "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-region-scale-recovery-closeout"
CURRENT = "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-c1-c1-branch-dispatch-closeout"
R45_C1 = "refs/heads/codex/atlas-bus-data-trust-r45-c1-reconciliation-contract-closeout"
RUN45_FINGERPRINT = "74a75bdb3da404f401521e21bafd430aafb7076e21186e634e615e7878404a66"


def create(root: Path, *, commit: str, fingerprint: str = "a" * 64):
    provenance = {"sourceSnapshotId": "snapshot", "sourceProducerRunId": "7", "sourceArtifactName": "source",
        "repository": "org/repo", "preparationCodeCommit": commit, "checkpointProducerCommit": commit,
        "checkpointProducerRunId": "9", "checkpointBranch": C3, "preparedSchema": "bus-v2",
        "sourceWindowBasis": "2026-10-13", "projectionCompatibilityFingerprint": fingerprint}
    return create_streaming_checkpoint("PRIMARY", [{"region": "EA", "stopId": "A1", "evidenceId": "e1"}],
        provenance, root)


class CheckpointCompatibilityTests(unittest.TestCase):
    def test_same_commit_retry_is_accepted(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); manifest = create(root / "checkpoint", commit="1" * 40)
            self.assertEqual(verify_streaming_checkpoint(root / "checkpoint", {"sourceSnapshotId": "snapshot"})["checkpointProducerCommit"], "1" * 40)
            self.assertEqual(manifest["preparationCodeCommit"], "1" * 40)

    def test_downstream_only_commit_can_reuse_ancestor_checkpoint_with_same_fingerprint(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); repo = root / "repo"; repo.mkdir()
            def git(*args):
                return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()
            git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid")
            (repo / "contract.txt").write_text("projection-v1\n"); git("add", "."); git("commit", "-qm", "producer")
            producer_commit = git("rev-parse", "HEAD")
            checkpoint = create(root / "checkpoint", commit=producer_commit, fingerprint="b" * 64)
            (repo / "report.py").write_text("reconciliation-only-change\n"); git("add", "."); git("commit", "-qm", "downstream fix")
            later_commit = git("rev-parse", "HEAD")
            validate_checkpoint_lineage(checkpoint, branch=C1, commit=later_commit,
                repository="org/repo", repository_root=repo)
            validate_checkpoint_lineage(checkpoint, branch=CURRENT, commit=later_commit,
                repository="org/repo", repository_root=repo)
            validate_checkpoint_lineage(checkpoint, branch=R45_C1, commit=later_commit,
                repository="org/repo", repository_root=repo)
            self.assertEqual(checkpoint["projectionCompatibilityFingerprint"], "b" * 64)
            self.assertEqual(checkpoint["preparationCodeCommit"], producer_commit)
            self.assertNotEqual(producer_commit, later_commit)

    def test_projection_fingerprint_remains_compatible_with_run45_checkpoints(self):
        from reconciliation_projection import projection_compatibility_fingerprint
        self.assertEqual(projection_compatibility_fingerprint(), RUN45_FINGERPRINT)

    def test_projection_change_invalidates_reuse(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); create(root / "checkpoint", commit="1" * 40, fingerprint="a" * 64)
            with self.assertRaisesRegex(ValueError, "projectionCompatibilityFingerprint mismatch"):
                verify_streaming_checkpoint(root / "checkpoint", {"projectionCompatibilityFingerprint": "b" * 64})

    def test_wrong_source_snapshot_and_repository_are_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); create(root / "checkpoint", commit="1" * 40)
            for expected in ({"sourceSnapshotId": "wrong"}, {"repository": "wrong/repo"}):
                with self.subTest(expected=expected), self.assertRaisesRegex(ValueError, "mismatch"):
                    verify_streaming_checkpoint(root / "checkpoint", expected)

    def test_wrong_branch_lineage_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); manifest = create(root / "checkpoint", commit="1" * 40)
            with self.assertRaisesRegex(ValueError, "branch"):
                validate_checkpoint_lineage(manifest, branch="refs/heads/main", commit="1" * 40,
                    repository="org/repo", repository_root=Path(__file__).parents[2])

    def test_corrupt_projection_shard_and_missing_checkpoint_are_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); manifest = create(root / "checkpoint", commit="1" * 40)
            shard = root / "checkpoint" / manifest["shards"][0]["path"]
            shard.write_text('{"region":"EA","stopId":"CORRUPT"}\n')
            with self.assertRaisesRegex(ValueError, "shard digest"):
                verify_streaming_checkpoint(root / "checkpoint", {})
            with self.assertRaisesRegex(ValueError, "manifest is missing"):
                verify_streaming_checkpoint(root / "missing", {})


if __name__ == "__main__":
    unittest.main()
