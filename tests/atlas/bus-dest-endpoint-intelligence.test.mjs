import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { resolvePlannerEndpointDecisions } from '../../src/atlas/domain/planner-endpoint-decision.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const schedule = Object.fromEntries(days.map(day => [day, day === 'sunday' ? [] : [420, 480]]));
const stops = [{ id: 'ASSESS', name: 'Assessment stop', walking: { status: 'routed', distanceMetres: 100 } }];

const physical = {
  ORIGIN: { id: 'ORIGIN', name: 'Hertford Bus Station', nptgLocalityCode: 'E-HERT', logicalGroupRefs: [{ id: 'naptan:GA' }] },
  WALTHAM: { id: 'WALTHAM', name: 'Waltham Cross Stop A', nptgLocalityCode: 'E-WAL', logicalGroupRefs: [{ id: 'naptan:GW' }] },
  TEMP: { id: 'TEMP', name: 'Temporary Bus Station', nptgLocalityCode: 'E-CHESH', logicalGroupRefs: [{ id: 'naptan:GT' }] },
  SMITHS: { id: 'SMITHS', name: 'Smiths Lane', nptgLocalityCode: 'E-CHESH', logicalGroupRefs: [] },
  CONFLICT_WAL: { id: 'CONFLICT_WAL', name: 'Waltham Cross Stop', nptgLocalityCode: 'E-WAL', logicalGroupRefs: [] },
  CONFLICT_CHESH: { id: 'CONFLICT_CHESH', name: 'Cheshunt Stop', nptgLocalityCode: 'E-CHESH', logicalGroupRefs: [] }
};
const localities = [
  { id: 'nptg:E-HERT', code: 'E-HERT', name: 'Hertford', parentLocalityId: 'nptg:E-HERT-P', parentLocalityName: 'East Hertfordshire' },
  { id: 'nptg:E-WAL', code: 'E-WAL', name: 'Waltham Cross', parentLocalityId: 'nptg:E-WAL-P', parentLocalityName: 'Broxbourne' },
  { id: 'nptg:E-CHESH', code: 'E-CHESH', name: 'Cheshunt', parentLocalityId: 'nptg:E-CHESH-P', parentLocalityName: 'Broxbourne' }
];
const groups = [
  { id: 'naptan:GA', name: 'Hertford Bus Station', memberStopPointIds: ['ORIGIN'] },
  { id: 'naptan:GW', name: 'Waltham Cross Bus Station', memberStopPointIds: ['WALTHAM'] },
  { id: 'naptan:GT', name: 'Cheshunt Bus Station', memberStopPointIds: ['TEMP'] }
];
const referenceData = {
  resolvePreparedStopPointsByIds: async ids => ({ ok: true, physicalStops: ids.map(id => physical[id]).filter(Boolean), warnings: [], provenance: { preparedStopPointsAvailable: true } }),
  resolveStopReferences: async selected => ({ ok: true, logicalGroups: groups.filter(group => selected.some(stop => (stop.logicalGroupRefs ?? []).some(ref => ref.id === group.id))), localities: localities.filter(locality => selected.some(stop => locality.code === stop.nptgLocalityCode)), warnings: [], provenance: { nptgLocalityAvailable: true } }),
  resolveStopAreaStructure: async selected => ({ ok: true, structure: { groups: groups.filter(group => selected.some(stop => (stop.logicalGroupRefs ?? []).some(ref => ref.id === group.id))), members: [], invalidMembers: [], unresolvedGroups: [] }, warnings: [], provenance: { stopAreaCompletionAvailable: true } })
};

function service(id, destination, destinationStopPointId, extra = {}) {
  return {
    id, routeNumber: extra.routeNumber || '310', operator: extra.operator || 'Fixture Buses', origin: 'Hertford Bus Station', destination,
    originStopPointId: 'ORIGIN', destinationStopPointId, direction: destination, circular: Boolean(extra.circular),
    stopSchedules: { ASSESS: schedule }, routePatternStopIds: ['ORIGIN', destinationStopPointId].filter(Boolean),
    routePatternStops: [{ id: 'ORIGIN', name: 'Hertford Bus Station' }, { id: destinationStopPointId, name: destination }],
    principalLocations: ['Hoddesdon'], calendarProfileId: extra.calendarProfileId || 'ordinary', sourceRecordIds: [id], ...extra
  };
}

