"""Bounded, diagnostic-only cross-source service-pattern identity discovery.

This module reads the frozen Run #45 checkpoint ZIPs without materializing
their national JSONL evidence in memory. It never modifies checkpoint files or
production reconciliation behavior.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sqlite3
import tempfile
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Iterator

from reconciliation_checkpoint import canonical_bytes

REPOSITORY = "joerfreeman02/transport-planner-toolkit"
PRIMARY_ARCHIVE_SHA256 = "e135d52abfb36eba1341ac814aa3e0d5e81e568edb2c8de2f6afea31a11a482b"
TNDS_ARCHIVE_SHA256 = "ddfa7dee4b2a41cccc49e9b8f77bb68069e8aef7138c8ad322bbb484a0e293bc"
PRIMARY_ARTIFACT = {
    "side": "PRIMARY", "sourceProducerRunId": "38533475680",
    "sourceArtifactName": "atlas-reference-source-snapshot-38533475680",
    "sourceArtifactId": "11878857366", "sourceArtifactDigest": "sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658",
    "sourceSnapshotId": "13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1",
    "checkpointProducerRunId": "38731043427", "checkpointProducerCommit": "a2b6251f78a531f284b1b9467aaa04c89e04c22f",
    "checkpointBranch": "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-c1-c1-branch-dispatch-closeout",
    "aggregateProjectionSha256": "4b0f319cbac4b328914a8deedcb69780a20773ded9d93d03388e473715bb20fc",
}
TNDS_ARTIFACT = {
    "side": "TNDS", "sourceProducerRunId": "38579244547",
    "sourceArtifactName": "atlas-tnds-quarantined-38579244547",
    "sourceArtifactId": "11903662011", "sourceArtifactDigest": "sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e",
    "sourceSnapshotId": "76ee662a30e5bcb0072c93f4dd3a8efe85c41446ca318a1d6f5700070f5bf058",
    "checkpointProducerRunId": "38731043427", "checkpointProducerCommit": "a2b6251f78a531f284b1b9467aaa04c89e04c22f",
    "checkpointBranch": "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-c1-c1-branch-dispatch-closeout",
    "aggregateProjectionSha256": "d6ab86d9873e08c064c2fe0847c841a872d1c3dd6a1ed3ba1d9fd46e2f8edc0c",
}
RUN46_SHA256 = "c61086e2fd278b13e0012ec21a4afb8c3b9ccf9d4475e67cec6473921fcfc301"
REGIONS = ("EA", "EM", "NE", "NW", "SE", "SW", "WM", "Y", "LONDON")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalize_scalar(value: Any) -> str:
    """Normalize descriptive/key scalars without removing meaningful punctuation."""
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).split()).casefold()


def normalize_native_id(value: Any) -> str:
    """Mirror the comparator's exact service-ID normalization; no aliasing."""
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value or ""))).casefold()


def normalize_stop(value: Any) -> str:
    """Match the existing exact StopPoint normalization (remove whitespace, uppercase)."""
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value or ""))).upper()


def ordered_pattern(value: Any) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)):
        return ()
    return tuple(normalize_stop(item) for item in value)


def pattern_is_clean(sequence: tuple[str, ...]) -> bool:
    return bool(sequence) and all(item and not item.casefold().startswith("gtfs:") for item in sequence)


def pattern_has_gtfs_token(sequence: tuple[str, ...]) -> bool:
    return any(item.casefold().startswith("gtfs:") for item in sequence)


def pattern_key(region: str, route_number: Any, sequence: Any) -> str | None:
    route = normalize_scalar(route_number)
    stops = ordered_pattern(sequence)
    if not route or not stops or any(not stop for stop in stops):
        return None
    return json.dumps([str(region).upper(), route, stops], ensure_ascii=False, separators=(",", ":"))


def service_values(row: dict[str, Any]) -> dict[str, Any]:
    native = row.get("nativeIds") if isinstance(row.get("nativeIds"), dict) else {}
    route = row.get("routeNumber")
    sequence = ordered_pattern(row.get("stopSequence"))
    region = str(row.get("region") or "").upper()
    return {
        "region": region,
        "prepared_id": str(native.get("preparedServiceId") or ""),
        "source_id": normalize_native_id(native.get("sourceServiceId")),
        "source_id_raw": str(native.get("sourceServiceId") or ""),
        "source_archive": str(native.get("sourceArchive") or ""),
        "route": str(route or ""),
        "route_norm": normalize_scalar(route),
        "sequence": json.dumps(sequence, ensure_ascii=False, separators=(",", ":")),
        "pattern_key": pattern_key(region, route, row.get("stopSequence")),
        "clean": int(pattern_is_clean(sequence)),
        "has_gtfs": int(pattern_has_gtfs_token(sequence)),
        "operator": str(row.get("operator") or ""),
        "operator_norm": normalize_scalar(row.get("operator")),
        "origin": str(row.get("origin") or ""),
        "origin_norm": normalize_scalar(row.get("origin")),
        "destination": str(row.get("destination") or ""),
        "destination_norm": normalize_scalar(row.get("destination")),
        "operating_days": json.dumps(sorted(normalize_scalar(x) for x in (row.get("operatingDays") or [])), separators=(",", ":")),
        "valid_from": str(row.get("validFrom") or ""),
        "valid_to": str(row.get("validTo") or ""),
    }


SERVICE_COLUMNS = ("region", "prepared_id", "source_id", "source_id_raw", "source_archive", "route", "route_norm",
                   "sequence", "pattern_key", "clean", "has_gtfs", "operator", "operator_norm", "origin", "origin_norm",
                   "destination", "destination_norm", "operating_days", "valid_from", "valid_to")


def create_schema(db: sqlite3.Connection) -> None:
    db.executescript("""
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        PRAGMA temp_store=FILE;
        CREATE TABLE service (
          side TEXT NOT NULL, region TEXT NOT NULL, prepared_id TEXT NOT NULL,
          source_id TEXT, source_id_raw TEXT, source_archive TEXT, route TEXT, route_norm TEXT,
          sequence TEXT, pattern_key TEXT, clean INTEGER, operator TEXT, operator_norm TEXT,
          has_gtfs INTEGER,
          origin TEXT, origin_norm TEXT, destination TEXT, destination_norm TEXT,
          operating_days TEXT, valid_from TEXT, valid_to TEXT,
          evidence_rows INTEGER NOT NULL DEFAULT 1, consistency_conflicts INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(side,region,prepared_id)
        );
    """)


