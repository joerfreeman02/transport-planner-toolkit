"""Synthetic control and prepared-shard projection contracts."""
import gzip
import json
import tempfile
import unittest
from pathlib import Path

from reconciliation_projection import build_controls, build_service_projection


class ReconciliationProjectionTests(unittest.TestCase):
    def test_projection_preserves_source_identity_without_inventing_bridge_and_includes_london(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); (root / "services").mkdir()
            manifest = {"schema": "atlas-prepared-bus-data-v2", "snapshotDate": "2026-10-13",
                "serviceShards": {"0100A": ["services/0100A-east_anglia.json.gz", "services/0100A-london.json.gz"]},
                "sources": {"bods": {"regions": [{"region": "east_anglia"}, {"region": "london"}]}}}
            (root / "manifest.json").write_text(json.dumps(manifest))
            for region in ("east_anglia", "london"):
                payload = {"schema": "atlas-prepared-bus-data-v2", "region": region.upper(), "services": [{
                    "id": f"{region}:R1", "routeNumber": "46", "operator": "Example", "origin": "A", "destination": "B",
                    "circularPatternStopIds": ["0100A", "0100B"], "validFrom": "2026-01-01", "validTo": "2027-01-01",
                    "stopSchedules": {"0100A": {"monday": [480]}, "0100B": {"tuesday": [500]}},
                    "source": {"region": region, "routeId": "R1"}, "qualifications": []}]}
                with gzip.open(root / f"services/0100A-{region}.json.gz", "wt", encoding="utf-8") as output:
                    json.dump(payload, output)
            result = build_service_projection(root, "PRIMARY", source_snapshot_id="source-snapshot")
            self.assertEqual(len(result["rows"]), 4)
            self.assertEqual({row["region"] for row in result["rows"]}, {"EAST_ANGlia".upper(), "LONDON"})
            self.assertTrue(all(row["identityBridgeValidated"] is False for row in result["rows"]))
            self.assertTrue(all(row["sourceSnapshotId"] == "source-snapshot" for row in result["rows"]))

    def test_controls_use_actual_nearby_evidence_and_keep_bce_non_call(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); (root / "stops").mkdir()
            fields = ["id", "name", "latitude", "longitude", "timetableCallEligible", "busStopType", "stopType"]
            stops = [
                ["PIPERS", "Pipers", 51.8527, -0.454343, True, "BCS", "bus"],
                ["0590BCE01L", "Station entrance", 52.577554, -0.242489, False, "BCE", "station"]]
            (root / "manifest.json").write_text(json.dumps({"schema": "atlas-prepared-bus-data-v2", "stopFields": fields,
                "stopShards": {"a": "stops/a.json.gz"}}))
            with gzip.open(root / "stops/a.json.gz", "wt", encoding="utf-8") as output:
                json.dump({"schema": "atlas-prepared-bus-data-v2", "stops": stops}, output)
            p = [{"stopId": "PIPERS", "routeNumber": "230", "region": "EA"},
                 {"stopId": "0590BCE01L", "routeNumber": "X", "region": "EA"}]
            controls = build_controls(root, p, [])
            self.assertEqual(controls["pipersLane"]["primaryServiceEvidence"], [p[0]])
            self.assertEqual(controls["pipersLane"]["referenceServices"], ["46", "230", "231", "C"])
            entrance = controls["peterboroughQueensgate"]["nearbyStops"][0]
            self.assertEqual(entrance["infrastructureClass"], "NON_CALL_INFRASTRUCTURE")
            self.assertFalse(entrance["timetableCallEligible"])
            self.assertEqual(controls["peterboroughQueensgate"]["primaryServiceEvidence"], [p[1]])


if __name__ == "__main__":
    unittest.main()
