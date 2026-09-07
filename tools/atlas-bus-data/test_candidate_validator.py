import gzip
import json
import shutil
import unittest
from pathlib import Path

from validate_candidate import validate
from refresh_bus_data import RefreshError, TNDS_REGIONS


class CandidateValidatorTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2] / 'tmp' / 'alpha7-candidate-tests'
        shutil.rmtree(self.root, ignore_errors=True)
        bus = self.root / 'atlas/data/bus'
        tnds = self.root / 'atlas/data/bus-tnds/services'
        bus.mkdir(parents=True)
        tnds.mkdir(parents=True)
        stop = ['STOP-1', None, 'Example', None, None, 51.0, -0.1, 'B', None, None, None, None, None, None, []]
        service = {'id': 'service-1', 'stopSchedules': {'STOP-1': {'monday': [600]}}, 'routeNumber': '231'}
        for relative, payload in [('stops/g1.json.gz', {'schema': 'atlas-prepared-bus-data-v1', 'stops': [stop]}), ('services/a.json.gz', {'schema': 'atlas-prepared-bus-data-v1', 'services': [service]})]:
            target = bus / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with gzip.open(target, 'wt', encoding='utf-8') as stream:
                json.dump(payload, stream)
        (bus / 'manifest.json').write_text(json.dumps({'schema': 'atlas-prepared-bus-data-v1', 'stopShards': {'g1': 'stops/g1.json.gz'}, 'serviceShards': {'area': ['services/a.json.gz']}, 'sources': {'naptan': {'stopCount': 2000}, 'bods': {'regions': [{'serviceCount': 1000} for _ in range(8)]}}}))
        tnds_paths = []
        for index, region in enumerate(TNDS_REGIONS):
            name = f'services/{index}-{region.lower()}.json'
            (self.root / 'atlas/data/bus-tnds' / name).write_text(json.dumps({'schema': 'atlas-prepared-bus-tnds-v1', 'stopPrefix': 'STOP-', 'services': [{'id': f'tnds:{region}:fixture:1', 'stopSchedules': {'STOP-1': {'monday': [600]}}, 'source': {'region': region, 'serviceCode': f'fixture-{region}'}}]}))
            tnds_paths.append(name)
        (self.root / 'atlas/data/bus-tnds/manifest.json').write_text(json.dumps({'schema': 'atlas-prepared-bus-tnds-v1', 'regions': list(TNDS_REGIONS), 'serviceCount': len(TNDS_REGIONS), 'serviceShardKeyLength': 5, 'serviceShards': {'STOP-': tnds_paths}}))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def _replace_first_tnds(self, payload):
        target = self.root / 'atlas/data/bus-tnds/services/0-ea.json'
        target.write_text(json.dumps({'schema': 'atlas-prepared-bus-tnds-v1', 'stopPrefix': 'STOP-', 'services': [payload]}))

    def test_generated_candidate_passes_structural_validation(self):
        result = validate(self.root)
        self.assertEqual(result['serviceShardRecords'], 1)
        self.assertEqual(result['stopIds'], 1)

    def test_fully_quarantined_tnds_service_passes_without_schedules(self):
        self._replace_first_tnds({'id': 'tnds:EA:fixture:Q', 'stopSchedules': {}, 'source': {'region': 'EA', 'serviceCode': 'Q'}, 'tndsQuarantine': {'serviceQuarantined': True, 'affectedStopIds': ['STOP-1'], 'patterns': [{'patternId': 'JP-Q', 'reasonCode': 'incomplete_runtime_sequence', 'affectedStopIds': ['STOP-1']}]}})
        self.assertEqual(validate(self.root)['stopIds'], 1)

    def test_ordinary_empty_tnds_service_fails(self):
        self._replace_first_tnds({'id': 'tnds:EA:fixture:empty', 'stopSchedules': {}, 'source': {'region': 'EA', 'serviceCode': 'empty'}})
        with self.assertRaisesRegex(RefreshError, 'empty or malformed'):
            validate(self.root)

    def test_quarantine_without_affected_stops_fails(self):
        self._replace_first_tnds({'id': 'tnds:EA:fixture:Q', 'stopSchedules': {}, 'source': {'region': 'EA', 'serviceCode': 'Q'}, 'tndsQuarantine': {'serviceQuarantined': True, 'affectedStopIds': [], 'patterns': [{'patternId': 'JP-Q', 'reasonCode': 'incomplete_runtime_sequence', 'affectedStopIds': []}]}})
        with self.assertRaisesRegex(RefreshError, 'affectedStopIds'):
            validate(self.root)

    def test_malformed_quarantine_metadata_fails(self):
        self._replace_first_tnds({'id': 'tnds:EA:fixture:Q', 'stopSchedules': {}, 'source': {'region': 'EA', 'serviceCode': 'Q'}, 'tndsQuarantine': {'serviceQuarantined': True, 'affectedStopIds': ['STOP-1'], 'patterns': [{'patternId': 'JP-Q', 'reasonCode': 'unknown_reason', 'affectedStopIds': ['STOP-1']}]}})
        with self.assertRaisesRegex(RefreshError, 'pattern is malformed'):
            validate(self.root)

    def test_quarantine_with_fabricated_schedules_fails(self):
        self._replace_first_tnds({'id': 'tnds:EA:fixture:Q', 'stopSchedules': {'STOP-1': {'monday': [600]}}, 'source': {'region': 'EA', 'serviceCode': 'Q'}, 'tndsQuarantine': {'serviceQuarantined': True, 'affectedStopIds': ['STOP-1'], 'patterns': [{'patternId': 'JP-Q', 'reasonCode': 'incomplete_runtime_sequence', 'affectedStopIds': ['STOP-1']}]}})
        with self.assertRaisesRegex(RefreshError, 'fabricated timetable'):
            validate(self.root)

    def test_malformed_shard_prefix_membership_fails(self):
        target = self.root / 'atlas/data/bus-tnds/services/0-ea.json'
        payload = json.loads(target.read_text())
        payload['stopPrefix'] = 'WRONG'
        target.write_text(json.dumps(payload))
        with self.assertRaisesRegex(RefreshError, 'shard is empty or malformed'):
            validate(self.root)

    def test_legacy_fetch_all_manifest_fails_national_validation(self):
        manifest = self.root / 'atlas/data/bus-tnds/manifest.json'
        payload = json.loads(manifest.read_text())
        payload.pop('serviceShardKeyLength')
        payload.pop('serviceShards')
        payload['services'] = ['services/0-ea.json']
        manifest.write_text(json.dumps(payload))
        with self.assertRaisesRegex(RefreshError, 'stop-prefix service shards'):
            validate(self.root)

    def test_raw_public_source_file_fails(self):
        (self.root / 'atlas/data/bus/raw.zip').write_bytes(b'not public data')
        with self.assertRaisesRegex(RefreshError, '(?i)raw source'):
            validate(self.root)


if __name__ == '__main__':
    unittest.main()
