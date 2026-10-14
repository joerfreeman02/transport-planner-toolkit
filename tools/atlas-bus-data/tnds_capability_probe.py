"""Probe TNDS directory metadata only; this module never transfers archives."""
from __future__ import annotations

import argparse
import ftplib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from refresh_bus_data import TNDS_HOST, TNDS_PATH, TNDS_REGIONS, tnds_region_from_filename


def _valid_mdtm(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"213\s+\d{14}(?:\.\d+)?", value.strip()) is not None


def probe(username: str, password: str) -> dict:
    result = {"schema": "atlas-tnds-capability-probe-v1", "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), "retrievalPerformed": False, "regions": {}, "classification": "NOT_RELIABLE"}
    if not username or not password:
        result["reason"] = "credentials not supplied"
        return result
    try:
        with ftplib.FTP(TNDS_HOST, timeout=120) as ftp:
            ftp.login(username, password)
            ftp.cwd(TNDS_PATH)
            candidates = {region: [] for region in TNDS_REGIONS}
            for name in ftp.nlst():
                if not isinstance(name, str) or not name.lower().endswith(".zip"):
                    continue
                region = tnds_region_from_filename(name)
                if region in candidates:
                    candidates[region].append(name)
            for region in TNDS_REGIONS:
                names = sorted(candidates[region], key=str.casefold)
                if not names:
                    result["regions"][region] = {"candidates": [], "matches": [], "metadataAvailable": False, "classification": "MISSING"}
                    continue
                if len(names) > 1:
                    result["regions"][region] = {"candidates": names, "matches": [], "metadataAvailable": False, "classification": "AMBIGUOUS"}
                    continue

                name = names[0]
                item = {"name": name}
                try:
                    size = ftp.size(name)
                    item["size"] = size
                    size_valid = isinstance(size, int) and not isinstance(size, bool) and size > 0
                except Exception as error:
                    item["sizeError"] = type(error).__name__
                    size_valid = False
                try:
                    modified = ftp.sendcmd(f"MDTM {name}")
                    item["modified"] = modified
                    modified_valid = _valid_mdtm(modified)
                except Exception as error:
                    item["modifiedError"] = type(error).__name__
                    modified_valid = False
                available = size_valid and modified_valid
                item["metadataAvailable"] = available
                result["regions"][region] = {
                    "candidates": names,
                    "matches": [item],
                    "metadataAvailable": available,
                    "classification": "RELIABLE_METADATA" if available else "INCOMPLETE_METADATA",
                }
            if all(item["classification"] == "RELIABLE_METADATA" for item in result["regions"].values()):
                result["classification"] = "RELIABLE_METADATA_ONLY"
            elif any(item["metadataAvailable"] for item in result["regions"].values()):
                result["classification"] = "PARTIALLY_RELIABLE"
            else:
                result["classification"] = "NOT_RELIABLE"
    except Exception as error:
        result["reason"] = type(error).__name__
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = probe(os.environ.get("TNDS_USERNAME", ""), os.environ.get("TNDS_PASSWORD", ""))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as stream: json.dump(result, stream, indent=2); stream.write("\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
