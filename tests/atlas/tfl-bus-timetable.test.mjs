import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-timetable.json', import.meta.url), 'utf8'));
const routeFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-line-route.json', import.meta.url), 'utf8'));
const multipleFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-timetable-multiple-intervals.json', import.meta.url), 'utf8'));
const ambiguousFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-timetable-ambiguous-intervals.json', import.meta.url), 'utf8'));
const response = body => ({ ok: true, status: 200, headers: new Headers({ 'access-control-allow-origin': '*' }), json: async () => body });
const httpFailure = status => ({ ok: false, status, headers: new Headers(), json: async () => ({}) });
const cache = () => createJsonCache({ storage: createMemoryStorage(), namespace: 'tfl-test' });
const withOperator = { ...fixture, timetable: { ...fixture.timetable, routes: fixture.timetable.routes.map(route => ({ ...route, operator: 'London General' })) } };
const inboundFixture = { ...withOperator, direction: 'inbound', timetable: { ...withOperator.timetable, departureStopId: '490TEST004', routes: [{ ...withOperator.timetable.routes[0], stationIntervals: [{ intervals: [{ stopId: '490TEST004', timeToArrival: 0 }, { stopId: '490TEST006', timeToArrival: 8 }, { stopId: '490TEST003', timeToArrival: 12 }, { stopId: '490TEST001', timeToArrival: 20 }] }] }] } };

let timetableCalls = 0, routeCalls = 0;
const tfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => {
  if (String(url).includes('/Route')) { routeCalls += 1; return response(routeFixture); }
  timetableCalls += 1;
  return response(String(url).includes('490TEST004') ? inboundFixture : withOperator);
} });
const result = await tfl.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(result.ok, true);
assert.equal(result.data.length, 1);
assert.equal(result.data[0].routeNumber, '322');
assert.equal(result.data[0].origin, 'Full Route Origin');
assert.equal(result.data[0].destination, 'Clapham Common');
assert.notEqual(result.data[0].origin, 'Crystal Palace', 'a selected mid-route stop must never become the claimed full route origin');
assert.deepEqual(result.data[0].routePatternStopIds, ['490TEST003', '490TEST006', '490TEST004']);
assert.deepEqual(result.data[0].stopSchedules['490TEST003'].monday, [350, 370, 400, 1400]);
assert.ok(result.data[0].principalLocations.includes('West Norwood Bus Station'));
assert.equal(result.provenance.departureStopId, '490TEST003');
assert.equal(result.provenance.timetableRequests, 1);
assert.equal(result.provenance.routeMetadataRequests, 1);
assert.match(result.data[0].qualifications.join(' '), /frequency ranges/);
assert.equal(timetableCalls, 1);
assert.equal(routeCalls, 1);
await tfl.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(timetableCalls, 1, 'identical line/StopPoint request should use the existing cache');
assert.equal(routeCalls, 1, 'line route metadata should use the existing cache');
let oppositeTimetable = 0, oppositeRoute = 0;
const oppositeTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => {
  if (String(url).includes('/Route')) { oppositeRoute += 1; return response(routeFixture); }
  oppositeTimetable += 1;
  return response(inboundFixture);
} });
const opposite = await oppositeTfl.servicesForStop({ lineId: '322', stopPointId: '490TEST004' });
assert.equal(opposite.data[0].direction, 'inbound');
assert.equal(opposite.data[0].origin, 'Clapham Common');
assert.equal(opposite.data[0].destination, 'Full Route Origin');
assert.equal(oppositeTimetable, 1);
assert.equal(oppositeRoute, 1);

const multi = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => response(String(url).includes('/Route') ? routeFixture : multipleFixture) });
const multiResult = await multi.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(multiResult.data.length, 2);
const fullPattern = multiResult.data.find(service => service.source.intervalId === 'full');
const shortPattern = multiResult.data.find(service => service.source.intervalId === 'short');
assert.deepEqual(fullPattern.stopSchedules['490TEST003'].monday, [350, 370]);
assert.deepEqual(shortPattern.stopSchedules['490TEST003'].monday, [380, 1400]);
assert.deepEqual(fullPattern.routePatternStopIds, ['490TEST003', '490TEST004']);
assert.deepEqual(shortPattern.routePatternStopIds, ['490TEST003', '490TEST005']);
assert.equal(shortPattern.origin, '', 'a route metadata destination mismatch must not be used to invent short-working identity');
assert.equal(shortPattern.destination, '');
const ambiguous = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => response(String(url).includes('/Route') ? routeFixture : ambiguousFixture) });
const ambiguousResult = await ambiguous.servicesForStop({ lineId: '322', stopPointId: '490TEST003' });
assert.equal(ambiguousResult.data.length, 0);
assert.match(ambiguousResult.warnings.join(' '), /without intervalId linkage/);

