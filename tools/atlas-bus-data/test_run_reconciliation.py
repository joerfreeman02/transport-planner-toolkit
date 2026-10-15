"""End-to-end synthetic checkpoint-to-report contract."""
import gzip
import json
import tempfile
import unittest
from pathlib import Path

from reconciliation_checkpoint import PROJECTION_SCHEMA, create_checkpoint, canonical_bytes
from run_reconciliation import run
from tnds_reconciliation import EXPECTED_REGIONS


def row(region, side, bridge="bridge-1"):
    return {"region": region, "stopId": "0100A", "routeNumber": "46", "operator": "Operator",
        "origin": "Origin", "destination": "Destination", "stopSequence": ["0100A", "0100B"],
        "operatingDays": ["monday"], "schoolTermQualifier": None, "validFrom": "2026-01-01", "validTo": "2027-01-01",
        "nativeIds": {"service": side}, "evidenceId": side + "-evidence", "sourceSnapshotId": side + "-snapshot",
        "sourceRegionArchive": {"region": region}, "unresolved": False, "identityBridge": bridge,
        "identityBridgeValidated": bool(bridge), "stopLatitude": 51.8527, "stopLongitude": -0.454343,
        "timetableCallEligible": True}


def bundle(side, regionEvidence=None):
    rows = [row("EA", side.lower())]
    projection = {"schema": PROJECTION_SCHEMA, "side": side, "sourceSnapshotId": side.lower() + "-snapshot",
        "sourceWindowBasis": "2026-10-13T00:00:00Z", "rows": rows}
    if side == "PRIMARY": projection["primaryCoverage"] = {"unclassifiedRemainder": 0, "preparationErrorCount": 0}
    if regionEvidence is not None: projection["regionalEvidence"] = regionEvidence
    return create_checkpoint(side, projection, {"sourceSnapshotId": side.lower() + "-snapshot",
        "sourceProducerRunId": "100", "sourceArtifactName": side.lower() + "-source",
        "repository": "org/repo", "preparationCodeCommit": "commit", "preparedSchema": "v2",
        "sourceWindowBasis": "2026-10-13T00:00:00Z", "checkpointProducerRunId": "200",
        "checkpointBranch": "refs/heads/c3"})


class RunReconciliationTests(unittest.TestCase):
    def test_outputs_full_ledger_and_control_reports_from_verified_checkpoints(self):
        regions = {region: {"region": region, "acquisitionId": "tnds-snapshot", "archiveSha256": ("a" if region != "EA" else "b") * 64,
            "sourceBytes": 1, "archiveValidation": "passed", "semanticValidation": "passed",
            "normalizationValidation": "passed", "comparatorState": "COMPARATOR_VALIDATED"} for region in EXPECTED_REGIONS}
        tnds = bundle("TNDS", {"schema": "atlas-tnds-region-evidence-v1", "fixtureOnly": False, "regions": regions})
        primary = bundle("PRIMARY")
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary)
            p, t = root / "primary.json.gz", root / "tnds.json.gz"
            for path, value in ((p, primary), (t, tnds)):
                with gzip.open(path, "wb") as stream: stream.write(canonical_bytes(value))
            expected = lambda value: {key: value["manifest"][key] for key in ("side", "sourceSnapshotId", "sourceProducerRunId", "sourceArtifactName", "repository", "preparationCodeCommit", "preparedSchema", "canonicalProjectionSha256")}
            output = root / "reports"
            summary = run(p, t, expected(primary), expected(tnds), output, producer_run_id="200",
                branch="refs/heads/c3", commit="commit", repository="org/repo")
            self.assertTrue((output / "reconciliation-ledger.json.gz").is_file())
            self.assertTrue((output / "pipers-lane-control.json").is_file())
            self.assertTrue((output / "peterborough-queensgate-control.json").is_file())
            self.assertFalse(summary["plannerEligible"])
            self.assertFalse(summary["plannerOutputChanged"])
            self.assertFalse(summary["sourceAuthorityChanged"])
            self.assertTrue(summary["regionalCoverage"]["state"] == "NATIONAL_COMPLETE")

    def test_partial_live_region_fails_before_reconciliation(self):
        regions = {region: {"region": region, "acquisitionId": "tnds-snapshot", "archiveSha256": "a" * 64,
            "sourceBytes": 1, "archiveValidation": "passed", "semanticValidation": "passed",
            "normalizationValidation": "passed", "comparatorState": "COMPARATOR_VALIDATED"} for region in EXPECTED_REGIONS[:-1]}
        tnds = bundle("TNDS", {"schema": "atlas-tnds-region-evidence-v1", "fixtureOnly": False, "regions": regions})
        primary = bundle("PRIMARY")
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); p = root / "p.gz"; t = root / "t.gz"
            for path, value in ((p, primary), (t, tnds)):
                with gzip.open(path, "wb") as stream: stream.write(canonical_bytes(value))
            expected = lambda value: {key: value["manifest"][key] for key in ("side", "sourceSnapshotId", "sourceProducerRunId", "sourceArtifactName", "repository", "preparationCodeCommit", "preparedSchema", "canonicalProjectionSha256")}
            with self.assertRaisesRegex(ValueError, "partial"):
                run(p, t, expected(primary), expected(tnds), root / "out", producer_run_id="200",
                    branch="refs/heads/c3", commit="commit", repository="org/repo")


if __name__ == "__main__": unittest.main()
