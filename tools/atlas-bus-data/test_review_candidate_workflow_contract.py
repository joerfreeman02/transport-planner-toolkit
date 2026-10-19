from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/atlas-bus-beta-candidate.yml"
DISPATCHER = ROOT / ".github/workflows/atlas-bus-data-refresh.yml"


class ReviewCandidateWorkflowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")
        cls.dispatcher = DISPATCHER.read_text(encoding="utf-8")

    def test_manual_feature_branch_only_read_permissions_and_no_publication(self):
        self.assertIn("workflow_call:", self.workflow)
        self.assertIn("workflow_dispatch:", self.dispatcher)
        self.assertIn("s2a-c1-review-candidate:", self.dispatcher)
        self.assertIn("review_candidate_mode", self.dispatcher)
        self.assertIn("if: startsWith(github.ref, 'refs/heads/codex/')", self.workflow)
        self.assertNotIn("schedule:", self.workflow)
        self.assertIn("actions: read", self.workflow)
        self.assertIn("contents: read", self.workflow)
        self.assertNotIn("pages: write", self.workflow)
        self.assertNotIn("deployments: write", self.workflow)
        self.assertNotIn("actions: write", self.workflow)
        self.assertNotIn("environment:", self.workflow)
        self.assertNotIn("upload-pages-artifact", self.workflow)
        self.assertNotIn("deploy-pages", self.workflow)

    def test_existing_default_branch_dispatcher_invokes_only_the_isolated_manual_c1_path(self):
        selector = self.dispatcher.split("- name: Resolve S2A-C1 offline preflight selector", 1)[1].split("- name: Resolve exact-branch TRUST browser selector", 1)[0]
        self.assertIn("CANDIDATE_MODE", selector)
        self.assertIn("trust_mode=review_candidate", selector)
        self.assertIn("review_candidate_mode=$CANDIDATE_MODE", selector)
        self.assertIn("github.ref == 'refs/heads/codex/atlas-bus-beta-s2a-c1-review-candidate-composition'", self.dispatcher)
        self.assertIn("uses: ./.github/workflows/atlas-bus-beta-candidate.yml", self.dispatcher)
        self.assertIn("if: inputs.prepared_schema != 'v2' && needs.main-guard.outputs.trust_mode == ''", self.dispatcher)
        self.assertIn("needs.main-guard.outputs.trust_mode == '' && inputs.v2_expected_snapshot_id", self.dispatcher)
        self.assertIn("needs.main-guard.outputs.trust_mode == '' && needs.freshness.outputs.refresh_required", self.dispatcher)

    def test_c2_branch_has_only_an_exact_zero_acquisition_final_sha_preflight_selector(self):
        selector = self.dispatcher.split("- name: Resolve S2A-C2 exact offline preflight selector", 1)[1].split("- name: Resolve S2A-C3 offline preflight or isolated review-candidate selector", 1)[0]
        self.assertIn("id: s2a-c2-selector", selector)
        self.assertIn("github.ref == 'refs/heads/codex/atlas-bus-beta-s2a-c2-primary-acquisition-selector'", selector)
        self.assertIn("$EXPECTED_SNAPSHOT_ID\" != 'TNDS-TRUST-PREFLIGHT-C1B'", selector)
        self.assertIn("$CANDIDATE_MODE\" != 'disabled'", selector)
        self.assertIn("trust_mode=offline_preflight", selector)
        self.assertNotIn("trust_mode=review_candidate", selector)
        self.assertIn("steps.s2a-c2-selector.outputs.trust_mode", self.dispatcher)
        preflight = self.dispatcher.split("  tnds-trust-browser-offline-preflight:", 1)[1].split("  tnds-trust-browser-live:", 1)[0]
        self.assertIn("refs/heads/codex/atlas-bus-beta-s2a-c2-primary-acquisition-selector", preflight)
        self.assertIn("needs.main-guard.outputs.trust_mode == 'offline_preflight'", preflight)
        self.assertNotIn("refs/heads/codex/atlas-bus-beta-s2a-c2-primary-acquisition-selector", self.dispatcher.split("  tnds-trust-browser-live:", 1)[1].split("  ", 1)[0])

    def test_s2b_c2_branch_is_offline_preflight_only_and_has_no_candidate_or_publication_route(self):
        selector = self.dispatcher.split("- name: Resolve S2B-C2 exact zero-download offline preflight selector", 1)[1].split("- name: Resolve exact-branch TRUST browser selector", 1)[0]
        self.assertIn("id: s2b-c2-selector", selector)
        self.assertIn("github.ref == 'refs/heads/codex/atlas-bus-beta-s2b-c2-primary-restore-topology'", selector)
        self.assertIn("trust_mode=offline_preflight", selector)
        self.assertIn("CANDIDATE_MODE\" != 'disabled'", selector)
        self.assertNotIn("trust_mode=review_candidate", selector)
        self.assertIn("steps.s2b-c2-selector.outputs.trust_mode", self.dispatcher)
        offline = self.dispatcher.split("  tnds-trust-browser-offline-preflight:", 1)[1].split("  tnds-trust-browser-live:", 1)[0]
        self.assertIn("refs/heads/codex/atlas-bus-beta-s2b-c2-primary-restore-topology", offline)
        candidate_job = self.dispatcher.split("\n  s2a-c1-review-candidate:\n", 1)[1]
        self.assertNotIn("refs/heads/codex/atlas-bus-beta-s2b-c2-primary-restore-topology", candidate_job)
        for marker, next_marker in (("freshness", "build-validate"), ("build-validate", "deploy"), ("deploy", "freshness-no-op")):
            self.assertIn("needs.main-guard.outputs.trust_mode == ''", self.dispatcher.split(f"\n  {marker}:\n", 1)[1].split(f"\n  {next_marker}:\n", 1)[0])

    def test_c3_accepts_only_exact_offline_preflight_or_valid_isolated_candidate_modes(self):
        selector = self.dispatcher.split("- name: Resolve S2A-C3 offline preflight or isolated review-candidate selector", 1)[1].split("- name: Resolve exact-branch TRUST browser selector", 1)[0]
        self.assertIn("id: s2a-c3-selector", selector)
        self.assertIn("github.ref == 'refs/heads/codex/atlas-bus-beta-s2a-c3-c2-compose-authority'", selector)
        self.assertIn("CANDIDATE_MODE\" == 'compose' || \"$CANDIDATE_MODE\" == 'restore_candidate'", selector)
        self.assertIn("SCHEMA\" != 'v1'", selector)
        self.assertIn("MEASURE_ONLY\" != 'false'", selector)
        self.assertIn("FORCE_REFRESH\" != 'false'", selector)
        self.assertIn("EXPECTED_SNAPSHOT_ID$SOURCE_RUN_ID$EXPECTED_SOURCE_COUNT$EXPECTED_TOTAL_BYTES", selector)
        self.assertIn("trust_mode=review_candidate", selector)
        self.assertIn("review_candidate_mode=$CANDIDATE_MODE", selector)
        self.assertIn("TNDS-TRUST-PREFLIGHT-C1B", selector)
        self.assertIn("trust_mode=offline_preflight", selector)
        self.assertIn("Unknown S2A-C3 review-candidate mode", selector)
        self.assertIn("steps.s2a-c3-selector.outputs.review_candidate_mode || steps.s2a-c1-selector.outputs.review_candidate_mode", self.dispatcher)

    def test_c3_candidate_remains_read_only_exact_sha_gated_and_outside_legacy_publication_route(self):
        self.assertIn("refs/heads/codex/atlas-bus-beta-s2a-c3-c2-compose-authority", self.dispatcher.split("  s2a-c1-review-candidate:", 1)[1])
        self.assertIn("needs.main-guard.outputs.trust_mode == 'review_candidate'", self.dispatcher)
        self.assertIn("needs.main-guard.outputs.trust_mode == ''", self.dispatcher)
        for marker, next_marker in (("freshness", "build-validate"), ("build-validate", "deploy"), ("deploy", "freshness-no-op")):
            block = self.dispatcher.split(f"\n  {marker}:\n", 1)[1].split(f"\n  {next_marker}:\n", 1)[0]
            self.assertIn("needs.main-guard.outputs.trust_mode == ''", block)
        self.assertIn("Require successful unexpired exact-SHA offline preflight before source acquisition", self.workflow)
        self.assertIn("if: inputs.mode == 'compose'", self.workflow)
        self.assertIn("head_sha", self.workflow)
        self.assertIn("head_branch", self.workflow)
        self.assertIn("expired') is False", self.workflow)
        self.assertIn("actions: read", self.workflow)
        self.assertIn("contents: read", self.workflow)
        self.assertNotIn("pages: write", self.workflow)
        self.assertNotIn("deployments: write", self.workflow)
        self.assertNotIn("environment:", self.workflow)

    def test_c1_candidate_authority_stays_on_its_historical_exact_branch(self):
        c1_selector = self.dispatcher.split("- name: Resolve S2A-C1 offline preflight selector", 1)[1].split("- name: Resolve S2A-C2 exact offline preflight selector", 1)[0]
        self.assertIn("if: github.ref == 'refs/heads/codex/atlas-bus-beta-s2a-c1-review-candidate-composition'", c1_selector)
        self.assertNotIn("s2a-c3-c2-compose-authority", c1_selector)
        self.assertIn("github.ref == 'refs/heads/codex/atlas-bus-beta-s2a-c1-review-candidate-composition' || github.ref == 'refs/heads/codex/atlas-bus-beta-s2a-c3-c2-compose-authority'", self.dispatcher)

    def test_c2_primary_acquisition_fix_remains_intact(self):
        primary = self.workflow.split("- name: Verify explicit primary snapshot or acquire fresh eleven-source snapshot", 1)[1].split("- name:", 1)[0]
        self.assertIn('if [[ -n "$PRIMARY_RUN_INPUT" ]]; then', primary)
        self.assertIn("source_snapshot.py --acquire --output source-snapshot", primary)

    def test_exact_sha_gate_precedes_both_source_family_paths(self):
        gate = self.workflow.index("Require successful unexpired exact-SHA offline preflight")
        primary = self.workflow.index("Verify explicit primary snapshot or acquire fresh eleven-source snapshot")
        tnds = self.workflow.index("Acquire and verify the fresh eight-region raw TNDS snapshot")
        metadata = self.workflow.index("Run metadata-only TNDS authentication and archive gate")
        self.assertLess(gate, primary)
        self.assertLess(gate, tnds)
        self.assertLess(metadata, tnds)
        self.assertIn("tnds_capability_probe.py", self.workflow)
        for fragment in ("head_sha", "head_branch", "conclusion", "expired"):
            self.assertIn(fragment, self.workflow)
        self.assertIn("atlas-tnds-trust-offline-preflight-", self.workflow)
        self.assertIn("atlas-bus-data-refresh.yml", self.workflow)

    def test_exact_sha_preflight_python_heredoc_is_closed_before_the_next_step(self):
        gate = self.workflow.split("- name: Require successful unexpired exact-SHA offline preflight before source acquisition", 1)[1].split("- name: Validate explicit raw restore parameters", 1)[0]
        script = gate.split("          python - <<'PY'\n", 1)[1]
        self.assertTrue(script.rstrip().endswith("          PY"), "exact-SHA gate Python heredoc must close before the next step")
        self.assertEqual(script.count("          PY"), 1)

    def test_raw_artifacts_precede_capacity_and_candidate_preparation(self):
        primary_upload = self.workflow.index("Preserve verified primary snapshot before preparation")
        tnds_upload = self.workflow.index("Preserve fresh raw TNDS snapshot before capacity, extraction, or preparation")
        capacity = self.workflow.index("Check TNDS central-directory expansion and runner capacity")
        seed = self.workflow.index("Seed isolated candidate from the checked-out Alpha.15 site and baseline")
        build = self.workflow.index("Build complete review-only Bus and TNDS candidate")
        structural = self.workflow.index("Structurally validate prepared Bus and TNDS manifests and shards")
        candidate = self.workflow.index("Save full structurally verified review candidate checkpoint")
        upload_candidate = self.workflow.index("Upload immutable full candidate checkpoint")
        self.assertLess(primary_upload, build)
        self.assertLess(tnds_upload, capacity)
        self.assertLess(capacity, seed)
        self.assertLess(seed, build)
        self.assertLess(build, structural)
        self.assertLess(structural, candidate)
        self.assertLess(candidate, upload_candidate)
        self.assertIn("retention-days: 90", self.workflow)

    def test_blank_primary_restore_input_selects_fresh_acquisition_and_current_producer(self):
        primary = self.workflow.split("- name: Verify explicit primary snapshot or acquire fresh eleven-source snapshot", 1)[1].split("- name:", 1)[0]
        self.assertIn("PRIMARY_RUN: ${{ inputs.primary_source_run_id || github.run_id }}", primary)
        self.assertIn("PRIMARY_RUN_INPUT: ${{ inputs.primary_source_run_id }}", primary)
        self.assertIn('if [[ -n "$PRIMARY_RUN_INPUT" ]]; then', primary)
        self.assertIn("source_snapshot.py --acquire --output source-snapshot", primary)
        self.assertIn("expected=os.environ['PRIMARY_RUN']", primary)
        self.assertIn("producer.get('repositoryCommitSha') != os.environ['GITHUB_SHA']", primary)

    def test_explicit_primary_restore_is_exact_and_never_falls_back_to_acquisition(self):
        restore_download = self.workflow.split("- name: Restore exact primary raw snapshot", 1)[1].split("- name:", 1)[0]
        primary = self.workflow.split("- name: Verify explicit primary snapshot or acquire fresh eleven-source snapshot", 1)[1].split("- name:", 1)[0]
        explicit_branch = primary.split('if [[ -n "$PRIMARY_RUN_INPUT" ]]; then', 1)[1].split("\n          else", 1)[0]
        fresh_branch = primary.split("\n          else", 1)[1].split("\n          fi", 1)[0]
        self.assertIn("inputs.primary_source_run_id != ''", restore_download)
        self.assertIn("run-id: ${{ inputs.primary_source_run_id }}", restore_download)
        self.assertIn("path: primary-restore/source-snapshot", restore_download)
        self.assertIn("test -d primary-restore/source-snapshot", explicit_branch)
        self.assertIn("--mark-frozen-reuse primary-restore/source-snapshot --source-run-id \"$PRIMARY_RUN\"", explicit_branch)
        self.assertEqual(explicit_branch.count("primary-restore/source-snapshot"), 2)
        self.assertIn("--output source-snapshot", explicit_branch)
        self.assertNotIn("--acquire", explicit_branch)
        self.assertIn("source_snapshot.py --acquire --output source-snapshot", fresh_branch)
        self.assertIn("--verify source-snapshot", primary)

    def test_fresh_primary_artifact_is_preserved_after_verification_before_preparation(self):
        verify = self.workflow.index("Verify explicit primary snapshot or acquire fresh eleven-source snapshot")
        upload = self.workflow.index("Preserve verified primary snapshot before preparation")
        prepare = self.workflow.index("Build complete review-only Bus and TNDS candidate")
        artifact = self.workflow.split("- name: Preserve verified primary snapshot before preparation", 1)[1].split("- name:", 1)[0]
        self.assertLess(verify, upload)
        self.assertLess(upload, prepare)
        self.assertIn("inputs.primary_source_run_id == ''", artifact)
        self.assertIn("atlas-reference-source-snapshot-${{ github.run_id }}", artifact)
        self.assertIn("retention-days: 90", artifact)

    def test_tnds_fresh_and_explicit_restore_selectors_remain_unchanged(self):
        tnds = self.workflow.split("- name: Acquire fresh TNDS raw snapshot or verify exact restored snapshot", 1)[1].split("- name:", 1)[0]
        tnds_download = self.workflow.split("- name: Restore exact raw TNDS artifact", 1)[1].split("- name:", 1)[0]
        self.assertIn("TNDS_RUN: ${{ inputs.tnds_source_run_id }}", tnds)
        self.assertIn('if [[ -n "$TNDS_RUN" ]]; then', tnds)
        self.assertIn("--verify-reused", tnds)
        self.assertIn("path: tnds-restore", tnds_download)
        self.assertIn("--snapshot tnds-restore", tnds)
        self.assertIn("cp -R tnds-restore \"$RUNNER_TEMP/tnds-quarantined-snapshot\"", tnds)
        for name in ("Run metadata-only TNDS authentication and archive gate", "Acquire and verify the fresh eight-region raw TNDS snapshot"):
            block = self.workflow.split(f"- name: {name}", 1)[1].split("- name:", 1)[0]
            self.assertIn("inputs.tnds_source_run_id == ''", block)

    def test_candidate_path_remains_nonpublishing_and_nondeploying(self):
        self.assertIn("actions: read", self.workflow)
        self.assertIn("contents: read", self.workflow)
        for forbidden in ("pages: write", "deployments: write", "contents: write", "environment:", "deploy-pages", "upload-pages-artifact"):
            self.assertNotIn(forbidden, self.workflow)
        self.assertIn("actions: read", self.dispatcher)
        self.assertIn("contents: read", self.dispatcher)
        self.assertIn("    permissions:\n      actions: read\n      contents: read", self.dispatcher)

    def test_explicit_restore_modes_are_exact_and_fail_closed(self):
        for name in ("primary_source_run_id", "primary_artifact_id", "primary_artifact_digest",
                     "tnds_source_run_id", "tnds_artifact_id", "tnds_artifact_digest",
                     "candidate_checkpoint_run_id", "candidate_artifact_id", "candidate_artifact_digest"):
            self.assertIn(name + ":", self.workflow)
        self.assertIn("--mark-frozen-reuse", self.workflow)
        self.assertIn("--verify-reused", self.workflow)
        self.assertIn("--expected-run-id", self.workflow)
        self.assertIn("Explicit {family} restore requires numeric producer run", self.workflow)
        self.assertIn("Verify exact candidate restore artifact metadata", self.workflow)
        self.assertIn("--expected-commit-sha", self.workflow)
        restored_tnds = self.workflow.split("- name: Restore exact raw TNDS artifact", 1)[1].split("- name:", 1)[0]
        self.assertNotIn("secrets.TNDS_", restored_tnds)
        for name in ("Run metadata-only TNDS authentication and archive gate", "Acquire and verify the fresh eight-region raw TNDS snapshot"):
            block = self.workflow.split(f"- name: {name}", 1)[1].split("- name:", 1)[0]
            self.assertIn("inputs.tnds_source_run_id == ''", block)

    def test_production_builders_and_review_only_checkpoint_are_bound(self):
        self.assertIn("refresh_bus_data.py", self.workflow)
        self.assertIn("--prepared-schema v2", self.workflow)
        self.assertIn("--review-only --acquisition-disabled", self.workflow)
        self.assertIn("review-candidate-checkpoint.mjs create", self.workflow)
        self.assertIn("review-candidate-checkpoint.mjs verify", self.workflow)
        self.assertIn("FULLY_VALIDATED_REVIEW_ONLY", self.workflow)
        self.assertIn("atlas-bus-beta-review-candidate-", self.workflow)


if __name__ == "__main__":
    unittest.main()
