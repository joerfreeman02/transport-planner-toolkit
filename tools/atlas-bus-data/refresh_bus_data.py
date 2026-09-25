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

from source_snapshot import materialise_for_preparation, snapshot_from_staging

TNDS_REGIONS = ("EA", "EM", "NE", "NW", "SE", "SW", "WM", "Y")
NAPTAN_URL = "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv"
NAPTAN_XML_URL = "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=xml"
NPTG_XML_URL = "https://naptan.api.dft.gov.uk/v1/nptg"
BODS_URL = "https://data.bus-data.dft.gov.uk/timetable/download/"
BODS_DOWNLOAD_ROOT = "https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/"
BODS_REGIONS = ("east_anglia", "east_midlands", "london", "north_east", "north_west", "south_east", "south_west", "west_midlands", "yorkshire")
TNDS_HOST = "ftp.tnds.basemap.co.uk"
TNDS_PATH = "/TNDSV2.5/"
TNDS_TRANSFER_ATTEMPTS = 3
TNDS_TRANSFER_BACKOFF_SECONDS = (1, 2)


class RefreshError(RuntimeError):
    pass


def load_release_metadata(site: Path) -> dict[str, str]:
    metadata_path = site / "atlas" / "config" / "atlas-release.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        version = str(metadata["version"])
        build = str(metadata["build"])
    except (OSError, KeyError, TypeError, ValueError) as error:
        raise RefreshError(f"ATLAS release metadata is missing or invalid: {metadata_path}") from error
    if not re.fullmatch(r"\d+\.\d+\.\d+-alpha\.\d+", version) or not re.fullmatch(rf"ATLAS-{re.escape(version)}-\d{{8}}", build):
        raise RefreshError(f"ATLAS release metadata has invalid version/build identity: {metadata_path}")
    return {"version": version, "build": build}


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


def acquire_prepared_data_v2_sources(staging: Path, download_fn=download, naptan_url: str = NAPTAN_XML_URL) -> tuple[Path, Path, dict]:
    """Acquire and hash the v2 foundation sources without building or publishing.

    The caller may choose an ATCO-area query (for example 490 or 210) through
    ``naptan_url`` for bounded checks.  No
    source is interpreted as CSV and no raw response is retained in the
    prepared output; only hashes and schema metadata are returned.
    """
    naptan = staging / "naptan.xml"
    nptg = staging / "nptg.xml"
    naptan_source = download_fn(naptan_url, naptan, label="NaPTAN XML source")
    nptg_source = download_fn(NPTG_XML_URL, nptg, label="NPTG XML source")
    return naptan, nptg, {"naptan": {"identity": naptan_url, **naptan_source}, "nptg": {"identity": NPTG_XML_URL, **nptg_source}}


def safe_extract(archive: Path, destination: Path) -> None:
    try:
        destination.mkdir(parents=True, exist_ok=True)
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
    print(f"BODS: all {len(BODS_REGIONS)} regional GTFS feeds acquired", flush=True)
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


def _safe_ftp_error(error: BaseException, username: str, password: str) -> str:
    message = str(error).strip() or type(error).__name__
    for secret in (username, password):
        if secret:
            message = message.replace(secret, "[redacted]")
    return message


def _is_retryable_ftp_error(error: BaseException) -> bool:
    return isinstance(error, (ConnectionError, EOFError, TimeoutError, OSError, ftplib.error_temp))


