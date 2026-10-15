"""Hash-bound, diagnostic-only checkpoints for canonical reconciliation inputs."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

SCHEMA = "atlas-bus-reconciliation-input-checkpoint-v1"
PROJECTION_SCHEMA = "atlas-bus-reconciliation-projection-v1"
SIDES = {"PRIMARY", "TNDS"}


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


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
