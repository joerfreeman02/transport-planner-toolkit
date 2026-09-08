import assert from 'node:assert/strict';
import { buildServicePresentation, derivePrincipalLocations } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const base = {
  routeNumber: '25C',
  operator: 'Example Buses',
  directionFamily: 'headsign:outbound',
  operatingPeriodLines: ['Mon-Fri: Approx. 06:00–22:00'],
  serviceNote: ''
};

const summaries = [
  { ...base, id: 'short', directionFamily: 'headsign:short-working', origin: 'Harlow', destination: 'Waltham Cross', routePatternStopIds: ['A', 'B'], routePatternExtent: 2, recordActivity: 4, principalLocations: [] },
  { ...base, id: 'same', origin: 'Harlow', destination: 'Waltham Cross', routePatternStopIds: ['A', 'B', 'C'], routePatternExtent: 3, recordActivity: 8, principalLocations: ['Hoddesdon', 'Cheshunt'] },
  { ...base, id: 'main', origin: 'Harlow', destination: 'Waltham Cross', routePatternStopIds: ['A', 'B', 'C', 'D', 'E'], routePatternExtent: 5, recordActivity: 20, principalLocations: ['Hoddesdon', 'Cheshunt'] },
  { ...base, id: 'extra', origin: 'Harlow', destination: 'Waltham Cross', routePatternStopIds: ['A', 'B', 'C', 'D'], routePatternExtent: 4, recordActivity: 10, principalLocations: ['Hoddesdon', 'Cheshunt', 'Roydon'] },
  { ...base, id: 'unproven', directionFamily: 'headsign:unproven', origin: 'Harlow', destination: 'Waltham Cross', routePatternStopIds: ['X', 'Y', 'Z'], routePatternExtent: 3, recordActivity: 3, principalLocations: [] },
  { ...base, id: 'inbound', directionFamily: 'headsign:inbound', origin: 'Waltham Cross', destination: 'Harlow', routePatternStopIds: ['D', 'C', 'B', 'A'], routePatternExtent: 4, recordActivity: 18, principalLocations: ['Cheshunt'] }
];

const presented = buildServicePresentation(summaries);
const outbound = presented.filter(service => ['main', 'extra', 'same', 'short'].includes(service.id));
assert.deepEqual(outbound.map(service => service.id), ['main', 'extra', 'same', 'short']);
assert.equal(presented.length, summaries.length, 'Presentation must retain every legitimate service row.');
assert.equal(presented.find(service => service.id === 'same').presentation.principalLocationsText, 'As main 25C service');
assert.equal(presented.find(service => service.id === 'extra').presentation.principalLocationsText, 'As main 25C service, plus Roydon');
assert.equal(presented.find(service => service.id === 'short').presentation.principalLocationsText, 'Short working of main 25C service');
assert.equal(presented.find(service => service.id === 'unproven').presentation.principalLocationsText, 'See route origin / destination');
assert.notEqual(presented.find(service => service.id === 'inbound').directionFamily, presented.find(service => service.id === 'main').directionFamily);
assert.ok(presented.every(service => !service.presentation.principalLocationsText.includes('No additional principal locations identified')));

const fallbackRows = buildServicePresentation([
  { ...base, id: 'two-stop', directionFamily: 'headsign:two-stop', routePatternStopIds: ['T1', 'T2'], routePatternExtent: 2, principalLocations: [] },
  { ...base, id: 'multi-stop', directionFamily: 'headsign:multi-stop', routePatternStopIds: ['M1', 'M2', 'M3'], routePatternExtent: 3, principalLocations: [] },
  { ...base, id: 'unknown-extent', directionFamily: 'headsign:unknown', routePatternStopIds: [], routePatternExtent: 0, principalLocations: [] }
]);
assert.equal(fallbackRows.find(service => service.id === 'two-stop').presentation.principalLocationsText, 'Route endpoints only');
assert.equal(fallbackRows.find(service => service.id === 'multi-stop').presentation.principalLocationsText, 'See route origin / destination');
assert.equal(fallbackRows.find(service => service.id === 'unknown-extent').presentation.principalLocationsText, 'See route origin / destination');

const ruralCalls = ['Town A', 'Village B', 'Village C', 'Village D', 'Village E', 'Town F'].map(name => ({ name, locality: name }));
const ruralLocations = derivePrincipalLocations(ruralCalls);
assert.ok(ruralLocations.length > 0);
assert.deepEqual(ruralLocations, ['Village B', 'Village C', 'Village D', 'Village E']);
assert.ok(ruralLocations.length <= 7);
assert.doesNotMatch(ruralLocations.join(', '), /Town A|Town F/);
const manyRuralCalls = ['Town A', ...Array.from({ length: 10 }, (_, index) => `Village ${String.fromCharCode(66 + index)}`), 'Town Z'].map(name => ({ name, locality: name }));
assert.ok(derivePrincipalLocations(manyRuralCalls).length <= 7);
const ruralPresentation = buildServicePresentation([{ ...base, id: 'rural', routeNumber: 'R1', routePatternStopIds: ['A', 'B', 'C', 'D', 'E', 'F'], routePatternExtent: 6, principalLocations: ruralLocations }])[0];
assert.equal(ruralPresentation.presentation.principalLocationsText, ruralLocations.join(', '));
assert.doesNotMatch(ruralPresentation.presentation.principalLocationsText, /Route endpoints only|See route origin \/ destination/);

const sparseCalls = ['Origin', 'Stop B', 'Stop C', 'Stop D', 'Stop E', 'Destination'].map(name => ({ name }));
const sparseLocations = derivePrincipalLocations(sparseCalls);
assert.deepEqual(sparseLocations, ['Stop B', 'Stop D', 'Stop E']);
const sparsePresentation = buildServicePresentation([{ ...base, id: 'sparse', routeNumber: 'S1', routePatternStopIds: ['A', 'B', 'C', 'D', 'E', 'F'], routePatternExtent: 6, principalLocations: sparseLocations }])[0];
assert.equal(sparsePresentation.presentation.principalLocationsText, 'Stop B, Stop D, Stop E');

const result = { ok: true, stops: [], serviceSummaries: summaries };
const wordRows = buildBusWordTables(result)[1].rows.filter(row => Array.isArray(row));
assert.deepEqual(wordRows.map(row => row[2]), presented.map(service => `${service.origin} – ${service.destination}`));
assert.deepEqual(wordRows.map(row => row[3]), presented.map(service => service.presentation.principalLocationsText));
console.log('PASS shared Bus presentation decision drives deterministic browser/Word order and wording.');