def _download_tnds_region(
    raw: Path,
    staging: Path,
    region: str,
    name: str,
    username: str,
    password: str,
    ftp_factory,
    sleep_fn=time.sleep,
) -> int:
    target = raw / name
    partial = raw / f".{name}.part"
    extracted = staging / "tnds-xml" / region
    for attempt in range(1, TNDS_TRANSFER_ATTEMPTS + 1):
        partial.unlink(missing_ok=True)
        target.unlink(missing_ok=True)
        try:
            with ftp_factory(TNDS_HOST, timeout=120) as ftp:
                ftp.login(username, password)
                ftp.cwd(TNDS_PATH)
                with partial.open("wb") as output:
                    ftp.retrbinary(f"RETR {name}", output.write)
            size = partial.stat().st_size
            if size == 0:
                raise RefreshError(f"TNDS {region} archive was empty")
            partial.replace(target)
            safe_extract(target, extracted)
            print(f"TNDS {region}: transfer complete ({size} bytes)", flush=True)
            return size
        except RefreshError as error:
            category = "archive validation"
            retryable = False
            message = _safe_ftp_error(error, username, password)
        except Exception as error:
            category = "transient FTP/network" if _is_retryable_ftp_error(error) else "FTP transfer"
            retryable = _is_retryable_ftp_error(error)
            message = _safe_ftp_error(error, username, password)
        finally:
            partial.unlink(missing_ok=True)
            if target.exists() and not extracted.exists():
                target.unlink(missing_ok=True)

        print(
            f"TNDS {region} download attempt {attempt}/{TNDS_TRANSFER_ATTEMPTS} failed "
            f"({category}) for {name}: {message}",
            file=sys.stderr,
            flush=True,
        )
        if not retryable or attempt == TNDS_TRANSFER_ATTEMPTS:
            raise RefreshError(
                f"TNDS {region} archive acquisition failed after {attempt}/{TNDS_TRANSFER_ATTEMPTS} "
                f"attempts ({name}; {category}: {message})"
            )
        sleep_fn(TNDS_TRANSFER_BACKOFF_SECONDS[attempt - 1])
    raise AssertionError("unreachable")


def acquire_tnds(
    staging: Path,
    username: str,
    password: str,
    ftp_factory=ftplib.FTP,
    sleep_fn=time.sleep,
) -> tuple[Path, dict]:
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
    sizes = {}
    for region in TNDS_REGIONS:
        sizes[region] = _download_tnds_region(
            raw,
            staging,
            region,
            selected[region],
            username,
            password,
            ftp_factory,
            sleep_fn=sleep_fn,
        )
    hashes = {region: sha256(raw / name) for region, name in selected.items()}
    aggregate = hashlib.sha256("".join(f"{region}:{hashes[region]}" for region in sorted(hashes)).encode("ascii")).hexdigest()
    return staging / "tnds-xml", {"identity": f"ftp://{TNDS_HOST}{TNDS_PATH}", "regions": list(TNDS_REGIONS), "regionHashes": hashes, "regionBytes": sizes, "sourceHash": aggregate}


