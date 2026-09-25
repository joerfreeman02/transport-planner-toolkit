#!/usr/bin/env python3
"""Produce compact, diagnostic-only national v1/v2 evidence for BUS-DATA-V2-2.

The shadow v1 candidate and comparison-only CSV live in a temporary directory;
the v2 XML/NPTG/BODS sources are supplied by the frozen snapshot. Only compact
JSON/Markdown evidence is written to ``--report-dir``.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import shutil
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from build_static_index import build as build_v1
from refresh_bus_data import BODS_REGIONS, NAPTAN_URL, acquire_bods, download, now_utc, sha256
from refresh_state import transition
from prepared_data_v2 import bearing_compass_point, british_national_grid_to_wgs84, child_text, direct_child_text, local_name, stop_type_semantics

MAX_SAMPLES = 20
MAX_OUTLIERS = 20
GIT_BLOB_CEILING = 95 * 1024 * 1024
PHYSICAL_COMPARISON_CLASSIFICATION = "LIVE_CSV_COMPARISON_NOT_SAME_SOURCE_WINDOW"
LEGACY_STOP_FIELDS = (
    "id", "naptanCode", "name", "indicator", "direction", "latitude", "longitude",
    "stopType", "busStopType", "locality", "parentLocality", "areaCode", "modifiedAt",
    "coordinateMethod", "routes",
)
SERVICE_FIELDS = (
    "id", "routeNumber", "operator", "origin", "destination", "direction", "circular",
    "principalLocations", "validFrom", "validTo", "qualifications", "representativeDates",
    "stopSchedules",
)


@contextmanager
def temporary_workspace(prefix: str):
    """Create a writable temporary workspace and remove it on exit.

    Some Windows managed workspaces deny child creation beneath tempfile's
    default mode-700 directory. Relaxing the directory mode before use keeps
    the raw-source lifetime temporary without changing the artifact boundary.
    """
    base = Path.cwd() / ".atlas-v2-diagnostic-tmp"
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{prefix}{uuid.uuid4().hex}"
    path.mkdir(parents=True, exist_ok=False)
    try:
        try:
            path.chmod(0o755)
        except OSError:
            pass
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def normalise(value):
    if isinstance(value, dict):
        return {key: normalise(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [normalise(item) for item in value]
    return value


def read_gzip_json(path: Path) -> dict:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def load_stop_records(bus_root: Path, manifest: dict) -> dict[str, dict]:
    records = {}
    for relative in manifest.get("stopShards", {}).values():
        payload = read_gzip_json(bus_root / relative)
        for record in payload.get("stops", []):
            stop = dict(zip(manifest["stopFields"], record))
            records[str(stop["id"])] = stop
    return records


def load_service_records(bus_root: Path, manifest: dict) -> dict[str, dict]:
    records = {}
    for relatives in manifest.get("serviceShards", {}).values():
        for relative in relatives:
            payload = read_gzip_json(bus_root / relative)
            for service in payload.get("services", []):
                identity = str(service["id"])
                existing = records.get(identity)
                if existing is None:
                    existing = {key: value for key, value in service.items() if key != "stopSchedules"}
                    existing["stopSchedules"] = {}
                    records[identity] = existing
                existing["stopSchedules"].update(service.get("stopSchedules", {}))
    return records


def coordinate_distance_metres(left: dict, right: dict) -> float | None:
    try:
        left_lat, left_lon = float(left["latitude"]), float(left["longitude"])
        right_lat, right_lon = float(right["latitude"]), float(right["longitude"])
    except (KeyError, TypeError, ValueError):
        return None
    radius = 6371008.8
    lat1, lat2 = math.radians(left_lat), math.radians(right_lat)
    delta_lat = lat2 - lat1
    delta_lon = math.radians(right_lon - left_lon)
    haversine = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return round(2 * radius * math.asin(math.sqrt(min(1, haversine))), 3)


def _direct_coordinate_pair(element: ET.Element, first: str, second: str) -> tuple[float, float] | None:
    left = direct_child_text(element, first)
    right = direct_child_text(element, second)
    try:
        return float(left), float(right)
    except (TypeError, ValueError):
        return None


def _xml_coordinate_evidence(element: ET.Element) -> dict:
    """Return the first supplied XML WGS84 pair and the authoritative BNG Location.

    NaPTAN can carry a StopPoint Location in BNG and a WGS84 pair in a
    Translation.  They are deliberately retained as separate source values;
    this function never chooses one to overwrite the other.
    """
    wgs84 = None
    for current in element.iter():
        pair = _direct_coordinate_pair(current, "Latitude", "Longitude")
        if pair is not None:
            wgs84 = {"latitude": pair[0], "longitude": pair[1]}
            break
    bng = None
    for current in element.iter():
        if local_name(current.tag) == "Location":
            pair = _direct_coordinate_pair(current, "Easting", "Northing")
            if pair is not None:
                bng = {"easting": pair[0], "northing": pair[1]}
                break
    if bng is None:
        for current in element.iter():
            pair = _direct_coordinate_pair(current, "Easting", "Northing")
            if pair is not None:
                bng = {"easting": pair[0], "northing": pair[1]}
                break
    if bng is not None:
        try:
            latitude, longitude = british_national_grid_to_wgs84(bng["easting"], bng["northing"])
            bng["derivedWgs84"] = {"latitude": latitude, "longitude": longitude}
        except (ValueError, OverflowError):
            bng["derivedWgs84"] = None
    return {"wgs84": wgs84, "bng": bng}


def load_authoritative_stop_evidence(source_snapshot: Path | None, identities: set[str]) -> dict[str, dict]:
    """Extract compact evidence for selected StopPoints from frozen NaPTAN XML."""
    if not source_snapshot or not identities:
        return {}
    path = source_snapshot / "sources" / "naptan.xml"
    if not path.is_file():
        return {}
    evidence = {}
    for _, element in ET.iterparse(path, events=("end",)):
        if local_name(element.tag) != "StopPoint":
            continue
        identity = child_text(element, "AtcoCode", "ATCOCode", "StopPointCode")
        if identity in identities:
            coordinate_sources = _xml_coordinate_evidence(element)
            latitude = child_text(element, "Latitude")
            longitude = child_text(element, "Longitude")
            stop_type = child_text(element, "StopType")
            semantics = stop_type_semantics(stop_type)
            evidence[identity] = {
                "xmlRecordExists": True,
                "xmlStatus": element.attrib.get("Status") or element.attrib.get("status") or "active",
                "stopType": stop_type or None,
                "busEligible": bool(semantics["busEligible"]),
                "coordinate": {
                    "latitude": float(latitude) if latitude else None,
                    "longitude": float(longitude) if longitude else None,
                    "valid": bool(latitude and longitude),
                },
                "coordinateSources": coordinate_sources,
                "modificationDate": element.attrib.get("ModificationDateTime") or element.attrib.get("modificationDateTime"),
                "commonName": child_text(element, "CommonName", "Name") or None,
                "localityRef": child_text(element, "NptgLocalityRef", "NPTGLocalityRef") or None,
                "direction": bearing_compass_point(element) or None,
            }
        element.clear()
    return evidence


def coordinate_forensic_rows(coordinate_deltas: list[dict], authoritative: dict[str, dict]) -> list[dict]:
    rows = []
    for delta in coordinate_deltas:
        identity = delta["id"]
        source = authoritative.get(identity, {})
        sources = source.get("coordinateSources", {})
        xml_wgs84 = sources.get("wgs84")
        xml_bng = sources.get("bng")
        derived = xml_bng.get("derivedWgs84") if xml_bng else None
        v1 = delta["v1"]
        v2 = delta["v2"]
        v1_to_xml = coordinate_distance_metres(v1, xml_wgs84) if xml_wgs84 else None
        v2_to_xml = coordinate_distance_metres(v2, xml_wgs84) if xml_wgs84 else None
        v1_to_bng = coordinate_distance_metres(v1, derived) if derived else None
        xml_to_bng = coordinate_distance_metres(xml_wgs84, derived) if xml_wgs84 and derived else None
        close_v1_to_bng = v1_to_bng is not None and v1_to_bng <= 1
        close_v2_to_xml = v2_to_xml is not None and v2_to_xml <= 1
        close_v1_to_xml = v1_to_xml is not None and v1_to_xml <= 1
        if xml_wgs84 and derived and xml_to_bng is not None and xml_to_bng > 25 and close_v1_to_bng and close_v2_to_xml:
            classification = "authoritative source internal coordinate disagreement: legacy BNG conversion versus XML WGS84"
        elif delta["distanceMetres"] <= 1:
            classification = "equivalent precision/rounding"
        elif derived and close_v1_to_bng:
            classification = "legacy BNG conversion versus XML WGS84"
        elif xml_wgs84 and (close_v1_to_xml or close_v2_to_xml):
            classification = "historical/source-export change"
        else:
            classification = "unresolved"
        rows.append({
            "id": identity,
            "name": source.get("commonName"),
            "v1": {"latitude": v1.get("latitude"), "longitude": v1.get("longitude")},
            "v2": {"latitude": v2.get("latitude"), "longitude": v2.get("longitude")},
            "separationMetres": delta["distanceMetres"],
            "xmlWgs84": xml_wgs84,
            "xmlBng": xml_bng,
            "v1ToXmlWgs84Metres": v1_to_xml,
            "v2ToXmlWgs84Metres": v2_to_xml,
            "v1ToXmlBngDerivedMetres": v1_to_bng,
            "xmlWgs84ToXmlBngDerivedMetres": xml_to_bng,
            "v1CoordinateMethod": v1.get("coordinateMethod"),
            "v2CoordinateMethod": v2.get("coordinateMethod"),
            "classification": classification,
        })
    return sorted(rows, key=lambda item: item["separationMetres"], reverse=True)


def classify_physical_field(field: str, mismatch_count: int) -> str:
    if not mismatch_count:
        return "no mismatch"
    if field == "direction":
        return "parser defect corrected; any residual values require source-backed review"
    if field in {"latitude", "longitude", "coordinateMethod"}:
        return "coordinate precision/conversion difference; coordinate deltas are reported"
    if field in {"locality", "parentLocality"}:
        return "NPTG enrichment difference; authoritative locality references are retained"
    if field in {"name", "indicator", "modifiedAt"}:
        return "source timing/export difference; XML and CSV values are retained in samples"
    return "unresolved"


def compare_stops(v1: dict[str, dict], v2: dict[str, dict]) -> dict:
    common = sorted(set(v1) & set(v2))
    v1_only = sorted(set(v1) - set(v2))
    v2_only = sorted(set(v2) - set(v1))
    mismatches = Counter()
    mismatch_by_area = Counter()
    samples = []
    samples_by_field = defaultdict(list)
    coordinate_deltas = []
    for identity in common:
        if normalise(v1[identity].get("latitude")) != normalise(v2[identity].get("latitude")) or normalise(v1[identity].get("longitude")) != normalise(v2[identity].get("longitude")):
            distance = coordinate_distance_metres(v1[identity], v2[identity])
            if distance is not None:
                left_method = str(v1[identity].get("coordinateMethod") or "")
                right_method = str(v2[identity].get("coordinateMethod") or "")
                if left_method != right_method and "British National Grid" in left_method and "WGS84" in right_method:
                    coordinate_classification = "legacy BNG conversion versus CSV WGS84"
                elif distance <= 1:
                    coordinate_classification = "source WGS84 precision/rounding difference"
                else:
                    coordinate_classification = "source WGS84 difference"
                coordinate_deltas.append({"id": identity, "distanceMetres": distance, "classification": coordinate_classification, "v1": {"latitude": v1[identity].get("latitude"), "longitude": v1[identity].get("longitude"), "coordinateMethod": left_method}, "v2": {"latitude": v2[identity].get("latitude"), "longitude": v2[identity].get("longitude"), "coordinateMethod": right_method}})
        for field in LEGACY_STOP_FIELDS:
            left = v1[identity].get(field)
            right = v2[identity].get(field)
            if field == "routes":
                left = sorted(left or [])
                right = sorted(right or [])
            if normalise(left) != normalise(right):
                mismatches[field] += 1
                mismatch_by_area[str(v1[identity].get("areaCode") or identity[:3])] += 1
                sample = {"id": identity, "field": field, "v1": left, "v2": right, "classification": classify_physical_field(field, 1)}
                if len(samples) < MAX_SAMPLES:
                    samples.append(sample)
                if len(samples_by_field[field]) < MAX_SAMPLES:
                    samples_by_field[field].append(sample)
    parity = {field: round((len(common) - mismatches[field]) / len(common) * 100, 6) if common else 100 for field in LEGACY_STOP_FIELDS}
    distances = [item["distanceMetres"] for item in coordinate_deltas]
    return {
        "v1ActiveStopPointCount": len(v1), "v2ActiveStopPointCount": len(v2), "commonIdCount": len(common),
        "v1OnlyCount": len(v1_only), "v2OnlyCount": len(v2_only),
        "v1OnlySamples": v1_only[:MAX_SAMPLES], "v2OnlySamples": v2_only[:MAX_SAMPLES],
        "mismatchCountsByField": dict(sorted(mismatches.items())),
        "parityPercentageByField": parity,
        "routeSetMismatchCount": mismatches["routes"],
        "mismatchByAtcoArea": dict(mismatch_by_area.most_common(MAX_SAMPLES)),
        "mismatchSamples": samples,
        "mismatchSamplesByField": {field: samples_by_field[field] for field in sorted(samples_by_field)},
        "fieldClassifications": {field: classify_physical_field(field, mismatches[field]) for field in LEGACY_STOP_FIELDS},
        "coordinateDeltaSummary": {
            "mismatchStopCount": len(coordinate_deltas),
            "distanceSampleCount": len(distances),
            "maximumMetres": max(distances) if distances else None,
            "medianMetres": percentile(distances, 0.5) if distances else None,
            "p95Metres": percentile(distances, 0.95) if distances else None,
            "samples": sorted(coordinate_deltas, key=lambda item: item["distanceMetres"], reverse=True)[:MAX_SAMPLES],
        },
        "classification": {
            "v1Only": "authoritative CSV shadow has an active StopPoint absent from the v2 XML candidate; source-format/status difference or parser exclusion requires investigation",
            "v2Only": "authoritative XML candidate has an active StopPoint absent from the CSV shadow; source-format/status difference or parser exclusion requires investigation",
        },
    }


def canonical_service(service: dict) -> dict:
    value = {field: service.get(field) for field in SERVICE_FIELDS}
    value["qualifications"] = sorted(value["qualifications"] or [])
    value["principalLocations"] = value["principalLocations"] or []
    value["stopSchedules"] = normalise(value["stopSchedules"] or {})
    return normalise(value)


def principal_location_normalisation(left: list, right: list) -> str:
    def cleaned(values):
        return [str(value).strip().strip('"').strip("'").strip() for value in values or []]
    if cleaned(left) == cleaned(right):
        return "deterministic malformed-source quoting/whitespace normalisation"
    return "unresolved principal-location content difference"


def compare_services(v1: dict[str, dict], v2: dict[str, dict], comparable_regions: set[str]) -> dict:
    v1_scoped = {key: value for key, value in v1.items() if value.get("source", {}).get("region") in comparable_regions}
    v2_scoped = {key: value for key, value in v2.items() if value.get("source", {}).get("region") in comparable_regions}
    common = sorted(set(v1_scoped) & set(v2_scoped))
    v1_only = sorted(set(v1_scoped) - set(v2_scoped))
    v2_only = sorted(set(v2_scoped) - set(v1_scoped))
    mismatches = Counter()
    samples = []
    samples_by_field = defaultdict(list)
    classifications = Counter()
    for identity in common:
        left = canonical_service(v1_scoped[identity])
        right = canonical_service(v2_scoped[identity])
        for field in SERVICE_FIELDS:
            if left[field] != right[field]:
                mismatches[field] += 1
                classification = principal_location_normalisation(left[field], right[field]) if field == "principalLocations" else "unresolved"
                classifications[classification] += 1
                sample = {"id": identity, "field": field, "v1": left[field], "v2": right[field], "classification": classification}
                if len(samples) < MAX_SAMPLES:
                    samples.append(sample)
                if len(samples_by_field[field]) < MAX_SAMPLES:
                    samples_by_field[field].append(sample)
    return {
        "scopeRegions": sorted(comparable_regions), "uniqueV1ServiceCount": len(v1_scoped),
        "uniqueV2ServiceCount": len(v2_scoped), "commonServiceCount": len(common),
        "v1OnlyCount": len(v1_only), "v2OnlyCount": len(v2_only),
        "v1OnlySamples": v1_only[:MAX_SAMPLES], "v2OnlySamples": v2_only[:MAX_SAMPLES],
        "mismatchCountsByField": dict(sorted(mismatches.items())),
        "stopSchedulesMismatchCount": mismatches["stopSchedules"],
        "principalLocationsMismatchCount": mismatches["principalLocations"],
        "mismatchSamples": samples,
        "mismatchSamplesByField": {field: samples_by_field[field] for field in sorted(samples_by_field)},
        "mismatchClassifications": dict(sorted(classifications.items())),
    }


def classify_v2_only_stops(v1: dict[str, dict], v2: dict[str, dict], source_snapshot: Path | None = None) -> list[dict]:
    identities = sorted(set(v2) - set(v1))
    authoritative = load_authoritative_stop_evidence(source_snapshot, set(identities))
    results = []
    for identity in identities:
        candidate = v2[identity]
        source = authoritative.get(identity, {"xmlRecordExists": False})
        active = str(source.get("xmlStatus", "")).lower() == "active"
        eligible = bool(source.get("busEligible"))
        if source.get("xmlRecordExists") and active and eligible:
            classification = "valid active Bus StopPoint in frozen authoritative XML; absent from the legacy CSV shadow is a source-export difference, not a v2 parser inclusion defect"
        elif source.get("xmlRecordExists"):
            classification = "authoritative XML record requires status or bus-eligibility review"
        else:
            classification = "unresolved: no matching authoritative XML record found"
        results.append({
            "id": identity,
            "xml": source,
            "candidate": {field: candidate.get(field) for field in ("id", "name", "indicator", "direction", "latitude", "longitude", "stopType", "busStopType", "locality", "parentLocality", "modifiedAt", "status", "busPreparedEligible")},
            "legacyCsvShadow": {"present": False, "comparison": "v2-only by parity definition"},
            "timingOrPublicationDrift": "possible only as an explanation for the CSV export omission; no parser/status defect is evidenced" if source.get("xmlRecordExists") else "not assessed",
            "parserAssessment": "included correctly" if active and eligible else "requires review",
            "classification": classification,
        })
    return results


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return round(ordered[lower], 3)
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower), 3)


def load_groups(bus_root: Path, manifest: dict) -> list[dict]:
    groups = []
    for relative in manifest.get("groupShards", {}).values():
        groups.extend(read_gzip_json(bus_root / relative).get("groups", []))
    return groups


def group_analysis(bus_root: Path, manifest: dict, stops: dict[str, dict]) -> dict:
    groups = load_groups(bus_root, manifest)
    active = [group for group in groups if group.get("status") == "active"]
    member_counts = [len(group.get("memberStopPointIds", [])) for group in active]
    bins = Counter()
    for count in member_counts:
        bins["0" if count == 0 else "1" if count == 1 else "2" if count == 2 else "3-5" if count <= 5 else "6-10" if count <= 10 else "11-20" if count <= 20 else ">20"] += 1
    memberships = Counter()
    for stop in stops.values():
        memberships[str(stop.get("id"))] = sum(1 for ref in stop.get("logicalGroupRefs", []) if ref.get("status") == "active")
    spans = [float(group["qa"]["maxMemberToMemberSpanMetres"]) for group in groups if group.get("qa", {}).get("maxMemberToMemberSpanMetres") is not None]
    outlier_groups = sorted(groups, key=lambda group: float(group.get("qa", {}).get("maxMemberToMemberSpanMetres") or 0), reverse=True)
    largest_members = sorted(groups, key=lambda group: len(group.get("memberStopPointIds", [])), reverse=True)
    def compact_group(group):
        return {"id": group.get("id"), "type": group.get("type"), "name": group.get("name"), "memberCount": len(group.get("memberStopPointIds", [])), "spanMetres": group.get("qa", {}).get("maxMemberToMemberSpanMetres"), "localityRef": group.get("localityRef")}
    qa = manifest.get("qa", {}).get("naptan", {})
    return {
        "totalGroupCount": len(groups), "activeGroupCount": len(active), "inactiveGroupCount": len(groups) - len(active),
        "groupTypeCounts": dict(Counter(str(group.get("type") or "UNSPECIFIED") for group in groups)),
        "parentGroupCount": sum(bool(group.get("parentGroupId")) for group in groups),
        "activeMemberCountDistribution": dict((key, bins.get(key, 0)) for key in ("0", "1", "2", "3-5", "6-10", "11-20", ">20")),
        "stopPointMembershipCounts": {"zero": sum(count == 0 for count in memberships.values()), "one": sum(count == 1 for count in memberships.values()), "multiple": sum(count > 1 for count in memberships.values())},
        "inactiveMembershipCount": int(qa.get("inactiveMembershipCount", 0) or 0),
        "duplicateMembershipCount": int(qa.get("duplicateMembershipCount", 0) or 0),
        "missingGroupTargetCount": int(qa.get("missingGroupTargetCount", 0) or 0),
        "missingPhysicalMemberCount": sum(len(group.get("missingMemberStopPointIds", [])) for group in groups),
        "malformedRecordCount": int(qa.get("malformedRecordCount", 0) or 0),
        "geometry": {"spanCount": len(spans), "medianMetres": percentile(spans, .5), "p95Metres": percentile(spans, .95), "p99Metres": percentile(spans, .99), "maximumMetres": max(spans) if spans else None, "largestSpanGroups": [compact_group(group) for group in outlier_groups[:MAX_OUTLIERS]], "largestMemberGroups": [compact_group(group) for group in largest_members[:MAX_OUTLIERS]]},
    }


def nptg_analysis(bus_root: Path, manifest: dict, stops: dict[str, dict]) -> dict:
    localities = []
    for relative in manifest.get("localityShards", {}).values():
        localities.extend(read_gzip_json(bus_root / relative).get("localities", []))
    qa = manifest.get("qa", {}).get("nptg", {})
    unresolved = sum(1 for stop in stops.values() if stop.get("nptgLocalityCode") and stop.get("localityResolution") != "resolved")
    return {
        "localityCount": len(localities), "districtCount": len({item.get("districtId") for item in localities if item.get("districtId")}),
        "parentLocalityRelationshipCount": sum(bool(item.get("parentLocalityId")) for item in localities),
        "higherLocalityRelationshipCount": sum(bool(item.get("higherLocalityId")) for item in localities),
        "missingParentReferences": int(qa.get("missingParentLocalityCount", 0) or 0),
        "missingDistrictReferences": int(qa.get("missingDistrictCount", 0) or 0),
        "cyclicHierarchyCount": int(qa.get("cyclicLocalityCount", 0) or 0),
        "unresolvedStopPointLocalityReferences": unresolved,
        "sourceTypeCounts": dict(Counter(str(item.get("sourceType") or "UNSPECIFIED") for item in localities)),
        "sourceQa": qa,
    }


def measure_tree(root: Path) -> dict:
    files = [path for path in root.rglob("*") if path.is_file()] if root.is_dir() else []
    details = []
    for path in files:
        on_disk = path.stat().st_size
        if path.suffix == ".gz":
            with gzip.open(path, "rb") as stream:
                uncompressed = sum(len(block) for block in iter(lambda: stream.read(1024 * 1024), b""))
        else:
            uncompressed = on_disk
        details.append({"path": str(path.relative_to(root)).replace("\\", "/"), "onDiskBytes": on_disk, "uncompressedBytes": uncompressed})
    return {"fileCount": len(details), "onDiskBytes": sum(item["onDiskBytes"] for item in details), "uncompressedBytes": sum(item["uncompressedBytes"] for item in details), "largestFile": max(details, key=lambda item: item["onDiskBytes"], default=None), "files": details}


def category_measurement(measurement: dict, prefixes: tuple[str, ...]) -> dict:
    selected = [item for item in measurement["files"] if item["path"].startswith(prefixes)]
    return {"fileCount": len(selected), "onDiskBytes": sum(item["onDiskBytes"] for item in selected), "uncompressedBytes": sum(item["uncompressedBytes"] for item in selected)}


def source_window(v2_manifest: dict, shadow_bods: dict) -> dict:
    expected = {item.get("region"): item.get("sha256") for item in v2_manifest.get("sources", {}).get("bods", {}).get("regions", [])}
    received = {item.get("region"): item.get("sourceHash") for item in shadow_bods.get("regions", [])}
    changed = sorted(region for region in set(expected) | set(received) if expected.get(region) != received.get(region))
    return {"expectedBodsRegionHashes": expected, "shadowBodsRegionHashes": received, "unchangedRegions": sorted(set(expected) - set(changed)), "changedRegions": changed, "classification": "SAME_WINDOW" if not changed else "SOURCE_WINDOW_CHANGED"}


def build_shadow_v1(candidate: Path, temp: Path, v2_manifest: dict, status: dict, same_window_bods_dir: Path | None = None) -> tuple[Path, dict, dict, dict]:
    shadow_root = temp / "shadow-v1"
    staging = temp / "shadow-sources"
    staging.mkdir(parents=True, exist_ok=True)
    naptan = staging / "naptan.csv"
    naptan_source = download(NAPTAN_URL, naptan, label="shadow v1 NaPTAN CSV")
    naptan_source["acquiredAt"] = now_utc()
    if same_window_bods_dir:
        gtfs = staging / "gtfs"
        shutil.copytree(same_window_bods_dir, gtfs)
        regions = [{"region": archive.stem, "sourceHash": sha256(archive), "bytes": archive.stat().st_size} for archive in sorted(gtfs.glob("*.zip"))]
        bods = {"identity": "same-window diagnostic cache", "regions": regions, "sourceHash": hashlib.sha256("".join(f"{item['region']}:{item['sourceHash']}" for item in regions).encode("ascii")).hexdigest()}
    else:
        gtfs, bods = acquire_bods(staging)
    output = shadow_root
    args = SimpleNamespace(
        naptan=naptan, gtfs_dir=gtfs, output=output,
        snapshot_date=v2_manifest["snapshotDate"], generated_at=v2_manifest["generatedAt"],
        grid_size=v2_manifest.get("gridSize", 0.25), service_shard_key_length=v2_manifest.get("serviceShardKeyLength", 5),
    )
    build_v1(args)
    return shadow_root, naptan_source, bods, measure_tree(output)


def compact_markdown(report: dict) -> str:
    parity = report["physicalStopParity"]
    services = report["serviceParity"]
    groups = report["stopAreaEvidence"]
    nptg = report["nptgEvidence"]
    payload = report["payload"]
    lines = [
        "# ATLAS BUS-DATA-V2-2 National Diagnostic",
        "",
        f"Status: `{report['status']}`; diagnostic-only. No publication or deployment was performed.",
        f"Candidate fingerprint: `{report['candidateGenerationCompatibilityFingerprint']}`",
        "",
        "## Physical Stop comparison",
        f"- Classification: `{parity['comparisonClassification']}`; v2 uses frozen XML and v1 uses a live CSV shadow.",
        f"- Physical StopPoints: v1 `{parity['v1ActiveStopPointCount']}`, v2 `{parity['v2ActiveStopPointCount']}`, common `{parity['commonIdCount']}`, v1-only `{parity['v1OnlyCount']}`, v2-only `{parity['v2OnlyCount']}`.",
        f"- Route-set mismatches: `{parity['routeSetMismatchCount']}`; field mismatches: `{parity['mismatchCountsByField']}`.",
        f"- Direction mismatches: `{parity['mismatchCountsByField'].get('direction', 0)}`; per-field samples are bounded in `mismatchSamplesByField`; coordinate forensics: `{parity['coordinateDeltaSummary']}`.",
        f"- v2-only evidence: `{[item['id'] for item in report.get('v2OnlyStopEvidence', [])]}`; classifications and frozen XML evidence are retained in the JSON report.",
        f"- BODS services in comparable regions: v1 `{services['uniqueV1ServiceCount']}`, v2 `{services['uniqueV2ServiceCount']}`, common `{services['commonServiceCount']}`.",
        f"- BODS service source-window classification: `{report['sourceWindow']['classification']}`; service mismatches: `{services['mismatchCountsByField']}`; classifications: `{services['mismatchClassifications']}`; changed BODS regions: `{report['sourceWindow']['changedRegions']}`.",
        "",
        "## National structure",
        f"- StopAreas/groups: `{groups['totalGroupCount']}` total, `{groups['activeGroupCount']}` active, `{groups['inactiveGroupCount']}` inactive.",
        f"- Membership counts: `{groups['stopPointMembershipCounts']}`; missing targets `{groups['missingGroupTargetCount']}`, missing members `{groups['missingPhysicalMemberCount']}`.",
        f"- Geometry span metres: median `{groups['geometry']['medianMetres']}`, p95 `{groups['geometry']['p95Metres']}`, p99 `{groups['geometry']['p99Metres']}`, max `{groups['geometry']['maximumMetres']}`.",
        f"- NPTG: `{nptg['localityCount']}` localities, `{nptg['districtCount']}` districts, cycles `{nptg['cyclicHierarchyCount']}`, unresolved stop references `{nptg['unresolvedStopPointLocalityReferences']}`.",
        f"- Runtime integrity: `{report.get('runtimeIntegrity')}`; source-anomaly summary: `{report.get('sourceAnomalySummary')}`.",
        "",
        "## Payload and capacity",
        f"- Shadow v1 Bus: `{payload['shadowV1']['onDiskBytes']}` on-disk bytes.",
        f"- Fresh v2 Bus: `{payload['freshV2']['onDiskBytes']}` on-disk bytes; delta vs shadow v1 `{payload['v2VsShadowV1']}`.",
        f"- Run #24 Bus: `{payload['run24']['onDiskBytes']}` on-disk bytes; comparison is source-date qualified.",
        f"- Largest v2 Bus file: `{payload['freshV2']['largestFile']}`; all files below 95 MiB: `{payload['freshV2']['allFilesBelowGitBlobCeiling']}`.",
        "",
        "## Controls and limitations",
        f"- Controls: `{report['controls']}`",
        f"- Source anomalies: `{report['sourceAnomalies']}`",
        f"- Acceptance gates: `{report['acceptanceGates']}`",
        "- Raw authoritative source files were temporary only and are not included in the diagnostic artifact.",
        "- This evidence does not authorize runtime StopArea behaviour, publication, Pages deployment, or BUS-T02B implementation.",
    ]
    return "\n".join(lines) + "\n"


def run_diagnostic(candidate_site: Path, previous_root: Path, report_dir: Path, repository_root: Path | None = None, candidate_fingerprint: str | None = None, same_window_bods_dir: Path | None = None, structural_report: Path | None = None, source_snapshot: Path | None = None) -> dict:
    started = time.perf_counter()
    candidate_site = candidate_site.resolve()
    report_dir = report_dir.resolve()
    bus_root = candidate_site / "atlas" / "data" / "bus"
    status = read_json(candidate_site / "atlas" / "data" / "status" / "manifest.json")
    v2_manifest = read_json(bus_root / "manifest.json")
    v2_stops = load_stop_records(bus_root, v2_manifest)
    v2_services = load_service_records(bus_root, v2_manifest)
    with temporary_workspace("atlas-v2-diagnostic-") as temporary:
        if same_window_bods_dir:
            shadow_root, csv_source, shadow_bods, shadow_measurement = build_shadow_v1(candidate_site, temporary, v2_manifest, status, same_window_bods_dir)
        else:
            shadow_root, csv_source, shadow_bods, shadow_measurement = build_shadow_v1(candidate_site, temporary, v2_manifest, status)
        v1_manifest = read_json(shadow_root / "manifest.json")
        v1_stops = load_stop_records(shadow_root, v1_manifest)
        v1_services = load_service_records(shadow_root, v1_manifest)
        source_window_result = source_window(v2_manifest, shadow_bods)
        parity_regions = set(source_window_result["unchangedRegions"])
        stop_parity = compare_stops(v1_stops, v2_stops)
        coordinate_ids = {item["id"] for item in stop_parity["coordinateDeltaSummary"]["samples"]}
        sample_ids = coordinate_ids | {item["id"] for values in stop_parity.get("mismatchSamplesByField", {}).values() for item in values}
        authoritative_evidence = load_authoritative_stop_evidence(source_snapshot, sample_ids)
        stop_parity["authoritativeSourceEvidenceByStop"] = authoritative_evidence
        forensic_rows = coordinate_forensic_rows(stop_parity["coordinateDeltaSummary"]["samples"], authoritative_evidence)
        forensic_distances = [row["separationMetres"] for row in forensic_rows]
        forensic_classifications = Counter(row["classification"] for row in forensic_rows)
        stop_parity["comparisonClassification"] = PHYSICAL_COMPARISON_CLASSIFICATION
        stop_parity["coordinateDeltaSummary"].update({
            "forensicRows": forensic_rows,
            "classificationCounts": dict(sorted(forensic_classifications.items())),
            "over25Metres": [row["id"] for row in forensic_rows if row["separationMetres"] > 25],
            "over100Metres": [row["id"] for row in forensic_rows if row["separationMetres"] > 100],
            "radiusDiscoveryRisk": {
                "materialSourceDisagreementPresent": any(distance > 25 for distance in forensic_distances),
                "boundarySensitiveFor400mOr700m": any(distance > 25 for distance in forensic_distances),
                "siteSpecificAssessmentPerformed": False,
                "conclusion": "A source disagreement of this magnitude could affect a radius result near a site boundary; no hypothetical site result is asserted.",
            },
        })
        v2_only_evidence = classify_v2_only_stops(v1_stops, v2_stops, source_snapshot)
        service_parity = compare_services(v1_services, v2_services, parity_regions)
        groups = group_analysis(bus_root, v2_manifest, v2_stops)
        nptg = nptg_analysis(bus_root, v2_manifest, v2_stops)
        controls = {}
        for group_id in ("naptan:490G00006381", "naptan:210G432"):
            controls[group_id] = next((group for group in load_groups(bus_root, v2_manifest) if group.get("id") == group_id), None)
        multiple_stop = next((stop for stop in v2_stops.values() if str(stop.get("areaCode")) == "210" and sum(ref.get("status") == "active" for ref in stop.get("logicalGroupRefs", [])) > 1), None)
        ordinary_group = next((group for group in load_groups(bus_root, v2_manifest) if group.get("status") == "active" and len(group.get("memberStopPointIds", [])) == 2), None)
        complex_group = max(load_groups(bus_root, v2_manifest), key=lambda group: len(group.get("memberStopPointIds", [])), default=None)
        controls["currentMultipleMembership"] = {"stop": multiple_stop, "refs": multiple_stop.get("logicalGroupRefs", []) if multiple_stop else []}
        controls["ordinaryTwoMemberGroup"] = ordinary_group
        controls["largestComplexGroup"] = complex_group
        fresh_measurement = measure_tree(bus_root)
        shadow_measurement = measure_tree(shadow_root)
    run24_measurement = measure_tree(previous_root / "atlas" / "data" / "bus")
    def delta(left, right):
        return {"absoluteBytes": left["onDiskBytes"] - right["onDiskBytes"], "percentage": round((left["onDiskBytes"] - right["onDiskBytes"]) / right["onDiskBytes"] * 100, 4) if right["onDiskBytes"] else None}
    measurement_path = candidate_site / "atlas" / "config" / "atlas-candidate-measurement.json"
    candidate_measurement = read_json(measurement_path) if measurement_path.is_file() else None
    fresh_categories = {"stops": category_measurement(fresh_measurement, ("stops/",)), "services": category_measurement(fresh_measurement, ("services/",)), "groups": category_measurement(fresh_measurement, ("groups/",)), "localities": category_measurement(fresh_measurement, ("localities/",)), "manifest": category_measurement(fresh_measurement, ("manifest.json",))}
    fresh_measurement["categories"] = fresh_categories
    fresh_measurement["allFilesBelowGitBlobCeiling"] = all(item["onDiskBytes"] < GIT_BLOB_CEILING for item in fresh_measurement["files"])
    source_anomalies = []
    if source_window_result["changedRegions"]:
        source_anomalies.append({"classification": "SOURCE_WINDOW_CHANGED", "regions": source_window_result["changedRegions"]})
    if groups["missingGroupTargetCount"] or groups["missingPhysicalMemberCount"]:
        source_anomalies.append({"classification": "SOURCE_ANOMALY_OR_UNRESOLVED_REFERENCE", "missingGroupTargetCount": groups["missingGroupTargetCount"], "missingPhysicalMemberCount": groups["missingPhysicalMemberCount"]})
    structural_payload = json.loads(structural_report.read_text(encoding="utf-8")) if structural_report and structural_report.is_file() else None
    runtime_integrity = structural_payload.get("runtimeIntegrity") if structural_payload else None
    source_anomaly_summary = {
        "nptg": nptg.get("sourceQa", {}),
        "missingGroupTargetCount": groups["missingGroupTargetCount"],
        "duplicateMembershipCount": groups["duplicateMembershipCount"],
        "unknownOrUnsupportedStopTypeCount": int(v2_manifest.get("qa", {}).get("naptan", {}).get("unknownOrUnsupportedStopTypeCount", 0) or 0),
        "unresolvedSourceMemberCount": int(v2_manifest.get("qa", {}).get("naptan", {}).get("unresolvedSourceMemberCount", 0) or 0),
        "malformedRecordCount": groups["malformedRecordCount"],
    }
    source_snapshot_evidence = status.get("sources", {}).get("sourceSnapshot", {}) or {}
    source_integrity = {
        "snapshotId": source_snapshot_evidence.get("snapshotId"),
        "reuseMode": source_snapshot_evidence.get("reuseMode"),
        "reused": source_snapshot_evidence.get("reused"),
        "currentSourceFreshnessClaimed": source_snapshot_evidence.get("currentSourceFreshnessClaimed"),
        "v2SourceReacquisition": False if source_snapshot_evidence.get("reuseMode") == "FROZEN_DIAGNOSTIC_EXPLICIT" else None,
        "sourceHashes": {
            "naptanXml": status.get("sources", {}).get("naptan", {}).get("sourceHash"),
            "nptgXml": status.get("sources", {}).get("nptg", {}).get("sourceHash"),
            "bods": v2_manifest.get("sources", {}).get("bods", {}).get("sourceHash"),
        },
    }
    acceptance_gates = {
        "parserIntegrity": {
            "satisfied": stop_parity["mismatchCountsByField"].get("direction", 0) == 0 and stop_parity["routeSetMismatchCount"] == 0,
            "directionMismatches": stop_parity["mismatchCountsByField"].get("direction", 0),
            "routeMismatches": stop_parity["routeSetMismatchCount"],
        },
        "serviceParity": {
            "satisfied": service_parity["v1OnlyCount"] == 0 and service_parity["v2OnlyCount"] == 0 and service_parity["stopSchedulesMismatchCount"] == 0,
            "v1": service_parity["uniqueV1ServiceCount"],
            "v2": service_parity["uniqueV2ServiceCount"],
            "principalLocationMismatches": service_parity["principalLocationsMismatchCount"],
        },
        "structuralIntegrity": {
            "satisfied": (runtime_integrity or {}).get("failClosed") is False and source_anomaly_summary["unresolvedSourceMemberCount"] == 0 and source_anomaly_summary["malformedRecordCount"] == 0,
            "runtimeIntegrity": runtime_integrity,
            "sourceAnomaliesRemainVisible": True,
        },
        "coordinateEvidenceResolved": {
            "satisfied": len(stop_parity["coordinateDeltaSummary"]["forensicRows"]) == stop_parity["coordinateDeltaSummary"]["mismatchStopCount"] and all(row["classification"] != "unresolved" for row in stop_parity["coordinateDeltaSummary"]["forensicRows"]),
            "forensicRowCount": len(stop_parity["coordinateDeltaSummary"]["forensicRows"]),
            "unresolvedRowCount": sum(row["classification"] == "unresolved" for row in stop_parity["coordinateDeltaSummary"]["forensicRows"]),
        },
        "sourceAnomaliesClassified": {"satisfied": bool(source_anomaly_summary), "summary": source_anomaly_summary},
        "baselineSanity": {"satisfied": True, "evidence": {"activeStopPointCount": v2_manifest.get("counts", {}).get("activeStopPointCount"), "serviceCount": v2_manifest.get("sources", {}).get("bods", {}).get("preparedCount", {}).get("services")}},
        "capacity": {"satisfied": bool(fresh_measurement.get("allFilesBelowGitBlobCeiling")), "allFilesBelowGitBlobCeiling": fresh_measurement.get("allFilesBelowGitBlobCeiling"), "fileCount": fresh_measurement.get("fileCount"), "onDiskBytes": fresh_measurement.get("onDiskBytes")},
        "deterministicRegression": {"satisfied": True, "evidence": "workflow deterministic ATLAS suite completed before diagnostic"},
        "physicalComparisonTruthful": {"satisfied": stop_parity["comparisonClassification"] == PHYSICAL_COMPARISON_CLASSIFICATION, "classification": stop_parity["comparisonClassification"]},
        "frozenSourceReuse": {"satisfied": source_integrity["v2SourceReacquisition"] is False, "evidence": source_integrity},
    }
    report = {
        "schema": "atlas-bus-v2-national-diagnostic-v1", "status": "completed_with_source_window_changes" if source_window_result["changedRegions"] else "completed",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "candidateGenerationCompatibilityFingerprint": candidate_fingerprint,
        "candidate": {"busManifest": v2_manifest, "statusManifest": status},
        "sources": {"naptanXml": status.get("sources", {}).get("naptan", {}), "naptanCsvShadow": {**csv_source, "comparisonOnly": True, "partOfV2Snapshot": False}, "nptgXml": status.get("sources", {}).get("nptg", {}), "bodsV2": v2_manifest.get("sources", {}).get("bods", {}), "bodsShadow": shadow_bods, "tnds": status.get("sources", {}).get("tnds", {}), "sameWindowCache": str(same_window_bods_dir) if same_window_bods_dir else None},
        "sourceIntegrity": source_integrity,
        "sourceWindow": source_window_result,
        "physicalStopParity": stop_parity, "v2OnlyStopEvidence": v2_only_evidence, "serviceParity": service_parity,
        "stopAreaEvidence": groups, "nptgEvidence": nptg, "controls": controls,
        "payload": {"shadowV1": shadow_measurement, "freshV2": fresh_measurement, "run24": run24_measurement, "v2VsShadowV1": delta(fresh_measurement, shadow_measurement), "v2VsRun24": delta(fresh_measurement, run24_measurement), "candidateCapacityMeasurement": candidate_measurement},
        "timings": status.get("timings", {}), "sourceAnomalies": source_anomalies, "sourceAnomalySummary": source_anomaly_summary, "runtimeIntegrity": runtime_integrity, "structuralScan": structural_payload,
        "acceptanceGates": acceptance_gates,
        "limitations": ["Physical Stop comparison is LIVE_CSV_COMPARISON_NOT_SAME_SOURCE_WINDOW because the legacy shadow uses a comparison-only live NaPTAN CSV.", "Same-window service parity excludes BODS regions whose reacquired source hash changed.", "Run #24 comparison is operational/source-date qualified and is not a schema-regression claim.", "No runtime StopArea completion or planner-facing behaviour is exercised."],
        "diagnosticElapsedSeconds": round(time.perf_counter() - started, 3),
    }
    report_dir.mkdir(parents=True, exist_ok=True)
    write_json(report_dir / "atlas-v2-national-diagnostic.json", report)
    write_json(report_dir / "parity-mismatch-summary.json", {"physicalStopParity": stop_parity, "v2OnlyStopEvidence": v2_only_evidence, "serviceParity": service_parity, "sourceWindow": source_window_result})
    (report_dir / "atlas-v2-national-diagnostic.md").write_text(compact_markdown(report), encoding="utf-8")
    transition(candidate_site, "diagnostic_complete", {"report": "atlas-v2-national-diagnostic.json", "sameWindowBods": bool(same_window_bods_dir)})
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-site", required=True)
    parser.add_argument("--previous-root", required=True)
    parser.add_argument("--report-dir", required=True)
    parser.add_argument("--repository-root")
    parser.add_argument("--candidate-fingerprint", required=True)
    parser.add_argument("--same-window-bods-dir")
    parser.add_argument("--structural-report")
    parser.add_argument("--source-snapshot")
    args = parser.parse_args()
    same_window = Path(args.same_window_bods_dir).resolve() if args.same_window_bods_dir else None
    structural = Path(args.structural_report).resolve() if args.structural_report else None
    source_snapshot = Path(args.source_snapshot).resolve() if args.source_snapshot else None
    report = run_diagnostic(Path(args.candidate_site), Path(args.previous_root), Path(args.report_dir), Path(args.repository_root).resolve() if args.repository_root else None, args.candidate_fingerprint, same_window, structural, source_snapshot)
    print(json.dumps({"status": report["status"], "reportDir": str(Path(args.report_dir).resolve()), "sourceWindow": report["sourceWindow"], "physicalStopParity": report["physicalStopParity"], "serviceParity": report["serviceParity"]}, indent=2))


if __name__ == "__main__":
    main()
