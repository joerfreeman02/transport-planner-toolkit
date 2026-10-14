from __future__ import annotations

import json
import gzip
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
import build_static_index as builder
import refresh_bus_data as refresh
from tnds_capability_probe import probe
from verify_prepared_handoff import verify


class FrozenSnapshotDateTests(unittest.TestCase):
    def test_manifest_acquisition_date_ignores_frozen_reuse_metadata_and_runner_clock(self):
        manifest = {"createdAt": "2026-09-25T23:30:00-04:00", "verifiedAt": "2026-10-14T12:00:00Z", "frozenReuseAt": "2026-10-14T12:00:00Z"}

        class RunnerClock:
            current = datetime(2026, 10, 14, tzinfo=timezone.utc)

            @classmethod
            def now(cls, *_args, **_kwargs):
                return cls.current

            @staticmethod
            def fromisoformat(value):
                return datetime.fromisoformat(value)

        with patch.object(refresh, "datetime", RunnerClock):
            first = refresh.frozen_snapshot_date(manifest)
            RunnerClock.current = datetime(2026, 10, 21, tzinfo=timezone.utc)
            second = refresh.frozen_snapshot_date(manifest)
        self.assertEqual(first, "2026-09-25")
        self.assertEqual(second, first)
        first_dates = builder.representative_dates(date.fromisoformat(first))
        second_dates = builder.representative_dates(date.fromisoformat(second))
        self.assertEqual(first_dates, second_dates)
        calendar = {"monday": "1", "tuesday": "1", "wednesday": "1", "thursday": "1", "friday": "1", "start_date": "20260928", "end_date": "20261002"}
        self.assertEqual(builder.active_days(calendar, {}, first_dates), builder.active_days(calendar, {}, second_dates))
        self.assertEqual(refresh.frozen_snapshot_date({"createdAt": "2026-09-25T23:30:00-04:00", "reuse": {"reusedAt": "2030-01-01T00:00:00Z"}}), first)

    def test_fixture_preparation_outputs_match_under_two_runner_dates(self):
        from pathlib import Path

        with tempfile.TemporaryDirectory(prefix="atlas-frozen-replay-") as directory:
            root = Path(directory)
            gtfs = root / "gtfs"
            gtfs.mkdir()
            archive = gtfs / "fixture.zip"
            files = {
                "agency.txt": "agency_id,agency_name\na,Fixture operator\n",
                "routes.txt": "route_id,route_short_name,route_type,agency_id\nr1,1,3,a\n",
                "stops.txt": "stop_id,stop_code,stop_name\n490006381N,490006381N,East View\n490006381S,490006381S,East View\n",
                "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260928,20261002\n",
                "trips.txt": "route_id,service_id,trip_id,direction_id,trip_headsign\nr1,weekday,t1,0,East View\n",
                "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,08:00:00,08:00:00,490006381N,1\nt1,08:10:00,08:10:00,490006381S,2\n",
            }
            with zipfile.ZipFile(archive, "w") as feed:
                for name, content in files.items():
                    feed.writestr(name, content)

            class RunnerClock:
                current = datetime(2026, 10, 14, tzinfo=timezone.utc)

                @classmethod
                def now(cls, *_args, **_kwargs):
                    return cls.current

                @staticmethod
                def fromisoformat(value):
                    return datetime.fromisoformat(value)

            snapshot_manifest = {"createdAt": "2026-09-25T00:00:00Z", "verifiedAt": "2026-10-14T00:00:00Z"}
            outputs = []
            for index, runner_date in enumerate((date(2026, 10, 14), date(2026, 10, 21))):
                RunnerClock.current = datetime.combine(runner_date, datetime.min.time(), timezone.utc)
                with patch.object(refresh, "datetime", RunnerClock):
                    snapshot_date = refresh.frozen_snapshot_date(snapshot_manifest)
                output = root / f"prepared-{index}"
                args = type("Args", (), {
                    "naptan_xml": Path(__file__).parents[2] / "tests/fixtures/atlas-bus-data-v2/naptan-2.1.xml",
                    "nptg_xml": Path(__file__).parents[2] / "tests/fixtures/atlas-bus-data-v2/nptg-2.1.xml",
                    "gtfs_dir": gtfs, "output": output, "snapshot_date": snapshot_date,
                    "generated_at": f"2026-10-{14 + index * 7:02d}T00:00:00Z", "grid_size": 0.25, "service_shard_key_length": 5,
                })()
                builder.build_v2(args)
                manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
                service_path = next(iter(manifest["serviceShards"].values()))[0]
                with gzip.open(output / service_path, "rt", encoding="utf-8") as stream:
                    services = json.load(stream)["services"]
                outputs.append((manifest["snapshotDate"], manifest["representativeDates"], services))
            self.assertEqual(outputs[0][0], outputs[1][0])
            self.assertEqual(outputs[0][1], outputs[1][1])
            self.assertEqual(outputs[0][2], outputs[1][2])

    def test_missing_or_invalid_frozen_acquisition_timestamp_fails_closed(self):
        for manifest in ({}, {"createdAt": "not-a-time"}, {"createdAt": "2026-09-25T00:00:00"}):
            with self.subTest(manifest=manifest), self.assertRaisesRegex(refresh.RefreshError, "createdAt acquisition timestamp"):
                refresh.frozen_snapshot_date(manifest)

    def test_legacy_non_snapshot_date_policy_remains_runner_date(self):
        # The command path intentionally keeps datetime.now(...).date() for legacy acquisition.
        source = (ROOT / "refresh_bus_data.py").read_text(encoding="utf-8")
        self.assertIn("if snapshot_root else datetime.now(timezone.utc).date().isoformat()", source)


