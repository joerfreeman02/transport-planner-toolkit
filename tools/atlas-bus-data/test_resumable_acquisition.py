import io
import json
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from refresh_bus_data import RefreshError, TNDS_REGIONS, acquire_tnds_snapshot, tnds_region_from_filename
from source_snapshot import ACQUIRING_STATE, REGIONS, SNAPSHOT_STATE, SourceSnapshotError, acquire_primary_snapshot, load_and_verify


def gtfs_bytes():
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for member in ("agency.txt", "stops.txt", "routes.txt", "calendar.txt", "trips.txt", "stop_times.txt"):
            archive.writestr(member, "")
    return output.getvalue()


def tnds_bytes(region):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(f"{region}.xml", "<Service />")
    return output.getvalue()


class FakeFtp:
    def __init__(self, sessions, failing_region=None):
        self.sessions = sessions
        self.failing_region = failing_region
        self.retrieves = []
        sessions.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def login(self, *_args):
        return None

    def cwd(self, *_args):
        return None

    def nlst(self):
        return [f"TNDS-{region}-v2.5.zip" for region in TNDS_REGIONS]

    def retrbinary(self, command, callback):
        name = command.split(maxsplit=1)[1]
        region = tnds_region_from_filename(name)
        self.retrieves.append(region)
        if region == self.failing_region:
            callback(b"partial")
            raise ConnectionResetError("fixture failure")
        callback(tnds_bytes(region))


class ResumableAcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="atlas-resumable-acquisition-"))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def fake_download(self, calls, fail_label=None, leave_partial=False):
        def download(url, destination, label):
            calls.append(label)
            if label == fail_label:
                if leave_partial:
                    destination.write_bytes(b"interrupted")
                raise RefreshError(f"fixture failure for {label}")
            if "NaPTAN" in label:
                destination.write_bytes(b"<NaPTAN />")
            elif "NPTG" in label:
                destination.write_bytes(b"<NPTG />")
            else:
                destination.write_bytes(gtfs_bytes())
            return {"identity": url, "httpStatus": 200, "contentType": "application/octet-stream"}

        return download

    def test_source_a_survives_source_b_failure_and_resume_retries_only_b(self):
        snapshot = self.root / "primary"
        calls = []
        with self.assertRaises(RefreshError):
            acquire_primary_snapshot(snapshot, remote_freshness={}, download_fn=self.fake_download(calls, "NPTG XML source", True))
        self.assertTrue((snapshot / "sources/naptan.xml").is_file())
        self.assertTrue((snapshot / "manifest.json").is_file())
        self.assertEqual(json.loads((snapshot / "manifest.json").read_text())["state"], ACQUIRING_STATE)
        self.assertFalse((snapshot / "sources/naptan.xml").with_name(".naptan.xml.part").exists())

        resumed_calls = []
        result = acquire_primary_snapshot(snapshot, remote_freshness={}, download_fn=self.fake_download(resumed_calls))
        self.assertEqual(result["state"], SNAPSHOT_STATE)
        self.assertEqual(resumed_calls[0], "NPTG XML source")
        self.assertNotIn("NaPTAN XML source", resumed_calls)
        self.assertEqual(result["sourceCount"], 11)

    def test_interrupted_part_is_not_complete_and_valid_completed_source_is_reused(self):
        snapshot = self.root / "primary"
        first_calls = []
        acquire_primary_snapshot(snapshot, remote_freshness={}, download_fn=self.fake_download(first_calls))
        (snapshot / "sources/naptan.xml").with_name(".naptan.xml.part").write_bytes(b"partial")
        second_calls = []
        acquire_primary_snapshot(snapshot, remote_freshness={}, download_fn=self.fake_download(second_calls))
        self.assertEqual(second_calls, [])
        self.assertFalse((snapshot / "sources/naptan.xml").with_name(".naptan.xml.part").exists())

    def test_corrupted_completed_source_is_reacquired(self):
        snapshot = self.root / "primary"
        acquire_primary_snapshot(snapshot, remote_freshness={}, download_fn=self.fake_download([]))
        (snapshot / "sources/naptan.xml").write_bytes(b"corrupt")
        calls = []
        acquire_primary_snapshot(snapshot, remote_freshness={}, download_fn=self.fake_download(calls))
        self.assertEqual(calls, ["NaPTAN XML source"])
        self.assertEqual(load_and_verify(snapshot)["state"], SNAPSHOT_STATE)

    def test_partial_acquisition_cannot_be_marked_complete_and_old_snapshot_survives(self):
        old = self.root / "old-complete"
        acquire_primary_snapshot(old, remote_freshness={}, download_fn=self.fake_download([]))
        old_bytes = (old / "sources/naptan.xml").read_bytes()
        new = self.root / "new-acquisition"
        with self.assertRaises(RefreshError):
            acquire_primary_snapshot(new, remote_freshness={}, download_fn=self.fake_download([], "BODS east_anglia GTFS source"))
        with self.assertRaisesRegex(SourceSnapshotError, "ACQUIRED / UNINTERPRETED / VERIFIED"):
            load_and_verify(new)
        self.assertEqual(old_bytes, (old / "sources/naptan.xml").read_bytes())
        self.assertEqual(load_and_verify(old)["state"], SNAPSHOT_STATE)

    def test_primary_acquisition_never_creates_prepared_or_shard_outputs(self):
        snapshot = self.root / "primary"
        acquire_primary_snapshot(snapshot, remote_freshness={}, download_fn=self.fake_download([]))
        self.assertEqual({path.name for path in snapshot.iterdir()}, {"manifest.json", "sources"})
        self.assertFalse((snapshot / "atlas").exists())
        self.assertFalse((snapshot / "stops").exists())
        self.assertFalse((snapshot / "services").exists())

    def test_tnds_region_a_survives_region_b_failure_without_credentials_in_manifest(self):
        snapshot = self.root / "tnds"
        sessions = []

        def failing_factory(*_args, **_kwargs):
            return FakeFtp(sessions, failing_region="EM")

        with self.assertRaises(RefreshError):
            acquire_tnds_snapshot(snapshot, "masked-user", "masked-password", ftp_factory=failing_factory, sleep_fn=lambda _seconds: None)
        self.assertTrue((snapshot / "sources/EA.zip").is_file())
        manifest_text = (snapshot / "manifest.json").read_text(encoding="utf-8")
        self.assertNotIn("masked-user", manifest_text)
        self.assertNotIn("masked-password", manifest_text)
        self.assertEqual(json.loads(manifest_text)["state"], "ACQUIRING / UNINTERPRETED / INCOMPLETE / QUARANTINED")

        sessions.clear()
        result = acquire_tnds_snapshot(snapshot, "masked-user", "masked-password", ftp_factory=lambda *_args, **_kwargs: FakeFtp(sessions), sleep_fn=lambda _seconds: None)
        self.assertEqual(result["state"], "ACQUIRED / UNINTERPRETED / VERIFIED / QUARANTINED")
        self.assertEqual(result["sourceCount"], 8)
        self.assertTrue(result["quarantined"])
        self.assertFalse(result["productionEligible"])

    def test_primary_snapshot_is_not_invalidated_by_tnds_failure(self):
        primary = self.root / "primary"
        acquire_primary_snapshot(primary, remote_freshness={}, download_fn=self.fake_download([]))
        before = json.loads((primary / "manifest.json").read_text(encoding="utf-8"))
        with self.assertRaises(RefreshError):
            acquire_tnds_snapshot(self.root / "tnds", "", "", ftp_factory=lambda *_args, **_kwargs: self.fail("network called"))
        after = json.loads((primary / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(after["snapshotId"], before["snapshotId"])
        self.assertEqual(after["state"], SNAPSHOT_STATE)


if __name__ == "__main__":
    unittest.main()
