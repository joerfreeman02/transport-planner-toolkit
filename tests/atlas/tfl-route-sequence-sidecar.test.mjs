import assert from 'node:assert/strict';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';

const schedule = { monday: [480], tuesday: [480], wednesday: [480], thursday: [480], friday: [480], saturday: [], sunday: [] };
const records = [
  { id: 'principal', routeNumber: '13', operator: 'Operator', origin: 'A', destination: 'B', direction: 'B', timetableSource: 'TfL', routePatternStopIds: ['A', 'MID', 'B'], stopSchedules: { STOP: schedule } },
  { id: 'subordinate', routeNumber: '13C', operator: 'Operator', origin: 'A', destination: 'C', direction: 'C', timetableSource: 'TfL', routePatternStopIds: ['A', 'MID', 'C'], stopSchedules: { STOP: schedule } }
];
const stops = [{ id: 'STOP', name: 'Assessment stop' }];
const before = buildServiceSummaries(stops, records);
const richer = records.map((record, index) => ({
  ...record,
  tflRouteSequenceEvidence: {
    status: 'ambiguous-or-incomplete-link',
    sequences: [{ branchId: index, orderedStopPointIds: ['A', 'MID', index ? 'C' : 'B', 'SCHOOL'] }]
  }
}));
const after = buildServiceSummaries(stops, richer);
const publicShape = summaries => summaries.map(item => ({
  routeNumber: item.routeNumber,
  origin: item.origin,
  destination: item.destination,
  routePatternStopIds: item.routePatternStopIds,
  circularPatternStopIds: item.circularPatternStopIds,
  direction: item.direction,
  calendarProfileId: item.calendarProfileId,
  typicalFrequencyText: item.typicalFrequencyText,
  operatingPeriods: item.operatingPeriods
}));
assert.deepEqual(publicShape(after), publicShape(before), 'complete sequence sidecars do not widen grouping, CIRC, frequency, calendar, or operating-period evidence');
assert.equal(after.find(item => item.routeNumber === '13').destination, 'B', 'the principal family remains unchanged');
assert.equal(after.find(item => item.routeNumber === '13C').destination, 'C', 'the subordinate variant remains subordinate');
assert.equal(after[0].routePatternStopIds.includes('SCHOOL'), false, 'full-route stops never enter GROUP-facing routePatternStopIds');
assert.equal(after[0].tflRouteSequenceEvidence.status, 'ambiguous-or-incomplete-link', 'endpoint-resolution logic receives the separate sequence sidecar');
console.log('TfL route-sequence sidecar isolation passed.');
