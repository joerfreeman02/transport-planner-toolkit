#!/usr/bin/env python3
"""Focused circular-identity regressions for the prepared BODS/GTFS builder."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


BUILDER_PATH = Path(__file__).with_name("build_static_index.py")
sys.path.insert(0, str(BUILDER_PATH.parent))
SPEC = importlib.util.spec_from_file_location("atlas_build_static_index", BUILDER_PATH)
BUILDER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(BUILDER)
V2_PATH = Path(__file__).with_name("prepared_data_v2.py")
V2_SPEC = importlib.util.spec_from_file_location("atlas_prepared_data_v2", V2_PATH)
V2 = importlib.util.module_from_spec(V2_SPEC)
assert V2_SPEC and V2_SPEC.loader
sys.modules[V2_SPEC.name] = V2
V2_SPEC.loader.exec_module(V2)
FIXTURES = Path(__file__).parents[2] / "tests" / "fixtures" / "atlas-bus-data-v2"


class CircularIdentityTests(unittest.TestCase):
    def build_record(
        self,
        *,
        route_id: str,
        first_name: str,
        last_name: str,
        first_locality: str,
        last_locality: str,
        first_id: str | None,
        last_id: str | None,
        include_intermediate: bool = False,
    ) -> dict:
        first_gtfs = f"{route_id}-first"
        last_gtfs = f"{route_id}-last"
        middle_gtfs = f"{route_id}-middle"
        gtfs_stops = {
            first_gtfs: {"stop_name": first_name},
            last_gtfs: {"stop_name": last_name},
        }
        rows = [
            {"stop_sequence": "1", "stop_id": first_gtfs, "departure_time": "08:00:00"},
            {"stop_sequence": "2", "stop_id": last_gtfs, "departure_time": "08:10:00"},
        ]
        aliases = {}
        naptan_stops = {}
        if include_intermediate:
            gtfs_stops[middle_gtfs] = {"stop_name": "Intermediate stop"}
            rows = [
                {"stop_sequence": "1", "stop_id": first_gtfs, "departure_time": "08:00:00"},
                {"stop_sequence": "2", "stop_id": middle_gtfs, "departure_time": "08:05:00"},
                {"stop_sequence": "3", "stop_id": last_gtfs, "departure_time": "08:10:00"},
            ]
            aliases[middle_gtfs] = f"{route_id}-middle-id"
            naptan_stops[f"{route_id}-middle-id"] = {
                "id": f"{route_id}-middle-id", "name": "Intermediate stop", "locality": "Middle", "routes": set()
            }
        for gtfs_id, stop_id, name, locality in (
            (first_gtfs, first_id, first_name, first_locality),
            (last_gtfs, last_id, last_name, last_locality),
        ):
            if stop_id:
                aliases[gtfs_id] = stop_id
                naptan_stops[stop_id] = {"id": stop_id, "name": name, "locality": locality, "routes": set()}
        services = {}
        BUILDER.process_trip(
            "fixture",
            rows,
            {"route_id": route_id, "direction_id": "outbound", "service_id": "weekday", "active_days": ["monday"], "trip_headsign": last_name},
            {"agency": "Fixture operator"},
            {route_id: {"route_short_name": route_id, "route_type": "3", "agency_id": "agency"}},
            gtfs_stops,
            {"weekday": {"start_date": "20260901", "end_date": "20260930"}},
            {},
            naptan_stops,
            aliases,
            services,
        )
        return next(iter(services.values()))

    def test_route_310_distinct_bus_station_endpoints_are_not_circular(self):
        record = self.build_record(
            route_id="310",
            first_name="Bus Station",
            last_name="Bus Station",
            first_locality="Hertford",
            last_locality="Waltham Cross",
            first_id="HERTFORD-BS",
            last_id="WALTHAM-CROSS-BS",
        )
        self.assertFalse(record["circular"])
        self.assertEqual(record["originStopPointId"], "HERTFORD-BS")
        self.assertEqual(record["destinationStopPointId"], "WALTHAM-CROSS-BS")
        self.assertEqual(set(record["stopSchedules"]), {"HERTFORD-BS", "WALTHAM-CROSS-BS"})

    def test_same_name_different_identity_and_locality_is_not_circular(self):
        for index, name in enumerate(("Railway Station", "Bus Station", "High Street"), start=1):
            with self.subTest(name=name):
                record = self.build_record(
                    route_id=f"same-name-{index}",
                    first_name=name,
                    last_name=name,
                    first_locality="First locality",
                    last_locality="Second locality",
                    first_id=f"FIRST-{index}",
                    last_id=f"LAST-{index}",
                )
                self.assertFalse(record["circular"])

    def test_same_resolved_stop_point_remains_a_genuine_circular_service(self):
        record = self.build_record(
            route_id="230",
            first_name="Lyons Community Centre",
            last_name="Lyons Community Centre",
            first_locality="Lyons",
            last_locality="Lyons",
            first_id="LYONS-CC",
            last_id="LYONS-CC",
            include_intermediate=True,
        )
        self.assertTrue(record["circular"])
        self.assertEqual(record["originStopPointId"], record["destinationStopPointId"])

    def test_unresolved_specific_same_locality_can_use_conservative_fallback(self):
        self.assertTrue(BUILDER.circular_identity([
            {"name": "Lyons Community Centre", "locality": "Lyons"},
            {"name": "Lyons Community Centre", "locality": "Lyons"},
        ]))
        self.assertFalse(BUILDER.circular_identity([
            {"name": "Bus Station", "locality": "Same locality"},
            {"name": "Bus Station", "locality": "Same locality"},
        ]))


class PreparedDataV2ParserTests(unittest.TestCase):
    def test_namespace_and_schema_version_variants_normalise_deterministically(self):
        first = V2.parse_naptan_xml(FIXTURES / "naptan-2.1.xml")
        second = V2.parse_naptan_xml(FIXTURES / "naptan-2.4.xml")
        self.assertEqual(first.metadata["schemaVersion"], "2.1")
        self.assertEqual(second.metadata["schemaVersion"], "2.4")
        self.assertEqual(first.stops["490006381N"]["logicalGroupRefs"][0]["id"], "naptan:490G00006381")
        self.assertEqual(first.groups["naptan:490G00006381"]["memberStopPointIds"], ["490006381N", "490006381S"])
        self.assertEqual(first.qa["inactiveGroupCount"], 1)
        self.assertEqual(second.qa["multipleGroupStopCount"], 1)
        self.assertEqual(second.groups["naptan:210G432"]["parentGroupId"], "naptan:210G900")

    def test_nptg_parent_district_and_cycle_qa_are_retained(self):
        result = V2.parse_nptg_xml(FIXTURES / "nptg-2.1.xml")
        self.assertEqual(result.localities["E0014000"]["parentLocalityId"], "nptg:E0013720")
        self.assertEqual(result.localities["E0013720"]["districtId"], "nptg:26")
        self.assertEqual(result.qa["cyclicLocalityCount"], 2)
        self.assertEqual(len(result.districts), 2)

    def test_unknown_structure_fails_closed(self):
        with self.assertRaises(V2.SourceParseError):
            V2.parse_naptan_xml(FIXTURES / "malformed-root.xml")

    def test_v2_builder_emits_bounded_sidecars_and_reuses_service_semantics(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parents[2]) as temporary:
            root = Path(temporary)
            gtfs = root / "gtfs"
            gtfs.mkdir()
            archive_path = gtfs / "fixture.zip"
            files = {
                "agency.txt": "agency_id,agency_name\na,Fixture operator\n",
                "routes.txt": "route_id,route_short_name,route_type,agency_id\nr1,1,3,a\n",
                "stops.txt": "stop_id,stop_code,stop_name\nstop-n,490006381N,East View\nstop-s,490006381S,East View\n",
                "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260901,20260930\n",
                "trips.txt": "route_id,service_id,trip_id,direction_id,trip_headsign\nr1,weekday,t1,0,East View\n",
                "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,08:00:00,08:00:00,stop-n,1\nt1,08:10:00,08:10:00,stop-s,2\n",
                "feed_info.txt": "feed_publisher_name,feed_start_date,feed_end_date\nFixture,20260901,20260930\n",
            }
            with zipfile.ZipFile(archive_path, "w") as archive:
                for name, content in files.items():
                    archive.writestr(name, content)
            output = root / "prepared"
            args = type("Args", (), {
                "naptan_xml": FIXTURES / "naptan-2.1.xml", "nptg_xml": FIXTURES / "nptg-2.1.xml",
                "gtfs_dir": gtfs, "output": output, "snapshot_date": "2026-09-01", "generated_at": "2026-09-01T00:00:00Z",
                "grid_size": 0.25, "service_shard_key_length": 5,
            })()
            result = BUILDER.build_v2(args)
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(result["schema"], "atlas-prepared-bus-data-v2")
            self.assertEqual(manifest["schema"], "atlas-prepared-bus-data-v2")
            self.assertTrue(manifest["groupShards"])
            self.assertTrue(manifest["localityShards"])
            self.assertTrue(manifest["serviceShards"])
            self.assertFalse(list(output.rglob("*.xml")))


if __name__ == "__main__":
    unittest.main()
