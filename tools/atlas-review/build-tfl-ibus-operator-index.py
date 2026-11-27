#!/usr/bin/env python3
"""Build a date-valid compact TfL iBus operator evidence index from official S3 data."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import tempfile
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


BUCKET = "ibus.data.tfl.gov.uk"
REGION = "eu-west-1"
S3_ROOT = f"https://s3-{REGION}.amazonaws.com/{BUCKET}/"
PUBLIC_ROOT = f"https://{BUCKET}/"
SCHEMA = "tfl-ibus-operator-index-v1"
SELECTION_SCHEMA = "atlas-ibus-service-line-selection-v1"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child_text(element: ET.Element, name: str) -> str | None:
    child = next((item for item in element if local_name(item.tag) == name), None)
    return child.text.strip() if child is not None and child.text else None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class Source:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.downloaded_objects: list[dict] = []
        self.cache_hits: list[dict] = []
        self.listing_requests = 0

    def local_path(self, key: str) -> Path:
        # Keep every archive under its complete version prefix. The former
        # basename-only cache allowed a newer Base_Version to reuse old ZIPs.
        return self.cache_dir / Path(*key.split("/"))

    @staticmethod
    def _normalise_etag(value: str | None) -> str | None:
        return value.strip().strip('"') if value else None

    def _verified_cache(self, path: Path, metadata: dict | None) -> bool:
        if not metadata or not path.is_file():
            return False
        try:
            record = json.loads(path.with_name(path.name + ".source.json").read_text(encoding="utf-8"))
            expected_etag = self._normalise_etag(metadata.get("etag"))
            actual_etag = self._normalise_etag(record.get("etag"))
            return (
                record.get("size") == metadata.get("size") == path.stat().st_size
                and (not expected_etag or actual_etag == expected_etag)
                and record.get("sha256") == sha256_file(path)
            )
        except (OSError, ValueError, TypeError):
            return False

    def get(self, key: str, *, public_root: bool = False, metadata: dict | None = None, refresh: bool = False) -> tuple[Path, bool]:
        path = self.local_path(key)
        if not refresh and self._verified_cache(path, metadata):
            return path, True
        path.parent.mkdir(parents=True, exist_ok=True)
        root = PUBLIC_ROOT if public_root else S3_ROOT
        request = urllib.request.Request(root + urllib.parse.quote(key, safe="/"), headers={"User-Agent": "ATLAS-TfL-iBus-index-builder/1"})
        expected_size = metadata.get("size") if metadata else None
        expected_etag = self._normalise_etag(metadata.get("etag")) if metadata else None
        last_error = None
        for attempt in range(3):
            temporary_path = None
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    response_etag = self._normalise_etag(response.headers.get("ETag"))
                    if expected_etag and response_etag != expected_etag:
                        raise ValueError(f"ETag mismatch for {key}: listing={expected_etag}, response={response_etag}.")
                    descriptor, temporary_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".part", dir=path.parent)
                    temporary_path = Path(temporary_name)
                    size = 0
                    digest = hashlib.sha256()
                    with os.fdopen(descriptor, "wb") as stream:
                        while True:
                            chunk = response.read(1024 * 1024)
                            if not chunk:
                                break
                            stream.write(chunk)
                            digest.update(chunk)
                            size += len(chunk)
                        stream.flush()
                        os.fsync(stream.fileno())
                    if expected_size is not None and size != expected_size:
                        raise ValueError(f"Size mismatch for {key}: downloaded {size} bytes, listing says {expected_size}.")
                os.replace(temporary_path, path)
                sidecar = {"size": size, "sha256": digest.hexdigest(), "etag": response_etag or expected_etag}
                sidecar_path = path.with_name(path.name + ".source.json")
                sidecar_temp = sidecar_path.with_name(sidecar_path.name + ".part")
                sidecar_temp.write_text(json.dumps(sidecar, sort_keys=True) + "\n", encoding="utf-8")
                os.replace(sidecar_temp, sidecar_path)
                return path, False
            except Exception as error:
                last_error = error
                if temporary_path and temporary_path.exists():
                    temporary_path.unlink()
                if attempt == 2 or isinstance(error, ValueError) or getattr(error, "code", 500) < 500:
                    break
                time.sleep(2 ** attempt)
        raise RuntimeError(f"Could not retrieve a complete TfL iBus source object {key} after bounded retries: {last_error}") from last_error
        return path, False

    def list_version_objects(self, version: str) -> list[dict]:
        prefix = f"Base_Version_{version}/"
        token = None
        objects: list[dict] = []
        while True:
            params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
            if token:
                params["continuation-token"] = token
            request = urllib.request.Request(S3_ROOT + "?" + urllib.parse.urlencode(params), headers={"User-Agent": "ATLAS-TfL-iBus-index-builder/1"})
            self.listing_requests += 1
            with urllib.request.urlopen(request, timeout=60) as response:
                root = ET.fromstring(response.read())
            if child_text(root, "Name") != BUCKET or child_text(root, "Prefix") != prefix:
                raise ValueError("TfL iBus S3 listing response does not match the requested bucket and Base_Version prefix.")
            for item in root.iter():
                if local_name(item.tag) != "Contents":
                    continue
                fields = {local_name(child.tag): child.text for child in item}
                key = fields.get("Key")
                size = int(fields["Size"])
                if not key or not key.startswith(prefix) or size < 0:
                    raise ValueError("TfL iBus listing contains an invalid key, prefix or size.")
                objects.append({"key": key, "size": size, "etag": fields.get("ETag")})
            if child_text(root, "IsTruncated") != "true":
                break
            token = child_text(root, "NextContinuationToken")
            if not token:
                raise ValueError("TfL iBus S3 listing was truncated without a continuation token.")
        if len({item["key"] for item in objects}) != len(objects):
            raise ValueError("TfL iBus S3 listing contains duplicate object keys.")
        return objects


def parse_xml_entry(archive: zipfile.ZipFile, entry_name: str, version: str, entity: str) -> ET.Element:
    root = ET.fromstring(archive.read(entry_name))
    actual_namespace = root.tag.split("}", 1)[0][1:] if root.tag.startswith("{") else ""
    expected_namespace = f"http://www.tfl.uk/CDII/{entity}"
    if local_name(root.tag) != ("Schedule_Data" if entity in {"Journey", "Block", "Block_CalendarDay"} else "Network_Data"):
        raise ValueError(f"Unexpected XML root for {entry_name}: {local_name(root.tag)}")
    if actual_namespace != expected_namespace:
        raise ValueError(f"Unexpected XML namespace in {entry_name}: {actual_namespace}")
    root_version = child_text(root, "Base_Version")
    if root_version != version:
        raise ValueError(f"Mixed or missing Base_Version in {entry_name}: {root_version!r}; expected {version}.")
    for element in root.iter():
        if local_name(element.tag) == "Base_Version" and element.text and element.text.strip() != version:
            raise ValueError(f"Mixed Base_Version record in {entry_name}: {element.text.strip()}.")
    return root


def read_archive(source: Source, key: str, objects_by_key: dict[str, dict], source_records: dict[str, dict]) -> zipfile.ZipFile:
    metadata = objects_by_key.get(key)
    if metadata is None:
        raise ValueError(f"TfL iBus Base_Version listing does not contain required archive {key}.")
    path, cache_hit = source.get(key, metadata=metadata)
    actual_size = path.stat().st_size
    if metadata.get("size") is not None and actual_size != metadata["size"]:
        raise ValueError(f"Size mismatch for {key}: {actual_size} != {metadata['size']}.")
    source_records[key] = {
        "url": S3_ROOT + urllib.parse.quote(key, safe="/"),
        "bytes": actual_size,
        "sha256": sha256_file(path),
        "etag": metadata.get("etag"),
    }
    (source.cache_hits if cache_hit else source.downloaded_objects).append({"key": key, "bytes": actual_size})
    archive = zipfile.ZipFile(path)
    corrupt_entry = archive.testzip()
    if corrupt_entry:
        archive.close()
        path.unlink(missing_ok=True)
        path.with_name(path.name + ".source.json").unlink(missing_ok=True)
        raise ValueError(f"TfL iBus archive {key} failed its ZIP CRC check at {corrupt_entry}.")
    return archive


def load_service_line_selection(path: Path) -> tuple[list[str], str]:
    document = json.loads(path.read_text(encoding="utf-8"))
    lines = document.get("serviceLines")
    source_hash = document.get("sourceSnapshotSha256")
    if document.get("schema") != SELECTION_SCHEMA or not isinstance(lines, list) or not lines:
        raise ValueError("Service-line selection must use atlas-ibus-service-line-selection-v1 and contain a non-empty serviceLines array.")
    if not isinstance(source_hash, str) or re.fullmatch(r"[0-9a-f]{64}", source_hash) is None:
        raise ValueError("Service-line selection must identify its prepared candidate with a sourceSnapshotSha256.")
    selected = [str(line).strip() for line in lines]
    if any(not line for line in selected) or len(set(selected)) != len(selected):
        raise ValueError("Service-line selection contains empty or duplicate route identities.")
    return sorted(selected, key=lambda value: (value.casefold(), value)), source_hash


def inventory_summary(version: str, valid_from: str, valid_to: str, objects: list[dict]) -> dict:
    groups: dict[str, dict] = {}
    for item in objects:
        name = Path(item["key"]).name
        kind = "schedule" if name.startswith("schedule_") else "network"
        group = groups.setdefault(kind, {"objectCount": 0, "bytes": 0, "largestObjects": []})
        group["objectCount"] += 1
        group["bytes"] += item["size"]
        group["largestObjects"].append({"key": item["key"], "bytes": item["size"], "etag": item.get("etag")})
    for group in groups.values():
        group["largestObjects"] = sorted(group["largestObjects"], key=lambda item: (-item["bytes"], item["key"]))[:10]
    return {"schema": "atlas-ibus-source-inventory-v1", "baseVersion": version, "validFrom": valid_from, "validTo": valid_to, "objectCount": len(objects), "totalBytes": sum(item["size"] for item in objects), "groups": groups, "scheduleArchiveCount": groups.get("schedule", {}).get("objectCount", 0), "scheduleArchiveBytes": groups.get("schedule", {}).get("bytes", 0), "downloadedBytes": 0}


def zip_entry_by_name(archive: zipfile.ZipFile, prefix: str) -> str:
    matches = [name for name in archive.namelist() if Path(name).name.startswith(prefix)]
    if len(matches) != 1:
        raise ValueError(f"Expected one {prefix} XML entity file, found {len(matches)}.")
    return matches[0]


def collect_line_records(root: ET.Element, version: str, selected_lines: set[str], *, all_service_lines: bool = False) -> tuple[list[dict], set[str]]:
    records = []
    selected = set(selected_lines)
    for record in root.iter():
        if local_name(record.tag) != "Line":
            continue
        if record.get("Base_Version") and record.get("Base_Version") != version:
            raise ValueError("Mixed Base_Version in Line records.")
        service_line = child_text(record, "Service_Line_No")
        if not service_line or not (all_service_lines or service_line in selected):
            continue
        contract_line = record.get("aContract_Line_No")
        if not contract_line:
            raise ValueError(f"Selected Service_Line_No {service_line} has no Contract_Line_No mapping.")
        records.append({"serviceLineNo": service_line, "contractLineNo": contract_line, "logicalLineNo": child_text(record, "Logical_Line_No"), "baseVersion": version})
        if all_service_lines:
            selected.add(service_line)
    return records, selected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assessment-date", required=True, help="Service date in YYYY-MM-DD format.")
    parser.add_argument("--service-line", action="append", help="Passenger-facing Service_Line_No to index; may be repeated.")
    parser.add_argument("--service-line-selection", type=Path, help=f"Candidate-derived selection manifest ({SELECTION_SCHEMA}); records the complete line-set identity.")
    parser.add_argument("--all-service-lines", action="store_true", help="Index every official passenger-facing Service_Line_No in the current Line archive.")
    parser.add_argument("--inventory-only", action="store_true", help="Fetch fresh Base_Version.xml and bounded S3 listing metadata, report archive sizes, and exit before downloading any archives.")
    parser.add_argument("--cache-dir", type=Path, default=Path.home() / ".cache" / "atlas" / "tfl-ibus", help="Version-scoped raw-source cache directory.")
    parser.add_argument("--output", type=Path, required=True, help="Output compact JSON index path.")
    parser.add_argument("--manifest-output", type=Path, help="Optional current-index manifest path for runtime version selection.")
    parser.add_argument("--retrieved-at", help="Fixed UTC retrieval timestamp for deterministic rebuilds.")
    args = parser.parse_args()

    assessment_date = dt.date.fromisoformat(args.assessment_date)
    selection_hash = None
    selected_lines = []
    if args.service_line_selection:
        selected_lines, selection_hash = load_service_line_selection(args.service_line_selection)
    if args.all_service_lines and (args.service_line or args.service_line_selection):
        raise ValueError("--all-service-lines cannot be combined with a partial service-line selection.")
    service_lines = sorted({str(line).strip() for line in (args.service_line or []) if str(line).strip()} | set(selected_lines), key=lambda value: (value.casefold(), value))
    if not service_lines and not args.inventory_only and not args.all_service_lines:
        raise ValueError("At least one Service_Line_No is required.")
    retrieved_at = args.retrieved_at or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    source = Source(args.cache_dir)
    # Always refresh the root metadata: it selects the current/future version.
    metadata_path, metadata_cache_hit = source.get("Base_Version.xml", public_root=True, refresh=True)
    metadata_root = ET.parse(metadata_path).getroot()
    version = child_text(metadata_root, "Base_Version")
    valid_from = child_text(metadata_root, "Valid_From")
    valid_to = child_text(metadata_root, "Valid_To")
    if not version or not valid_from or not valid_to:
        raise ValueError("Official Base_Version.xml is missing version validity metadata.")
    version = str(version)
    start = dt.datetime.fromisoformat(valid_from)
    end = dt.datetime.fromisoformat(valid_to)
    valid_from_day = start.date().isoformat()
    valid_to_day = end.date().isoformat()
    date_start = dt.datetime.combine(assessment_date, dt.time.min)
    if not (start <= date_start < end):
        raise ValueError(f"Assessment date {assessment_date} is outside Base_Version {version} validity {valid_from}–{valid_to}.")
    if re.fullmatch(r"\d{8}", version) is None:
        raise ValueError(f"Unexpected TfL Base_Version identifier: {version}.")

    source_objects: dict[str, dict] = {
        "Base_Version.xml": {
            "url": PUBLIC_ROOT + "Base_Version.xml",
            "bytes": metadata_path.stat().st_size,
            "sha256": sha256_file(metadata_path),
        }
    }
    (source.cache_hits if metadata_cache_hit else source.downloaded_objects).append({"key": "Base_Version.xml", "bytes": metadata_path.stat().st_size})
    listed_objects = source.list_version_objects(version)
    objects_by_key = {item["key"]: item for item in listed_objects}
    if args.inventory_only:
        print(json.dumps(inventory_summary(version, valid_from, valid_to, listed_objects), ensure_ascii=False, sort_keys=True))
        return 0
    prefix = f"Base_Version_{version}/"
    line_key = prefix + f"Line_{version}.zip"
    operator_key = prefix + f"Operator_{version}.zip"
    stop_key = prefix + f"Stop_Point_{version}.zip"

    with read_archive(source, line_key, objects_by_key, source_objects) as archive:
        entry = zip_entry_by_name(archive, "Line_")
        root = parse_xml_entry(archive, entry, version, "Line")
        line_records, selected = collect_line_records(root, version, set(service_lines), all_service_lines=args.all_service_lines)
        service_lines = sorted(selected, key=lambda value: (value.casefold(), value))
    if not line_records or any(not row["contractLineNo"] for row in line_records):
        raise ValueError("No complete exact Service_Line_No to Contract_Line_No mapping was found.")
    contract_lines = sorted({row["contractLineNo"] for row in line_records})

    with read_archive(source, operator_key, objects_by_key, source_objects) as archive:
        entry = zip_entry_by_name(archive, "Operator_")
        root = parse_xml_entry(archive, entry, version, "Operator")
        operators = {}
        for record in root.iter():
            if local_name(record.tag) == "Operator":
                code = record.get("aOperator_Code")
                name = child_text(record, "Operator_Name")
                if code:
                    if code in operators and operators[code] != name:
                        raise ValueError(f"Conflicting operator names for {code}.")
                    operators[code] = name

    with read_archive(source, stop_key, objects_by_key, source_objects) as archive:
        entry = zip_entry_by_name(archive, "Stop_Point_")
        root = parse_xml_entry(archive, entry, version, "Stop_Point")
        stop_points = {}
        for record in root.iter():
            if local_name(record.tag) == "Stop_Point":
                stop_id = record.get("aStop_Point_Idx")
                naptan = child_text(record, "NaPTAN_Code")
                if stop_id and naptan:
                    stop_points[stop_id] = naptan

    patterns: dict[str, dict] = {}
    for contract_line in contract_lines:
        key = prefix + f"Pattern_data_{contract_line}_{version}.zip"
        with read_archive(source, key, objects_by_key, source_objects) as archive:
            pattern_entry = zip_entry_by_name(archive, "Pattern_")
            stop_entry = zip_entry_by_name(archive, "Stop_In_Pattern_")
            pattern_root = parse_xml_entry(archive, pattern_entry, version, "Pattern")
            stop_root = parse_xml_entry(archive, stop_entry, version, "Stop_In_Pattern")
            line_for_contract = next((row["serviceLineNo"] for row in line_records if row["contractLineNo"] == contract_line), None)
            for record in pattern_root.iter():
                if local_name(record.tag) != "Pattern" or child_text(record, "Type") != "1":
                    continue
                if record.get("aContract_Line_No") != contract_line:
                    continue
                pattern_id = record.get("aPattern_Idx")
                if not pattern_id:
                    raise ValueError("Productive Pattern is missing Pattern_Idx.")
                ordered = []
                stop_records = [item for item in stop_root.iter() if local_name(item.tag) == "Stop_In_Pattern" and item.get("aPattern_Idx") == pattern_id]
                stop_records.sort(key=lambda item: int(child_text(item, "Sequence_No") or "0"))
                for stop_record in stop_records:
                    stop_idx = stop_record.get("aStop_Point_Idx")
                    naptan = stop_points.get(stop_idx or "")
                    if not naptan:
                        raise ValueError(f"Pattern {pattern_id} references Stop_Point_Idx {stop_idx!r} without a NaPTAN mapping.")
                    ordered.append(naptan)
                if not ordered:
                    raise ValueError(f"Productive Pattern {pattern_id} has no ordered Stop_In_Pattern records.")
                if pattern_id in patterns:
                    raise ValueError(f"Duplicate Pattern_Idx {pattern_id} across selected contracts.")
                patterns[pattern_id] = {
                    "patternIdx": pattern_id,
                    "serviceLineNo": line_for_contract,
                    "contractLineNo": contract_line,
                    "direction": child_text(record, "Direction"),
                    "patternType": 1,
                    "orderedStopPointIds": ordered,
                    "journeys": [],
                    "baseVersion": version,
                }

    schedule_objects = sorted(
        (item for item in listed_objects if re.search(r"/schedule_[^/]+_" + re.escape(version) + r"\.zip$", item["key"])),
        key=lambda item: item["key"],
    )
    if not schedule_objects:
        raise ValueError("The selected Base_Version contains no operator-grouped schedule archives.")
    journey_count = block_count = calendar_count = 0
    journeys_by_pattern: dict[str, list[dict]] = {pattern_id: [] for pattern_id in patterns}
    for item in schedule_objects:
        key = item["key"]
        with read_archive(source, key, objects_by_key, source_objects) as archive:
            entries = archive.namelist()
            relevant = [name for name in entries if re.match(r"(?:.*/)?(?:Journey|Block|Block_CalendarDay)_[A-Z0-9]+_" + re.escape(version) + r"(?:_\d{4})?\.xml$", Path(name).name)]
            roots = {}
            for name in relevant:
                filename = Path(name).name
                entity = next(candidate for candidate in ("Block_CalendarDay", "Journey", "Block") if filename.startswith(candidate + "_"))
                roots[name] = parse_xml_entry(archive, name, version, entity)
            blocks: dict[str, str | None] = {}
            date_calendars: dict[str, list[dict]] = {}
            entity_order = {"Block": 0, "Block_CalendarDay": 1, "Journey": 2}
            def entity_from_name(name: str) -> str:
                filename = Path(name).name
                return next((candidate for candidate in ("Block_CalendarDay", "Journey", "Block") if filename.startswith(candidate + "_")), "")

            for name, root in sorted(roots.items(), key=lambda item: entity_order.get(entity_from_name(item[0]), 99)):
                filename = Path(name).name
                entity = entity_from_name(name)
                if entity == "Block":
                    for record in root.iter():
                        if local_name(record.tag) != "Block":
                            continue
                        block_id = record.get("aBlock_Idx")
                        if block_id:
                            block_count += 1
                            code = record.get("aOperator_Code")
                            if block_id in blocks and blocks[block_id] != code:
                                raise ValueError(f"Conflicting operator codes for Block_Idx {block_id}.")
                            blocks[block_id] = code
                elif entity == "Block_CalendarDay":
                    for record in root.iter():
                        if local_name(record.tag) != "Block_CalendarDay":
                            continue
                        calendar_count += 1
                        block_id = record.get("aBlock_Idx")
                        day = record.get("aCalendar_Day") or child_text(record, "Calendar_Day")
                        if not block_id or not day or not (valid_from_day <= day < valid_to_day):
                            continue
                        runs = child_text(record, "Block_Runs_On_Day")
                        date_calendars.setdefault(block_id, []).append({"calendarDay": day, "blockRunsOnDay": runs == "1", "baseVersion": version})
                elif entity == "Journey":
                    for record in root.iter():
                        if local_name(record.tag) != "Journey":
                            continue
                        journey_count += 1
                        pattern_id = record.get("aPattern_Idx")
                        if pattern_id not in journeys_by_pattern or child_text(record, "Type") != "1":
                            continue
                        journey_id = record.get("aJourney_Idx")
                        block_id = record.get("aBlock_Idx")
                        if not journey_id or not block_id:
                            raise ValueError(f"Productive Journey on selected Pattern {pattern_id} is missing its Journey/Block key.")
                        code = blocks.get(block_id)
                        calendar_rows = date_calendars.get(block_id, [])
                        calendars = calendar_rows or [{"calendarDay": assessment_date.isoformat(), "blockRunsOnDay": False, "baseVersion": version}]
                        journeys_by_pattern[pattern_id].append({
                            "journeyIdx": journey_id,
                            "journeyType": 1,
                            "blockIdx": block_id,
                            "operatorCode": code,
                            "operatorName": operators.get(code or ""),
                            "startTimeSeconds": child_text(record, "Start_Time"),
                            "calendarEvidence": calendars,
                            "scheduleObjectKey": key,
                            "baseVersion": version,
                        })
    for pattern_id, record in patterns.items():
        record["journeys"] = sorted(journeys_by_pattern.get(pattern_id, []), key=lambda item: (item["journeyIdx"], item["blockIdx"]))

    source_record = {
        "provider": "TfL iBus Static Data",
        "bucket": BUCKET,
        "region": REGION,
        "metadataUrl": PUBLIC_ROOT + "Base_Version.xml",
        "listingUrl": S3_ROOT,
        "retrievedAt": retrieved_at,
        "anonymousListing": True,
        "objects": source_objects,
        "listingObjectCount": len(listed_objects),
        "scheduleArchiveCount": len(schedule_objects),
        "archiveCount": len([key for key in source_objects if key.endswith(".zip")]),
        "entityRecordsInspected": {"journey": journey_count, "block": block_count, "blockCalendarDay": calendar_count},
        "assessmentDate": assessment_date.isoformat(),
        "serviceLineSelection": {"schema": SELECTION_SCHEMA if args.service_line_selection else None, "sourceSnapshotSha256": selection_hash, "selectedServiceLines": sorted(set(service_lines), key=lambda value: (value.casefold(), value)), "completeSelectionManifestSupplied": bool(args.service_line_selection) or args.all_service_lines, "selectionMode": "all-official-Service_Line_No" if args.all_service_lines else ("candidate-derived-manifest" if args.service_line_selection else "explicit-lines")},
    }
    document = {
        "schema": SCHEMA,
        "baseVersion": version,
        "validFrom": valid_from,
        "validTo": valid_to,
        "assessmentDate": assessment_date.isoformat(),
        "serviceLines": sorted(line_records, key=lambda row: (row["serviceLineNo"], row["contractLineNo"])),
        "patterns": sorted(patterns.values(), key=lambda row: (row["serviceLineNo"], row["contractLineNo"], row["patternIdx"])),
        "source": source_record,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    args.output.write_text(payload, encoding="utf-8")
    output_sha = sha256_file(args.output)
    if args.manifest_output:
        args.manifest_output.parent.mkdir(parents=True, exist_ok=True)
        manifest = {
            "schema": "tfl-ibus-operator-index-manifest-v1",
            "baseVersion": version,
            "validFrom": valid_from,
            "validTo": valid_to,
            "indexPath": Path(os.path.relpath(args.output, args.manifest_output.parent)).as_posix(),
            "indexSha256": output_sha,
        }
        args.manifest_output.write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "bytes": args.output.stat().st_size, "sha256": output_sha, "baseVersion": version, "assessmentDate": assessment_date.isoformat(), "serviceLines": len(line_records), "productivePatterns": len(patterns), "productiveJourneys": sum(len(row["journeys"]) for row in patterns.values()), "downloadCount": len(source.downloaded_objects), "downloadBytes": sum(item["bytes"] for item in source.downloaded_objects), "cacheHitCount": len(source.cache_hits), "cacheHitBytes": sum(item["bytes"] for item in source.cache_hits), "listingObjectCount": len(listed_objects), "scheduleArchiveCount": len(schedule_objects), "listingRequests": source.listing_requests}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - CLI boundary
        print(f"iBus operator-index build failed: {error}", file=sys.stderr)
        raise SystemExit(1)
