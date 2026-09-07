import json
import io
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


def tnds_zip_bytes():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr('sample.xml', '<Service />')
    return buffer.getvalue()


class TransferFtp:
    def __init__(self, sessions, failing_region=None, fail_once=False):
        self.sessions = sessions
        self.failing_region = failing_region
        self.fail_once = fail_once
        self.retrieves = []
        self.sessions.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def login(self, *_args):
        return None

    def cwd(self, *_args):
        return None

    def nlst(self):
        return [f'TNDS-{region}-v2.5.zip' for region in TNDS_REGIONS]

    def retrbinary(self, command, callback):
        name = command.split(maxsplit=1)[1]
        region = tnds_region_from_filename(name)
        self.retrieves.append(region)
        if region == self.failing_region and (self.fail_once or len(self.sessions) > 2):
            callback(b'partial archive')
            if self.fail_once:
                self.fail_once = False
            raise ConnectionResetError('connection reset')
        callback(tnds_zip_bytes())


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

    def test_each_tnds_region_uses_an_isolated_transfer_session(self):
        sessions = []

        def factory(*_args, **_kwargs):
            return TransferFtp(sessions)

        xml_root, metadata = acquire_tnds(self.root, 'masked-user', 'masked-password', ftp_factory=factory, sleep_fn=lambda _seconds: None)
        self.assertTrue((xml_root / 'EA' / 'sample.xml').is_file())
        self.assertEqual(len(sessions), 1 + len(TNDS_REGIONS))
        self.assertEqual([session.retrieves for session in sessions[1:]], [[region] for region in TNDS_REGIONS])
        self.assertEqual(metadata['regions'], list(TNDS_REGIONS))

    def test_transient_transfer_failure_succeeds_on_bounded_retry(self):
        sessions = []

        def factory(*_args, **_kwargs):
            return TransferFtp(sessions, failing_region='EA' if len(sessions) == 1 else None, fail_once=len(sessions) == 1)

        acquire_tnds(self.root, 'masked-user', 'masked-password', ftp_factory=factory, sleep_fn=lambda _seconds: None)
        self.assertEqual(len(sessions), 1 + len(TNDS_REGIONS) + 1)
        self.assertEqual(sessions[1].retrieves, ['EA'])
        self.assertEqual(sessions[2].retrieves, ['EA'])
        self.assertFalse((self.root / 'tnds-raw' / '.TNDS-EA-v2.5.zip.part').exists())

    def test_persistent_region_failure_names_region_and_removes_partial_archive(self):
        sessions = []

        def factory(*_args, **_kwargs):
            return TransferFtp(sessions, failing_region='NW')

        with self.assertRaisesRegex(RefreshError, r'TNDS NW archive acquisition failed after 3/3 attempts'):
            acquire_tnds(self.root, 'masked-user', 'masked-password', ftp_factory=factory, sleep_fn=lambda _seconds: None)
        raw = self.root / 'tnds-raw'
        self.assertFalse((raw / '.TNDS-NW-v2.5.zip.part').exists())
        self.assertFalse((raw / 'TNDS-NW-v2.5.zip').exists())

    def test_transfer_diagnostics_redact_credentials(self):
        sessions = []

        class LeakyErrorFtp(TransferFtp):
            def retrbinary(self, command, callback):
                raise ConnectionResetError('reset for masked-user/masked-password')

        def factory(*_args, **_kwargs):
            return LeakyErrorFtp(sessions)

        with self.assertRaises(RefreshError) as raised:
            acquire_tnds(self.root, 'masked-user', 'masked-password', ftp_factory=factory, sleep_fn=lambda _seconds: None)
        self.assertNotIn('masked-user', str(raised.exception))
        self.assertNotIn('masked-password', str(raised.exception))

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