def finalize_schema(db: sqlite3.Connection) -> None:
    """Create read indexes after the national ingest to keep writes bounded."""
    db.executescript("""
        CREATE INDEX IF NOT EXISTS service_pattern ON service(side,pattern_key,clean);
        CREATE INDEX IF NOT EXISTS service_source_id ON service(side,region,source_id);
        CREATE INDEX IF NOT EXISTS service_route_sequence ON service(side,region,route_norm,sequence);
        CREATE INDEX IF NOT EXISTS service_composite_no_route ON service(side,region,sequence,operator_norm,origin_norm,destination_norm,clean);
    """)


def ingest_rows(db: sqlite3.Connection, side: str, rows: Iterable[dict[str, Any]]) -> dict[str, int]:
    """Deduplicate repeated stop evidence into disk-backed prepared-service records."""
    side = side.upper()
    if side not in {"PRIMARY", "TNDS"}:
        raise ValueError(f"Unsupported source side: {side}")
    names = ",".join(SERVICE_COLUMNS)
    placeholders = ",".join("?" for _ in SERVICE_COLUMNS)
    changed = " OR ".join(f"service.{name} IS NOT excluded.{name}" for name in SERVICE_COLUMNS[2:])
    insert = f"""INSERT INTO service(side,{names}) VALUES(?,{placeholders})
      ON CONFLICT(side,region,prepared_id) DO UPDATE SET
        evidence_rows=service.evidence_rows+1,
        consistency_conflicts=service.consistency_conflicts + CASE WHEN {changed} THEN 1 ELSE 0 END"""
    before_conflicts = db.execute("SELECT COALESCE(SUM(consistency_conflicts),0) FROM service WHERE side=?", (side,)).fetchone()[0]
    total = 0
    service_batch = []
    for row in rows:
        values = service_values(row)
        if not values["region"] or not values["prepared_id"]:
            raise ValueError("Projected checkpoint row lacks canonical region or preparedServiceId")
        service_batch.append((side, *(values[name] for name in SERVICE_COLUMNS)))
        total += 1
        if total % 10000 == 0:
            db.executemany(insert, service_batch)
            service_batch.clear()
            db.commit()
    if service_batch:
        db.executemany(insert, service_batch)
    db.commit()
    after_conflicts = db.execute("SELECT COALESCE(SUM(consistency_conflicts),0) FROM service WHERE side=?", (side,)).fetchone()[0]
    return {"evidenceRows": total, "conflictingRepeatedRows": after_conflicts - before_conflicts}


def _zip_manifest(zf: zipfile.ZipFile) -> dict[str, Any]:
    names = set(zf.namelist())
    if "manifest.json" not in names or "projection-metadata.json" not in names:
        raise ValueError("Checkpoint ZIP lacks manifest.json or projection-metadata.json")
    return json.load(zf.open("manifest.json"))


def verify_archive(path: Path, expected_digest: str, expected_provenance: dict[str, str]) -> dict[str, Any]:
    actual = sha256_file(path)
    if actual != expected_digest:
        raise ValueError(f"Checkpoint ZIP digest mismatch: expected {expected_digest}, got {actual}")
    with zipfile.ZipFile(path) as zf:
        manifest = _zip_manifest(zf)
        for key, expected in expected_provenance.items():
            if manifest.get(key) != expected:
                raise ValueError(f"Checkpoint provenance mismatch for {key}: {manifest.get(key)!r}")
        if manifest.get("repository") != REPOSITORY:
            raise ValueError("Checkpoint repository does not match governed repository")
        if manifest.get("projectionCompatibilityFingerprint") != "74a75bdb3da404f401521e21bafd430aafb7076e21186e634e615e7878404a66":
            raise ValueError("Unexpected projection compatibility fingerprint")
        if manifest.get("schema") != "atlas-bus-reconciliation-stream-checkpoint-v3":
            raise ValueError("Unsupported checkpoint schema")
        if manifest.get("currentFreshnessClaimed") is not False or manifest.get("diagnosticOnly") is not True or manifest.get("plannerEligible") is not False:
            raise ValueError("Checkpoint diagnostic-only flags are invalid")
        records = manifest.get("shards", [])
        if manifest.get("shardCount") != len(records):
            raise ValueError("Checkpoint shard inventory count is inconsistent")
        names = set(zf.namelist())
        for item in records:
            member = item.get("path")
            if member not in names:
                raise ValueError(f"Checkpoint is missing listed projection shard {member}")
            digest = hashlib.sha256()
            with zf.open(member) as raw:
                for block in iter(lambda: raw.read(8 * 1024 * 1024), b""):
                    digest.update(block)
            if digest.hexdigest() != item.get("sha256"):
                raise ValueError(f"Checkpoint projection shard digest mismatch: {member}")
        if hashlib.sha256(canonical_bytes(records)).hexdigest() != manifest.get("aggregateProjectionSha256"):
            raise ValueError("Checkpoint aggregate projection digest mismatch")
        metadata = zf.read("projection-metadata.json")
        if hashlib.sha256(metadata).hexdigest() != manifest.get("projectionMetadataSha256"):
            raise ValueError("Checkpoint projection metadata digest mismatch")
    return {"zipSha256": actual, "side": manifest["side"], "evidenceRows": manifest.get("evidenceRowCount"),
            "shardCount": manifest.get("shardCount"), "serviceCount": manifest.get("serviceCount"),
            "sourceSnapshotId": manifest["sourceSnapshotId"], "manifest": manifest}


def iter_archive_rows(path: Path, manifest: dict[str, Any]) -> Iterator[dict[str, Any]]:
    with zipfile.ZipFile(path) as zf:
        for shard in manifest["shards"]:
            with zf.open(shard["path"]) as raw, gzip.GzipFile(fileobj=raw, mode="rb") as stream:
                count = 0
                for line in stream:
                    if line.strip():
                        count += 1
                        yield json.loads(line)
                if count != shard.get("rowCount"):
                    raise ValueError(f"Checkpoint shard row count mismatch: {shard['path']}")


