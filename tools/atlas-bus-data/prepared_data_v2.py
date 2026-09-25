#!/usr/bin/env python3
"""Streaming parsers and deterministic normalisation for prepared bus data v2.

This module deliberately contains no planner/runtime policy.  It turns the
authoritative NaPTAN and NPTG XML sources into bounded, versioned records that
the prepared-data builder can shard.  XML namespaces are treated as transport
details; the local schema element names and the published schema version are
validated instead.
"""

from __future__ import annotations

import hashlib
import math
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

V2_SCHEMA = "atlas-prepared-bus-data-v2"
V2_VERSION = "2.0.0"
GROUP_SCHEMA = "atlas-prepared-logical-groups-v1"
LOCALITY_SCHEMA = "atlas-prepared-nptg-localities-v1"
SUPPORTED_SCHEMA_MAJOR = "2"
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$")
MATERIAL_COORDINATE_CONFLICT_THRESHOLD_METRES = 25.0
MAX_COORDINATE_CONFLICT_SAMPLES = 20

STOP_TYPE_MODES = {
    "BCT": "bus_coach", "BCS": "bus_coach", "BCQ": "bus_coach",
    "BST": "bus_coach", "BCE": "bus_coach", "BCP": "bus_coach",
    "RPL": "rail", "RPLY": "rail", "RLY": "rail", "RSE": "rail",
    "PLT": "tram_metro", "MET": "tram_metro", "TMU": "tram_metro",
    "FER": "ferry_water", "FTD": "ferry_water",
    "AIR": "air", "GAT": "air",
    "LPL": "other", "LCB": "other", "LSE": "other",
    "TXR": "other", "STR": "other", "SDA": "other",
}
BUS_COACH_STOP_TYPES = frozenset(key for key, value in STOP_TYPE_MODES.items() if value == "bus_coach")


class SourceParseError(ValueError):
    """Raised when an authoritative XML source cannot be interpreted safely."""


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child_text(element: ET.Element, *names: str) -> str:
    wanted = set(names)
    for child in element.iter():
        if local_name(child.tag) in wanted and child.text and child.text.strip():
            return child.text.strip()
    return ""


def child_texts(element: ET.Element, *names: str) -> list[str]:
    wanted = set(names)
    return [child.text.strip() for child in element.iter() if local_name(child.tag) in wanted and child.text and child.text.strip()]


def direct_child_text(element: ET.Element, *names: str) -> str:
    wanted = set(names)
    for child in list(element):
        if local_name(child.tag) in wanted and child.text and child.text.strip():
            return child.text.strip()
    return ""


def bearing_compass_point(element: ET.Element) -> str:
    """Read the NaPTAN Bearing value without depending on one XML layout.

    NaPTAN 2.4 places the value below ``Bearing/CompassPoint`` inside the
    marked, unmarked, or hail-and-ride point.  The older fixture/schema form
    represents ``Bearing`` as scalar text.  Both are authoritative source
    representations; arbitrary descendant text is deliberately not accepted.
    """
    for bearing in element.iter():
        if local_name(bearing.tag) != "Bearing":
            continue
        compass = direct_child_text(bearing, "CompassPoint")
        if compass:
            return compass
        scalar = (bearing.text or "").strip()
        if scalar:
            return scalar
    return ""


def parse_float(value: str) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def british_national_grid_to_wgs84(easting: float, northing: float) -> tuple[float, float]:
    """Reuse the established ATLAS BNG conversion without changing its maths."""
    try:
        from build_static_index import british_national_grid_to_wgs84 as convert
    except ImportError as error:
        raise SourceParseError("The established British National Grid conversion is unavailable") from error
    return convert(easting, northing)


def _valid_wgs84(latitude: float | None, longitude: float | None) -> bool:
    return latitude is not None and longitude is not None and -90 <= latitude <= 90 and -180 <= longitude <= 180


def _coordinate_distance_metres(first: dict, second: dict) -> float:
    lat1, lon1 = math.radians(first["latitude"]), math.radians(first["longitude"])
    lat2, lon2 = math.radians(second["latitude"]), math.radians(second["longitude"])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371008.8 * 2 * math.asin(math.sqrt(value))


