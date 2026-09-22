#!/usr/bin/env python3
from __future__ import annotations

import gzip
import json
import shutil
import uuid
from contextlib import contextmanager
import unittest
from pathlib import Path
from unittest.mock import patch

import national_v2_diagnostic as diagnostic


TEST_TMP_ROOT = Path(__file__).resolve().parents[2] / ".national-v2-diagnostic-test-tmp"
TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)


@contextmanager
def temporary_directory():
    path = TEST_TMP_ROOT / uuid.uuid4().hex
    path.mkdir(parents=True, exist_ok=False)
    try:
        yield str(path)
    finally:
        shutil.rmtree(path, ignore_errors=True)


STOP_FIELDS = ["id", "naptanCode", "name", "indicator", "direction", "latitude", "longitude", "stopType", "busStopType", "locality", "parentLocality", "areaCode", "modifiedAt", "coordinateMethod", "routes"]
V2_STOP_FIELDS = STOP_FIELDS + ["nptgLocalityCode", "logicalGroupRefs", "status", "provenance", "localityResolution"]


def write_gzip(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as stream:
        json.dump(value, stream)


def stop(identifier: str, fields: list[str], v2: bool) -> list:
    value = {
        "id": identifier, "naptanCode": identifier[-3:], "name": "Control", "indicator": "Stop A",
        "direction": "N", "latitude": 51.6, "longitude": -0.1, "stopType": "BCS", "busStopType": "MKD",
        "locality": "Example", "parentLocality": "County", "areaCode": "210", "modifiedAt": "2026-09-15T00:00:00Z",
        "coordinateMethod": "NaPTAN WGS84", "routes": ["1"],
    }
    if v2:
        value.update({"nptgLocalityCode": "E001", "logicalGroupRefs": [{"id": "naptan:210G1", "status": "active", "targetExists": True}], "status": "active", "provenance": {"source": "NaPTAN"}, "localityResolution": "resolved"})
    return [value.get(field) for field in fields]


def make_tree(root: Path, schema: str, v2: bool, nested: bool = True) -> None:
    bus = root / "atlas" / "data" / "bus" if nested else root
    bus.mkdir(parents=True, exist_ok=True)
    fields = V2_STOP_FIELDS if v2 else STOP_FIELDS
    manifest = {"schema": schema, "stopFields": fields, "stopShards": {"210": "stops/210.json.gz"}, "serviceShards": {"21000": ["services/21000-r.json.gz"]}, "generatedAt": "2026-09-22T00:00:00Z", "snapshotDate": "2026-09-22", "gridSize": 0.25, "serviceShardKeyLength": 5, "sources": {"naptan": {"stopCount": 1}, "bods": {"regions": [{"region": "r", "sha256": "same"}]} }}
    if v2:
        manifest.update({"groupShards": {"210": "groups/210.json.gz"}, "localityShards": {"E00": "localities/E00.json.gz"}, "counts": {"activeStopPointCount": 1, "logicalGroupCount": 1, "localityCount": 1, "districtCount": 1}, "qa": {"naptan": {}, "nptg": {}}, "sources": {"naptan": {"stopCount": 1}, "nptg": {}, "bods": {"regions": [{"region": "r", "sha256": "same"}]}}})
    (bus / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    write_gzip(bus / "stops/210.json.gz", {"schema": schema, "stops": [stop("210000001", fields, v2)]})
    service = {"id": "r:route:0:abc", "routeNumber": "1", "operator": "Operator", "origin": "Origin", "destination": "Destination", "direction": "Destination", "circular": False, "principalLocations": ["Example"], "validFrom": "2026-09-01", "validTo": "2026-09-30", "qualifications": [], "stopSchedules": {"210000001": {"monday": [480]}}, "source": {"region": "r"}}
    write_gzip(bus / "services/21000-r.json.gz", {"schema": schema, "services": [service]})
    if v2:
        write_gzip(bus / "groups/210.json.gz", {"schema": "atlas-prepared-logical-groups-v1", "groups": [{"id": "naptan:210G1", "status": "active", "type": "GPBS", "memberStopPointIds": ["210000001"], "missingMemberStopPointIds": [], "qa": {"maxMemberToMemberSpanMetres": 0}}]})
        write_gzip(bus / "localities/E00.json.gz", {"schema": "atlas-prepared-nptg-localities-v1", "localities": [{"id": "nptg:E001", "name": "Example", "districtId": "nptg:D1", "districtName": "District"}]})
    if nested:
        (root / "atlas" / "data" / "bus-tnds").mkdir(parents=True, exist_ok=True)
        (root / "atlas" / "data" / "bus-tnds" / "manifest.json").write_text("{}", encoding="utf-8")
    return manifest


class NationalDiagnosticTests(unittest.TestCase):
    def test_complete_stop_and_service_comparison(self):
        left = {"A": {field: value for field, value in zip(STOP_FIELDS, stop("A", STOP_FIELDS, False))}, "B": {field: value for field, value in zip(STOP_FIELDS, stop("B", STOP_FIELDS, False))}}
        right = {key: {**value, "nptgLocalityCode": "E001"} for key, value in left.items()}
        result = diagnostic.compare_stops(left, right)
        self.assertEqual(result["commonIdCount"], 2)
        self.assertEqual(result["v1OnlyCount"], 0)
        self.assertEqual(result["v2OnlyCount"], 0)
        self.assertEqual(result["mismatchCountsByField"], {})
        service = {"id": "x", "source": {"region": "r"}, "stopSchedules": {"A": {"monday": [480]}}}
        self.assertEqual(diagnostic.compare_services({"x": service}, {"x": service}, {"r"})["commonServiceCount"], 1)

    def test_duplicate_service_shards_are_canonicalised(self):
        with temporary_directory() as temp:
            root = Path(temp)
            manifest = {"serviceShards": {"21000": ["services/a.json.gz", "services/b.json.gz"]}}
            service = {"id": "x", "stopSchedules": {"A": {"monday": [480]}}, "source": {"region": "r"}}
            write_gzip(root / "services/a.json.gz", {"services": [service]})
            write_gzip(root / "services/b.json.gz", {"services": [{**service, "stopSchedules": {"B": {"monday": [490]}}}]})
            result = diagnostic.load_service_records(root, manifest)
            self.assertEqual(len(result), 1)
            self.assertEqual(set(result["x"]["stopSchedules"]), {"A", "B"})

    def test_source_hash_change_and_percentiles_are_explicit(self):
        manifest = {"sources": {"bods": {"regions": [{"region": "r", "sha256": "old"}]}}}
        result = diagnostic.source_window(manifest, {"regions": [{"region": "r", "sourceHash": "new"}]})
        self.assertEqual(result["classification"], "SOURCE_WINDOW_CHANGED")
        self.assertEqual(diagnostic.percentile([1, 2, 3, 4], .5), 2.5)

    def test_group_nptg_payload_and_report_generation_are_compact(self):
        with temporary_directory() as temp:
            root = Path(temp)
            candidate = root / "candidate"
            previous = root / "previous"
            report_dir = root / "report"
            manifest = make_tree(candidate, "atlas-prepared-bus-data-v2", True)
            make_tree(previous, "atlas-prepared-bus-data-v1", False)
            (candidate / "atlas" / "data" / "status").mkdir(parents=True)
            (candidate / "atlas" / "data" / "status" / "manifest.json").write_text(json.dumps({"sources": {"naptan": {}, "nptg": {}, "bods": {}, "tnds": {}}}), encoding="utf-8")
            (candidate / "atlas" / "config").mkdir(parents=True)
            fake_shadow = lambda _candidate, temporary, _manifest, _status: (make_shadow(Path(temporary)), {"sourceHash": "csv"}, {"regions": [{"region": "r", "sourceHash": "same"}]}, {})
            with patch.object(diagnostic, "build_shadow_v1", side_effect=fake_shadow):
                result = diagnostic.run_diagnostic(candidate, previous, report_dir, candidate_fingerprint="fingerprint")
            self.assertEqual(result["status"], "completed")
            self.assertEqual(result["stopAreaEvidence"]["activeGroupCount"], 1)
            self.assertTrue((report_dir / "atlas-v2-national-diagnostic.json").is_file())
            self.assertTrue((report_dir / "atlas-v2-national-diagnostic.md").is_file())
            self.assertFalse(any(path.suffix in {".xml", ".csv", ".zip"} for path in report_dir.rglob("*")))


def make_shadow(root: Path) -> Path:
    shadow = root / "shadow-v1"
    make_tree(shadow, "atlas-prepared-bus-data-v1", False, nested=False)
    return shadow


if __name__ == "__main__":
    unittest.main()
