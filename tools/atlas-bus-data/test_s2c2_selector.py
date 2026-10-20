import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "resolve_s2c2_selector", ROOT / "tools/atlas-bus-data/resolve_s2c2_selector.py"
)
selector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(selector)


def compose_inputs():
    return {
        "EVENT_NAME": "workflow_dispatch",
        "GITHUB_REF": selector.BRANCH,
        "PREPARED_SCHEMA": "v1",
        "MEASURE_ONLY": "false",
        "FORCE_REFRESH": "false",
        "CANDIDATE_MODE": "compose",
        "RESUME_RUN_ID": "",
        "EXPECTED_SNAPSHOT_ID": "",
        "SOURCE_RUN_ID": "",
        "EXPECTED_SOURCE_COUNT": "",
        "EXPECTED_TOTAL_BYTES": "",
        **selector.PRIMARY,
        **selector.TNDS,
        "CANDIDATE_RUN": "",
        "CANDIDATE_ID": "",
        "CANDIDATE_DIGEST": "",
    }


class S2C2SelectorTests(unittest.TestCase):
    def test_exact_pinned_run53_compose_is_accepted(self):
        self.assertEqual(selector.resolve(compose_inputs()), ("review_candidate", "compose"))

    def test_exact_s2c1_zero_download_preflight_remains_accepted(self):
        values = compose_inputs() | {
            "CANDIDATE_MODE": "disabled",
            "PREPARED_SCHEMA": "v2",
            "MEASURE_ONLY": "true",
            "FORCE_REFRESH": "true",
            "EXPECTED_SNAPSHOT_ID": "TNDS-TRUST-PREFLIGHT-C1B",
            **{key: "" for key in (*selector.PRIMARY, *selector.TNDS)},
        }
        self.assertEqual(selector.resolve(values), ("offline_preflight", ""))

    def test_wrong_pinned_primary_selectors_are_refused(self):
        for key in selector.PRIMARY:
            with self.subTest(key=key):
                values = compose_inputs()
                values[key] = "wrong" if key != "PRIMARY_RUN" else "39217550519"
                with self.assertRaises(ValueError):
                    selector.resolve(values)

    def test_wrong_pinned_tnds_selectors_are_refused(self):
        for key in selector.TNDS:
            with self.subTest(key=key):
                values = compose_inputs()
                values[key] = "wrong" if key != "TNDS_RUN" else "39217550519"
                with self.assertRaises(ValueError):
                    selector.resolve(values)

    def test_fresh_source_selection_is_refused(self):
        values = compose_inputs()
        values.update({key: "" for key in (*selector.PRIMARY, *selector.TNDS)})
        with self.assertRaisesRegex(ValueError, "fresh acquisition"):
            selector.resolve(values)

    def test_restore_candidate_is_refused(self):
        values = compose_inputs()
        values["CANDIDATE_MODE"] = "restore_candidate"
        values.update({"CANDIDATE_RUN": "123", "CANDIDATE_ID": "456", "CANDIDATE_DIGEST": "sha256:abc"})
        with self.assertRaisesRegex(ValueError, "restore_candidate"):
            selector.resolve(values)

    def test_wrong_mode_and_non_manual_or_wrong_branch_are_refused(self):
        for key, wrong in (("CANDIDATE_MODE", "disabled"), ("EVENT_NAME", "schedule"), ("GITHUB_REF", "refs/heads/main")):
            with self.subTest(key=key):
                values = compose_inputs()
                values[key] = wrong
                with self.assertRaises(ValueError):
                    selector.resolve(values)

    def test_candidate_route_isolated_from_acquisition_publication_and_deployment(self):
        workflow = (ROOT / ".github/workflows/atlas-bus-data-refresh.yml").read_text(encoding="utf-8")
        branch = "codex/atlas-bus-beta-s2c-2-candidate-replay-authority"
        candidate = workflow.split("\n  s2a-c1-review-candidate:\n", 1)[1]
        self.assertIn(branch, candidate)
        self.assertIn("needs.main-guard.outputs.trust_mode == 'review_candidate'", candidate)
        self.assertNotIn(branch, workflow.split("\n  tnds-trust-browser-live:\n", 1)[1].split("\n  c3-primary-source:\n", 1)[0])
        for marker, next_marker in (("freshness", "build-validate"), ("build-validate", "deploy"), ("deploy", "freshness-no-op")):
            block = workflow.split(f"\n  {marker}:\n", 1)[1].split(f"\n  {next_marker}:\n", 1)[0]
            self.assertIn("needs.main-guard.outputs.trust_mode == ''", block)
        candidate_workflow = (ROOT / ".github/workflows/atlas-bus-beta-candidate.yml").read_text(encoding="utf-8")
        self.assertNotIn("pages: write", candidate_workflow)
        self.assertNotIn("deploy-pages", candidate_workflow)
        self.assertIn("if: inputs.mode == 'compose'", candidate_workflow)


if __name__ == "__main__":
    unittest.main()