def summarize_side(db: sqlite3.Connection, side: str) -> dict[str, Any]:
    total = db.execute("SELECT COUNT(*) FROM service WHERE side=?", (side,)).fetchone()[0]
    evrows = db.execute("SELECT COALESCE(SUM(evidence_rows),0) FROM service WHERE side=?", (side,)).fetchone()[0]
    clean = db.execute("SELECT COUNT(*) FROM service WHERE side=? AND clean=1 AND pattern_key IS NOT NULL", (side,)).fetchone()[0]
    route = db.execute("SELECT COUNT(*) FROM service WHERE side=? AND route_norm<>''", (side,)).fetchone()[0]
    seq = db.execute("SELECT COUNT(*) FROM service WHERE side=? AND sequence<>'[]'", (side,)).fetchone()[0]
    both = db.execute("SELECT COUNT(*) FROM service WHERE side=? AND pattern_key IS NOT NULL", (side,)).fetchone()[0]
    conflict = db.execute("SELECT COUNT(*) FROM service WHERE side=? AND consistency_conflicts>0", (side,)).fetchone()[0]
    unresolved = db.execute("SELECT COUNT(*) FROM service WHERE side=? AND has_gtfs=1", (side,)).fetchone()[0]
    incomplete = db.execute("""SELECT COUNT(*) FROM service s WHERE side=? AND sequence<>'[]' AND
        EXISTS(SELECT 1 FROM json_each(s.sequence) j WHERE j.value='')""", (side,)).fetchone()[0]
    unresolved_keys = db.execute("""SELECT COUNT(*) FROM (SELECT region,route_norm,sequence FROM service
        WHERE side=? AND route_norm<>'' AND sequence<>'[]' AND clean=0 GROUP BY region,route_norm,sequence)""", (side,)).fetchone()[0]
    by_region = {}
    for region, count, rows, bcount in db.execute("""SELECT region,COUNT(*),SUM(evidence_rows),
        SUM(CASE WHEN pattern_key IS NOT NULL THEN 1 ELSE 0 END) FROM service WHERE side=? GROUP BY region ORDER BY region""", (side,)):
        by_region[region] = {"services": count, "evidenceRows": rows, "routePatternComplete": bcount}
    duplicates = db.execute("""SELECT COUNT(*) FROM (SELECT pattern_key FROM service
        WHERE side=? AND pattern_key IS NOT NULL GROUP BY pattern_key HAVING COUNT(*)>1)""", (side,)).fetchone()[0]
    shared = db.execute("""SELECT COALESCE(SUM(n),0) FROM (SELECT COUNT(*) n FROM service
        WHERE side=? AND pattern_key IS NOT NULL GROUP BY pattern_key HAVING COUNT(*)>1)""", (side,)).fetchone()[0]
    return {"services": total, "evidenceRows": evrows, "servicesWithRouteNumber": route,
            "servicesWithOrderedSequence": seq, "servicesWithRouteAndSequence": both,
            "completeNaPTANStopPointPatterns": clean, "servicesWithGtfsPatternTokens": unresolved,
            "servicesWithIncompleteStopSequence": incomplete,
            "unresolvedNonCleanPatternKeys": unresolved_keys,
            "duplicatePatternKeys": duplicates, "servicesSharingPatternKeys": shared,
            "servicesWithRepeatedEvidenceInconsistency": conflict, "byRegion": by_region}


