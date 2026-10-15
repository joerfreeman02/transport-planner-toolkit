"""Hash-bound, diagnostic-only checkpoints for canonical reconciliation inputs."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

SCHEMA = "atlas-bus-reconciliation-input-checkpoint-v1"
PROJECTION_SCHEMA = "atlas-bus-reconciliation-projection-v1"
SIDES = {"PRIMARY", "TNDS"}
STREAM_SCHEMA = "atlas-bus-reconciliation-stream-checkpoint-v3"
STREAM_PROJECTION_SCHEMA = "atlas-bus-reconciliation-projection-v3"
PROJECTION_CHUNK_ROWS = 25000
STOP_BUCKET_HEX_CHARS = 2
DIAGNOSTIC_FLAGS = {"currentFreshnessClaimed": False, "diagnosticOnly": True,
                    "plannerEligible": False, "sourceAuthorityChanged": False,
                    "plannerOutputChanged": False, "publicationEligible": False}
KNOWN_REGION_CODES = ("EA", "EM", "NE", "NW", "SE", "SW", "WM", "Y", "LONDON")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def file_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(chunk_size), b""):
            digest.update(block)
    return digest.hexdigest()


def normalized_stop_identity(value: Any) -> str:
    """Use the comparator's StopPoint normalization for shard assignment."""
    return re.sub(r"\s+", "", str(value or "")).upper()


def stop_comparison_bucket(region: str, normalized_stop_id: str) -> str:
    return hashlib.sha256(normalized_stop_id.encode("utf-8")).hexdigest()[:STOP_BUCKET_HEX_CHARS]


