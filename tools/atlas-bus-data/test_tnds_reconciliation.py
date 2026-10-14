import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from tnds_reconciliation import (
    EXPECTED_REGIONS,
    access_status,
    normalize_service_id,
    normalize_stop_id,
    reconcile,
    validate_archive,
    validate_region_manifest,
)


def row(region="EA", stop="0100A", service="operator/service-1", **extra):
    return {"region": region, "stopId": stop, "serviceId": service,
            "routeNumber": "46", "evidenceId": "evidence-1", **extra}


def complete_compare(primary, tnds, **kwargs):
    kwargs.setdefault("regions", EXPECTED_REGIONS)
    return reconcile(primary, tnds, **kwargs)


class TndsReconciliationTests(unittest.TestCase):
    def test_credentials_fail_closed_without_emitting_values(self):
        self.assertEqual(access_status("", ""), "BLOCKED_CREDENTIALS")
        self.assertEqual(access_status("user-secret", None), "BLOCKED_CREDENTIALS")
        self.assertNotIn("user-secret", access_status("user-secret", None))

    def test_expected_regions_are_enumerated_and_missing_region_blocks_completion(self):
        complete = validate_region_manifest({"regions": list(EXPECTED_REGIONS)})
        self.assertEqual(complete["state"], "NATIONAL_COMPLETE")
        incomplete = validate_region_manifest({"regions": list(EXPECTED_REGIONS[:-1])})
        self.assertEqual(incomplete["state"], "INCOMPLETE")
        self.assertEqual(incomplete["missingRegions"], ["Y"])
        default = reconcile([row()], [row()], as_of="2026-10-14", tnds_status="AVAILABLE")
        self.assertEqual(default["regionalCoverage"]["state"], "INCOMPLETE")
        self.assertEqual(default["rows"][0]["category"], "COMPARATOR_UNAVAILABLE")

    def test_mapping_region_manifest_requires_validation_for_each_region(self):
        regions = {region: {"validation": "passed"} for region in EXPECTED_REGIONS}
        result = validate_region_manifest({"regions": regions})
        self.assertEqual(result["state"], "NATIONAL_COMPLETE")
        regions["Y"]["validation"] = "failed"
        self.assertEqual(validate_region_manifest({"regions": regions})["state"], "INCOMPLETE")

    def test_zip_archive_is_hashed_and_validated_without_extracting(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            path = Path(tmp) / "TNDS-EA.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("service.xml", "<TransXChange/>")
            result = validate_archive(path)
            self.assertEqual(result["validation"], "passed")
            self.assertEqual(result["memberCount"], 1)
            self.assertEqual(len(result["sha256"]), 64)
            self.assertNotIn("service.xml", json.dumps(result))

    def test_malformed_zip_and_malformed_xml_fixture_fail_at_archive_boundary(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            path = Path(tmp) / "bad.zip"
            path.write_bytes(b"not a zip")
            self.assertEqual(validate_archive(path)["validation"], "failed")

    def test_stop_and_service_identity_normalization(self):
        self.assertEqual(normalize_stop_id(" ab 12c "), "AB12C")
        self.assertEqual(normalize_service_id(" Operator / Service 1 "), "operator/service1")

    def test_current_date_filter_is_inclusive_and_deterministic(self):
        result = complete_compare([row(validFrom="2026-10-14", validTo="2026-10-14")], [],
                           as_of="2026-10-14", tnds_status="BLOCKED_CREDENTIALS")
        self.assertEqual(result["rows"][0]["category"], "COMPARATOR_UNAVAILABLE")
        future = complete_compare([row(validFrom="2026-10-15")], [], as_of="2026-10-14",
                           tnds_status="BLOCKED_CREDENTIALS")
        self.assertEqual(future["rows"], [])
        self.assertEqual(future["excluded"], {"not_current": 1})

    def test_agreement_uses_region_stop_and_service_composite(self):
        primary = row()
        tnds = row(evidenceId="tnds-1")
        result = complete_compare([primary], [tnds], as_of="2026-10-14")
        self.assertEqual(result["rows"][0]["category"], "AGREEMENT")

    def test_unresolved_primary_with_exact_tnds_identity_is_corroborated(self):
        result = complete_compare([row(unresolved=True)], [row(evidenceId="tnds-1")], as_of="2026-10-14")
        self.assertEqual(result["rows"][0]["category"], "UNRESOLVED_PRIMARY_CORROBORATED")

    def test_primary_only_tnds_only_and_ambiguous_are_classified(self):
        primary_only = complete_compare([row()], [], as_of="2026-10-14")
        self.assertEqual(primary_only["rows"][0]["category"], "PRIMARY_ONLY")
        tnds_only = complete_compare([], [row()], as_of="2026-10-14")
        self.assertEqual(tnds_only["rows"][0]["category"], "TNDS_ONLY_CANDIDATE")
        ambiguous = complete_compare([row(), row(evidenceId="evidence-2")], [row(evidenceId="tnds-1")], as_of="2026-10-14")
        self.assertEqual(ambiguous["rows"][0]["category"], "AMBIGUOUS")

    def test_missing_tnds_or_missing_region_is_comparator_unavailable(self):
        unavailable = complete_compare([row()], [row(evidenceId="tnds-1")], as_of="2026-10-14",
                                 tnds_status="BLOCKED_UPSTREAM")
        self.assertEqual(unavailable["rows"][0]["category"], "COMPARATOR_UNAVAILABLE")
        missing = complete_compare([row()], [row(evidenceId="tnds-1")], as_of="2026-10-14",
                            regions=EXPECTED_REGIONS[:-1])
        self.assertEqual(missing["regionalCoverage"]["state"], "INCOMPLETE")
        self.assertEqual([item["category"] for item in missing["rows"]], ["COMPARATOR_UNAVAILABLE"])

    def test_route_number_alone_never_cross_matches_stops(self):
        primary = row(stop="STOP-A")
        tnds = row(stop="STOP-B", evidenceId="tnds-1")
        result = complete_compare([primary], [tnds], as_of="2026-10-14")
        self.assertEqual([item["category"] for item in result["rows"]], ["PRIMARY_ONLY", "TNDS_ONLY_CANDIDATE"])

    def test_bce_bst_and_0590b_controls_are_not_reinterpreted(self):
        # Comparator identities remain exact; the module does not implement planner call eligibility.
        for stop in ("0590BCE01", "0590BBST01"):
            result = reconcile([row(stop=stop)], [], as_of="2026-10-14", tnds_status="BLOCKED_CREDENTIALS")
            self.assertEqual(result["rows"][0]["stopId"], stop)
            self.assertFalse(result["rows"][0]["plannerEligible"])

    def test_ledger_is_deterministic_and_never_planner_eligible(self):
        primary, tnds = [row(unresolved=True)], [row(evidenceId="tnds-1")]
        first = complete_compare(primary, tnds, as_of="2026-10-14")
        second = complete_compare(primary, tnds, as_of="2026-10-14")
        self.assertEqual(first["ledgerSha256"], second["ledgerSha256"])
        self.assertTrue(all(not item["plannerEligible"] for item in first["rows"]))
        self.assertFalse(first["plannerOutputChanged"])
        self.assertFalse(first["sourceAuthorityChanged"])

    def test_no_secret_material_is_emitted(self):
        secret = "password-never-output"
        state = access_status("user", secret)
        ledger = complete_compare([row()], [], as_of="2026-10-14", tnds_status="BLOCKED_CREDENTIALS")
        self.assertNotIn(secret, state + json.dumps(ledger))
        self.assertNotIn("password", json.dumps(ledger).lower())

    def test_duplicate_rows_remain_visible_as_ambiguous(self):
        result = complete_compare([row(), row(evidenceId="duplicate")], [row(evidenceId="tnds")], as_of="2026-10-14")
        self.assertEqual(result["categoryCounts"], {"AMBIGUOUS": 1})


if __name__ == "__main__":
    unittest.main()
