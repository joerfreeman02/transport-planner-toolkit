"""Hash-bound, diagnostic-only checkpoints for canonical reconciliation inputs."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

SCHEMA = "atlas-bus-reconciliation-input-checkpoint-v1"
PROJECTION_SCHEMA = "atlas-bus-reconciliation-projection-v1"
SIDES = {"PRIMARY", "TNDS"}
STREAM_SCHEMA = "atlas-bus-reconciliation-stream-checkpoint-v2"
STREAM_PROJECTION_SCHEMA = "atlas-bus-reconciliation-projection-v2"
PROJECTION_CHUNK_ROWS = 25000
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


def create_streaming_checkpoint(side: str, rows: Iterable[dict[str, Any]], provenance: dict[str, Any],
                                destination: str | Path, *, projection_metadata: dict[str, Any] | None = None,
                                projection_metrics: dict[str, Any] | None = None,
                                chunk_rows: int = PROJECTION_CHUNK_ROWS) -> dict[str, Any]:
    """Write ordered JSONL shards incrementally; never serialize a national rows list."""
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
    root = Path(destination)
    root.mkdir(parents=True, exist_ok=False)
    projection_root = root / "projection"
    projection_root.mkdir()
    counts: Counter[str] = Counter()
    total = 0
    open_files: dict[str, Any] = {}
    try:
        for row in rows:
            region = str(row.get("region", "")).upper()
            if region not in KNOWN_REGION_CODES:
                raise ValueError(f"Projected evidence has invalid canonical region {region!r}")
            if region not in open_files:
                path = projection_root / f"{region}.jsonl.gz"
                open_files[region] = gzip.GzipFile(filename=str(path), mode="wb", compresslevel=6, mtime=0)
            open_files[region].write(canonical_bytes(row) + b"\n")
            counts[region] += 1
            total += 1
    finally:
        for stream in open_files.values():
            stream.close()
    ordered_shards = []
    for region in sorted(open_files):
        path = projection_root / f"{region}.jsonl.gz"
        ordered_shards.append({"path": f"projection/{path.name}", "region": region,
                               "rowCount": counts[region], "sha256": file_sha256(path)})
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
        "aggregateProjectionSha256": aggregate, "projectionMetadataSha256": file_sha256(root / "projection-metadata.json"),
        "maximumProjectionRowsLoadedSimultaneously": 1,
        **(projection_metrics or {}),
        "incrementalHashing": True, "incrementalProjectionWriting": True,
        "peakLogicalWorkingSetUnit": "one projected evidence row plus buffered filesystem blocks; consumer reads one region at a time",
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
    shard_regions = [str(item.get("region", "")) for item in manifest["shards"]]
    if shard_regions != sorted(set(shard_regions)):
        raise ValueError("Checkpoint shards are not uniquely ordered by canonical region")
    actual_counts: Counter[str] = Counter()
    for shard in manifest["shards"]:
        path = (root / str(shard.get("path", ""))).resolve()
        if root not in path.parents or not path.is_file():
            raise ValueError("Checkpoint shard is missing or unsafe")
        if file_sha256(path) != shard.get("sha256"):
            raise ValueError("Checkpoint shard digest mismatch")
        count = 0
        with gzip.open(path, "rt", encoding="utf-8") as stream:
            for line in stream:
                row = json.loads(line)
                if str(row.get("region", "")).upper() != shard.get("region"):
                    raise ValueError("Checkpoint shard row region mismatch")
                count += 1
        if count != shard.get("rowCount"):
            raise ValueError("Checkpoint shard row count mismatch")
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


def iter_checkpoint_region(root: str | Path, manifest: dict[str, Any], region: str) -> Iterable[dict[str, Any]]:
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
