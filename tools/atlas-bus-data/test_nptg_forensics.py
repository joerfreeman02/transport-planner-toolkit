import tempfile
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from nptg_forensics import analyse


class NptgForensicsTests(unittest.TestCase):
    def test_exact_target_and_unresolved_relationship_are_reported(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "nptg.xml"
            path.write_text("<NationalPublicTransportGazetteer SchemaVersion='2.1'><NptgLocalities><NptgLocality><NptgLocalityCode>E0000006</NptgLocalityCode><Descriptor><LocalityName>Box End</LocalityName></Descriptor><AdministrativeAreaRef>069</AdministrativeAreaRef><NptgDistrictRef>310</NptgDistrictRef></NptgLocality></NptgLocalities><Regions><NptgDistrict><NptgDistrictCode>26</NptgDistrictCode><Name>Example</Name></NptgDistrict></Regions></NationalPublicTransportGazetteer>", encoding="utf-8")
            result = analyse(path)
        self.assertEqual(result["targetRecord"]["districtId"], "310")
        self.assertFalse(result["district310"]["exists"])
        self.assertEqual(result["unresolvedByDistrict"], {"310": 1})


if __name__ == "__main__":
    unittest.main()
