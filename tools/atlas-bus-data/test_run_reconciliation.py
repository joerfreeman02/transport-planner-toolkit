"""End-to-end sharded checkpoint-to-report and streaming-ledger contract."""
import gzip
import json
import tempfile
import unittest
from pathlib import Path

from reconciliation_checkpoint import create_streaming_checkpoint
from reconciliation_projection import projection_compatibility_fingerprint
from run_reconciliation import run, PRIMARY_SNAPSHOT, TNDS_SNAPSHOT, CONTROLLED_BRANCHES
from tnds_reconciliation import EXPECTED_REGIONS

BASE_COMMIT = "39e142767946aa31ecf0f87544e6d7491ca90297"


def row(region, side, bridge="bridge-1", stop="0100A", route="46"):
    return {"region": region, "sourceRegion": region.lower(), "stopId": stop, "routeNumber": route,
        "operator": "Operator", "origin": "Origin", "destination": "Destination", "stopSequence": [stop, "0100B"],
        "operatingDays": ["monday"], "schoolTermQualifier": "ordinary", "validFrom": "2026-01-01", "validTo": "2027-01-01",
        "nativeIds": {"service": side}, "evidenceId": side + "-" + region + "-" + stop,
        "sourceSnapshotId": PRIMARY_SNAPSHOT if side == "p" else TNDS_SNAPSHOT,
        "sourceRegionArchive": {"region": region}, "unresolved": False, "identityBridge": bridge,
        "identityBridgeValidated": bool(bridge), "stopLatitude": 51.8527, "stopLongitude": -0.454343,
        "timetableCallEligible": True}


def regional_evidence():
    return {"schema": "atlas-tnds-region-evidence-v1", "fixtureOnly": False, "regions": {
        region: {"region": region, "acquisitionId": TNDS_SNAPSHOT, "archiveSha256": ("a" if region != "EA" else "b") * 64,
            "sourceBytes": 1, "archiveValidation": "passed", "semanticValidation": "passed",
            "normalizationValidation": "passed", "comparatorState": "COMPARATOR_VALIDATED"}
        for region in EXPECTED_REGIONS}}


def make_checkpoints(root: Path):
    fingerprint = projection_compatibility_fingerprint()
    common = {"sourceProducerRunId": "38533475680", "sourceArtifactName": "source", "repository": "org/repo",
        "preparationCodeCommit": BASE_COMMIT, "checkpointProducerCommit": BASE_COMMIT,
        "checkpointProducerRunId": "200", "checkpointBranch": "refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-recoverable-reconciliation",
        "sourceWindowBasis": "2026-10-13T00:00:00Z", "projectionCompatibilityFingerprint": fingerprint}
    primary_provenance = {**common, "sourceSnapshotId": PRIMARY_SNAPSHOT, "preparedSchema": "atlas-prepared-bus-data-v2",
        "sourceArtifactName": "atlas-reference-source-snapshot-38533475680", "sourceArtifactId": "11878857366",
        "sourceArtifactDigest": "sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658"}
    p_meta = {"primaryCoverage": {"unclassifiedRemainder": 0, "preparationErrorCount": 0},
        "controlStops": [{"stopId": "0100A", "latitude": 51.8527, "longitude": -0.454343,
            "timetableCallEligible": True, "name": "Pipers Lane"},
            {"stopId": "0590BCE01L", "latitude": 52.577554, "longitude": -0.242489,
             "timetableCallEligible": False, "busStopType": "BCE", "stopType": "station"}],
        "unresolvedPrimaryIdentityRecords": [{"region": "EA", "gtfsStopId": "RAW-EA", "tripId": "T1"}]}
    primary = create_streaming_checkpoint("PRIMARY", [row("EA", "p"), row("EA", "p", stop="0590BCE01L", route="X"),
        row("LONDON", "p", stop="L001")],
        primary_provenance, root / "primary", projection_metadata=p_meta)
    tnds_provenance = {**common, "sourceSnapshotId": TNDS_SNAPSHOT, "sourceProducerRunId": "38579244547",
        "sourceArtifactName": "atlas-tnds-quarantined-38579244547", "sourceArtifactId": "11903662011",
        "sourceArtifactDigest": "sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e",
        "preparedSchema": "atlas-prepared-bus-tnds-v1"}
    tnds = create_streaming_checkpoint("TNDS", [row("EA", "t"), row("Y", "t", stop="RAW-EA", route="X")],
        tnds_provenance, root / "tnds", projection_metadata={"regionalEvidence": regional_evidence()})
    return primary, tnds


