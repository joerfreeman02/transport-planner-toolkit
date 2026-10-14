"""Independent, fail-closed BODS/TNDS reconciliation primitives.

This module is diagnostic-only. It never writes planner data or changes source
authority. Inputs are normalized evidence rows; a match always includes region,
stop identity, and service identity. Route number is retained for review only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

EXPECTED_REGIONS = ("EA", "EM", "NE", "NW", "SE", "SW", "WM", "Y")
SCHEMA = "atlas-tnds-reconciliation-ledger-v1"


def access_status(username: str | None, password: str | None) -> str:
    """Return an explicit state without reading, logging, or echoing secrets."""
    if not username or not password:
        return "BLOCKED_CREDENTIALS"
    return "AVAILABLE_CREDENTIALS_PRESENT"


def validate_region_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    regions = manifest.get("regions")
    if isinstance(regions, dict):
        actual = sorted(str(key).upper() for key, item in regions.items()
                        if isinstance(item, dict) and item.get("validation") == "passed")
    elif isinstance(regions, list):
        actual = sorted(str(item).upper() for item in regions)
    else:
        actual = []
    expected = sorted(EXPECTED_REGIONS)
    complete = actual == expected and len(actual) == len(set(actual))
    return {
        "expectedRegions": expected,
        "actualRegions": actual,
        "missingRegions": sorted(set(expected) - set(actual)),
        "unexpectedRegions": sorted(set(actual) - set(expected)),
        "state": "NATIONAL_COMPLETE" if complete else "INCOMPLETE",
    }


def validate_archive(path: str | Path) -> dict[str, Any]:
    """Check a ZIP before parsing and return traceable metadata, never payload."""
    source = Path(path)
    digest = hashlib.sha256()
    size = 0
    try:
        with source.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                size += len(block)
                digest.update(block)
        with zipfile.ZipFile(source) as archive:
            names = archive.namelist()
            bad_member = archive.testzip()
        valid = size > 0 and bool(names) and bad_member is None
        return {"filename": source.name, "bytes": size, "sha256": digest.hexdigest(),
                "readable": True, "memberCount": len(names), "badMember": bad_member,
                "validation": "passed" if valid else "failed"}
    except (OSError, zipfile.BadZipFile, RuntimeError) as error:
        return {"filename": source.name, "bytes": size,
                "sha256": digest.hexdigest() if size else None,
                "readable": False, "memberCount": 0, "badMember": None,
                "validation": "failed", "errorType": type(error).__name__}


def normalize_stop_id(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).upper()


def normalize_service_id(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).casefold()


def _date_or_none(value: Any) -> date | None:
    if value in (None, ""):
        return None
    return date.fromisoformat(str(value)[:10])


def _is_current(row: dict[str, Any], as_of: date) -> bool:
    start = _date_or_none(row.get("validFrom"))
    end = _date_or_none(row.get("validTo"))
    return (start is None or start <= as_of) and (end is None or as_of <= end)


def _identity(row: dict[str, Any]) -> tuple[str, str, str] | None:
    region = str(row.get("region") or "").upper()
    stop = normalize_stop_id(row.get("stopId"))
    service = normalize_service_id(row.get("serviceId"))
    if not region or not stop or not service:
        return None
    return region, stop, service


def reconcile(primary: Iterable[dict[str, Any]], tnds: Iterable[dict[str, Any]], *,
              as_of: str, tnds_status: str = "AVAILABLE",
              regions: Iterable[str] = ()) -> dict[str, Any]:
    """Build a stable ledger from normalized rows using exact composite keys."""
    day = date.fromisoformat(as_of)
    region_state = validate_region_manifest({"regions": list(regions)})
    available = tnds_status == "AVAILABLE" and region_state["state"] == "NATIONAL_COMPLETE"
    left: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    right: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    excluded = Counter()
    for source, target in ((primary, left), (tnds, right)):
        for row in source:
            identity = _identity(row)
            if not identity:
                excluded["invalid_identity"] += 1
            elif not _is_current(row, day):
                excluded["not_current"] += 1
            else:
                target[identity].append(row)

    rows = []
    keys = sorted(set(left) | set(right))
    if not available:
        keys = sorted(left)
    for key in keys:
        p_rows, t_rows = left.get(key, []), right.get(key, []) if available else []
        p_ids = sorted(str(row.get("evidenceId") or "") for row in p_rows)
        t_ids = sorted(str(row.get("evidenceId") or "") for row in t_rows)
        ambiguous = len(p_rows) > 1 or len(t_rows) > 1
        if not available:
            category = "COMPARATOR_UNAVAILABLE"
        elif ambiguous:
            category = "AMBIGUOUS"
        elif p_rows and t_rows:
            category = "UNRESOLVED_PRIMARY_CORROBORATED" if p_rows[0].get("unresolved") else "AGREEMENT"
        elif p_rows:
            category = "PRIMARY_ONLY"
        else:
            category = "TNDS_ONLY_CANDIDATE"
        rows.append({
            "region": key[0], "stopId": key[1], "serviceId": key[2],
            "category": category, "primaryEvidenceIds": p_ids, "tndsEvidenceIds": t_ids,
            "routeNumbers": sorted({str(r.get("routeNumber") or "") for r in p_rows + t_rows if r.get("routeNumber")}),
            "plannerEligible": False,
        })
    counts = dict(sorted(Counter(row["category"] for row in rows).items()))
    body = {"schema": SCHEMA, "asOf": day.isoformat(), "tndsStatus": tnds_status,
            "regionalCoverage": region_state, "plannerOutputChanged": False,
            "sourceAuthorityChanged": False, "rows": rows, "categoryCounts": counts,
            "excluded": dict(sorted(excluded.items()))}
    stable = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    body["ledgerSha256"] = hashlib.sha256(stable).hexdigest()
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="JSON with primary/tnds arrays and asOf")
    parser.add_argument("--output", required=True)
    parser.add_argument("--status", default="BLOCKED_CREDENTIALS")
    args = parser.parse_args()
    document = json.loads(Path(args.input).read_text(encoding="utf-8"))
    result = reconcile(document.get("primary", []), document.get("tnds", []),
                       as_of=document["asOf"], tnds_status=args.status,
                       regions=document.get("regions", []))
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"schema": result["schema"], "state": result["regionalCoverage"]["state"],
                      "rows": len(result["rows"]), "ledgerSha256": result["ledgerSha256"]}, sort_keys=True))


if __name__ == "__main__":
    main()
