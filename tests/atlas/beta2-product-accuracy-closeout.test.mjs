import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { resolveCircularServiceDecision } from '../../src/atlas/domain/circular-service-decision.mjs';

const stop = { id: 'STOP-C', name: 'Bus Station', indicator: 'C', distanceMetres: 20, walking: { status: 'routed', distanceMetres: 20 } };
const makeRoute = ({ id, operator, destination, pattern, days, minutes, calendarProfileId = 'ordinary' }) => ({
  id, routeNumber: '242', operator, origin: 'Waltham Cross', destination, direction: destination,
  timetableSource: 'BODS', source: { provider: 'BODS' },
  originStopPointId: 'STOP-C', destinationStopPointId: pattern.at(-1), routePatternStopIds: pattern,
  routePatternStops: pattern.map(id => ({ id, name: id })), calendarProfileId,
  circular: false,
  stopSchedules: { 'STOP-C': Object.fromEntries(Object.entries(days).map(([day, enabled]) => [day, enabled ? minutes : []])) },
  departureEvidenceByDay: Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day,
    days[day] ? minutes.map((minute, index) => ({ minute, stopPointId: 'STOP-C', sourceRecordId: id, provider: 'BODS', patternOccurrenceIndex: index })) : []]))
});

const distinctOperators = buildPlannerBusServiceSummaries(buildServiceSummaries([stop], [
  makeRoute({ id: 'uno-242', operator: 'Uno', destination: 'Potters Bar', pattern: ['STOP-C','OAK','POT'], days: { monday: true, saturday: true }, minutes: [420,480,540] }),
  makeRoute({ id: 'cc-242', operator: 'Central Connect', destination: 'Welham Green', pattern: ['STOP-C','CUFFLEY','WELHAM'], days: { sunday: true }, minutes: [540,660,780] })
]), [stop]);
assert.equal(distinctOperators.filter(row => row.routeNumber === '242').length, 2, 'same-number routes with distinct operator, destination, and calendar remain separate public rows');
assert.ok(distinctOperators.some(row => row.operator === 'Uno' && row.destination.includes('Potters Bar')));
assert.ok(distinctOperators.some(row => row.operator === 'Central Connect' && row.destination.includes('Welham Green')));
const circularEntries = Array.from({ length: 8 }, (_, index) => [480 + index * 60, 523 + index * 60]).flat().filter(minute => minute <= 900).map(minute => ({ minute, stopPointId: 'STOP-C', sourceRecordId: 'loop-16', provider: 'BODS' }));
const loop16 = {
  id: 'loop-16', routeNumber: '16', operator: 'Central Connect', origin: 'Bus Station', destination: 'Bus Station',
  direction: 'Bus Station', circular: true, originStopPointId: 'STOP-C', destinationStopPointId: 'STOP-C',
  routePatternStopIds: ['STOP-C','WABY','QUEENSWAY','STOP-C'], routePatternStops: ['STOP-C','WABY','QUEENSWAY','STOP-C'].map(id => ({ id, name: id })),
  stopSchedules: { 'STOP-C': { monday: circularEntries.map(entry => entry.minute) } },
  departureEvidenceByDay: { monday: circularEntries }
};
const loop16Row = buildPlannerBusServiceSummaries(buildServiceSummaries([stop], [loop16]), [stop])[0];
assert.equal(loop16Row.circular, true);
assert.deepEqual(loop16Row.canonicalDeparturePopulationAll.monday.map(entry => entry.minute), [480,540,600,660,720,780,840,900], 'return calls do not create artificial short headways');
assert.match(loop16Row.typicalFrequencyLines.join(' '), /every ~60 mins/i);
assert.match(loop16Row.operatingPeriodLines.join(' '), /08:00–15:00/);

const equivalentTerminal212 = resolveCircularServiceDecision([{
  id: 'tnds-212', routeNumber: '212', operator: 'Epping Forest Community Transport',
  origin: 'Bus Station', destination: 'Bus Station',
  originEndpointDecision: { exactEvidence: true, nptgLocalityCode: 'E0013720' },
  destinationEndpointDecision: { exactEvidence: true, nptgLocalityCode: 'E0013720' },
  routePatternStops: [
    { id: 'BUS-STATION', name: 'Bus Station' },
    { id: 'ROUNDHILLS', name: 'Roundhills' },
    { id: 'RAIL-STATION', name: 'Waltham Cross Railway Station' }
  ]
}]);
assert.equal(equivalentTerminal212.classification, 'circular', 'resolved same-terminal identity plus common authoritative locality closes the TNDS pattern');

console.log('PASS Beta.2 accuracy closeout: distinct operator identity, circular terminal departures/period, and resolved TNDS terminal equivalence.');
