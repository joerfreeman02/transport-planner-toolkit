"""Small deterministic contract tests for identity bridge discovery."""
import sqlite3
import unittest

from identity_bridge_discovery import (
    bridge_summary, create_schema, ingest_rows, ordered_pattern, pattern_is_clean, pattern_key,
    semantic_and_multiplicity,
)


def row(side, prepared_id, *, region="EA", route="230", sequence=None, operator="Centrebus",
        origin="Lyons", destination="Caddington Woods", days=None, source_id=None):
    return {
        "region": region, "stopId": "0100A", "routeNumber": route,
        "stopSequence": sequence if sequence is not None else ["0100A", "0100B"],
        "operator": operator, "origin": origin, "destination": destination,
        "operatingDays": days or ["Monday", "Tuesday"], "validFrom": "2026-01-01", "validTo": "2027-01-01",
        "nativeIds": {"preparedServiceId": prepared_id, "sourceServiceId": source_id or prepared_id,
                      "sourceArchive": side + "-archive"},
    }


class IdentityBridgeDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        create_schema(self.db)

    def tearDown(self):
        self.db.close()

    def test_repeated_evidence_rows_deduplicate_and_count_stops(self):
        first = row("PRIMARY", "p1")
        second = dict(first, stopId="0100B")
        result = ingest_rows(self.db, "PRIMARY", [first, second])
        self.assertEqual(result, {"evidenceRows": 2, "conflictingRepeatedRows": 0})
        self.assertEqual(self.db.execute("SELECT COUNT(*),MAX(evidence_rows) FROM service").fetchone(), (1, 2))
        self.assertEqual(self.db.execute("SELECT SUM(evidence_rows) FROM service").fetchone()[0], 2)

    def test_repeated_service_with_changed_pattern_is_reported_inconsistent(self):
        first = row("PRIMARY", "p1")
        changed = dict(first, stopId="0100B", stopSequence=["0100A", "0100C"])
        result = ingest_rows(self.db, "PRIMARY", [first, changed])
        self.assertEqual(result["conflictingRepeatedRows"], 1)
        self.assertEqual(self.db.execute("SELECT COUNT(*),MAX(evidence_rows),MAX(consistency_conflicts) FROM service").fetchone(), (1, 2, 1))

    def test_identical_route_and_ordered_pattern_bridges_across_sources(self):
        ingest_rows(self.db, "PRIMARY", [row("PRIMARY", "p1")])
        ingest_rows(self.db, "TNDS", [row("TNDS", "t1")])
        bridge = bridge_summary(self.db)["routeExactPattern"]
        self.assertEqual(bridge["keysPresentBoth"], 1)
        self.assertEqual(bridge["primaryServicesCovered"], 1)
        self.assertEqual(bridge["tndsServicesCovered"], 1)

    def test_operator_and_destination_labels_do_not_change_pattern_identity(self):
        a = pattern_key("EA", "230", ["0100A", "0100B"])
        self.assertEqual(a, pattern_key("EA", "230", ["0100A", "0100B"]))
        ingest_rows(self.db, "PRIMARY", [row("PRIMARY", "p1", operator="Centrebus", destination="Lyons CC")])
        ingest_rows(self.db, "TNDS", [row("TNDS", "t1", operator="Centrebus South", destination="Caddington Woods")])
        bridges = bridge_summary(self.db)
        self.assertEqual(bridges["routeExactPattern"]["keysPresentBoth"], 1)
        self.assertEqual(bridges["routePatternOperator"]["primaryServicesCovered"], 0)
        self.assertEqual(bridges["currentCompositeWithoutRoute"]["primaryServicesCovered"], 0)
        semantic = semantic_and_multiplicity(self.db)
        self.assertEqual(semantic["semanticDifferencePairCounts"]["operator"], 1)
        self.assertEqual(semantic["semanticDifferencePairCounts"]["destination"], 1)

    def test_different_route_number_changes_pattern_identity(self):
        self.assertNotEqual(pattern_key("EA", "230", ["0100A", "0100B"]),
                            pattern_key("EA", "231", ["0100A", "0100B"]))

    def test_route_omitted_composite_can_match_different_routes(self):
        ingest_rows(self.db, "PRIMARY", [row("PRIMARY", "p1", route="230")])
        ingest_rows(self.db, "TNDS", [row("TNDS", "t1", route="231")])
        bridges = bridge_summary(self.db)
        self.assertEqual(bridges["routeExactPattern"]["keysPresentBoth"], 0)
        self.assertEqual(bridges["currentCompositeWithoutRoute"]["primaryServicesCovered"], 1)
        self.assertEqual(semantic_and_multiplicity(self.db)["routeOmittedCompositePairsWithDifferentRouteNumber"], 1)

    def test_reversed_stop_sequence_does_not_match(self):
        self.assertNotEqual(ordered_pattern(["0100A", "0100B"]), ordered_pattern(["0100B", "0100A"]))
        ingest_rows(self.db, "PRIMARY", [row("PRIMARY", "p1")])
        ingest_rows(self.db, "TNDS", [row("TNDS", "t1", sequence=["0100B", "0100A"])])
        self.assertEqual(bridge_summary(self.db)["routeExactPattern"]["keysPresentBoth"], 0)

    def test_calendar_profile_split_is_reported_as_one_to_many(self):
        ingest_rows(self.db, "PRIMARY", [row("PRIMARY", "p1")])
        ingest_rows(self.db, "TNDS", [row("TNDS", "t1", days=["Monday"]), row("TNDS", "t2", days=["Tuesday"])])
        bridge = bridge_summary(self.db)["routeExactPattern"]
        self.assertEqual(bridge["multiplicityKeys"], {"one:many": 1})
        self.assertEqual(bridge["tndsServicesCovered"], 2)

    def test_gtfs_tokens_are_explicitly_non_clean(self):
        self.assertFalse(pattern_is_clean(ordered_pattern(["0100A", "gtfs:trip/123"])))
        self.assertFalse(pattern_is_clean(ordered_pattern(["0100A", ""])))
        self.assertTrue(pattern_is_clean(ordered_pattern(["0100A", "0590ABCD01"])) )

    def test_equal_gtfs_tokens_are_reported_separately_and_not_as_clean_bridge(self):
        sequence = ["0100A", "gtfs:trip/123"]
        ingest_rows(self.db, "PRIMARY", [row("PRIMARY", "p1", sequence=sequence)])
        ingest_rows(self.db, "TNDS", [row("TNDS", "t1", sequence=sequence)])
        bridges = bridge_summary(self.db)
        self.assertEqual(bridges["routeExactPattern"]["keysPresentBoth"], 0)
        self.assertEqual(bridges["identicalGtfsTokenPatternOnly"]["keysPresentBoth"], 1)
        self.assertIn("never accepted", bridges["identicalGtfsTokenPatternOnly"]["interpretation"])

    def test_identical_pattern_in_different_regions_does_not_collide(self):
        self.assertNotEqual(pattern_key("EA", "230", ["0100A", "0100B"]),
                            pattern_key("NW", "230", ["0100A", "0100B"]))
        ingest_rows(self.db, "PRIMARY", [row("PRIMARY", "p1", region="EA")])
        ingest_rows(self.db, "TNDS", [row("TNDS", "t1", region="NW")])
        self.assertEqual(bridge_summary(self.db)["routeExactPattern"]["keysPresentBoth"], 0)

    def test_london_is_excluded_from_tnds_comparator_analysis(self):
        ingest_rows(self.db, "PRIMARY", [row("PRIMARY", "p1", region="LONDON")])
        ingest_rows(self.db, "TNDS", [row("TNDS", "t1", region="LONDON")])
        bridge = bridge_summary(self.db)["routeExactPattern"]
        self.assertEqual(bridge["keysPresentBoth"], 0)


if __name__ == "__main__":
    unittest.main()