const stop = { id: '490TEST003', name: 'Crystal Palace', latitude: 51.418, longitude: -0.082, routes: ['322'] };
const matchingBods = { id: 'bods-322', routeNumber: '322', operator: 'London General', origin: 'Full Route Origin', destination: 'Clapham Common', direction: 'outbound', principalLocations: ['West Norwood Bus Station', 'West Norwood'], routePatternStopIds: ['490TEST003', '490TEST006', '490TEST004'], operatingPeriodEvidence: true, stopSchedules: { '490TEST003': { monday: [370], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } } };
const authoritative = createAuthoritativeBusTimetableAdapter({ tflAdapter: tfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [matchingBods], warnings: [], provenance: { source: 'BODS' } }) } });
const matching = await authoritative.servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(matching.ok, true);
assert.equal(matching.data[0].timetableSource, 'TfL');
assert.equal(matching.warnings.filter(warning => /conflicting/i.test(warning)).length, 0, 'matching full TfL/BODS identity must pass silently');
assert.equal(matching.data[0].origin, 'Full Route Origin', 'the mid-route control makes a parser-derived false origin a test failure');

const conflictingBods = { ...matchingBods, origin: 'Wrong Origin', destination: 'Wrong Destination' };
const conflictAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: tfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [conflictingBods], warnings: [], provenance: { source: 'BODS' } }) } });
const conflict = await conflictAuthority.servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(conflict.data[0].origin, 'Full Route Origin');
assert.equal(conflict.data[0].destination, 'Clapham Common');
assert.equal(conflict.warnings.filter(warning => /conflicting/i.test(warning)).length, 1, 'a material origin/destination disagreement is aggregated once');

const missingMetadataTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => String(url).includes('/Route') ? httpFailure(503) : response(withOperator) });
const supplemented = await createAuthoritativeBusTimetableAdapter({ tflAdapter: missingMetadataTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [matchingBods], warnings: [], provenance: { source: 'BODS' } }) } }).servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(supplemented.data[0].origin, 'Full Route Origin');
assert.equal(supplemented.data[0].destination, 'Clapham Common');
assert.equal(supplemented.data[0].timetableSource, 'TfL + BODS supplementary');

const failureTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async () => { throw new Error('offline'); } });
const fallback = createAuthoritativeBusTimetableAdapter({ tflAdapter: failureTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [matchingBods], warnings: [], provenance: { source: 'BODS' } }) } });
const fallbackResult = await fallback.servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(fallbackResult.ok, true);
assert.equal(fallbackResult.data[0].timetableSource, 'BODS fallback after TfL failure');
assert.match(fallbackResult.warnings.join(' '), /explicit supplementary fallback/);
const allFailed = await createAuthoritativeBusTimetableAdapter({ tflAdapter: failureTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) } }).servicesForStops([stop], { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(allFailed.ok, false);
assert.match(allFailed.message, /No London zero-service conclusion/);

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
assert.equal(unresolved.warnings.filter(warning => /no defensible national fallback/.test(warning)).length, 1);

const budgetCalls = [];
const budgetTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => { budgetCalls.push(url); return response(String(url).includes('/Route') ? routeFixture : withOperator); } });
const budgetAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: budgetTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) }, requestLimit: 20 });
const tooManyStops = Array.from({ length: 21 }, (_, index) => ({ id: `490TEST${String(index).padStart(3, '0')}`, routes: [`R${index}`] }));
const budgetResult = await budgetAuthority.servicesForStops(tooManyStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(budgetResult.ok, false);
assert.equal(budgetCalls.length, 0, 'request-budget rejection must happen before any TfL HTTP request');

let busyTimetable = 0, busyRoute = 0;
const busyRouteUrls = [];
const busyTfl = createTflBusTimetableAdapter({ cache: cache(), fetchImpl: async url => {
  if (String(url).includes('/Route')) { busyRoute += 1; busyRouteUrls.push(String(url)); return response(routeFixture); }
  busyTimetable += 1;
  return response(withOperator);
} });
const busyAuthority = createAuthoritativeBusTimetableAdapter({ tflAdapter: busyTfl, nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS' } }) } });
const busyStops = Array.from({ length: 6 }, (_, index) => ({ id: `BUSY${index}`, routes: ['322', '323'] }));
const busyResult = await busyAuthority.servicesForStops(busyStops, { site: { latitude: 51.418, longitude: -0.082 } });
assert.equal(busyResult.ok, true);
assert.equal(busyTimetable, 12);
assert.equal(busyRoute, 1, 'route metadata batches distinct lines once');
assert.match(busyRouteUrls[0], /\/Line\/322,323\/Route$/);
assert.equal(busyResult.provenance.timetableRequests, 12);
assert.equal(busyResult.provenance.routeMetadataRequests, 1);
assert.equal(busyResult.provenance.totalTfLRequests, 13);

console.log('PASS TfL interval linkage, full-route identity, cross-source validation, fallback and outside-London composition tests.');
console.log('PASS deterministic request counts: Crystal Palace mid-route 1 timetable + 1 metadata = 2; opposite direction 1 + 1 = 2 with a fresh assessment; busy 12 + 1 batched metadata = 13.');
