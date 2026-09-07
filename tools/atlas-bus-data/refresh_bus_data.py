#!/usr/bin/env python3
"""Headless authoritative Bus refresh used by local CI and GitHub Actions.

The command always builds under the supplied site root. It never replaces the
currently deployed dataset; Pages deployment is a later workflow job.
"""
from __future__ import annotations

import argparse
import csv
import ftplib
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

TNDS_REGIONS = ("EA", "EM", "NE", "NW", "SE", "SW", "WM", "Y")
NAPTAN_URL = "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv"
BODS_URL = "https://data.bus-data.dft.gov.uk/timetable/download/"
TNDS_HOST = "ftp.tnds.basemap.co.uk"
TNDS_PATH = "/TNDSV2.5/"


class RefreshError(RuntimeError):
    pass


def now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "ATLAS-bus-refresh/2.0"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
            shutil.copyfileobj(response, output)
    except Exception as error:
        raise RefreshError(f"Authoritative source could not be downloaded: {url}") from error
    if destination.stat().st_size == 0:
        raise RefreshError(f"Authoritative source was empty: {url}")


def safe_extract(archive: Path, destination: Path) -> None:
    try:
        with zipfile.ZipFile(archive) as source:
            for member in source.infolist():
                target = (destination / member.filename).resolve()
                if destination.resolve() not in target.parents:
                    raise RefreshError(f"Archive contains an unsafe path: {archive.name}")
            source.extractall(destination)
    except (zipfile.BadZipFile, OSError) as error:
        raise RefreshError(f"Corrupt or unreadable archive: {archive.name}") from error


def acquire_bods(staging: Path) -> tuple[Path, dict]:
    download_path = staging / "bods-download"
    download(BODS_URL, download_path)
    gtfs = staging / "gtfs"
    gtfs.mkdir()
    try:
        with zipfile.ZipFile(download_path) as source:
            names = source.namelist()
            if {"routes.txt", "stops.txt", "trips.txt"}.issubset(names):
                shutil.copy2(download_path, gtfs / "bods-download.zip")
            else:
                source.extractall(gtfs)
                nested_archives = sorted(gtfs.rglob("*.zip"))
                for nested in nested_archives:
                    try:
                        with zipfile.ZipFile(nested) as nested_zip:
                            if not {"routes.txt", "stops.txt", "trips.txt"}.issubset(nested_zip.namelist()):
                                raise RefreshError(f"BODS regional archive is missing required GTFS files: {nested.name}")
                        if nested.parent != gtfs:
                            shutil.copy2(nested, gtfs / nested.name)
                    except zipfile.BadZipFile as error:
                        raise RefreshError(f"BODS contained a corrupt regional archive: {nested.name}") from error
    except zipfile.BadZipFile as error:
        raise RefreshError("BODS download was not a valid ZIP/GTFS archive") from error
    archives = sorted(gtfs.rglob("*.zip"))
    if not archives and not any((path / "routes.txt").is_file() for path in gtfs.rglob("*")):
        raise RefreshError("BODS acquisition produced no GTFS feed")
    return gtfs, {"identity": BODS_URL, "sha256": sha256(download_path)}


def ftp_files(ftp_factory, username: str, password: str) -> list[str]:
    try:
        with ftp_factory(TNDS_HOST, timeout=120) as ftp:
            ftp.login(username, password)
            ftp.cwd(TNDS_PATH)
            return [name for name in ftp.nlst() if name.lower().endswith(".zip")]
    except Exception as error:
        raise RefreshError("TNDS authentication or directory acquisition failed") from error


def acquire_tnds(staging: Path, username: str, password: str, ftp_factory=ftplib.FTP) -> tuple[Path, dict]:
    if not username or not password:
        raise RefreshError("TNDS_USERNAME and TNDS_PASSWORD are required; no interactive prompt is available")
    raw = staging / "tnds-raw"
    raw.mkdir(parents=True)
    names = ftp_files(ftp_factory, username, password)
    selected = {}
    for name in names:
        upper = name.upper()
        for region in TNDS_REGIONS:
            if f"-{region}." in upper or f"_{region}." in upper or upper.startswith(f"{region}."):
                selected.setdefault(region, name)
    missing = [region for region in TNDS_REGIONS if region not in selected]
    if missing:
        raise RefreshError(f"TNDS acquisition is incomplete; missing regions: {', '.join(missing)}")
    try:
        with ftp_factory(TNDS_HOST, timeout=120) as ftp:
            ftp.login(username, password)
            ftp.cwd(TNDS_PATH)
            for region, name in selected.items():
                target = raw / name
                with target.open("wb") as output:
                    ftp.retrbinary(f"RETR {name}", output.write)
                if target.stat().st_size == 0:
                    raise RefreshError(f"TNDS archive for {region} was empty")
                safe_extract(target, staging / "tnds-xml" / region)
    except RefreshError:
        raise
    except Exception as error:
        raise RefreshError("TNDS archive acquisition failed") from error
    return staging / "tnds-xml", {"identity": f"ftp://{TNDS_HOST}{TNDS_PATH}", "regions": list(TNDS_REGIONS)}