def parse_coordinate_details(element: ET.Element) -> tuple[dict | None, dict | None]:
    latitude = parse_float(child_text(element, "Latitude"))
    longitude = parse_float(child_text(element, "Longitude"))
    supplied = {"latitude": round(latitude, 7), "longitude": round(longitude, 7), "coordinateMethod": "NaPTAN WGS84"} if _valid_wgs84(latitude, longitude) else None
    easting = parse_float(child_text(element, "Easting"))
    northing = parse_float(child_text(element, "Northing"))
    if easting is None or northing is None:
        return supplied, None
    try:
        converted_latitude, converted_longitude = british_national_grid_to_wgs84(easting, northing)
    except (SourceParseError, ValueError, OverflowError):
        return supplied, None
    if not _valid_wgs84(converted_latitude, converted_longitude):
        return supplied, None
    converted = {"latitude": round(converted_latitude, 7), "longitude": round(converted_longitude, 7), "coordinateMethod": "NaPTAN British National Grid converted to WGS84"}
    selected = supplied or converted
    conflict = None
    if supplied is not None:
        distance = _coordinate_distance_metres(supplied, converted)
        if distance > MATERIAL_COORDINATE_CONFLICT_THRESHOLD_METRES:
            conflict = {
                "distanceMetres": round(distance, 3),
                "thresholdMetres": MATERIAL_COORDINATE_CONFLICT_THRESHOLD_METRES,
                "selectedMethod": selected["coordinateMethod"],
                "wgs84": {"latitude": supplied["latitude"], "longitude": supplied["longitude"]},
                "bngConvertedWgs84": {"latitude": converted["latitude"], "longitude": converted["longitude"]},
                "easting": easting,
                "northing": northing,
            }
    return selected, conflict


def parse_coordinate(element: ET.Element) -> dict | None:
    coordinate, _ = parse_coordinate_details(element)
    return coordinate


def record_modification_datetime(element: ET.Element) -> str | None:
    for current in element.iter():
        for key, value in current.attrib.items():
            if local_name(key).lower() in {"modificationdatetime", "modifiedat"} and value.strip():
                return value.strip()
        if local_name(current.tag).lower() in {"modificationdatetime", "modifiedat"} and current.text and current.text.strip():
            return current.text.strip()
    return None


def schema_version(root: ET.Element, source_name: str) -> str:
    value = next((root.attrib.get(key) for key in ("SchemaVersion", "schemaVersion", "Version", "version") if root.attrib.get(key)), "")
    if not value or value.split(".", 1)[0] != SUPPORTED_SCHEMA_MAJOR:
        raise SourceParseError(f"{source_name} uses unsupported or missing schema version: {value or 'missing'}")
    return value


def source_metadata(path: Path, root: ET.Element, version: str) -> dict:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return {
        "path": path.name,
        "sha256": digest.hexdigest(),
        "schemaVersion": version,
        "namespace": root.tag.split("}", 1)[0][1:] if root.tag.startswith("{") else None,
        "sourceCreationDateTime": root.attrib.get("CreationDateTime") or root.attrib.get("creationDateTime") or None,
        "sourceModificationDateTime": root.attrib.get("ModificationDateTime") or root.attrib.get("modificationDateTime") or None,
    }


def valid_id(value: str) -> bool:
    return bool(ID_RE.fullmatch(value))


