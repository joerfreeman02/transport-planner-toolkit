"""Guard the committed, frozen-input-derived C1B forensic result."""
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[2]
ARTIFACT = ROOT / "docs/atlas/BUS-DATA-TRUST-1A-C1B-PRIMARY-IDENTITY-FORENSIC.json"
EXPECTED_SNAPSHOT_ID = "cf0c64b980b0516378bb705843d428a74a797d19f527f79c6c43a5540f0b8bde"
EXPECTED_LEDGER_SHA256 = "aee79d3dd4a91b9c384021cd9c54989be89789e6e10a2aef467a55970c1c7731"


class C1BPrimaryForensicArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(ARTIFACT.read_text(encoding="utf-8"))

    def test_frozen_primary_total_and_nine_region_conservation(self):
        self.assertEqual(self.report["snapshotId"], EXPECTED_SNAPSHOT_ID)
        self.assertEqual(self.report["coverageLedgerSha256"], EXPECTED_LEDGER_SHA256)
        self.assertEqual(self.report["unresolvedScheduledCallCount"], 4908)
        self.assertTrue(self.report["baselineCountMatches"])
        self.assertEqual(sum(self.report["countsByRegion"].values()), 4908)
        self.assertEqual(len(self.report["countsByRegion"]), 9)

    def test_identity_forensics_are_exact_and_diagnostic_only(self):
        identity = self.report["naPTANExactIdentityCheck"]
        self.assertEqual(identity["exactAtcoCodeMatches"], 0)
        self.assertEqual(identity["exactNaptanCodeMatches"], 0)
        self.assertEqual(identity["gtfsStopIdBlank"], 0)
        self.assertEqual(identity["gtfsStopCodeBlank"], 4908)
        self.assertTrue(identity["fuzzyMatchingUsed"] is False)
        self.assertTrue(identity["spatialMatchingUsed"] is False)
        self.assertTrue(identity["identityResolutionActivated"] is False)
        self.assertTrue(self.report["diagnosticOnly"])
        self.assertFalse(self.report["sourceSnapshotMutated"])

    def test_duplicate_table_counts_and_repeated_identity_concentration_are_recorded(self):
        counts = self.report["duplicateGtfsKeys"]["counts"]
        self.assertEqual(len(counts), 8)
        self.assertTrue(all(value == 0 for value in counts.values()))
        concentration = self.report["repeatAndConcentration"]
        self.assertEqual(concentration["calls"], 4908)
        self.assertEqual(concentration["distinctNonblankGtfsStopIds"], 161)
        self.assertEqual(concentration["callsOnRepeatedGtfsStopIds"], 4897)
        self.assertEqual(concentration["singleUseGtfsStopIdCount"], 11)
        self.assertEqual(concentration["top10GtfsStopIdCallCount"], 2658)


if __name__ == "__main__":
    unittest.main()
