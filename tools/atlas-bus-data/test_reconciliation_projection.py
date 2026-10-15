"""Synthetic control and prepared-shard projection contracts."""
import gzip
import json
import tempfile
import unittest
from pathlib import Path

from reconciliation_projection import (build_controls, build_service_projection,
    write_prepared_projection_checkpoint, projection_compatibility_fingerprint)
from reconciliation_checkpoint import iter_checkpoint_region, verify_streaming_checkpoint
from region_contract import normalize_primary_region
from tnds_reconciliation import EXPECTED_REGIONS, fixture_region_manifest, reconcile, State


class ReconciliationProjectionTests(unittest.TestCase):
    def test_real_nine_region_manifest_maps_to_comparator_codes_and_preserves_london(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); (root / "services").mkdir()
            source_regions = ["east_anglia", "east_midlands", "london", "north_east", "north_west",
                              "south_east", "south_west", "west_midlands", "yorkshire"]
            manifest = {"schema": "atlas-prepared-bus-data-v2", "snapshotDate": "2026-10-13",
                "serviceShards": {"0100A": [f"services/0100A-{region}.json.gz" for region in source_regions]},
                "sources": {"bods": {"regions": [{"region": region} for region in source_regions]}}}
            (root / "manifest.json").write_text(json.dumps(manifest))
            for region in source_regions:
                payload = {"schema": "atlas-prepared-bus-data-v2", "region": region.upper(), "services": [{
                    "id": f"{region}:R1", "routeNumber": "46", "operator": "Example", "origin": "A", "destination": "B",
                    "circularPatternStopIds": ["0100A", "0100B"], "validFrom": "2026-01-01", "validTo": "2027-01-01",
                    "stopSchedules": {"0100A": {"monday": [480]}, "0100B": {"tuesday": [500]}},
                    "source": {"region": region, "routeId": "R1"}, "qualifications": []}]}
                with gzip.open(root / f"services/0100A-{region}.json.gz", "wt", encoding="utf-8") as output:
                    json.dump(payload, output)
            result = build_service_projection(root, "PRIMARY", source_snapshot_id="source-snapshot")
            expected = set(EXPECTED_REGIONS) | {"LONDON"}
            self.assertEqual({row["region"] for row in result["rows"]}, expected)
            self.assertEqual({row["sourceRegion"] for row in result["rows"]}, {region.upper() for region in source_regions})
            self.assertTrue(all(row["identityBridgeValidated"] is False for row in result["rows"]))
            self.assertTrue(all(row["sourceSnapshotId"] == "source-snapshot" for row in result["rows"]))
            tnds_rows = [{**row, "sourceRegion": region} for region in EXPECTED_REGIONS
                         for row in [{"region": region, "stopId": f"{region}001", "routeNumber": "46",
                           "evidenceId": f"t-{region}", "nativeIds": {"id": f"t-{region}"},
                           "validFrom": "2026-01-01", "validTo": "2027-01-01"}]]
            primary_rows = [{**row, "stopId": f"{row['region']}001"} for row in result["rows"]]
            comparison = reconcile(primary_rows, tnds_rows, as_of="2026-10-13", tnds_status=State.COMPARATOR_VALIDATED,
                                   region_manifest=fixture_region_manifest())
            self.assertEqual(comparison["excluded"].get("invalid_identity", 0), 0)
            self.assertEqual({row["region"] for row in comparison["rows"]}, expected)
            self.assertGreater(sum(1 for row in comparison["rows"] if row["category"] == "OUTSIDE_TNDS_COMPARATOR_SCOPE"), 0)

    def test_unknown_primary_region_fails_projection_contract(self):
        with self.assertRaisesRegex(ValueError, "Unexpected primary prepared region"):
            normalize_primary_region("new_unapproved_region")

    def test_streaming_live_projection_maps_all_nine_native_source_regions(self):
        source_regions = ["east_anglia", "east_midlands", "london", "north_east", "north_west",
                          "south_east", "south_west", "west_midlands", "yorkshire"]
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); (root / "services").mkdir(); (root / "stops").mkdir()
            shards = []
            for source_region in source_regions:
                relative = f"services/{source_region}.json.gz"; shards.append(relative)
                service = {"id": source_region + ":S1", "routeNumber": "46", "operator": "Transit",
                    "origin": "A", "destination": "B", "validFrom": "2026-01-01", "validTo": "2027-01-01",
                    "stopSchedules": {"0100A": {"monday": [480]}},
                    "source": {"region": source_region, "archive": "archive-" + source_region + ".zip"}}
                with gzip.open(root / relative, "wt", encoding="utf-8") as stream:
                    json.dump({"schema": "atlas-prepared-bus-data-v2", "region": source_region.upper(), "services": [service]}, stream)
            fields = ["id", "name", "latitude", "longitude", "timetableCallEligible", "busStopType", "stopType"]
            with gzip.open(root / "stops/all.json.gz", "wt", encoding="utf-8") as stream:
                json.dump({"schema": "atlas-prepared-bus-data-v2", "stops": [["0100A", "Pipers", 51.8527,
                    -0.454343, True, "BCS", "bus"]]}, stream)
            (root / "manifest.json").write_text(json.dumps({"schema": "atlas-prepared-bus-data-v2",
                "snapshotDate": "2026-10-13", "serviceCount": 9,
                "regionServiceCounts": {code: 1 for code in (*EXPECTED_REGIONS, "LONDON")},
                "serviceShards": {"all": shards}, "stopFields": fields, "stopShards": {"all": "stops/all.json.gz"},
                "sources": {"bods": {"regions": [{"region": region} for region in source_regions]}}}))
            commit = "1" * 40
            manifest = write_prepared_projection_checkpoint(root, "PRIMARY", source_snapshot_id="synthetic-snapshot",
                provenance={"sourceProducerRunId": "1", "sourceArtifactName": "synthetic-source", "repository": "test/repo",
                    "preparationCodeCommit": commit, "checkpointProducerCommit": commit,
                    "checkpointProducerRunId": "2", "checkpointBranch": "refs/heads/c3-test",
                    "preparedSchema": "atlas-prepared-bus-data-v2"}, destination=root / "checkpoint")
            checked = verify_streaming_checkpoint(root / "checkpoint", {"side": "PRIMARY",
                "projectionCompatibilityFingerprint": projection_compatibility_fingerprint()})
            self.assertEqual(checked["regionEvidenceCounts"], {**{region: 1 for region in EXPECTED_REGIONS}, "LONDON": 1})
            actual = {region: list(iter_checkpoint_region(root / "checkpoint", checked, region))
                      for region in (*EXPECTED_REGIONS, "LONDON")}
            self.assertEqual(set(actual), set((*EXPECTED_REGIONS, "LONDON")))
            for source_region in source_regions:
                canonical = normalize_primary_region(source_region)
                item = actual[canonical][0]
                self.assertEqual(item["sourceRegion"], source_region.upper())
                self.assertEqual(item["sourceRegionArchive"]["archive"], "archive-" + source_region + ".zip")
            self.assertEqual(manifest["inputServiceCount"], 9)

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
