import assert from 'node:assert/strict';
import { mergeBusTimetableSources } from '../../src/atlas/domain/bus-timetable-merge.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';

const schedule = times => ({ monday: times, tuesday: times, wednesday: times, thursday: times, friday: times, saturday: [], sunday: [] });
const service = (id, overrides = {}) => ({
  id, routeNumber: '230', operator: 'Example Buses', origin: 'Pipers Lane', destination: 'Town Centre', direction: 'Town Centre',
  circular: false, stopSchedules: { LOCAL: schedule([420, 480]) },
  timetableSource: id.startsWith('tnds:') ? 'TNDS' : 'BODS',
  ...overrides
});

const duplicate = mergeBusTimetableSources({
  bods: [service('bods:230')],
  tnds: [service('tnds:230')]
});
assert.equal(duplicate.length, 1, 'equivalent local BODS/TNDS evidence yields one planner input');
assert.equal(duplicate[0].timetableSource, 'BODS', 'BODS remains the timetable authority for a local duplicate');
assert.deepEqual(duplicate[0].stopSchedules.LOCAL.monday, [420, 480], 'duplicate provider evidence cannot double-count local departures');

const differentLocalStop = mergeBusTimetableSources({
  bods: [service('bods:12', { routeNumber: '12' })],
  tnds: [service('tnds:12', { routeNumber: '12', stopSchedules: { OTHER: schedule([420]) } })]
});
assert.equal(differentLocalStop.length, 2, 'a same-number service without the same local StopPoint remains supplementary');
assert.equal(differentLocalStop[1].timetableSource, 'TNDS');

const oppositeDirection = mergeBusTimetableSources({
  bods: [service('bods:8', { routeNumber: '8' })],
  tnds: [service('tnds:8', { routeNumber: '8', origin: 'Town Centre', destination: 'Pipers Lane', direction: 'Pipers Lane' })]
});
assert.equal(oppositeDirection.length, 2, 'opposite local direction is not collapsed by route number');

const differentOperator = mergeBusTimetableSources({
  bods: [service('bods:9', { routeNumber: '9' })],
  tnds: [service('tnds:9', { routeNumber: '9', operator: 'Community Transport' })]
});
assert.equal(differentOperator.length, 2, 'a distinct operator remains a separate local service');

const insufficientIdentity = mergeBusTimetableSources({
  bods: [service('bods:7', { routeNumber: '7', operator: '', origin: '', destination: '', direction: '' })],
  tnds: [service('tnds:7', { routeNumber: '7', operator: '', origin: '', destination: '', direction: '' })]
});
assert.equal(insufficientIdentity.length, 2, 'ambiguous evidence is retained instead of guessed equivalent');

const plannerRows = buildPlannerBusServiceSummaries([
  { id: 'tfl:7', routeNumber: '7', operator: 'TfL', origin: 'Start', destination: 'End', direction: 'End', directionFamily: 'gtfs:0', source: { provider: 'TfL' }, timetableSource: 'TfL', stopIds: ['LOCAL'], frequencyBasisStopId: 'LOCAL', departuresByDay: Object.fromEntries(Object.keys(schedule([])).map(day => [day, [420]])), departureEvidenceByDay: Object.fromEntries(Object.keys(schedule([])).map(day => [day, [{ minute: 420, stopPointId: 'LOCAL', provider: 'TfL' }]])), calendarProfileId: 'ordinary', circular: false, principalLocations: ['Test'], sourceRecordIds: ['tfl:7'] }
], [{ id: 'LOCAL', name: 'Local Stop', distanceMetres: 10, walking: { status: 'routed', distanceMetres: 10 } }]);
assert.equal(plannerRows[0].timetableSource, 'TfL', 'the browser summary retains primary TfL provenance');

console.log('PASS site-scoped BODS/TNDS arbitration and planner provenance contract.');
