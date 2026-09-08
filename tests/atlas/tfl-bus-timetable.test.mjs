import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-timetable.json', import.meta.url), 'utf8'));
const response = body => ({ ok: true, status: 200, headers: new Headers({ 'access-control-allow-origin': '*' }), json: async () => body });
const cache = () => createJsonCache({ storage: createMemoryStorage(), namespace: 'tfl-test' });

let calls = [];
const outboundFixture = { ...fixture, timetable: { ...fixture.timetable, routes: [fixture.timetable.routes[0]] } };
const inboundFixture = { ...fixture, direction: 'inbound', timetable: { ...fixture.timetable, departureStopId: '490TEST003', routes: [fixture.timetable.routes[1]] } };
const tfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => { calls.push(url); return response(String(url).includes('490TEST003') ? inboundFixture : outboundFixture); } });
const result = await tfl.servicesForStop({ lineId: '322', stopPointId: '490TEST001' });
assert.equal(result.ok, true);
assert.equal(result.data.length, 1);
assert.equal(result.data[0].routeNumber, '322');
assert.equal(result.data[0].origin, 'Crystal Palace');
assert.equal(result.data[0].destination, 'Clapham Common');
assert.deepEqual(result.data[0].stopSchedules['490TEST001'].monday, [350, 370, 400, 1400]);
assert.ok(result.data[0].principalLocations.includes('West Norwood Bus Station'));
assert.equal(result.provenance.departureStopId, '490TEST001');
assert.equal(Object.prototype.hasOwnProperty.call(outboundFixture.timetable.routes[0], 'origin'), false);
assert.equal(Object.prototype.hasOwnProperty.call(outboundFixture.timetable.routes[0], 'direction'), false);
assert.equal(Object.prototype.hasOwnProperty.call(outboundFixture.timetable.routes[0], 'destination'), false);
assert.match(result.data[0].qualifications.join(' '), /frequency ranges/);
assert.equal(result.provenance.realtimeArrivalsUsed, false);
assert.equal(result.provenance.apiKeyEmbedded, false);
assert.equal(calls.length, 1);
await tfl.servicesForStop({ lineId: '322', stopPointId: '490TEST001' });
assert.equal(calls.length, 1, 'identical line/StopPoint request should use the existing cache');
const opposite = await tfl.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(opposite.data[0].direction, 'inbound');
assert.equal(opposite.data[0].origin, 'Clapham Common');
assert.equal(opposite.data[0].destination, 'Crystal Palace');

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
const allFailed = await createAuthoritativeBusTimetableAdapter({ tflAdapter: failureTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) } }).servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(allFailed.ok, false);
assert.match(allFailed.message, /No London zero-service conclusion/);

const outside = await authoritative.servicesForStops([stop], { site: { latitude: 51.8527, longitude: -0.454343 } });
assert.equal(outside.data[0].id, 'bods-322');
assert.equal(outside.provenance.source, 'BODS');

const preparedManifest = { schema: 'atlas-prepared-bus-data-v1', gridSize: 0.1, serviceShardKeyLength: 3, serviceShards: { '021': ['services/021.json'] }, stopShards: {}, sources: { bods: { url: 'https://fixture.test/bods', sha256: 'bods' }, naptan: { url: 'https://fixture.test/naptan', sha256: 'naptan' } }, generatedAt: '2026-09-08T00:00:00Z' };
const preparedTndsManifest = { schema: 'atlas-prepared-bus-tnds-v1', serviceShardKeyLength: 3, serviceShards: { '021': ['services/021-tnds.json'] }, regions: ['SE'], generatedAt: '2026-09-08T00:00:00Z' };
const preparedBodsService = { id: 'bods-10', routeNumber: '10', operator: 'BODS operator', origin: 'BODS origin', destination: 'BODS destination', direction: 'outbound', stopSchedules: { '021013518': { monday: [500] } } };
const preparedTndsService = { id: 'tnds-231', routeNumber: '231', operator: 'South Beds Dial-a-Ride', origin: 'Pipers Lane', destination: 'Bedford', direction: 'outbound', stopSchedules: { '021013518': { monday: [510] } } };
const preparedFetch = async url => {
  const path = new URL(url).pathname;
  const body = path === '/bus/manifest.json' ? preparedManifest : path === '/bus/services/021.json' ? { schema: 'atlas-prepared-bus-data-v1', services: [preparedBodsService] } : path === '/bus-tnds/manifest.json' ? preparedTndsManifest : { schema: 'atlas-prepared-bus-tnds-v1', stopPrefix: '021', services: [preparedTndsService] };
  return response(body);
};
const realNational = createPreparedBusDataAdapter({ fetchImpl: preparedFetch, baseUrl: 'https://fixture.test/bus/', tndsBaseUrl: 'https://fixture.test/bus-tnds/' });
const realLondonSupplement = createPreparedBusDataAdapter({ fetchImpl: preparedFetch, baseUrl: 'https://fixture.test/bus/' });
const realComposition = createAuthoritativeBusTimetableAdapter({ tflAdapter: failureTfl, nationalAdapter: realNational, londonSupplementAdapter: realLondonSupplement });
const pipers = await realComposition.servicesForStops([{ id: '021013518', routes: ['231'] }], { site: { latitude: 51.852700, longitude: -0.454343 } });
assert.equal(pipers.ok, true);
assert.ok(pipers.data.some(service => service.routeNumber === '231' && service.timetableSource === 'TNDS'));
assert.match(pipers.provenance.source, /Department for Transport Bus Open Data Service/);
assert.match(pipers.provenance.source, /Traveline National Dataset/);

