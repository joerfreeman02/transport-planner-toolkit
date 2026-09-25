import gzip
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from structural_scan import scan


class StructuralScanTests(unittest.TestCase):
    def test_aggregate_scanner_keeps_source_findings_and_runtime_failures_separate(self):
        root = Path(tempfile.mkdtemp(prefix="atlas-structural-scan-test-"))
        try:
            bus = root / "atlas/data/bus"
            (bus / "localities").mkdir(parents=True)
            (bus / "groups").mkdir()
            (bus / "reference").mkdir()
            manifest = {
                "schema": "atlas-prepared-bus-data-v2",
                "localityShards": {"E00": "localities/E00.json.gz"},
                "groupShards": {"210": "groups/210.json.gz"},
                "referenceStopPointShards": {"210": "reference/stops.json.gz"},
                "counts": {"districtCount": 1},
                "qa": {"nptg": {"missingDistrictCount": 1, "districtIds": ["26"]}, "naptan": {}},
            }
            (bus / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            for relative, payload in {
                "localities/E00.json.gz": {"localities": [{"id": "nptg:E1", "name": "Example", "districtId": "nptg:310", "districtName": None, "administrativeAreaId": "069"}]},
                "groups/210.json.gz": {"groups": [{"id": "naptan:210G1", "status": "active", "missingMemberStopPointIds": ["missing"], "memberStopPointIds": []}]},
                "reference/stops.json.gz": {"stopPoints": [{"id": "2101", "transportMode": "bus_coach", "knownTransportMode": True, "coordinateValid": True}]},
            }.items():
                with gzip.open(bus / relative, "wt", encoding="utf-8") as stream:
                    json.dump(payload, stream)
            result = scan(root)
            self.assertEqual(result["nptg"]["unresolvedByDistrict"], {"310": 1})
            self.assertTrue(result["runtimeIntegrity"]["failClosed"])
            unresolved = [item for item in result["findings"] if item["category"] == "unresolved_district_reference"]
            self.assertEqual(len(unresolved), 1)
            self.assertEqual(unresolved[0]["severity"], "WARN")
            self.assertEqual(unresolved[0]["classification"], "source_anomaly")
        finally:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