def validate_tnds_region_coverage(tnds_manifest: dict) -> tuple[list[str], dict[str, int]]:
    processed_regions = sorted({str(region).strip().upper() for region in tnds_manifest.get("regions", []) if str(region).strip()})
    if set(processed_regions) != set(TNDS_REGIONS):
        expected = ", ".join(TNDS_REGIONS)
        received = ", ".join(processed_regions) or "none"
        raise RefreshError(f"Prepared TNDS candidate region coverage incomplete: expected {expected}; received {received}")

    raw_counts = tnds_manifest.get("regionServiceCounts")
    if not isinstance(raw_counts, dict):
        raise RefreshError("Prepared TNDS candidate regionServiceCounts are missing or malformed")
    region_counts: dict[str, int] = {}
    for raw_region, count in raw_counts.items():
        region = str(raw_region).strip().upper()
        if region in region_counts:
            raise RefreshError(f"Prepared TNDS candidate regionServiceCounts contains duplicate region {region}")
        region_counts[region] = count
    for region in TNDS_REGIONS:
        if region not in region_counts:
            raise RefreshError(f"Prepared TNDS candidate regionServiceCounts missing region {region}")
        count = region_counts[region]
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise RefreshError(f"Prepared TNDS candidate regionServiceCounts for region {region} is malformed")
        if count == 0:
            raise RefreshError(f"Prepared TNDS candidate retained no services for region {region}.")

    service_count = tnds_manifest.get("serviceCount")
    if isinstance(service_count, bool) or not isinstance(service_count, int) or service_count < 0:
        raise RefreshError("Prepared TNDS candidate serviceCount is missing or malformed")
    expected_service_count = sum(region_counts[region] for region in TNDS_REGIONS)
    if expected_service_count != service_count:
        raise RefreshError(
            f"Prepared TNDS candidate regionServiceCounts total {expected_service_count} "
            f"does not match serviceCount {service_count}"
        )
    return processed_regions, {region: region_counts[region] for region in TNDS_REGIONS}


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
    tnds_shards = tnds.get("serviceShards")
    if "services" in tnds:
        raise RefreshError("Prepared TNDS candidate contains obsolete inline services; expected stop-prefix service shards")
    if not isinstance(tnds_shards, dict) or not tnds_shards:
        raise RefreshError("Prepared TNDS candidate serviceShards are missing or malformed")
    received_regions, region_service_counts = validate_tnds_region_coverage(tnds)
    tnds_paths = [item for values in tnds_shards.values() for item in values] if all(isinstance(values, list) for values in tnds_shards.values()) else []
    if not tnds_paths or not isinstance(tnds.get("serviceShardKeyLength"), int) or tnds["serviceShardKeyLength"] < 1:
        raise RefreshError("Prepared TNDS candidate does not contain valid stop-prefix shards")
    for relative in list(bus["stopShards"].values()) + [item for values in bus["serviceShards"].values() for item in values] + tnds_paths:
        if not (site / "atlas" / "data" / ("bus-tnds" if relative in tnds_paths else "bus") / relative).is_file():
            raise RefreshError(f"Prepared candidate references a missing file: {relative}")
    bods_regions = bus.get("sources", {}).get("bods", {}).get("regions", [])
    counts = bus.get("counts", {}) if bus.get("schema") == "atlas-prepared-bus-data-v2" else {}
    metrics = {
        "naptanStopCount": bus.get("sources", {}).get("naptan", {}).get("stopCount", 0),
        "bodsRegionCount": len(bods_regions),
        "bodsServiceCount": sum(int(region.get("serviceCount", 0) or 0) for region in bods_regions),
        "tndsRegionCount": len(received_regions),
        "tndsProcessedRegions": received_regions,
        "tndsRegionServiceCounts": region_service_counts,
        "tndsSourceFileCounts": tnds.get("sourceFileCounts", {}),
        "tndsParsedFileCounts": tnds.get("parsedFileCounts", {}),
        "tndsIgnoredRegistrationFileCounts": tnds.get("ignoredRegistrationFileCounts", {}),
        "tndsServiceCount": tnds["serviceCount"],
    }
    if bus.get("schema") == "atlas-prepared-bus-data-v2":
        metrics.update({
            "activeStopPointCount": counts.get("activeStopPointCount", metrics["naptanStopCount"]),
            "logicalGroupCount": counts.get("logicalGroupCount", 0),
            "localityCount": counts.get("localityCount", 0),
            "districtCount": counts.get("districtCount", 0),
            "stopShardCount": counts.get("stopShardCount", len(bus.get("stopShards", {}))),
            "serviceShardCount": counts.get("serviceShardCount", sum(len(value) for value in bus.get("serviceShards", {}).values())),
            "logicalGroupShardCount": counts.get("logicalGroupShardCount", len(bus.get("groupShards", {}))),
            "localityShardCount": counts.get("localityShardCount", len(bus.get("localityShards", {}))),
            "v2Qa": bus.get("qa", {}),
        })
    return metrics


