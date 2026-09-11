#!/usr/bin/env python3
"""Focused circular-identity regressions for the prepared BODS/GTFS builder."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


BUILDER_PATH = Path(__file__).with_name("build_static_index.py")
SPEC = importlib.util.spec_from_file_location("atlas_build_static_index", BUILDER_PATH)
BUILDER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(BUILDER)


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


if __name__ == "__main__":
    unittest.main()
