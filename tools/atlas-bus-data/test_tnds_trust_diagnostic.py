"""Offline checks for the quarantine extractor; no credentials or network used."""
import tempfile
import unittest
import zipfile
from pathlib import Path

from tnds_trust_diagnostic import _extract_quarantined


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


if __name__ == "__main__": unittest.main()
