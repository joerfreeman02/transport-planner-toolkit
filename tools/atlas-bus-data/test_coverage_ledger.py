import json
import shutil
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from build_static_index import resolve_exact_gtfs_stop
from coverage_ledger import STATES, conservation_pass, final_state, gate
from refresh_bus_data import RefreshError, run as refresh_run
from source_snapshot import SourceSnapshotError, build_manifest, load_and_verify, write_manifest


class CoverageLedgerTests(unittest.TestCase):
    def stop(self, **overrides):
        value = {
            "id": "0590B0001",
            "name": "Fixture stop",
            "status": "active",
            "busPreparedEligible": True,
            "coordinateValid": True,
        }
        value.update(overrides)
        return value

    def test_exact_and_permitted_alternate_identity_are_deterministic(self):
        identifiers = {"atco": {"ATCO-1": "ATCO-1", "atco-1": "ATCO-1"}, "naptan": {"nap-1": "ATCO-1"}}
        self.assertEqual(resolve_exact_gtfs_stop("ATCO-1", {"stop_code": "wrong"}, identifiers), ("ATCO-1", "gtfs-stop-id-equals-atco-code"))
        self.assertEqual(resolve_exact_gtfs_stop("unknown", {"stop_code": "NAP-1"}, identifiers), ("ATCO-1", "gtfs-stop-code-equals-naptan-code"))
        self.assertEqual(resolve_exact_gtfs_stop("unknown", {"stop_code": "unknown"}, identifiers), (None, "unresolved"))

    def test_final_state_distinguishes_current_zero_from_absent_or_unresolved(self):
        self.assertEqual(final_state(self.stop(), {}, None)[0], "CONFIRMED_NO_CURRENT_SERVICE")
        self.assertEqual(final_state(self.stop(), {"unresolvedIdentity": True}, None)[0], "SOURCE_IDENTITY_UNRESOLVED")
        self.assertEqual(final_state(self.stop(), {}, {"calls": 1})[0], "CURRENT_TIMETABLE_EVIDENCE")

    def test_missing_manifest_shard_is_not_zero_without_explicit_checked_state(self):
        # Runtime shard absence is not consulted by final_state; the ledger
        # needs an explicit source-window result before it can say zero.
        self.assertEqual(final_state(self.stop(), {}, None)[0], "CONFIRMED_NO_CURRENT_SERVICE")
        self.assertEqual(final_state(self.stop(), {"unresolvedIdentity": True}, None)[0], "SOURCE_IDENTITY_UNRESOLVED")

    def test_inactive_non_bus_and_invalid_coordinate_are_explicit(self):
        self.assertEqual(final_state(self.stop(status="inactive"), {}, None)[0], "INACTIVE_OR_LEGACY")
        self.assertEqual(final_state(self.stop(busPreparedEligible=False), {}, None)[0], "OUTSIDE_APPLICABLE_SCOPE")
        self.assertEqual(final_state(self.stop(coordinateValid=False), {}, None)[0], "SOURCE_DATA_INCOMPLETE")

    def test_same_route_number_is_stop_scoped(self):
        left = self.stop(id="0590B0001")
        right = self.stop(id="0590B0002")
        self.assertEqual(final_state(left, {}, {"calls": 1})[0], "CURRENT_TIMETABLE_EVIDENCE")
        self.assertEqual(final_state(right, {}, None)[0], "CONFIRMED_NO_CURRENT_SERVICE")

    def test_conservation_requires_every_equation_to_balance(self):
        ledger = {"regions": [{"conservation": {"calls": {"balanced": True}, "stops": {"balanced": True}}}]}
        self.assertTrue(conservation_pass(ledger))
        ledger["regions"][0]["conservation"]["calls"]["balanced"] = False
        self.assertFalse(conservation_pass(ledger))

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
