import json
import shutil
import sys
import unittest
import zipfile
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))

from build_static_index import resolve_exact_gtfs_stop
from coverage_ledger import STATES, _region_ledger, conservation_pass, final_state, gate, source_identity_trust
from refresh_bus_data import RefreshError, run as refresh_run
from source_snapshot import SourceSnapshotError, build_manifest, load_and_verify, write_manifest


class CoverageLedgerTests(unittest.TestCase):
    def stop(self, **overrides):
        value = {
            "id": "0590B0001",
            "name": "Fixture stop",
            "status": "active",
            "busPreparedEligible": True,
            "busDomainEligible": True,
            "timetableCallEligible": True,
            "timetableCallExpectation": "expected",
            "coordinateValid": True,
        }
        value.update(overrides)
        return value

    def test_exact_and_permitted_alternate_identity_are_deterministic(self):
        identifiers = {"atco": {"ATCO-1": "ATCO-1", "atco-1": "ATCO-1"}, "naptan": {"nap-1": "ATCO-1"}}
        self.assertEqual(resolve_exact_gtfs_stop("ATCO-1", {"stop_code": "wrong"}, identifiers), ("ATCO-1", "gtfs-stop-id-equals-atco-code"))
        self.assertEqual(resolve_exact_gtfs_stop("unknown", {"stop_code": "NAP-1"}, identifiers), ("ATCO-1", "gtfs-stop-code-equals-naptan-code"))
        self.assertEqual(resolve_exact_gtfs_stop("unknown", {"stop_code": "unknown"}, identifiers), (None, "unresolved"))

    def test_final_state_does_not_claim_service_absence_from_missing_call(self):
        self.assertEqual(final_state(self.stop(), {}, None)[0], "NO_CURRENT_PRIMARY_TIMETABLE_EVIDENCE")
        self.assertEqual(final_state(self.stop(), {"unresolvedIdentity": True}, None)[0], "SOURCE_IDENTITY_UNRESOLVED")
        self.assertEqual(final_state(self.stop(), {}, {"calls": 1})[0], "CURRENT_TIMETABLE_EVIDENCE")

    def test_missing_manifest_shard_is_not_zero_without_explicit_checked_state(self):
        # Runtime shard absence is not consulted by final_state; the ledger
        # needs an explicit source-window result before it can say zero.
        self.assertEqual(final_state(self.stop(), {}, None)[0], "NO_CURRENT_PRIMARY_TIMETABLE_EVIDENCE")
        self.assertEqual(final_state(self.stop(), {"unresolvedIdentity": True}, None)[0], "SOURCE_IDENTITY_UNRESOLVED")

    def test_access_point_is_bus_domain_but_not_timetable_call_point(self):
        self.assertEqual(final_state(self.stop(timetableCallEligible=False, timetableCallExpectation="not_expected"), {}, None)[0], "BUS_DOMAIN_NON_CALL_POINT")

    def test_bods_stops_txt_identity_is_independent_of_stop_times(self):
        root = Path(__file__).parents[2] / "tmp" / "bus-stops-txt-independence-test"
        root.mkdir(parents=True, exist_ok=True)
        archive = root / "region.zip"
        try:
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("agency.txt", "agency_id,agency_name\n")
                bundle.writestr("stops.txt", "stop_id,stop_code,stop_name\ngtfs-ent,N-ENT,Queensgate Entrance\ngtfs-bay,N-BAY,Queensgate Bay 1\n")
                bundle.writestr("routes.txt", "route_id,route_type,route_short_name\n")
                bundle.writestr("calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n")
                bundle.writestr("trips.txt", "route_id,service_id,trip_id\n")
                bundle.writestr("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n")
            naptan = SimpleNamespace(stops={
                "0590BCE01L": {
                    "id": "0590BCE01L", "naptanCode": "N-ENT", "name": "Queensgate Entrance", "status": "active",
                    "busDomainEligible": True, "coordinateValid": True, "logicalGroupRefs": [{"sourceId": "059GPB25"}],
                },
                "0590PQG01": {
                    "id": "0590PQG01", "naptanCode": "N-BAY", "name": "Queensgate Bay 1", "status": "active",
                    "busDomainEligible": True, "coordinateValid": True, "logicalGroupRefs": [{"sourceId": "059GPB25"}],
                },
            }, groups={"naptan:059GPB25": {"sourceMemberStopPointIds": ["0590BCE01L", "0590PQG01"]}})
            report, _per_stop, raw = _region_ledger(archive, "fixture", date(2026, 10, 13), naptan, {})
            self.assertEqual(report["naptanIdentityStopsTxtRecords"], 2)
            self.assertEqual(raw["0590BCE01L"][0]["evidenceType"], "stops.txt")
            self.assertEqual(raw["0590BCE01L"][0]["matchMethod"], "gtfs-stop-code-equals-naptan-code")
            self.assertEqual(raw["0590PQG01"][0]["evidenceType"], "stops.txt")
            self.assertEqual(raw["0590PQG01"][0]["matchMethod"], "gtfs-stop-code-equals-naptan-code")
            self.assertEqual(report["relevantScheduledCalls"], 0)
        finally:
            archive.unlink(missing_ok=True)
            root.rmdir()

    def test_inactive_non_bus_and_invalid_coordinate_are_explicit(self):
        self.assertEqual(final_state(self.stop(status="inactive"), {}, None)[0], "INACTIVE_OR_LEGACY")
        self.assertEqual(final_state(self.stop(busPreparedEligible=False, busDomainEligible=False), {}, None)[0], "OUTSIDE_APPLICABLE_SCOPE")
        self.assertEqual(final_state(self.stop(coordinateValid=False), {}, None)[0], "SOURCE_DATA_INCOMPLETE")

    def test_same_route_number_is_stop_scoped(self):
        left = self.stop(id="0590B0001")
        right = self.stop(id="0590B0002")
        self.assertEqual(final_state(left, {}, {"calls": 1})[0], "CURRENT_TIMETABLE_EVIDENCE")
        self.assertEqual(final_state(right, {}, None)[0], "NO_CURRENT_PRIMARY_TIMETABLE_EVIDENCE")

    def test_conservation_requires_every_equation_to_balance(self):
        ledger = {"regions": [{"conservation": {"calls": {"balanced": True}, "stops": {"balanced": True}}}]}
        self.assertTrue(conservation_pass(ledger))
        ledger["regions"][0]["conservation"]["calls"]["balanced"] = False
        self.assertFalse(conservation_pass(ledger))

    def test_stop_classification_does_not_hide_unresolved_source_identities(self):
        trust = source_identity_trust([{
            "relevantScheduledCalls": 5000, "resolvedScheduledCalls": 92, "unresolvedStopIdentities": 4908,
            "conservation": {"relevantScheduledCalls": {"balanced": True}},
        }], stop_points_fully_classified=True)
        self.assertTrue(trust["stopPointsFullyClassified"])
        self.assertFalse(trust["sourceIdentitiesFullyResolved"])
        self.assertEqual(trust["unresolvedScheduledCallIdentityRecords"], 4908)
        self.assertTrue(trust["identityConservationBalanced"])

    def test_unclassified_and_preparation_error_gate(self):
        root = Path(__file__).parents[2] / "tmp" / "bus-data-prep-1-coverage-test"
        shutil.rmtree(root, ignore_errors=True)
        root.mkdir(parents=True)
        try:
            path = root / "coverage-ledger.json"
            path.write_text(json.dumps({"coverage": {"unclassifiedRemainder": 0, "preparationErrorCount": 0}}), encoding="utf-8")
            self.assertEqual(gate(path)["ok"], True)
            path.write_text(json.dumps({"coverage": {"unclassifiedRemainder": 1, "preparationErrorCount": 0}}), encoding="utf-8")
            with self.assertRaises(SystemExit):
                gate(path)
            path.write_text(json.dumps({"coverage": {"unclassifiedRemainder": 0, "preparationErrorCount": 1}}), encoding="utf-8")
            with self.assertRaises(SystemExit):
                gate(path)
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def test_wrong_snapshot_id_rejected(self):
        root = Path(__file__).parents[2] / "tmp" / "bus-data-prep-1-snapshot-test"
        shutil.rmtree(root, ignore_errors=True)
        (root / "sources").mkdir(parents=True)
        try:
            (root / "sources" / "naptan.xml").write_text("naptan", encoding="utf-8")
            (root / "sources" / "nptg.xml").write_text("nptg", encoding="utf-8")
            digest = __import__("hashlib").sha256
            entries = [
                {"path": "sources/naptan.xml", "sha256": digest(b"naptan").hexdigest(), "bytes": 6},
                {"path": "sources/nptg.xml", "sha256": digest(b"nptg").hexdigest(), "bytes": 4},
            ]
            write_manifest(root, build_manifest(root, source_entries=entries))
            self.assertEqual(load_and_verify(root, require_bods=False)["sourceCount"], 2)
            with self.assertRaisesRegex(SourceSnapshotError, "ID mismatch"):
                load_and_verify(root, require_bods=False, expected_snapshot_id="wrong")
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def test_acquisition_disabled_requires_snapshot_and_does_not_touch_source(self):
        root = Path(__file__).parents[2] / "tmp" / "bus-data-prep-1-acquisition-disabled-test"
        shutil.rmtree(root, ignore_errors=True)
        root.mkdir(parents=True)
        source = root / "frozen-source-marker"
        source.write_text("immutable", encoding="utf-8")
        before = source.read_bytes()
        try:
            args = type("Args", (), {
                "site_root": str(root / "site"), "previous_root": None,
                "prepared_schema": "v2", "bus_only_diagnostic": True,
                "source_snapshot": None, "source_snapshot_output": None,
                "acquisition_disabled": True,
            })()
            with self.assertRaisesRegex(RefreshError, "requires --source-snapshot"):
                refresh_run(args)
            self.assertEqual(source.read_bytes(), before)
        finally:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
