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
