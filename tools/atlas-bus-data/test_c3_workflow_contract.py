"""C3 browser-dispatch and recoverable preparation workflow contracts."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[2]
DISPATCH = (ROOT / ".github/workflows/atlas-bus-data-refresh.yml").read_text(encoding="utf-8")
TNDS = (ROOT / ".github/workflows/atlas-bus-tnds-trust-diagnostic.yml").read_text(encoding="utf-8")
PRIMARY = (ROOT / ".github/workflows/atlas-reference-data-diagnostic.yml").read_text(encoding="utf-8")
RECONCILE = (ROOT / ".github/workflows/atlas-bus-data-c3-reconcile.yml").read_text(encoding="utf-8")
BRANCH = "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-recoverable-reconciliation"
C1_BRANCH = "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-region-scale-recovery-closeout"


def block(text, name):
    match = re.search(rf"(?ms)^  {re.escape(name)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\s*$|\Z)", text)
    if not match: raise AssertionError(f"Missing workflow job {name}")
    return match.group(1)


class C3WorkflowContractTests(unittest.TestCase):
    def test_exact_branch_dispatch_uses_only_the_four_default_branch_controls(self):
        selector = DISPATCH.split("- name: Resolve exact-branch TRUST browser selector", 1)[1].split("- name: Record safe execution mode", 1)[0]
        self.assertIn(f"TRUST_BRANCH_C3: {BRANCH}", selector)
        self.assertIn(f"TRUST_BRANCH_C3_C1: {C1_BRANCH}", selector)
        self.assertNotIn("v2_", selector)
        for mode in ("offline_preflight", "c3_live_trust", "c3_checkpoint_retry"):
            self.assertIn(f"trust_mode={mode}", selector)
        self.assertIn("38579244547", selector)
        self.assertIn("=~ ^[0-9]+$", selector)
        self.assertIn("Invalid C3 selection", selector)

    def test_primary_and_tnds_preparations_are_independent_frozen_restores(self):
        source = block(DISPATCH, "c3-primary-source")
        primary = block(DISPATCH, "c3-primary-preparation")
        tnds = block(DISPATCH, "tnds-trust-browser-live")
        self.assertIn("38533475680", source)
        self.assertIn("13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1", source)
        self.assertIn("38579244547", DISPATCH)
        self.assertIn("TNDS_USERNAME: ''", tnds)
        self.assertIn("TNDS_PASSWORD: ''", tnds)
        self.assertIn("atlas-primary-reconciliation-checkpoint-${{ github.run_id }}", PRIMARY)
        self.assertIn("atlas-tnds-reconciliation-checkpoint-${{ github.run_id }}", TNDS)
        self.assertIn("expected_artifact_id: '11878857366'", DISPATCH)
        self.assertIn("expected_raw_artifact_id: '11903662011'", DISPATCH)
        self.assertIn("01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658", DISPATCH)
        self.assertIn("7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e", DISPATCH)
        self.assertIn("76ee662a30e5bcb0072c93f4dd3a8efe85c41446ca318a1d6f5700070f5bf058", RECONCILE)
        self.assertIn("76ee662a30e5bcb0072c93f4dd3a8efe85c41446ca318a1d6f5700070f5bf058", RECONCILE)
        self.assertIn("Verify exact raw TNDS artifact ID and digest", TNDS)
        self.assertIn("Verify exact frozen-source artifact ID and digest", Path(ROOT / ".github/workflows/atlas-reference-data-source.yml").read_text())
        self.assertIn("coverage_ledger_path='pages-site/diagnostic-output/coverage-ledger.json'", PRIMARY)
        self.assertIn("RUN_42_EXPECTED_COUNTS", Path(ROOT / "tools/atlas-bus-data/tnds_trust_diagnostic.py").read_text())
        self.assertNotIn("freshness", primary)

    def test_live_reconciliation_waits_for_both_checkpoint_producers(self):
        job = block(DISPATCH, "c3-live-reconciliation")
        self.assertIn("tnds-trust-browser-live", job)
        self.assertIn("c3-primary-preparation", job)
        self.assertIn("atlas-bus-data-c3-reconcile.yml", job)
        self.assertIn("checkpoint_run_id: ${{ github.run_id }}", job)

    def test_retry_only_restores_artifacts_and_checks_producer_before_download(self):
        retry = block(DISPATCH, "c3-checkpoint-retry")
        self.assertIn("atlas-bus-data-c3-reconcile.yml", retry)
        self.assertNotIn("atlas-reference-data-source.yml", retry)
        self.assertNotIn("atlas-bus-tnds-trust-diagnostic.yml", retry)
        verification = RECONCILE.split("- name: Verify checkpoint producer run", 1)[1].split("- name: Restore primary checkpoint", 1)[0]
        self.assertIn("head_branch", verification)
        self.assertIn("head_sha", verification)
        self.assertIn("merge-base', '--is-ancestor", verification)
        self.assertIn("CONTROLLED_BRANCHES", verification)
        self.assertIn("merge-base', '--is-ancestor", verification)
        self.assertIn("CONTROLLED_BRANCHES", verification)
        self.assertIn("required <= available", verification)
        self.assertLess(RECONCILE.index("Verify checkpoint producer run"), RECONCILE.index("Restore primary checkpoint"))

    def test_reconciler_uploads_full_compressed_ledger_and_diagnostic_reports(self):
        for name in ("reconciliation-summary.json", "reconciliation-category-counts.json", "reconciliation-regional-summary.json",
                     "reconciliation-ledger.json.gz", "unresolved-primary-summary.json", "pipers-lane-control.json",
                     "peterborough-queensgate-control.json", "primary-checkpoint-manifest.json",
                     "tnds-checkpoint-manifest.json", "run-evidence.json"):
            self.assertIn(name, Path(ROOT / "tools/atlas-bus-data/run_reconciliation.py").read_text())
        self.assertIn('"plannerOutputChanged": False', Path(ROOT / "tools/atlas-bus-data/run_reconciliation.py").read_text())

    def test_checkpoint_uses_shards_streaming_and_projection_fingerprint(self):
        checkpoint = Path(ROOT / "tools/atlas-bus-data/reconciliation_checkpoint.py").read_text()
        runner = Path(ROOT / "tools/atlas-bus-data/run_reconciliation.py").read_text()
        self.assertIn("projectionCompatibilityFingerprint", checkpoint)
        self.assertIn("file_sha256(path)", checkpoint)
        self.assertIn("iter_checkpoint_region", runner)
        self.assertIn("gzip.GzipFile", runner)
        self.assertNotIn("json.dumps(ledger", runner)
        self.assertIn("referenceServiceFindings", runner)
        self.assertIn("manualAcceptancePending", runner)

    def test_checkpoint_uses_shards_streaming_and_projection_fingerprint(self):
        checkpoint = Path(ROOT / "tools/atlas-bus-data/reconciliation_checkpoint.py").read_text()
        runner = Path(ROOT / "tools/atlas-bus-data/run_reconciliation.py").read_text()
        self.assertIn("projectionCompatibilityFingerprint", checkpoint)
        self.assertIn("file_sha256(path)", checkpoint)
        self.assertIn("iter_checkpoint_region", runner)
        self.assertIn("gzip.GzipFile", runner)
        self.assertNotIn("json.dumps(ledger", runner)
        self.assertIn("referenceServiceFindings", runner)
        self.assertIn("manualAcceptancePending", runner)


if __name__ == "__main__": unittest.main()