def bridge_summary(db: sqlite3.Connection) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for label, predicate, keyexpr in (
        ("routeExactPattern", "pattern_key IS NOT NULL AND clean=1", "pattern_key"),
        ("identicalGtfsTokenPatternOnly", "pattern_key IS NOT NULL AND clean=0 AND upper(sequence) LIKE '%GTFS:%'", "pattern_key"),
        ("directNativeId", "source_id IS NOT NULL AND source_id<>''", "json_array(region,source_id)"),
        ("routePatternOperator", "pattern_key IS NOT NULL AND clean=1 AND operator_norm<>''", "json_array(pattern_key,operator_norm)"),
        ("currentCompositeWithoutRoute", "sequence<>'[]' AND clean=1 AND operator_norm<>'' AND origin_norm<>'' AND destination_norm<>''", "json_array(region,sequence,operator_norm,origin_norm,destination_norm)"),
    ):
        # The input predicate and key are fixed literals above, never caller-provided SQL.
        grouped = f"SELECT {keyexpr} bridge_key,SUM(side='PRIMARY') p,SUM(side='TNDS') t FROM service WHERE region<>'LONDON' AND ({predicate}) GROUP BY bridge_key"
        multiplicities = db.execute(f"SELECT p,t,COUNT(*) FROM ({grouped}) WHERE p>0 AND t>0 GROUP BY p,t ORDER BY p,t").fetchall()
        bins = Counter()
        for primary_count, tnds_count, key_count in multiplicities:
            bins[("one" if primary_count == 1 else "many", "one" if tnds_count == 1 else "many")] += key_count
        keys_primary_only = db.execute(f"SELECT COUNT(*) FROM ({grouped}) WHERE p>0 AND t=0").fetchone()[0]
        keys_tnds_only = db.execute(f"SELECT COUNT(*) FROM ({grouped}) WHERE p=0 AND t>0").fetchone()[0]
        shared = sum(bins.values())
        ambiguous_keys = sum(n for (p, t), n in bins.items() if p == "many" or t == "many")
        ptotal = db.execute("SELECT COUNT(*) FROM service WHERE side='PRIMARY' AND region<>'LONDON'").fetchone()[0]
        ttotal = db.execute("SELECT COUNT(*) FROM service WHERE side='TNDS' AND region<>'LONDON'").fetchone()[0]
        ptotal_rows = db.execute("SELECT SUM(evidence_rows) FROM service WHERE side='PRIMARY' AND region<>'LONDON'").fetchone()[0] or 0
        ttotal_rows = db.execute("SELECT SUM(evidence_rows) FROM service WHERE side='TNDS' AND region<>'LONDON'").fetchone()[0] or 0
        # Service and evidence coverage are computed by exact SQL semijoins.
        if label == "directNativeId":
            match_sql = "EXISTS (SELECT 1 FROM service t WHERE t.side='TNDS' AND t.region=p.region AND t.source_id=p.source_id AND t.source_id<>'')"
            reverse_sql = "EXISTS (SELECT 1 FROM service p WHERE p.side='PRIMARY' AND p.region=t.region AND p.source_id=t.source_id AND t.source_id<>'')"
        elif label == "routePatternOperator":
            match_sql = "EXISTS (SELECT 1 FROM service t WHERE t.side='TNDS' AND t.pattern_key=p.pattern_key AND t.operator_norm=p.operator_norm AND p.operator_norm<>'' AND p.clean=1 AND t.clean=1)"
            reverse_sql = "EXISTS (SELECT 1 FROM service p WHERE p.side='PRIMARY' AND p.pattern_key=t.pattern_key AND p.operator_norm=t.operator_norm AND t.operator_norm<>'' AND p.clean=1 AND t.clean=1)"
        elif label == "currentCompositeWithoutRoute":
            match_sql = "EXISTS (SELECT 1 FROM service t WHERE t.side='TNDS' AND t.region=p.region AND t.sequence=p.sequence AND t.operator_norm=p.operator_norm AND t.origin_norm=p.origin_norm AND t.destination_norm=p.destination_norm AND p.operator_norm<>'' AND p.origin_norm<>'' AND p.destination_norm<>'' AND p.clean=1 AND t.clean=1)"
            reverse_sql = "EXISTS (SELECT 1 FROM service p WHERE p.side='PRIMARY' AND p.region=t.region AND p.sequence=t.sequence AND p.operator_norm=t.operator_norm AND p.origin_norm=t.origin_norm AND p.destination_norm=t.destination_norm AND t.operator_norm<>'' AND t.origin_norm<>'' AND t.destination_norm<>'' AND p.clean=1 AND t.clean=1)"
        elif label == "identicalGtfsTokenPatternOnly":
            match_sql = "EXISTS (SELECT 1 FROM service t WHERE t.side='TNDS' AND t.pattern_key=p.pattern_key AND p.clean=0 AND t.clean=0 AND upper(p.sequence) LIKE '%GTFS:%' AND upper(t.sequence) LIKE '%GTFS:%')"
            reverse_sql = "EXISTS (SELECT 1 FROM service p WHERE p.side='PRIMARY' AND p.pattern_key=t.pattern_key AND p.clean=0 AND t.clean=0 AND upper(p.sequence) LIKE '%GTFS:%' AND upper(t.sequence) LIKE '%GTFS:%')"
        else:
            match_sql = "EXISTS (SELECT 1 FROM service t WHERE t.side='TNDS' AND t.pattern_key=p.pattern_key AND p.clean=1 AND t.clean=1)"
            reverse_sql = "EXISTS (SELECT 1 FROM service p WHERE p.side='PRIMARY' AND p.pattern_key=t.pattern_key AND p.clean=1 AND t.clean=1)"
        pcover, prows = db.execute(f"SELECT COUNT(*),COALESCE(SUM(evidence_rows),0) FROM service p WHERE side='PRIMARY' AND region<>'LONDON' AND {match_sql}").fetchone()
        tcover, trows = db.execute(f"SELECT COUNT(*),COALESCE(SUM(evidence_rows),0) FROM service t WHERE side='TNDS' AND region<>'LONDON' AND {reverse_sql}").fetchone()
        by_region = {}
        for region in REGIONS:
            if region == "LONDON":
                continue
            pt, pr = db.execute("SELECT COUNT(*),COALESCE(SUM(evidence_rows),0) FROM service WHERE side='PRIMARY' AND region=?", (region,)).fetchone()
            tt, tr = db.execute("SELECT COUNT(*),COALESCE(SUM(evidence_rows),0) FROM service WHERE side='TNDS' AND region=?", (region,)).fetchone()
            pc, pcr = db.execute(f"SELECT COUNT(*),COALESCE(SUM(evidence_rows),0) FROM service p WHERE side='PRIMARY' AND region=? AND {match_sql}", (region,)).fetchone()
            tc, tcr = db.execute(f"SELECT COUNT(*),COALESCE(SUM(evidence_rows),0) FROM service t WHERE side='TNDS' AND region=? AND {reverse_sql}", (region,)).fetchone()
            by_region[region] = {"primaryServices": pt, "primaryServicesCovered": pc,
                                 "primaryEvidenceRows": pr, "primaryEvidenceRowsCovered": pcr,
                                 "tndsServices": tt, "tndsServicesCovered": tc,
                                 "tndsEvidenceRows": tr, "tndsEvidenceRowsCovered": tcr}
        unresolved_bridge_keys = (db.execute("""SELECT COUNT(*) FROM (SELECT region,route_norm,sequence FROM service
            WHERE region<>'LONDON' AND route_norm<>'' AND sequence<>'[]' AND clean=0
            GROUP BY region,route_norm,sequence)""").fetchone()[0] if label == "routeExactPattern" else None)
        out[label] = {
            "keysPrimaryOnly": keys_primary_only,
            "keysTndsOnly": keys_tnds_only,
            "keysPresentBoth": shared,
            "multiplicityKeys": {f"{p}:{t}": n for (p, t), n in sorted(bins.items())},
            "collisionOrMultiplicityKeys": ambiguous_keys,
            "collisionOrMultiplicityRatePercent": round(100*ambiguous_keys/shared, 6) if shared else 0,
            "unresolvedKeyCount": unresolved_bridge_keys,
            "coverageByRegion": by_region,
            "primaryServicesCovered": pcover, "primaryCoveragePercent": round(100*pcover/ptotal, 6) if ptotal else 0,
            "tndsServicesCovered": tcover, "tndsCoveragePercent": round(100*tcover/ttotal, 6) if ttotal else 0,
            "primaryEvidenceRowsCovered": prows, "primaryEvidenceRowCoveragePercent": round(100*prows/ptotal_rows, 6) if ptotal_rows else 0,
            "tndsEvidenceRowsCovered": trows, "tndsEvidenceRowCoveragePercent": round(100*trows/ttotal_rows, 6) if ttotal_rows else 0,
        }
        if label == "identicalGtfsTokenPatternOnly":
            out[label]["interpretation"] = "Exact raw GTFS token equality is separately counted and is never accepted as source-neutral StopPoint identity."
    return out