def validate_candidate(site: Path) -> dict:
    bus_manifest_path = site / "atlas" / "data" / "bus" / "manifest.json"
    tnds_manifest_path = site / "atlas" / "data" / "bus-tnds" / "manifest.json"
    try:
        bus = json.loads(bus_manifest_path.read_text(encoding="utf-8"))
        tnds = json.loads(tnds_manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RefreshError("Prepared candidate manifests are missing or invalid") from error
    if not bus.get("stopShards") or not bus.get("serviceShards"):
        raise RefreshError("Prepared NaPTAN/BODS candidate is empty")
    if set(tnds.get("regions", [])) != set(TNDS_REGIONS) or not tnds.get("services"):
        raise RefreshError("Prepared TNDS candidate does not contain all eight England regions")
    for relative in list(bus["stopShards"].values()) + [item for values in bus["serviceShards"].values() for item in values] + tnds["services"]:
        if not (site / "atlas" / "data" / ("bus-tnds" if relative in tnds["services"] else "bus") / relative).is_file():
            raise RefreshError(f"Prepared candidate references a missing file: {relative}")
    return {"naptanStopCount": bus.get("sources", {}).get("naptan", {}).get("stopCount", 0), "bodsRegionCount": len(bus.get("sources", {}).get("bods", {}).get("regions", [])), "tndsServiceCount": len(tnds["services"])}


def run(args: argparse.Namespace) -> dict:
    started = now_utc()
    site = Path(args.site_root).resolve()
    staging = site.parent / f"atlas-bus-refresh-staging-{os.getpid()}"
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    try:
        naptan = staging / "naptan.csv"
        download(NAPTAN_URL, naptan)
        gtfs, bods = acquire_bods(staging)
        tnds_xml, tnds = acquire_tnds(staging, os.environ.get("TNDS_USERNAME", ""), os.environ.get("TNDS_PASSWORD", ""))
        site_bus = site / "atlas" / "data" / "bus"
        site_tnds = site / "atlas" / "data" / "bus-tnds"
        site_bus.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([sys.executable, str(Path(__file__).with_name("build_static_index.py")), "--naptan", str(naptan), "--gtfs-dir", str(gtfs), "--output", str(site_bus), "--snapshot-date", datetime.now(timezone.utc).date().isoformat()], check=True)
        prepared_manifest_path = site_bus / "manifest.json"
        prepared_manifest = json.loads(prepared_manifest_path.read_text(encoding="utf-8"))
        for source in ("naptan", "bods"):
            prepared_manifest.get("sources", {}).get(source, {}).pop("downloadedAt", None)
        prepared_manifest_path.write_text(json.dumps(prepared_manifest, separators=(",", ":")) + "\n", encoding="utf-8")
        node = os.environ.get("ATLAS_NODE", "node")
        subprocess.run([node, str(Path(__file__).with_name("prepare_tnds.mjs")), "--input", str(tnds_xml), "--output", str(site_tnds), "--preparedAt", started], check=True)
        counts = validate_candidate(site)
        status = {"schema": "atlas-bus-refresh-status-v1", "status": "validated", "successfulRefreshAt": started, "version": "2.0.0-alpha.7", "build": "ATLAS-2.0.0-alpha.7-20260907", "repositoryCommit": os.environ.get("GITHUB_SHA"), "workflowRun": os.environ.get("GITHUB_RUN_ID"), "sources": {"naptan": {"identity": NAPTAN_URL, "acquiredAt": started}, "bods": {**bods, "acquiredAt": started}, "tnds": {**tnds, "acquiredAt": started, "transport": "legacy FTP; credentials supplied only to the runner"}}, "preparedCounts": counts, "validation": "passed"}
        status_path = site / "atlas" / "data" / "status" / "manifest.json"
        status_path.parent.mkdir(parents=True, exist_ok=True)
        status_path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
        return status
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-root", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), indent=2))
    except RefreshError as error:
        print(f"ATLAS Bus refresh failed safely: {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
