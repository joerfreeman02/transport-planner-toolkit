import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from primary_unresolved_forensic import (csv_index, exact_identity_match, identity_shape,
                                         normalize_exact_stop_identity,
                                         read_naptan_identity_sets)


class PrimaryForensicSafetyTests(unittest.TestCase):
    def test_duplicate_gtfs_keys_are_counted_and_not_silently_overwritten(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("stops.txt", "stop_id,stop_name\nA,first\nB,other\nA,duplicate\n")
        with zipfile.ZipFile(buffer) as archive:
            index, stats = csv_index(archive, "stops.txt", "stop_id")
        self.assertEqual(index, {"B": {"stop_id": "B", "stop_name": "other"}})
        self.assertEqual(stats["duplicateKeyCount"], 1)
        self.assertEqual(stats["duplicateRowCount"], 1)
        self.assertEqual(stats["duplicateKeySamples"], ["A"])

    def test_naptan_codes_are_exact_and_shapes_are_diagnostic(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "naptan.xml"
            path.write_text('<NaPTAN><StopPoints><StopPoint><AtcoCode>0100BRP90311</AtcoCode><NaptanCode>bstgwpm</NaptanCode></StopPoint></StopPoints></NaPTAN>', encoding="utf-8")
            atco, naptan, profile = read_naptan_identity_sets(path)
        self.assertIn("0100brp90311", atco)
        self.assertIn("bstgwpm", naptan)
        self.assertIn(normalize_exact_stop_identity("BSTGWPM"), naptan)
        self.assertTrue(exact_identity_match("0100brp90311", atco))
        self.assertTrue(exact_identity_match("BSTGWPM", naptan))
        self.assertFalse(exact_identity_match("0100-BRP90311", atco))
        self.assertFalse(exact_identity_match("BST-GWPM", naptan))
        self.assertTrue(profile["shapeMatchingIsDiagnosticOnly"])

    def test_mixed_case_exact_identifiers_match_without_punctuation_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "naptan.xml"
            path.write_text('<NaPTAN><StopPoint><AtcoCode>0100BRP90311</AtcoCode><NaptanCode>bstgwpm</NaptanCode></StopPoint></NaPTAN>', encoding="utf-8")
            atco, naptan, _ = read_naptan_identity_sets(path)
        self.assertIn(normalize_exact_stop_identity("0100brp90311"), atco)
        self.assertIn(normalize_exact_stop_identity("BSTGWPM"), naptan)
        self.assertEqual(normalize_exact_stop_identity("0100brp90311"), "0100brp90311")
        self.assertNotEqual(normalize_exact_stop_identity("0100-BRP90311"), normalize_exact_stop_identity("0100BRP90311"))
        self.assertEqual(identity_shape("0100brp90311"), identity_shape("0100BRP90311"))


if __name__ == "__main__":
    unittest.main()