def semantic_and_multiplicity(db: sqlite3.Connection) -> dict[str, Any]:
    join = """FROM service p JOIN service t ON t.pattern_key=p.pattern_key
        WHERE p.side='PRIMARY' AND t.side='TNDS' AND p.clean=1 AND t.clean=1
          AND p.pattern_key IS NOT NULL AND p.region<>'LONDON' AND t.region<>'LONDON'"""
    pairs = db.execute("SELECT COUNT(*) " + join).fetchone()[0]
    differences = {}
    for field, expr in (
        ("operator", "p.operator_norm<>t.operator_norm"),
        ("origin", "p.origin_norm<>t.origin_norm"),
        ("destination", "p.destination_norm<>t.destination_norm"),
        ("operatingDays", "p.operating_days<>t.operating_days"),
        ("validityPeriod", "p.valid_from<>t.valid_from OR p.valid_to<>t.valid_to"),
    ):
        differences[field] = db.execute(f"SELECT COALESCE(SUM(CASE WHEN {expr} THEN 1 ELSE 0 END),0) " + join).fetchone()[0]
    different_any = db.execute("SELECT COUNT(*) " + join + " AND (p.operator_norm<>t.operator_norm OR p.origin_norm<>t.origin_norm OR p.destination_norm<>t.destination_norm)").fetchone()[0]
    samples = []
    cur = db.execute("""SELECT p.region,p.route,p.prepared_id,p.source_id_raw,p.operator,p.origin,p.destination,
        p.operating_days,p.valid_from,p.valid_to,t.prepared_id,t.source_id_raw,t.operator,t.origin,t.destination,
        t.operating_days,t.valid_from,t.valid_to,p.pattern_key """ + join + " AND (p.operator_norm<>t.operator_norm OR p.origin_norm<>t.origin_norm OR p.destination_norm<>t.destination_norm OR p.operating_days<>t.operating_days OR p.valid_from<>t.valid_from OR p.valid_to<>t.valid_to) ORDER BY p.region,p.route_norm,p.pattern_key,p.prepared_id,t.prepared_id LIMIT 25")
    for r in cur:
        samples.append({"region":r[0],"routeNumber":r[1],"primaryPreparedServiceId":r[2],"primarySourceServiceId":r[3],
            "primaryOperator":r[4],"primaryOrigin":r[5],"primaryDestination":r[6],"primaryOperatingDays":json.loads(r[7]),
            "primaryValidity":[r[8],r[9]],"tndsPreparedServiceId":r[10],"tndsSourceServiceId":r[11],
            "tndsOperator":r[12],"tndsOrigin":r[13],"tndsDestination":r[14],"tndsOperatingDays":json.loads(r[15]),
            "tndsValidity":[r[16],r[17]],"routePatternKey":r[18]})
    split = {}
    for field, expression in (
        ("operatingDays", "COUNT(DISTINCT operating_days)>1"),
        ("sourceServiceId", "COUNT(DISTINCT source_id)>1"),
        ("validityPeriod", "COUNT(DISTINCT valid_from||'/'||valid_to)>1"),
        ("operator", "COUNT(DISTINCT operator_norm)>1"),
        ("sourceArchive", "COUNT(DISTINCT source_archive)>1"),
        ("preparedServiceIdentity", "COUNT(DISTINCT prepared_id)>1"),
    ):
        split[field] = db.execute(f"""SELECT COUNT(*) FROM (SELECT t.pattern_key FROM service t
            WHERE t.side='TNDS' AND t.clean=1 AND t.pattern_key IS NOT NULL AND t.region<>'LONDON'
              AND EXISTS(SELECT 1 FROM service p WHERE p.side='PRIMARY' AND p.clean=1 AND p.pattern_key=t.pattern_key)
            GROUP BY t.pattern_key HAVING {expression})""").fetchone()[0]
    route_false_candidates = db.execute("""SELECT COUNT(*) FROM service p JOIN service t
        ON t.side='TNDS' AND t.region=p.region AND t.sequence=p.sequence AND t.operator_norm=p.operator_norm
        AND t.origin_norm=p.origin_norm AND t.destination_norm=p.destination_norm
        WHERE p.side='PRIMARY' AND p.region<>'LONDON' AND t.region<>'LONDON'
        AND p.sequence<>'[]' AND p.operator_norm<>'' AND p.origin_norm<>'' AND p.destination_norm<>''
        AND p.clean=1 AND t.clean=1 AND p.route_norm<>t.route_norm""").fetchone()[0]
    return {"exactPatternServicePairs": pairs,
            "semanticDifferencePairCounts": differences,
            "pairsWithOperatorOrEndpointDifference": different_any,
            "boundedAttributeDifferenceSamples": samples,
            "sharedKeysWithTndsVariants": split,
            "routeOmittedCompositePairsWithDifferentRouteNumber": route_false_candidates}


