"""Stream unresolved primary coverage-ledger lineage and join frozen GTFS files."""
from __future__ import annotations
import argparse, csv, hashlib, io, json, zipfile
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


def csv_index(archive: zipfile.ZipFile, member: str, key: str) -> dict[str, dict]:
    with archive.open(member) as raw, io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline="") as text:
        return {row.get(key, ""): row for row in csv.DictReader(text) if row.get(key)}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""): digest.update(chunk)
    return digest.hexdigest()


def analyse(ledger: Path, snapshot: Path, expected_snapshot_id: str) -> dict:
    source_manifest = load_and_verify(snapshot, expected_snapshot_id=expected_snapshot_id, expected_source_count=11, expected_total_bytes=2244572632)
    manifest_by_path = {item["path"]: item for item in source_manifest["sources"]}
    total, by_region, by_method, by_route, by_operator, stops, lineage = Counter(), Counter(), Counter(), Counter(), Counter(), Counter(), Counter()
    trip_ids = set()
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
            routes, trips, gtfs_stops, agencies = (csv_index(archive, name, key) for name, key in (("routes.txt", "route_id"), ("trips.txt", "trip_id"), ("stops.txt", "stop_id"), ("agency.txt", "agency_id")))
        for row in records:
            total["records"] += 1; by_region[region] += 1
            by_method[str(row.get("matchMethod", "unknown"))] += 1
            stop_id, trip_id, route_id = str(row.get("gtfsStopId") or ""), str(row.get("tripId") or ""), str(row.get("routeId") or "")
            if trip_id: trip_ids.add(trip_id)
            for field, value in (("gtfsStopId", stop_id), ("tripId", trip_id), ("routeId", route_id)):
                if not value: lineage[f"missing_{field}"] += 1
            trip = trips.get(trip_id); stop = gtfs_stops.get(stop_id); route = routes.get(route_id)
            if trip: join_findings["trip_found"] += 1
            else: join_findings["trip_missing"] += 1
            if stop: join_findings["gtfs_stop_found"] += 1
            else: join_findings["gtfs_stop_missing"] += 1
            if row.get("resolvedStopPointId"): lineage["has_resolved_stop_point_id"] += 1
            else: lineage["unresolved_stop_point_id"] += 1
            if trip and trip.get("route_id") == route_id: join_findings["trip_route_consistent"] += 1
            elif trip: join_findings["trip_route_mismatch"] += 1
            route_number = (route or {}).get("route_short_name") or row.get("routeNumber") or "unknown"
            by_route[str(route_number)] += 1
            agency_id = (route or {}).get("agency_id", "")
            operator = agencies.get(agency_id, {}).get("agency_name") or "unknown"
            by_operator[str(operator)] += 1
            stops[str(row.get("gtfsStopName") or (stop or {}).get("stop_name") or "unknown")] += 1
    if region_count != 9: raise ValueError(f"Expected nine primary BODS regions, received {region_count}")
    body = {"schema": "atlas-primary-unresolved-forensic-v1", "snapshotId": expected_snapshot_id,
        "sourceWindow": "2026-10-13 frozen ACQ-1 BODS/NaPTAN evidence", "coverageLedgerSha256": sha256_file(ledger),
        "unresolvedScheduledCallCount": total["records"], "knownBaselineUnresolvedCount": 4908,
        "baselineCountMatches": total["records"] == 4908, "distinctRegions": region_count,
        "countsByRegion": dict(sorted(by_region.items())), "countsByMatchMethod": dict(sorted(by_method.items())),
        "countsByRouteNumberTop25": [{"routeNumber": k, "count": v} for k, v in by_route.most_common(25)],
        "countsByOperatorTop25": [{"operator": k, "count": v} for k, v in by_operator.most_common(25)],
        "topStopNames": [{"stopName": k, "count": v} for k, v in stops.most_common(25)],
        "gtfsLineageJoin": dict(sorted(join_findings.items())), "lineageFields": dict(sorted(lineage.items())),
        "uniqueTrips": len(trip_ids), "diagnosticOnly": True,
        "sourceSnapshotMutated": False, "status": "PRIMARY_FORENSIC_LINEAGE_AVAILABLE" if not lineage["missing_tripId"] and not lineage["missing_routeId"] and not lineage["missing_gtfsStopId"] else "PRIMARY_FORENSIC_LINEAGE_INSUFFICIENT"}
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
