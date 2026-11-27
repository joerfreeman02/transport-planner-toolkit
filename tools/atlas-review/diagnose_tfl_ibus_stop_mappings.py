#!/usr/bin/env python3
"""Read-only audit of official TfL productive patterns against Stop_Point NaPTAN IDs."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

BUILDER_PATH = Path(__file__).with_name("build-tfl-ibus-operator-index.py")
SPEC = importlib.util.spec_from_file_location("atlas_tfl_ibus_builder", BUILDER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load the shared TfL iBus source reader.")
BUILDER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = BUILDER
SPEC.loader.exec_module(BUILDER)


def unresolved_mapping_records(references: list[dict], stop_records: dict[str, list[dict]]) -> list[dict]:
    """Classify referenced stop indices with no usable NaPTAN mapping."""
    gaps = []
    for reference in references:
        stop_idx = reference.get("stopPointIdx")
        rows = stop_records.get(str(stop_idx), []) if stop_idx is not None else []
        mapped = sorted({str(row["naptanCode"]) for row in rows if row.get("naptanCode")})
        if mapped:
            continue
        gaps.append({
            **reference,
            "mappingStatus": "no-Stop_Point-record" if not rows else "Stop_Point-record-has-no-NaPTAN_Code",
            "matchingStopPointRecords": len(rows),
        })
    return gaps


def run(assessment_date: dt.date, cache_dir: Path) -> dict:
    source = BUILDER.Source(cache_dir)
    metadata_path, _ = source.get("Base_Version.xml", public_root=True, refresh=True)
    metadata_root = ET.parse(metadata_path).getroot()
    version = BUILDER.child_text(metadata_root, "Base_Version")
    valid_from = BUILDER.child_text(metadata_root, "Valid_From")
    valid_to = BUILDER.child_text(metadata_root, "Valid_To")
    if not version or not valid_from or not valid_to:
        raise ValueError("Official Base_Version.xml is missing version validity metadata.")
    start, end = dt.datetime.fromisoformat(valid_from), dt.datetime.fromisoformat(valid_to)
    date_start = dt.datetime.combine(assessment_date, dt.time.min)
    if not (start <= date_start < end):
        raise ValueError(f"Assessment date is outside Base_Version {version} validity.")
    objects = source.list_version_objects(version)
    objects_by_key = {item["key"]: item for item in objects}
    prefix = f"Base_Version_{version}/"
    source_objects: dict[str, dict] = {}

    with BUILDER.read_archive(source, prefix + f"Line_{version}.zip", objects_by_key, source_objects) as archive:
        line_root = BUILDER.parse_xml_entry(archive, BUILDER.zip_entry_by_name(archive, "Line_"), version, "Line")
        lines, service_lines = BUILDER.collect_line_records(line_root, version, set(), all_service_lines=True)
    contracts: dict[str, list[str]] = {}
    for line in lines:
        contracts.setdefault(line["contractLineNo"], []).append(line["serviceLineNo"])

    stop_records: dict[str, list[dict]] = {}
    with BUILDER.read_archive(source, prefix + f"Stop_Point_{version}.zip", objects_by_key, source_objects) as archive:
        root = BUILDER.parse_xml_entry(archive, BUILDER.zip_entry_by_name(archive, "Stop_Point_"), version, "Stop_Point")
        for record in root.iter():
            if BUILDER.local_name(record.tag) != "Stop_Point":
                continue
            stop_idx = record.get("aStop_Point_Idx")
            if not stop_idx:
                continue
            stop_records.setdefault(stop_idx, []).append({"naptanCode": BUILDER.child_text(record, "NaPTAN_Code")})

    references: list[dict] = []
    productive_pattern_count = 0
    for contract_line in sorted(contracts):
        key = prefix + f"Pattern_data_{contract_line}_{version}.zip"
        with BUILDER.read_archive(source, key, objects_by_key, source_objects) as archive:
            pattern_root = BUILDER.parse_xml_entry(archive, BUILDER.zip_entry_by_name(archive, "Pattern_"), version, "Pattern")
            stop_root = BUILDER.parse_xml_entry(archive, BUILDER.zip_entry_by_name(archive, "Stop_In_Pattern_"), version, "Stop_In_Pattern")
            for pattern in pattern_root.iter():
                if (BUILDER.local_name(pattern.tag) != "Pattern" or BUILDER.child_text(pattern, "Type") != "1"
                        or pattern.get("aContract_Line_No") != contract_line):
                    continue
                pattern_id = pattern.get("aPattern_Idx")
                if not pattern_id:
                    raise ValueError("Official productive Pattern is missing Pattern_Idx.")
                productive_pattern_count += 1
                rows = [item for item in stop_root.iter() if BUILDER.local_name(item.tag) == "Stop_In_Pattern" and item.get("aPattern_Idx") == pattern_id]
                rows.sort(key=lambda item: int(BUILDER.child_text(item, "Sequence_No") or "0"))
                for item in rows:
                    stop_idx = item.get("aStop_Point_Idx")
                    references.append({
                        "patternIdx": pattern_id,
                        "contractLineNo": contract_line,
                        "serviceLineNos": sorted(set(contracts[contract_line]), key=lambda value: (value.casefold(), value)),
                        "sequenceNo": BUILDER.child_text(item, "Sequence_No"),
                        "stopPointIdx": stop_idx,
                    })

    gaps = unresolved_mapping_records(references, stop_records)
    return {
        "schema": "atlas-tfl-ibus-stop-mapping-diagnostic-v1",
        "assessmentDate": assessment_date.isoformat(),
        "baseVersion": version,
        "validFrom": valid_from,
        "validTo": valid_to,
        "completeOfficialServiceLineCount": len(service_lines),
        "contractLineCount": len(contracts),
        "productivePatternCount": productive_pattern_count,
        "productiveStopReferenceCount": len(references),
        "unresolvedStopReferenceCount": len(gaps),
        "unresolvedStopPointIdCount": len({str(item.get("stopPointIdx")) for item in gaps}),
        "unresolvedPatternCount": len({item["patternIdx"] for item in gaps}),
        "unresolvedStopReferences": gaps[:100],
        "sourceObjects": source_objects,
        "downloadedObjectCount": len(source.downloaded_objects),
        "downloadedBytes": sum(item["bytes"] for item in source.downloaded_objects),
        "sourceContractResult": "COMPLETE" if not gaps else "INCOMPLETE_UNRESOLVED_NAPTAN_MAPPINGS",
        "builderBehavior": "The production index builder remains fail-closed; this diagnostic does not invent IDs or drop pattern stops.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assessment-date", required=True)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = run(dt.date.fromisoformat(args.assessment_date), args.cache_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    args.output.write_text(payload, encoding="utf-8")
    report["reportSha256"] = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    print(json.dumps({key: report[key] for key in (
        "assessmentDate", "baseVersion", "validFrom", "validTo",
        "completeOfficialServiceLineCount", "productivePatternCount",
        "productiveStopReferenceCount", "unresolvedStopReferenceCount",
        "unresolvedStopPointIdCount", "unresolvedPatternCount",
        "unresolvedStopReferences", "sourceObjects", "downloadedObjectCount",
        "downloadedBytes", "sourceContractResult", "reportSha256",
    )}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
