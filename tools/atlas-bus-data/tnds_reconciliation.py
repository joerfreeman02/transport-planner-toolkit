"""Diagnostic-only BODS/TNDS evidence reconciliation contract.

Credentials, acquisition, byte integrity, semantic interpretation, preparation
and comparator approval are separate states. Nothing here feeds planner output.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter, defaultdict
from datetime import date
from enum import StrEnum
from pathlib import Path
from typing import Any, Iterable

EXPECTED_REGIONS = ("EA", "EM", "NE", "NW", "SE", "SW", "WM", "Y")
SCHEMA = "atlas-tnds-reconciliation-ledger-v2"
FORENSIC_SCHEMA = "atlas-primary-unresolved-forensic-v1"


class State(StrEnum):
    CREDENTIALS_UNAVAILABLE = "CREDENTIALS_UNAVAILABLE"
    CREDENTIALS_AVAILABLE = "CREDENTIALS_AVAILABLE"
    SOURCE_ACQUIRED = "SOURCE_ACQUIRED"
    ARCHIVE_VALIDATED = "ARCHIVE_VALIDATED"
    SEMANTIC_VALIDATED = "SEMANTIC_VALIDATED"
    NORMALIZATION_VALIDATED = "NORMALIZATION_VALIDATED"
    COMPARATOR_VALIDATED = "COMPARATOR_VALIDATED"
    COMPARATOR_UNAVAILABLE = "COMPARATOR_UNAVAILABLE"


VALID_STATES = frozenset(item.value for item in State)


def access_status(username: str | None, password: str | None) -> str:
    """Report credential availability only; never include the supplied values."""
    return State.CREDENTIALS_AVAILABLE if username and password else State.CREDENTIALS_UNAVAILABLE


def fixture_region_manifest(regions: Iterable[str] = EXPECTED_REGIONS, *, acquisition_id: str = "synthetic-fixture-v1") -> dict[str, Any]:
    """Construct explicit, test-only regional evidence manifests."""
    return {"schema": "atlas-tnds-region-evidence-v1", "fixtureOnly": True, "regions": {
        region: {"region": region, "acquisitionId": acquisition_id, "archiveSha256": hashlib.sha256((acquisition_id + region).encode()).hexdigest(),
                 "sourceBytes": 1, "archiveValidation": "passed", "semanticValidation": "passed",
                 "normalizationValidation": "passed", "comparatorState": State.COMPARATOR_VALIDATED}
        for region in regions}}


def _region_valid(item: Any, expected: str) -> bool:
    if not isinstance(item, dict) or str(item.get("region", "")).upper() != expected:
        return False
    digest = str(item.get("archiveSha256", ""))
    try:
        bytes_count = int(item.get("sourceBytes", 0))
    except (TypeError, ValueError):
        return False
    try:
        comparator_state = State(item.get("comparatorState"))
    except (ValueError, TypeError):
        return False
    return (bool(item.get("acquisitionId")) and re.fullmatch(r"[a-fA-F0-9]{64}", digest) is not None
            and bytes_count > 0 and item.get("archiveValidation") == "passed"
            and item.get("semanticValidation") == "passed"
            and item.get("normalizationValidation") == "passed"
            and comparator_state is State.COMPARATOR_VALIDATED)


def validate_region_manifest(manifest: dict[str, Any] | None) -> dict[str, Any]:
    """Validate evidence per region; bare region-name arrays are never evidence."""
    source = manifest.get("regions") if isinstance(manifest, dict) else None
    if not isinstance(source, dict):
        source = {}
    actual = sorted(str(key).upper() for key in source)
    expected = sorted(EXPECTED_REGIONS)
    duplicates = len(actual) != len(set(actual))
    unexpected = sorted(set(actual) - set(expected))
    missing = sorted(set(expected) - set(actual))
    verified = sorted(region for region in set(actual) & set(expected) if _region_valid(source.get(region) or source.get(region.lower()), region))
    unavailable = sorted(set(expected) - set(verified))
    complete = not duplicates and not unexpected and not missing and not unavailable
    return {"expectedRegions": expected, "actualRegions": actual, "verifiedRegions": verified,
            "missingRegions": missing, "unexpectedRegions": unexpected, "unverifiedRegions": unavailable,
            "state": "NATIONAL_COMPLETE" if complete else ("PARTIAL" if verified else "INCOMPLETE"),
            "regionalStates": {region: State.COMPARATOR_VALIDATED if region in verified else State.COMPARATOR_UNAVAILABLE for region in expected}}


def validate_archive(path: str | Path) -> dict[str, Any]:
    source = Path(path)
    digest, size = hashlib.sha256(), 0
    try:
        with source.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                size += len(block); digest.update(block)
        with zipfile.ZipFile(source) as archive:
            names, bad = archive.namelist(), archive.testzip()
        valid = size > 0 and bool(names) and bad is None
        return {"filename": source.name, "bytes": size, "sha256": digest.hexdigest(), "memberCount": len(names), "validation": "passed" if valid else "failed"}
    except (OSError, zipfile.BadZipFile, RuntimeError) as error:
        return {"filename": source.name, "bytes": size, "sha256": digest.hexdigest() if size else None,
                "memberCount": 0, "validation": "failed", "errorType": type(error).__name__}


def normalize_stop_id(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).upper()


def normalize_service_id(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).casefold()


def _date(value: Any) -> date | None:
    if value in (None, ""): return None
    try: return date.fromisoformat(str(value)[:10])
    except ValueError: return None


def _current(row: dict[str, Any], day: date) -> bool:
    start, end = _date(row.get("validFrom")), _date(row.get("validTo"))
    if any(row.get(field) not in (None, "") and _date(row.get(field)) is None for field in ("validFrom", "validTo")):
        return False
    return (start is None or start <= day) and (end is None or day <= end)


def _window(row: dict[str, Any]) -> tuple[str | None, str | None]:
    return (_date(row.get("validFrom")).isoformat() if _date(row.get("validFrom")) else None,
            _date(row.get("validTo")).isoformat() if _date(row.get("validTo")) else None)


def _ids(row: dict[str, Any]) -> dict[str, str]:
    ids = row.get("nativeIds") if isinstance(row.get("nativeIds"), dict) else {}
    return {str(k): str(v) for k, v in ids.items() if v not in (None, "")}


def _bridge(row: dict[str, Any]) -> str | None:
    value = row.get("identityBridge")
    return normalize_service_id(value) if value else None


def _identity_decision(p: dict[str, Any], t: dict[str, Any]) -> tuple[str, str]:
    if normalize_stop_id(p.get("stopId")) != normalize_stop_id(t.get("stopId")) or not p.get("stopId"):
        return "NO_IDENTITY_BRIDGE", "none"
    pb, tb = _bridge(p), _bridge(t)
    if p.get("identityBridgeValidated") is True and t.get("identityBridgeValidated") is True and pb and tb and pb == tb:
        return "EXACT_SHARED_IDENTITY", "high"
    # Composite evidence may nominate a candidate but never establish identity.
    shared_attrs = all(p.get(key) and t.get(key) and str(p[key]).strip().casefold() == str(t[key]).strip().casefold()
                       for key in ("operator", "origin", "destination"))
    same_pattern = bool(p.get("stopSequence") and t.get("stopSequence") and p.get("stopSequence") == t.get("stopSequence"))
    if shared_attrs and same_pattern:
        return "STRONG_COMPOSITE_CANDIDATE", "medium"
    return "NO_IDENTITY_BRIDGE", "none"


COMPARABLE_FIELDS = ("operatingDays", "schoolTermQualifier", "routeNumber", "operator", "origin", "destination", "stopSequence")


def _semantic(p: dict[str, Any], t: dict[str, Any]) -> tuple[str, list[str], list[str], list[str], list[str]]:
    comparable, agreements, conflicts, unknown, not_comparable = [], [], [], [], []
    p_window, t_window = _window(p), _window(t)
    if p_window != t_window: conflicts.append("validityWindow")
    elif all(p_window) and all(t_window): comparable.append("validityWindow"); agreements.append("validityWindow")
    else: unknown.append("validityWindow"); not_comparable.append("validityWindow")
    for field in COMPARABLE_FIELDS:
        a, b = p.get(field), t.get(field)
        if a in (None, "") or b in (None, ""):
            unknown.append(field); not_comparable.append(field); continue
        if field == "operatingDays":
            # A canonical set is required. Unknown/complex calendar labels cannot agree.
            if not isinstance(a, (list, tuple, set)) or not isinstance(b, (list, tuple, set)):
                unknown.append(field); not_comparable.append(field); continue
            a, b = sorted(map(str, a)), sorted(map(str, b))
        elif field == "schoolTermQualifier":
            # Distinguish term-time and ordinary weekdays; unknown calendar semantics remain unknown.
            a, b = str(a).strip().casefold(), str(b).strip().casefold()
            known = {"term_time", "schooldays", "ordinary", "all_days", "not_schooldays", "school_holidays"}
            if a not in known or b not in known:
                unknown.append(field); not_comparable.append(field); continue
        else:
            a, b = str(a).strip().casefold(), str(b).strip().casefold()
        comparable.append(field)
        (agreements if a == b else conflicts).append(field)
    if conflicts: state = "CONFLICTING_CURRENT_EVIDENCE"
    elif unknown: state = "UNKNOWN_OR_NOT_COMPARABLE"
    elif len(agreements) >= 3: state = "EVIDENCE_AGREEMENT"
    else: state = "UNKNOWN_OR_NOT_COMPARABLE"
    return state, comparable, agreements, conflicts, sorted(set(unknown + not_comparable))


def _pair_rows(p_rows: list[dict[str, Any]], t_rows: list[dict[str, Any]]) -> list[tuple[dict[str, Any], dict[str, Any], str, str]]:
    result = []
    for p in p_rows:
        for t in t_rows:
            decision, confidence = _identity_decision(p, t)
            if decision != "NO_IDENTITY_BRIDGE": result.append((p, t, decision, confidence))
    return result


def reconcile(primary: Iterable[dict[str, Any]], tnds: Iterable[dict[str, Any]], *, as_of: str,
              tnds_status: str = State.CREDENTIALS_AVAILABLE, region_manifest: dict[str, Any] | None = None,
              regions: Iterable[str] | None = None) -> dict[str, Any]:
    """Reconcile validated regions independently while preserving raw provenance."""
    day = date.fromisoformat(as_of)
    # `regions` is retained only to fail closed for old callers passing name lists.
    manifest = region_manifest if region_manifest is not None else ({"regions": list(regions)} if regions is not None else None)
    coverage = validate_region_manifest(manifest)
    status = str(tnds_status)
    if status not in VALID_STATES: status = "UNKNOWN_STATE_FAIL_CLOSED"
    credential_ok = status in {State.CREDENTIALS_AVAILABLE, State.SOURCE_ACQUIRED, State.ARCHIVE_VALIDATED, State.SEMANTIC_VALIDATED, State.NORMALIZATION_VALIDATED, State.COMPARATOR_VALIDATED}
    verified = set(coverage["verifiedRegions"] if credential_ok else ())
    pby: dict[str, list[dict[str, Any]]] = defaultdict(list); tby: dict[str, list[dict[str, Any]]] = defaultdict(list)
    excluded = Counter()
    for source, target in ((primary, pby), (tnds, tby)):
        for row in source:
            region = str(row.get("region") or "").upper()
            if region not in EXPECTED_REGIONS or not row.get("stopId"):
                excluded["invalid_identity"] += 1; continue
            if not _current(row, day): excluded["not_current"] += 1; continue
            target[region].append(row)
    rows = []
    for region in EXPECTED_REGIONS:
        ps, ts = pby.get(region, []), tby.get(region, []) if region in verified else []
        if region not in verified:
            for p in ps:
                rows.append(_ledger_row(region, p, None, "COMPARATOR_UNAVAILABLE", State.COMPARATOR_UNAVAILABLE, None, "none"))
            continue
        paired = _pair_rows(ps, ts)
        matched_p, matched_t = set(), set()
        for p, t, identity, confidence in paired:
            matched_p.add(id(p)); matched_t.add(id(t))
            if identity == "EXACT_SHARED_IDENTITY":
                semantic, comparable, agree, conflict, unknown = _semantic(p, t)
            else:
                semantic, comparable, agree, conflict, unknown = "NOT_COMPARABLE_IDENTITY_UNPROVEN", [], [], [], ["serviceIdentity"]
            category = "AMBIGUOUS" if identity == "AMBIGUOUS_IDENTITY" or sum(1 for x in paired if x[0] is p or x[1] is t) > 1 else semantic
            if category != "AMBIGUOUS" and "validityWindow" in conflict: category = "SOURCE_WINDOW_DIFFERENCE"
            if category != "AMBIGUOUS" and identity == "STRONG_COMPOSITE_CANDIDATE": category = "STRONG_COMPOSITE_CANDIDATE"
            if p.get("unresolved") and identity == "EXACT_SHARED_IDENTITY" and category != "SOURCE_WINDOW_DIFFERENCE": category = "IDENTITY_CORROBORATED" if semantic != "EVIDENCE_AGREEMENT" else "UNRESOLVED_PRIMARY_CORROBORATED"
            rows.append(_ledger_row(region, p, t, category, State.COMPARATOR_VALIDATED, identity, confidence,
                                    semantic, comparable, agree, conflict, unknown))
        for p in ps:
            if id(p) not in matched_p: rows.append(_ledger_row(region, p, None, "PRIMARY_ONLY", State.COMPARATOR_VALIDATED, "NO_IDENTITY_BRIDGE", "none"))
        for t in ts:
            if id(t) not in matched_t: rows.append(_ledger_row(region, None, t, "TNDS_ONLY_CANDIDATE", State.COMPARATOR_VALIDATED, "NO_IDENTITY_BRIDGE", "none"))
    rows.sort(key=lambda r: (r["region"], json.dumps(r.get("primaryNativeIds", {}), sort_keys=True), json.dumps(r.get("tndsNativeIds", {}), sort_keys=True), r["category"]))
    counts = dict(sorted(Counter(row["category"] for row in rows).items()))
    body = {"schema": SCHEMA, "asOf": day.isoformat(), "tndsState": status, "regionalCoverage": coverage,
            "comparatorScope": coverage["state"], "plannerOutputChanged": False, "sourceAuthorityChanged": False,
            "rows": rows, "categoryCounts": counts, "excluded": dict(sorted(excluded.items()))}
    digest = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    body["ledgerSha256"] = hashlib.sha256(digest).hexdigest()
    return body


def _ledger_row(region: str, p: dict[str, Any] | None, t: dict[str, Any] | None, category: str,
                regional_state: State, identity: str | None, confidence: str,
                semantic: str = "NOT_COMPARABLE", comparable: list[str] | None = None,
                agreements: list[str] | None = None, conflicts: list[str] | None = None, unknown: list[str] | None = None) -> dict[str, Any]:
    p, t = p or {}, t or {}
    return {"region": region, "category": category, "regionalState": regional_state,
            "primaryEvidenceId": p.get("evidenceId"), "tndsEvidenceId": t.get("evidenceId"),
            "primaryNativeIds": _ids(p), "tndsNativeIds": _ids(t),
            "primaryPreparedId": p.get("preparedId"), "tndsPreparedId": t.get("preparedId"),
            "primaryIdentityBridge": p.get("identityBridge"), "tndsIdentityBridge": t.get("identityBridge"),
            "primaryStopId": p.get("stopId"), "tndsStopId": t.get("stopId"),
            "primaryStopIdNormalized": normalize_stop_id(p.get("stopId")),
            "tndsStopIdNormalized": normalize_stop_id(t.get("stopId")),
            "primaryRouteNumber": p.get("routeNumber"), "tndsRouteNumber": t.get("routeNumber"),
            "crossSourceDecision": identity or "NOT_EVALUATED", "identityConfidence": confidence,
            "identityCorroborated": identity == "EXACT_SHARED_IDENTITY",
            "semanticState": semantic, "comparableAttributes": comparable or [],
            "agreementAttributes": agreements or [], "conflictAttributes": conflicts or [],
            "unknownAttributes": unknown or [], "sourceWindows": {"primary": _window(p), "tnds": _window(t)},
            "plannerEligible": False, "diagnosticOnly": True}


def primary_unresolved_forensic(records: Iterable[dict[str, Any]], *, snapshot_id: str, source_window: str) -> dict[str, Any]:
    """Summarize unresolved call lineage without modifying source evidence."""
    rows = sorted((dict(row) for row in records), key=lambda r: (str(r.get("region", "")), str(r.get("tripId", "")), str(r.get("gtfsStopId", ""))))
    regions = Counter(str(r.get("region", "unknown")) for r in rows)
    methods = Counter(str(r.get("matchMethod", "unknown")) for r in rows)
    stops = Counter(str(r.get("gtfsStopName", "")) for r in rows)
    lineage_fields = ("tripId", "routeId", "resolvedStopPointId", "gtfsStopId")
    missing = {field: sum(1 for row in rows if not row.get(field)) for field in lineage_fields}
    insufficient = any(missing.values())
    body = {"schema": FORENSIC_SCHEMA, "snapshotId": snapshot_id, "sourceWindow": source_window,
            "unresolvedScheduledCallCount": len(rows), "uniqueTripCount": len({r.get("tripId") for r in rows if r.get("tripId")}),
            "uniqueRouteCount": len({r.get("routeId") for r in rows if r.get("routeId")}),
            "uniqueGtfsStopCount": len({r.get("gtfsStopId") for r in rows if r.get("gtfsStopId")}),
            "countsByRegion": dict(sorted(regions.items())), "countsByMatchMethod": dict(sorted(methods.items())),
            "topUnresolvedStopNames": [{"name": name, "count": count} for name, count in stops.most_common(25)],
            "missingLineageCounts": missing,
            "status": "PRIMARY_FORENSIC_LINEAGE_INSUFFICIENT" if insufficient else "PRIMARY_FORENSIC_LINEAGE_AVAILABLE",
            "diagnosticOnly": True, "sourceSnapshotMutated": False}
    body["summarySha256"] = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True); parser.add_argument("--output", required=True)
    parser.add_argument("--status", default=State.CREDENTIALS_UNAVAILABLE); args = parser.parse_args()
    document = json.loads(Path(args.input).read_text(encoding="utf-8"))
    result = reconcile(document.get("primary", []), document.get("tnds", []), as_of=document["asOf"],
                       tnds_status=args.status, region_manifest=document.get("regionManifest"), regions=document.get("regions"))
    dest = Path(args.output); dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"schema": result["schema"], "scope": result["comparatorScope"], "rows": len(result["rows"]), "ledgerSha256": result["ledgerSha256"]}, sort_keys=True))


if __name__ == "__main__": main()