const partialStops = [{ id: 'L1', routes: ['10'] }, { id: 'L2', routes: ['20'] }];
const partialTfl = { servicesForStop: async ({ lineId, stopPointId }) => lineId === '20' ? { ok: false, code: 'timeout', warnings: [], provenance: {} } : { ok: true, data: [{ id: 'tfl-10', routeNumber: '10', operator: 'TfL operator', origin: 'A', destination: 'B', direction: 'outbound', principalLocations: [], stopSchedules: { [stopPointId]: { monday: [500] } } }], warnings: [], provenance: {} } };
const partialBods = { id: 'bods-20', routeNumber: '20', operator: 'BODS 20', origin: 'C', destination: 'D', direction: 'outbound', principalLocations: [], stopSchedules: { L2: { monday: [600] } } };
const partialAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: partialTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [partialBods], warnings: [], provenance: { source: 'BODS' } }) } });
const partial = await partialAuthority.servicesForStops(partialStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(partial.data.length, 2);
assert.equal(partial.data.find(service => service.routeNumber === '20').timetableSource, 'BODS fallback after TfL failure');
assert.equal(partial.warnings.filter(warning => /could not be checked for one or more services/.test(warning)).length, 1);
const unresolved = await createAuthoritativeBusTimetableAdapter({ tflAdapter: partialTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) } }).servicesForStops(partialStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(unresolved.data.length, 1);
assert.equal(unresolved.data[0].routeNumber, '10');
assert.equal(unresolved.warnings.filter(warning => /no defensible national fallback/.test(warning)).length, 1);

const budgetCalls = [];
const budgetTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => { budgetCalls.push(url); return response(fixture); } });
const budgetAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: budgetTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) }, requestLimit: 20 });
const tooManyStops = Array.from({ length: 21 }, (_, index) => ({ id: `490TEST${String(index).padStart(3, '0')}`, routes: [`R${index}`] }));
const budgetResult = await budgetAuthority.servicesForStops(tooManyStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(budgetResult.ok, false);
assert.equal(budgetResult.code, 'invalid_request');
assert.equal(budgetCalls.length, 0, 'request-budget rejection must happen before HTTP');

const busyCalls = [];
const busyTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => { busyCalls.push(url); return response(outboundFixture); } });
const busyAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: busyTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) } });
const busyStops = Array.from({ length: 6 }, (_, index) => ({ id: `BUSY${index}`, routes: ['322', '323'] }));
const busyResult = await busyAuthority.servicesForStops(busyStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(busyResult.ok, true);
assert.equal(busyCalls.length, 12);
assert.equal(busyResult.provenance.requestCount, 12);

console.log('PASS TfL timetable response interpretation, provenance, cache, conflict and fallback tests.');
console.log('PASS deterministic request counts: Crystal Palace-style 1 request; opposite-direction physical StopPoints remain separate; busy control 6 stops x 2 lines = 12 unique requests and succeeds below 20.');