def control_analysis(db: sqlite3.Connection, run46_zip: Path, primary_zip: Path) -> dict[str, Any]:
    """Measure bounded local controls using only their explicit eligible call stops."""
    with zipfile.ZipFile(run46_zip) as zf:
        pipers = json.load(zf.open("pipers-lane-control.json"))
        pe1 = json.load(zf.open("peterborough-queensgate-control.json"))
        unresolved_summary = json.load(zf.open("unresolved-primary-summary.json"))
    db.execute("CREATE TEMP TABLE control_service (site TEXT, side TEXT, region TEXT, prepared_id TEXT, pattern_key TEXT, clean INTEGER, PRIMARY KEY(site,side,region,prepared_id))")
    site_stops = {
        "PIPERS": ("SE", pipers.get("callEligibleStopIds", [])),
        "PE1": ("EM", pe1.get("callEligibleStopIds", [])),
    }
    site_stop_sets = {}
    for site, (region, stop_ids) in site_stops.items():
        eligible = sorted({normalize_stop(x) for x in stop_ids
                           if normalize_stop(x) and not normalize_stop(x).startswith("0590BCE")})
        site_stop_sets[region] = (site, set(eligible))
    print("Matching exact Pipers Lane and Queensgate service calls…", flush=True)
    for side in ("PRIMARY", "TNDS"):
        print(f"Staging {side} control calls…", flush=True)
        batch = []
        cursor = db.execute("""SELECT region,prepared_id,pattern_key,clean,sequence FROM service
            WHERE side=? AND region IN ('SE','EM') ORDER BY region,prepared_id""", (side,))
        for region, prepared_id, pkey, clean, sequence in cursor:
            site, eligible = site_stop_sets[region]
            if any(stop in eligible for stop in json.loads(sequence)):
                batch.append((site, side, region, prepared_id, pkey, clean))
            if len(batch) >= 5000:
                db.executemany("INSERT OR IGNORE INTO control_service VALUES(?,?,?,?,?,?)", batch)
                batch.clear()
        if batch:
            db.executemany("INSERT OR IGNORE INTO control_service VALUES(?,?,?,?,?,?)", batch)
        db.commit()
    db.commit()
    def select_site(site: str, region: str, stop_ids: list[str]) -> dict[str, Any]:
        ids = sorted({normalize_stop(x) for x in stop_ids if normalize_stop(x) and not normalize_stop(x).startswith("0590BCE")})
        totals = {}
        for side in ("PRIMARY", "TNDS"):
            total, complete, evidence_rows = db.execute("""SELECT COUNT(*),SUM(CASE WHEN s.pattern_key IS NOT NULL THEN 1 ELSE 0 END),
                COALESCE(SUM(s.evidence_rows),0) FROM service s JOIN control_service c
                ON c.site=? AND c.side=s.side AND c.region=s.region AND c.prepared_id=s.prepared_id
                WHERE s.side=?""", (site, side)).fetchone()
            patterns = db.execute("""SELECT COUNT(DISTINCT pattern_key) FROM control_service
                WHERE site=? AND side=? AND pattern_key IS NOT NULL AND clean=1""", (site, side)).fetchone()[0]
            totals[side] = {"services": total, "completePatterns": patterns, "evidenceRows": evidence_rows}
        shared = db.execute("""SELECT COUNT(*) FROM (SELECT pattern_key FROM control_service
            WHERE site=? AND side IN ('PRIMARY','TNDS') AND clean=1 AND pattern_key IS NOT NULL
            GROUP BY pattern_key HAVING COUNT(DISTINCT side)=2)""", (site,)).fetchone()[0]
        p_cov = db.execute("""SELECT COUNT(DISTINCT prepared_id) FROM control_service p WHERE site=? AND side='PRIMARY'
            AND clean=1 AND pattern_key IN (SELECT pattern_key FROM control_service t WHERE t.site=? AND t.side='TNDS' AND t.clean=1)""", (site,site)).fetchone()[0]
        t_cov = db.execute("""SELECT COUNT(DISTINCT prepared_id) FROM control_service t WHERE site=? AND side='TNDS'
            AND clean=1 AND pattern_key IN (SELECT pattern_key FROM control_service p WHERE p.site=? AND p.side='PRIMARY' AND p.clean=1)""", (site,site)).fetchone()[0]
        bins = dict(db.execute("""SELECT CAST(pn AS TEXT)||':'||CAST(tn AS TEXT),COUNT(*) FROM (
            SELECT pattern_key,SUM(side='PRIMARY') pn,SUM(side='TNDS') tn FROM control_service
            WHERE site=? AND clean=1 AND pattern_key IS NOT NULL GROUP BY pattern_key HAVING pn>0 AND tn>0)
            GROUP BY pn,tn""", (site,)).fetchall())
        unresolved = db.execute("SELECT COUNT(*) FROM control_service WHERE site=? AND side IN ('PRIMARY','TNDS') AND clean=0", (site,)).fetchone()[0]
        return {"eligibleCallStopCount": len(ids), "services": totals,
                "bridgePatternKeys": shared, "primaryServicesBridged": p_cov,
                "tndsServicesBridged": t_cov, "bridgeMultiplicity": bins,
                "nonCleanServices": unresolved}

    pipers_result = select_site("PIPERS", "SE", pipers.get("callEligibleStopIds", []))
    route_details = {}
    for route in ("46", "230", "231", "c"):
        details = {}
        for side in ("PRIMARY", "TNDS"):
            records = []
            cursor = db.execute("""SELECT s.region,s.prepared_id,s.source_id_raw,s.source_archive,s.route,
                s.sequence,s.operator,s.origin,s.destination,s.operating_days,s.valid_from,s.valid_to,
                s.evidence_rows,s.clean,s.pattern_key,
                s.evidence_rows
                FROM service s JOIN control_service pc ON pc.site='PIPERS' AND pc.side=s.side
                  AND pc.region=s.region AND pc.prepared_id=s.prepared_id
                WHERE s.side=? AND s.route_norm=? AND s.region='SE' ORDER BY s.prepared_id""", (side,route))
            for rec in cursor:
                (region,pid,sid,archive,rnum,sequence,operator,origin,dest,days,vfrom,vto,rows,clean,pkey,stops)=rec
                matched = bool(pkey and clean and db.execute("SELECT 1 FROM service WHERE side=? AND region=? AND pattern_key=? AND clean=1 LIMIT 1", ("TNDS" if side=="PRIMARY" else "PRIMARY",region,pkey)).fetchone())
                records.append({"region":region,"preparedServiceId":pid,"sourceServiceId":sid,"sourceArchive":archive,
                    "routeNumber":rnum,"stopSequence":json.loads(sequence),"operator":operator,"origin":origin,
                    "destination":dest,"operatingDays":json.loads(days),"validFrom":vfrom,"validTo":vto,
                    "evidenceRows":rows,"distinctEvidenceStops":stops,"patternClean":bool(clean),"routePatternBridge":matched})
            details[side]=records
        route_details[route.upper()] = details
    route_details["PE1"] = select_site("PE1", "EM", pe1.get("callEligibleStopIds", []))
    # Exclude the four known boarding/alighting entrances even if malformed control data lists them.
    bce = {"0590BCE01L", "0590BCE02L", "0590BCE03U", "0590BCE04U"}
    if bce.intersection(normalize_stop(x) for x in pe1.get("callEligibleStopIds", [])):
        raise ValueError("Queensgate call-eligible stop inventory incorrectly includes BCE infrastructure")
    unresolved = {key: unresolved_summary.get(key) for key in (
        "unresolvedScheduledCallCount", "uniqueRawGtfsStopIdCount", "uniqueRegionScopedStopIdentityKeyCount",
        "tndsComparatorScopeUniqueRegionScopedKeyCount", "tndsComparatorScopeKeysReferencedByTndsCount",
        "tndsComparatorScopeKeysAbsentFromTndsCount", "exactRegionScopedTndsStopReferenceCount",
        "exactRegionScopedTndsStopReferenceUniqueIdentityCount", "exactServiceIdentityCorroborationCount",
        "londonOutsideTndsComparatorScopeUnresolvedCallCount")}
    unresolved["projectedServicesWithGtfsPatternTokens"] = db.execute("SELECT COUNT(*) FROM service WHERE side='PRIMARY' AND has_gtfs=1").fetchone()[0]
    unresolved["projectedServicesWithIncompleteStopSequence"] = db.execute("""SELECT COUNT(*) FROM service s
        WHERE side='PRIMARY' AND sequence<>'[]' AND EXISTS(SELECT 1 FROM json_each(s.sequence) j WHERE j.value='')""").fetchone()[0]
    with zipfile.ZipFile(primary_zip) as zf:
        metadata = json.load(zf.open("projection-metadata.json"))
    unresolved_rows = metadata.get("unresolvedPrimaryIdentityRecords", [])
    unresolved_stops_by_route: dict[tuple[str,str], set[str]] = {}
    for item in unresolved_rows:
        region = str(item.get("region") or "").upper()
        route = normalize_scalar(item.get("routeNumber"))
        stop = normalize_stop(item.get("gtfsStopId"))
        if region and region != "LONDON" and route and stop:
            unresolved_stops_by_route.setdefault((region, route), set()).add(stop)
    matched_raw_stop_keys: set[tuple[str,str]] = set()
    matched_tnds_services: set[tuple[str,str]] = set()
    matched_raw_stop_references = 0
    for (region, route), raw_stops in sorted(unresolved_stops_by_route.items()):
        for prepared_id, sequence_json in db.execute("""SELECT prepared_id,sequence FROM service
            WHERE side='TNDS' AND region=? AND route_norm=?""", (region,route)):
            for stop in json.loads(sequence_json):
                if stop in raw_stops:
                    matched_raw_stop_keys.add((region, stop))
                    matched_tnds_services.add((region, prepared_id))
                    matched_raw_stop_references += 1
    db.execute("CREATE TEMP TABLE unresolved_raw(region TEXT, raw_stop_id TEXT, route_id TEXT, route_number TEXT)")
    db.executemany("INSERT INTO unresolved_raw VALUES(?,?,?,?)", [
        (str(x.get("region") or "").upper(), normalize_stop(x.get("gtfsStopId")),
         str(x.get("routeId") or ""), normalize_scalar(x.get("routeNumber"))) for x in unresolved_rows])
    db.execute("CREATE INDEX unresolved_raw_key ON unresolved_raw(region,raw_stop_id)")
    db.execute("CREATE INDEX unresolved_raw_route ON unresolved_raw(region,route_id,route_number)")
    mapped_primary = db.execute("""SELECT COUNT(DISTINCT s.region||':'||s.prepared_id) FROM service s
        WHERE s.side='PRIMARY' AND EXISTS (SELECT 1 FROM unresolved_raw u
          WHERE u.region=s.region AND u.route_id=s.source_id_raw AND u.route_number=s.route_norm)""").fetchone()[0]
    same_route_tnds = db.execute("""SELECT COUNT(DISTINCT s.region||':'||s.prepared_id) FROM service s
        WHERE s.side='PRIMARY' AND s.region<>'LONDON' AND EXISTS (SELECT 1 FROM unresolved_raw u
          WHERE u.region=s.region AND u.route_id=s.source_id_raw AND u.route_number=s.route_norm)
          AND EXISTS (SELECT 1 FROM service t WHERE t.side='TNDS' AND t.region=s.region AND t.route_norm=s.route_norm)""").fetchone()[0]
    exact_pattern_tnds = db.execute("""SELECT COUNT(DISTINCT s.region||':'||s.prepared_id) FROM service s
        WHERE s.side='PRIMARY' AND s.region<>'LONDON' AND s.pattern_key IS NOT NULL AND EXISTS (SELECT 1 FROM unresolved_raw u
          WHERE u.region=s.region AND u.route_id=s.source_id_raw AND u.route_number=s.route_norm)
          AND EXISTS (SELECT 1 FROM service t WHERE t.side='TNDS' AND t.region=s.region AND t.pattern_key=s.pattern_key)""").fetchone()[0]
    unresolved["unresolvedRawCallRecordsInPrimaryMetadata"] = len(unresolved_rows)
    unresolved["primaryServicesLinkedByExactRegionRouteIdAndRouteNumber"] = mapped_primary
    unresolved["linkedPrimaryServicesWithSameRouteNumberInTnds"] = same_route_tnds
    unresolved["linkedPrimaryServicesWithExactRoutePatternKeyInTnds"] = exact_pattern_tnds
    unresolved["exactRawUnresolvedStopKeysPresentInTndsPatterns"] = unresolved_summary.get("tndsComparatorScopeKeysReferencedByTndsCount")
    unresolved["sameRegionRouteNumberRawStopKeysPresentInTndsPatterns"] = len(matched_raw_stop_keys)
    unresolved["sameRegionRouteNumberTndsServicesWithRawStopKey"] = len(matched_tnds_services)
    unresolved["sameRegionRouteNumberRawStopSequenceReferences"] = matched_raw_stop_references
    unresolved["rawStopReferenceMeasureProvenance"] = "The exact comparator-scope referenced-key total is from the frozen Run #46 unresolved-primary-summary.json. Service and sequence counts are recomputed here only for exact normalized region+route-number candidate groups; this does not establish service identity."
    unresolved["patternFailureAttribution"] = "Same-route counts are route-only candidates. Exact route-pattern-key matches are counted separately; source-specific GTFS tokens remain non-clean even when identical. Exact raw stop references are region-scoped and do not authorize fuzzy repair."
    return {"pipersLane": {"control": pipers_result, "routeDetails": route_details},
            "peterboroughQueensgate": {"control": route_details.pop("PE1"),
                "excludedNonCallInfrastructure": sorted(bce)}, "unresolvedCalls": unresolved}


