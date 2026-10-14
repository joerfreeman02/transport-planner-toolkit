"""Probe TNDS directory metadata only; this module never transfers archives."""
from __future__ import annotations

import argparse
import ftplib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from refresh_bus_data import (TNDS_HOST, TNDS_PATH, TNDS_REGIONS, RefreshError,
                              select_tnds_region_archives)


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
            names = [name for name in ftp.nlst() if isinstance(name, str)]
            try:
                selected = select_tnds_region_archives(names)
            except RefreshError as error:
                result["directoryError"] = str(error)
                result["classification"] = "INVALID_DIRECTORY"
                result["regions"] = {region: {"candidates": [], "matches": [], "metadataAvailable": False,
                                              "classification": "DIRECTORY_REJECTED"} for region in TNDS_REGIONS}
                return result
            for region in TNDS_REGIONS:
                name = selected[region]
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
                    "candidates": [name],
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


def validate_metadata_probe(result: dict) -> None:
    """Fail closed unless authentication and exact eight-file metadata gate pass."""
    if result.get("retrievalPerformed") is not False:
        raise ValueError("TNDS metadata gate must not retrieve archives")
    if result.get("classification") != "RELIABLE_METADATA_ONLY":
        raise ValueError("TNDS metadata gate is not reliable")
    regions = result.get("regions")
    if not isinstance(regions, dict) or set(regions) != set(TNDS_REGIONS):
        raise ValueError("TNDS metadata gate does not identify exactly eight regions")
    for region in TNDS_REGIONS:
        item = regions[region]
        matches = item.get("matches") if isinstance(item, dict) else None
        if item.get("classification") != "RELIABLE_METADATA" or item.get("metadataAvailable") is not True or len(item.get("candidates", [])) != 1 or not isinstance(matches, list) or len(matches) != 1:
            raise ValueError(f"TNDS metadata is incomplete or ambiguous for {region}")
        match = matches[0]
        if not isinstance(match.get("size"), int) or isinstance(match.get("size"), bool) or match["size"] <= 0 or not _valid_mdtm(match.get("modified")):
            raise ValueError(f"TNDS SIZE/MDTM metadata is invalid for {region}")


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
