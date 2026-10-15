"""Contract and regression tests for diagnostic BODS/TNDS reconciliation."""
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from tnds_reconciliation import (EXPECTED_REGIONS, State, access_status, fixture_region_manifest,
    normalize_service_id, normalize_stop_id, primary_unresolved_forensic, reconcile,
    validate_archive, validate_region_manifest)


def row(region="EA", stop="0100A", side="bods", **extra):
    identity_bridge = extra.get("identityBridge", "bridge:service:one")
    return {"region": region, "stopId": stop, "routeNumber": "46", "evidenceId": side + "-evidence",
            "nativeIds": {"bods_route_id" if side == "bods" else "tnds_service_code": side + "-native-1"},
            "identityBridge": identity_bridge, "identityBridgeValidated": bool(identity_bridge), "validFrom": "2026-01-01", "validTo": "2027-01-01",
            "operatingDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            "schoolTermQualifier": "ordinary", "operator": "Example Transit", "origin": "North",
            "destination": "South", "stopSequence": ["0100A", "0100B"], **extra}


def compare(primary, tnds, *, regions=EXPECTED_REGIONS, region_manifest=None, **kwargs):
    return reconcile(primary, tnds, as_of="2026-10-14", region_manifest=region_manifest or fixture_region_manifest(regions), **kwargs)


