import json
import unittest
import shutil
from pathlib import Path

from refresh_bus_data import RefreshError, TNDS_REGIONS, acquire_tnds, validate_candidate


class IncompleteFtp:
    def __init__(self, *_args, **_kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def login(self, *_args):
        return None

    def cwd(self, *_args):
        return None

    def nlst(self):
        return ['TNDS-EA-v2.5.zip', 'TNDS-SE-v2.5.zip']


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2] / 'tmp' / 'alpha7-refresh-tests'
        shutil.rmtree(self.root, ignore_errors=True)
        self.root.mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_missing_credentials_fails_without_network_or_prompt(self):
        with self.assertRaisesRegex(RefreshError, 'TNDS_USERNAME'):
            acquire_tnds(self.root, '', '', ftp_factory=lambda *_args, **_kwargs: self.fail('network called'))

    def test_incomplete_regions_fail_before_download(self):
        with self.assertRaisesRegex(RefreshError, 'missing regions'):
            acquire_tnds(self.root, 'masked-user', 'masked-password', ftp_factory=IncompleteFtp)

    def test_candidate_validation_isolated_and_requires_all_regions(self):
        site = self.root
        bus = site / 'atlas/data/bus'
        tnds = site / 'atlas/data/bus-tnds/services'
        bus.mkdir(parents=True)
        tnds.mkdir(parents=True)
        (bus / 'stops.json.gz').write_bytes(b'candidate')
        (bus / 'services.json.gz').write_bytes(b'candidate')
        (tnds / 'service.json').write_text('{}')
        (bus / 'manifest.json').write_text(json.dumps({'stopShards': {'x': 'stops.json.gz'}, 'serviceShards': {'x': ['services.json.gz']}, 'sources': {'naptan': {'stopCount': 1}, 'bods': {'regions': [{}]}}}))
        (tnds.parent / 'manifest.json').write_text(json.dumps({'regions': list(TNDS_REGIONS), 'services': ['services/service.json']}))
        counts = validate_candidate(site)
        self.assertEqual(counts['tndsServiceCount'], 1)


if __name__ == '__main__':
    unittest.main()
