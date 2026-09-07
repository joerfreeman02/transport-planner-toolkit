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
        for index, region in enumerate(TNDS_REGIONS):
            name = f'services/{index}-{region.lower()}.json'
            (self.root / 'atlas/data/bus-tnds' / name).write_text(json.dumps({'stopSchedules': {'STOP-1': {'monday': [600]}}, 'source': {'region': region}}))
        (self.root / 'atlas/data/bus-tnds/manifest.json').write_text(json.dumps({'schema': 'atlas-prepared-bus-tnds-v1', 'regions': list(TNDS_REGIONS), 'services': [f'services/{index}-{region.lower()}.json' for index, region in enumerate(TNDS_REGIONS)]}))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_generated_candidate_passes_structural_validation(self):
        result = validate(self.root)
        self.assertEqual(result['serviceShardRecords'], 1)
        self.assertEqual(result['stopIds'], 1)

    def test_raw_public_source_file_fails(self):
        (self.root / 'atlas/data/bus/raw.zip').write_bytes(b'not public data')
        with self.assertRaisesRegex(RefreshError, '(?i)raw source'):
            validate(self.root)


if __name__ == '__main__':
    unittest.main()
