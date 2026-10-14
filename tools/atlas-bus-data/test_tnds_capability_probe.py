from __future__ import annotations

import ftplib
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import tnds_capability_probe as capability
from refresh_bus_data import TNDS_REGIONS, tnds_region_from_filename


class FakeFTP:
    def __init__(self, names, *, size=1234, size_error=False, modified="213 20261014081249", modified_error=False):
        self.names = list(names)
        self.size_value = size
        self.size_error = size_error
        self.modified_value = modified
        self.modified_error = modified_error
        self.size_calls = []
        self.commands = []
        self.retrieval_calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def login(self, *_args):
        pass

    def cwd(self, *_args):
        pass

    def nlst(self):
        return self.names

    def size(self, name):
        self.size_calls.append(name)
        if self.size_error:
            raise ftplib.error_perm("SIZE unavailable")
        return self.size_value

    def sendcmd(self, command):
        self.commands.append(command)
        if self.modified_error:
            raise ftplib.error_perm("MDTM unavailable")
        return self.modified_value

    def retrbinary(self, *_args, **_kwargs):
        self.retrieval_calls.append(_args[0] if _args else "")
        raise AssertionError("Metadata probe must never retrieve an archive")


class TndsCapabilityProbeTests(unittest.TestCase):
    def run_probe(self, ftp):
        with patch.object(capability.ftplib, "FTP", return_value=ftp):
            return capability.probe("fixture-user", "fixture-password")

    def test_each_approved_filename_maps_only_to_its_region(self):
        for region in TNDS_REGIONS:
            with self.subTest(region=region):
                name = f"{region}.zip"
                self.assertEqual(tnds_region_from_filename(name), region)
                ftp = FakeFTP([name])
                result = self.run_probe(ftp)
                for candidate_region in TNDS_REGIONS:
                    expected = [name] if candidate_region == region else []
                    self.assertEqual(result["regions"][candidate_region]["candidates"], expected)
                self.assertEqual(result["regions"][region]["classification"], "RELIABLE_METADATA")
                self.assertTrue(result["regions"][region]["metadataAvailable"])
                self.assertFalse(result["retrievalPerformed"])
                self.assertEqual(ftp.retrieval_calls, [])

    def test_arbitrary_y_filenames_do_not_become_yorkshire(self):
        names = ["MAY.zip", "BOY.zip", "Yorkshire.zip", "YORK.zip", "SomeY-feed.zip"]
        ftp = FakeFTP(names)
        result = self.run_probe(ftp)
        self.assertEqual(result["regions"]["Y"]["candidates"], [])
        self.assertEqual(ftp.size_calls, [])
        self.assertEqual(ftp.commands, [])
        self.assertFalse(result["retrievalPerformed"])

    def test_partial_region_strings_do_not_cross_match(self):
        names = ["EAST.zip", "NEMT.zip", "SWEast.zip", "EAfeed-extra.zip", "Yorkshire-EAdata.zip"]
        for name in names:
            self.assertIsNone(tnds_region_from_filename(name), name)
        result = self.run_probe(FakeFTP(names))
        self.assertTrue(all(not value["candidates"] for value in result["regions"].values()))
        non_archive = self.run_probe(FakeFTP(["EA.txt"]))
        self.assertFalse(non_archive["regions"]["EA"]["candidates"])

    def test_positive_size_and_successful_mdtm_are_reliable(self):
        result = self.run_probe(FakeFTP(["EA.zip"]))
        self.assertEqual(result["regions"]["EA"]["classification"], "RELIABLE_METADATA")
        self.assertEqual(result["regions"]["EA"]["matches"][0]["size"], 1234)
        self.assertEqual(result["regions"]["EA"]["matches"][0]["modified"], "213 20261014081249")
        self.assertEqual(result["classification"], "PARTIALLY_RELIABLE")
        fractional = self.run_probe(FakeFTP(["EA.zip"], modified="213 20261014081249.125"))
        self.assertTrue(fractional["regions"]["EA"]["metadataAvailable"])

    def test_all_eight_approved_regions_are_required_for_reliable_probe_classification(self):
        ftp = FakeFTP([f"{region}.zip" for region in TNDS_REGIONS])
        result = self.run_probe(ftp)
        self.assertEqual(result["classification"], "RELIABLE_METADATA_ONLY")
        self.assertTrue(all(item["metadataAvailable"] for item in result["regions"].values()))
        self.assertFalse(result["retrievalPerformed"])

    def test_size_error_or_nonpositive_size_prevents_reliable_metadata(self):
        for options in ({"size_error": True}, {"size": 0}):
            with self.subTest(options=options):
                result = self.run_probe(FakeFTP(["EA.zip"], **options))
                self.assertEqual(result["regions"]["EA"]["classification"], "INCOMPLETE_METADATA")
                self.assertFalse(result["regions"]["EA"]["metadataAvailable"])
                self.assertNotEqual(result["classification"], "RELIABLE_METADATA_ONLY")

    def test_mdtm_error_or_invalid_value_prevents_reliable_metadata(self):
        for options in ({"modified_error": True}, {"modified": "not-a-valid-MDTM"}):
            with self.subTest(options=options):
                result = self.run_probe(FakeFTP(["EA.zip"], **options))
                self.assertEqual(result["regions"]["EA"]["classification"], "INCOMPLETE_METADATA")
                self.assertFalse(result["regions"]["EA"]["metadataAvailable"])

    def test_duplicate_regional_archives_are_reported_as_ambiguous(self):
        names = ["EA.zip", "TNDS-EA-v2.5.zip"]
        ftp = FakeFTP(names)
        result = self.run_probe(ftp)
        self.assertEqual(result["regions"]["EA"]["classification"], "AMBIGUOUS")
        self.assertEqual(result["regions"]["EA"]["candidates"], sorted(names, key=str.casefold))
        self.assertFalse(result["regions"]["EA"]["metadataAvailable"])
        self.assertEqual(ftp.size_calls, [])
        self.assertNotEqual(result["classification"], "RELIABLE_METADATA_ONLY")

    def test_probe_contract_never_transfers_archives(self):
        ftp = FakeFTP(["Y.zip"])
        result = self.run_probe(ftp)
        self.assertFalse(result["retrievalPerformed"])
        self.assertEqual(ftp.retrieval_calls, [])
        source = (Path(__file__).with_name("tnds_capability_probe.py")).read_text(encoding="utf-8")
        self.assertNotIn("retrbinary", source)
        self.assertNotIn("RETR ", source)


if __name__ == "__main__":
    unittest.main()
