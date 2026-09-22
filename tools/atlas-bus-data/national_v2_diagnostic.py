#!/usr/bin/env python3
"""Produce compact, diagnostic-only national v1/v2 evidence for BUS-DATA-V2-2.

The shadow v1 candidate and all reacquired source files live in a temporary
directory. Only compact JSON/Markdown evidence is written to ``--report-dir``.
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
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from build_static_index import build as build_v1
from refresh_bus_data import BODS_REGIONS, NAPTAN_URL, acquire_bods, download, sha256

MAX_SAMPLES = 20
MAX_OUTLIERS = 20
GIT_BLOB_CEILING = 95 * 1024 * 1024
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


def compare_stops(v1: dict[str, dict], v2: dict[str, dict]) -> dict:
    common = sorted(set(v1) & set(v2))
    v1_only = sorted(set(v1) - set(v2))
    v2_only = sorted(set(v2) - set(v1))
    mismatches = Counter()
    mismatch_by_area = Counter()
    samples = []
    for identity in common:
        for field in LEGACY_STOP_FIELDS:
            left = v1[identity].get(field)
            right = v2[identity].get(field)
            if field == "routes":
                left = sorted(left or [])
                right = sorted(right or [])
            if normalise(left) != normalise(right):
                mismatches[field] += 1
                mismatch_by_area[str(v1[identity].get("areaCode") or identity[:3])] += 1
                if len(samples) < MAX_SAMPLES:
                    samples.append({"id": identity, "field": field, "v1": left, "v2": right})
    parity = {field: round((len(common) - mismatches[field]) / len(common) * 100, 6) if common else 100 for field in LEGACY_STOP_FIELDS}
    return {
        "v1ActiveStopPointCount": len(v1), "v2ActiveStopPointCount": len(v2), "commonIdCount": len(common),
        "v1OnlyCount": len(v1_only), "v2OnlyCount": len(v2_only),
        "v1OnlySamples": v1_only[:MAX_SAMPLES], "v2OnlySamples": v2_only[:MAX_SAMPLES],
        "mismatchCountsByField": dict(sorted(mismatches.items())),
        "parityPercentageByField": parity,
        "routeSetMismatchCount": mismatches["routes"],
        "mismatchByAtcoArea": dict(mismatch_by_area.most_common(MAX_SAMPLES)),
        "mismatchSamples": samples,
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


def compare_services(v1: dict[str, dict], v2: dict[str, dict], comparable_regions: set[str]) -> dict:
    v1_scoped = {key: value for key, value in v1.items() if value.get("source", {}).get("region") in comparable_regions}
    v2_scoped = {key: value for key, value in v2.items() if value.get("source", {}).get("region") in comparable_regions}
    common = sorted(set(v1_scoped) & set(v2_scoped))
    v1_only = sorted(set(v1_scoped) - set(v2_scoped))
    v2_only = sorted(set(v2_scoped) - set(v1_scoped))
    mismatches = Counter()
    samples = []
    for identity in common:
        left = canonical_service(v1_scoped[identity])
        right = canonical_service(v2_scoped[identity])
        for field in SERVICE_FIELDS:
            if left[field] != right[field]:
                mismatches[field] += 1
                if len(samples) < MAX_SAMPLES:
                    samples.append({"id": identity, "field": field, "v1": left[field], "v2": right[field]})
    return {
        "scopeRegions": sorted(comparable_regions), "uniqueV1ServiceCount": len(v1_scoped),
        "uniqueV2ServiceCount": len(v2_scoped), "commonServiceCount": len(common),
        "v1OnlyCount": len(v1_only), "v2OnlyCount": len(v2_only),
        "v1OnlySamples": v1_only[:MAX_SAMPLES], "v2OnlySamples": v2_only[:MAX_SAMPLES],
        "mismatchCountsByField": dict(sorted(mismatches.items())),
        "stopSchedulesMismatchCount": mismatches["stopSchedules"],
        "principalLocationsMismatchCount": mismatches["principalLocations"],
        "mismatchSamples": samples,
    }


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


def build_shadow_v1(candidate: Path, temp: Path, v2_manifest: dict, status: dict) -> tuple[Path, dict, dict, dict]:
    shadow_root = temp / "shadow-v1"
    staging = temp / "shadow-sources"
    staging.mkdir(parents=True, exist_ok=True)
    naptan = staging / "naptan.csv"
    naptan_source = download(NAPTAN_URL, naptan, label="shadow v1 NaPTAN CSV")
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
        "## Same-window parity",
        f"- Physical StopPoints: v1 `{parity['v1ActiveStopPointCount']}`, v2 `{parity['v2ActiveStopPointCount']}`, common `{parity['commonIdCount']}`, v1-only `{parity['v1OnlyCount']}`, v2-only `{parity['v2OnlyCount']}`.",
        f"- Route-set mismatches: `{parity['routeSetMismatchCount']}`; field mismatches: `{parity['mismatchCountsByField']}`.",
        f"- BODS services in comparable regions: v1 `{services['uniqueV1ServiceCount']}`, v2 `{services['uniqueV2ServiceCount']}`, common `{services['commonServiceCount']}`.",
        f"- Service mismatches: `{services['mismatchCountsByField']}`; changed BODS regions: `{report['sourceWindow']['changedRegions']}`.",
        "",
        "## National structure",
        f"- StopAreas/groups: `{groups['totalGroupCount']}` total, `{groups['activeGroupCount']}` active, `{groups['inactiveGroupCount']}` inactive.",
        f"- Membership counts: `{groups['stopPointMembershipCounts']}`; missing targets `{groups['missingGroupTargetCount']}`, missing members `{groups['missingPhysicalMemberCount']}`.",
        f"- Geometry span metres: median `{groups['geometry']['medianMetres']}`, p95 `{groups['geometry']['p95Metres']}`, p99 `{groups['geometry']['p99Metres']}`, max `{groups['geometry']['maximumMetres']}`.",
        f"- NPTG: `{nptg['localityCount']}` localities, `{nptg['districtCount']}` districts, cycles `{nptg['cyclicHierarchyCount']}`, unresolved stop references `{nptg['unresolvedStopPointLocalityReferences']}`.",
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
        "- Raw authoritative source files were temporary only and are not included in the diagnostic artifact.",
        "- This evidence does not authorize runtime StopArea behaviour, publication, Pages deployment, or BUS-T02B implementation.",
    ]
    return "\n".join(lines) + "\n"


def run_diagnostic(candidate_site: Path, previous_root: Path, report_dir: Path, repository_root: Path | None = None, candidate_fingerprint: str | None = None) -> dict:
    started = time.perf_counter()
    candidate_site = candidate_site.resolve()
    report_dir = report_dir.resolve()
    bus_root = candidate_site / "atlas" / "data" / "bus"
    status = read_json(candidate_site / "atlas" / "data" / "status" / "manifest.json")
    v2_manifest = read_json(bus_root / "manifest.json")
    v2_stops = load_stop_records(bus_root, v2_manifest)
    v2_services = load_service_records(bus_root, v2_manifest)
    with temporary_workspace("atlas-v2-diagnostic-") as temporary:
        shadow_root, csv_source, shadow_bods, shadow_measurement = build_shadow_v1(candidate_site, temporary, v2_manifest, status)
        v1_manifest = read_json(shadow_root / "manifest.json")
        v1_stops = load_stop_records(shadow_root, v1_manifest)
        v1_services = load_service_records(shadow_root, v1_manifest)
        source_window_result = source_window(v2_manifest, shadow_bods)
        parity_regions = set(source_window_result["unchangedRegions"])
        stop_parity = compare_stops(v1_stops, v2_stops)
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
    report = {
        "schema": "atlas-bus-v2-national-diagnostic-v1", "status": "completed_with_source_window_changes" if source_window_result["changedRegions"] else "completed",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "candidateGenerationCompatibilityFingerprint": candidate_fingerprint,
        "candidate": {"busManifest": v2_manifest, "statusManifest": status},
        "sources": {"naptanXml": status.get("sources", {}).get("naptan", {}), "naptanCsvShadow": csv_source, "nptgXml": status.get("sources", {}).get("nptg", {}), "bodsV2": v2_manifest.get("sources", {}).get("bods", {}), "bodsShadow": shadow_bods, "tnds": status.get("sources", {}).get("tnds", {})},
        "sourceWindow": source_window_result,
        "physicalStopParity": stop_parity, "serviceParity": service_parity,
        "stopAreaEvidence": groups, "nptgEvidence": nptg, "controls": controls,
        "payload": {"shadowV1": shadow_measurement, "freshV2": fresh_measurement, "run24": run24_measurement, "v2VsShadowV1": delta(fresh_measurement, shadow_measurement), "v2VsRun24": delta(fresh_measurement, run24_measurement), "candidateCapacityMeasurement": candidate_measurement},
        "timings": status.get("timings", {}), "sourceAnomalies": source_anomalies,
        "limitations": ["Same-window service parity excludes BODS regions whose reacquired source hash changed.", "Run #24 comparison is operational/source-date qualified and is not a schema-regression claim.", "No runtime StopArea completion or planner-facing behaviour is exercised."],
        "diagnosticElapsedSeconds": round(time.perf_counter() - started, 3),
    }
    report_dir.mkdir(parents=True, exist_ok=True)
    write_json(report_dir / "atlas-v2-national-diagnostic.json", report)
    write_json(report_dir / "parity-mismatch-summary.json", {"physicalStopParity": stop_parity, "serviceParity": service_parity, "sourceWindow": source_window_result})
    (report_dir / "atlas-v2-national-diagnostic.md").write_text(compact_markdown(report), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-site", required=True)
    parser.add_argument("--previous-root", required=True)
    parser.add_argument("--report-dir", required=True)
    parser.add_argument("--repository-root")
    parser.add_argument("--candidate-fingerprint", required=True)
    args = parser.parse_args()
    report = run_diagnostic(Path(args.candidate_site), Path(args.previous_root), Path(args.report_dir), Path(args.repository_root).resolve() if args.repository_root else None, args.candidate_fingerprint)
    print(json.dumps({"status": report["status"], "reportDir": str(Path(args.report_dir).resolve()), "sourceWindow": report["sourceWindow"], "physicalStopParity": report["physicalStopParity"], "serviceParity": report["serviceParity"]}, indent=2))


if __name__ == "__main__":
    main()
