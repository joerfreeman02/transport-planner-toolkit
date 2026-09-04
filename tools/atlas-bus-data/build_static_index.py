#!/usr/bin/env python3
"""Build small browser-loadable NaPTAN/BODS shards from official bulk files."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
import os
import re
import shutil
import stat
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SCHEMA = "atlas-prepared-bus-data-v1"
DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
MAJOR_NAME = ("bus station", "coach station", "rail station", "railway station", "town centre", "city centre", "hospital", "airport", "university", "interchange", "shopping centre")
NAPTAN_URL = "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv"
BODS_URL = "https://data.bus-data.dft.gov.uk/timetable/download/"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def clean(value: object) -> str:
    return str(value or "").strip()


def compact_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if path.suffix == ".gz":
        with path.open("wb") as stream:
            with gzip.GzipFile(filename="", mode="wb", fileobj=stream, compresslevel=9, mtime=0) as compressed:
                compressed.write(payload)
    else:
        path.write_bytes(payload)


def clear_output(output: Path) -> None:
    def make_writable(function, path, _error):
        os.chmod(path, stat.S_IWRITE)
        function(path)
    if not output.exists():
        return
    for child in output.iterdir():
        if child.is_dir():
            shutil.rmtree(child, onexc=make_writable)
        else:
            child.chmod(stat.S_IWRITE)
            child.unlink()


def gtfs_rows(archive: zipfile.ZipFile, name: str):
    with archive.open(name) as binary:
        with io.TextIOWrapper(binary, encoding="utf-8-sig", newline="") as text:
            yield from csv.DictReader(text)


def parse_date(value: str) -> date | None:
    try:
        return datetime.strptime(value, "%Y%m%d").date()
    except (TypeError, ValueError):
        return None


def parse_minutes(value: str) -> int | None:
    try:
        hour, minute, second = (int(part) for part in value.split(":"))
        if hour < 0 or minute not in range(60) or second not in range(60):
            return None
        return hour * 60 + minute + (1 if second >= 30 else 0)
    except (AttributeError, TypeError, ValueError):
        return None


def cell_token(value: int) -> str:
    return f"m{abs(value)}" if value < 0 else str(value)


def cell_key(latitude: float, longitude: float, grid_size: float) -> str:
    return f"g{cell_token(math.floor(latitude / grid_size))}_{cell_token(math.floor(longitude / grid_size))}"


def _meridional_arc(latitude: float, latitude0: float, b: float, f0: float, n: float) -> float:
    delta = latitude - latitude0
    total = latitude + latitude0
    return b * f0 * (
        (1 + n + 5 / 4 * n ** 2 + 5 / 4 * n ** 3) * delta
        - (3 * n + 3 * n ** 2 + 21 / 8 * n ** 3) * math.sin(delta) * math.cos(total)
        + (15 / 8 * n ** 2 + 15 / 8 * n ** 3) * math.sin(2 * delta) * math.cos(2 * total)
        - 35 / 24 * n ** 3 * math.sin(3 * delta) * math.cos(3 * total)
    )


def _cartesian_to_geodetic(x: float, y: float, z: float, a: float, b: float) -> tuple[float, float]:
    eccentricity = 1 - b * b / (a * a)
    horizontal = math.hypot(x, y)
    latitude = math.atan2(z, horizontal * (1 - eccentricity))
    while True:
        previous = latitude
        nu = a / math.sqrt(1 - eccentricity * math.sin(latitude) ** 2)
        latitude = math.atan2(z + eccentricity * nu * math.sin(latitude), horizontal)
        if abs(latitude - previous) <= 1e-12:
            return latitude, math.atan2(y, x)


def british_national_grid_to_wgs84(easting: float, northing: float) -> tuple[float, float]:
    """Convert EPSG:27700 coordinates to WGS84 using the published Helmert transform."""
    airy_a, airy_b, f0 = 6377563.396, 6356256.909, 0.9996012717
    latitude0, longitude0 = math.radians(49), math.radians(-2)
    northing0, easting0 = -100000, 400000
    eccentricity = 1 - airy_b * airy_b / (airy_a * airy_a)
    n = (airy_a - airy_b) / (airy_a + airy_b)
    latitude = latitude0
    while True:
        arc = _meridional_arc(latitude, latitude0, airy_b, f0, n)
        difference = northing - northing0 - arc
        if abs(difference) < 0.00001:
            break
        latitude += difference / (airy_a * f0)

    sin_latitude = math.sin(latitude)
    tan_latitude = math.tan(latitude)
    sec_latitude = 1 / math.cos(latitude)
    nu = airy_a * f0 / math.sqrt(1 - eccentricity * sin_latitude ** 2)
    rho = airy_a * f0 * (1 - eccentricity) / (1 - eccentricity * sin_latitude ** 2) ** 1.5
    eta2 = nu / rho - 1
    delta_easting = easting - easting0
    vii = tan_latitude / (2 * rho * nu)
    viii = tan_latitude / (24 * rho * nu ** 3) * (5 + 3 * tan_latitude ** 2 + eta2 - 9 * tan_latitude ** 2 * eta2)
    ix = tan_latitude / (720 * rho * nu ** 5) * (61 + 90 * tan_latitude ** 2 + 45 * tan_latitude ** 4)
    x = sec_latitude / nu
    xi = sec_latitude / (6 * nu ** 3) * (nu / rho + 2 * tan_latitude ** 2)
    xii = sec_latitude / (120 * nu ** 5) * (5 + 28 * tan_latitude ** 2 + 24 * tan_latitude ** 4)
    xiia = sec_latitude / (5040 * nu ** 7) * (61 + 662 * tan_latitude ** 2 + 1320 * tan_latitude ** 4 + 720 * tan_latitude ** 6)
    osgb_latitude = latitude - vii * delta_easting ** 2 + viii * delta_easting ** 4 - ix * delta_easting ** 6
    osgb_longitude = longitude0 + x * delta_easting - xi * delta_easting ** 3 + xii * delta_easting ** 5 - xiia * delta_easting ** 7

    nu = airy_a / math.sqrt(1 - eccentricity * math.sin(osgb_latitude) ** 2)
    cartesian_x = nu * math.cos(osgb_latitude) * math.cos(osgb_longitude)
    cartesian_y = nu * math.cos(osgb_latitude) * math.sin(osgb_longitude)
    cartesian_z = (1 - eccentricity) * nu * math.sin(osgb_latitude)
    arcseconds = math.pi / (180 * 3600)
    tx, ty, tz = 446.448, -125.157, 542.06
    rx, ry, rz = 0.1502 * arcseconds, 0.247 * arcseconds, 0.8421 * arcseconds
    scale = 1 - 20.4894e-6
    wgs_x = tx + cartesian_x * scale - cartesian_y * rz + cartesian_z * ry
    wgs_y = ty + cartesian_x * rz + cartesian_y * scale - cartesian_z * rx
    wgs_z = tz - cartesian_x * ry + cartesian_y * rx + cartesian_z * scale
    wgs_latitude, wgs_longitude = _cartesian_to_geodetic(wgs_x, wgs_y, wgs_z, 6378137, 6356752.314245)
    return math.degrees(wgs_latitude), math.degrees(wgs_longitude)


def representative_dates(snapshot: date) -> dict[str, date]:
    days_until_monday = (7 - snapshot.weekday()) % 7
    monday = snapshot + timedelta(days=days_until_monday)
    return {day: monday + timedelta(days=index) for index, day in enumerate(DAYS)}


def load_naptan(path: Path) -> tuple[dict[str, dict], dict[str, str], int]:
    stops: dict[str, dict] = {}
    aliases: dict[str, str] = {}
    excluded = 0
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            stop_id = clean(row.get("ATCOCode"))
            name = clean(row.get("CommonName"))
            stop_type = clean(row.get("StopType"))
            if clean(row.get("Status")).lower() not in ("", "active") or not stop_type.startswith("B") or not stop_id or not name:
                excluded += 1
                continue
            coordinate_method = "NaPTAN WGS84"
            try:
                latitude = float(row.get("Latitude", ""))
                longitude = float(row.get("Longitude", ""))
            except ValueError:
                try:
                    latitude, longitude = british_national_grid_to_wgs84(float(row.get("Easting", "")), float(row.get("Northing", "")))
                    coordinate_method = "NaPTAN British National Grid converted to WGS84"
                except ValueError:
                    excluded += 1
                    continue
            naptan_code = clean(row.get("NaptanCode"))
            stop = {
                "id": stop_id,
                "naptanCode": naptan_code or None,
                "name": name,
                "indicator": clean(row.get("Indicator")) or None,
                "direction": clean(row.get("Bearing")) or None,
                "latitude": round(latitude, 7),
                "longitude": round(longitude, 7),
                "stopType": stop_type,
                "busStopType": clean(row.get("BusStopType")) or None,
                "locality": clean(row.get("LocalityName")) or None,
                "parentLocality": clean(row.get("ParentLocalityName")) or None,
                "areaCode": stop_id[:3] if stop_id[:3].isdigit() else None,
                "modifiedAt": clean(row.get("ModificationDateTime")) or None,
                "coordinateMethod": coordinate_method,
                "routes": set(),
            }
            stops[stop_id] = stop
            aliases[stop_id] = stop_id
            if naptan_code:
                aliases[naptan_code.lower()] = stop_id
    return stops, aliases, excluded


def active_days(calendar: dict, exceptions: dict[str, dict[date, int]], dates: dict[str, date]) -> list[str]:
    result = []
    start = parse_date(calendar.get("start_date", "")) if calendar else None
    end = parse_date(calendar.get("end_date", "")) if calendar else None
    changes = exceptions or {}
    for day, current in dates.items():
        active = bool(calendar and calendar.get(day) == "1" and (not start or current >= start) and (not end or current <= end))
        if changes.get(current) == 1:
            active = True
        elif changes.get(current) == 2:
            active = False
        if active:
            result.append(day)
    return result


def principal_locations(calls: list[dict], maximum: int = 7) -> list[str]:
    if len(calls) <= 2:
        return []
    endpoints = {clean(calls[0].get("name")).lower(), clean(calls[-1].get("name")).lower()}
    selected: list[str] = []

    def add(value: str) -> None:
        value = clean(value)
        if value and value.lower() not in endpoints and value.lower() not in {item.lower() for item in selected}:
            selected.append(value)

    for call in calls[1:-1]:
        if any(term in clean(call.get("name")).lower() for term in MAJOR_NAME):
            add(call.get("name", ""))
    previous = clean(calls[0].get("locality")).lower()
    for call in calls[1:-1]:
        locality = clean(call.get("locality"))
        if locality and locality.lower() != previous:
            add(locality)
        if locality:
            previous = locality.lower()
    if len(selected) < 2:
        for proportion in (0.25, 0.5, 0.75):
            add(calls[round((len(calls) - 1) * proportion)].get("name", ""))
    return selected[:maximum]


def load_gtfs_metadata(archive: zipfile.ZipFile, dates: dict[str, date]):
    agencies = {clean(row.get("agency_id")): clean(row.get("agency_name")) for row in gtfs_rows(archive, "agency.txt")}
    routes = {clean(row.get("route_id")): row for row in gtfs_rows(archive, "routes.txt")}
    gtfs_stops = {clean(row.get("stop_id")): row for row in gtfs_rows(archive, "stops.txt")}
    calendars = {clean(row.get("service_id")): row for row in gtfs_rows(archive, "calendar.txt")}
    exceptions: dict[str, dict[date, int]] = defaultdict(dict)
    if "calendar_dates.txt" in archive.namelist():
        for row in gtfs_rows(archive, "calendar_dates.txt"):
            when = parse_date(row.get("date", ""))
            if when:
                exceptions[clean(row.get("service_id"))][when] = int(row.get("exception_type", 0) or 0)
    service_days = {service_id: active_days(calendar, exceptions.get(service_id, {}), dates) for service_id, calendar in calendars.items()}
    for service_id in exceptions:
        if service_id not in service_days:
            service_days[service_id] = active_days({}, exceptions[service_id], dates)
    trips = {}
    for row in gtfs_rows(archive, "trips.txt"):
        service_id = clean(row.get("service_id"))
        days = service_days.get(service_id, [])
        if days:
            trips[clean(row.get("trip_id"))] = {**row, "active_days": days}
    return agencies, routes, gtfs_stops, calendars, exceptions, trips


def process_trip(region: str, rows: list[dict], trip: dict, agencies: dict, routes: dict, gtfs_stops: dict, calendars: dict, exceptions: dict, naptan_stops: dict, aliases: dict, services: dict) -> None:
    route = routes.get(clean(trip.get("route_id")), {})
    route_number = clean(route.get("route_short_name")) or clean(route.get("route_long_name"))
    if clean(route.get("route_type")) not in ("3", "700", "") or not route_number:
        return
    calls = []
    matched = []
    for row in sorted(rows, key=lambda value: int(value.get("stop_sequence", 0) or 0)):
        gtfs_id = clean(row.get("stop_id"))
        details = gtfs_stops.get(gtfs_id, {})
        alias = aliases.get(gtfs_id) or aliases.get(clean(details.get("stop_code")).lower())
        stop = naptan_stops.get(alias) if alias else None
        departure = parse_minutes(clean(row.get("departure_time")) or clean(row.get("arrival_time")))
        calls.append({
            "name": clean(details.get("stop_name")) or (stop or {}).get("name") or gtfs_id,
            "locality": (stop or {}).get("locality") or (stop or {}).get("parentLocality") or "",
            "stop_id": alias,
            "departure": departure,
        })
        if stop and departure is not None:
            matched.append((stop, departure))
    if not matched or len(calls) < 2:
        return
    sequence = ">".join(clean(row.get("stop_id")) for row in sorted(rows, key=lambda value: int(value.get("stop_sequence", 0) or 0)))
    signature = hashlib.sha1(f"{trip.get('route_id')}|{trip.get('direction_id')}|{sequence}".encode("utf-8")).hexdigest()[:12]
    service_id = f"{region}:{clean(trip.get('route_id'))}:{clean(trip.get('direction_id')) or 'x'}:{signature}"
    agency = clean(agencies.get(clean(route.get("agency_id")))) or "Operator not supplied in the timetable"
    first_name = clean(calls[0].get("name"))
    last_name = clean(calls[-1].get("name"))
    circular = clean(calls[0].get("stop_id")) == clean(calls[-1].get("stop_id")) or first_name.lower() == last_name.lower()
    record = services.get(service_id)
    if not record:
        record = {
            "id": service_id,
            "routeNumber": route_number,
            "operator": agency,
            "origin": first_name,
            "destination": last_name,
            "direction": clean(trip.get("trip_headsign")) or (f"towards {last_name}" if last_name else ""),
            "circular": circular,
            "principalLocations": principal_locations(calls),
            "validFrom": None,
            "validTo": None,
            "qualifications": set(),
            "stopSchedules": {},
            "source": {"region": region, "routeId": clean(trip.get("route_id"))},
        }
        services[service_id] = record
    calendar = calendars.get(clean(trip.get("service_id")), {})
    start = parse_date(calendar.get("start_date", ""))
    end = parse_date(calendar.get("end_date", ""))
    if start and (not record["validFrom"] or start.isoformat() < record["validFrom"]):
        record["validFrom"] = start.isoformat()
    if end and (not record["validTo"] or end.isoformat() > record["validTo"]):
        record["validTo"] = end.isoformat()
    exception_count = len(exceptions.get(clean(trip.get("service_id")), {}))
    if exception_count:
        record["qualifications"].add("The source calendar includes date-specific exceptions; check the assessment date before formal use.")
    service_description = " ".join(clean(value) for value in (
        trip.get("service_id"), trip.get("trip_headsign"), trip.get("trip_short_name"),
        route.get("route_long_name"), route.get("route_desc")
    )).lower()
    if re.search(r"\b(?:school|schools|schoolday|school day|college day|term time|pupil)\b", service_description):
        record["qualifications"].add("School-day or term-time service identified in the source timetable; check the assessment date before formal use.")
    for stop, departure in matched:
        stop["routes"].add(route_number)
        schedule = record["stopSchedules"].setdefault(stop["id"], {day: [] for day in DAYS})
        for day in trip["active_days"]:
            schedule[day].append(departure)


def process_region(path: Path, dates: dict[str, date], naptan_stops: dict, aliases: dict, shard_key_length: int) -> tuple[str, dict[str, list[dict]], dict]:
    region = path.stem.replace("-", "_")
    services: dict[str, dict] = {}
    with zipfile.ZipFile(path) as archive:
        required = {"agency.txt", "stops.txt", "routes.txt", "calendar.txt", "trips.txt", "stop_times.txt"}
        missing = sorted(required - set(archive.namelist()))
        if missing:
            raise ValueError(f"{path.name} is missing required GTFS files: {', '.join(missing)}")
        agencies, routes, gtfs_stops, calendars, exceptions, trips = load_gtfs_metadata(archive, dates)
        current_id = None
        current_rows: list[dict] = []
        completed = set()
        for row in gtfs_rows(archive, "stop_times.txt"):
            trip_id = clean(row.get("trip_id"))
            if current_id is None:
                current_id = trip_id
            if trip_id != current_id:
                if current_id in completed:
                    raise ValueError(f"{path.name} stop_times.txt is not grouped by trip_id")
                completed.add(current_id)
                trip = trips.get(current_id)
                if trip:
                    process_trip(region, current_rows, trip, agencies, routes, gtfs_stops, calendars, exceptions, naptan_stops, aliases, services)
                current_id, current_rows = trip_id, []
            current_rows.append(row)
        if current_id:
            trip = trips.get(current_id)
            if trip:
                process_trip(region, current_rows, trip, agencies, routes, gtfs_stops, calendars, exceptions, naptan_stops, aliases, services)
        feed_info = next(gtfs_rows(archive, "feed_info.txt"), {}) if "feed_info.txt" in archive.namelist() else {}

    route_groups: dict[tuple, list[dict]] = defaultdict(list)
    for record in services.values():
        route_groups[(record["routeNumber"], record["operator"], record["origin"], record["destination"], record["direction"])].append(record)
    for records in route_groups.values():
        if len(records) > 1:
            for record in records:
                record["qualifications"].add(f"{len(records)} scheduled variants are retained for this direction.")
    by_area: dict[str, list[dict]] = defaultdict(list)
    for record in services.values():
        for schedule in record["stopSchedules"].values():
            for day in DAYS:
                schedule[day] = sorted(set(schedule[day]))
        active_days_set = {day for schedule in record["stopSchedules"].values() for day in DAYS if schedule[day]}
        if active_days_set and not active_days_set.intersection({"saturday", "sunday"}):
            record["qualifications"].add("Weekday-only service in the prepared representative week.")
        maximum_departures = max((len(values) for schedule in record["stopSchedules"].values() for values in schedule.values()), default=0)
        if maximum_departures and maximum_departures <= 3:
            record["qualifications"].add("Limited service: no more than three scheduled journeys on any represented day.")
        record["qualifications"] = sorted(record["qualifications"])
        shard_keys = {stop_id[:shard_key_length] for stop_id in record["stopSchedules"] if len(stop_id) >= shard_key_length}
        for shard_key in shard_keys:
            clone = {**record, "stopSchedules": {stop_id: schedule for stop_id, schedule in record["stopSchedules"].items() if stop_id.startswith(shard_key)}}
            by_area[shard_key].append(clone)
    metadata = {
        "archive": path.name,
        "sha256": sha256(path),
        "feedPublisher": clean(feed_info.get("feed_publisher_name")) or None,
        "feedStartDate": clean(feed_info.get("feed_start_date")) or None,
        "feedEndDate": clean(feed_info.get("feed_end_date")) or None,
        "serviceCount": len(services),
    }
    return region, by_area, metadata


def build(args: argparse.Namespace) -> dict:
    naptan_path = Path(args.naptan).resolve()
    gtfs_dir = Path(args.gtfs_dir).resolve()
    output = Path(args.output).resolve()
    snapshot = date.fromisoformat(args.snapshot_date)
    dates = representative_dates(snapshot)
    gtfs_paths = sorted(path for path in gtfs_dir.glob("*.zip") if path.is_file())
    if not gtfs_paths:
        raise ValueError("No GTFS zip files were found.")
    clear_output(output)
    output.mkdir(parents=True, exist_ok=True)
    stops, aliases, excluded = load_naptan(naptan_path)
    service_shards: dict[str, list[str]] = defaultdict(list)
    region_metadata = []
    for gtfs_path in gtfs_paths:
        region, by_area, metadata = process_region(gtfs_path, dates, stops, aliases, args.service_shard_key_length)
        region_metadata.append({"region": region, **metadata})
        for area, records in sorted(by_area.items()):
            relative = f"services/{area}-{region}.json.gz"
            compact_json(output / relative, {"schema": SCHEMA, "region": region, "stopPrefix": area, "services": sorted(records, key=lambda record: record["id"])})
            service_shards[area].append(relative)

    stop_groups: dict[str, list[dict]] = defaultdict(list)
    stop_fields = ["id", "naptanCode", "name", "indicator", "direction", "latitude", "longitude", "stopType", "busStopType", "locality", "parentLocality", "areaCode", "modifiedAt", "coordinateMethod", "routes"]
    for stop in stops.values():
        key = cell_key(stop["latitude"], stop["longitude"], args.grid_size)
        normalised = {**stop, "routes": sorted(stop["routes"], key=lambda value: (len(value), value))}
        stop_groups[key].append([normalised.get(field) for field in stop_fields])
    stop_shards = {}
    for key, records in sorted(stop_groups.items()):
        relative = f"stops/{key}.json.gz"
        compact_json(output / relative, {"schema": SCHEMA, "cell": key, "stops": sorted(records, key=lambda stop: stop[0])})
        stop_shards[key] = relative

    combined_bods_hash = hashlib.sha256("".join(item["sha256"] for item in region_metadata).encode("ascii")).hexdigest()
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    manifest = {
        "schema": SCHEMA,
        "version": "1.0.0",
        "generatedAt": generated_at,
        "snapshotDate": snapshot.isoformat(),
        "refreshAfterDays": 8,
        "gridSize": args.grid_size,
        "stopFields": stop_fields,
        "serviceShardKeyLength": args.service_shard_key_length,
        "representativeDates": {day: value.isoformat() for day, value in dates.items()},
        "sources": {
            "naptan": {"url": NAPTAN_URL, "downloadedAt": generated_at, "sha256": sha256(naptan_path), "stopCount": len(stops), "excludedRecordCount": excluded},
            "bods": {"url": BODS_URL, "downloadedAt": generated_at, "sha256": combined_bods_hash, "regions": region_metadata},
        },
        "stopShards": stop_shards,
        "serviceShards": dict(sorted(service_shards.items())),
    }
    compact_json(output / "manifest.json", manifest)
    return {"output": str(output), "stops": len(stops), "stopShards": len(stop_shards), "serviceAreas": len(service_shards), "regions": region_metadata}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--naptan", required=True)
    parser.add_argument("--gtfs-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--snapshot-date", required=True)
    parser.add_argument("--grid-size", type=float, default=0.25)
    parser.add_argument("--service-shard-key-length", type=int, default=5)
    args = parser.parse_args()
    print(json.dumps(build(args), indent=2))


if __name__ == "__main__":
    main()