def create_streaming_checkpoint(side: str, rows: Iterable[dict[str, Any]], provenance: dict[str, Any],
                                destination: str | Path, *, projection_metadata: dict[str, Any] | None = None,
                                projection_metrics: dict[str, Any] | None = None,
                                chunk_rows: int = PROJECTION_CHUNK_ROWS) -> dict[str, Any]:
    """Write stop-bucket shards incrementally without materializing projection rows."""
    side = str(side).upper()
    if side not in SIDES:
        raise ValueError("Checkpoint side must be PRIMARY or TNDS")
    required = ("sourceSnapshotId", "sourceProducerRunId", "sourceArtifactName", "repository",
                "preparationCodeCommit", "checkpointProducerRunId", "checkpointProducerCommit",
                "checkpointBranch", "preparedSchema", "sourceWindowBasis", "projectionCompatibilityFingerprint")
    missing = [key for key in required if not str(provenance.get(key, "")).strip()]
    if missing:
        raise ValueError("Checkpoint provenance missing: " + ", ".join(missing))
    if side == "TNDS" and provenance["sourceSnapshotId"] != "76ee662a30e5bcb0072c93f4dd3a8efe85c41446ca318a1d6f5700070f5bf058":
        raise ValueError("TNDS checkpoint source snapshot is not the verified Run #40 snapshot")
    if side == "TNDS" and str(provenance["sourceProducerRunId"]) == "38579244547":
        if (provenance.get("sourceArtifactName") != "atlas-tnds-quarantined-38579244547"
                or str(provenance.get("sourceArtifactId")) != "11903662011"
                or provenance.get("sourceArtifactDigest") != "sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e"):
            raise ValueError("Run #40 TNDS artifact name, ID, or digest does not match the verified frozen input")
    if side == "PRIMARY" and str(provenance["sourceProducerRunId"]) == "38533475680":
        if (provenance["sourceSnapshotId"] != "13e2895be61c5bb5adaf8adec9896520b8224ff243766818d3ca920f0eae71e1"
                or provenance.get("sourceArtifactName") != "atlas-reference-source-snapshot-38533475680"
                or str(provenance.get("sourceArtifactId")) != "11878857366"
                or provenance.get("sourceArtifactDigest") != "sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658"):
            raise ValueError("Run #37 primary artifact name, ID, digest, or snapshot does not match the verified frozen input")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", provenance["projectionCompatibilityFingerprint"]):
        raise ValueError("Projection compatibility fingerprint must be a SHA-256 digest")
    if chunk_rows < 1:
        raise ValueError("Projection chunk row target must be positive")
    root = Path(destination)
    root.mkdir(parents=True, exist_ok=False)
    projection_root = root / "projection"
    projection_root.mkdir()
    counts: Counter[str] = Counter()
    total = 0
    ordered_shards = []
    bucket_counts: Counter[tuple[str, str]] = Counter()
    largest_identity_bucket = 0
    oversized_identity_bucket_count = 0
    with tempfile.TemporaryDirectory(prefix="atlas-projection-spool-") as temporary:
        db = sqlite3.connect(str(Path(temporary) / "projection.sqlite"))
        db.execute("PRAGMA journal_mode=OFF")
        db.execute("PRAGMA synchronous=OFF")
        db.execute("PRAGMA temp_store=FILE")
        db.execute("CREATE TABLE evidence (region TEXT NOT NULL, bucket TEXT NOT NULL, stop_norm TEXT NOT NULL, evidence_id TEXT NOT NULL, payload BLOB NOT NULL)")
        batch = []
        try:
            for row in rows:
                region = str(row.get("region", "")).upper()
                if region not in KNOWN_REGION_CODES:
                    raise ValueError(f"Projected evidence has invalid canonical region {region!r}")
                stop_norm = normalized_stop_identity(row.get("stopId"))
                bucket = stop_comparison_bucket(region, stop_norm)
                evidence_id = str(row.get("evidenceId") or "")
                batch.append((region, bucket, stop_norm, evidence_id, canonical_bytes(row)))
                counts[region] += 1
                bucket_counts[(region, bucket)] += 1
                total += 1
                if len(batch) >= 1000:
                    db.executemany("INSERT INTO evidence VALUES (?,?,?,?,?)", batch)
                    db.commit(); batch.clear()
            if batch:
                db.executemany("INSERT INTO evidence VALUES (?,?,?,?,?)", batch)
                db.commit(); batch.clear()
            db.execute("CREATE INDEX evidence_bucket_stop ON evidence(region,bucket,stop_norm,evidence_id)")
            db.commit()
            bucket_keys = db.execute("SELECT DISTINCT region,bucket FROM evidence ORDER BY region,bucket")
            for region, bucket in bucket_keys:
                shard_index = 0
                shard_rows = 0
                stream = None
                path = None
                first_stop_norm = None
                last_stop_norm = None
                def open_shard():
                    nonlocal shard_index, shard_rows, stream, path, first_stop_norm, last_stop_norm
                    shard_index += 1
                    shard_rows = 0
                    first_stop_norm = last_stop_norm = None
                    path = projection_root / f"{region}-{bucket}-{shard_index:05d}.jsonl.gz"
                    stream = gzip.GzipFile(filename=str(path), mode="wb", compresslevel=6, mtime=0)
                def close_shard(oversized: bool = False, stop_norm: str | None = None):
                    nonlocal stream, path, shard_rows, first_stop_norm, last_stop_norm
                    if stream is None:
                        return
                    stream.close()
                    record = {"path": f"projection/{path.name}", "region": region,
                        "comparisonBucket": bucket, "shardIndex": shard_index,
                        "rowCount": shard_rows, "sha256": file_sha256(path),
                        "oversizedIdentityBucket": oversized,
                        "firstStopIdentitySha256": hashlib.sha256(first_stop_norm.encode("utf-8")).hexdigest(),
                        "lastStopIdentitySha256": hashlib.sha256(last_stop_norm.encode("utf-8")).hexdigest()}
                    if stop_norm is not None:
                        record["oversizedStopIdentitySha256"] = hashlib.sha256(stop_norm.encode("utf-8")).hexdigest()
                    ordered_shards.append(record)
                    stream = None; path = None; shard_rows = 0
                groups = db.execute("SELECT stop_norm,COUNT(*) FROM evidence WHERE region=? AND bucket=? GROUP BY stop_norm ORDER BY stop_norm", (region, bucket))
                for stop_norm, identity_count in groups:
                    identity_count = int(identity_count)
                    largest_identity_bucket = max(largest_identity_bucket, identity_count)
                    oversized = identity_count > chunk_rows
                    if oversized:
                        close_shard()
                        open_shard()
                        first_stop_norm = last_stop_norm = stop_norm
                        row_cursor = db.execute("SELECT payload FROM evidence WHERE region=? AND bucket=? AND stop_norm=? ORDER BY evidence_id,payload", (region, bucket, stop_norm))
                        for (payload,) in row_cursor:
                            stream.write(payload + b"\n"); shard_rows += 1
                        close_shard(True, stop_norm)
                        oversized_identity_bucket_count += 1
                        continue
                    if stream is None or shard_rows + identity_count > chunk_rows:
                        close_shard()
                        open_shard()
                    if shard_rows == 0:
                        first_stop_norm = stop_norm
                    last_stop_norm = stop_norm
                    row_cursor = db.execute("SELECT payload FROM evidence WHERE region=? AND bucket=? AND stop_norm=? ORDER BY evidence_id,payload", (region, bucket, stop_norm))
                    for (payload,) in row_cursor:
                        stream.write(payload + b"\n"); shard_rows += 1
                close_shard()
        finally:
            db.close()
    ordered_shards.sort(key=lambda item: (item["region"], item["comparisonBucket"], item["shardIndex"]))
    aggregate = hashlib.sha256(canonical_bytes(ordered_shards)).hexdigest()
    metadata = dict(projection_metadata or {})
    (root / "projection-metadata.json").write_bytes(canonical_bytes(metadata) + b"\n")
    manifest = {
        "schema": STREAM_SCHEMA, "projectionSchema": STREAM_PROJECTION_SCHEMA, "side": side,
        "sourceSnapshotId": provenance["sourceSnapshotId"],
        "sourceProducerRunId": str(provenance["sourceProducerRunId"]),
        "artifactRestorationRunId": str(provenance.get("artifactRestorationRunId") or ""),
        "sourceArtifactName": provenance["sourceArtifactName"], "sourceArtifactId": str(provenance.get("sourceArtifactId")) if provenance.get("sourceArtifactId") is not None else None,
        "sourceArtifactDigest": provenance.get("sourceArtifactDigest"), "repository": provenance["repository"],
        "preparationCodeCommit": provenance["preparationCodeCommit"],
        "checkpointProducerCommit": provenance["checkpointProducerCommit"],
        "checkpointProducerRunId": str(provenance["checkpointProducerRunId"]),
        "checkpointBranch": provenance["checkpointBranch"], "preparedSchema": provenance["preparedSchema"],
        "preparedAt": provenance["sourceWindowBasis"], "sourceWindowBasis": provenance["sourceWindowBasis"],
        "projectionCompatibilityFingerprint": provenance["projectionCompatibilityFingerprint"],
        "inputServiceCount": int(provenance.get("serviceCount", 0)),
        "serviceCount": int(provenance.get("serviceCount", 0)),
        "projectedEvidenceCount": total, "evidenceRowCount": total,
        "regionEvidenceCounts": {region: counts.get(region, 0) for region in KNOWN_REGION_CODES},
        "regionServiceCounts": provenance.get("regionServiceCounts", {}),
        "projectionShardCount": len(ordered_shards), "shardCount": len(ordered_shards), "shards": ordered_shards,
        "comparisonBucketCount": len(bucket_counts), "stopBucketCount": len(bucket_counts),
        "largestStopIdentityBucket": largest_identity_bucket,
        "oversizedStopIdentityBucketCount": oversized_identity_bucket_count,
        "aggregateProjectionSha256": aggregate, "projectionMetadataSha256": file_sha256(root / "projection-metadata.json"),
        "maximumProjectionRowsLoadedSimultaneously": 1,
        **(projection_metrics or {}),
        "incrementalHashing": True, "incrementalProjectionWriting": True,
        "comparisonUnitRowTarget": chunk_rows,
        "peakLogicalWorkingSetUnit": "one stop identity group plus a comparison shard capped at the configured row target; oversized stop identities are streamed",
        **DIAGNOSTIC_FLAGS,
    }
    (root / "manifest.json").write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return manifest


