"""Eligibility requires the full successful validation evidence set."""
import json
import tempfile
import unittest
from pathlib import Path

from finalize_candidate_eligibility import finalize


class CandidateEligibilityTests(unittest.TestCase):
    def make_candidate(self, root: Path, *, diagnostic=False):
        site = root / "site"
        (site / "atlas/data/status").mkdir(parents=True)
        (site / "atlas/data/bus").mkdir(parents=True)
        (site / "atlas/data/bus-tnds").mkdir(parents=True)
        generated = "2026-11-27T09:00:00Z"
        status = {"schema": "atlas-bus-refresh-status-v1", "status": "validated", "validation": "passed", "candidateGeneratedAt": generated, "diagnosticOnly": diagnostic, "reviewOnly": False, "productionEligible": not diagnostic, "publicationEligible": not diagnostic, "plannerEligible": None}
        for relative, document in (("atlas/data/status/manifest.json", status), ("atlas/data/bus/manifest.json", {"generatedAt": generated}), ("atlas/data/bus-tnds/manifest.json", {"generatedAt": generated})):
            (site / relative).write_text(json.dumps(document), encoding="utf-8")
        validation = root / "validation.json"
        validation.write_text(json.dumps({"naptanStopCount": 1000, "bodsServiceCount": 1000, "tndsServiceCount": 1, "stopIds": 1000}), encoding="utf-8")
        deterministic = root / "deterministic.log"
        deterministic.write_text("ATLAS deterministic suite passed\n", encoding="utf-8")
        measurement = root / "measurement.json"
        measurement.write_text(json.dumps({"bus": {"fitsSafeLimit": True, "projectedBlueGreenFitsSafeLimit": True}, "tnds": {"coverage": "complete-national-region-set"}, "proposedPublication": {"bankRootCount": 5, "allRootsFitSafeLimit": True}, "maximumBusNptgIbusFileBytes": 100, "gitBlobLimitBytes": 95 * 1024 * 1024}), encoding="utf-8")
        return site, validation, deterministic, measurement

    def test_full_candidate_eligibility_is_derived_from_three_completed_gates(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            site, validation, deterministic, measurement = self.make_candidate(root)
            evidence = finalize(site, validation, deterministic, measurement)
            status = json.loads((site / "atlas/data/status/manifest.json").read_text())
            self.assertTrue(status["plannerEligible"])
            self.assertEqual(status["successfulRefreshAt"], status["candidateGeneratedAt"])
            self.assertEqual(evidence["state"], "passed")
            self.assertEqual(set(evidence["checks"]), {"sourceAndStructuralValidation", "deterministicAtlasSuite", "boundedPublicationCapacity"})

    def test_diagnostic_candidate_is_never_promoted(self):
        with tempfile.TemporaryDirectory() as temporary:
            site, validation, deterministic, measurement = self.make_candidate(Path(temporary), diagnostic=True)
            with self.assertRaisesRegex(ValueError, "Diagnostic, review-only"):
                finalize(site, validation, deterministic, measurement)
            status = json.loads((site / "atlas/data/status/manifest.json").read_text())
            self.assertIsNone(status["plannerEligible"])
            self.assertNotIn("successfulRefreshAt", status)

    def test_capacity_failure_never_promotes_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            site, validation, deterministic, measurement = self.make_candidate(root)
            measurement.write_text(json.dumps({"bus": {"fitsSafeLimit": True, "projectedBlueGreenFitsSafeLimit": True}, "tnds": {"coverage": "complete-national-region-set"}, "proposedPublication": {"bankRootCount": 5, "allRootsFitSafeLimit": False}, "maximumBusNptgIbusFileBytes": 100, "gitBlobLimitBytes": 95 * 1024 * 1024}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "capacity evidence"):
                finalize(site, validation, deterministic, measurement)
            status = json.loads((site / "atlas/data/status/manifest.json").read_text())
            self.assertIsNone(status["plannerEligible"])

    def test_missing_file_capacity_evidence_never_promotes_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            site, validation, deterministic, measurement = self.make_candidate(root)
            document = json.loads(measurement.read_text())
            document.pop("maximumBusNptgIbusFileBytes")
            measurement.write_text(json.dumps(document), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "capacity evidence"):
                finalize(site, validation, deterministic, measurement)
            status = json.loads((site / "atlas/data/status/manifest.json").read_text())
            self.assertIsNone(status["plannerEligible"])


if __name__ == "__main__":
    unittest.main()
