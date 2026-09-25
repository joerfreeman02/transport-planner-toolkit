import json
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from diagnostic_bus_cache import write_cache
from prepared_data_v2 import parse_naptan_xml, parse_nptg_xml
from refresh_state import transition
from tnds_capability_probe import probe


class ReferenceFoundationTests(unittest.TestCase):
    def setUp(self):
        self.root = Path.cwd() / ".national-v2-diagnostic-test-tmp" / next(tempfile._get_candidate_names())
        self.root.mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_multimodal_source_and_runtime_bus_projection(self):
        records = [
            "<StopPoint Status='inactive'><AtcoCode>0170SGP90856</AtcoCode><CommonName>Bus Station</CommonName><StopType>BCT</StopType></StopPoint>",
            "<StopPoint><AtcoCode>017000000001</AtcoCode><CommonName>Active Bus</CommonName><StopType>BCT</StopType><StopAreaRef>017G0002</StopAreaRef><Location><Latitude>51.5</Latitude><Longitude>-2.5</Longitude></Location></StopPoint>",
            "<StopPoint><AtcoCode>017000000002</AtcoCode><CommonName>Rail</CommonName><StopType>RPL</StopType><Location><Latitude>51.5</Latitude><Longitude>-2.5</Longitude></Location></StopPoint>",
            "<StopPoint><AtcoCode>017000000003</AtcoCode><CommonName>Unknown</CommonName><StopType>ZZZ</StopType><Location><Latitude>51.5</Latitude><Longitude>-2.5</Longitude></Location></StopPoint>",
            "<StopArea><StopAreaCode>017G0002</StopAreaCode><Name>Bus Station</Name><StopAreaType>GBCS</StopAreaType></StopArea>",
        ]
        source = self.root / "naptan.xml"
        source.write_text("<NaPTAN Version='2.1'>" + "".join(records) + "</NaPTAN>", encoding="utf-8")
        result = parse_naptan_xml(source)
        self.assertEqual(result.stops["0170SGP90856"]["status"], "inactive")
        group = result.groups["naptan:017G0002"]
        self.assertEqual(group["sourceMemberStopPointIds"], ["017000000001"])
        self.assertEqual(group["memberStopPointIds"], ["017000000001"])
        self.assertEqual(result.qa["validRailSourceStopPointCount"], 1)
        self.assertEqual(result.qa["unknownOrUnsupportedStopTypeCount"], 1)
        self.assertEqual(result.qa["activeBusStopPointCount"], 1)

    def test_nptg_accepts_one_character_district_and_retains_unresolved_reference(self):
        source = self.root / "nptg.xml"
        source.write_text("<NPTG Version='2.1'><NptgDistrict><NptgDistrictCode>2</NptgDistrictCode><DistrictName>District Two</DistrictName></NptgDistrict><NptgLocality><NptgLocalityCode>E001</NptgLocalityCode><LocalityName>Example</LocalityName><NptgDistrictRef>2</NptgDistrictRef></NptgLocality><NptgLocality><NptgLocalityCode>E002</NptgLocalityCode><LocalityName>Unresolved</LocalityName><NptgDistrictRef>310</NptgDistrictRef></NptgLocality></NPTG>", encoding="utf-8")
        result = parse_nptg_xml(source)
        self.assertIn("2", result.districts)
        self.assertEqual(result.qa["missingDistrictCount"], 1)
        self.assertIn("310", result.qa["missingDistrictSamples"])

    def test_state_is_monotonic_and_cache_is_explicitly_non_production(self):
        status = self.root / "atlas/data/status/manifest.json"
        status.parent.mkdir(parents=True)
        status.write_text(json.dumps({"schema": "atlas-bus-refresh-status-v1", "status": "sanity_checked", "sources": {"naptan": {"sourceHash": "n"}, "nptg": {"sourceHash": "g"}, "bods": {"sourceHash": "b"}}}), encoding="utf-8")
        gtfs = self.root / ".atlas-diagnostic-source-cache/gtfs"
        gtfs.mkdir(parents=True)
        with zipfile.ZipFile(gtfs / "london.zip", "w") as archive:
            archive.writestr("stops.txt", "stop_id\n")
        value = write_cache(self.root, "a" * 40, "b" * 64)
        self.assertEqual(value["state"], "UNVERIFIED")
        self.assertFalse(value["productionEligible"])
        transition(self.root, "structurally_validated")
        self.assertEqual(json.loads(status.read_text(encoding="utf-8"))["status"], "structurally_validated")
        with self.assertRaises(ValueError):
            transition(self.root, "generated")

    def test_tnds_probe_never_retrieves_archives(self):
        result = probe("", "")
        self.assertFalse(result["retrievalPerformed"])
        self.assertEqual(result["classification"], "NOT_RELIABLE")


if __name__ == "__main__":
    unittest.main()