def verify_streaming_checkpoint(root: str | Path, expected: dict[str, Any]) -> dict[str, Any]:
    """Stream-verify shard hashes, rows, schema, source, compatibility and diagnostic flags."""
    root = Path(root).resolve()
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        raise ValueError("Checkpoint manifest is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != STREAM_SCHEMA or manifest.get("projectionSchema") != STREAM_PROJECTION_SCHEMA:
        raise ValueError("Checkpoint schema is incompatible")
    if any(manifest.get(key) != value for key, value in DIAGNOSTIC_FLAGS.items()):
        raise ValueError("Checkpoint diagnostic or authority flags are incompatible")
    fields = ("side", "sourceSnapshotId", "sourceProducerRunId", "sourceArtifactName", "sourceArtifactId",
              "sourceArtifactDigest", "repository", "preparedSchema", "projectionCompatibilityFingerprint")
    for key in fields:
        if key in expected and manifest.get(key) != expected[key]:
            raise ValueError(f"Checkpoint {key} mismatch")
    if manifest.get("side") == "TNDS" and manifest.get("sourceSnapshotId") != "76ee662a30e5bcb0072c93f4dd3a8efe85c41446ca318a1d6f5700070f5bf058":
        raise ValueError("TNDS checkpoint snapshot is not the verified Run #40 snapshot")
    if not isinstance(manifest.get("shards"), list) or manifest.get("shardCount") != len(manifest["shards"]):
        raise ValueError("Checkpoint shard manifest is missing or inconsistent")
    shard_keys = [(str(item.get("region", "")), str(item.get("comparisonBucket", "")), int(item.get("shardIndex", 0)))
                  for item in manifest["shards"]]
    if shard_keys != sorted(set(shard_keys)):
        raise ValueError("Checkpoint shards are not uniquely ordered by region, comparison bucket, and shard index")
    actual_counts: Counter[str] = Counter()
    previous_stop_boundary: dict[tuple[str, str], str] = {}
    for shard in manifest["shards"]:
        path = (root / str(shard.get("path", ""))).resolve()
        if root not in path.parents or not path.is_file():
            raise ValueError("Checkpoint shard is missing or unsafe")
        if file_sha256(path) != shard.get("sha256"):
            raise ValueError("Checkpoint shard digest mismatch")
        count = 0
        first_stop_norm = last_stop_norm = None
        with gzip.open(path, "rt", encoding="utf-8") as stream:
            for line in stream:
                row = json.loads(line)
                stop_norm = normalized_stop_identity(row.get("stopId"))
                if (str(row.get("region", "")).upper() != shard.get("region")
                        or stop_comparison_bucket(shard["region"], stop_norm) != shard.get("comparisonBucket")):
                    raise ValueError("Checkpoint shard row region or stop comparison bucket mismatch")
                if first_stop_norm is None:
                    first_stop_norm = stop_norm
                last_stop_norm = stop_norm
                count += 1
        if count != shard.get("rowCount"):
            raise ValueError("Checkpoint shard row count mismatch")
        target = int(manifest.get("comparisonUnitRowTarget", PROJECTION_CHUNK_ROWS))
        bucket_key = (shard["region"], shard["comparisonBucket"])
        first_hash = hashlib.sha256((first_stop_norm or "").encode("utf-8")).hexdigest()
        last_hash = hashlib.sha256((last_stop_norm or "").encode("utf-8")).hexdigest()
        if shard.get("firstStopIdentitySha256") != first_hash or shard.get("lastStopIdentitySha256") != last_hash:
            raise ValueError("Checkpoint shard stop identity boundaries are invalid")
        if previous_stop_boundary.get(bucket_key) == first_hash:
            raise ValueError("Checkpoint comparison unit splits one StopPoint identity across shards")
        previous_stop_boundary[bucket_key] = last_hash
        if shard.get("oversizedIdentityBucket"):
            if count <= target or first_stop_norm != last_stop_norm or shard.get("oversizedStopIdentitySha256") != first_hash:
                raise ValueError("Checkpoint marks a non-oversized identity shard as oversized")
        elif count > target:
            raise ValueError("Checkpoint comparison shard exceeds its row target")
        actual_counts[shard["region"]] += count
    if sum(actual_counts.values()) != manifest.get("evidenceRowCount"):
        raise ValueError("Checkpoint evidence row count mismatch")
    expected_counts = {key: value for key, value in (manifest.get("regionEvidenceCounts") or {}).items() if value}
    if dict(sorted(actual_counts.items())) != dict(sorted(expected_counts.items())):
        raise ValueError("Checkpoint regional evidence counts mismatch")
    if hashlib.sha256(canonical_bytes(manifest["shards"])).hexdigest() != manifest.get("aggregateProjectionSha256"):
        raise ValueError("Checkpoint aggregate projection digest mismatch")
    metadata = root / "projection-metadata.json"
    if not metadata.is_file() or file_sha256(metadata) != manifest.get("projectionMetadataSha256"):
        raise ValueError("Checkpoint projection metadata digest mismatch")
    return manifest


def iter_checkpoint_bucket(root: str | Path, manifest: dict[str, Any], region: str, bucket: str) -> Iterable[dict[str, Any]]:
    root = Path(root)
    for shard in manifest["shards"]:
        if shard["region"] != region or shard["comparisonBucket"] != bucket:
            continue
        with gzip.open(root / shard["path"], "rt", encoding="utf-8") as stream:
            for line in stream:
                yield json.loads(line)


def iter_checkpoint_buckets(manifest: dict[str, Any]) -> list[tuple[str, str]]:
    return sorted({(str(item["region"]), str(item["comparisonBucket"])) for item in manifest["shards"]})


def iter_checkpoint_region(root: str | Path, manifest: dict[str, Any], region: str) -> Iterable[dict[str, Any]]:
    """Compatibility iterator for small diagnostics; national runner uses stop buckets."""
    root = Path(root)
    for shard in manifest["shards"]:
        if shard["region"] != region:
            continue
        with gzip.open(root / shard["path"], "rt", encoding="utf-8") as stream:
            for line in stream:
                yield json.loads(line)


def create_checkpoint(side: str, projection: dict[str, Any], provenance: dict[str, Any]) -> dict[str, Any]:
    """Bind canonical rows to immutable source and code provenance."""
    side = str(side).upper()
    if side not in SIDES:
        raise ValueError("Checkpoint side must be PRIMARY or TNDS")
    if projection.get("schema") != PROJECTION_SCHEMA or not isinstance(projection.get("rows"), list):
        raise ValueError("Canonical projection schema or rows are invalid")
    required = ("sourceSnapshotId", "sourceProducerRunId", "sourceArtifactName", "repository",
                "preparationCodeCommit", "preparedSchema", "sourceWindowBasis")
    missing = [key for key in required if not str(provenance.get(key, "")).strip()]
    if missing:
        raise ValueError("Checkpoint provenance missing: " + ", ".join(missing))
    if not str(provenance["sourceProducerRunId"]).isdigit():
        raise ValueError("Source producer run ID must be numeric")
    rows = projection["rows"]
    counts = Counter(str(row.get("region", "")).upper() for row in rows)
    projection_hash = hashlib.sha256(canonical_bytes(projection)).hexdigest()
    manifest = {
        "schema": SCHEMA, "side": side,
        "sourceSnapshotId": provenance["sourceSnapshotId"],
        "sourceProducerRunId": str(provenance["sourceProducerRunId"]),
        "artifactRestorationRunId": str(provenance.get("artifactRestorationRunId") or ""),
        "sourceArtifactName": provenance["sourceArtifactName"],
        "sourceArtifactId": provenance.get("sourceArtifactId"),
        "sourceArtifactDigest": provenance.get("sourceArtifactDigest"),
        "repository": provenance["repository"],
        "preparationCodeCommit": provenance["preparationCodeCommit"],
        "checkpointProducerRunId": str(provenance.get("checkpointProducerRunId") or "local-fixture"),
        "checkpointBranch": provenance.get("checkpointBranch") or "local-fixture",
        "preparedSchema": provenance["preparedSchema"],
        "preparedAt": provenance["sourceWindowBasis"],
        "sourceWindowBasis": provenance["sourceWindowBasis"],
        "rowCount": len(rows), "regionRowCounts": dict(sorted(counts.items())),
        "canonicalProjectionSha256": projection_hash,
        "currentFreshnessClaimed": False, "diagnosticOnly": True,
        "plannerEligible": False, "sourceAuthorityChanged": False,
        "publicationEligible": False,
    }
    return {"manifest": manifest, "projection": projection}


def verify_checkpoint(bundle: dict[str, Any], expected: dict[str, Any]) -> dict[str, Any]:
    """Fail closed on missing, corrupt, or provenance-incompatible checkpoint."""
    if not isinstance(bundle, dict) or not isinstance(bundle.get("manifest"), dict):
        raise ValueError("Checkpoint manifest is missing")
    manifest, projection = bundle["manifest"], bundle.get("projection")
    if manifest.get("schema") != SCHEMA or manifest.get("side") not in SIDES:
        raise ValueError("Checkpoint schema or side mismatch")
    if not isinstance(projection, dict) or projection.get("schema") != PROJECTION_SCHEMA or not isinstance(projection.get("rows"), list):
        raise ValueError("Checkpoint projection is missing or incompatible")
    checks = ("side", "sourceSnapshotId", "sourceProducerRunId", "sourceArtifactName", "repository",
              "preparationCodeCommit", "checkpointProducerRunId", "checkpointBranch", "preparedSchema", "canonicalProjectionSha256")
    for key in checks:
        if key in expected and str(manifest.get(key, "")) != str(expected[key]):
            raise ValueError(f"Checkpoint {key} mismatch")
    digest = hashlib.sha256(canonical_bytes(projection)).hexdigest()
    if digest != manifest.get("canonicalProjectionSha256"):
        raise ValueError("Checkpoint projection digest mismatch")
    rows = projection["rows"]
    counts = dict(sorted(Counter(str(row.get("region", "")).upper() for row in rows).items()))
    if manifest.get("rowCount") != len(rows) or manifest.get("regionRowCounts") != counts:
        raise ValueError("Checkpoint row count or regional counts mismatch")
    if manifest.get("currentFreshnessClaimed") is not False or manifest.get("diagnosticOnly") is not True or manifest.get("plannerEligible") is not False or manifest.get("sourceAuthorityChanged") is not False or manifest.get("publicationEligible") is not False:
        raise ValueError("Checkpoint diagnostic-only authority flags are invalid")
    return manifest


def _read(path: Path) -> dict[str, Any]:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as stream:
            return json.load(stream)
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create")
    create.add_argument("--side", required=True); create.add_argument("--projection", required=True)
    create.add_argument("--provenance", required=True); create.add_argument("--output", required=True)
    verify = sub.add_parser("verify")
    verify.add_argument("--checkpoint", required=True); verify.add_argument("--expected", required=True)
    args = parser.parse_args()
    if args.command == "create":
        result = create_checkpoint(args.side, _read(Path(args.projection)), _read(Path(args.provenance)))
        dest = Path(args.output); dest.parent.mkdir(parents=True, exist_ok=True)
        payload = canonical_bytes(result) + b"\n"
        if dest.suffix == ".gz":
            dest.parent.mkdir(parents=True, exist_ok=True)
            with gzip.open(dest, "wb", compresslevel=9) as stream: stream.write(payload)
        else:
            dest.write_bytes(payload)
        print(json.dumps({"side": result["manifest"]["side"], "rowCount": result["manifest"]["rowCount"], "sha256": result["manifest"]["canonicalProjectionSha256"]}, sort_keys=True))
    else:
        manifest = verify_checkpoint(_read(Path(args.checkpoint)), _read(Path(args.expected)))
        print(json.dumps({"side": manifest["side"], "rowCount": manifest["rowCount"], "verified": True}, sort_keys=True))


if __name__ == "__main__":
    main()
