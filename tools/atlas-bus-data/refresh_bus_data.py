#!/usr/bin/env python3
"""Headless authoritative Bus refresh used by local CI and GitHub Actions.

The command always builds under the supplied site root. It never replaces the
currently deployed dataset; Pages deployment is a later workflow job.
"""
from __future__ import annotations

import argparse
import ftplib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error
import zipfile
from datetime import datetime, timezone
from pathlib import Path

TNDS_REGIONS = ("EA", "EM", "NE", "NW", "SE", "SW", "WM", "Y")
NAPTAN_URL = "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv"
BODS_URL = "https://data.bus-data.dft.gov.uk/timetable/download/"
BODS_DOWNLOAD_ROOT = "https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/"
BODS_REGIONS = ("east_anglia", "east_midlands", "london", "north_east", "north_west", "south_east", "south_west", "west_midlands", "yorkshire")
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


def download(url: str, destination: Path, label: str = "authoritative source", opener=urllib.request.urlopen) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "ATLAS-bus-refresh/2.0 (+https://github.com/joerfreeman02/transport-planner-toolkit)"})
    last_error = None
    for attempt in range(3):
        try:
            with opener(request, timeout=120) as response, destination.open("wb") as output:
                shutil.copyfileobj(response, output)
                status = getattr(response, "status", None) or response.getcode()
                content_type = response.headers.get("Content-Type") if response.headers else None
            if destination.stat().st_size == 0:
                raise RefreshError(f"{label} returned an empty response (HTTP {status}): {url}")
            return {"identity": url, "httpStatus": status, "contentType": content_type, "sourceHash": sha256(destination)}
        except urllib.error.HTTPError as error:
            if error.code < 500 or attempt == 2:
                raise RefreshError(f"{label} returned HTTP {error.code}: {url}") from error
            last_error = error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if attempt == 2:
                raise RefreshError(f"{label} could not be downloaded: {url}") from error
            last_error = error
        if last_error:
            time.sleep(2 ** attempt)
    raise RefreshError(f"{label} could not be downloaded: {url}") from last_error


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


def acquire_bods(staging: Path, download_fn=download) -> tuple[Path, dict]:
    gtfs = staging / "gtfs"
    gtfs.mkdir(parents=True)
    metadata = []
    for region in BODS_REGIONS:
        url = f"{BODS_DOWNLOAD_ROOT}{region}/"
        archive = gtfs / f"{region}.zip"
        source = download_fn(url, archive, label=f"BODS {region} GTFS source")
        try:
            with zipfile.ZipFile(archive) as feed:
                required = {"agency.txt", "stops.txt", "routes.txt", "calendar.txt", "trips.txt", "stop_times.txt"}
                missing = sorted(required - set(feed.namelist()))
                if missing:
                    raise RefreshError(f"BODS {region} GTFS archive is missing required files: {', '.join(missing)}")
        except zipfile.BadZipFile as error:
            raise RefreshError(f"BODS {region} endpoint did not return a valid GTFS ZIP: {url}") from error
        metadata.append({"region": region, **source})
    aggregate = hashlib.sha256("".join(f"{item['region']}:{item['sourceHash']}" for item in metadata).encode("ascii")).hexdigest()
    return gtfs, {"identity": BODS_DOWNLOAD_ROOT, "regions": metadata, "sourceHash": aggregate}


def tnds_region_from_filename(name: str) -> str | None:
    """Recognise a whole region token, including TNDS-EA-v2.5.zip."""
    match = re.search(r"(?:^|[-_.])(EA|EM|NE|NW|SE|SW|WM|Y)(?:[-_.]|$)", Path(name).name, flags=re.IGNORECASE)
    return match.group(1).upper() if match else None


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
        region = tnds_region_from_filename(name)
        if region in TNDS_REGIONS:
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
    hashes = {region: sha256(raw / name) for region, name in selected.items()}
    aggregate = hashlib.sha256("".join(f"{region}:{hashes[region]}" for region in sorted(hashes)).encode("ascii")).hexdigest()
    return staging / "tnds-xml", {"identity": f"ftp://{TNDS_HOST}{TNDS_PATH}", "regions": list(TNDS_REGIONS), "regionHashes": hashes, "sourceHash": aggregate}


def candidate_metrics(site: Path) -> dict:
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
    bods_regions = bus.get("sources", {}).get("bods", {}).get("regions", [])
    return {"naptanStopCount": bus.get("sources", {}).get("naptan", {}).get("stopCount", 0), "bodsRegionCount": len(bods_regions), "bodsServiceCount": sum(int(region.get("serviceCount", 0) or 0) for region in bods_regions), "tndsRegionCount": len(tnds.get("regions", [])), "tndsServiceCount": len(tnds["services"])}


def validate_candidate(site: Path, baseline: dict | None = None) -> dict:
    metrics = candidate_metrics(site)
    baseline = baseline or {}
    for key in ("naptanStopCount", "bodsServiceCount", "tndsServiceCount"):
        previous = int(baseline.get(key, 0) or 0)
        current = int(metrics.get(key, 0) or 0)
        if previous and current < previous * 0.5:
            raise RefreshError(f"Candidate {key} collapsed from {previous} to {current}; below the 50% safety threshold")
    previous_regions = int(baseline.get("bodsRegionCount", 0) or 0)
    if previous_regions and metrics["bodsRegionCount"] < previous_regions:
        raise RefreshError(f"Candidate BODS region count collapsed from {previous_regions} to {metrics['bodsRegionCount']}")
    if metrics["tndsRegionCount"] != len(TNDS_REGIONS):
        raise RefreshError("Prepared TNDS candidate does not contain all eight England regions")
    return metrics


