import assert from 'node:assert/strict';
import { buildServicePresentation } from '../../src/atlas/domain/bus-service-assessment.mjs';
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
  { ...base, id: 'main', origin: 'Harlow', destination: 'Waltham Cross', routePatternStopIds: ['A', 'B', 'C', 'D'], routePatternExtent: 4, recordActivity: 20, principalLocations: ['Hoddesdon', 'Cheshunt'] },
  { ...base, id: 'unproven', directionFamily: 'headsign:unproven', origin: 'Harlow', destination: 'Waltham Cross', routePatternStopIds: ['X', 'Y'], routePatternExtent: 2, recordActivity: 3, principalLocations: [] },
  { ...base, id: 'inbound', directionFamily: 'headsign:inbound', origin: 'Waltham Cross', destination: 'Harlow', routePatternStopIds: ['D', 'C', 'B', 'A'], routePatternExtent: 4, recordActivity: 18, principalLocations: ['Cheshunt'] }
];

const presented = buildServicePresentation(summaries);
const outbound = presented.filter(service => ['main', 'same', 'short'].includes(service.id));
assert.deepEqual(outbound.map(service => service.id), ['main', 'same', 'short']);
assert.equal(presented.length, summaries.length, 'Presentation must retain every legitimate service row.');
assert.equal(presented.find(service => service.id === 'same').presentation.principalLocationsText, 'As main 25C service');
assert.equal(presented.find(service => service.id === 'short').presentation.principalLocationsText, 'Short working of main 25C service');
assert.equal(presented.find(service => service.id === 'unproven').presentation.principalLocationsText, 'Route endpoints only');
assert.notEqual(presented.find(service => service.id === 'inbound').directionFamily, presented.find(service => service.id === 'main').directionFamily);
assert.ok(presented.every(service => !service.presentation.principalLocationsText.includes('No additional principal locations identified')));

const result = { ok: true, stops: [], serviceSummaries: summaries };
const wordRows = buildBusWordTables(result)[1].rows.filter(row => Array.isArray(row));
assert.deepEqual(wordRows.map(row => row[2]), presented.map(service => `${service.origin} – ${service.destination}`));
assert.deepEqual(wordRows.map(row => row[3]), presented.map(service => service.presentation.principalLocationsText));
console.log('PASS shared Bus presentation decision drives deterministic browser/Word order and wording.');
