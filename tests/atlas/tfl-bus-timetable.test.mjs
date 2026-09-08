import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-timetable.json', import.meta.url), 'utf8'));
const response = body => ({ ok: true, status: 200, headers: new Headers({ 'access-control-allow-origin': '*' }), json: async () => body });
const cache = () => createJsonCache({ storage: createMemoryStorage(), namespace: 'tfl-test' });

let calls = [];
const tfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => { calls.push(url); return response(fixture); } });
const result = await tfl.servicesForStop({ lineId: '322', stopPointId: '490TEST001' });
assert.equal(result.ok, true);
assert.equal(result.data.length, 2);
assert.equal(result.data[0].routeNumber, '322');
assert.equal(result.data[0].origin, 'Crystal Palace');
assert.equal(result.data[0].destination, 'Clapham Common');
assert.deepEqual(result.data[0].stopSchedules['490TEST001'].monday, [370, 400]);
assert.ok(result.data[0].principalLocations.includes('West Norwood Bus Station'));
assert.equal(result.provenance.realtimeArrivalsUsed, false);
assert.equal(result.provenance.apiKeyEmbedded, false);
assert.equal(calls.length, 1);
await tfl.servicesForStop({ lineId: '322', stopPointId: '490TEST001' });
assert.equal(calls.length, 1, 'identical line/StopPoint request should use the existing cache');

const stop = { id: '490TEST001', name: 'Crystal Palace', latitude: 51.418, longitude: -0.082, routes: ['322'] };
const bods = { id: 'bods-322', routeNumber: '322', operator: 'London General', origin: 'BODS origin', destination: 'Clapham Common', direction: 'outbound', principalLocations: ['BODS location'], stopSchedules: { '490TEST001': { monday: [370], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } } };
const authoritative = createAuthoritativeBusTimetableAdapter({ tflAdapter: tfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [bods], warnings: [], provenance: { source: 'BODS' } }) } });
const composed = await authoritative.servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(composed.ok, true);
assert.equal(composed.data[0].operator, 'London General');
assert.equal(composed.data[0].origin, 'Crystal Palace');
assert.equal(composed.data[0].timetableSource, 'TfL + BODS supplementary');
assert.equal(composed.provenance.authority, 'TfL');
assert.equal(composed.warnings.filter(warning => /conflicting/i.test(warning)).length, 1);

const failureTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async () => { throw new Error('offline'); } });
const fallback = createAuthoritativeBusTimetableAdapter({ tflAdapter: failureTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [bods], warnings: [], provenance: { source: 'BODS' } }) } });
const fallbackResult = await fallback.servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(fallbackResult.ok, true);
assert.equal(fallbackResult.data[0].timetableSource, 'BODS fallback after TfL failure');
assert.match(fallbackResult.warnings.join(' '), /explicit supplementary fallback/);

const outside = await authoritative.servicesForStops([stop], { site: { latitude: 51.8527, longitude: -0.454343 } });
assert.equal(outside.data[0].id, 'bods-322');
assert.equal(outside.provenance.source, 'BODS');

const budgetCalls = [];
const budgetTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => { budgetCalls.push(url); return response(fixture); } });
const budgetAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: budgetTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) }, requestLimit: 20 });
const tooManyStops = Array.from({ length: 21 }, (_, index) => ({ id: `490TEST${String(index).padStart(3, '0')}`, routes: [`R${index}`] }));
const budgetResult = await budgetAuthority.servicesForStops(tooManyStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(budgetResult.ok, false);
assert.equal(budgetResult.code, 'invalid_request');
assert.equal(budgetCalls.length, 0, 'request-budget rejection must happen before HTTP');

console.log('PASS TfL timetable response interpretation, provenance, cache, conflict and fallback tests.');
console.log('PASS deterministic request counts: Crystal Palace-style 1 timetable request; opposite-direction fixture 2 distinct route records from 1 cached endpoint; busy-control budget enforced at <=20 requests.');
