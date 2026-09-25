import assert from 'node:assert/strict';
import { createAtlasReferenceData } from '../../src/atlas/reference-data/atlas-reference-data.mjs';
import { createBusStopDiscovery } from '../../src/atlas/application/bus-stop-discovery.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { groupStopsForPresentation } from '../../src/atlas/domain/bus-service-assessment.mjs';

const site = { latitude: 51.700000, longitude: -0.100000 };
const core = {
  id: 'CORE-A', sourceId: 'CORE-A', name: 'Central Bus Station', indicator: 'A', direction: 'N',
  latitude: site.latitude, longitude: site.longitude, distanceMetres: 0, routes: ['10'],
  logicalGroupRefs: [
    { id: 'naptan:G1', sourceId: 'G1', status: 'active', targetExists: true },
    { id: 'naptan:G2', sourceId: 'G2', status: 'active', targetExists: true },
    { id: 'naptan:G3', sourceId: 'G3', status: 'active', targetExists: false }
  ],
  nptgLocalityCode: 'E001', nptgLocalityName: 'Example', parentLocality: 'District Centre', districtId: 'nptg:26',
  timetableAuthority: 'NaPTAN', status: 'active'
};
const memberB = {
  id: 'MEM-B', sourceId: 'MEM-B', name: 'Central Bus Station', indicator: 'B', direction: 'S',
  latitude: 51.7064, longitude: -0.1000, status: 'active', transportMode: 'bus', busPreparedEligible: true, coordinateValid: true,
  provenance: { source: 'NaPTAN' }
};
const memberC = {
  id: 'MEM-C', sourceId: 'MEM-C', name: 'Central Bus Station', indicator: 'C', direction: 'E',
  latitude: 51.7068, longitude: -0.1000, status: 'active', transportMode: 'bus', busPreparedEligible: true, coordinateValid: true,
  provenance: { source: 'NaPTAN' }
};
const group1 = { id: 'naptan:G1', sourceId: 'G1', name: 'Central Bus Station', status: 'active', memberStopPointIds: ['CORE-A', 'MEM-B', 'INVALID-X'] };
const group2 = { id: 'naptan:G2', sourceId: 'G2', name: 'Central Bus Station', status: 'active', memberStopPointIds: ['CORE-A', 'MEM-C'] };
const locality = { id: 'nptg:E001', code: 'E001', name: 'Example', parentLocalityId: 'nptg:E000', parentLocalityName: 'District Centre', districtId: 'nptg:26', districtName: 'Example District', provenance: { source: 'NPTG' } };

const fixtureAdapter = {
  id: 'prepared-stop-structure-fixture',
  nearbyStops: async () => ({ ok: true, data: [core], evidence: [], warnings: [], provenance: { source: 'NaPTAN', stopCoverageComplete: true } }),
  logicalGroupsForStops: async selected => ({ ok: true, data: [group1, group2].filter(group => selected.some(stop => (stop.logicalGroupRefs ?? []).some(ref => ref.id === group.id))), warnings: [], provenance: { groupingAvailable: true } }),
  localitiesForStops: async () => ({ ok: true, data: [locality], warnings: [], provenance: { localityAvailable: true } }),
  stopAreaStructureForStops: async () => ({
    ok: true,
    data: {
      groups: [
        { ...group1, directMemberIds: group1.memberStopPointIds, qualifiedByCoreStopPointIds: ['CORE-A'] },
        { ...group2, directMemberIds: group2.memberStopPointIds, qualifiedByCoreStopPointIds: ['CORE-A'] }
      ],
      members: [
        { ...memberB, groupIds: ['naptan:G1'] },
        { ...memberC, groupIds: ['naptan:G2'] }
      ],
      invalidMembers: [{ id: 'INVALID-X', groupId: 'naptan:G1', status: 'inactive' }],
      unresolvedGroups: [{ id: 'naptan:G3', status: 'missing' }]
    },
    warnings: ['One inactive direct member was excluded; QA evidence retained.'],
    provenance: { stopAreaCompletionAvailable: true, qualifiedGroupCount: 2, completedMemberCount: 2, invalidMemberCount: 1, unresolvedGroupCount: 1 }
  })
};

const referenceData = createAtlasReferenceData({ adapter: fixtureAdapter });
const discovery = createBusStopDiscovery({
  tflAdapter: { nearbyStops: async () => ({ ok: true, data: [], evidence: [], warnings: [], provenance: { source: 'TfL' } }) },
  naptanAdapter: fixtureAdapter,
  referenceData,
  londonCoverage: () => false
});

