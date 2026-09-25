import assert from 'node:assert/strict';
import { groupStopsForPresentation } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const departures = Object.fromEntries(days.map(day => [day, [420, 480]]));

const rawStops = [
  { id: 'C', name: 'Waltham Cross Bus Station', indicator: 'C', distanceMetres: 30, walking: { status: 'routed', distanceMetres: 300 } },
  { id: 'A', name: 'Waltham Cross Bus Station', indicator: 'A', distanceMetres: 100, walking: { status: 'routed', distanceMetres: 100 } },
  { id: 'B', name: 'Waltham Cross Bus Station', indicator: 'B', distanceMetres: 50, walking: { status: 'routed', distanceMetres: 200 } }
];
const presented = groupStopsForPresentation(rawStops);
assert.deepEqual(Object.fromEntries(presented.map(stop => [stop.id, stop.plannerLabel])), { A: 'Stop A', B: 'Stop B', C: 'Stop C' });
assert.deepEqual(Object.fromEntries(groupStopsForPresentation([...rawStops].reverse()).map(stop => [stop.id, stop.plannerLabel])), { A: 'Stop A', B: 'Stop B', C: 'Stop C' });

const grouped = groupStopsForPresentation([
  { ...rawStops[0], id: 'G1', logicalGroupId: 'group-1', logicalGroupName: 'Waltham Cross Bus Station' },
  { ...rawStops[1], id: 'G2', logicalGroupId: 'group-1', logicalGroupName: 'Waltham Cross Bus Station' }
]);
assert.ok(grouped.every(stop => stop.logicalGroupLabel?.includes('Waltham Cross Bus Station')));
assert.match(grouped[0].logicalGroupLabel, /Stop A and Stop B/);

const service = {
  id: 'golden-rule-service', routeNumber: '310', operator: 'Example Buses', origin: 'Hertford',
  destination: 'Waltham Cross Bus Station', destinationLocality: 'Waltham Cross', direction: 'Waltham Cross Bus Station',
  directionFamily: 'gtfs:outbound', routePatternStopIds: ['HERTFORD', 'A', 'B'],
  routePatternStops: [{ id: 'HERTFORD', name: 'Hertford' }, { id: 'B', name: 'Waltham Cross Bus Station', locality: 'Waltham Cross' }],
  stopIds: ['A', 'B'], frequencyBasisStopId: 'A', departuresByDay: departures, departureEvidenceByDay: Object.fromEntries(days.map(day => [day, [{ minute: 420, stopPointId: 'A', journeyIdentity: `${day}:1` }]])),
  principalLocations: ['Waltham Cross'], sourceRecordIds: ['golden-rule-service'], serviceNote: ''
};
const row = buildPlannerBusServiceSummaries([service], presented)[0];
assert.equal(row.destination, 'Waltham Cross');
assert.equal(row.rawDestination, 'Waltham Cross Bus Station');
assert.match(row.directionPatternText, /Towards Waltham Cross/);
assert.match(row.servedAtText, /Stop A/);
assert.match(row.servedAtText, /Stop B/);
const wordStopRows = buildBusWordTables({ ok: true, stops: presented, plannerServiceSummaries: [row], serviceSummaries: [] })[0].rows;
assert.deepEqual(wordStopRows.find(stopRow => stopRow[1] === 'Waltham Cross Bus Station' && stopRow[0] === 'Stop A').slice(0, 2), ['Stop A', 'Waltham Cross Bus Station']);
assert.equal(buildBusWordTables({ ok: true, stops: presented, plannerServiceSummaries: [row], serviceSummaries: [] })[1].rows[0][3], row.servedAtText);

const unsupported = buildPlannerBusServiceSummaries([{ ...service, id: 'unsupported', destination: 'Unknown Stand', destinationLocality: '', routePatternStops: [{ id: 'HERTFORD', name: 'Hertford' }, { id: 'B', name: 'Unknown Stand' }] }], presented)[0];
assert.equal(unsupported.destination, 'Unknown Stand', 'unsupported locality evidence does not rewrite the source destination');
console.log('PASS BUS-PLANNER-1 Golden Rule - routed Stop A/B/C identity, grouping, locality-safe destination wording and Browser/Word parity.');
