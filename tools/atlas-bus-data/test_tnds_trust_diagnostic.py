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


def make_snapshot(root: Path) -> Path:
    snapshot = root / "snapshot"
    sources = snapshot / "sources"
    sources.mkdir(parents=True)
    entries = []
    for region in TNDS_REGIONS:
        archive_path = sources / f"{region}.zip"
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(f"{region}/service.xml", SERVICE_XML)
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


if __name__ == "__main__": unittest.main()
