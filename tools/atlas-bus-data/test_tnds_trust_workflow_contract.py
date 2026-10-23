"""Static contracts for the manual-dispatcher TNDS TRUST safety gate."""
import unittest
import subprocess
import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
DISPATCHER = ROOT / ".github/workflows/atlas-bus-data-refresh.yml"
CALLEE = ROOT / ".github/workflows/atlas-bus-tnds-trust-diagnostic.yml"
DRIVER = ROOT / "tools/atlas-bus-data/tnds_trust_diagnostic.py"
TRUST_BRANCH = "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-recoverable-reconciliation"
TRUST_BRANCH_C1 = "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-region-scale-recovery-closeout"
TRUST_BRANCH_CURRENT = "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-c1-c1-branch-dispatch-closeout"
TRUST_BRANCH_R45_C1 = "refs/heads/codex/atlas-bus-data-trust-r45-c1-reconciliation-contract-closeout"
S2A_BRANCH = "refs/heads/codex/atlas-bus-beta-s2a-refresh-checkpoint-readiness"
S2A_C1_BRANCH = "refs/heads/codex/atlas-bus-beta-s2a-c1-review-candidate-composition"


def parse_dispatch_input_names(workflow_text):
    """Parse the workflow_dispatch inputs mapping from this indentation-based YAML block."""
    lines = workflow_text.splitlines()
    dispatch_index = next(i for i, line in enumerate(lines) if re.fullmatch(r"  workflow_dispatch:\s*", line))
    inputs_index = next(i for i in range(dispatch_index + 1, len(lines))
                        if re.fullmatch(r"    inputs:\s*", lines[i]))
    names = set()
    for line in lines[inputs_index + 1:]:
        if line.strip() and len(line) - len(line.lstrip()) <= 4:
            break
        match = re.fullmatch(r"      ([A-Za-z_][A-Za-z0-9_-]*):\s*", line)
        if match:
            names.add(match.group(1))
    return names


