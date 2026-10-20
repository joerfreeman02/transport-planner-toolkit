import gzip
import json
import shutil
import unittest
from pathlib import Path

from validate_candidate import validate
from refresh_bus_data import BODS_REGIONS, RefreshError, TNDS_REGIONS


class CandidateValidatorTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2] / 'tmp' / 'alpha7-candidate-tests'
        shutil.rmtree(self.root, ignore_errors=True)
        bus = self.root / 'atlas/data/bus'
        tnds = self.root / 'atlas/data/bus-tnds/services'
        bus.mkdir(parents=True)
        tnds.mkdir(parents=True)
        stop = ['STOP-1', None, 'Example', None, None, 51.0, -0.1, 'B', None, None, None, None, None, None, []]
        service = {'id': 'service-1', 'stopSchedules': {'STOP-1': {'monday': [600]}}, 'routeNumber': '231', 'endpointEvidence': {'origin': {'raw:STOP-1': {'rawGtfsStopId': 'STOP-1', 'exactMatchMethod': 'unresolved', 'resolvedStopPointId': None, 'stopAreas': []}}, 'destination': {'raw:STOP-1': {'rawGtfsStopId': 'STOP-1', 'exactMatchMethod': 'unresolved', 'resolvedStopPointId': None, 'stopAreas': []}}}}
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

    def _convert_tnds_to_v2(self, max_bytes=8 * 1024 * 1024):
        root = self.root / 'atlas/data/bus-tnds'
        manifest_path = root / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        shards = {}
        measurements = []
        for prefix, relative_paths in manifest['serviceShards'].items():
            descriptors = []
            for relative in relative_paths:
                old_path = root / relative
                payload = json.loads(old_path.read_text())
                payload['schema'] = 'atlas-prepared-bus-tnds-v2'
                content = json.dumps(payload, separators=(',', ':')).encode()
                compressed = gzip.compress(content, mtime=0)
                new_relative = relative.removesuffix('.json') + '-0001.json.gz'
                target = root / new_relative
                target.write_bytes(compressed)
                old_path.unlink()
                descriptor = {'path': new_relative, 'stopIds': ['STOP-1'], 'uncompressedBytes': len(content), 'compressedBytes': len(compressed)}
                descriptors.append(descriptor)
                measurements.append(len(content))
            shards[prefix] = descriptors
        manifest.update({'schema': 'atlas-prepared-bus-tnds-v2', 'runtimeShardMaxBytes': max_bytes,
                         'runtimeShardCount': len(measurements), 'runtimeShardMaxObservedBytes': max(measurements),
                         'runtimeShardTotalBytes': sum(measurements), 'serviceShards': shards})
        manifest_path.write_text(json.dumps(manifest))

    def _fragment_first_tnds_record(self):
        root = self.root / 'atlas/data/bus-tnds'
        self._convert_tnds_to_v2()
        manifest_path = root / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        descriptors = manifest['serviceShards']['STOP-']
        original = descriptors.pop(0)
        original_path = root / original['path']
        payload = json.loads(gzip.decompress(original_path.read_bytes()))
        service = payload['services'][0]
        service['departureEvidenceByDay'] = {day: [] for day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')}
        service['departureEvidenceByDay']['monday'] = [
            {'minute': 600, 'stopPointId': 'STOP-1', 'journeyIdentity': 'JOURNEY-1'},
            {'minute': 615, 'stopPointId': 'STOP-1', 'journeyIdentity': 'JOURNEY-2'}
        ]
        parent_id = service['id']
        for ordinal, row in enumerate(service['departureEvidenceByDay']['monday'], start=1):
            fragment_id = f'{parent_id}#journey-fragment-{ordinal:04d}'
            fragment_service = {**service, 'departureEvidenceByDay': {'monday': [row]}, 'fragment': {
                'parentServiceId': parent_id, 'fragmentId': fragment_id, 'ordinal': ordinal, 'count': 2,
                'fragmentDepartureEvidenceCount': 1, 'parentDepartureEvidenceCount': 2,
                'parentEvidenceByDayCounts': {'monday': 2, 'tuesday': 0, 'wednesday': 0, 'thursday': 0, 'friday': 0, 'saturday': 0, 'sunday': 0},
                'evidenceOrderByDay': {'monday': [ordinal - 1], 'tuesday': [], 'wednesday': [], 'thursday': [], 'friday': [], 'saturday': [], 'sunday': []}
            }}
            fragment_payload = {**payload, 'services': [fragment_service]}
            content = json.dumps(fragment_payload, separators=(',', ':')).encode()
            compressed = gzip.compress(content, mtime=0)
            relative = f'services/0-ea-fragment-{ordinal:04d}.json.gz'
            (root / relative).write_bytes(compressed)
            descriptors.append({
                'path': relative, 'stopIds': ['STOP-1'], 'uncompressedBytes': len(content), 'compressedBytes': len(compressed),
                'parentServiceId': parent_id, 'fragmentId': fragment_id, 'fragmentOrdinal': ordinal, 'fragmentCount': 2,
                'fragmentDepartureEvidenceCount': 1, 'parentDepartureEvidenceCount': 2,
                'parentEvidenceByDayCounts': {'monday': 2, 'tuesday': 0, 'wednesday': 0, 'thursday': 0, 'friday': 0, 'saturday': 0, 'sunday': 0}
            })
        original_path.unlink()
        all_descriptors = [descriptor for values in manifest['serviceShards'].values() for descriptor in values]
        sizes = [descriptor['uncompressedBytes'] for descriptor in all_descriptors]
        manifest.update({
            'runtimeShardCount': len(sizes), 'runtimeShardTotalBytes': sum(sizes), 'runtimeShardMaxObservedBytes': max(sizes),
            'fragmentRecordCount': 2, 'logicalDepartureEvidenceCount': 2
        })
        manifest_path.write_text(json.dumps(manifest))
        return manifest_path

    def test_bounded_tnds_v2_candidate_passes_runtime_package_validation(self):
        self._convert_tnds_to_v2()
        result = validate(self.root)
        self.assertEqual(result['tndsShardRecords'], len(TNDS_REGIONS))

    def test_bounded_tnds_v2_rejects_actual_shard_over_limit(self):
        self._convert_tnds_to_v2(max_bytes=64)
        with self.assertRaisesRegex(RefreshError, 'exceeds the bounded 64-byte limit'):
            validate(self.root)

    def test_bounded_tnds_v2_accepts_lossless_semantic_fragments(self):
        self._fragment_first_tnds_record()
        result = validate(self.root)
        self.assertEqual(result['tndsShardRecords'], len(TNDS_REGIONS) + 1)

    def test_bounded_tnds_v2_rejects_missing_parent_fragment(self):
        manifest_path = self._fragment_first_tnds_record()
        manifest = json.loads(manifest_path.read_text())
        manifest['serviceShards']['STOP-'].pop()
        manifest['fragmentRecordCount'] = 1
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(RefreshError, 'incomplete or duplicated fragment set'):
            validate(self.root)

    def test_bounded_tnds_v2_rejects_mismatched_stop_index(self):
        self._convert_tnds_to_v2()
        manifest_path = self.root / 'atlas/data/bus-tnds/manifest.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['serviceShards']['STOP-'][0]['stopIds'] = ['OTHER']
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(RefreshError, 'stop index does not match'):
            validate(self.root)

    def test_bounded_tnds_v2_rejects_missing_service_identity(self):
        self._convert_tnds_to_v2()
        manifest_path = self.root / 'atlas/data/bus-tnds/manifest.json'
        manifest = json.loads(manifest_path.read_text())
        first = manifest['serviceShards']['STOP-'][0]
        path = self.root / 'atlas/data/bus-tnds' / first['path']
        payload = json.loads(gzip.decompress(path.read_bytes()))
        old_size = first['uncompressedBytes']
        payload['services'][0].pop('id')
        payload['services'][0]['source'].pop('serviceCode')
        content = json.dumps(payload, separators=(',', ':')).encode()
        compressed = gzip.compress(content, mtime=0)
        path.write_bytes(compressed)
        first['uncompressedBytes'] = len(content)
        first['compressedBytes'] = len(compressed)
        manifest['runtimeShardTotalBytes'] += len(content) - old_size
        manifest['runtimeShardMaxObservedBytes'] = max(item['uncompressedBytes'] for values in manifest['serviceShards'].values() for item in values)
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(RefreshError, 'duplicate or missing service identity'):
            validate(self.root)

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
        manifest['sources']['bods']['regions'] = [{'region': region, 'serviceCount': 1000, 'sourceHash': f'hash-{region}'} for region in BODS_REGIONS]
        manifest_path.write_text(json.dumps(manifest))

    def test_v2_candidate_and_sidecars_pass_structural_validation(self):
        self._convert_candidate_to_v2()
        result = validate(self.root)
        self.assertEqual(result['logicalGroupRecords'], 1)
        self.assertEqual(result['localityRecords'], 1)
        self.assertEqual(result['logicalGroupCount'], 1)
        self.assertEqual(result['districtCount'], 1)

    def test_v2_exact_nine_bods_regions_pass(self):
        self._convert_candidate_to_v2()
        self.assertEqual(validate(self.root)['bodsRegionCount'], 9)

    def test_v2_eight_of_nine_bods_regions_fail(self):
        self._convert_candidate_to_v2()
        self._set_v2_regions(BODS_REGIONS[:-1])
        with self.assertRaisesRegex(RefreshError, 'exactly once'):
            validate(self.root)

    def test_v2_missing_london_fails(self):
        self._convert_candidate_to_v2()
        self._set_v2_regions([region for region in BODS_REGIONS if region != 'london'])
        with self.assertRaisesRegex(RefreshError, 'exactly once'):
            validate(self.root)

    def test_v2_missing_each_non_london_region_fails(self):
        self._convert_candidate_to_v2()
        for missing in (region for region in BODS_REGIONS if region != 'london'):
            with self.subTest(missing=missing):
                self._set_v2_regions([region for region in BODS_REGIONS if region != missing])
                with self.assertRaisesRegex(RefreshError, 'exactly once'):
                    validate(self.root)

    def test_v2_duplicate_region_replacing_expected_region_fails(self):
        self._convert_candidate_to_v2()
        self._set_v2_regions([*BODS_REGIONS[:-1], BODS_REGIONS[0]])
        with self.assertRaisesRegex(RefreshError, 'exactly once'):
            validate(self.root)

    def test_v2_unexpected_bods_region_fails(self):
        self._convert_candidate_to_v2()
        self._set_v2_regions([*BODS_REGIONS[:-1], 'unexpected_region'])
        with self.assertRaisesRegex(RefreshError, 'exactly once'):
            validate(self.root)

    def _set_v2_regions(self, names):
        manifest_path = self.root / 'atlas/data/bus/manifest.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['sources']['bods']['regions'] = [{'region': region, 'serviceCount': 1000, 'sourceHash': f'hash-{region}'} for region in names]
        manifest_path.write_text(json.dumps(manifest))

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