def markdown_summary(result: dict[str, Any]) -> bytes:
    p, t = result["sources"]["PRIMARY"], result["sources"]["TNDS"]
    lines = ["# R46-I1 deterministic identity bridge discovery", "",
             "Diagnostic-only results from the frozen Run #45 checkpoints and Run #46 evidence. No planner or reconciliation production behavior changed.", "",
             f"- PRIMARY services: {p['services']:,} from {p['evidenceRows']:,} evidence rows.",
             f"- TNDS services: {t['services']:,} from {t['evidenceRows']:,} evidence rows.",
             f"- Route + exact ordered pattern coverage: PRIMARY {result['bridges']['routeExactPattern']['primaryServicesCovered']:,} ({result['bridges']['routeExactPattern']['primaryCoveragePercent']:.6f}%), TNDS {result['bridges']['routeExactPattern']['tndsServicesCovered']:,} ({result['bridges']['routeExactPattern']['tndsCoveragePercent']:.6f}%).",
             f"- Shared clean route-pattern keys: {result['bridges']['routeExactPattern']['keysPresentBoth']:,}; multiplicity classes: `{json.dumps(result['bridges']['routeExactPattern']['multiplicityKeys'], sort_keys=True)}`.",
             "", "## Recommendation", "", "See the engineering handover for the evidence-based recommendation; this generated report contains measurements only.", "",
             "Detailed deterministic counts and bounded control results are in the sibling JSON file.", ""]
    return "\n".join(lines).encode("utf-8")


