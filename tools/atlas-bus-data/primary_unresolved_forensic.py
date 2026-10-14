"""Stream unresolved primary coverage-ledger lineage and join frozen GTFS files."""
from __future__ import annotations
import argparse, csv, hashlib, io, json, re, zipfile
from collections import Counter
from pathlib import Path
from source_snapshot import BODS_REGIONS, load_and_verify


class JsonStream:
    def __init__(self, path: Path):
        self.stream = path.open("r", encoding="utf-8")
        self.buffer = ""; self.pos = 0; self.decoder = json.JSONDecoder(); self.eof = False
    def _fill(self):
        if not self.eof:
            chunk = self.stream.read(4 * 1024 * 1024)
            if chunk: self.buffer += chunk
            else: self.eof = True
    def _space(self):
        while True:
            while self.pos < len(self.buffer) and self.buffer[self.pos].isspace(): self.pos += 1
            if self.pos < len(self.buffer) or self.eof: return
            self._fill()
    def char(self):
        self._space()
        if self.pos >= len(self.buffer): raise EOFError
        value = self.buffer[self.pos]; self.pos += 1; return value
    def value(self):
        self._space()
        while True:
            try:
                value, end = self.decoder.raw_decode(self.buffer, self.pos)
                self.pos = end
                if self.pos > 8 * 1024 * 1024:
                    self.buffer = self.buffer[self.pos:]; self.pos = 0
                return value
            except json.JSONDecodeError:
                if self.eof: raise
                self._fill()
    def close(self): self.stream.close()


def load_region_records(path: Path):
    reader = JsonStream(path)
    try:
        if reader.char() != "{": raise ValueError("Coverage ledger root is not an object")
        while True:
            char = reader.char()
            if char == "}": break
            if char == ",": continue
            reader.pos -= 1
            key = reader.value()
            if reader.char() != ":": raise ValueError("Malformed coverage ledger object")
            if key == "regions":
                if reader.char() != "[": raise ValueError("Coverage ledger regions is not an array")
                while True:
                    char = reader.char()
                    if char == "]": return
                    if char == ",": continue
                    reader.pos -= 1
                    region = reader.value()
                    yield region
                return
            reader.value()
        raise ValueError("Coverage ledger has no regions array")
    finally: reader.close()


def csv_index(archive: zipfile.ZipFile, member: str, key: str) -> tuple[dict[str, dict], dict]:
    """Index unique keys and report duplicate rows instead of last-row wins."""
    index, seen, duplicate_keys, duplicate_rows = {}, set(), set(), 0
    with archive.open(member) as raw, io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline="") as text:
        for row in csv.DictReader(text):
            value = str(row.get(key) or "")
            if not value: continue
            if value in seen:
                duplicate_rows += 1
                duplicate_keys.add(value)
                index.pop(value, None)
            elif value not in duplicate_keys:
                index[value] = row
            seen.add(value)
    return index, {"rowsWithKey": len(seen) + duplicate_rows, "uniqueKeys": len(seen),
                   "duplicateKeyCount": len(duplicate_keys), "duplicateRowCount": duplicate_rows,
                   "duplicateKeySamples": sorted(duplicate_keys)[:10]}


def read_naptan_identity_sets(path: Path) -> tuple[set[str], set[str], dict]:
    """Stream exact StopPoint codes; shape profiles are diagnostic only."""
    import xml.etree.ElementTree as ET
    atco, naptan = set(), set()
    atco_shapes, naptan_shapes = Counter(), Counter()
    stack = []
    current = None
    for event, element in ET.iterparse(path, events=("start", "end")):
        tag = str(element.tag).rsplit("}", 1)[-1]
        if event == "start":
            stack.append(element)
            if tag == "StopPoint": current = {"AtcoCode": "", "NaptanCode": ""}
        else:
            if current is not None and tag in current:
                current[tag] = (element.text or "").strip()
            if tag == "StopPoint" and current is not None:
                a, n = current["AtcoCode"], current["NaptanCode"]
                if a:
                    atco.add(a); atco_shapes[re.sub(r"[A-Z]", "A", re.sub(r"[0-9]", "9", a))] += 1
                if n:
                    naptan.add(n); naptan_shapes[re.sub(r"[A-Z]", "A", re.sub(r"[0-9]", "9", n))] += 1
                current = None
                if len(stack) > 1: stack[-2].remove(element)
                element.clear()
            stack.pop()
    return atco, naptan, {"stopPointCountWithAtco": len(atco), "stopPointCountWithNaptanCode": len(naptan),
                          "atcoShapePatterns": [{"shape": k, "count": v} for k, v in atco_shapes.most_common()],
                          "naptanCodeShapePatterns": [{"shape": k, "count": v} for k, v in naptan_shapes.most_common()],
                          "shapeMatchingIsDiagnosticOnly": True}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""): digest.update(chunk)
    return digest.hexdigest()


