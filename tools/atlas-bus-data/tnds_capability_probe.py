"""Probe TNDS directory metadata only; this module never transfers archives."""
from __future__ import annotations

import argparse
import ftplib
import json
import os
from datetime import datetime, timezone

from refresh_bus_data import TNDS_HOST, TNDS_PATH, TNDS_REGIONS


def probe(username: str, password: str) -> dict:
    result = {"schema": "atlas-tnds-capability-probe-v1", "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), "retrievalPerformed": False, "regions": {}, "classification": "NOT_RELIABLE"}
    if not username or not password:
        result["reason"] = "credentials not supplied"
        return result
    try:
        with ftplib.FTP(TNDS_HOST, timeout=120) as ftp:
            ftp.login(username, password)
            ftp.cwd(TNDS_PATH)
            names = ftp.nlst()
            for region in TNDS_REGIONS:
                matches = [name for name in names if region in name.upper()]
                metadata = []
                for name in matches[:20]:
                    item = {"name": name}
                    try: item["size"] = ftp.size(name)
                    except Exception as error: item["sizeError"] = type(error).__name__
                    try: item["modified"] = ftp.sendcmd(f"MDTM {name}")
                    except Exception as error: item["modifiedError"] = type(error).__name__
                    metadata.append(item)
                result["regions"][region] = {"matches": metadata, "metadataAvailable": bool(metadata)}
            result["classification"] = "RELIABLE_METADATA_ONLY" if all(item.get("metadataAvailable") for item in result["regions"].values()) else "PARTIALLY_RELIABLE"
    except Exception as error:
        result["reason"] = type(error).__name__
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = probe(os.environ.get("TNDS_USERNAME", ""), os.environ.get("TNDS_PASSWORD", ""))
    with open(args.output, "w", encoding="utf-8") as stream: json.dump(result, stream, indent=2); stream.write("\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