class RunReconciliationTests(unittest.TestCase):
    def test_streams_regional_ledger_and_emits_pipers_per_route_findings(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); primary, tnds = make_checkpoints(root)
            output = root / "reports"
            summary = run(root / "primary", root / "tnds",
                {"side": "PRIMARY", "sourceSnapshotId": PRIMARY_SNAPSHOT, "sourceProducerRunId": "38533475680",
                 "sourceArtifactName": "atlas-reference-source-snapshot-38533475680", "sourceArtifactId": "11878857366",
                 "sourceArtifactDigest": "sha256:01018c145646fdf041ba0c91cbd91b842994f62a292815438a6866ed358db658",
                 "repository": "org/repo", "preparedSchema": "atlas-prepared-bus-data-v2"},
                {"side": "TNDS", "sourceSnapshotId": TNDS_SNAPSHOT, "sourceProducerRunId": "38579244547",
                 "sourceArtifactName": "atlas-tnds-quarantined-38579244547", "sourceArtifactId": "11903662011",
                 "sourceArtifactDigest": "sha256:7783327324f160b1bb3dfbd156bede32c57ababc4c790864d6bf9efe175b6f8e",
                 "repository": "org/repo", "preparedSchema": "atlas-prepared-bus-tnds-v1"},
                output, producer_run_id="200", branch="refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-region-scale-recovery-closeout", commit=BASE_COMMIT, repository="org/repo")
            ledger_path = output / "reconciliation-ledger.json.gz"
            with gzip.open(ledger_path, "rt", encoding="utf-8") as stream:
                ledger = json.load(stream)
            self.assertEqual(summary["ledgerRowsWritten"], len(ledger["rows"]))
            self.assertLessEqual(summary["matchingInstrumentation"]["maxProjectionRowsLoadedSimultaneously"], 5)
            self.assertFalse(summary["plannerEligible"])
            self.assertFalse(summary["plannerOutputChanged"])
            self.assertFalse(summary["sourceAuthorityChanged"])
            self.assertEqual(summary["regionalCoverage"]["state"], "NATIONAL_COMPLETE")
            unresolved = json.loads((output / "unresolved-primary-summary.json").read_text())
            self.assertEqual(unresolved["exactRegionScopedTndsStopReferenceCount"], 0)
            control = json.loads((output / "pipers-lane-control.json").read_text())
            findings = {item["referenceService"]: item for item in control["referenceServiceFindings"]}
            self.assertEqual(set(findings), {"46", "230", "231", "C"})
            self.assertEqual(findings["46"]["state"], "EVIDENCED_PRIMARY_AND_TNDS")
            self.assertEqual(findings["230"]["state"], "NOT_EVIDENCED_IN_FROZEN_SOURCE_WINDOW")
            self.assertIn("does not assert", findings["230"]["explanation"])
            self.assertTrue(control["manualAcceptancePending"])
            self.assertNotIn("evidenceCompleteForSite", control)
            peterborough = json.loads((output / "peterborough-queensgate-control.json").read_text())
            bce = next(item for item in peterborough["nearbyStops"] if item["stopId"] == "0590BCE01L")
            self.assertFalse(bce["timetableCallEligible"])
            self.assertEqual(bce["infrastructureClass"], "NON_CALL_INFRASTRUCTURE")
            self.assertTrue(peterborough["manualAcceptancePending"])

    def test_partial_live_region_fails_before_ledger_creation(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temporary:
            root = Path(temporary); primary, tnds = make_checkpoints(root)
            meta_path = root / "tnds" / "projection-metadata.json"
            meta = json.loads(meta_path.read_text())
            meta["regionalEvidence"]["regions"].pop("Y")
            # Deliberately update the metadata digest in the signed manifest so only
            # the regional completeness gate is under test.
            from reconciliation_checkpoint import file_sha256
            meta_path.write_text(json.dumps(meta, sort_keys=True, separators=(",", ":")) + "\n")
            manifest_path = root / "tnds" / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["projectionMetadataSha256"] = file_sha256(meta_path)
            manifest_path.write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n")
            with self.assertRaisesRegex(ValueError, "partial"):
                run(root / "primary", root / "tnds", {}, {}, root / "out", producer_run_id="200",
                    branch="refs/heads/codex/atlas-bus-data-trust-1a-c1b-c3-c1-region-scale-recovery-closeout", commit=BASE_COMMIT, repository="org/repo")


if __name__ == "__main__": unittest.main()