def bus_candidate_metrics(site: Path) -> dict:
    """Validate and measure only the Bus v2 candidate; never requires TNDS."""
    bus_manifest_path = site / "atlas" / "data" / "bus" / "manifest.json"
    try:
        bus = json.loads(bus_manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RefreshError("Prepared Bus v2 manifest is missing or invalid") from error
    if bus.get("schema") != "atlas-prepared-bus-data-v2":
        raise RefreshError("Bus-only diagnostic requires the prepared Bus v2 schema")
    if not bus.get("stopShards") or not bus.get("serviceShards"):
        raise RefreshError("Prepared Bus v2 candidate is empty")
    roots = site / "atlas" / "data" / "bus"
    paths = list(bus["stopShards"].values()) + [path for paths in bus["serviceShards"].values() for path in paths]
    paths += list(bus.get("groupShards", {}).values()) + list(bus.get("localityShards", {}).values())
    paths += list(bus.get("referenceStopPointShards", {}).values())
    for relative in paths:
        if not (roots / relative).is_file():
            raise RefreshError(f"Prepared Bus v2 candidate references a missing file: {relative}")
    counts = bus.get("counts", {})
    return {
        "naptanStopCount": bus.get("sources", {}).get("naptan", {}).get("stopCount", 0),
        "bodsRegionCount": len(bus.get("sources", {}).get("bods", {}).get("regions", [])),
        "bodsServiceCount": sum(int(region.get("serviceCount", 0) or 0) for region in bus.get("sources", {}).get("bods", {}).get("regions", [])),
        "activeStopPointCount": counts.get("activeStopPointCount", 0),
        "logicalGroupCount": counts.get("logicalGroupCount", 0),
        "localityCount": counts.get("localityCount", 0),
        "districtCount": counts.get("districtCount", 0),
        "referenceStopPointCount": counts.get("referenceStopPointCount", 0),
        "stopShardCount": counts.get("stopShardCount", 0),
        "serviceShardCount": counts.get("serviceShardCount", 0),
        "diagnosticOnly": True,
    }


def validate_candidate(site: Path, baseline: dict | None = None, bus_only: bool = False) -> dict:
    metrics = bus_candidate_metrics(site) if bus_only else candidate_metrics(site)
    baseline = baseline or {}
    keys = ("naptanStopCount", "bodsServiceCount") if bus_only else ("naptanStopCount", "bodsServiceCount", "tndsServiceCount")
    for key in keys:
        previous = int(baseline.get(key, 0) or 0)
        current = int(metrics.get(key, 0) or 0)
        if previous and current < previous * 0.5:
            raise RefreshError(f"Candidate {key} collapsed from {previous} to {current}; below the 50% safety threshold")
    previous_regions = int(baseline.get("bodsRegionCount", 0) or 0)
    if previous_regions and metrics["bodsRegionCount"] < previous_regions:
        raise RefreshError(f"Candidate BODS region count collapsed from {previous_regions} to {metrics['bodsRegionCount']}")
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
                result["tndsServiceCount"] = int(tnds.get("serviceCount", len(tnds.get("services", []))) or 0)
        return result
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return {}


def source_outcome(source_hash: str, previous: dict | None) -> tuple[str, str | None]:
    previous_hash = (previous or {}).get("sourceHash")
    if not previous_hash:
        return "UPDATED", "INITIAL AUTOMATED BASELINE"
    return ("CHECKED_NO_CHANGE", None) if previous_hash == source_hash else ("UPDATED", None)


def source_snapshot_status(manifest: dict) -> dict:
    """Render snapshot provenance from the authoritative snapshot manifest."""
    reuse = manifest.get("reuse") if isinstance(manifest.get("reuse"), dict) else {}
    return {
        "schema": manifest["schema"],
        "snapshotId": manifest["snapshotId"],
        "state": manifest["state"],
        "reused": bool(reuse.get("reused", False)),
        "reuseMode": manifest.get("reuseMode"),
        "reuse": reuse,
        "currentSourceFreshnessClaimed": manifest.get("currentSourceFreshnessClaimed"),
        "diagnosticOnly": manifest["diagnosticOnly"],
        "productionEligible": manifest["productionEligible"],
    }


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
    prepared_schema = getattr(args, "prepared_schema", "v1")
    bus_only = bool(getattr(args, "bus_only_diagnostic", False))
    if bus_only and prepared_schema != "v2":
        raise RefreshError("Bus-only diagnostic requires prepared schema v2")
    if prepared_schema not in {"v1", "v2"}:
        raise RefreshError("prepared schema must be v1 or v2")
    staging = site.parent / f"atlas-bus-refresh-staging-{os.getpid()}"
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    try:
        snapshot_root = Path(args.source_snapshot).resolve() if getattr(args, "source_snapshot", None) else None
        if getattr(args, "acquisition_disabled", False) and not snapshot_root:
            raise RefreshError("--acquisition-disabled requires --source-snapshot")
        snapshot_manifest = None
        if snapshot_root:
            if prepared_schema != "v2":
                raise RefreshError("--source-snapshot is supported only for prepared-data v2")
            naptan, nptg, gtfs, snapshot_manifest = materialise_for_preparation(snapshot_root, staging)
            entries = {item["path"]: item for item in snapshot_manifest["sources"]}
            naptan_entry = entries["sources/naptan.xml"]
            nptg_entry = entries["sources/nptg.xml"]
            naptan_source = {"identity": naptan_entry["sourceIdentity"], "sourceHash": naptan_entry["sha256"], "httpStatus": None, "contentType": "application/xml", "remoteMetadata": naptan_entry.get("remoteMetadata", {})}
            xml_sources = {"naptan": naptan_source, "nptg": {"identity": nptg_entry["sourceIdentity"], "sourceHash": nptg_entry["sha256"], "httpStatus": None, "contentType": "application/xml", "remoteMetadata": nptg_entry.get("remoteMetadata", {})}}
            bods_regions = []
            for region in snapshot_manifest["regions"]:
                entry = entries[f"sources/bods/{region}.zip"]
                bods_regions.append({"region": region, "identity": entry["sourceIdentity"], "sourceHash": entry["sha256"], "sha256": entry["sha256"], "bytes": entry["bytes"], "remoteMetadata": entry.get("remoteMetadata", {}), "reused": True})
            bods = {"identity": "verified source snapshot", "regions": bods_regions, "sourceHash": hashlib.sha256("".join(f"{item['region']}:{item['sourceHash']}" for item in bods_regions).encode("ascii")).hexdigest()}
        elif prepared_schema == "v2":
            naptan, nptg, xml_sources = acquire_prepared_data_v2_sources(staging)
            naptan_source = xml_sources["naptan"]
            gtfs, bods = acquire_bods(staging)
        else:
            naptan = staging / "naptan.csv"
            naptan_source = download(NAPTAN_URL, naptan, label="NaPTAN source")
            gtfs, bods = acquire_bods(staging)
        if getattr(args, "source_snapshot_output", None) and not snapshot_root:
            if prepared_schema != "v2":
                raise RefreshError("--source-snapshot-output is supported only for prepared-data v2")
            snapshot_manifest = snapshot_from_staging(staging, Path(args.source_snapshot_output).resolve(), xml_sources=xml_sources, bods=bods, producer_workflow=os.environ.get("GITHUB_WORKFLOW"), run_id=os.environ.get("GITHUB_RUN_ID"), repository_commit_sha=os.environ.get("GITHUB_SHA"))
        tnds_xml = None
        tnds = None
        if not bus_only:
            tnds_xml, tnds = acquire_tnds(staging, os.environ.get("TNDS_USERNAME", ""), os.environ.get("TNDS_PASSWORD", ""))
        site_bus = site / "atlas" / "data" / "bus"
        site_tnds = site / "atlas" / "data" / "bus-tnds"
        site_bus.parent.mkdir(parents=True, exist_ok=True)
        build_command = [sys.executable, str(Path(__file__).with_name("build_static_index.py")), "--gtfs-dir", str(gtfs), "--output", str(site_bus), "--snapshot-date", datetime.now(timezone.utc).date().isoformat(), "--generated-at", started]
        if prepared_schema == "v2":
            build_command.extend(["--schema", "atlas-prepared-bus-data-v2", "--naptan-xml", str(naptan), "--nptg-xml", str(nptg)])
        else:
            build_command.extend(["--naptan", str(naptan)])
        subprocess.run(build_command, check=True)
        prepared_manifest_path = site_bus / "manifest.json"
        prepared_manifest = json.loads(prepared_manifest_path.read_text(encoding="utf-8"))
        for source in (("naptan", "nptg", "bods") if prepared_schema == "v2" else ("naptan", "bods")):
            prepared_manifest.get("sources", {}).get(source, {}).pop("downloadedAt", None)
        prepared_manifest_path.write_text(json.dumps(prepared_manifest, separators=(",", ":")) + "\n", encoding="utf-8")
        if bus_only:
            diagnostic_cache = site / ".atlas-diagnostic-source-cache" / "gtfs"
            shutil.rmtree(diagnostic_cache.parent, ignore_errors=True)
            diagnostic_cache.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(gtfs, diagnostic_cache)
        else:
            node = os.environ.get("ATLAS_NODE", "node")
            subprocess.run([node, str(Path(__file__).with_name("prepare_tnds.mjs")), "--input", str(tnds_xml), "--output", str(site_tnds), "--preparedAt", started], check=True)
        counts = validate_candidate(site, baseline, bus_only=bus_only)
        naptan_hash = sha256(naptan)
        naptan_outcome, naptan_note = source_outcome(naptan_hash, previous_status.get("sources", {}).get("naptan"))
        bods_outcome, bods_note = source_outcome(bods["sourceHash"], previous_status.get("sources", {}).get("bods"))
        sources = {
            "naptan": {"identity": NAPTAN_XML_URL if prepared_schema == "v2" else NAPTAN_URL, "checkedAt": started, "httpStatus": naptan_source["httpStatus"], "contentType": naptan_source["contentType"], "sourceHash": naptan_hash, "outcome": naptan_outcome, "preparedCount": counts["naptanStopCount"], "format": "xml" if prepared_schema == "v2" else "csv"},
            "bods": {"identity": bods["identity"], "checkedAt": started, "sourceHash": bods["sourceHash"], "outcome": bods_outcome, "regionsChecked": bods["regions"], "preparedCount": {"regions": counts["bodsRegionCount"], "services": counts["bodsServiceCount"]}},
            "tfl": {"outcome": "LIVE", "description": "Live source — checked when a London assessment is run"}
        }
        if not bus_only:
            tnds_outcome, tnds_note = source_outcome(tnds["sourceHash"], previous_status.get("sources", {}).get("tnds"))
            sources["tnds"] = {"identity": tnds["identity"], "checkedAt": started, "sourceHash": tnds["sourceHash"], "regionHashes": tnds["regionHashes"], "regionsChecked": tnds["regions"], "outcome": tnds_outcome, "preparedCount": counts["tndsServiceCount"], "processedRegions": counts["tndsProcessedRegions"], "regionServiceCounts": counts["tndsRegionServiceCounts"], "sourceFileCounts": counts["tndsSourceFileCounts"], "parsedFileCounts": counts["tndsParsedFileCounts"], "ignoredRegistrationFileCounts": counts["tndsIgnoredRegistrationFileCounts"], "transport": "legacy FTP; credentials supplied only to the runner"}
        if prepared_schema == "v2":
            nptg_hash = sha256(nptg)
            nptg_outcome, nptg_note = source_outcome(nptg_hash, previous_status.get("sources", {}).get("nptg"))
            sources["nptg"] = {"identity": NPTG_XML_URL, "checkedAt": started, "httpStatus": xml_sources["nptg"]["httpStatus"], "contentType": xml_sources["nptg"]["contentType"], "sourceHash": nptg_hash, "outcome": nptg_outcome, "format": "xml"}
            if nptg_note: sources["nptg"]["note"] = nptg_note
        if snapshot_manifest:
            sources["sourceSnapshot"] = source_snapshot_status(snapshot_manifest)
        notes = [("naptan", naptan_note), ("bods", bods_note)]
        if not bus_only:
            notes.append(("tnds", tnds_note))
        for source, note in notes:
            if note: sources[source]["note"] = note
        release = load_release_metadata(site)
        status = {"schema": "atlas-bus-refresh-status-v1", "status": "sanity_checked" if bus_only else "validated", "candidateGeneratedAt": started, "version": release["version"], "build": release["build"], "repositoryCommit": os.environ.get("GITHUB_SHA"), "workflowRun": os.environ.get("GITHUB_RUN_ID"), "sources": sources, "preparedCounts": counts, "validation": "diagnostic_only" if bus_only else "passed", "diagnosticOnly": bus_only, "productionEligible": not bus_only, "sanityThresholds": {"collapseMinimum": 0.5, "description": "Existing meaningful baselines must retain at least 50% of stop/service counts; BODS region count may not decrease."}}
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
    parser.add_argument("--prepared-schema", choices=("v1", "v2"), default="v1", help="Prepared-data contract; v2 acquires XML NaPTAN and NPTG sources")
    parser.add_argument("--bus-only-diagnostic", action="store_true", help="Acquire and validate only the Bus v2 diagnostic; never contact TNDS FTP")
    parser.add_argument("--source-snapshot", help="Verified ACQUIRED / UNINTERPRETED source snapshot to prepare without acquisition")
    parser.add_argument("--source-snapshot-output", help="Write the freshly acquired v2 Bus sources as a reusable snapshot")
    parser.add_argument("--acquisition-disabled", action="store_true", help="Fail closed unless an explicit verified source snapshot is supplied")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), indent=2))
    except RefreshError as error:
        print(f"ATLAS Bus refresh failed safely: {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
