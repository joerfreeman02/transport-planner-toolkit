"""Offline checks for the quarantine extractor; no credentials or network used."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from refresh_bus_data import TNDS_REGIONS
import tnds_trust_diagnostic as diagnostic
from tnds_trust_diagnostic import (_extract_quarantined, immutable_prepared_at,
                                   prepare_tnds_handoff)

PREPARED_AT = "2026-10-13T17:42:00.000Z"
SERVICE_XML = '''<TransXChange SchemaVersion="2.5"><Operators><Operator><TradingName>Fixture Operator</TradingName></Operator></Operators><Services><Service><ServiceCode>FIXTURE</ServiceCode><LineName>F1</LineName><StandardService><Origin>EA001</Origin><Destination>EA002</Destination></StandardService></Service></Services><StopPoints><AnnotatedStopPointRef><StopPointRef>EA001</StopPointRef><CommonName>Origin</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>EA002</StopPointRef><CommonName>Destination</CommonName></AnnotatedStopPointRef></StopPoints><JourneyPatternSections><JourneyPatternSection id="JPS-FIXTURE"><JourneyPatternTimingLink><From><StopPointRef>EA001</StopPointRef></From><To><StopPointRef>EA002</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink></JourneyPatternSection></JourneyPatternSections><JourneyPatterns><JourneyPattern id="JP-FIXTURE"><Direction>outbound</Direction><DestinationDisplay>Destination</DestinationDisplay><JourneyPatternSectionRefs>JPS-FIXTURE</JourneyPatternSectionRefs></JourneyPattern></JourneyPatterns><VehicleJourneys><VehicleJourney><VehicleJourneyCode>V-FIXTURE</VehicleJourneyCode><JourneyPatternRef>JP-FIXTURE</JourneyPatternRef><DepartureTime>08:00:00</DepartureTime><OperatingProfile><MondayToFriday>true</MondayToFriday></OperatingProfile></VehicleJourney></VehicleJourneys></TransXChange>'''


def make_snapshot(root: Path, services_per_region: int = 1) -> Path:
    snapshot = root / "snapshot"
    sources = snapshot / "sources"
    sources.mkdir(parents=True)
    entries = []
    for region in TNDS_REGIONS:
        archive_path = sources / f"{region}.zip"
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
            for index in range(services_per_region):
                code = f"{region}-SERVICE-{index:04d}"
                first_prefix = f"{region}X{index % 16:02d}" if region != "Y" else f"YXX{index % 16:02d}"
                second_prefix = f"{region}Z{index % 16:02d}" if region != "Y" else f"YZZ{index % 16:02d}"
                xml = (SERVICE_XML.replace("FIXTURE", code).replace("V-FIXTURE", f"V-{code}")
                       .replace("EA001", first_prefix + "1").replace("EA002", second_prefix + "2"))
                archive.writestr(f"{region}/service-{index:04d}.xml", xml)
        data = archive_path.read_bytes()
        entries.append({"path": f"sources/{region}.zip", "region": region,
                        "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    snapshot_id = hashlib.sha256("".join(item["sha256"] for item in sorted(entries, key=lambda item: item["path"])).encode("ascii")).hexdigest()
    manifest = {"schema": "atlas-bus-tnds-source-snapshot-v1",
                "state": "ACQUIRED / UNINTERPRETED / VERIFIED / QUARANTINED",
                "quarantined": True, "productionEligible": False, "runtimeActive": False,
                "snapshotId": snapshot_id, "createdAt": PREPARED_AT, "sourceCount": 8,
                "completedRegionCount": 8, "sources": entries}
    (snapshot / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return snapshot


class QuarantinedExtractionTests(unittest.TestCase):
    def test_capacity_inspection_reads_zip_metadata_without_extracting(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp)
            snapshot = make_snapshot(root)
            report = diagnostic.inspect_tnds_capacity(snapshot, free_bytes=1)
            self.assertEqual(report["status"], "CAPACITY_BLOCKED")
            self.assertFalse(report["extractionStarted"])
            self.assertEqual(len(report["perRegion"]), 8)
            self.assertEqual(report["memberCount"], 8)
            self.assertGreater(report["compressedSourceBytes"], 0)
            self.assertGreater(report["uncompressedMemberBytes"], 0)
            self.assertEqual(report["diskReserveBytes"], diagnostic.DISK_RESERVE_BYTES)
            self.assertGreaterEqual(report["requiredFreeBytes"], report["compressedSourceBytes"] + report["diskReserveBytes"])
            self.assertFalse((snapshot.parent / "tnds-extracted-input").exists())
            evidence = root / "evidence"
            with patch.object(diagnostic, "inspect_tnds_capacity", return_value=report):
                with self.assertRaisesRegex(RuntimeError, "capacity gate blocked"):
                    diagnostic.capacity_checkpoint(snapshot, evidence)
            state = json.loads((evidence / "run-evidence.json").read_text(encoding="utf-8"))
            self.assertEqual(state["stage"], "CAPACITY_BLOCKED")
            self.assertEqual(state["result"], "CAPACITY_BLOCKED")
            self.assertFalse((snapshot.parent / "tnds-extracted-input").exists())

    def test_reused_checkpoint_requires_exact_producer_run_name_and_repository(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp)
            snapshot = make_snapshot(root)
            manifest_path = snapshot / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["producer"] = {"runId": "12345", "repository": "owner/repo"}
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with patch.dict(os.environ, {"GITHUB_REPOSITORY": "owner/repo"}), \
                 patch.object(diagnostic, "acquire_tnds_snapshot") as acquire:
                verified = diagnostic.verify_reused_checkpoint(snapshot, root / "evidence",
                    producer_run_id="12345", artifact_name="atlas-tnds-quarantined-12345")
                acquire.assert_not_called()
                self.assertEqual(verified["snapshotId"], manifest["snapshotId"])
                evidence = json.loads((root / "evidence/run-evidence.json").read_text(encoding="utf-8"))
                self.assertFalse(evidence["currentFreshnessClaimed"])
            with self.assertRaises(ValueError):
                diagnostic.verify_reused_checkpoint(snapshot, root / "wrong-name-evidence",
                    producer_run_id="12345", artifact_name="atlas-tnds-quarantined-99999")
            with self.assertRaises(ValueError):
                diagnostic.verify_reused_checkpoint(snapshot, root / "wrong-run-evidence",
                    producer_run_id="99999", artifact_name="atlas-tnds-quarantined-99999")
            with patch.dict(os.environ, {"GITHUB_REPOSITORY": "different/repo"}):
                with self.assertRaisesRegex(Exception, "repository"):
                    diagnostic.verify_reused_checkpoint(snapshot, root / "wrong-repository-evidence",
                        producer_run_id="12345", artifact_name="atlas-tnds-quarantined-12345")

    def test_altered_archive_hash_and_duplicate_region_fail_closed(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp)
            snapshot = make_snapshot(root)
            archive = snapshot / "sources/EA.zip"
            archive.write_bytes(archive.read_bytes() + b"tamper")
            with self.assertRaisesRegex(Exception, "changed|hash|size|source"):
                diagnostic.load_and_verify_tnds_snapshot(snapshot)
            duplicate_root = root / "duplicate"
            duplicate = make_snapshot(duplicate_root)
            path = duplicate / "manifest.json"
            manifest = json.loads(path.read_text(encoding="utf-8"))
            manifest["sources"][-1]["region"] = manifest["sources"][0]["region"]
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(Exception, "unexpected source path or region|duplicate region"):
                diagnostic.load_and_verify_tnds_snapshot(duplicate)

    def test_raw_checkpoint_is_durable_before_a_later_preparation_failure(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp)
            source_snapshot = make_snapshot(root)
            source_manifest = json.loads((source_snapshot / "manifest.json").read_text(encoding="utf-8"))
            raw = root / "run/tnds-quarantined-snapshot"
            evidence = root / "run/tnds-evidence"

            def acquire(destination, _username, _password):
                shutil.copytree(source_snapshot, destination, dirs_exist_ok=True)
                return source_manifest

            def prepare_failure(*args, **kwargs):
                kwargs["stage_callback"]("PREPARATION_STARTED")
                raise RuntimeError("fixture prepare failure")

            with patch.object(diagnostic, "acquire_tnds_snapshot", side_effect=acquire), \
                 patch.object(diagnostic, "inspect_tnds_capacity", return_value={"status": "CAPACITY_SUFFICIENT", "extractionStarted": False}), \
                 patch.object(diagnostic, "prepare_tnds_handoff", side_effect=prepare_failure), \
                 patch.dict(os.environ, {"GITHUB_RUN_ID": "current-run", "GITHUB_OUTPUT": str(root / "outputs")}):
                diagnostic.acquire_raw_checkpoint(raw, evidence)
                self.assertTrue((raw / "manifest.json").is_file())
                self.assertEqual(json.loads((evidence / "run-evidence.json").read_text())["stage"], "RAW_SNAPSHOT_VERIFIED")
                self.assertIn("snapshot_available=true", (root / "outputs").read_text(encoding="utf-8"))
                with self.assertRaisesRegex(RuntimeError, "fixture prepare failure"):
                    diagnostic.prepare_checkpoint(raw, evidence, source_producer_run_id="current-run")
            self.assertTrue((raw / "manifest.json").is_file())
            self.assertEqual(len(list((raw / "sources").glob("*.zip"))), 8)
            final_evidence = json.loads((evidence / "run-evidence.json").read_text(encoding="utf-8"))
            self.assertEqual(final_evidence["stage"], "PREPARATION_FAILED")
            self.assertFalse(final_evidence["publicationAttempted"])
            self.assertFalse(final_evidence["deploymentAttempted"])

    def test_incomplete_raw_acquisition_never_marks_snapshot_available_for_upload(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp)
            outputs = []
            with patch.object(diagnostic, "acquire_tnds_snapshot", side_effect=RuntimeError("interrupted transfer")), \
                 patch.object(diagnostic, "_write_output", side_effect=lambda name, value: outputs.append((name, value))), \
                 patch.dict(os.environ, {"TNDS_USERNAME": "masked-user", "TNDS_PASSWORD": "masked-password"}):
                with self.assertRaisesRegex(RuntimeError, "interrupted transfer"):
                    diagnostic.acquire_raw_checkpoint(root / "raw", root / "evidence")
            self.assertNotIn(("snapshot_available", "true"), outputs)

    def test_archive_members_are_scoped_under_region_and_extractable(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp); archive_path = root / "EA.zip"
            with zipfile.ZipFile(archive_path, "w") as archive: archive.writestr("Services/service.xml", "<TransXChange/>")
            destination = root / "input"
            _extract_quarantined(root, destination, {"sources": [{"region": "EA", "path": "EA.zip"}]})
            self.assertEqual((destination / "EA/Services/service.xml").read_text(), "<TransXChange/>")

    def test_archive_path_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp); archive_path = root / "EA.zip"
            with zipfile.ZipFile(archive_path, "w") as archive: archive.writestr("..\\outside.xml", "<TransXChange/>")
            with self.assertRaises(ValueError):
                _extract_quarantined(root, root / "input", {"sources": [{"region": "EA", "path": "EA.zip"}]})
            self.assertFalse((root / "outside.xml").exists())

    def test_duplicate_zip_target_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp); archive_path = root / "EA.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("EA/service.xml", "first")
                archive.writestr("EA/service.xml", "second")
            with self.assertRaisesRegex(ValueError, "duplicate member paths"):
                _extract_quarantined(root, root / "input", {"sources": [{"region": "EA", "path": "EA.zip"}]})

    def test_immutable_prepared_at_requires_timestamp_and_timezone(self):
        self.assertEqual(immutable_prepared_at(PREPARED_AT), PREPARED_AT)
        for value in (None, "", "2026-10-13T17:42:00"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                immutable_prepared_at(value)

    def test_real_preparer_handoff_is_deterministic_under_two_clocks(self):
        configured_node = os.environ.get("ATLAS_NODE")
        node = configured_node or shutil.which("node")
        if not node:
            self.fail("Node.js is required for the mandatory real-preparer integration test")
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp)
            snapshot = make_snapshot(root)
            outputs = []
            for index, fake_now in enumerate(("2031-01-01T01:02:03.000Z", "2042-02-02T02:03:04.000Z")):
                shim = root / f"date-{index}.mjs"
                shim.write_text("class FrozenDate extends Date { constructor(...args) { super(...(args.length ? args : [" + json.dumps(fake_now) + "])); } static now() { return new Date(" + json.dumps(fake_now) + ").getTime(); } } globalThis.Date = FrozenDate;\n", encoding="utf-8")
                extracted, prepared = root / f"input-{index}", root / f"prepared-{index}"
                handoff, manifest_path = prepare_tnds_handoff(snapshot, extracted, prepared, node=node, date_shim=str(shim))
                self.assertEqual(manifest_path, prepared / "manifest.json")
                self.assertEqual(handoff["preparedAt"], PREPARED_AT)
                self.assertEqual(handoff["preparedManifest"]["generatedAt"], PREPARED_AT)
                self.assertEqual(set(handoff["regions"]), set(TNDS_REGIONS))
                outputs.append(prepared)
            def file_hashes(prepared):
                manifest = (prepared / "manifest.json").read_bytes()
                shards = sorted((path.relative_to(prepared).as_posix(), hashlib.sha256(path.read_bytes()).hexdigest())
                                for path in (prepared / "services").rglob("*.json.gz"))
                return hashlib.sha256(manifest).hexdigest(), shards
            self.assertEqual(file_hashes(outputs[0]), file_hashes(outputs[1]))

    def test_national_scale_handoff_runs_one_region_at_a_time_and_retains_shards(self):
        node = os.environ.get("ATLAS_NODE") or shutil.which("node")
        if not node: self.fail("Node.js is required for the national preparation rehearsal")
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp)
            snapshot = make_snapshot(root, services_per_region=36)
            extracted, prepared = root / "regional-input", root / "prepared"
            original_run = subprocess.run
            calls = []
            def recorded_run(command, **kwargs):
                calls.append((command, kwargs))
                return original_run(command, **kwargs)
            with patch.object(diagnostic.subprocess, "run", side_effect=recorded_run):
                handoff, manifest_path = prepare_tnds_handoff(snapshot, extracted, prepared, node=node)
            self.assertEqual(manifest_path, prepared / "manifest.json")
            self.assertEqual(handoff["regions"], list(TNDS_REGIONS))
            self.assertEqual(handoff["preparedManifest"]["serviceCount"], 36 * len(TNDS_REGIONS))
            self.assertEqual(set(handoff["regionServiceCounts"].values()), {36})
            self.assertEqual(len(calls), len(TNDS_REGIONS), "each preparer process receives one region only")
            for region, (command, kwargs) in zip(TNDS_REGIONS, calls):
                input_index = command.index("--input") + 1
                self.assertEqual(Path(command[input_index]).name, region)
                self.assertIs(kwargs["stdout"], subprocess.DEVNULL, "preparer output is not buffered in Python memory")
                self.assertFalse((extracted / region).exists(), "completed regional source files are released")
            self.assertGreater(len(handoff["preparedManifest"]["serviceShards"]), 1)
            self.assertGreater(sum(len(files) for files in handoff["preparedManifest"]["serviceShards"].values()), len(TNDS_REGIONS))

    def test_preparation_failure_preserves_raw_snapshot_and_secret_safe_evidence(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            root = Path(tmp)
            source_snapshot = make_snapshot(root)
            source_manifest = json.loads((source_snapshot / "manifest.json").read_text(encoding="utf-8"))
            def acquire(destination, _username, _password):
                shutil.copytree(source_snapshot, destination, dirs_exist_ok=True)
                return source_manifest
            with patch.object(diagnostic, "acquire_tnds_snapshot", side_effect=acquire), \
                 patch.object(diagnostic, "prepare_tnds_handoff", side_effect=RuntimeError("synthetic parse failure")), \
                 patch.dict(os.environ, {"TNDS_USERNAME": "test-user-secret", "TNDS_PASSWORD": "test-password-secret"}):
                with self.assertRaisesRegex(RuntimeError, "synthetic parse failure"):
                    diagnostic.run(runner_temp=root / "run")
            run_root = root / "run"
            evidence = json.loads((run_root / "tnds-evidence/run-evidence.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["stage"], "EXTRACTION_AND_PREPARATION")
            self.assertEqual(evidence["result"], "FAILED")
            self.assertEqual(evidence["errorType"], "RuntimeError")
            self.assertEqual(evidence["completedRegions"], list(TNDS_REGIONS))
            self.assertFalse(evidence["plannerEligible"])
            self.assertFalse(evidence["publicationAttempted"])
            self.assertFalse(evidence["deploymentAttempted"])
            self.assertFalse(evidence["secretValuesIncluded"])
            self.assertTrue((run_root / "tnds-quarantined-snapshot/manifest.json").is_file())
            self.assertEqual(len(list((run_root / "tnds-quarantined-snapshot/sources").glob("*.zip"))), 8)
            evidence_text = " ".join(path.read_text(encoding="utf-8") for path in (run_root / "tnds-evidence").glob("*.json"))
            self.assertNotIn("test-user-secret", evidence_text)
            self.assertNotIn("test-password-secret", evidence_text)
            self.assertNotIn(SERVICE_XML, evidence_text)
            self.assertLess(len(evidence_text.encode("utf-8")), 16 * 1024, "failure evidence remains compact and bounded")


if __name__ == "__main__": unittest.main()
