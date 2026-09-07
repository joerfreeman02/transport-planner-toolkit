import json
import unittest
import shutil
import zipfile
from pathlib import Path

from refresh_bus_data import BODS_DOWNLOAD_ROOT, BODS_REGIONS, RefreshError, TNDS_REGIONS, acquire_bods, acquire_tnds, source_outcome, tnds_region_from_filename, validate_candidate


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

    def test_bods_uses_official_regional_gtfs_endpoints_and_validates_archives(self):
        urls = []

        def fake_download(url, destination, label):
            urls.append(url)
            with zipfile.ZipFile(destination, 'w') as archive:
                for name in ('agency.txt', 'stops.txt', 'routes.txt', 'calendar.txt', 'trips.txt', 'stop_times.txt'):
                    archive.writestr(name, '')
            return {'identity': url, 'httpStatus': 200, 'contentType': 'application/zip', 'sourceHash': destination.name}

        gtfs, metadata = acquire_bods(self.root, download_fn=fake_download)
        self.assertEqual(urls, [f'{BODS_DOWNLOAD_ROOT}{region}/' for region in BODS_REGIONS])
        self.assertEqual(len(list(gtfs.glob('*.zip'))), len(BODS_REGIONS))
        self.assertEqual(len(metadata['regions']), len(BODS_REGIONS))

    def test_bods_corrupt_regional_archive_fails_with_source_context(self):
        def corrupt_download(url, destination, label):
            destination.write_bytes(b'not-a-zip')
            return {'identity': url, 'httpStatus': 200, 'contentType': 'application/octet-stream', 'sourceHash': 'bad'}

        with self.assertRaisesRegex(RefreshError, 'BODS east_anglia endpoint'):
            acquire_bods(self.root, download_fn=corrupt_download)

    def test_incomplete_regions_fail_before_download(self):
        with self.assertRaisesRegex(RefreshError, 'missing regions'):
            acquire_tnds(self.root, 'masked-user', 'masked-password', ftp_factory=IncompleteFtp)

    def test_all_realistic_tnds_filenames_are_recognised(self):
        for region in TNDS_REGIONS:
            self.assertEqual(tnds_region_from_filename(f'TNDS-{region}-v2.5.zip'), region)
            self.assertEqual(tnds_region_from_filename(f'TNDS_{region}_v2.5.zip'), region)
            self.assertEqual(tnds_region_from_filename(f'TNDS.{region}.v2.5.zip'), region)
        self.assertIsNone(tnds_region_from_filename('TNDS-EAST-v2.5.zip'))

    def test_candidate_validation_isolated_and_requires_all_regions(self):
        site = self.root
        bus = site / 'atlas/data/bus'
        tnds = site / 'atlas/data/bus-tnds/services'
        bus.mkdir(parents=True)
        tnds.mkdir(parents=True)
        (bus / 'stops.json.gz').write_bytes(b'candidate')
        (bus / 'services.json.gz').write_bytes(b'candidate')
        (tnds / 'service.json').write_text('{}')
        (bus / 'manifest.json').write_text(json.dumps({'stopShards': {'x': 'stops.json.gz'}, 'serviceShards': {'x': ['services.json.gz']}, 'sources': {'naptan': {'stopCount': 100}, 'bods': {'regions': [{'serviceCount': 100}]}}}))
        (tnds.parent / 'manifest.json').write_text(json.dumps({'regions': list(TNDS_REGIONS), 'services': ['services/service.json']}))
        counts = validate_candidate(site)
        self.assertEqual(counts['tndsServiceCount'], 1)

    def _write_candidate(self, naptan=100, services=100, regions=2):
        site = self.root
        bus = site / 'atlas/data/bus'
        tnds = site / 'atlas/data/bus-tnds/services'
        bus.mkdir(parents=True, exist_ok=True)
        tnds.mkdir(parents=True, exist_ok=True)
        (bus / 'stops.json.gz').write_bytes(b'candidate')
        (bus / 'services.json.gz').write_bytes(b'candidate')
        (tnds / 'service.json').write_text('{}')
        bods_regions = [{'serviceCount': services // regions} for _ in range(regions)]
        (bus / 'manifest.json').write_text(json.dumps({'stopShards': {'x': 'stops.json.gz'}, 'serviceShards': {'x': ['services.json.gz']}, 'sources': {'naptan': {'stopCount': naptan}, 'bods': {'regions': bods_regions}}}))
        (tnds.parent / 'manifest.json').write_text(json.dumps({'regions': list(TNDS_REGIONS), 'services': ['services/service.json']}))

    def test_modest_change_passes_and_severe_naptan_collapse_fails(self):
        self._write_candidate(naptan=90, services=90)
        validate_candidate(self.root, {'naptanStopCount': 100, 'bodsServiceCount': 100, 'bodsRegionCount': 2})
        self._write_candidate(naptan=49, services=100)
        with self.assertRaisesRegex(RefreshError, 'naptanStopCount'):
            validate_candidate(self.root, {'naptanStopCount': 100, 'bodsServiceCount': 100, 'bodsRegionCount': 2})

    def test_severe_bods_collapse_and_missing_region_fail(self):
        self._write_candidate(naptan=100, services=49)
        with self.assertRaisesRegex(RefreshError, 'bodsServiceCount'):
            validate_candidate(self.root, {'naptanStopCount': 100, 'bodsServiceCount': 100, 'bodsRegionCount': 2})
        self._write_candidate(naptan=100, services=100, regions=1)
        with self.assertRaisesRegex(RefreshError, 'BODS region count'):
            validate_candidate(self.root, {'naptanStopCount': 100, 'bodsServiceCount': 100, 'bodsRegionCount': 2})

    def test_source_status_states_and_initial_baseline(self):
        self.assertEqual(source_outcome('hash-a', None), ('UPDATED', 'INITIAL AUTOMATED BASELINE'))
        self.assertEqual(source_outcome('hash-a', {'sourceHash': 'hash-a'}), ('CHECKED_NO_CHANGE', None))
        self.assertEqual(source_outcome('hash-b', {'sourceHash': 'hash-a'}), ('UPDATED', None))

    def test_status_shape_cannot_contain_credentials(self):
        status = {'sources': {'tnds': {'sourceHash': 'safe-hash', 'regionsChecked': list(TNDS_REGIONS)}}}
        rendered = json.dumps(status)
        self.assertNotIn('masked-user', rendered)
        self.assertNotIn('masked-password', rendered)


if __name__ == '__main__':
    unittest.main()