const discovered = await discovery.nearbyStops(site);
assert.equal(discovered.ok, true);
assert.deepEqual(discovered.data.map(stop => stop.id), ['CORE-A', 'MEM-B', 'MEM-C']);
assert.equal(discovered.data.filter(stop => stop.id === 'MEM-B').length, 1);
assert.equal(discovered.data.filter(stop => stop.id === 'MEM-C').length, 1);
assert.equal(discovered.data.find(stop => stop.id === 'CORE-A').stopAreaCompletionStatus, 'CORE');
assert.equal(discovered.data.find(stop => stop.id === 'MEM-B').stopAreaCompletionStatus, 'GROUP_COMPLETED_OUTSIDE_CORE_RADIUS');
assert.equal(discovered.data.find(stop => stop.id === 'MEM-B').core, false);
assert.ok(discovered.data.find(stop => stop.id === 'MEM-B').distanceMetres > 700);
assert.deepEqual(discovered.data.find(stop => stop.id === 'CORE-A').logicalGroupIds, ['naptan:G1', 'naptan:G2', 'naptan:G3']);
assert.equal(discovered.data.find(stop => stop.id === 'CORE-A').logicalGroupRefs.find(ref => ref.id === 'naptan:G3').targetExists, false);
assert.deepEqual(discovered.data.find(stop => stop.id === 'MEM-B').logicalGroupIds, ['naptan:G1']);
assert.deepEqual(discovered.data.find(stop => stop.id === 'MEM-C').logicalGroupIds, ['naptan:G2']);
assert.equal(discovered.data.find(stop => stop.id === 'CORE-A').nptgLocalityName, 'Example');
assert.equal(discovered.data.find(stop => stop.id === 'CORE-A').parentLocality, 'District Centre');
assert.equal(discovered.provenance.stopAreaCompletion.noRecursion, true);
assert.equal(discovered.provenance.stopAreaCompletion.invalidMemberCount, 1);
assert.equal(discovered.provenance.stopAreaCompletion.unresolvedGroupCount, 1);
assert.equal(discovered.data.some(stop => stop.id === 'INVALID-X'), false);

const presented = groupStopsForPresentation(discovered.data);
assert.deepEqual(presented.map(stop => stop.id), ['CORE-A', 'MEM-B', 'MEM-C']);
assert.equal(new Set(presented.map(stop => stop.mapReference)).size, 3);
assert.deepEqual(presented.map(stop => stop.logicalGroupIds), [['naptan:G1', 'naptan:G2', 'naptan:G3'], ['naptan:G1'], ['naptan:G2']]);

let timetableStopIds = [];
const assessment = createBusAssessment({
  stopDiscovery: discovery,
  timetableData: {
    servicesForStops: async stops => {
      timetableStopIds = stops.map(stop => stop.id);
      return { ok: true, data: [{ id: 'svc-10', routeNumber: '10', operator: 'Fixture Buses', origin: 'Example', destination: 'Town', direction: 'N', circular: false, stopSchedules: { 'MEM-B': { monday: [480] } } }], warnings: [], provenance: { timetableConclusion: 'MATCHED', nationalSourceAvailable: true } };
    }
  },
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map((_stop, index) => ({ status: 'routed', distanceMetres: index + 1, durationSeconds: index + 1 })), provenance: { source: 'OSRM' } }) }
});
const assessed = await assessment.assess(site, { mode: 'full', radius: 700 });
assert.equal(assessed.ok, true);
assert.deepEqual(timetableStopIds, ['CORE-A', 'MEM-B', 'MEM-C']);
assert.equal(assessed.services[0].stopSchedules['MEM-B'].monday[0], 480);
assert.equal(assessed.stops.find(stop => stop.id === 'MEM-B').timetableMatch, true);

const nearestSelection = await assessment.assess(site, { mode: 'nearest', radius: 700 });
assert.equal(nearestSelection.ok, true);
assert.deepEqual(nearestSelection.stops.map(stop => stop.id), ['CORE-A', 'MEM-B', 'MEM-C']);

const v1Adapter = {
  ...fixtureAdapter,
  id: 'prepared-v1-fixture',
  logicalGroupsForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { groupingAvailable: false } }),
  localitiesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { localityAvailable: false } }),
  stopAreaStructureForStops: async () => ({ ok: true, data: { groups: [], members: [], invalidMembers: [], unresolvedGroups: [] }, warnings: [], provenance: { stopAreaCompletionAvailable: false } })
};
const v1Discovery = createBusStopDiscovery({
  tflAdapter: { nearbyStops: async () => ({ ok: true, data: [], evidence: [], warnings: [], provenance: { source: 'TfL' } }) },
  naptanAdapter: v1Adapter,
  referenceData: createAtlasReferenceData({ adapter: v1Adapter }),
  londonCoverage: () => false
});
const v1 = await v1Discovery.nearbyStops(site);
assert.deepEqual(v1.data.map(stop => stop.id), ['CORE-A']);
assert.equal(v1.data[0].stopAreaCompletionStatus, 'CORE');

console.log('PASS BUS-STOP-STRUCTURE - direct StopArea completion, exact union, no recursion, QA retention, timetable inclusion, nearest selection, identity, NPTG preservation, and V1 fallback.');