def analyze(primary_zip: Path, tnds_zip: Path, run46_zip: Path, output: Path) -> dict[str, Any]:
    print("Verifying frozen checkpoint archives and Run #46 provenance…", flush=True)
    p = verify_archive(primary_zip, PRIMARY_ARCHIVE_SHA256, PRIMARY_ARTIFACT)
    t = verify_archive(tnds_zip, TNDS_ARCHIVE_SHA256, TNDS_ARTIFACT)
    run46_digest = sha256_file(run46_zip)
    if run46_digest != RUN46_SHA256:
        raise ValueError("Run #46 evidence ZIP digest mismatch")
    with zipfile.ZipFile(run46_zip) as zf:
        for side, expected in (("PRIMARY", p["manifest"]), ("TNDS", t["manifest"])):
            evidence_manifest = json.load(zf.open(f"{side.lower()}-checkpoint-manifest.json"))
            for field in ("side", "sourceSnapshotId", "checkpointProducerRunId", "aggregateProjectionSha256", "evidenceRowCount"):
                if evidence_manifest.get(field) != expected.get(field):
                    raise ValueError(f"Run #46 evidence does not bind to the supplied {side} checkpoint ({field})")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="atlas-identity-bridge-", dir=output.parent) as temporary:
        db = sqlite3.connect(str(Path(temporary) / "identity-discovery.sqlite"))
        create_schema(db)
        print("Streaming and deduplicating PRIMARY evidence…", flush=True)
        pcounts = ingest_rows(db, "PRIMARY", iter_archive_rows(primary_zip, p["manifest"]))
        print("Streaming and deduplicating TNDS evidence…", flush=True)
        tcounts = ingest_rows(db, "TNDS", iter_archive_rows(tnds_zip, t["manifest"]))
        print("Building indexed comparisons and regional/control summaries…", flush=True)
        finalize_schema(db)
        result = {"schema": "atlas-bus-identity-bridge-discovery-v1", "diagnosticOnly": True,
                  "plannerEligible": False, "sourceAuthorityChanged": False, "projectionCompatibilityFingerprint": "74a75bdb3da404f401521e21bafd430aafb7076e21186e634e615e7878404a66",
                  "inputs": {"primary": {k:v for k,v in p.items() if k!="manifest"}, "tnds": {k:v for k,v in t.items() if k!="manifest"}, "run46Sha256": run46_digest},
                  "ingestion": {"PRIMARY": pcounts, "TNDS": tcounts},
                  "sources": {"PRIMARY": summarize_side(db,"PRIMARY"), "TNDS": summarize_side(db,"TNDS")},
                  "bridges": bridge_summary(db), "multiplicityAndSemantics": semantic_and_multiplicity(db),
                  "controls": control_analysis(db, run46_zip, primary_zip)}
        for side, counts, manifest in (("PRIMARY", pcounts, p["manifest"]), ("TNDS", tcounts, t["manifest"])):
            if counts["evidenceRows"] != manifest.get("evidenceRowCount"):
                raise ValueError(f"{side} streamed evidence row count does not match its checkpoint manifest")
        db.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(canonical_bytes(result) + b"\n")
    output.with_suffix(".md").write_bytes(markdown_summary(result))
    return result


def analyze_existing_database(primary_zip: Path, tnds_zip: Path, run46_zip: Path,
                              database: Path, output: Path) -> dict[str, Any]:
    """Finish summaries from a preserved DB after checking it against both manifests."""
    print("Re-verifying frozen checkpoint archives and Run #46 provenance…", flush=True)
    p = verify_archive(primary_zip, PRIMARY_ARCHIVE_SHA256, PRIMARY_ARTIFACT)
    t = verify_archive(tnds_zip, TNDS_ARCHIVE_SHA256, TNDS_ARTIFACT)
    run46_digest = sha256_file(run46_zip)
    if run46_digest != RUN46_SHA256:
        raise ValueError("Run #46 evidence ZIP digest mismatch")
    with zipfile.ZipFile(run46_zip) as zf:
        for side, expected in (("PRIMARY", p["manifest"]), ("TNDS", t["manifest"])):
            evidence_manifest = json.load(zf.open(f"{side.lower()}-checkpoint-manifest.json"))
            for field in ("side", "sourceSnapshotId", "checkpointProducerRunId", "aggregateProjectionSha256", "evidenceRowCount"):
                if evidence_manifest.get(field) != expected.get(field):
                    raise ValueError(f"Run #46 evidence does not bind to the supplied {side} checkpoint ({field})")
    db = sqlite3.connect(str(database))
    for side, manifest in (("PRIMARY", p["manifest"]), ("TNDS", t["manifest"])):
        actual = db.execute("SELECT COUNT(*),COALESCE(SUM(evidence_rows),0) FROM service WHERE side=?", (side,)).fetchone()
        expected_services = manifest.get("serviceCount")
        expected_rows = manifest.get("evidenceRowCount")
        if actual[1] != expected_rows or (expected_services not in (None, 0) and actual[0] != expected_services):
            db.close()
            raise ValueError(f"Preserved {side} database totals do not match its manifest: {actual!r}; expected evidence rows={expected_rows!r}, service count={expected_services!r}")
    finalize_schema(db)
    print("Building indexed comparisons and regional/control summaries…", flush=True)
    sources = {"PRIMARY": summarize_side(db,"PRIMARY"), "TNDS": summarize_side(db,"TNDS")}
    print("Source coverage summarized; calculating bridge keys…", flush=True)
    bridges = bridge_summary(db)
    print("Bridge keys summarized; calculating semantic and multiplicity deltas…", flush=True)
    semantics = semantic_and_multiplicity(db)
    print("Semantic deltas summarized; calculating bounded controls and unresolved-stop links…", flush=True)
    controls = control_analysis(db, run46_zip, primary_zip)
    result = {"schema": "atlas-bus-identity-bridge-discovery-v1", "diagnosticOnly": True,
              "plannerEligible": False, "sourceAuthorityChanged": False,
              "projectionCompatibilityFingerprint": "74a75bdb3da404f401521e21bafd430aafb7076e21186e634e615e7878404a66",
              "inputs": {"primary": {k:v for k,v in p.items() if k!="manifest"},
                         "tnds": {k:v for k,v in t.items() if k!="manifest"},
                         "run46Sha256": run46_digest},
              "ingestion": {side: {"evidenceRows": manifest["evidenceRowCount"], "conflictingRepeatedRows":
                                   db.execute("SELECT COALESCE(SUM(consistency_conflicts),0) FROM service WHERE side=?", (side,)).fetchone()[0]}
                            for side, manifest in (("PRIMARY",p["manifest"]),("TNDS",t["manifest"]))},
              "sources": sources, "bridges": bridges,
              "multiplicityAndSemantics": semantics, "controls": controls}
    db.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(canonical_bytes(result) + b"\n")
    output.with_suffix(".md").write_bytes(markdown_summary(result))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--primary-zip", type=Path, required=True)
    parser.add_argument("--tnds-zip", type=Path, required=True)
    parser.add_argument("--run46-zip", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--resume-db", type=Path, help="Use a preserved SQLite ingest after validating its totals against both manifests")
    args = parser.parse_args()
    report = (analyze_existing_database(args.primary_zip, args.tnds_zip, args.run46_zip, args.resume_db, args.output)
              if args.resume_db else analyze(args.primary_zip, args.tnds_zip, args.run46_zip, args.output))
    print(json.dumps({"output": str(args.output), "primaryServices": report["sources"]["PRIMARY"]["services"],
                      "tndsServices": report["sources"]["TNDS"]["services"], "bridges": report["bridges"]}, sort_keys=True))


if __name__ == "__main__":
    main()
