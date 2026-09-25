"""Aggregate source/reference/runtime structural findings for Bus v2."""
from __future__ import annotations

import argparse
import gzip
import json
from collections import Counter
from pathlib import Path


def read(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") if path.suffix == ".gz" else path.open("r", encoding="utf-8") as stream:
        return json.load(stream)


def scan(site: Path) -> dict:
    root = site / "atlas/data/bus"
    manifest = read(root / "manifest.json")
    findings = []
    counts = Counter()
    locality_records = []
    for relative in manifest.get("localityShards", {}).values():
        locality_records.extend(read(root / relative).get("localities", []))
    district_ids = {str(item.get("districtId", "")).removeprefix("nptg:") for item in locality_records if item.get("districtId")}
    nptg_qa = manifest.get("qa", {}).get("nptg", {})
    defined_district_ids = set(str(value) for value in nptg_qa.get("districtIds", []))
    counts["total_localities"] = len(locality_records)
    counts["localities_with_district_references"] = sum(bool(item.get("districtId")) for item in locality_records)
    counts["distinct_referenced_district_ids"] = len(district_ids)
    counts["parsed_district_count"] = int(manifest.get("counts", {}).get("districtCount", nptg_qa.get("districtRecords", 0)) or 0)
    counts["distinct_defined_district_ids"] = len(defined_district_ids)
    counts["unresolved_locality_count"] = int(nptg_qa.get("missingDistrictCount", 0) or 0)
    counts["unresolved_parent_count"] = int(nptg_qa.get("missingParentLocalityCount", 0) or 0)
    counts["locality_cycles"] = int(nptg_qa.get("cyclicLocalityCount", 0) or 0)
    unresolved = Counter(str(item.get("districtId", "")).removeprefix("nptg:") for item in locality_records if item.get("districtId") and not item.get("districtName"))
    for district, value in unresolved.items():
        counts[f"unresolved_district_{district}"] = value
    for relative in manifest.get("referenceStopPointShards", {}).values():
        payload = read(root / relative)
        for stop in payload.get("stopPoints", []):
            mode = stop.get("transportMode") or "unknown"
            counts[f"source_{mode}"] += 1
            if not stop.get("knownTransportMode"):
                findings.append({"category": "unknown_transport_mode", "severity": "WARN", "classification": "source_anomaly", "id": stop.get("id")})
            if not stop.get("coordinateValid"):
                counts["invalid_or_missing_coordinates"] += 1
                findings.append({"category": "invalid_or_missing_coordinates", "severity": "WARN", "classification": "source_anomaly", "id": stop.get("id")})
    for relative in manifest.get("groupShards", {}).values():
        for group in read(root / relative).get("groups", []):
            members = group.get("memberStopPointIds", [])
            if group.get("status") == "active" and group.get("missingMemberStopPointIds"):
                counts["active_runtime_integrity_failure"] += 1
                findings.append({"category": "active_runtime_integrity_failure", "severity": "ERROR", "classification": "runtime_integrity", "id": group.get("id"), "missing": group.get("missingMemberStopPointIds")[:20]})
            if group.get("nonBusMemberStopPointIds") or group.get("inactivePhysicalMemberStopPointIds"):
                counts["excluded_source_members"] += 1
            if not isinstance(members, list) or len(members) != len(set(members)):
                counts["duplicate_runtime_members"] += 1
                findings.append({"category": "duplicate_runtime_members", "severity": "ERROR", "classification": "runtime_integrity", "id": group.get("id")})
    for category, value in manifest.get("qa", {}).get("naptan", {}).items():
        if isinstance(value, int):
            counts[f"qa_{category}"] = value
    findings.extend({"category": "unresolved_district_reference", "severity": "WARN", "classification": "source_anomaly", "districtId": district, "localityCount": value, "sampleLocalities": [item.get("id") for item in locality_records if str(item.get("districtId", "")).removeprefix("nptg:") == district][:10], "administrativeAreas": sorted({item.get("administrativeAreaId") for item in locality_records if str(item.get("districtId", "")).removeprefix("nptg:") == district and item.get("administrativeAreaId")})} for district, value in unresolved.items())
    findings.extend({"category": "malformed_nptg_record", "severity": "WARN", "classification": "source_anomaly", "issue": issue} for issue in nptg_qa.get("malformedDistrictSamples", []))
    report = {
        "schema": "atlas-bus-structural-scan-v1",
        "candidateSchema": manifest.get("schema"),
        "categories": dict(sorted(counts.items())),
        "nptg": {
            "totalLocalities": len(locality_records),
            "localitiesWithDistrictReferences": sum(bool(item.get("districtId")) for item in locality_records),
            "parsedDistrictCount": counts["parsed_district_count"],
            "distinctReferencedDistrictIds": sorted(district_ids),
            "distinctDefinedDistrictIds": sorted(defined_district_ids),
            "unresolvedByDistrict": dict(sorted(unresolved.items())),
            "boundedSamples": [{"id": item.get("id"), "name": item.get("name"), "districtId": item.get("districtId"), "administrativeAreaId": item.get("administrativeAreaId")} for item in locality_records if item.get("districtId") and not item.get("districtName")][:25],
            "malformedDistrictRecords": nptg_qa.get("malformedDistrictRecords", 0),
            "malformedDistrictSamples": nptg_qa.get("malformedDistrictSamples", []),
            "unresolvedParents": nptg_qa.get("missingParentLocalityCount", 0),
            "cycles": nptg_qa.get("cyclicLocalityCount", 0),
        },
        "findings": findings[:200],
        "findingCount": len(findings),
        "runtimeIntegrity": {"failClosed": any(item["classification"] == "runtime_integrity" and item["severity"] == "ERROR" for item in findings)},
        "classificationPolicy": {"source_anomaly": "diagnostic evidence; does not by itself authorise publication", "runtime_integrity": "fail closed"},
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    report = scan(Path(args.site_root).resolve())
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if report["runtimeIntegrity"]["failClosed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
