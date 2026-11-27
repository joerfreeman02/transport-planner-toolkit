import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
import zipfile
from email.message import Message
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("build-tfl-ibus-operator-index.py")
SPEC = importlib.util.spec_from_file_location("tfl_ibus_builder", MODULE_PATH)
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


class Response(io.BytesIO):
    def __init__(self, payload: bytes, headers: dict[str, str] | None = None):
        super().__init__(payload)
        self.headers = Message()
        for key, value in (headers or {}).items():
            self.headers[key] = value

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


class InterruptedResponse(Response):
    def __init__(self):
        super().__init__(b"partial", {"ETag": '"etag"'})
        self.calls = 0

    def read(self, _size=-1):
        self.calls += 1
        if self.calls == 1:
            return b"partial"
        raise OSError("interrupted transfer")


class IbusSourceTests(unittest.TestCase):
    def test_candidate_selection_requires_a_bound_snapshot_and_unique_lines(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "selection.json"
            source.write_text(json.dumps({"schema": builder.SELECTION_SCHEMA, "sourceSnapshotSha256": "a" * 64, "serviceLines": ["313", "N15"]}), encoding="utf-8")
            lines, digest = builder.load_service_line_selection(source)
            self.assertEqual(lines, ["313", "N15"])
            self.assertEqual(digest, "a" * 64)
            source.write_text(json.dumps({"schema": builder.SELECTION_SCHEMA, "sourceSnapshotSha256": "a" * 64, "serviceLines": ["313", "313"]}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                builder.load_service_line_selection(source)

    def test_inventory_reports_schedule_volume_without_fetching_archives(self):
        result = builder.inventory_summary("20261115", "2026-11-15", "2027-01-10", [
            {"key": "Base_Version_20261115/Line_20261115.zip", "size": 20, "etag": "line"},
            {"key": "Base_Version_20261115/schedule_AB_20261115.zip", "size": 700, "etag": "ab"},
        ])
        self.assertEqual(result["objectCount"], 2)
        self.assertEqual(result["totalBytes"], 720)
        self.assertEqual(result["scheduleArchiveCount"], 1)
        self.assertEqual(result["scheduleArchiveBytes"], 700)
        self.assertEqual(result["downloadedBytes"], 0)

    def test_cache_paths_are_scoped_by_complete_base_version(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = builder.Source(Path(temporary))
            self.assertNotEqual(source.local_path("Base_Version_20261101/schedule_A_20261101.zip"), source.local_path("Base_Version_20261115/schedule_A_20261115.zip"))
            self.assertTrue(str(source.local_path("Base_Version_20261101/schedule_A_20261101.zip")).endswith("Base_Version_20261101/schedule_A_20261101.zip"))

    def test_cache_is_reused_only_when_listing_and_content_identity_match(self):
        payload = b"current archive bytes"
        digest = hashlib.sha256(payload).hexdigest()
        metadata = {"size": len(payload), "etag": '"versioned-etag"'}
        with tempfile.TemporaryDirectory() as temporary:
            source = builder.Source(Path(temporary))
            target = source.local_path("Base_Version_20261115/schedule_A_20261115.zip")
            target.parent.mkdir(parents=True)
            target.write_bytes(payload)
            target.with_name(target.name + ".source.json").write_text(json.dumps({"size": len(payload), "etag": "versioned-etag", "sha256": digest}), encoding="utf-8")
            with patch("urllib.request.urlopen", side_effect=AssertionError("current cache should be reused")):
                self.assertEqual(source.get("Base_Version_20261115/schedule_A_20261115.zip", metadata=metadata), (target, True))
            with patch("urllib.request.urlopen", return_value=Response(b"replacement", {"ETag": '"new-etag"'})):
                refreshed, cache_hit = source.get("Base_Version_20261115/schedule_A_20261115.zip", metadata={"size": 11, "etag": '"new-etag"'})
            self.assertFalse(cache_hit)
            self.assertEqual(refreshed.read_bytes(), b"replacement")

    def test_root_metadata_can_be_forced_fresh_even_when_cached(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = builder.Source(Path(temporary))
            cached = source.local_path("Base_Version.xml")
            cached.parent.mkdir(parents=True)
            cached.write_text("stale", encoding="utf-8")
            with patch("urllib.request.urlopen", return_value=Response(b"fresh metadata")) as opened:
                path, cache_hit = source.get("Base_Version.xml", public_root=True, refresh=True)
            self.assertFalse(cache_hit)
            self.assertEqual(path.read_bytes(), b"fresh metadata")
            self.assertEqual(opened.call_count, 1)

    def test_interrupted_download_never_leaves_partial_cache_as_final(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = builder.Source(Path(temporary))
            key = "Base_Version_20261115/schedule_A_20261115.zip"
            with patch("urllib.request.urlopen", side_effect=[InterruptedResponse(), InterruptedResponse(), InterruptedResponse()]), patch.object(builder.time, "sleep"):
                with self.assertRaisesRegex(RuntimeError, "bounded retries"):
                    source.get(key, metadata={"size": 100, "etag": "etag"})
            target = source.local_path(key)
            self.assertFalse(target.exists())
            self.assertFalse(target.with_name(target.name + ".source.json").exists())
            self.assertEqual(list(target.parent.glob("*.part")), [])

    def test_archive_must_be_listed_and_pass_zip_crc(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = builder.Source(Path(temporary))
            key = "Base_Version_20261115/schedule_A_20261115.zip"
            with self.assertRaisesRegex(ValueError, "does not contain required archive"):
                builder.read_archive(source, key, {}, {})
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as archive:
                archive.writestr("payload.xml", "<root />")
            payload = buffer.getvalue()
            etag = "archive-etag"
            with patch("urllib.request.urlopen", return_value=Response(payload, {"ETag": f'"{etag}"'})):
                archive = builder.read_archive(source, key, {key: {"size": len(payload), "etag": etag}}, {})
                archive.close()


if __name__ == "__main__":
    unittest.main()
