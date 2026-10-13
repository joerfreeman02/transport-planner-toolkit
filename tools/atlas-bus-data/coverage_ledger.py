#!/usr/bin/env python3
"""Build the deterministic national Bus preparation coverage ledger.

The ledger is diagnostic evidence, not runtime planner data.  It accounts for
the frozen NaPTAN/BODS input, the deterministic identity decisions, prepared
service/shard evidence, and one final state for every relevant StopPoint.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import zipfile
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from build_static_index import active_days, parse_date, parse_minutes, representative_dates, resolve_exact_gtfs_stop
from prepared_data_v2 import parse_naptan_xml
from source_snapshot import load_and_verify

SCHEMA = "atlas-bus-national-coverage-ledger-v1"
GAP_SCHEMA = "atlas-bus-national-preparation-gap-report-v1"
FORENSIC_SCHEMA = "atlas-bus-0590b-forensic-v1"

STATES = (
    "CURRENT_TIMETABLE_EVIDENCE",
    "CONFIRMED_NO_CURRENT_SERVICE",
    "INACTIVE_OR_LEGACY",
    "SOURCE_IDENTITY_UNRESOLVED",
    "SOURCE_DATA_INCOMPLETE",
    "PREPARATION_REJECTED",
    "PREPARATION_ERROR",
    "OUTSIDE_APPLICABLE_SCOPE",
)

BUS_ROUTE_TYPES = {"", "3", "700"}


def _clean(value: object) -> str:
    return str(value or "").strip()


def _json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def gtfs_rows(archive: zipfile.ZipFile, name: str):
    with archive.open(name) as binary:
        with io.TextIOWrapper(binary, encoding="utf-8-sig", newline="") as text:
            yield from csv.DictReader(text)


def _normal(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _clean(value).casefold()).strip()


def _identifiers(naptan) -> dict[str, dict[str, str]]:
    identifiers = {"atco": {}, "naptan": {}}
    for stop_id, stop in sorted(naptan.stops.items()):
        identifiers["atco"][stop_id] = stop_id
        identifiers["atco"][stop_id.lower()] = stop_id
        if stop.get("naptanCode"):
            identifiers["naptan"][str(stop["naptanCode"]).lower()] = stop_id
    return identifiers


def _prepared_evidence(candidate_site: Path) -> tuple[dict, dict[str, dict]]:
    """Load only the generated candidate shards and return stop evidence."""
    root = candidate_site / "atlas" / "data" / "bus"
    if not (root / "manifest.json").is_file() and (candidate_site / "manifest.json").is_file():
        root = candidate_site
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        raise ValueError(f"Prepared Bus manifest is missing: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    fields = manifest.get("stopFields") or []
    evidence: dict[str, dict] = defaultdict(lambda: {"services": set(), "routes": set(), "shards": set(), "calls": 0})
    for relative in manifest.get("serviceShards", {}).values():
        for path_text in relative if isinstance(relative, list) else [relative]:
            path = root / path_text
            with gzip.open(path, "rt", encoding="utf-8") as stream:
                payload = json.load(stream)
            for service in payload.get("services", []):
                for stop_id, schedules in (service.get("stopSchedules") or {}).items():
                    calls = sum(len(values) for values in (schedules or {}).values() if isinstance(values, list))
                    if not calls:
                        continue
                    item = evidence[stop_id]
                    item["services"].add(service.get("id"))
                    item["routes"].add(_clean(service.get("routeNumber")))
                    item["shards"].add(path_text.replace("\\", "/"))
                    item["calls"] += calls
    for item in evidence.values():
        for key in ("services", "routes", "shards"):
            item[key] = sorted(value for value in item[key] if value)
    return manifest, dict(evidence)


def _new_region(region: str, archive: Path) -> dict:
    return {
        "region": region,
        "archive": archive.name,
        "archiveSha256": sha256(archive),
        "sourceStatus": "CHECKED",
        "stopRecords": 0,
        "stopRecordsValid": 0,
        "stopRecordsRejected": 0,
        "routes": 0,
        "busRoutes": 0,
        "nonBusRoutes": 0,
        "trips": 0,
        "activeBusTrips": 0,
        "inactiveOrNonBusTrips": 0,
        "tripsRetainedByPreparation": 0,
        "tripsRejectedFromPreparation": 0,
        "stopTimes": 0,
        "relevantScheduledCalls": 0,
        "resolvedScheduledCalls": 0,
        "exactIdentityMatches": 0,
        "alternateIdentityMatches": 0,
        "unresolvedStopIdentities": 0,
        "unresolvedStopIdentityRecords": [],
        "malformedScheduledCalls": 0,
        "outOfScopeResolvedCalls": 0,
        "retainedScheduledCalls": 0,
        "retainedServices": 0,
        "rejectedRecords": [],
        "conservation": {},
    }


def _process_trip(region: str, rows: list[dict], trip: dict, route: dict, gtfs_stops: dict, all_identifiers: dict, prepared_stops: dict, naptan_stops: dict, dates: dict[str, date], result: dict, per_stop: dict[str, dict], raw_stop_evidence: dict[str, list[dict]]) -> None:
    is_bus = _clean(route.get("route_type")) in BUS_ROUTE_TYPES and bool(_clean(route.get("route_short_name")) or _clean(route.get("route_long_name")))
    service_days = trip.get("active_days") or []
    if not is_bus or not service_days:
        result["inactiveOrNonBusTrips"] += 1
        return
    result["activeBusTrips"] += 1
    result["relevantScheduledCalls"] += len(rows)
    calls = 0
    retained = 0
    for row in sorted(rows, key=lambda value: int(value.get("stop_sequence", 0) or 0)):
        gtfs_id = _clean(row.get("stop_id"))
        details = gtfs_stops.get(gtfs_id, {})
        stop_code = _clean(details.get("stop_code"))
        resolved, method = resolve_exact_gtfs_stop(gtfs_id, details, all_identifiers)
        departure = parse_minutes(_clean(row.get("departure_time")) or _clean(row.get("arrival_time")))
        raw = {
            "region": region,
            "gtfsStopId": gtfs_id or None,
            "gtfsStopCode": stop_code or None,
            "gtfsStopName": _clean(details.get("stop_name")) or None,
            "tripId": _clean(trip.get("trip_id")) or None,
            "routeId": _clean(trip.get("route_id")) or None,
            "routeNumber": _clean(route.get("route_short_name")) or _clean(route.get("route_long_name")) or None,
            "matchMethod": method,
            "resolvedStopPointId": resolved,
        }
        if (gtfs_id or stop_code).startswith("0590B"):
            raw_stop_evidence.setdefault(gtfs_id or stop_code, []).append(raw)
        if departure is None:
            result["malformedScheduledCalls"] += 1
            result["rejectedRecords"].append({**raw, "reason": "invalid_or_missing_time"})
            if resolved:
                per_stop.setdefault(resolved, {}).setdefault("rejected", []).append({"reason": "invalid_or_missing_time", "region": region, "tripId": raw["tripId"]})
            continue
        if not resolved:
            result["unresolvedStopIdentities"] += 1
            result["unresolvedStopIdentityRecords"].append(raw)
            continue
        result["resolvedScheduledCalls"] += 1
        if method == "gtfs-stop-id-equals-atco-code":
            result["exactIdentityMatches"] += 1
        elif method == "gtfs-stop-code-equals-naptan-code":
            result["alternateIdentityMatches"] += 1
        stop = naptan_stops.get(resolved)
        record = per_stop.setdefault(resolved, {})
        record.setdefault("resolvedCalls", 0)
        record["resolvedCalls"] += 1
        record.setdefault("identityMethods", set()).add(method)
        record.setdefault("routes", set()).add(raw["routeNumber"])
        record.setdefault("regions", set()).add(region)
        if resolved.startswith("0590B"):
            record.setdefault("rawEvidence", []).append(raw)
        if stop and stop.get("status") in ("", "active") and stop.get("busPreparedEligible") is True and stop.get("coordinateValid") is True:
            retained += 1
            result["retainedScheduledCalls"] += 1
            calls += 1
        else:
            result["outOfScopeResolvedCalls"] += 1
    if len(rows) >= 2 and retained:
        result["tripsRetainedByPreparation"] += 1
        result["retainedServices"] += 1
    else:
        result["tripsRejectedFromPreparation"] += 1
        result["rejectedRecords"].append({"region": region, "tripId": _clean(trip.get("trip_id")), "routeId": _clean(trip.get("route_id")), "reason": "no_preparable_current_stop_evidence_or_insufficient_calls"})
        for stop_id in {item for item in (row.get("resolvedStopPointId") for row in []) if item}:
            per_stop.setdefault(stop_id, {}).setdefault("rejected", []).append({"reason": "trip_not_retained", "region": region})


def _region_ledger(archive: Path, region: str, snapshot_date: date, naptan, prepared_evidence: dict[str, dict]) -> tuple[dict, dict[str, dict], dict[str, list[dict]]]:
    result = _new_region(region, archive)
    per_stop: dict[str, dict] = {}
    raw_stop_evidence: dict[str, list[dict]] = {}
    all_identifiers = _identifiers(naptan)
    dates = representative_dates(snapshot_date)
    try:
        with zipfile.ZipFile(archive) as zf:
            required = {"agency.txt", "stops.txt", "routes.txt", "calendar.txt", "trips.txt", "stop_times.txt"}
            missing = sorted(required - {Path(name).name for name in zf.namelist()})
            if missing:
                result["sourceStatus"] = "SOURCE_DATA_INCOMPLETE"
                result["rejectedRecords"].append({"reason": "missing_required_gtfs_members", "members": missing})
                return result, per_stop, raw_stop_evidence
            gtfs_stops = {}
            for row in gtfs_rows(zf, "stops.txt"):
                result["stopRecords"] += 1
                stop_id = _clean(row.get("stop_id"))
                if not stop_id or not _clean(row.get("stop_name")):
                    result["stopRecordsRejected"] += 1
                    result["rejectedRecords"].append({"gtfsStopId": stop_id or None, "reason": "malformed_stop_record"})
                    continue
                result["stopRecordsValid"] += 1
                gtfs_stops[stop_id] = row
            routes = {}
            for row in gtfs_rows(zf, "routes.txt"):
                result["routes"] += 1
                route_id = _clean(row.get("route_id"))
                if route_id:
                    routes[route_id] = row
                if _clean(row.get("route_type")) in BUS_ROUTE_TYPES and (_clean(row.get("route_short_name")) or _clean(row.get("route_long_name"))):
                    result["busRoutes"] += 1
                else:
                    result["nonBusRoutes"] += 1
            calendars = { _clean(row.get("service_id")): row for row in gtfs_rows(zf, "calendar.txt") }
            exceptions: dict[str, dict[date, int]] = defaultdict(dict)
            if "calendar_dates.txt" in zf.namelist():
                for row in gtfs_rows(zf, "calendar_dates.txt"):
                    when = parse_date(row.get("date", ""))
                    if when:
                        exceptions[_clean(row.get("service_id"))][when] = int(row.get("exception_type", 0) or 0)
            service_days = {service_id: active_days(calendar, exceptions.get(service_id, {}), dates) for service_id, calendar in calendars.items()}
            for service_id in exceptions:
                if service_id not in service_days:
                    service_days[service_id] = active_days({}, exceptions[service_id], dates)
            trips = {}
            for row in gtfs_rows(zf, "trips.txt"):
                result["trips"] += 1
                trip_id = _clean(row.get("trip_id"))
                route = routes.get(_clean(row.get("route_id")), {})
                days = service_days.get(_clean(row.get("service_id")), [])
                trips[trip_id] = {**row, "active_days": days}
            current_id = None
            current_rows: list[dict] = []
            def flush() -> None:
                if not current_id:
                    return
                trip = trips.get(current_id)
                if not trip:
                    result["inactiveOrNonBusTrips"] += 1
                    return
                route = routes.get(_clean(trip.get("route_id")), {})
                _process_trip(region, current_rows, trip, route, gtfs_stops, all_identifiers, prepared_evidence, naptan.stops, dates, result, per_stop, raw_stop_evidence)
            for row in gtfs_rows(zf, "stop_times.txt"):
                result["stopTimes"] += 1
                trip_id = _clean(row.get("trip_id"))
                if current_id is None:
                    current_id = trip_id
                if trip_id != current_id:
                    flush()
                    current_id, current_rows = trip_id, []
                current_rows.append(row)
            flush()
    except (OSError, zipfile.BadZipFile, csv.Error) as error:
        result["sourceStatus"] = "SOURCE_DATA_INCOMPLETE"
        result["rejectedRecords"].append({"reason": "archive_read_error", "error": type(error).__name__})
    result["unresolvedStopIdentityRecords"] = sorted(result["unresolvedStopIdentityRecords"], key=lambda item: (item.get("gtfsStopId") or "", item.get("tripId") or "", item.get("routeId") or ""))
    result["rejectedRecords"] = sorted(result["rejectedRecords"], key=lambda item: json.dumps(item, sort_keys=True))[:10000]
    result["conservation"] = {
        "stopRecords": {"input": result["stopRecords"], "accounted": result["stopRecordsValid"] + result["stopRecordsRejected"], "balanced": result["stopRecords"] == result["stopRecordsValid"] + result["stopRecordsRejected"]},
        "routes": {"input": result["routes"], "accounted": result["busRoutes"] + result["nonBusRoutes"], "balanced": result["routes"] == result["busRoutes"] + result["nonBusRoutes"]},
        "relevantScheduledCalls": {"input": result["relevantScheduledCalls"], "accounted": result["retainedScheduledCalls"] + result["outOfScopeResolvedCalls"] + result["unresolvedStopIdentities"] + result["malformedScheduledCalls"], "balanced": result["relevantScheduledCalls"] == result["retainedScheduledCalls"] + result["outOfScopeResolvedCalls"] + result["unresolvedStopIdentities"] + result["malformedScheduledCalls"]},
    }
    return result, per_stop, raw_stop_evidence


def final_state(stop: dict, source: dict, prepared: dict | None) -> tuple[str, str]:
    if stop.get("status") not in ("", "active"):
        return "INACTIVE_OR_LEGACY", "NaPTAN status is inactive/deleted/historical"
    if stop.get("busPreparedEligible") is not True:
        return "OUTSIDE_APPLICABLE_SCOPE", "NaPTAN stop type is not bus/coach eligible"
    if stop.get("coordinateValid") is not True:
        return "SOURCE_DATA_INCOMPLETE", "active bus-eligible StopPoint lacks valid coordinates"
    if prepared and prepared.get("calls", 0) > 0:
        return "CURRENT_TIMETABLE_EVIDENCE", "prepared service evidence contains scheduled calls"
    if source.get("resolvedCalls", 0) > 0:
        return "PREPARATION_ERROR", "source identity resolved to a valid stop but prepared evidence is absent"
    if source.get("unresolvedIdentity"):
        return "SOURCE_IDENTITY_UNRESOLVED", "timetable evidence was retained but no permitted deterministic identity resolved it to this StopPoint"
    if source.get("rejected"):
        return "PREPARATION_REJECTED", "source records for this StopPoint were rejected with explicit reasons"
    return "CONFIRMED_NO_CURRENT_SERVICE", "all relevant frozen BODS regions were checked and no current scheduled call resolved to this StopPoint"


def conservation_pass(ledger: dict) -> bool:
    return all(item.get("balanced") is True for region in ledger.get("regions", []) for item in region.get("conservation", {}).values())


def _state_counts(rows: list[dict]) -> dict[str, int]:
    counts = Counter(row.get("finalState") for row in rows)
    return {state: int(counts.get(state, 0)) for state in STATES}


def _forensic_root_cause(row: dict, previous_manifest: dict | None, current_snapshot_id: str) -> str:
    state = row["finalState"]
    if state == "INACTIVE_OR_LEGACY":
        return "inactive/legacy records"
    if state == "CURRENT_TIMETABLE_EVIDENCE":
        old_paths = (previous_manifest or {}).get("serviceShards", {}).get(row["stopPointId"][:5], [])
        old_snapshot = ((previous_manifest or {}).get("sources", {}).get("sourceSnapshot", {}) or {}).get("snapshotId")
        if not old_paths:
            return "source-window mismatch" if old_snapshot and old_snapshot != current_snapshot_id else "ATLAS preparation/sharding defect"
        return "no proven current gap in the new candidate; old snapshot had a different prepared evidence set"
    if row.get("rawBodsScheduledCalls", 0) == 0 and not row.get("rawBodsStops"):
        return "BODS omission/incomplete publication"
    if row.get("unresolvedIdentityEvidence"):
        return "ATLAS identity-mapping defect"
    if row.get("rejectedEvidence"):
        return "malformed source evidence"
    return "genuine current zero service"


def run_ledger(*, candidate_site: Path, naptan_xml: Path, gtfs_dir: Path, snapshot_root: Path, output: Path, previous_root: Path | None = None) -> dict:
    snapshot_manifest = load_and_verify(snapshot_root)
    prepared_manifest, prepared = _prepared_evidence(candidate_site)
    snapshot_date = date.fromisoformat(prepared_manifest["snapshotDate"])
    naptan = parse_naptan_xml(naptan_xml)
    per_stop: dict[str, dict] = {}
    raw_stop_evidence: dict[str, list[dict]] = {}
    region_reports = []
    for archive in sorted(gtfs_dir.glob("*.zip")):
        region = archive.stem.replace("-", "_")
        report, region_stops, region_raw = _region_ledger(archive, region, snapshot_date, naptan, prepared)
        region_reports.append(report)
        for stop_id, item in region_stops.items():
            target = per_stop.setdefault(stop_id, {})
            for key in ("resolvedCalls",):
                target[key] = target.get(key, 0) + item.get(key, 0)
            for key in ("identityMethods", "routes", "regions"):
                target.setdefault(key, set()).update(item.get(key, set()))
            target.setdefault("rawEvidence", []).extend(item.get("rawEvidence", []))
            target.setdefault("rejected", []).extend(item.get("rejected", []))
        for key, values in region_raw.items():
            raw_stop_evidence.setdefault(key, []).extend(values)
    rows = []
    for stop_id, stop in sorted(naptan.stops.items()):
        source = per_stop.get(stop_id, {})
        prepared_item = prepared.get(stop_id)
        row = {
            "stopPointId": stop_id,
            "name": stop.get("name"),
            "status": stop.get("status"),
            "stopType": stop.get("stopType"),
            "busEligible": stop.get("busPreparedEligible") is True,
            "coordinateValid": stop.get("coordinateValid") is True,
            "rawBodsResolvedCalls": source.get("resolvedCalls", 0),
            "rawBodsRoutes": sorted(source.get("routes", set())),
            "rawBodsRegions": sorted(source.get("regions", set())),
            "identityMethods": sorted(source.get("identityMethods", set())),
            "preparedCalls": (prepared_item or {}).get("calls", 0),
            "preparedServices": (prepared_item or {}).get("services", []),
            "preparedShardPaths": (prepared_item or {}).get("shards", []),
            "rejectedEvidence": source.get("rejected", []),
        }
        state, reason = final_state(stop, source, prepared_item)
        row["finalState"] = state
        row["reason"] = reason
        rows.append(row)
    counts = _state_counts(rows)
    relevant = sum(1 for row in rows if row["busEligible"] and row["status"] in ("", "active"))
    classified = sum(counts.get(state, 0) for state in STATES)
    gap = {
        "schema": GAP_SCHEMA,
        "activeBusEligibleStopCount": relevant,
        "stateCounts": counts,
        "confirmedTimetableCoverage": counts["CURRENT_TIMETABLE_EVIDENCE"],
        "confirmedNoCurrentService": counts["CONFIRMED_NO_CURRENT_SERVICE"],
        "unclassifiedRemainder": relevant - sum(counts[state] for state in STATES if state != "OUTSIDE_APPLICABLE_SCOPE" and state != "INACTIVE_OR_LEGACY"),
        "preparationErrorCount": counts["PREPARATION_ERROR"],
        "unresolvedIdentityCount": counts["SOURCE_IDENTITY_UNRESOLVED"],
        "unresolvedGtfsIdentityRecordCount": sum(report.get("unresolvedStopIdentities", 0) for report in region_reports),
        "incompleteSourceCount": counts["SOURCE_DATA_INCOMPLETE"],
        "classifiedRelevantStopCount": classified,
        "allRelevantStopsHaveFinalState": all(row["finalState"] in STATES for row in rows if row["busEligible"] and row["status"] in ("", "active")),
    }
    # The remainder is deliberately scoped to active bus-eligible stops only.
    gap["unclassifiedRemainder"] = relevant - sum(counts[state] for state in STATES if state not in {"INACTIVE_OR_LEGACY", "OUTSIDE_APPLICABLE_SCOPE"})
    previous_manifest = None
    if previous_root:
        path = previous_root / "atlas" / "data" / "bus" / "manifest.json"
        if path.is_file():
            try:
                previous_manifest = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                previous_manifest = None
    forensic_rows = []
    for row in rows:
        if not row["stopPointId"].startswith("0590B"):
            continue
        raw = [item for values in raw_stop_evidence.values() for item in values if item.get("resolvedStopPointId") == row["stopPointId"] or item.get("gtfsStopId") == row["stopPointId"] or item.get("gtfsStopCode") == row["stopPointId"]]
        forensic = {
            **row,
            "exists": True,
            "active": row["status"] in ("", "active"),
            "busEligible": row["busEligible"],
            "rawBodsStops": sorted({item.get("gtfsStopId") for item in raw if item.get("gtfsStopId")}),
            "rawBodsScheduledCalls": len(raw),
            "scheduledRoutes": sorted({item.get("routeNumber") for item in raw if item.get("routeNumber")}),
            "unresolvedIdentityEvidence": [item for values in raw_stop_evidence.values() for item in values if item.get("resolvedStopPointId") is None and (item.get("gtfsStopId") == row["stopPointId"] or item.get("gtfsStopCode") == row["stopPointId"])],
        }
        forensic["previousServiceShardPaths"] = (previous_manifest or {}).get("serviceShards", {}).get(row["stopPointId"][:5], [])
        forensic["previousServiceShardPresent"] = bool(forensic["previousServiceShardPaths"])
        forensic["rootCause"] = _forensic_root_cause(forensic, previous_manifest, snapshot_manifest["snapshotId"])
        forensic_rows.append(forensic)
    ledger = {
        "schema": SCHEMA,
        "snapshot": {"root": str(snapshot_root), "snapshotId": snapshot_manifest["snapshotId"], "state": snapshot_manifest["state"], "sourceCount": snapshot_manifest.get("sourceCount"), "totalBytes": sum(int(item.get("bytes", 0)) for item in snapshot_manifest.get("sources", []))},
        "preparedCandidate": {"root": str(candidate_site), "manifestSha256": sha256((candidate_site / "atlas" / "data" / "bus" / "manifest.json") if (candidate_site / "atlas" / "data" / "bus" / "manifest.json").is_file() else (candidate_site / "manifest.json")), "schema": prepared_manifest.get("schema"), "snapshotDate": prepared_manifest.get("snapshotDate")},
        "naptan": {"sourceStopPointCount": naptan.qa.get("stopPointRecords", 0), "validSourceStopPointCount": naptan.qa.get("validSourceStopPointCount", 0), "activeBusEligibleStopCount": relevant, "inactiveOrLegacyBusStopCount": counts["INACTIVE_OR_LEGACY"], "unsupportedOrNonBusCount": sum(1 for stop in naptan.stops.values() if stop.get("busPreparedEligible") is not True), "malformedOrRejectedCount": sum(value for key, value in naptan.qa.items() if key.startswith("malformed") or key.startswith("duplicate")), "invalidCoordinateCount": naptan.qa.get("invalidOrMissingCoordinateCount", 0), "qa": naptan.qa},
        "regions": region_reports,
        "stops": rows,
        "coverage": gap,
        "conservation": {"allRegionEquationsBalanced": all(all(item.get("balanced") for item in report.get("conservation", {}).values()) for report in region_reports), "allRelevantStopsClassified": gap["unclassifiedRemainder"] == 0},
    }
    output.mkdir(parents=True, exist_ok=True)
    _json(output / "coverage-ledger.json", ledger)
    _json(output / "gap-report.json", gap)
    _json(output / "0590B-forensic.json", {"schema": FORENSIC_SCHEMA, "snapshotId": snapshot_manifest["snapshotId"], "stops": forensic_rows})
    return {"schema": SCHEMA, "coverage": gap, "conservation": ledger["conservation"], "forensicStopCount": len(forensic_rows), "files": {"ledger": "diagnostic-output/coverage-ledger.json", "gapReport": "diagnostic-output/gap-report.json", "forensic0590B": "diagnostic-output/0590B-forensic.json"}}


def gate(path: Path) -> dict:
    report = json.loads(path.read_text(encoding="utf-8"))
    coverage = report.get("coverage", report)
    if int(coverage.get("unclassifiedRemainder", -1)) != 0:
        raise SystemExit("Coverage ledger gate failed: unclassified remainder is non-zero")
    if int(coverage.get("preparationErrorCount", 0)) != 0:
        raise SystemExit("Coverage ledger gate failed: preparation errors are present")
    return {"ok": True, "unclassifiedRemainder": coverage.get("unclassifiedRemainder", 0), "preparationErrorCount": coverage.get("preparationErrorCount", 0)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-site")
    parser.add_argument("--naptan-xml")
    parser.add_argument("--gtfs-dir")
    parser.add_argument("--source-snapshot")
    parser.add_argument("--output")
    parser.add_argument("--previous-root")
    parser.add_argument("--gate")
    args = parser.parse_args()
    if args.gate:
        print(json.dumps(gate(Path(args.gate)), indent=2))
        return
    required = (args.candidate_site, args.naptan_xml, args.gtfs_dir, args.source_snapshot, args.output)
    if not all(required):
        parser.error("preparation mode requires --candidate-site, --naptan-xml, --gtfs-dir, --source-snapshot and --output")
    result = run_ledger(candidate_site=Path(args.candidate_site).resolve(), naptan_xml=Path(args.naptan_xml).resolve(), gtfs_dir=Path(args.gtfs_dir).resolve(), snapshot_root=Path(args.source_snapshot).resolve(), output=Path(args.output).resolve(), previous_root=Path(args.previous_root).resolve() if args.previous_root else None)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
