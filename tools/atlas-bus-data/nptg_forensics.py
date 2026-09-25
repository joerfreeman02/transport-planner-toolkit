#!/usr/bin/env python3
"""Produce bounded, reproducible NPTG district-reference forensics."""
from __future__ import annotations

import argparse
import hashlib
import json
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def descendant_text(element: ET.Element, *names: str) -> str | None:
    wanted = set(names)
    for child in element.iter():
        if local_name(child.tag) in wanted and child.text and child.text.strip():
            return child.text.strip()
    return None


def analyse(path: str | Path, *, sample_size: int = 10) -> dict:
    source = Path(path)
    data = source.read_bytes()
    root = ET.fromstring(data)
    parents = {id(child): parent for parent in root.iter() for child in list(parent)}
    localities = []
    districts = {}
    malformed = []
    for element in root.iter():
        kind = local_name(element.tag)
        if kind in {"NptgLocality", "Locality"}:
            code = descendant_text(element, "NptgLocalityCode", "LocalityCode", "NptgLocalityRef")
            name = descendant_text(element, "LocalityName", "Name")
            ref = descendant_text(element, "NptgDistrictRef", "DistrictRef")
            record = {"code": code, "name": name, "districtId": ref, "administrativeArea": descendant_text(element, "AdministrativeAreaRef"), "sourceLocalityType": descendant_text(element, "SourceLocalityType", "LocalityType")}
            localities.append(record)
        elif kind in {"NptgDistrict", "District"}:
            code = descendant_text(element, "NptgDistrictCode", "DistrictCode", "NptgDistrictRef")
            name = descendant_text(element, "Name", "DistrictName")
            if code and name:
                districts[code] = {"code": code, "name": name, "path": "/".join(_path(element, parents))}
            else:
                malformed.append({"code": code, "name": name, "path": "/".join(_path(element, parents))})
    references = Counter(item["districtId"] for item in localities if item["districtId"])
    unresolved = {code: count for code, count in references.items() if code not in districts}
    target = next((item for item in localities if item["code"] == "E0000006"), None)
    target_element = next((element for element in root.iter() if local_name(element.tag) in {"NptgLocality", "Locality"} and descendant_text(element, "NptgLocalityCode", "LocalityCode") == "E0000006"), None)
    target["path"] = "/".join(_path(target_element, parents)) if target_element is not None else None
    return {
        "schema": "atlas-nptg-forensics-v1", "source": source.name, "sourceSha256": hashlib.sha256(data).hexdigest(),
        "sourceRoot": local_name(root.tag), "sourceAttributes": {key: value for key, value in root.attrib.items() if local_name(key) in {"SchemaVersion", "ModificationDateTime", "RevisionNumber", "FileName", "LocationSystem"}},
        "targetRecord": target, "targetDistrict": districts.get("310"),
        "district310": {"exists": "310" in districts, "definition": districts.get("310")},
        "counts": {"totalLocalities": len(localities), "localitiesWithDistrictReferences": sum(bool(item["districtId"]) for item in localities), "distinctDistrictReferences": len(references), "parsedDistrictDefinitions": len(districts), "referencedButNotDefinedDistrictIds": len(unresolved), "unresolvedLocalityReferences": sum(unresolved.values())},
        "referencedDistrictCounts": dict(sorted(references.items())), "unresolvedByDistrict": dict(sorted(unresolved.items())),
        "unresolvedSamples": {code: [item for item in localities if item["districtId"] == code][:sample_size] for code in sorted(unresolved)},
        "malformedDistrictRecords": malformed[:sample_size],
        "classification": "authoritative unresolved relationship" if unresolved else "no unresolved relationship found",
        "interpretation": "The XML contains locality references to district IDs that have no district definition. This is not a parser-created relationship; fail-closed validation should keep the relationship visible until Technical Director decides whether the relationship is optional or the authoritative source is corrected.",
    }


def _path(element: ET.Element, parents: dict[int, ET.Element]) -> list[str]:
    result = []
    current = element
    while current is not None:
        result.append(local_name(current.tag))
        current = parents.get(id(current))
    return list(reversed(result))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = analyse(args.input)
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
