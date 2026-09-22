"""Write a non-production manifest for same-window Bus diagnostic sources."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_cache(site_root: Path, repository_sha: str, fingerprint: str) -> dict:
    cache = site_root / ".atlas-diagnostic-source-cache"
    gtfs = cache / "gtfs"
    regions = [{"region": path.stem, "sha256": digest(path), "bytes": path.stat().st_size} for path in sorted(gtfs.glob("*.zip"))]
    status = json.loads((site_root / "atlas/data/status/manifest.json").read_text(encoding="utf-8"))
    sources = status.get("sources", {})
    value = {
        "schema": "atlas-bus-diagnostic-source-cache-v1",
        "state": "UNVERIFIED",
        "diagnosticOnly": True,
        "productionEligible": False,
        "repositoryCommit": repository_sha or os.environ.get("GITHUB_SHA"),
        "candidateGenerationCompatibilityFingerprint": fingerprint,
        "preparedSchema": "atlas-prepared-bus-data-v2",
        "sources": {key: {"identity": item.get("identity"), "sourceHash": item.get("sourceHash")} for key, item in sources.items() if key in {"naptan", "nptg", "bods"}},
        "bodsRegions": regions,
        "rawArchives": False,
        "neverUseAsProductionCheckpoint": True,
    }
    (cache / "manifest.json").write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-root", required=True)
    parser.add_argument("--repository-sha", default="")
    parser.add_argument("--fingerprint", required=True)
    args = parser.parse_args()
    print(json.dumps(write_cache(Path(args.site_root).resolve(), args.repository_sha, args.fingerprint), indent=2))


if __name__ == "__main__":
    main()