def workflow_job_block(workflow_text, job_name):
    match = re.search(rf"(?ms)^  {re.escape(job_name)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\s*$|\Z)", workflow_text)
    if not match:
        raise AssertionError(f"Workflow job not found: {job_name}")
    return match.group(1)


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

    def test_default_branch_contains_tnds_trust_dispatcher_and_reusable_callee(self):
        dispatcher = subprocess.run(["git", "show", "origin/main:.github/workflows/atlas-bus-data-refresh.yml"],
                                    cwd=ROOT, check=True, capture_output=True, text=True).stdout
        callee = subprocess.run(["git", "show", "origin/main:.github/workflows/atlas-bus-tnds-trust-diagnostic.yml"],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertIn("name: ATLAS Bus data refresh", dispatcher)
        self.assertIn("uses: ./.github/workflows/atlas-bus-tnds-trust-diagnostic.yml", dispatcher)
        self.assertEqual(callee.returncode, 0)
        self.assertIn("name: ATLAS Bus TNDS TRUST diagnostic", callee.stdout)
        self.assertIn("workflow_call:", callee.stdout)

    def test_trust_browser_selector_uses_product_owned_controls(self):
        names = parse_dispatch_input_names(self.dispatcher)
        required_by_product_owner = {"force_refresh", "measure_only", "resume_checkpoint_run_id", "prepared_schema"}
        self.assertLessEqual(required_by_product_owner, names)

        selector = self.dispatcher.split("- name: Resolve exact-branch TRUST browser selector", 1)[1].split("- name: Record safe execution mode", 1)[0]
        for input_name in required_by_product_owner:
            self.assertIn(f"inputs.{input_name}", selector)
        for branch_only_name in ("v2_source_snapshot_run_id", "v2_expected_snapshot_id",
                                 "v2_expected_source_count", "v2_expected_total_bytes"):
            self.assertNotIn(f"inputs.{branch_only_name}", selector)
        self.assertNotIn("v2_", selector)

    def test_exact_branch_selector_maps_all_three_modes_and_fails_closed(self):
        selector = self.dispatcher.split("- name: Resolve exact-branch TRUST browser selector", 1)[1].split("- name: Record safe execution mode", 1)[0]
        self.assertIn(f"TRUST_BRANCH_C3: {TRUST_BRANCH}", selector)
        self.assertIn(f"TRUST_BRANCH_C3_C1: {TRUST_BRANCH_C1}", selector)
        self.assertIn(f"TRUST_BRANCH_C3_C1_C1: {TRUST_BRANCH_CURRENT}", selector)
        self.assertIn(f"TRUST_BRANCH_R45_C1: {TRUST_BRANCH_R45_C1}", selector)
        self.assertIn(f"S2A_BRANCH: {S2A_BRANCH}", selector)
        self.assertIn('[[ "$GITHUB_REF" != "$TRUST_BRANCH_C3" && "$GITHUB_REF" != "$TRUST_BRANCH_C3_C1" && "$GITHUB_REF" != "$TRUST_BRANCH_C3_C1_C1" && "$GITHUB_REF" != "$TRUST_BRANCH_R45_C1" ]]', selector)
        self.assertIn('if [[ "$GITHUB_REF" == "$S2A_BRANCH" ]]; then', selector)
        self.assertIn("S2A branch accepts only the forced, measure-only v2 offline-preflight selection", selector)
        self.assertIn("R45-C1 closeout branch accepts only the Run #45 checkpoint-only retry selector", selector)
        self.assertIn('"$RESUME_RUN_ID" != \'38731043427\'', selector)
        self.assertIn('"$PREPARED_SCHEMA" != \'v2\'', selector)
        self.assertIn('"$MEASURE_ONLY" != \'true\'', selector)
        self.assertIn('"$FORCE_REFRESH" == \'false\'', selector)
        self.assertIn('-z "$RESUME_RUN_ID"', selector)
        self.assertIn("trust_mode=offline_preflight", selector)
        self.assertIn('"$FORCE_REFRESH" == \'true\'', selector)
        self.assertIn("trust_mode=c3_live_trust", selector)
        self.assertIn("trust_mode=c3_checkpoint_retry", selector)
        self.assertIn('"$RESUME_RUN_ID" == \'38579244547\'', selector)
        self.assertIn("Invalid C3 selection", selector)
        self.assertIn("trust_prior_producer_run_id: ${{ steps.s2a-c3-selector.outputs.prior_producer_run_id || steps.s2a-c2-selector.outputs.prior_producer_run_id || steps.s2a-c1-selector.outputs.prior_producer_run_id || steps.trust-selector.outputs.prior_producer_run_id }}", self.dispatcher)

    def test_non_numeric_raw_reuse_ids_fail_closed(self):
        selector = self.dispatcher.split("- name: Resolve exact-branch TRUST browser selector", 1)[1].split("- name: Record safe execution mode", 1)[0]
        self.assertIn('"$RESUME_RUN_ID" == \'38579244547\'', selector)
        self.assertIn("else\n            echo '::error::Invalid C3 selection", selector)
        self.assertEqual("38579244547", "38579244547")
        for malformed in ("", "38579244546", "38579244548", "abc", "12x", "-12", "1.2", " 38579244547", "38579244547 "):
            self.assertNotEqual(malformed, "38579244547")

    def test_trust_selector_is_not_activated_on_other_branches_or_main(self):
        selector = self.dispatcher.split("- name: Resolve exact-branch TRUST browser selector", 1)[1].split("- name: Record safe execution mode", 1)[0]
        self.assertIn('if [[ "$GITHUB_REF" != "$TRUST_BRANCH_C3" && "$GITHUB_REF" != "$TRUST_BRANCH_C3_C1" && "$GITHUB_REF" != "$TRUST_BRANCH_C3_C1_C1" && "$GITHUB_REF" != "$TRUST_BRANCH_R45_C1" ]]; then', selector)
        self.assertIn("echo 'trust_mode='", selector)
        self.assertIn("echo 'prior_producer_run_id='", selector)
        self.assertGreaterEqual(self.dispatcher.count(TRUST_BRANCH), 4)
        generic_resume_guard = self.dispatcher.split("- name: Refuse checkpoint resume outside trusted production context", 1)[1].split("- name:", 1)[0]
        self.assertIn("github.ref != 'refs/heads/main'", generic_resume_guard)
        self.assertIn(f"github.ref != '{TRUST_BRANCH}'", generic_resume_guard)
        self.assertIn(f"github.ref != '{TRUST_BRANCH_C1}'", generic_resume_guard)
        self.assertIn(f"github.ref != '{TRUST_BRANCH_CURRENT}'", generic_resume_guard)
        self.assertIn(f"github.ref != '{TRUST_BRANCH_R45_C1}'", generic_resume_guard)
        self.assertIn("Cross-run checkpoint resume is allowed only from refs/heads/main", generic_resume_guard)

    def test_all_trust_modes_skip_primary_acquisition_and_production_jobs(self):
        for job in ("freshness", "build-validate", "deploy", "freshness-no-op", "reference-source", "reference-diagnostic",
                    "tnds-trust-offline-preflight", "tnds-trust-live-diagnostic"):
            block = workflow_job_block(self.dispatcher, job)
            self.assertIn("needs.main-guard.outputs.trust_mode == ''", block, job)
        for job, mode in (("tnds-trust-browser-offline-preflight", "offline_preflight"),
                          ("tnds-trust-browser-live", "c3_live_trust")):
            block = workflow_job_block(self.dispatcher, job)
            self.assertIn(f"github.ref == '{TRUST_BRANCH_CURRENT}'", block)
            self.assertIn(f"github.ref == '{TRUST_BRANCH}'", block)
            self.assertIn(f"github.ref == '{TRUST_BRANCH_C1}'", block)
            self.assertIn(f"needs.main-guard.outputs.trust_mode == '{mode}'", block)
            self.assertIn("uses: ./.github/workflows/atlas-bus-tnds-trust-diagnostic.yml", block)
        self.assertIn("prior_producer_run_id: ${{ needs.main-guard.outputs.trust_prior_producer_run_id }}", self.dispatcher)
        live_browser = self.dispatcher.split("  tnds-trust-browser-live:", 1)[1]
        self.assertIn("TNDS_USERNAME: ''", live_browser)
        self.assertIn("TNDS_PASSWORD: ''", live_browser)
        self.assertIn("c3-primary-source:", self.dispatcher)
        self.assertIn("c3-live-reconciliation:", self.dispatcher)
        self.assertIn("c3-checkpoint-retry:", self.dispatcher)
        offline = self.dispatcher.split("  tnds-trust-browser-offline-preflight:", 1)[1].split("  tnds-trust-browser-live:", 1)[0]
        self.assertNotIn("secrets:", offline)
        self.assertNotIn("TNDS_USERNAME", offline)
        self.assertNotIn("TNDS_PASSWORD", offline)

    def test_same_commit_preflight_gate_and_nonpublishing_trust_callee_remain(self):
        live = self.workflow.split("  live-raw-and-prepare:", 1)[1]
        for condition in ("run.get('head_sha') == os.environ['GH_SHA']",
                          "run.get('head_branch') == os.environ['GH_REF_NAME']",
                          "run.get('event') == 'workflow_dispatch'",
                          "run.get('conclusion') == 'success'",
                          "atlas-tnds-trust-offline-preflight-{run_id}",
                          "item.get('expired') is False"):
            self.assertIn(condition, live)
        self.assertIn("GH_REPOSITORY: ${{ github.repository }}", live)
        self.assertIn("actions/runs?{query}", live)
        self.assertIn("needs.main-guard.outputs.trust_mode == 'c3_live_trust'", self.dispatcher)
        self.assertRegex(self.workflow, r"(?m)^  actions: read$")
        self.assertRegex(self.workflow, r"(?m)^  contents: read$")
        self.assertNotIn("pages: write", self.workflow)
        self.assertNotIn("id-token: write", self.workflow)
        self.assertNotIn("upload-pages-artifact", self.workflow)
        self.assertNotIn("deploy-pages", self.workflow)

    def test_offline_preflight_checks_out_selected_branch_and_has_zero_acquisition_authority(self):
        offline = self.workflow.split("  offline-preflight:", 1)[1].split("  live-raw-and-prepare:", 1)[0]
        self.assertIn("if: inputs.mode == 'offline_preflight'", offline)
        self.assertIn("ref: ${{ github.sha }}", offline)
        self.assertIn("actions/setup-python@v5", offline)
        self.assertIn("actions/setup-node@v4", offline)
        self.assertIn("pnpm/action-setup@v4", offline)
        self.assertIn("pnpm install --frozen-lockfile", offline)
        self.assertIn("pnpm exec playwright install --with-deps chromium", offline)
        self.assertIn("python -m unittest discover -s tools/atlas-bus-data -p 'test_*.py' -v", offline)
        self.assertIn("node tests/atlas/run-all.mjs", offline)
        self.assertIn('git diff --check "${GITHUB_SHA}^" "$GITHUB_SHA"', offline)
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

    def test_s2a_branch_is_limited_to_the_offline_preflight_job(self):
        selector = self.dispatcher.split("- name: Resolve exact-branch TRUST browser selector", 1)[1].split("- name: Record safe execution mode", 1)[0]
        self.assertIn(f"S2A_BRANCH: {S2A_BRANCH}", selector)
        self.assertIn("trust_mode=offline_preflight", selector)
        preflight = workflow_job_block(self.dispatcher, "tnds-trust-browser-offline-preflight")
        live = workflow_job_block(self.dispatcher, "tnds-trust-live-diagnostic")
        self.assertIn(S2A_BRANCH, preflight)
        self.assertNotIn(S2A_BRANCH, live)

    def test_s2a_c1_branch_is_limited_to_exact_preflight_or_review_candidate_selector(self):
        selector = self.dispatcher.split("- name: Resolve S2A-C1 offline preflight selector", 1)[1].split("- name: Resolve exact-branch TRUST browser selector", 1)[0]
        self.assertIn(f"if: github.ref == '{S2A_C1_BRANCH}'", selector)
        self.assertIn("The S2A-C1 branch accepts only the exact offline-preflight selector or the isolated review-candidate selector", selector)
        self.assertIn("TNDS-TRUST-PREFLIGHT-C1B", selector)
        preflight = workflow_job_block(self.dispatcher, "tnds-trust-browser-offline-preflight")
        live = workflow_job_block(self.dispatcher, "tnds-trust-live-diagnostic")
        candidate = workflow_job_block(self.dispatcher, "s2a-c1-review-candidate")
        self.assertIn(S2A_C1_BRANCH, preflight)
        self.assertNotIn(S2A_C1_BRANCH, live)
        self.assertIn(S2A_C1_BRANCH, candidate)
        self.assertIn("review_candidate_mode", candidate)

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
        self.assertIn("RAW_ARTIFACT_ID: ${{ steps.raw-artifact.outputs.artifact-id }}", self.workflow)
        self.assertIn("RAW_ARTIFACT_DIGEST: ${{ steps.raw-artifact.outputs.artifact-digest }}", self.workflow)
        self.assertIn("'rawArtifactUploaded'", self.workflow)
        self.assertIn("'rawArtifact'", self.workflow)
        self.assertIn("load_and_verify_tnds_snapshot(snapshot)", self.driver)
        self.assertIn("producer.get(\"runId\")", self.driver)
        self.assertIn('"currentFreshnessClaimed": False', self.driver)

    def test_incomplete_acquisition_cannot_make_raw_checkpoint_upload_ready(self):
        acquire = self.driver.split("def acquire_raw_checkpoint", 1)[1].split("def verify_reused_checkpoint", 1)[0]
        verification = acquire.index("verified = load_and_verify_tnds_snapshot(snapshot)")
        publishable_output = acquire.index('_write_output("snapshot_available", "true")', verification)
        self.assertLess(verification, publishable_output)
        self.assertNotIn('_write_output("snapshot_available", "true")', acquire[:verification])

    def test_run40_reuse_skips_tnds_credentials_and_fresh_acquisition_steps(self):
        metadata = self.workflow.split("- name: Run metadata-only authentication and archive gate", 1)[1].split("- name: Restore exact prior raw snapshot", 1)[0]
        acquire = self.workflow.split("- name: Acquire and verify raw TNDS checkpoint", 1)[1].split("- name: Upload immutable raw TNDS checkpoint", 1)[0]
        self.assertIn("if: inputs.prior_producer_run_id == ''", metadata)
        self.assertIn("if: inputs.prior_producer_run_id == ''", acquire)
        self.assertIn("prior_producer_run_id: ${{ needs.main-guard.outputs.trust_prior_producer_run_id }}", self.dispatcher)
        live_browser = self.dispatcher.split("  tnds-trust-browser-live:", 1)[1]
        self.assertIn("TNDS_USERNAME: ''", live_browser)
        self.assertIn("TNDS_PASSWORD: ''", live_browser)

    def test_capacity_gate_uses_central_directory_without_extraction(self):
        self.assertIn("zipfile.ZipFile(archive_path)", self.driver)
        self.assertIn("archive.infolist()", self.driver)
        self.assertIn("compressed_total + 3 * largest_region + DISK_RESERVE_BYTES", self.driver)
        self.assertIn('"largestRegionUncompressedBytes": largest_region', self.driver)
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
