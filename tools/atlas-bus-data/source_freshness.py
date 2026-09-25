#!/usr/bin/env python3
"""Source-specific freshness capability probes; never downloads source bytes."""
from __future__ import annotations

import argparse
import ftplib
import hashlib
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone

from refresh_bus_data import BODS_DOWNLOAD_ROOT, BODS_REGIONS, NAPTAN_XML_URL, NPTG_XML_URL, TNDS_HOST, TNDS_PATH


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def probe_http(url: str, *, opener=urllib.request.urlopen) -> dict:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "ATLAS-bus-source-probe/1"})
    try:
        with opener(request, timeout=30) as response:
            headers = response.headers
            values = {key.lower(): headers.get(key) for key in ("ETag", "Last-Modified", "Content-Length") if headers.get(key) is not None}
            reliable = bool(values.get("etag") or (values.get("last-modified") and values.get("content-length")))
            return {"method": "HTTP HEAD", "url": url, "checkedAt": _now(), "httpStatus": getattr(response, "status", None) or response.getcode(), "metadata": values, "reliable": reliable, "classification": "RELIABLE_METADATA" if reliable else "NO_RELIABLE_METADATA"}
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as error:
        return {"method": "HTTP HEAD", "url": url, "checkedAt": _now(), "reliable": False, "classification": "PROBE_UNAVAILABLE", "error": type(error).__name__}


def probe_tnds_metadata(username: str, password: str, *, ftp_factory=ftplib.FTP) -> dict:
    result = {"method": "FTP MLSD/MDTM/SIZE", "host": TNDS_HOST, "path": TNDS_PATH, "checkedAt": _now(), "retrievalPerformed": False, "reliable": False}
    if not username or not password:
        result.update({"classification": "AUTH_REQUIRED", "capabilities": []})
        return result
    try:
        with ftp_factory(TNDS_HOST, timeout=30) as ftp:
            ftp.login(username, password)
            ftp.cwd(TNDS_PATH)
            capabilities = []
            facts = []
            if hasattr(ftp, "mlsd"):
                try:
                    facts = [{"name": name, "facts": value} for name, value in ftp.mlsd() if str(name).lower().endswith(".zip")]
                    capabilities.append("MLSD")
                except Exception:
                    pass
            names = [item["name"] for item in facts] if facts else [name for name in ftp.nlst() if str(name).lower().endswith(".zip")]
            for name in names:
                row = {"name": name}
                for command, key in ((f"MDTM {name}", "modified"),):
                    try:
                        row[key] = ftp.sendcmd(command)
                        if "MDTM" not in capabilities: capabilities.append("MDTM")
                    except Exception:
                        pass
                try:
                    row["size"] = ftp.size(name)
                    if "SIZE" not in capabilities: capabilities.append("SIZE")
                except Exception:
                    pass
                if len(row) > 1: facts.append(row)
            result.update({"capabilities": capabilities, "files": facts, "reliable": bool(facts and set(capabilities) & {"MLSD", "MDTM", "SIZE"}), "classification": "RELIABLE_METADATA" if facts and capabilities else "NO_RELIABLE_METADATA"})
    except Exception as error:
        result.update({"classification": "PROBE_UNAVAILABLE", "error": type(error).__name__, "capabilities": []})
    return result


def probe_all(*, username: str = "", password: str = "", http_opener=urllib.request.urlopen, ftp_factory=ftplib.FTP) -> dict:
    bods = {region: probe_http(f"{BODS_DOWNLOAD_ROOT}{region}/", opener=http_opener) for region in BODS_REGIONS}
    return {
        "schema": "atlas-bus-source-freshness-v1", "checkedAt": _now(),
        "naptan": probe_http(NAPTAN_XML_URL, opener=http_opener),
        "nptg": probe_http(NPTG_XML_URL, opener=http_opener),
        "bods": {"regions": bods, "regional": True},
        "tnds": probe_tnds_metadata(username, password, ftp_factory=ftp_factory),
        "metadataIsNotByteIdentity": True,
        "byteIdentity": "SHA-256 after acquisition",
    }


def metadata_fingerprint(value: dict) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = probe_all(username="", password="")
    result["fingerprint"] = metadata_fingerprint(result)
    with open(args.output, "w", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