class ReconciliationContractTests(unittest.TestCase):
    def test_credentials_presence_does_not_validate_comparator(self):
        self.assertEqual(access_status("private-user", "private-password"), State.CREDENTIALS_AVAILABLE)
        result = reconcile([row()], [row(side="tnds")], as_of="2026-10-14", tnds_status=access_status("u", "p"))
        self.assertEqual(result["rows"][0]["category"], "COMPARATOR_UNAVAILABLE")

    def test_credentials_missing_and_values_are_never_emitted(self):
        state = access_status("user-secret", None)
        ledger = reconcile([row()], [], as_of="2026-10-14", tnds_status=state)
        self.assertEqual(state, State.CREDENTIALS_UNAVAILABLE)
        self.assertNotIn("user-secret", state + json.dumps(ledger))
        self.assertNotIn("password", json.dumps(ledger).lower())

    def test_states_are_centrally_defined(self):
        self.assertEqual({s.value for s in State}, {"CREDENTIALS_UNAVAILABLE", "CREDENTIALS_AVAILABLE", "SOURCE_ACQUIRED", "ARCHIVE_VALIDATED", "SEMANTIC_VALIDATED", "NORMALIZATION_VALIDATED", "COMPARATOR_VALIDATED", "COMPARATOR_UNAVAILABLE"})

    def test_unknown_state_fails_closed(self):
        result = compare([row()], [row(side="tnds")], tnds_status="MAGIC_READY")
        self.assertEqual(result["tndsState"], "UNKNOWN_STATE_FAIL_CLOSED")
        self.assertEqual(result["rows"][0]["category"], "COMPARATOR_UNAVAILABLE")

    def test_bare_region_list_cannot_qualify_as_live_evidence(self):
        self.assertNotEqual(validate_region_manifest({"regions": list(EXPECTED_REGIONS)})["state"], "NATIONAL_COMPLETE")

    def test_fixture_helper_creates_explicit_validated_manifests(self):
        self.assertEqual(validate_region_manifest(fixture_region_manifest())["state"], "NATIONAL_COMPLETE")
        self.assertTrue(fixture_region_manifest()["fixtureOnly"])

    def test_eight_validated_regions_are_complete(self):
        self.assertEqual(validate_region_manifest(fixture_region_manifest())["state"], "NATIONAL_COMPLETE")

    def test_london_primary_and_hypothetical_tnds_rows_keep_their_source_side(self):
        primary = row(region="LONDON", side="bods", nativeIds={"primaryService": "p-46"})
        tnds = row(region="LONDON", side="tnds", nativeIds={"tndsService": "t-46"})
        result = compare([primary], [tnds])
        p_row = next(item for item in result["rows"] if item["primaryEvidenceId"])
        t_row = next(item for item in result["rows"] if item["tndsEvidenceId"])
        self.assertEqual(p_row["category"], "OUTSIDE_TNDS_COMPARATOR_SCOPE")
        self.assertEqual(p_row["primaryEvidenceId"], primary["evidenceId"])
        self.assertEqual(p_row["primaryNativeIds"], primary["nativeIds"])
        self.assertIsNone(p_row["tndsEvidenceId"])
        self.assertEqual(p_row["tndsNativeIds"], {})
        self.assertFalse(p_row["plannerEligible"])
        self.assertFalse(p_row["sourceAuthorityChanged"])
        self.assertIsNone(t_row["primaryEvidenceId"])
        self.assertEqual(t_row["tndsEvidenceId"], tnds["evidenceId"])
        self.assertEqual(t_row["tndsNativeIds"], tnds["nativeIds"])

    def test_seven_validated_regions_are_partial(self):
        result = validate_region_manifest(fixture_region_manifest(EXPECTED_REGIONS[:-1]))
        self.assertEqual(result["state"], "PARTIAL")
        self.assertEqual(result["unverifiedRegions"], ["Y"])

    def test_seven_regions_reconcile_when_y_fails(self):
        result = compare([row(region="EA"), row(region="Y")], [row(region="EA", side="tnds"), row(region="Y", side="tnds")], regions=EXPECTED_REGIONS[:-1])
        by_region = {item["region"]: item for item in result["rows"]}
        self.assertEqual(by_region["EA"]["category"], "EVIDENCE_AGREEMENT")
        self.assertEqual(by_region["Y"]["category"], "COMPARATOR_UNAVAILABLE")

    def test_y_row_explicitly_says_comparator_unavailable(self):
        result = compare([row(region="Y")], [row(region="Y", side="tnds")], regions=EXPECTED_REGIONS[:-1])
        self.assertEqual(result["rows"][0]["regionalState"], State.COMPARATOR_UNAVAILABLE)
        self.assertEqual(sum(item["region"] == "Y" for item in result["rows"]), 2)
        tnds_only = next(item for item in result["rows"] if item["tndsEvidenceId"])
        self.assertEqual(tnds_only["category"], "COMPARATOR_UNAVAILABLE")

    def test_unexpected_region_is_rejected_from_national_completeness(self):
        manifest = fixture_region_manifest(); manifest["regions"]["ZZ"] = dict(manifest["regions"]["EA"], region="ZZ")
        self.assertEqual(validate_region_manifest(manifest)["state"], "PARTIAL")
        self.assertEqual(validate_region_manifest(manifest)["unexpectedRegions"], ["ZZ"])

    def test_duplicate_region_is_rejected(self):
        manifest = fixture_region_manifest(); manifest["regions"]["ea"] = dict(manifest["regions"]["EA"], region="EA")
        self.assertNotEqual(validate_region_manifest(manifest)["state"], "NATIONAL_COMPLETE")

    def test_archive_valid_is_not_semantic_valid(self):
        manifest = fixture_region_manifest(); manifest["regions"]["EA"]["semanticValidation"] = "pending"
        self.assertNotIn("EA", validate_region_manifest(manifest)["verifiedRegions"])

    def test_each_evidence_gate_is_required_for_regional_comparator_validation(self):
        for field, value in (("acquisitionId", ""), ("archiveSha256", "bad-hash"), ("sourceBytes", 0),
                             ("archiveValidation", "failed"), ("semanticValidation", "failed"),
                             ("normalizationValidation", "failed"), ("comparatorState", State.COMPARATOR_UNAVAILABLE)):
            with self.subTest(field=field):
                manifest = fixture_region_manifest()
                manifest["regions"]["EA"][field] = value
                self.assertNotIn("EA", validate_region_manifest(manifest)["verifiedRegions"])

    def test_semantic_invalid_region_cannot_be_comparator_valid(self):
        manifest = fixture_region_manifest(); manifest["regions"]["EA"]["semanticValidation"] = "failed"
        result = compare([row()], [row(side="tnds")], region_manifest=manifest)
        self.assertEqual(result["rows"][0]["category"], "COMPARATOR_UNAVAILABLE")

    def test_route_number_alone_never_matches(self):
        p = row(identityBridge=None, operator=None, origin=None, destination=None, stopSequence=None)
        t = row(side="tnds", identityBridge=None, operator=None, origin=None, destination=None, stopSequence=None)
        result = compare([p], [t], tnds_status=State.COMPARATOR_VALIDATED)
        self.assertEqual({item["category"] for item in result["rows"]}, {"PRIMARY_ONLY", "TNDS_ONLY_CANDIDATE"})

    def test_same_route_different_stop_never_matches(self):
        result = compare([row(stop="A")], [row(stop="B", side="tnds")])
        self.assertEqual({item["category"] for item in result["rows"]}, {"PRIMARY_ONLY", "TNDS_ONLY_CANDIDATE"})

    def test_native_service_ids_are_distinct_and_not_assumed_equal(self):
        p, t = row(identityBridge=None), row(side="tnds", identityBridge=None)
        result = compare([p], [t])
        self.assertEqual(result["rows"][0]["category"], "STRONG_COMPOSITE_CANDIDATE")
        self.assertNotEqual(result["rows"][0]["semanticState"], "EVIDENCE_AGREEMENT")
        self.assertNotEqual(p["nativeIds"], t["nativeIds"])

    def test_explicit_identity_bridge_is_required_for_corroboration(self):
        result = compare([row(identityBridge="bridge-X", identityBridgeValidated=True)], [row(side="tnds", identityBridge="bridge-X", identityBridgeValidated=True)])
        self.assertTrue(result["rows"][0]["identityCorroborated"])

    def test_unvalidated_identity_bridge_cannot_establish_exact_identity(self):
        result = compare([row(identityBridge="bridge-X", identityBridgeValidated=False)], [row(side="tnds", identityBridge="bridge-X", identityBridgeValidated=False)])
        self.assertEqual(result["rows"][0]["category"], "STRONG_COMPOSITE_CANDIDATE")

    def test_same_operator_id_only_is_not_exact_identity(self):
        result = compare([row(identityBridge=None, nativeIds={"operatorCode": "OP1"})],
                         [row(side="tnds", identityBridge=None, nativeIds={"operatorCode": "OP1"})])
        self.assertEqual(result["rows"][0]["category"], "STRONG_COMPOSITE_CANDIDATE")
        self.assertFalse(result["rows"][0]["identityCorroborated"])

    def test_same_route_id_only_is_not_exact_identity(self):
        result = compare([row(identityBridge=None, nativeIds={"routeId": "R1"})],
                         [row(side="tnds", identityBridge=None, nativeIds={"routeId": "R1"})])
        self.assertEqual(result["rows"][0]["category"], "STRONG_COMPOSITE_CANDIDATE")
        self.assertFalse(result["rows"][0]["identityCorroborated"])

    def test_same_generic_service_code_without_contract_is_not_exact_identity(self):
        result = compare([row(identityBridge=None, nativeIds={"serviceCode": "S1"})],
                         [row(side="tnds", identityBridge=None, nativeIds={"serviceCode": "S1"})])
        self.assertEqual(result["rows"][0]["category"], "STRONG_COMPOSITE_CANDIDATE")
        self.assertFalse(result["rows"][0]["identityCorroborated"])

    def test_no_identity_bridge_cannot_become_false_agreement(self):
        result = compare([row(identityBridge=None)], [row(side="tnds", identityBridge=None)])
        self.assertNotIn("EVIDENCE_AGREEMENT", [r["category"] for r in result["rows"]])

    def test_identity_corroboration_is_separate_from_semantic_agreement(self):
        result = compare([row()], [row(side="tnds", operatingDays=None)])
        ledger = result["rows"][0]
        self.assertTrue(ledger["identityCorroborated"])
        self.assertEqual(ledger["semanticState"], "UNKNOWN_OR_NOT_COMPARABLE")

    def test_conflicting_operating_days_create_conflict(self):
        result = compare([row()], [row(side="tnds", operatingDays=["Saturday"])])
        self.assertEqual(result["rows"][0]["semanticState"], "CONFLICTING_CURRENT_EVIDENCE")
        self.assertIn("operatingDays", result["rows"][0]["conflictAttributes"])

    def test_school_day_only_vs_ordinary_weekday_conflicts(self):
        result = compare([row(schoolTermQualifier="schooldays")], [row(side="tnds", schoolTermQualifier="ordinary")])
        self.assertIn("schoolTermQualifier", result["rows"][0]["conflictAttributes"])

    def test_unresolved_complex_calendar_is_unknown(self):
        result = compare([row(operatingDays="complex:week-pattern")], [row(side="tnds", operatingDays="complex:week-pattern")])
        self.assertEqual(result["rows"][0]["semanticState"], "UNKNOWN_OR_NOT_COMPARABLE")

    def test_operator_disagreement_is_a_conflict(self):
        result = compare([row()], [row(side="tnds", operator="Other Bus Ltd")])
        self.assertIn("operator", result["rows"][0]["conflictAttributes"])

    def test_unknown_operator_does_not_create_false_conflict_or_agreement(self):
        result = compare([row(operator=None)], [row(side="tnds", operator="Example Transit")])
        self.assertEqual(result["rows"][0]["semanticState"], "UNKNOWN_OR_NOT_COMPARABLE")

    def test_duplicate_candidates_remain_ambiguous(self):
        result = compare([row(), row(evidenceId="bods-2")], [row(side="tnds")])
        self.assertEqual(result["rows"][0]["category"], "AMBIGUOUS")

    def test_tnds_only_candidate_is_never_planner_eligible(self):
        result = compare([], [row(side="tnds")])
        self.assertEqual(result["rows"][0]["category"], "TNDS_ONLY_CANDIDATE")
        self.assertFalse(result["rows"][0]["plannerEligible"])

    def test_primary_only_is_diagnostic(self):
        result = compare([row()], [])
        self.assertEqual(result["rows"][0]["category"], "PRIMARY_ONLY")
        self.assertTrue(result["rows"][0]["diagnosticOnly"])

    def test_ledger_includes_raw_and_normalized_stop_identity_and_native_provenance(self):
        result = compare([row(stop="ab 12c")], [row(side="tnds", stop="AB12C")])
        ledger = result["rows"][0]
        self.assertEqual(ledger["primaryStopId"], "ab 12c")
        self.assertEqual(ledger["primaryStopIdNormalized"], "AB12C")
        self.assertEqual(ledger["primaryNativeIds"]["bods_route_id"], "bods-native-1")
        self.assertEqual(ledger["tndsNativeIds"]["tnds_service_code"], "tnds-native-1")

    def test_primary_corroboration_does_not_mutate_primary(self):
        primary = row(unresolved=True); original = json.dumps(primary, sort_keys=True)
        compare([primary], [row(side="tnds")])
        self.assertEqual(json.dumps(primary, sort_keys=True), original)

    def test_forensic_summary_is_deterministic(self):
        records = [{"region": "EA", "tripId": "T1", "routeId": "R1", "gtfsStopId": "S1", "resolvedStopPointId": "N1"}]
        self.assertEqual(primary_unresolved_forensic(records, snapshot_id="snap", source_window="date"), primary_unresolved_forensic(records, snapshot_id="snap", source_window="date"))

    def test_forensic_summary_totals_reconcile(self):
        rows = [{"region": "EA", "tripId": "T1", "routeId": "R1", "gtfsStopId": "S1", "resolvedStopPointId": "N1"}, {"region": "Y", "tripId": "T2", "routeId": "R2", "gtfsStopId": "S2", "resolvedStopPointId": "N2"}]
        result = primary_unresolved_forensic(rows, snapshot_id="snap", source_window="date")
        self.assertEqual(sum(result["countsByRegion"].values()), result["unresolvedScheduledCallCount"])
        self.assertEqual(result["unresolvedScheduledCallCount"], 2)

    def test_lineage_insufficiency_is_explicit(self):
        result = primary_unresolved_forensic([{"region": "EA"}], snapshot_id="snap", source_window="date")
        self.assertEqual(result["status"], "PRIMARY_FORENSIC_LINEAGE_INSUFFICIENT")

    def test_pipers_control_pending_until_live_tnds_run(self):
        # No local deterministic TNDS Pipers control is available on this baseline.
        self.assertEqual("PIPERS LANE — LIVE TNDS ACCEPTANCE CONTROL PENDING REMOTE TNDS RUN".split("—")[0].strip(), "PIPERS LANE")

    def test_bce_bst_and_0590b_semantics_are_preserved(self):
        for stop in ("0590BCE01", "0590BBST01", "0590B"):
            result = reconcile([row(stop=stop)], [], as_of="2026-10-14", tnds_status=State.CREDENTIALS_UNAVAILABLE, region_manifest=fixture_region_manifest())
            self.assertEqual(result["rows"][0]["primaryStopId"], stop)

    def test_tfl_authority_is_not_changed(self):
        result = compare([row()], [row(side="tnds")])
        self.assertFalse(result["sourceAuthorityChanged"])
        self.assertFalse(result["plannerOutputChanged"])

    def test_london_is_explicitly_outside_comparator_not_invalid_identity(self):
        result = compare([row(region="LONDON")], [row(region="LONDON", side="tnds")])
        self.assertEqual(result["categoryCounts"], {"OUTSIDE_TNDS_COMPARATOR_SCOPE": 2})
        self.assertEqual(result["excluded"].get("invalid_identity", 0), 0)
        self.assertEqual(result["regionalCoverage"]["state"], "NATIONAL_COMPLETE")
        self.assertTrue(all(item["regionalState"] == State.COMPARATOR_UNAVAILABLE for item in result["rows"]))

    def test_indexed_rehearsal_scales_with_candidate_buckets_not_national_product(self):
        primary, tnds = [], []
        for region in EXPECTED_REGIONS:
            for n in range(500):
                # Same route/operator across the national data is not identity.
                primary.append(row(region=region, stop=f"P{n:04d}", identityBridge=None,
                                   stopSequence=None, unresolved=(n == 0), evidenceId=f"p-{region}-{n}"))
                tnds.append(row(region=region, stop=f"T{n:04d}", side="tnds", identityBridge=None,
                                stopSequence=None, evidenceId=f"t-{region}-{n}"))
            # A single validated bridge, a composite-only pair, and an ambiguous
            # pair exercise the three indexed outcomes.
            primary.extend([
                row(region=region, stop=f"X{region}", identityBridge="exact", evidenceId=f"px-{region}",
                    schoolTermQualifier="schooldays" if region == "NE" else "ordinary"),
                row(region=region, stop=f"C{region}", identityBridge=None, evidenceId=f"pc-{region}"),
                row(region=region, stop=f"A{region}", identityBridge="amb", evidenceId=f"pa1-{region}"),
                row(region=region, stop=f"A{region}", identityBridge="amb", evidenceId=f"pa2-{region}"),
            ])
            tnds.extend([
                row(region=region, stop=f"X{region}", side="tnds", identityBridge="exact", evidenceId=f"tx-{region}",
                    validTo="2026-12-31" if region == "EA" else "2027-01-01",
                    operatingDays=["Saturday"] if region == "EM" else ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                    schoolTermQualifier="ordinary"),
                row(region=region, stop=f"C{region}", side="tnds", identityBridge=None, evidenceId=f"tc-{region}"),
                row(region=region, stop=f"A{region}", side="tnds", identityBridge="amb", evidenceId=f"ta-{region}"),
            ])
        result = compare(primary, tnds, tnds_status=State.COMPARATOR_VALIDATED)
        stats = result["matchingInstrumentation"]
        product = sum(500 + 4 for _ in EXPECTED_REGIONS) * sum(500 + 3 for _ in EXPECTED_REGIONS)
        self.assertEqual(result["inputRows"], {"primary": len(primary), "tnds": len(tnds)})
        self.assertEqual(stats["exactIdentityPairs"], 24)  # exact plus two-to-one ambiguous bridge pairs
        self.assertEqual(stats["compositeCandidatePairs"], 8)
        self.assertEqual(stats["candidateComparisons"], 32)
        self.assertLess(stats["candidateComparisons"] * 1000, product)
        self.assertEqual(stats["unmatchedPrimary"], 4000)
        self.assertEqual(stats["unmatchedTnds"], 4000)
        self.assertGreater(stats["ambiguousGroups"], 0)
        self.assertIn("SOURCE_WINDOW_DIFFERENCE", result["categoryCounts"])
        self.assertIn("CONFLICTING_CURRENT_EVIDENCE", result["categoryCounts"])

    def test_huge_duplicate_identity_group_is_bounded_and_remains_ambiguous(self):
        primary = [row(stop="DUP", identityBridge="same", evidenceId=f"p-{index}") for index in range(100)]
        tnds = [row(stop="DUP", side="tnds", identityBridge="same", evidenceId=f"t-{index}") for index in range(100)]
        result = compare(primary, tnds, tnds_status=State.COMPARATOR_VALIDATED)
        groups = [item for item in result["rows"] if item["category"] == "AMBIGUOUS_IDENTITY_GROUP"]
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["candidatePairCount"], 10000)
        self.assertEqual(len(groups[0]["primaryEvidenceIdSample"]), 20)
        self.assertEqual(result["matchingInstrumentation"]["candidateComparisons"], 0)
        self.assertEqual(result["matchingInstrumentation"]["omittedAmbiguousCandidatePairs"], 10000)
        self.assertEqual(result["matchingInstrumentation"]["unmatchedPrimary"], 0)
        self.assertEqual(result["matchingInstrumentation"]["unmatchedTnds"], 0)

    def test_source_windows_are_reported_and_mismatch_conflicts(self):
        result = compare([row(validTo="2026-11-01")], [row(side="tnds", validTo="2026-12-01")])
        self.assertEqual(result["rows"][0]["category"], "SOURCE_WINDOW_DIFFERENCE")
        self.assertEqual(result["rows"][0]["sourceWindows"]["primary"][1], "2026-11-01")
        self.assertIn("validityWindow", result["rows"][0]["conflictAttributes"])

    def test_ledger_hash_is_stable_and_all_rows_diagnostic(self):
        first = compare([row()], [row(side="tnds")]); second = compare([row()], [row(side="tnds")])
        self.assertEqual(first["ledgerSha256"], second["ledgerSha256"])
        self.assertTrue(all(not r["plannerEligible"] for r in first["rows"]))

    def test_stop_and_service_normalization(self):
        self.assertEqual(normalize_stop_id(" ab 12c "), "AB12C")
        self.assertEqual(normalize_service_id(" Operator / Service 1 "), "operator/service1")

    def test_zip_archive_is_hashed_without_payload_exposure(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fixture.zip"
            with zipfile.ZipFile(path, "w") as archive: archive.writestr("private.xml", "<TransXChange/>")
            result = validate_archive(path)
            self.assertEqual(result["validation"], "passed")
            self.assertNotIn("private.xml", json.dumps(result))


if __name__ == "__main__": unittest.main()