def valid_reference_id(value: str) -> bool:
    return bool(re.fullmatch(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$", value or ""))


def stop_type_semantics(stop_type: str) -> dict[str, object]:
    code = (stop_type or "").strip().upper()
    return {"mode": STOP_TYPE_MODES.get(code, "unknown"), "known": code in STOP_TYPE_MODES, "busEligible": code in BUS_COACH_STOP_TYPES}


def status_of(element: ET.Element) -> str:
    value = (element.attrib.get("Status") or element.attrib.get("status") or child_text(element, "Status") or "active").strip().lower()
    return value or "active"


def _stop_area_ref(element: ET.Element) -> dict | None:
    source_id = child_text(element, "StopAreaRef")
    if not source_id:
        for child in element.iter():
            if local_name(child.tag) == "StopAreaRef":
                source_id = (child.text or child.attrib.get("ref") or child.attrib.get("Ref") or "").strip()
                if source_id:
                    break
    if not source_id:
        return None
    return {
        "source": "NaPTAN",
        "sourceId": source_id,
        "id": f"naptan:{source_id}",
        "status": "inactive" if (element.attrib.get("Status") or "").lower() in {"inactive", "deleted"} else "active",
        "targetExists": None,
        "provenance": "NaPTAN StopPoint StopAreaRef",
    }


def _parse_stop_point(element: ET.Element, version: str) -> tuple[dict | None, str | None]:
    stop_id = child_text(element, "AtcoCode", "ATCOCode", "StopPointCode")
    name = child_text(element, "CommonName", "Name")
    stop_type = child_text(element, "StopType")
    coordinate, coordinate_conflict = parse_coordinate_details(element)
    if not stop_id or not valid_id(stop_id):
        return None, "malformed_identity"
    if not name or not stop_type:
        return None, "malformed_required_source_field"
    semantics = stop_type_semantics(stop_type)
    locality_code = child_text(element, "NptgLocalityRef", "NPTGLocalityRef") or None
    refs = []
    for ref in element.iter():
        if local_name(ref.tag) != "StopAreaRef":
            continue
        source_id = (ref.text or ref.attrib.get("ref") or ref.attrib.get("Ref") or "").strip()
        if not source_id or not valid_id(source_id):
            continue
        ref_status = (ref.attrib.get("Status") or ref.attrib.get("status") or "active").strip().lower() or "active"
        refs.append({
            "source": "NaPTAN", "sourceId": source_id, "id": f"naptan:{source_id}",
            "status": "inactive" if ref_status in {"inactive", "deleted"} else "active",
            "targetExists": None, "provenance": "NaPTAN StopPoint StopAreaRef",
        })
    unique_refs = {item["id"]: item for item in refs}
    return {
        "id": stop_id,
        "naptanCode": child_text(element, "NaptanCode") or None,
        "name": name,
        "indicator": child_text(element, "Indicator") or None,
        "direction": bearing_compass_point(element) or None,
        **(coordinate or {"latitude": None, "longitude": None, "coordinateMethod": None}),
        "stopType": stop_type,
        "busStopType": child_text(element, "BusStopType") or None,
        "transportMode": semantics["mode"],
        "knownTransportMode": semantics["known"],
        "busPreparedEligible": semantics["busEligible"],
        "sourceValidity": "valid",
        "coordinateValid": coordinate is not None,
        "nptgLocalityCode": locality_code,
        "administrativeAreaCode": child_text(element, "AdministrativeAreaRef") or None,
        "locality": child_text(element, "NptgLocalityName", "LocalityName") or None,
        "parentLocality": child_text(element, "ParentLocalityName") or None,
        "areaCode": stop_id[:3] if stop_id[:3].isdigit() else None,
        "modifiedAt": record_modification_datetime(element),
        "localityResolution": "unresolved" if locality_code else "not-provided",
        "logicalGroupRefs": [unique_refs[key] for key in sorted(unique_refs)],
        "_duplicateLogicalGroupRefCount": len(refs) - len(unique_refs),
        "_coordinateConflict": {"id": stop_id, "name": name, **coordinate_conflict} if coordinate_conflict else None,
        "routes": set(),
        "status": status_of(element),
        "provenance": {"source": "NaPTAN", "schemaVersion": version, "recordId": stop_id},
    }, None


def _parse_stop_area(element: ET.Element, version: str) -> tuple[dict | None, str | None]:
    source_id = direct_child_text(element, "StopAreaCode", "StopAreaId", "StopAreaRef") or child_text(element, "StopAreaCode", "StopAreaId", "StopAreaRef")
    name = direct_child_text(element, "Name", "CommonName") or child_text(element, "Name", "CommonName")
    area_type = direct_child_text(element, "StopAreaType")
    if not source_id or not valid_id(source_id) or not name:
        return None, "malformed_stop_area"
    parent = child_text(element, "ParentAreaRef", "ParentStopAreaRef") or None
    locality = child_text(element, "NptgLocalityRef", "NPTGLocalityRef") or None
    members = []
    for child in element.iter():
        if local_name(child.tag) not in {"StopPointRef", "StopPointCode"}:
            continue
        value = (child.text or child.attrib.get("ref") or child.attrib.get("Ref") or "").strip()
        if value and valid_id(value):
            members.append(value)
    unique_members = sorted(set(members))
    return {
        "id": f"naptan:{source_id}",
        "provider": "NaPTAN",
        "source": "NaPTAN",
        "sourceId": source_id,
        "name": name,
        "type": area_type or None,
        "status": status_of(element),
        "parentGroupId": f"naptan:{parent}" if parent else None,
        "coordinate": parse_coordinate(element),
        "localityRef": locality,
        "sourceMemberStopPointIds": unique_members,
        "memberStopPointIds": [],
        "provenance": {"source": "NaPTAN", "schemaVersion": version, "recordId": source_id},
    }, None


@dataclass
class NaptanParseResult:
    stops: dict[str, dict]
    groups: dict[str, dict]
    metadata: dict
    qa: dict
    issues: list[dict] = field(default_factory=list)


def parse_naptan_xml(path: str | Path) -> NaptanParseResult:
    source = Path(path)
    stops: dict[str, dict] = {}
    groups: dict[str, dict] = {}
    issues: list[dict] = []
    counts = Counter()
    coordinate_conflict_samples: list[dict] = []
    try:
        events = ET.iterparse(source, events=("start", "end"))
        root = None
        version = None
        for event, element in events:
            if event == "start" and root is None:
                root = element
                version = schema_version(root, "NaPTAN XML")
                if local_name(root.tag) not in {"NaPTAN", "NaPTANData", "NaPTANDocument"}:
                    raise SourceParseError(f"NaPTAN XML root element is not recognised: {local_name(root.tag)}")
            if event != "end":
                continue
            kind = local_name(element.tag)
            if kind == "StopPoint":
                record, issue = _parse_stop_point(element, version)
                counts["stopPointRecords"] += 1
                if record:
                    counts["duplicateMembershipCount"] += record.pop("_duplicateLogicalGroupRefCount", 0)
                    coordinate_conflict = record.pop("_coordinateConflict", None)
                    if coordinate_conflict:
                        counts["materialCoordinateConflictCount"] += 1
                        if len(coordinate_conflict_samples) < MAX_COORDINATE_CONFLICT_SAMPLES:
                            coordinate_conflict_samples.append(coordinate_conflict)
                    mode = str(record.get("transportMode") or "unknown")
                    counts["validSourceStopPointCount"] += 1
                    counts[f"valid{mode.title().replace('_', '')}SourceStopPointCount"] += 1
                    if mode == "unknown":
                        counts["unknownOrUnsupportedStopTypeCount"] += 1
                    if not record.get("coordinateValid"):
                        counts["invalidOrMissingCoordinateCount"] += 1
                    if record["id"] in stops:
                        counts["duplicateStopPointIds"] += 1
                        issues.append({"kind": "duplicate_stop_point_id", "id": record["id"]})
                    stops[record["id"]] = record
                elif issue:
                    counts[issue] += 1
                    issues.append({"kind": issue})
                element.clear()
            elif kind == "StopArea":
                record, issue = _parse_stop_area(element, version)
                counts["stopAreaRecords"] += 1
                if record:
                    if record["id"] in groups:
                        counts["duplicateStopAreaIds"] += 1
                        issues.append({"kind": "duplicate_stop_area_id", "id": record["id"]})
                    groups[record["id"]] = record
                elif issue:
                    counts[issue] += 1
                    issues.append({"kind": issue})
                element.clear()
        if root is None or version is None:
            raise SourceParseError("NaPTAN XML was empty")
    except ET.ParseError as error:
        raise SourceParseError(f"NaPTAN XML was malformed: {error}") from error

    active_group_ids = {key for key, group in groups.items() if group["status"] == "active"}
    stop_ids = set(stops)
    member_counts = Counter()
    missing_targets = 0
    inactive_memberships = 0
    duplicate_memberships = counts.get("duplicateMembershipCount", 0)
    for stop in stops.values():
        refs = stop["logicalGroupRefs"]
        seen = set()
        for ref in refs:
            if ref["id"] in seen:
                duplicate_memberships += 1
            seen.add(ref["id"])
            ref["targetExists"] = ref["id"] in groups
            if not ref["targetExists"]:
                missing_targets += 1
            if ref["status"] != "active":
                inactive_memberships += 1
            if ref["id"] in groups:
                groups[ref["id"]].setdefault("sourceMemberStopPointIds", []).append(stop["id"])
                if ref["status"] != "active":
                    groups[ref["id"]].setdefault("inactiveMembershipStopPointIds", []).append(stop["id"])
                elif ref["id"] in active_group_ids:
                    member_counts[stop["id"]] += 1
    for group in groups.values():
        members = sorted(set(group.get("sourceMemberStopPointIds", [])))
        active_bus_members = sorted(member for member in members if member in stops and stops[member].get("status") in ("", "active") and stops[member].get("busPreparedEligible") is True and stops[member].get("coordinateValid") is True)
        group["sourceMemberStopPointIds"] = members
        group["memberStopPointIds"] = active_bus_members
        group["activeBusMemberStopPointIds"] = active_bus_members
        group["unresolvedSourceMemberStopPointIds"] = sorted(set(members) - stop_ids)
        group["missingMemberStopPointIds"] = list(group["unresolvedSourceMemberStopPointIds"])
        group["inactivePhysicalMemberStopPointIds"] = sorted(member for member in members if member in stops and stops[member].get("status") not in ("", "active"))
        group["inactiveMemberStopPointIds"] = list(group["inactivePhysicalMemberStopPointIds"])
        group["nonBusMemberStopPointIds"] = sorted(member for member in members if member in stops and stops[member].get("busPreparedEligible") is not True)
        group["inactiveMembershipStopPointIds"] = sorted(set(group.get("inactiveMembershipStopPointIds", [])))
        group["missingMemberStopPointIds"] = sorted(set(group.get("missingMemberStopPointIds", [])))
        group["qa"] = geometry_qa(group, stops, member_counts)
    counts["validBusCoachSourceStopPointCount"] = sum(1 for stop in stops.values() if stop.get("busPreparedEligible") is True)
    counts["validRailSourceStopPointCount"] = sum(1 for stop in stops.values() if stop.get("transportMode") == "rail")
    counts["validTramMetroSourceStopPointCount"] = sum(1 for stop in stops.values() if stop.get("transportMode") == "tram_metro")
    counts["validFerryWaterSourceStopPointCount"] = sum(1 for stop in stops.values() if stop.get("transportMode") == "ferry_water")
    counts["validAirSourceStopPointCount"] = sum(1 for stop in stops.values() if stop.get("transportMode") == "air")
    counts["validOtherSourceStopPointCount"] = sum(1 for stop in stops.values() if stop.get("transportMode") == "other")
    counts["activeBusStopPointCount"] = sum(1 for stop in stops.values() if stop.get("busPreparedEligible") is True and stop.get("status") in ("", "active") and stop.get("coordinateValid") is True)
    counts["inactiveBusStopPointCount"] = sum(1 for stop in stops.values() if stop.get("busPreparedEligible") is True and stop.get("status") not in ("", "active"))
    qa = {
        **dict(sorted(counts.items())),
        "activeGroupCount": sum(group["status"] == "active" for group in groups.values()),
        "inactiveGroupCount": sum(group["status"] != "active" for group in groups.values()),
        "inactiveMembershipCount": inactive_memberships,
        "inactivePhysicalMemberCount": sum(len(group.get("inactivePhysicalMemberStopPointIds", [])) for group in groups.values()),
        "nonBusMemberCount": sum(len(group.get("nonBusMemberStopPointIds", [])) for group in groups.values()),
        "unresolvedSourceMemberCount": sum(len(group.get("unresolvedSourceMemberStopPointIds", [])) for group in groups.values()),
        "activeBusRuntimeMembershipCount": sum(len(group.get("activeBusMemberStopPointIds", [])) for group in groups.values()),
        "missingGroupTargetCount": missing_targets,
        "duplicateMembershipCount": duplicate_memberships,
        "noGroupStopCount": sum(not stop["logicalGroupRefs"] for stop in stops.values()),
        "oneGroupStopCount": sum(len(stop["logicalGroupRefs"]) == 1 for stop in stops.values()),
        "multipleGroupStopCount": sum(len(stop["logicalGroupRefs"]) > 1 for stop in stops.values()),
        "parentGroupCount": sum(bool(group["parentGroupId"]) for group in groups.values()),
        "malformedIdentityCount": sum(1 for issue in issues if issue["kind"] == "malformed_identity"),
        "malformedRequiredSourceFieldCount": sum(1 for issue in issues if issue["kind"] == "malformed_required_source_field"),
        "malformedRecordCount": sum(1 for issue in issues if issue["kind"].startswith("malformed")),
        "malformed_stop_point": sum(1 for issue in issues if issue["kind"].startswith("malformed")),
        "unsupportedStructureCount": 0,
        "materialCoordinateConflictThresholdMetres": MATERIAL_COORDINATE_CONFLICT_THRESHOLD_METRES,
        "materialCoordinateConflictCount": counts.get("materialCoordinateConflictCount", 0),
        "materialCoordinateConflictSamples": coordinate_conflict_samples,
    }
    return NaptanParseResult(stops, groups, source_metadata(source, root, version), qa, issues)


def haversine(a: dict, b: dict) -> float:
    lat1, lon1 = math.radians(a["latitude"]), math.radians(a["longitude"])
    lat2, lon2 = math.radians(b["latitude"]), math.radians(b["longitude"])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371008.8 * 2 * math.asin(math.sqrt(value))


def geometry_qa(group: dict, stops: dict[str, dict], member_counts: Counter) -> dict:
    members = [stops[stop_id] for stop_id in group["memberStopPointIds"] if stop_id in stops and stops[stop_id].get("status") == "active"]
    max_pair = 0.0
    for index, first in enumerate(members):
        for second in members[index + 1:]:
            max_pair = max(max_pair, haversine(first, second))
    coordinate = group.get("coordinate")
    max_group_distance = max((haversine(coordinate, member) for member in members), default=0.0) if coordinate else None
    return {
        "memberCount": len(group["memberStopPointIds"]),
        "maxMemberToMemberSpanMetres": round(max_pair, 3),
        "maxExtentFromGroupCoordinateMetres": round(max_group_distance, 3) if max_group_distance is not None else None,
        "missingMemberCount": len(group.get("missingMemberStopPointIds", [])),
        "inactiveMemberCount": len(group.get("inactiveMemberStopPointIds", [])),
        "multipleMembershipMemberCount": sum(member_counts[stop_id] > 1 for stop_id in group["memberStopPointIds"]),
        "coordinateOutlierCount": 0,
    }


@dataclass
class NptgParseResult:
    localities: dict[str, dict]
    districts: dict[str, dict]
    metadata: dict
    qa: dict
    issues: list[dict] = field(default_factory=list)


def parse_nptg_xml(path: str | Path) -> NptgParseResult:
    source = Path(path)
    localities: dict[str, dict] = {}
    districts: dict[str, dict] = {}
    issues: list[dict] = []
    counts = Counter()
    try:
        events = ET.iterparse(source, events=("start", "end"))
        root = None
        version = None
        for event, element in events:
            if event == "start" and root is None:
                root = element
                version = schema_version(root, "NPTG XML")
                if local_name(root.tag) not in {"NationalPublicTransportGazetteer", "NPTG", "NPTGData"}:
                    raise SourceParseError(f"NPTG XML root element is not recognised: {local_name(root.tag)}")
            if event != "end":
                continue
            kind = local_name(element.tag)
            if kind in {"NptgLocality", "Locality"}:
                code = direct_child_text(element, "NptgLocalityCode", "LocalityCode", "NptgLocalityRef")
                name = direct_child_text(element, "LocalityName", "Name") or child_text(element, "LocalityName")
                if not code or not valid_id(code) or not name:
                    counts["malformedLocalityRecords"] += 1
                    issues.append({"kind": "malformed_locality", "id": code or None})
                else:
                    localities[code] = {
                        "id": f"nptg:{code}", "code": code, "name": name,
                        "parentLocalityId": (lambda value: f"nptg:{value}" if value else None)(direct_child_text(element, "ParentNptgLocalityRef", "ParentLocalityRef") or None),
                        "higherLocalityId": (lambda value: f"nptg:{value}" if value else None)(direct_child_text(element, "HigherLocalityRef") or None),
                        "districtId": (lambda value: f"nptg:{value}" if value else None)(direct_child_text(element, "NptgDistrictRef", "DistrictRef") or None),
                        "administrativeAreaId": direct_child_text(element, "AdministrativeAreaRef") or None,
                        "qualifierNames": sorted(set(child_texts(element.find("{*}Descriptor") if element.find("{*}Descriptor") is not None else element, "QualifierName"))),
                        "districtName": None,
                        "sourceType": child_text(element, "SourceLocalityType", "LocalityType") or None,
                        "coordinate": parse_coordinate(element),
                        "provenance": {"source": "NPTG", "schemaVersion": version, "recordId": code},
                    }
                    counts["localityRecords"] += 1
                element.clear()
            elif kind in {"NptgDistrict", "District"}:
                code = direct_child_text(element, "NptgDistrictCode", "DistrictCode", "NptgDistrictRef")
                name = direct_child_text(element, "DistrictName", "Name") or child_text(element, "DistrictName")
                if not code or not valid_reference_id(code) or not name:
                    counts["malformedDistrictRecords"] += 1
                    issues.append({"kind": "malformed_district", "id": code or None})
                else:
                    districts[code] = {"id": f"nptg:{code}", "code": code, "name": name, "provenance": {"source": "NPTG", "schemaVersion": version, "recordId": code}}
                    counts["districtRecords"] += 1
                element.clear()
        if root is None or version is None:
            raise SourceParseError("NPTG XML was empty")
    except ET.ParseError as error:
        raise SourceParseError(f"NPTG XML was malformed: {error}") from error
    for locality in localities.values():
        district_id = locality.get("districtId")
        locality["districtName"] = districts.get(district_id[5:], {}).get("name") if district_id else None
    missing_parent = sum(bool(item["parentLocalityId"]) and item["parentLocalityId"][5:] not in localities for item in localities.values())
    missing_district = sum(bool(item["districtId"]) and item["districtId"][5:] not in districts for item in localities.values())
    cycles = 0
    for code in localities:
        seen = set()
        current = code
        while current and current not in seen:
            seen.add(current)
            parent = localities.get(current, {}).get("parentLocalityId")
            current = parent[5:] if parent else ""
        if current in seen:
            cycles += 1
            issues.append({"kind": "cyclic_locality_parent", "id": code})
    missing_district_samples = [item["districtId"][5:] for item in localities.values() if item.get("districtId") and item["districtId"][5:] not in districts][:20]
    qa = {**dict(sorted(counts.items())), "missingParentLocalityCount": missing_parent, "missingDistrictCount": missing_district, "missingDistrictSamples": missing_district_samples, "cyclicLocalityCount": cycles, "unsupportedStructureCount": 0, "districtIds": sorted(districts), "malformedDistrictSamples": [issue for issue in issues if issue["kind"] == "malformed_district"][:20], "districtReferencePolicy": "one-character district codes are valid; absent references remain unresolved source references"}
    return NptgParseResult(localities, districts, source_metadata(source, root, version), qa, issues)


def hydrate_stop_localities(naptan: NaptanParseResult, nptg: NptgParseResult) -> None:
    """Apply only explicit NPTG locality and direct-parent semantics to stops."""
    for stop in naptan.stops.values():
        code = stop.get("nptgLocalityCode")
        locality = nptg.localities.get(code) if code else None
        if not locality:
            stop["localityResolution"] = "unresolved" if code else "not-provided"
            continue
        stop["locality"] = locality["name"]
        parent_id = locality.get("parentLocalityId")
        parent = nptg.localities.get(parent_id[5:]) if parent_id else None
        stop["parentLocality"] = parent["name"] if parent else None
        stop["localityResolution"] = "resolved"


def normalise_for_json(value):
    if isinstance(value, set):
        return sorted(value)
    if isinstance(value, dict):
        return {key: normalise_for_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalise_for_json(item) for item in value]
    return value
