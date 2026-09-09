import assert from 'node:assert/strict';
import { buildServiceSummaries, formatServiceOriginDestination } from '../../src/atlas/domain/bus-service-assessment.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const schedule = values => Object.fromEntries(days.map(day => [day, values[day] ?? []]));
const stops = [
  { id: 'A', name: 'Bus Station', indicator: 'A', walking: { status: 'routed', distanceMetres: 100 } },
  { id: 'B', name: 'Bus Station', indicator: 'B', walking: { status: 'routed', distanceMetres: 130 } }
];

const duplicateJourney = { id: '279-journey', routeNumber: '279', operator: 'TfL', origin: 'Waltham Cross', destination: 'North Circular', direction: 'North Circular', source: { provider: 'BODS', patternId: '279-main' }, stopSchedules: { A: schedule({ monday: [420, 435, 450, 1860] }) } };
const duplicateJourneyAgain = structuredClone(duplicateJourney);
const night217 = { id: '217-night', routeNumber: '217', operator: 'TfL', origin: 'Waltham Cross', destination: 'Turnpike Lane', direction: 'Turnpike Lane', source: { provider: 'TfL', patternId: '217-night' }, stopSchedules: { B: schedule({ monday: [1380, 1440, 1500] }) } };

const summaries = buildServiceSummaries(stops, [duplicateJourney, duplicateJourneyAgain, night217]);
const summary279 = summaries.find(summary => summary.routeNumber === '279');
const summary217 = summaries.find(summary => summary.routeNumber === '217');
assert.equal(summary279.routeNumber, '279');
assert.deepEqual(summary279.departuresByDay.monday, [420, 435, 450], 'duplicate +1440 chronology is not allowed to inflate a route');
assert.match(summary279.serviceNote, /Schedule integrity note/);
assert.equal(summary217.routeNumber, '217', '217 remains a separate route and overnight pattern');
assert.deepEqual(summary217.departuresByDay.monday, [1380, 1440, 1500]);
assert.notEqual(summary279.directionFamily, summary217.directionFamily);

const consolidated = buildServiceSummaries(stops, [
  { id: 'service-a', routeNumber: '10', operator: 'Example', origin: 'Origin', destination: 'Destination', direction: 'Destination', source: { provider: 'BODS', patternId: 'p10' }, stopSchedules: { A: schedule({ monday: [420, 435, 450] }) } },
  { id: 'service-b', routeNumber: '10', operator: 'Example', origin: 'Origin', destination: 'Destination', direction: 'Destination', source: { provider: 'BODS', patternId: 'p10' }, stopSchedules: { B: schedule({ monday: [420, 435, 450] }) } }
]);
assert.equal(consolidated.length, 1, 'same service direction across nearby stops is one consolidated row');
assert.deepEqual(consolidated[0].assessedStops, ['A', 'B']);
assert.deepEqual(consolidated[0].servedAtStops, ['Bus Station — A', 'Bus Station — B']);
assert.match(formatServiceOriginDestination(consolidated[0]), /Assessed at: Bus Station — A \(Stops Bus Station — B\)/);
assert.equal(consolidated[0].frequencyBasisStopId, 'A');

const variants = buildServiceSummaries([{ id: 'A', walking: { status: 'routed', distanceMetres: 100 } }], [
  { id: 'standard', routeNumber: '10', operator: 'Example', origin: 'Origin', destination: 'Destination', direction: 'Destination', routePatternStopIds: ['A', 'B', 'C'], source: { patternId: 'standard' }, stopSchedules: { A: schedule({ monday: [420] }) } },
  { id: 'short', routeNumber: '10', operator: 'Example', origin: 'Origin', destination: 'Town', direction: 'Destination', routePatternStopIds: ['A', 'B'], source: { patternId: 'short' }, stopSchedules: { A: schedule({ monday: [450] }) } }
]);
assert.equal(variants.length, 2, 'different termini remain separate route variants');
assert.deepEqual(variants.map(service => service.destination).sort(), ['Destination', 'Town']);

console.log('PASS BUS-QA-03 schedule integrity, duplicate physical journey protection, route separation and consolidated stop context.');
