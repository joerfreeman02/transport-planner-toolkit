import assert from 'node:assert/strict';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { resolveCircularServiceDecision } from '../../src/atlas/domain/circular-service-decision.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';

const weekdays = { monday: [360, 420], tuesday: [360, 420], wednesday: [360, 420], thursday: [360, 420], friday: [360, 420], saturday: [], sunday: [] };
const stop = { id: 'PIPERS-A', name: 'Pipers Lane', distanceMetres: 40, walking: { status: 'routed', distanceMetres: 40 } };

const [scopedSummary] = buildServiceSummaries([stop], [{
  id: 'pattern-with-stop-scope', routeNumber: '230', operator: 'Centrebus South', provider: 'TNDS',
  source: { provider: 'TNDS' }, origin: 'Lyons Community Centre', destination: 'Caddington Woods',
  direction: 'outbound', stopSchedules: { 'PIPERS-A': weekdays },
  // Prepared whole-pattern evidence is repeated once per stop call and lacks
  // a stopPointId. The representative stop's schedule is the safe population.
  departureEvidenceByDay: Object.fromEntries(Object.keys(weekdays).map(day => [day, [360, 360, 420, 420].map(minute => ({ minute, journeyIdentity: `${day}-${minute}` }))]))
}]);
assert.deepEqual(scopedSummary.departuresByDay.monday, [360, 420]);
assert.equal(scopedSummary.frequencyByDay.monday.departureCount, 2);

const bodsLoop = {
  id: 'bods-230-loop', routeNumber: '230', operator: 'Centrebus', provider: 'BODS',
  source: { provider: 'BODS' }, direction: 'gtfs:0', circular: true,
  circularPatternStopIds: ['PIPERS-A', 'MID-1', 'MID-2', 'PIPERS-A']
};
const tndsOpenVariant = {
  id: 'tnds-230-open', routeNumber: '230', operator: 'Centrebus South', provider: 'TNDS',
  source: { provider: 'TNDS' }, direction: 'outbound', circular: false,
  circularPatternStopIds: ['PIPERS-A', 'MID-1', 'MID-2', 'REMOTE-END']
};
const circular = resolveCircularServiceDecision([bodsLoop, tndsOpenVariant], { principal: bodsLoop, component: [bodsLoop, tndsOpenVariant] });
assert.equal(circular.classification, 'circular', 'an open supplementary source pattern cannot veto a proven closed BODS principal');
assert.equal(circular.variantClassifications.length, 2, 'supplementary pattern remains available for audit');

const plannerBase = {
  routeNumber: 'R1', origin: 'Origin', destination: 'Destination', direction: 'outbound', directionFamily: 'outbound',
  routePatternStopIds: ['ORIGIN', 'PIPERS-A', 'DESTINATION'], frequencyBasisStopId: 'PIPERS-A', stopIds: ['PIPERS-A'],
  departuresByDay: weekdays, frequencyEvidence: [], sourceRecordIds: ['main']
};
const planner = buildPlannerBusServiceSummaries([
  { ...plannerBase, id: 'bods-main', operator: 'Centrebus', timetableSource: 'BODS', source: { provider: 'BODS' } },
  { ...plannerBase, id: 'tnds-corroboration', operator: 'Centrebus South', timetableSource: 'TNDS', source: { provider: 'TNDS' } }
], [stop]);
assert.equal(planner.length, 1, 'matching BODS/TNDS evidence for one direction forms one planner row');
assert.equal(planner[0].operator, 'Centrebus', 'operator display comes from winning BODS evidence when feeds corroborate one row');
const tflOperatorFallback = buildPlannerBusServiceSummaries([
  { ...plannerBase, id: 'tfl-authority-r1', operator: 'Operator not supplied in the timetable', timetableSource: 'TfL', source: { provider: 'TfL' }, sourceRecordIds: ['tfl-r1'], sourceRouteIds: ['route-r1'] },
  { ...plannerBase, id: 'bods-copy-r1', operator: 'Arriva London North', timetableSource: 'BODS', provider: 'BODS', source: { provider: 'BODS' }, sourceRecordIds: ['bods-r1'], sourceRouteIds: ['route-r1'] }
], [stop]);
assert.equal(tflOperatorFallback.length, 1);
assert.equal(tflOperatorFallback[0].timetableSource, 'TfL', 'the direct TfL timetable remains the winning source');
assert.equal(tflOperatorFallback[0].operator, 'Arriva London North', 'a structurally corroborated named BODS operator can fill the missing TfL operator label');

console.log('PASS S2E planner corrections: stop-scoped departures and authority-scoped circular arbitration.');
