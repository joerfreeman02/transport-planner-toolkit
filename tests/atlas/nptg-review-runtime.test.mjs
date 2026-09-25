import assert from 'node:assert/strict';
import { createAtlasReferenceData } from '../../src/atlas/reference-data/atlas-reference-data.mjs';
import { createBusStopDiscovery } from '../../src/atlas/application/bus-stop-discovery.mjs';

const stops = [
  { id: '2100A', name: 'Stop A', logicalGroupRefs: [{ id: 'naptan:210G1' }, { id: 'naptan:210G2' }], nptgLocalityCode: 'E001', routes: ['10'], timetableAuthority: 'NaPTAN' },
  { id: '2100B', name: 'Stop B', logicalGroupRefs: [{ id: 'naptan:missing' }], nptgLocalityCode: 'E999', routes: ['10'], timetableAuthority: 'NaPTAN' }
];
const groups = [{ id: 'naptan:210G1', name: 'Bus Station', memberStopPointIds: ['2100A'] }];
const locality = { id: 'nptg:E001', code: 'E001', name: 'Example', parentLocalityId: 'nptg:E000', parentLocalityName: 'District Centre', districtId: 'nptg:26', districtName: null, provenance: { source: 'NPTG', recordId: 'E001' } };

const adapter = {
  id: 'prepared-fixture',
  nearbyStops: async () => ({ ok: true, data: stops, evidence: [], warnings: [], provenance: { source: 'NaPTAN' } }),
  logicalGroupsForStops: async selected => ({ ok: true, data: groups.filter(group => selected.some(stop => stop.logicalGroupRefs.some(ref => ref.id === group.id))), warnings: [], provenance: { groupingAvailable: true } }),
  localitiesForStops: async selected => ({ ok: true, data: selected.filter(stop => stop.nptgLocalityCode === 'E001').map(() => locality), warnings: [], provenance: { localityAvailable: true, snapshotId: 'frozen-fixture' } })
};

const referenceData = createAtlasReferenceData({ adapter });
const discovery = createBusStopDiscovery({
  tflAdapter: { nearbyStops: async () => ({ ok: true, data: [], evidence: [], warnings: [], provenance: { source: 'TfL' } }) },
  naptanAdapter: adapter,
  referenceData,
  londonCoverage: () => false
});
const result = await discovery.nearbyStops({ latitude: 51.68, longitude: -0.03 });

assert.equal(result.ok, true);
assert.deepEqual(result.data.map(stop => stop.id), ['2100A', '2100B']);
assert.deepEqual(result.data[0].logicalGroupRefs, stops[0].logicalGroupRefs);
assert.deepEqual(result.data[0].logicalGroupEvidence.map(group => group.id), ['naptan:210G1']);
assert.equal(result.data[0].nptgLocalityCode, 'E001');
assert.equal(result.data[0].nptgLocalityName, 'Example');
assert.equal(result.data[0].parentLocalityId, 'nptg:E000');
assert.equal(result.data[0].parentLocality, 'District Centre');
assert.equal(result.data[0].districtId, 'nptg:26');
assert.equal(result.data[0].districtName, null);
assert.equal(result.data[0].localityResolution, 'resolved');
assert.equal(result.data[1].localityResolution, 'unresolved');
assert.equal(result.data[1].districtName, null);
assert.deepEqual(result.data.map(stop => stop.routes), [['10'], ['10']]);
assert.equal(result.provenance.referenceData.referenceDataSchema, 'atlas-reference-data-v1');
assert.equal(result.provenance.referenceData.provider, 'prepared-fixture');
console.log('PASS NPTG review runtime - provider-neutral evidence, hierarchy, unresolved locality, plural refs and physical StopPoint identity are deterministic.');