const sourceServices = [
  service('generic', 'Bus Station', 'WALTHAM'),
  service('temp', 'Temp Bus Station', 'TEMP', { routeNumber: '15' }),
  service('street', 'Smiths Lane', 'SMITHS', { routeNumber: '66' }),
  service('meaningful', 'Turnpike Lane Bus Station', 'WALTHAM', { routeNumber: '13' })
];
const resolved = await resolvePlannerEndpointDecisions(sourceServices, referenceData);
const byId = new Map(resolved.services.map(item => [item.id, item]));

assert.equal(byId.get('generic').destinationEndpointDecision.chosenDisplayName, 'Waltham Cross Bus Station');
assert.equal(byId.get('generic').destinationEndpointDecision.rawEndpointText, 'Bus Station');
assert.equal(byId.get('generic').destinationEndpointDecision.nptgLocalityName, 'Waltham Cross');
assert.equal(byId.get('generic').destinationEndpointDecision.parentLocalityName, 'Broxbourne');
assert.equal(byId.get('generic').destinationEndpointDecision.stopArea.name, 'Waltham Cross Bus Station');
assert.equal(byId.get('temp').destinationEndpointDecision.chosenDisplayName, 'Cheshunt Bus Station');
assert.equal(byId.get('meaningful').destinationEndpointDecision.chosenDisplayName, 'Turnpike Lane Bus Station');
assert.equal(byId.get('street').destinationEndpointDecision.chosenDisplayName, 'Cheshunt (Smiths Lane)');
assert.equal(byId.get('generic').originEndpointDecision.chosenDisplayName, 'Hertford Bus Station');
assert.equal(byId.get('generic').originEndpointDecision.endpointStopPointId, 'ORIGIN');

const noExact = await resolvePlannerEndpointDecisions([service('no-exact', 'Bus Station', null)], referenceData);
assert.equal(noExact.services[0].destinationEndpointDecision.chosenDisplayName, 'Bus Station');
assert.equal(noExact.services[0].destinationEndpointDecision.decisionType, 'unresolved-source-retained');
assert.equal(noExact.services[0].destinationEndpointDecision.unresolved, true);
assert.deepEqual(noExact.provenance.exactRequestedIds, ['ORIGIN']);

const conflict = await resolvePlannerEndpointDecisions([{
  ...service('conflict', 'Bus Station', 'CONFLICT_WAL'), destinationStopPointIds: ['CONFLICT_WAL', 'CONFLICT_CHESH']
}], referenceData);
assert.equal(conflict.services[0].destinationEndpointDecision.conflict, true);
assert.equal(conflict.services[0].destinationEndpointDecision.decisionType, 'conflict-review');
assert.equal(conflict.services[0].destinationEndpointDecision.rawEndpointText, 'Bus Station');

const before = buildPlannerBusServiceSummaries(sourceServices, stops);
const after = buildPlannerBusServiceSummaries(resolved.services, stops);
assert.equal(after.length, before.length, 'endpoint enrichment does not change planner row count');
assert.deepEqual(after.map(row => row.publicRouteFamilyKey), before.map(row => row.publicRouteFamilyKey));
assert.deepEqual(after.map(row => row.operator), before.map(row => row.operator));
assert.deepEqual(after.map(row => row.stopIds), before.map(row => row.stopIds));
assert.deepEqual(after.map(row => row.circular), before.map(row => row.circular));
assert.deepEqual(after.map(row => row.typicalFrequencyText), before.map(row => row.typicalFrequencyText));
assert.deepEqual(after.map(row => row.calendarProfileId), before.map(row => row.calendarProfileId));

const genericRow = after.find(row => row.routeNumber === '310');
assert.equal(genericRow.destination, 'Waltham Cross Bus Station');
assert.equal(genericRow.rawDestination, 'Bus Station');
const wordRow = buildBusWordTables({ ok: true, stops, plannerServiceSummaries: [genericRow], serviceSummaries: [], reviewItems: [] })[1].rows[0];
assert.match(wordRow[2], /Waltham Cross Bus Station/);
assert.match(genericRow.directionPatternText, /Waltham Cross Bus Station/);

console.log('PASS BUS-DEST exact endpoint hydration, NPTG/parent/StopArea evidence, conservative decisions, invariants, conflict handling, and Browser/Word parity.');