class TndsProbePathTests(unittest.TestCase):
    def test_probe_writes_under_nonexistent_parent_without_retrieval(self):
        with tempfile.TemporaryDirectory(prefix="atlas-tnds-probe-") as directory:
            output = Path(directory) / "not-created" / "nested" / "probe.json"
            env = {**os.environ, "TNDS_USERNAME": "", "TNDS_PASSWORD": ""}
            subprocess.run([sys.executable, str(ROOT / "tnds_capability_probe.py"), "--output", str(output)], check=True, capture_output=True, text=True, env=env)
            result = json.loads(output.read_text(encoding="utf-8"))
            self.assertFalse(result["retrievalPerformed"])
            self.assertEqual(result["reason"], "credentials not supplied")
        self.assertFalse(probe("", "")["retrievalPerformed"])


class PreparedHandoffTests(unittest.TestCase):
    def test_required_candidate_json_and_snapshot_identity_are_checked(self):
        with tempfile.TemporaryDirectory(prefix="atlas-handoff-") as directory:
            site = Path(directory)
            bus = site / "atlas/data/bus"
            status = site / "atlas/data/status"
            diagnostics = site / "diagnostic-output"
            (bus / "stops.json").parent.mkdir(parents=True)
            status.mkdir(parents=True)
            diagnostics.mkdir(parents=True)
            (bus / "stops.json").write_text('{"schema":"atlas-prepared-bus-data-v2","stops":[]}', encoding="utf-8")
            (bus / "manifest.json").write_text(json.dumps({"schema": "atlas-prepared-bus-data-v2", "stopShards": {"a": "stops.json"}, "serviceShards": {}, "groupShards": {}, "localityShards": {}, "referenceStopPointShards": {}}), encoding="utf-8")
            (status / "manifest.json").write_text(json.dumps({"schema": "atlas-bus-refresh-status-v1", "diagnosticOnly": True, "productionEligible": False, "validation": "diagnostic_only", "sources": {"sourceSnapshot": {"snapshotId": "snapshot-1"}}}), encoding="utf-8")
            (diagnostics / "coverage-ledger.json").write_text(json.dumps({"schema": "atlas-bus-national-coverage-ledger-v1", "snapshot": {"snapshotId": "snapshot-1"}, "preparedCandidate": {"schema": "atlas-prepared-bus-data-v2"}}), encoding="utf-8")
            (diagnostics / "gap-report.json").write_text(json.dumps({"schema": "atlas-bus-national-preparation-gap-report-v1"}), encoding="utf-8")
            (diagnostics / "0590B-forensic.json").write_text(json.dumps({"schema": "atlas-bus-0590b-forensic-v1", "snapshotId": "snapshot-1"}), encoding="utf-8")
            self.assertEqual(verify(site, "snapshot-1")["requiredShardCount"], 1)
            with self.assertRaisesRegex(SystemExit, "snapshot ID"):
                verify(site, "different-snapshot")


if __name__ == "__main__":
    unittest.main()
