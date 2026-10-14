"""Static contracts for existing-dispatcher TNDS Actions gate."""
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

    def test_existing_manual_dispatcher_selects_only_exact_tnds_mode(self):
        self.assertRegex(self.dispatcher, r"(?m)^  workflow_dispatch:\s*$")
        self.assertIn("TNDS-TRUST-DIAGNOSTIC-C1A", self.dispatcher)
        self.assertIn("inputs.prepared_schema == 'v2'", self.dispatcher)
        self.assertIn("inputs.measure_only == true", self.dispatcher)
        self.assertIn("inputs.force_refresh == true", self.dispatcher)
        self.assertIn("github.event_name == 'workflow_dispatch'", self.dispatcher)
        self.assertIn("github.ref != 'refs/heads/main'", self.dispatcher)
        self.assertIn("uses: ./.github/workflows/atlas-bus-tnds-trust-diagnostic.yml", self.dispatcher)
        self.assertIn("inputs.v2_expected_snapshot_id != 'TNDS-TRUST-DIAGNOSTIC-C1A'", self.dispatcher)
        self.assertRegex(self.workflow, r"(?m)^  workflow_call:\s*$")
        self.assertNotRegex(self.workflow, r"(?m)^  (workflow_dispatch|push|schedule):")

    def test_dispatch_entry_exists_on_default_branch_and_callee_does_not(self):
        default_dispatcher = subprocess.run(
            ["git", "show", "origin/main:.github/workflows/atlas-bus-data-refresh.yml"],
            cwd=ROOT, check=True, capture_output=True, text=True).stdout
        self.assertRegex(default_dispatcher, r"(?m)^  workflow_dispatch:\s*$")
        self.assertIn("name: ATLAS Bus data refresh", default_dispatcher)
        default_callee = subprocess.run(
            ["git", "show", "origin/main:.github/workflows/atlas-bus-tnds-trust-diagnostic.yml"],
            cwd=ROOT, capture_output=True, text=True)
        self.assertNotEqual(default_callee.returncode, 0)

    def test_branch_dispatch_inputs_are_documented_in_existing_form(self):
        handover = ROOT / "docs/atlas/BUS-DATA-TRUST-1A-C1A-REMOTE-GATE-PREFLIGHT-HANDOVER.md"
        if not handover.exists():
            self.fail("C1A handover must document the default-branch dispatcher path")
        doc = handover.read_text(encoding="utf-8")
        for value in ("force_refresh=true", "measure_only=true", "prepared_schema=v2",
                      "TNDS-TRUST-DIAGNOSTIC-C1A", "resume_checkpoint_run_id=blank",
                      "v2_source_snapshot_run_id=blank", "v2_expected_source_count=blank",
                      "v2_expected_total_bytes=blank", "GITHUB TOOLING ADOPTION REVIEW"):
            self.assertIn(value, doc)

    def test_existing_github_secrets_are_injected_as_expressions(self):
        self.assertIn("TNDS_USERNAME: ${{ secrets.TNDS_USERNAME }}", self.workflow)
        self.assertIn("TNDS_PASSWORD: ${{ secrets.TNDS_PASSWORD }}", self.workflow)
        trust_job = self.dispatcher.split("  tnds-trust-diagnostic:", 1)[1]
        self.assertIn("TNDS_USERNAME: ${{ secrets.TNDS_USERNAME }}", trust_job)
        self.assertIn("TNDS_PASSWORD: ${{ secrets.TNDS_PASSWORD }}", trust_job)
        self.assertNotIn("secrets: inherit", trust_job)
        self.assertNotRegex(self.workflow, r"(?m)^[ \t]+TNDS_(?:USERNAME|PASSWORD):[ \t]*['\"]?[^$\s]")

    def test_failure_evidence_and_raw_snapshot_are_uploaded_on_failure(self):
        self.assertRegex(self.workflow, r"(?m)^        if: always\(\)$")
        self.assertIn("atlas-tnds-quarantined-", self.workflow)
        self.assertIn("run-evidence.json", self.workflow)
        self.assertIn("if-no-files-found: warn", self.workflow)
        self.assertIn('"snapshot_available"', self.driver)

    def test_secrets_are_not_echoed_and_outputs_are_safe(self):
        self.assertNotRegex(self.workflow, r"(?i)(echo|printenv|env\s*\|)\s*.*TNDS_(?:USERNAME|PASSWORD)")
        self.assertNotIn("set -x", self.workflow)
        self.assertIn("capture_output=True", self.driver)
        self.assertIn("type(error).__name__", self.driver)
        self.assertIn('"secretValuesIncluded": False', self.driver)

    def test_workflow_is_read_only_diagnostic_and_cannot_publish(self):
        self.assertRegex(self.workflow, r"(?m)^  actions: read$")
        self.assertRegex(self.workflow, r"(?m)^  contents: read$")
        for forbidden in ("deploy-pages", "upload-pages-artifact", "github-pages"):
            self.assertNotIn(forbidden, self.workflow)
        for marker in ('"runtimeActive": False', '"plannerEligible": False',
                       '"publicationAttempted": False', '"deploymentAttempted": False',
                       '"reconciliationStatus": "PRIMARY_INPUT_NOT_RESTORED"',
                       '"comparatorState": "COMPARATOR_UNAVAILABLE"'):
            self.assertIn(marker, self.driver)

    def test_driver_uses_preparers_emitted_manifest_path(self):
        self.assertIn('manifest_path = root / "manifest.json"', self.driver)
        self.assertNotIn('"atlas" / "data" / "bus-tnds" / "manifest.json"', self.driver)


if __name__ == "__main__":
    unittest.main()
