import unittest

from resolve_s2c3_selector import BRANCH, PRIMARY, TNDS, resolve


class S2C3SelectorTests(unittest.TestCase):
    def base(self):
        return {
            "EVENT_NAME": "workflow_dispatch", "GITHUB_REF": BRANCH,
            "PREPARED_SCHEMA": "v2", "MEASURE_ONLY": "true", "FORCE_REFRESH": "true",
            "CANDIDATE_MODE": "disabled", "EXPECTED_SNAPSHOT_ID": "TNDS-TRUST-PREFLIGHT-C1B",
        }

    def test_exact_offline_preflight_is_zero_download(self):
        self.assertEqual(resolve(self.base()), ("offline_preflight", ""))

    def test_exact_frozen_run_53_compose_is_selected(self):
        values = self.base()
        values.update({
            "PREPARED_SCHEMA": "v1", "MEASURE_ONLY": "false", "FORCE_REFRESH": "false",
            "CANDIDATE_MODE": "compose", "EXPECTED_SNAPSHOT_ID": "",
            **PRIMARY, **TNDS,
        })
        self.assertEqual(resolve(values), ("review_candidate", "compose"))

    def test_fresh_compose_or_changed_artifact_fails_closed(self):
        values = self.base()
        values.update({"PREPARED_SCHEMA": "v1", "MEASURE_ONLY": "false", "FORCE_REFRESH": "false", "CANDIDATE_MODE": "compose", "EXPECTED_SNAPSHOT_ID": ""})
        with self.assertRaises(ValueError):
            resolve(values)
        values.update(PRIMARY)
        values.update(TNDS)
        values["TNDS_DIGEST"] = "sha256:changed"
        with self.assertRaises(ValueError):
            resolve(values)


if __name__ == "__main__":
    unittest.main()
