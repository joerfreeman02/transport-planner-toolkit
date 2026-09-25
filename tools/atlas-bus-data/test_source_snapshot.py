import json
import shutil
import tempfile
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from source_freshness import probe_http, probe_tnds_metadata
from source_snapshot import REGIONS, SNAPSHOT_STATE, SourceSnapshotError, build_manifest, load_and_verify, materialise_for_preparation, reuse_snapshot_if_unchanged, write_manifest


class Response:
    status = 200
    headers = {"ETag": '"abc"', "Content-Length": "12"}

    def __enter__(self): return self
    def __exit__(self, *_args): return False
    def getcode(self): return self.status


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="atlas-source-snapshot-test-"))
        (self.root / "sources/bods").mkdir(parents=True)
        for relative in ("sources/naptan.xml", "sources/nptg.xml"):
            (self.root / relative).write_text(relative, encoding="utf-8")
        for region in REGIONS:
            (self.root / "sources/bods" / f"{region}.zip").write_bytes(region.encode())
        entries = []
        from source_snapshot import _entry
        entries.append(_entry(self.root, "sources/naptan.xml", identity="naptan", fmt="xml", region=None, acquired_at="2026-09-25T00:00:00Z", remote_metadata={"reliable": True, "metadata": {"etag": "a"}}, acquisition="fresh"))
        entries.append(_entry(self.root, "sources/nptg.xml", identity="nptg", fmt="xml", region=None, acquired_at="2026-09-25T00:00:00Z", remote_metadata={"reliable": True, "metadata": {}}, acquisition="fresh"))
        entries.extend(_entry(self.root, f"sources/bods/{region}.zip", identity=region, fmt="gtfs-zip", region=region, acquired_at="2026-09-25T00:00:00Z", remote_metadata={"reliable": True, "metadata": {}}, acquisition="fresh") for region in REGIONS)
        write_manifest(self.root, build_manifest(self.root, source_entries=entries))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_verified_snapshot_is_reusable_and_hash_addressed(self):
        value = load_and_verify(self.root)
        self.assertEqual(value["state"], SNAPSHOT_STATE)
        self.assertFalse(value["productionEligible"])
        self.assertEqual(len(value["sources"]), 11)

    def test_corruption_fails_closed(self):
        (self.root / "sources/nptg.xml").write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(SourceSnapshotError, "hash/size"):
            load_and_verify(self.root)

    def test_preparation_materialises_verified_bytes_without_acquisition(self):
        staging = self.root / "staging"
        naptan, nptg, gtfs, _manifest = materialise_for_preparation(self.root, staging)
        self.assertTrue(naptan.is_file())
        self.assertTrue(nptg.is_file())
        self.assertEqual(sorted(path.stem for path in gtfs.glob("*.zip")), sorted(REGIONS))

    def test_reuse_requires_reliable_unchanged_metadata_and_preserves_hashes(self):
        freshness = {"naptan": {"reliable": True, "metadata": {"etag": "a"}}, "nptg": {"reliable": True, "metadata": {}}, "bods": {"regions": {region: {"reliable": True, "metadata": {}} for region in REGIONS}}}
        destination = self.root / "reused"
        (self.root / "freshness.json").write_text(json.dumps(freshness), encoding="utf-8")
        decision = reuse_snapshot_if_unchanged(self.root, self.root / "freshness.json", destination)
        self.assertTrue(decision["reuse"])
        self.assertTrue(load_and_verify(destination)["reuse"]["reused"])
        freshness["bods"]["regions"]["london"]["metadata"] = {"etag": "changed"}
        (self.root / "freshness-changed.json").write_text(json.dumps(freshness), encoding="utf-8")
        self.assertFalse(reuse_snapshot_if_unchanged(self.root, self.root / "freshness-changed.json", self.root / "not-reused")["reuse"])

    def test_http_metadata_is_a_discriminator_not_byte_identity(self):
        result = probe_http("https://example.invalid/source", opener=lambda *_args, **_kwargs: Response())
        self.assertTrue(result["reliable"])
        self.assertEqual(result["classification"], "RELIABLE_METADATA")

    def test_tnds_probe_never_retrieves_archives(self):
        result = probe_tnds_metadata("", "")
        self.assertFalse(result["retrievalPerformed"])
        self.assertEqual(result["classification"], "AUTH_REQUIRED")


if __name__ == "__main__":
    unittest.main()
