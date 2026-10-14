"""Static contracts for the manual-dispatcher TNDS TRUST safety gate."""
import unittest
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[2]
DISPATCHER = ROOT / ".github/workflows/atlas-bus-data-refresh.yml"
CALLEE = ROOT / ".github/workflows/atlas-bus-tnds-trust-diagnostic.yml"
DRIVER = ROOT / "tools/atlas-bus-data/tnds_trust_diagnostic.py"


class TndsWorkflowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dispatcher = DISPATCHER.read_text(encoding="utf-8")
        cls.workflow = CALLEE.read_text(encoding="utf-8")
        cls.driver = DRIVER.read_text(encoding="utf-8")

    def test_default_manual_dispatcher_selects_only_two_exact_trust_modes(self):
        self.assertRegex(self.dispatcher, r"(?m)^  workflow_dispatch:\s*$")
        self.assertIn("TNDS-TRUST-DIAGNOSTIC-C1A", self.dispatcher)
        self.assertIn("TNDS-TRUST-PREFLIGHT-C1B", self.dispatcher)
        self.assertIn("startsWith(inputs.v2_expected_snapshot_id, 'TNDS-TRUST-')", self.dispatcher)
        self.assertIn("Unrecognized TNDS TRUST selector", self.dispatcher)
        self.assertLess(self.dispatcher.index("Refuse malformed TNDS TRUST selector"), self.dispatcher.index("  reference-source:"))
        approved = {"TNDS-TRUST-PREFLIGHT-C1B", "TNDS-TRUST-DIAGNOSTIC-C1A"}
        for typo in ("TNDS-TRUST-PREFLIGHT-C1A", "TNDS-TRUST-PREFLIGHT-C1", "TNDS-TRUST-DIAGNOSTIC-C1", "TNDS-TRUST-DIAGNOSITC-C1A"):
            self.assertTrue(typo.startswith("TNDS-TRUST-") and typo not in approved)
        for job in ("tnds-trust-offline-preflight", "tnds-trust-live-diagnostic"):
            self.assertIn(f"  {job}:", self.dispatcher)
            self.assertIn("uses: ./.github/workflows/atlas-bus-tnds-trust-diagnostic.yml", self.dispatcher)
        self.assertIn("inputs.v2_expected_snapshot_id != 'TNDS-TRUST-DIAGNOSTIC-C1A'", self.dispatcher)
        self.assertIn("inputs.v2_expected_snapshot_id != 'TNDS-TRUST-PREFLIGHT-C1B'", self.dispatcher)
        self.assertIn("inputs.v2_source_snapshot_run_id == ''", self.dispatcher)
        self.assertIn("normal expected snapshot ID is valid only with an explicit frozen source producer run ID", self.dispatcher)

    def test_default_branch_contains_dispatcher_but_not_feature_callee(self):
        dispatcher = subprocess.run(["git", "show", "origin/main:.github/workflows/atlas-bus-data-refresh.yml"],
                                    cwd=ROOT, check=True, capture_output=True, text=True).stdout
        callee = subprocess.run(["git", "show", "origin/main:.github/workflows/atlas-bus-tnds-trust-diagnostic.yml"],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertIn("name: ATLAS Bus data refresh", dispatcher)
        self.assertNotEqual(callee.returncode, 0)

    def test_offline_preflight_checks_out_selected_branch_and_has_zero_acquisition_authority(self):
        offline = self.workflow.split("  offline-preflight:", 1)[1].split("  live-raw-and-prepare:", 1)[0]
        self.assertIn("if: inputs.mode == 'offline_preflight'", offline)
        self.assertIn("ref: ${{ github.sha }}", offline)
        self.assertIn("actions/setup-python@v5", offline)
        self.assertIn("actions/setup-node@v4", offline)
        self.assertIn("python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v", offline)
        self.assertIn("node tests/atlas/run-all.mjs", offline)
        self.assertIn("ATLAS Alpha.15 deterministic suite passed.", offline)
        for forbidden in ("TNDS_USERNAME", "TNDS_PASSWORD", "tnds_capability_probe.py", "tnds_trust_diagnostic.py",
                          "retrbinary", "RETR", "refresh_bus_data.py", "upload-pages-artifact", "deploy-pages"):
            self.assertNotIn(forbidden, offline)
        self.assertIn("'tndsSecretsInjected': False", offline)
        self.assertIn("'retrievalPerformed': False", offline)
        caller_offline = self.dispatcher.split("  tnds-trust-offline-preflight:", 1)[1].split("  tnds-trust-live-diagnostic:", 1)[0]
        self.assertNotIn("secrets:", caller_offline)
        live = self.workflow.split("  live-raw-and-prepare:", 1)[1]
        self.assertLess(live.index("Require successful offline preflight for this exact branch commit"),
                        live.index("Run metadata-only authentication and archive gate"))
        self.assertIn("atlas-tnds-trust-offline-preflight-{run_id}", live)
        self.assertIn("item.get('expired') is False", live)
        self.assertIn("run.get('head_sha') == os.environ['GH_SHA']", live)

    def test_live_path_metadata_then_recoverable_raw_checkpoint_then_capacity_then_prepare(self):
        live = self.workflow.split("  live-raw-and-prepare:", 1)[1]
        required_in_order = [
            "Run metadata-only authentication and archive gate",
            "Restore exact prior raw snapshot artifact from selected producer run",
            "Verify restored raw snapshot and producer identity",
            "Acquire and verify raw TNDS checkpoint",
            "Upload immutable raw TNDS checkpoint before extraction",
            "Check runner capacity from ZIP central directories",
            "Extract and prepare quarantined TNDS handoff",
        ]
        positions = [live.index(value) for value in required_in_order]
        self.assertEqual(positions, sorted(positions))
        metadata_step = live.split("- name: Run metadata-only authentication and archive gate", 1)[1].split("- name:", 1)[0]
        self.assertIn("TNDS_USERNAME: ${{ secrets.TNDS_USERNAME }}", metadata_step)
        self.assertIn("TNDS_PASSWORD: ${{ secrets.TNDS_PASSWORD }}", metadata_step)
        self.assertIn("validate_metadata_probe", metadata_step)
        self.assertNotIn("RETR", metadata_step)
        acquire_step = live.split("- name: Acquire and verify raw TNDS checkpoint", 1)[1].split("- name:", 1)[0]
        self.assertIn("--acquire-only", acquire_step)
        self.assertIn("TNDS_USERNAME: ${{ secrets.TNDS_USERNAME }}", acquire_step)
        self.assertIn("TNDS_PASSWORD: ${{ secrets.TNDS_PASSWORD }}", acquire_step)

    def test_raw_artifact_is_run_bound_and_restore_is_verified_at_expected_root(self):
        self.assertIn("name: atlas-tnds-quarantined-${{ inputs.prior_producer_run_id }}", self.workflow)
        self.assertIn("run-id: ${{ inputs.prior_producer_run_id }}", self.workflow)
        self.assertIn("repository: ${{ github.repository }}", self.workflow)
        self.assertIn("path: ${{ runner.temp }}/tnds-quarantined-snapshot", self.workflow)
        self.assertIn("--verify-reused", self.workflow)
        self.assertIn("PRIOR_ARTIFACT_NAME: atlas-tnds-quarantined-${{ inputs.prior_producer_run_id }}", self.workflow)
        self.assertIn('--artifact-name "$PRIOR_ARTIFACT_NAME"', self.workflow)
        self.assertIn("name: atlas-tnds-quarantined-${{ github.run_id }}", self.workflow)
        self.assertIn("retention-days: 90", self.workflow)
        self.assertIn("load_and_verify_tnds_snapshot(snapshot)", self.driver)
        self.assertIn("producer.get(\"runId\")", self.driver)
        self.assertIn('"currentFreshnessClaimed": False', self.driver)

    def test_capacity_gate_uses_central_directory_without_extraction(self):
        self.assertIn("zipfile.ZipFile(archive_path)", self.driver)
        self.assertIn("archive.infolist()", self.driver)
        self.assertIn("max(10 * 1024**3, 3 * uncompressed_total + compressed_total)", self.driver)
        self.assertIn('"extractionStarted": False', self.driver)
        self.assertIn('"CAPACITY_BLOCKED"', self.driver)
        self.assertIn("--capacity-only", self.driver)

    def test_live_job_is_six_hours_read_only_and_nonpublishing(self):
        self.assertIn("timeout-minutes: 360", self.workflow)
        self.assertRegex(self.workflow, r"(?m)^  actions: read$")
        self.assertRegex(self.workflow, r"(?m)^  contents: read$")
        for forbidden in ("deploy-pages", "upload-pages-artifact", "github-pages", "secrets: inherit"):
            self.assertNotIn(forbidden, self.workflow)
        for marker in ('"runtimeActive": False', '"plannerEligible": False',
                       '"publicationAttempted": False', '"deploymentAttempted": False',
                       '"reconciliationStatus": "PRIMARY_INPUT_NOT_RESTORED"'):
            self.assertIn(marker, self.driver)

    def test_live_trust_is_excluded_from_primary_v2_acquisition(self):
        source_job = self.dispatcher.split("  reference-source:", 1)[1].split("  reference-diagnostic:", 1)[0]
        self.assertIn("inputs.v2_expected_snapshot_id != 'TNDS-TRUST-DIAGNOSTIC-C1A'", source_job)
        self.assertIn("inputs.v2_expected_snapshot_id != 'TNDS-TRUST-PREFLIGHT-C1B'", source_job)
        self.assertIn("!startsWith(inputs.v2_expected_snapshot_id, 'TNDS-TRUST-')", source_job)
        self.assertIn("needs.main-guard.result == 'success'", source_job)

    def test_driver_handoff_uses_preparers_emitted_manifest_path(self):
        self.assertIn('manifest_path = root / "manifest.json"', self.driver)
        self.assertNotIn('"atlas" / "data" / "bus-tnds" / "manifest.json"', self.driver)
        self.assertIn('"PREPARED_HANDOFF_SUCCEEDED"', self.driver)


if __name__ == "__main__":
    unittest.main()
