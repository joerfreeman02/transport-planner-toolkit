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


def parse_coordinate(element: ET.Element) -> dict | None:
    latitude = parse_float(child_text(element, "Latitude"))
    longitude = parse_float(child_text(element, "Longitude"))
    if latitude is not None and longitude is not None and -90 <= latitude <= 90 and -180 <= longitude <= 180:
        return {"latitude": round(latitude, 7), "longitude": round(longitude, 7), "coordinateMethod": "NaPTAN WGS84"}
    easting = parse_float(child_text(element, "Easting"))
    northing = parse_float(child_text(element, "Northing"))
    if easting is None or northing is None:
        return None
    try:
        latitude, longitude = british_national_grid_to_wgs84(easting, northing)
    except (SourceParseError, ValueError, OverflowError):
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    return {"latitude": round(latitude, 7), "longitude": round(longitude, 7), "coordinateMethod": "NaPTAN British National Grid converted to WGS84"}


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
    coordinate = parse_coordinate(element)
    if not stop_id or not valid_id(stop_id) or not name or not stop_type or not stop_type.startswith("B") or coordinate is None:
        return None, "malformed_stop_point"
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
        "direction": child_text(element, "Bearing") or None,
        **coordinate,
        "stopType": stop_type,
        "busStopType": child_text(element, "BusStopType") or None,
        "nptgLocalityCode": locality_code,
        "locality": child_text(element, "NptgLocalityName", "LocalityName") or None,
        "parentLocality": child_text(element, "ParentLocalityName") or None,
        "areaCode": stop_id[:3] if stop_id[:3].isdigit() else None,
        "modifiedAt": record_modification_datetime(element),
        "localityResolution": "unresolved" if locality_code else "not-provided",
        "logicalGroupRefs": [unique_refs[key] for key in sorted(unique_refs)],
        "_duplicateLogicalGroupRefCount": len(refs) - len(unique_refs),
        "routes": set(),
        "status": status_of(element),
        "provenance": {"source": "NaPTAN", "schemaVersion": version, "recordId": stop_id},
    }, None


def _parse_stop_area(element: ET.Element, version: str) -> tuple[dict | None, str | None]:
    source_id = child_text(element, "StopAreaCode", "StopAreaId", "StopAreaRef")
    name = child_text(element, "Name", "CommonName")
    area_type = child_text(element, "StopAreaType")
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
        "memberStopPointIds": unique_members,
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
                groups[ref["id"]].setdefault("memberStopPointIds", []).append(stop["id"])
                if ref["status"] != "active":
                    groups[ref["id"]].setdefault("inactiveMembershipStopPointIds", []).append(stop["id"])
                elif ref["id"] in active_group_ids:
                    member_counts[stop["id"]] += 1
    for group in groups.values():
        members = sorted(set(group["memberStopPointIds"]))
        group["memberStopPointIds"] = sorted(set(member for member in members if member in stop_ids))
        group["missingMemberStopPointIds"] = sorted(set(members) - stop_ids)
        group["inactiveMemberStopPointIds"] = sorted(member for member in members if member in stops and stops[member]["status"] != "active")
        group["inactiveMembershipStopPointIds"] = sorted(set(group.get("inactiveMembershipStopPointIds", [])))
        group["missingMemberStopPointIds"] = sorted(set(group.get("missingMemberStopPointIds", [])))
        group["qa"] = geometry_qa(group, stops, member_counts)
    qa = {
        **dict(sorted(counts.items())),
        "activeGroupCount": sum(group["status"] == "active" for group in groups.values()),
        "inactiveGroupCount": sum(group["status"] != "active" for group in groups.values()),
        "inactiveMembershipCount": inactive_memberships,
        "missingGroupTargetCount": missing_targets,
        "duplicateMembershipCount": duplicate_memberships,
        "noGroupStopCount": sum(not stop["logicalGroupRefs"] for stop in stops.values()),
        "oneGroupStopCount": sum(len(stop["logicalGroupRefs"]) == 1 for stop in stops.values()),
        "multipleGroupStopCount": sum(len(stop["logicalGroupRefs"]) > 1 for stop in stops.values()),
        "parentGroupCount": sum(bool(group["parentGroupId"]) for group in groups.values()),
        "malformedRecordCount": sum(1 for issue in issues if issue["kind"].startswith("malformed")),
        "unsupportedStructureCount": 0,
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
                code = child_text(element, "NptgLocalityCode", "LocalityCode", "NptgLocalityRef")
                name = child_text(element, "LocalityName", "Name", "Descriptor")
                if not code or not valid_id(code) or not name:
                    counts["malformedLocalityRecords"] += 1
                    issues.append({"kind": "malformed_locality", "id": code or None})
                else:
                    localities[code] = {
                        "id": f"nptg:{code}", "code": code, "name": name,
                        "parentLocalityId": (lambda value: f"nptg:{value}" if value else None)(child_text(element, "ParentNptgLocalityRef", "ParentLocalityRef") or None),
                        "higherLocalityId": (lambda value: f"nptg:{value}" if value else None)(child_text(element, "HigherLocalityRef") or None),
                        "districtId": (lambda value: f"nptg:{value}" if value else None)(child_text(element, "NptgDistrictRef", "DistrictRef") or None),
                        "districtName": None,
                        "sourceType": child_text(element, "SourceLocalityType", "LocalityType") or None,
                        "coordinate": parse_coordinate(element),
                        "provenance": {"source": "NPTG", "schemaVersion": version, "recordId": code},
                    }
                    counts["localityRecords"] += 1
                element.clear()
            elif kind in {"NptgDistrict", "District"}:
                code = child_text(element, "NptgDistrictCode", "DistrictCode", "NptgDistrictRef")
                name = child_text(element, "DistrictName", "Name", "Descriptor")
                if not code or not valid_id(code) or not name:
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
    qa = {**dict(sorted(counts.items())), "missingParentLocalityCount": missing_parent, "missingDistrictCount": missing_district, "cyclicLocalityCount": cycles, "unsupportedStructureCount": 0}
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