def baseline_metrics(site: Path) -> dict:
    manifest = site / "atlas" / "data" / "bus" / "manifest.json"
    tnds_manifest = site / "atlas" / "data" / "bus-tnds" / "manifest.json"
    if not manifest.is_file():
        return {}
    try:
        bus = json.loads(manifest.read_text(encoding="utf-8"))
        bods = bus.get("sources", {}).get("bods", {})
        result = {
            "naptanStopCount": bus.get("sources", {}).get("naptan", {}).get("stopCount", 0),
            "bodsRegionCount": len(bods.get("regions", [])),
            "bodsServiceCount": sum(int(region.get("serviceCount", 0) or 0) for region in bods.get("regions", [])),
        }
        if tnds_manifest.is_file():
            tnds = json.loads(tnds_manifest.read_text(encoding="utf-8"))
            if set(tnds.get("regions", [])) == set(TNDS_REGIONS):
                result["tndsRegionCount"] = len(tnds["regions"])
                result["tndsServiceCount"] = len(tnds.get("services", []))
        return result
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return {}


def source_outcome(source_hash: str, previous: dict | None) -> tuple[str, str | None]:
    previous_hash = (previous or {}).get("sourceHash")
    if not previous_hash:
        return "UPDATED", "INITIAL AUTOMATED BASELINE"
    return ("CHECKED_NO_CHANGE", None) if previous_hash == source_hash else ("UPDATED", None)


def run(args: argparse.Namespace) -> dict:
    started = now_utc()
    site = Path(args.site_root).resolve()
    previous_root = Path(args.previous_root).resolve() if args.previous_root else None
    previous_status_path = (previous_root or site) / "atlas" / "data" / "status" / "manifest.json"
    try:
        previous_status = json.loads(previous_status_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        previous_status = {}
    deployed_baseline = baseline_metrics(previous_root) if previous_root and previous_status else {}
    baseline = deployed_baseline if deployed_baseline else baseline_metrics(site)
    staging = site.parent / f"atlas-bus-refresh-staging-{os.getpid()}"
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    try:
        naptan = staging / "naptan.csv"
        naptan_source = download(NAPTAN_URL, naptan, label="NaPTAN source")
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
        counts = validate_candidate(site, baseline)
        naptan_hash = sha256(naptan)
        naptan_outcome, naptan_note = source_outcome(naptan_hash, previous_status.get("sources", {}).get("naptan"))
        bods_outcome, bods_note = source_outcome(bods["sourceHash"], previous_status.get("sources", {}).get("bods"))
        tnds_outcome, tnds_note = source_outcome(tnds["sourceHash"], previous_status.get("sources", {}).get("tnds"))
        sources = {
            "naptan": {"identity": NAPTAN_URL, "checkedAt": started, "httpStatus": naptan_source["httpStatus"], "contentType": naptan_source["contentType"], "sourceHash": naptan_hash, "outcome": naptan_outcome, "preparedCount": counts["naptanStopCount"]},
            "bods": {"identity": bods["identity"], "checkedAt": started, "sourceHash": bods["sourceHash"], "outcome": bods_outcome, "regionsChecked": bods["regions"], "preparedCount": {"regions": counts["bodsRegionCount"], "services": counts["bodsServiceCount"]}},
            "tnds": {"identity": tnds["identity"], "checkedAt": started, "sourceHash": tnds["sourceHash"], "regionHashes": tnds["regionHashes"], "regionsChecked": tnds["regions"], "outcome": tnds_outcome, "preparedCount": counts["tndsServiceCount"], "transport": "legacy FTP; credentials supplied only to the runner"},
            "tfl": {"outcome": "LIVE", "description": "Live source — checked when a London assessment is run"}
        }
        for source, note in (("naptan", naptan_note), ("bods", bods_note), ("tnds", tnds_note)):
            if note: sources[source]["note"] = note
        status = {"schema": "atlas-bus-refresh-status-v1", "status": "validated", "successfulRefreshAt": started, "version": "2.0.0-alpha.7", "build": "ATLAS-2.0.0-alpha.7-20260907", "repositoryCommit": os.environ.get("GITHUB_SHA"), "workflowRun": os.environ.get("GITHUB_RUN_ID"), "sources": sources, "preparedCounts": counts, "validation": "passed", "sanityThresholds": {"collapseMinimum": 0.5, "description": "Existing meaningful baselines must retain at least 50% of stop/service counts; BODS region count may not decrease."}}
        status_path = site / "atlas" / "data" / "status" / "manifest.json"
        status_path.parent.mkdir(parents=True, exist_ok=True)
        status_path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
        return status
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-root", required=True)
    parser.add_argument("--previous-root", help="Optional read-only copy of the last successful Pages deployment")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), indent=2))
    except RefreshError as error:
        print(f"ATLAS Bus refresh failed safely: {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
