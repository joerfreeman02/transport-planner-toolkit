"""Static contracts for the manual, secret-safe TNDS Actions gate."""
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[2]
WORKFLOW = ROOT / ".github/workflows/atlas-bus-tnds-trust-diagnostic.yml"
DRIVER = ROOT / "tools/atlas-bus-data/tnds_trust_diagnostic.py"


class TndsWorkflowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")
        cls.driver = DRIVER.read_text(encoding="utf-8")

    def test_workflow_is_manual_only(self):
        self.assertRegex(self.workflow, r"(?m)^  workflow_dispatch:\s*$")
        self.assertNotRegex(self.workflow, r"(?m)^  (push|schedule|workflow_call):")

    def test_existing_github_secrets_are_injected_as_expressions(self):
        self.assertIn("TNDS_USERNAME: ${{ secrets.TNDS_USERNAME }}", self.workflow)
        self.assertIn("TNDS_PASSWORD: ${{ secrets.TNDS_PASSWORD }}", self.workflow)
        self.assertNotRegex(self.workflow, r"TNDS_(?:USERNAME|PASSWORD):\s*['\"]?[^$\s][^\n]*")

    def test_workflow_never_echoes_or_dumps_secrets(self):
        self.assertNotRegex(self.workflow, r"(?i)(echo|printenv|env\s*\|)\s*.*TNDS_(?:USERNAME|PASSWORD)")
        self.assertNotIn("set -x", self.workflow)
        self.assertIn("capture_output=True", self.driver)
        self.assertIn("type(error).__name__", self.driver)

    def test_workflow_is_diagnostic_and_quarantines_raw_snapshot(self):
        self.assertIn("quarantined", self.driver)
        self.assertRegex(self.workflow, r"(?m)^  actions: read$")
        self.assertNotRegex(self.workflow, r"(?m)^  actions: write$")
        self.assertRegex(self.workflow, r"(?m)^  contents: read$")
        self.assertIn('"runtimeActive": False', self.driver)
        self.assertIn('"plannerEligible": False', self.driver)
        self.assertIn("atlas-tnds-quarantined-", self.workflow)

    def test_workflow_cannot_publish_or_deploy(self):
        self.assertNotIn("deploy-pages", self.workflow)
        self.assertNotIn("upload-pages-artifact", self.workflow)
        self.assertNotIn("github-pages", self.workflow)
        self.assertIn('"publicationAttempted": False', self.driver)
        self.assertIn('"deploymentAttempted": False', self.driver)

    def test_comparator_is_withheld_until_primary_is_restored(self):
        self.assertIn('"reconciliationStatus": "PRIMARY_INPUT_NOT_RESTORED"', self.driver)
        self.assertIn('"comparatorState": "COMPARATOR_UNAVAILABLE"', self.driver)

    def test_no_local_credentials_or_secret_artifacts_are_created(self):
        self.assertNotRegex(self.driver, r"['\"]\.env['\"]")
        self.assertNotIn("credentials", self.driver.lower())
        self.assertIn('"secretValuesIncluded": False', self.driver)


if __name__ == "__main__": unittest.main()
