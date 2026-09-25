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
        (self.root / 'atlas/data/bus-tnds/manifest.json').write_text(json.dumps({'schema': 'atlas-prepared-bus-tnds-v1', 'regions': list(TNDS_REGIONS), 'regionServiceCounts': {region: 1 for region in TNDS_REGIONS}, 'serviceCount': len(TNDS_REGIONS), 'serviceShardKeyLength': 5, 'serviceShards': {'STOP-': tnds_paths}}))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def _replace_first_tnds(self, payload):
        target = self.root / 'atlas/data/bus-tnds/services/0-ea.json'
        target.write_text(json.dumps({'schema': 'atlas-prepared-bus-tnds-v1', 'stopPrefix': 'STOP-', 'services': [payload]}))

    def test_generated_candidate_passes_structural_validation(self):
        result = validate(self.root)
        self.assertEqual(result['serviceShardRecords'], 1)
        self.assertEqual(result['stopIds'], 1)

    def _convert_candidate_to_v2(self):
        bus = self.root / 'atlas/data/bus'
        manifest_path = bus / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        old_stop_fields = ['id', 'naptanCode', 'name', 'indicator', 'direction', 'latitude', 'longitude', 'stopType', 'busStopType', 'locality', 'parentLocality', 'areaCode', 'modifiedAt', 'coordinateMethod', 'routes']
        v2_fields = old_stop_fields[:11] + ['nptgLocalityCode'] + old_stop_fields[11:] + ['logicalGroupRefs', 'status', 'provenance', 'localityResolution']
        stop_path = bus / 'stops/g1.json.gz'
        with gzip.open(stop_path, 'rt', encoding='utf-8') as stream:
            old_stop = json.load(stream)['stops'][0]
        stop = dict(zip(old_stop_fields, old_stop))
        stop.update({'nptgLocalityCode': 'E001', 'logicalGroupRefs': [{'id': 'naptan:GROUP-1', 'sourceId': 'GROUP-1', 'status': 'active', 'targetExists': True}], 'status': 'active', 'provenance': {'source': 'NaPTAN'}, 'localityResolution': 'resolved'})
        with gzip.open(stop_path, 'wt', encoding='utf-8') as stream:
            json.dump({'schema': 'atlas-prepared-bus-data-v2', 'stops': [[stop.get(field) for field in v2_fields]]}, stream)
        service_path = bus / 'services/a.json.gz'
        with gzip.open(service_path, 'rt', encoding='utf-8') as stream:
            services = json.load(stream)['services']
        with gzip.open(service_path, 'wt', encoding='utf-8') as stream:
            json.dump({'schema': 'atlas-prepared-bus-data-v2', 'services': services}, stream)
        (bus / 'groups').mkdir()
        (bus / 'localities').mkdir()
        with gzip.open(bus / 'groups/g.json.gz', 'wt', encoding='utf-8') as stream:
            json.dump({'schema': 'atlas-prepared-logical-groups-v1', 'groups': [{'id': 'naptan:GROUP-1', 'status': 'active', 'memberStopPointIds': ['STOP-1']}]}, stream)
        with gzip.open(bus / 'localities/e.json.gz', 'wt', encoding='utf-8') as stream:
            json.dump({'schema': 'atlas-prepared-nptg-localities-v1', 'localities': [{'id': 'nptg:E001', 'code': 'E001', 'name': 'Example', 'districtId': 'nptg:D1', 'districtName': 'District'}]}, stream)
        manifest.update({'schema': 'atlas-prepared-bus-data-v2', 'stopFields': v2_fields, 'groupShards': {'GRO': 'groups/g.json.gz'}, 'localityShards': {'E00': 'localities/e.json.gz'}, 'counts': {'activeStopPointCount': 1, 'logicalGroupCount': 1, 'localityCount': 1, 'districtCount': 1, 'stopShardCount': 1, 'serviceShardCount': 1, 'logicalGroupShardCount': 1, 'localityShardCount': 1}, 'qa': {'naptan': {}, 'nptg': {}}, 'sources': {**manifest['sources'], 'nptg': {'localityCount': 1, 'districtCount': 1}}})
        manifest_path.write_text(json.dumps(manifest))

    def test_v2_candidate_and_sidecars_pass_structural_validation(self):
        self._convert_candidate_to_v2()
        result = validate(self.root)
        self.assertEqual(result['logicalGroupRecords'], 1)
        self.assertEqual(result['localityRecords'], 1)
        self.assertEqual(result['logicalGroupCount'], 1)
        self.assertEqual(result['districtCount'], 1)

    def test_v2_unresolved_authoritative_district_reference_is_retained(self):
        self._convert_candidate_to_v2()
        locality_path = self.root / 'atlas/data/bus/localities/e.json.gz'
        with gzip.open(locality_path, 'rt', encoding='utf-8') as stream:
            payload = json.load(stream)
        payload['localities'][0]['districtName'] = None
        with gzip.open(locality_path, 'wt', encoding='utf-8') as stream:
            json.dump(payload, stream)
        result = validate(self.root)
        self.assertEqual(result['localityRecords'], 1)
        self.assertEqual(payload['localities'][0]['districtId'], 'nptg:D1')
        self.assertIsNone(payload['localities'][0]['districtName'])

    def test_v2_malformed_defined_district_name_fails_closed(self):
        self._convert_candidate_to_v2()
        locality_path = self.root / 'atlas/data/bus/localities/e.json.gz'
        with gzip.open(locality_path, 'rt', encoding='utf-8') as stream:
            payload = json.load(stream)
        payload['localities'][0]['districtName'] = 42
        with gzip.open(locality_path, 'wt', encoding='utf-8') as stream:
            json.dump(payload, stream)
        with self.assertRaisesRegex(RefreshError, 'district name is missing'):
            validate(self.root)

    def test_v2_duplicate_sidecar_identity_fails_closed(self):
        self._convert_candidate_to_v2()
        duplicate = self.root / 'atlas/data/bus/groups/g2.json.gz'
        with gzip.open(duplicate, 'wt', encoding='utf-8') as stream:
            json.dump({'schema': 'atlas-prepared-logical-groups-v1', 'groups': [{'id': 'naptan:GROUP-1', 'status': 'active', 'memberStopPointIds': ['STOP-1']}]}, stream)
        manifest = json.loads((self.root / 'atlas/data/bus/manifest.json').read_text())
        manifest['groupShards']['GRO2'] = 'groups/g2.json.gz'
        (self.root / 'atlas/data/bus/manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(RefreshError, 'duplicated'):
            validate(self.root)

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

    def _set_tnds_coverage(self, counts, regions=None):
        manifest = self.root / 'atlas/data/bus-tnds/manifest.json'
        payload = json.loads(manifest.read_text())
        payload['regionServiceCounts'] = counts
        payload['serviceCount'] = sum(value for value in counts.values() if isinstance(value, int) and not isinstance(value, bool))
        if regions is not None:
            payload['regions'] = regions
        manifest.write_text(json.dumps(payload))

    def test_regional_retained_coverage_healthy(self):
        counts = {region: 100 for region in TNDS_REGIONS}
        self._set_tnds_coverage(counts)
        self.assertEqual(validate(self.root)['tndsServiceCount'], 800)

    def test_zero_retained_region_fails_even_above_national_collapse_threshold(self):
        counts = {region: 100 for region in TNDS_REGIONS}
        counts['SE'] = 0
        self._set_tnds_coverage(counts)
        with self.assertRaisesRegex(RefreshError, 'retained no services for region SE'):
            validate(self.root)

    def test_missing_region_count_fails(self):
        counts = {region: 100 for region in TNDS_REGIONS}
        del counts['NW']
        self._set_tnds_coverage(counts)
        with self.assertRaisesRegex(RefreshError, 'regionServiceCounts missing region NW'):
            validate(self.root)

    def test_malformed_region_count_fails(self):
        counts = {region: 100 for region in TNDS_REGIONS}
        counts['EA'] = 'invalid'
        self._set_tnds_coverage(counts)
        with self.assertRaisesRegex(RefreshError, 'regionServiceCounts for region EA is malformed'):
            validate(self.root)

    def test_processed_region_shape_fails_with_region_coverage_message(self):
        self._set_tnds_coverage({region: 100 for region in TNDS_REGIONS}, ['EM', 'NE', 'SE'])
        with self.assertRaisesRegex(RefreshError, r'expected EA, EM, NE, NW, SE, SW, WM, Y; received EM, NE, SE'):
            validate(self.root)


if __name__ == '__main__':
    unittest.main()