def analyse(ledger: Path, snapshot: Path, expected_snapshot_id: str) -> dict:
    source_manifest = load_and_verify(snapshot, expected_snapshot_id=expected_snapshot_id, expected_source_count=11, expected_total_bytes=2244572632)
    manifest_by_path = {item["path"]: item for item in source_manifest["sources"]}
    naptan_path = snapshot / "sources" / "naptan.xml"
    naptan_entry = manifest_by_path["sources/naptan.xml"]
    if naptan_path.stat().st_size != int(naptan_entry["bytes"]) or sha256_file(naptan_path) != naptan_entry["sha256"]:
        raise ValueError("Frozen NaPTAN source failed manifest verification")
    atco_ids, naptan_codes, naptan_profile = read_naptan_identity_sets(naptan_path)
    atco_shapes = {item["shape"] for item in naptan_profile["atcoShapePatterns"]}
    naptan_shapes = {item["shape"] for item in naptan_profile["naptanCodeShapePatterns"]}
    total, by_region, by_method, by_route, by_operator, stops, lineage = Counter(), Counter(), Counter(), Counter(), Counter(), Counter(), Counter()
    trip_ids, stop_ids, route_ids, route_numbers, operators = set(), set(), set(), set(), set()
    duplicate_tables = Counter(); duplicate_samples = {}; identity_counts = Counter()
    stop_id_frequency, stop_code_frequency = Counter(), Counter()
    join_findings = Counter(); region_count = 0
    for report in load_region_records(ledger):
        region_count += 1
        region = str(report.get("region", ""))
        if region not in {"east_anglia", "east_midlands", "london", "north_east", "north_west", "south_east", "south_west", "west_midlands", "yorkshire"}:
            raise ValueError(f"Unexpected coverage-ledger region: {region}")
        records = report.get("unresolvedStopIdentityRecords")
        if not isinstance(records, list): raise ValueError(f"Missing unresolved lineage for {region}")
        source_path = snapshot / "sources" / "bods" / f"{region}.zip"
        expected_entry = manifest_by_path[f"sources/bods/{region}.zip"]
        if source_path.stat().st_size != int(expected_entry["bytes"]) or sha256_file(source_path) != expected_entry["sha256"]:
            raise ValueError(f"Frozen BODS region failed manifest verification: {region}")
        with zipfile.ZipFile(source_path) as archive:
            names = {Path(n).name for n in archive.namelist()}
            required = {"routes.txt", "trips.txt", "stops.txt", "agency.txt"}
            if not required <= names: raise ValueError(f"Required GTFS join tables missing for {region}")
            route_pair, trip_pair, stop_pair, agency_pair = (csv_index(archive, name, key) for name, key in (("routes.txt", "route_id"), ("trips.txt", "trip_id"), ("stops.txt", "stop_id"), ("agency.txt", "agency_id")))
            (routes, route_stats), (trips, trip_stats), (gtfs_stops, stop_stats), (agencies, agency_stats) = route_pair, trip_pair, stop_pair, agency_pair
            for table, stats in (("routes.txt", route_stats), ("trips.txt", trip_stats), ("stops.txt", stop_stats), ("agency.txt", agency_stats)):
                duplicate_tables[f"{table}.duplicateKeyCount"] += stats["duplicateKeyCount"]
                duplicate_tables[f"{table}.duplicateRowCount"] += stats["duplicateRowCount"]
                duplicate_samples[f"{region}:{table}"] = stats["duplicateKeySamples"]
        for row in records:
            total["records"] += 1; by_region[region] += 1
            by_method[str(row.get("matchMethod", "unknown"))] += 1
            stop_id, trip_id, route_id = str(row.get("gtfsStopId") or ""), str(row.get("tripId") or ""), str(row.get("routeId") or "")
            trip = trips.get(trip_id); stop = gtfs_stops.get(stop_id); route = routes.get(route_id)
            if trip_id: trip_ids.add(trip_id)
            if stop_id: stop_ids.add(stop_id)
            if route_id: route_ids.add(route_id)
            stop_code = str((stop or {}).get("stop_code") or row.get("gtfsStopCode") or row.get("stopCode") or "")
            if stop_id: stop_id_frequency[stop_id] += 1
            if stop_code: stop_code_frequency[stop_code] += 1
            identity_counts["gtfsStopIdBlank"] += not bool(stop_id)
            identity_counts["gtfsStopIdAtcoShapeCompatible"] += bool(stop_id and re.sub(r"[A-Z]", "A", re.sub(r"[0-9]", "9", stop_id)) in atco_shapes)
            identity_counts["gtfsStopIdNonAtcoOrInternalShape"] += bool(stop_id and re.sub(r"[A-Z]", "A", re.sub(r"[0-9]", "9", stop_id)) not in atco_shapes)
            identity_counts["gtfsStopCodeBlank"] += not bool(stop_code)
            identity_counts["gtfsStopCodePresent"] += bool(stop_code)
            identity_counts["gtfsStopCodeNaptanShapeCompatible"] += bool(stop_code and re.sub(r"[A-Z]", "A", re.sub(r"[0-9]", "9", stop_code)) in naptan_shapes)
            identity_counts["exactAtcoCodeMatches"] += stop_id in atco_ids
            identity_counts["exactNaptanCodeMatches"] += bool(stop_code and stop_code in naptan_codes)
            identity_counts["nonmatchingStopIds"] += bool(stop_id and stop_id not in atco_ids)
            identity_counts["nonmatchingStopCodes"] += bool(stop_code and stop_code not in naptan_codes)
            for field, value in (("gtfsStopId", stop_id), ("tripId", trip_id), ("routeId", route_id)):
                if not value: lineage[f"missing_{field}"] += 1
            if trip: join_findings["trip_found"] += 1
            else: join_findings["trip_missing"] += 1
            if stop: join_findings["gtfs_stop_found"] += 1
            else: join_findings["gtfs_stop_missing"] += 1
            if row.get("resolvedStopPointId"): lineage["has_resolved_stop_point_id"] += 1
            else: lineage["unresolved_stop_point_id"] += 1
            if trip and trip.get("route_id") == route_id: join_findings["trip_route_consistent"] += 1
            elif trip: join_findings["trip_route_mismatch"] += 1
            route_number = (route or {}).get("route_short_name") or row.get("routeNumber") or "unknown"
            route_numbers.add(str(route_number))
            by_route[str(route_number)] += 1
            agency_id = (route or {}).get("agency_id", "")
            operator = agencies.get(agency_id, {}).get("agency_name") or "unknown"
            operators.add(str(operator))
            by_operator[str(operator)] += 1
            stops[str(row.get("gtfsStopName") or (stop or {}).get("stop_name") or "unknown")] += 1
    if region_count != 9: raise ValueError(f"Expected nine primary BODS regions, received {region_count}")
    body = {"schema": "atlas-primary-unresolved-forensic-v2", "snapshotId": expected_snapshot_id,
        "sourceWindow": "2026-10-13 frozen ACQ-1 BODS/NaPTAN evidence", "coverageLedgerSha256": sha256_file(ledger),
        "unresolvedScheduledCallCount": total["records"], "knownBaselineUnresolvedCount": 4908,
        "baselineCountMatches": total["records"] == 4908, "distinctRegions": region_count,
        "countsByRegion": dict(sorted(by_region.items())), "countsByMatchMethod": dict(sorted(by_method.items())),
        "countsByRouteNumberTop25": [{"routeNumber": k, "count": v} for k, v in by_route.most_common(25)],
        "countsByOperatorTop25": [{"operator": k, "count": v} for k, v in by_operator.most_common(25)],
        "topStopNames": [{"stopName": k, "count": v} for k, v in stops.most_common(25)],
        "gtfsLineageJoin": dict(sorted(join_findings.items())), "lineageFields": dict(sorted(lineage.items())),
        "uniqueTrips": len(trip_ids), "uniqueTripCount": len(trip_ids), "uniqueGtfsStopIdCount": len(stop_ids),
        "uniqueRouteIdCount": len(route_ids), "uniqueRouteNumberCount": len(route_numbers), "uniqueOperatorCount": len(operators),
        "naPTANExactIdentityCheck": {**dict(identity_counts), **naptan_profile,
            "stopIdComparedOnlyToAtcoCode": True, "stopCodeComparedOnlyToNaptanCode": True,
            "fuzzyMatchingUsed": False, "spatialMatchingUsed": False, "identityResolutionActivated": False},
        "topGtfsStopIds": [{"gtfsStopId": k, "count": v} for k, v in stop_id_frequency.most_common(25)],
        "topGtfsStopCodes": [{"gtfsStopCode": k, "count": v} for k, v in stop_code_frequency.most_common(25)],
        "gtfsStopIdRepeatCountDistribution": dict(sorted(Counter(stop_id_frequency.values()).items())),
        "gtfsStopCodeRepeatCountDistribution": dict(sorted(Counter(stop_code_frequency.values()).items())),
        "duplicateGtfsKeys": {"counts": dict(sorted(duplicate_tables.items())), "samplesByRegionAndTable": duplicate_samples,
            "duplicateKeysSuppressJoinRows": True}, "diagnosticOnly": True,
        "sourceSnapshotMutated": False, "status": "PRIMARY_FORENSIC_LINEAGE_AVAILABLE" if not lineage["missing_tripId"] and not lineage["missing_routeId"] and not lineage["missing_gtfsStopId"] and not sum(duplicate_tables.values()) else "PRIMARY_FORENSIC_LINEAGE_INSUFFICIENT"}
    body["summarySha256"] = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger", required=True); parser.add_argument("--snapshot", required=True)
    parser.add_argument("--expected-snapshot-id", required=True); parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = analyse(Path(args.ledger), Path(args.snapshot), args.expected_snapshot_id)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"schema": result["schema"], "unresolved": result["unresolvedScheduledCallCount"], "status": result["status"], "summarySha256": result["summarySha256"]}, sort_keys=True))
    if not result["baselineCountMatches"]: raise SystemExit("Frozen primary unresolved total does not match the accepted 4,908 count")

if __name__ == "__main__": main()
