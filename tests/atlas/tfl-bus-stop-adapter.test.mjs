import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSite, confirmSite, setAssessmentPoint } from '../../src/atlas/domain/site.mjs';
import { createTflBusStopAdapter } from '../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-nearby-stops.json', import.meta.url), 'utf8'));
const confirmed = confirmSite(createSite({ suppliedAddress: 'Fixture', displayAddress: 'Fixture', latitude: 51.4184213, longitude: -0.0821281, geocodingSource: 'Fixture geocoder', geocodingSourceIdentifier: 'fixture/1', geocodingSourceEndpoint: 'https://fixture.test', retrievedAt: '2026-08-24T10:00:00Z' }));
const response = body => ({ ok: true, status: 200, headers: new Headers({ 'access-control-allow-origin': '*' }), json: async () => body });
const make = fetchImpl => createTflBusStopAdapter({ fetchImpl, cache: createJsonCache({ storage: createMemoryStorage() }), clock: () => new Date('2026-08-24T10:05:00.000Z'), timeoutMs: 10 });
const stopAtDistance = (id, metres, extra = {}) => ({
  id,
  naptanId: id,
  commonName: `Distance fixture ${id}`,
  indicator: 'Stop A',
  lat: confirmed.latitude + metres / 111195,
  lon: confirmed.longitude,
  stopType: 'NaptanPublicBusCoachTram',
  lines: [],
  ...extra
});
let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`PASS TfL — ${name}`); };

await test('valid nearby stops become sorted Evidence records with provenance', async () => {
  const result = await make(async () => response(fixture)).nearbyStops(confirmed);
  assert.equal(result.ok, true);
  assert.equal(result.data.length, 2);
  assert.equal(result.evidence.length, 2);
  assert.ok(result.data[0].distanceMetres <= result.data[1].distanceMetres);
  assert.deepEqual(result.data[0].routes, ['322', '450']);
  assert.equal(result.data[0].direction, 'Crystal Palace');
  assert.equal(result.data[0].sourceId, result.data[0].id);
  assert.equal(result.evidence[0].source.authoritative, true);
  assert.match(result.provenance.endpoint, /api\.tfl\.gov\.uk\/StopPoint/);
  assert.match(result.provenance.endpoint, /returnLines=true/);
  assert.equal(result.provenance.serviceDiscovery, 'available-from-stop-records');
});
await test('ATLAS retains a TfL StopPoint at 650 m for a 700 m request', async () => {
  const result = await make(async () => response({ stopPoints: [stopAtDistance('INSIDE-650', 650)] })).nearbyStops(confirmed, { radius: 700, forceRefresh: true });
  assert.deepEqual(result.data.map(stop => stop.id), ['INSIDE-650']);
  assert.equal(result.provenance.providerReturnedCount, 1);
  assert.equal(result.provenance.retainedWithinRadiusCount, 1);
  assert.equal(result.provenance.excludedOutsideRadiusCount, 0);
});
await test('ATLAS retains a TfL StopPoint at exactly 700 m', async () => {
  const result = await make(async () => response({ stopPoints: [stopAtDistance('BOUNDARY-700', 700)] })).nearbyStops(confirmed, { radius: 700, forceRefresh: true });
  assert.deepEqual(result.data.map(stop => stop.id), ['BOUNDARY-700']);
  assert.equal(result.data[0].distanceMetres, 700);
});
await test('ATLAS excludes a TfL StopPoint beyond the requested radius', async () => {
  const result = await make(async () => response({ stopPoints: [stopAtDistance('OUTSIDE-701', 701)] })).nearbyStops(confirmed, { radius: 700, forceRefresh: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, []);
  assert.equal(result.provenance.providerReturnedCount, 1);
  assert.equal(result.provenance.retainedWithinRadiusCount, 0);
  assert.equal(result.provenance.excludedOutsideRadiusCount, 1);
  assert.match(result.warnings.join(' '), /exceeded the requested radius/i);
});
await test('only in-radius stops survive a mixed TfL response', async () => {
  const result = await make(async () => response({ stopPoints: [stopAtDistance('INSIDE-MIXED', 650), stopAtDistance('OUTSIDE-MIXED', 750)] })).nearbyStops(confirmed, { radius: 700, forceRefresh: true });
  assert.deepEqual(result.data.map(stop => stop.id), ['INSIDE-MIXED']);
  assert.equal(result.provenance.providerReturnedCount, 2);
  assert.equal(result.provenance.retainedWithinRadiusCount, 1);
  assert.equal(result.provenance.excludedOutsideRadiusCount, 1);
});
await test('TfL response order does not alter the retained result', async () => {
  const stops = [stopAtDistance('ORDER-650', 650), stopAtDistance('ORDER-700', 700), stopAtDistance('ORDER-750', 750)];
  const first = await make(async () => response({ stopPoints: stops })).nearbyStops(confirmed, { radius: 700, forceRefresh: true });
  const second = await make(async () => response({ stopPoints: [...stops].reverse() })).nearbyStops(confirmed, { radius: 700, forceRefresh: true });
  assert.deepEqual(second.data.map(stop => [stop.id, stop.distanceMetres]), first.data.map(stop => [stop.id, stop.distanceMetres]));
  assert.deepEqual(second.provenance, first.provenance);
});
await test('duplicate TfL StopPoints resolve deterministically to the nearer record', async () => {
  const far = stopAtDistance('DUPLICATE', 650, { commonName: 'Far duplicate' });
  const near = stopAtDistance('DUPLICATE', 600, { commonName: 'Near duplicate' });
  const first = await make(async () => response({ stopPoints: [far, near] })).nearbyStops(confirmed, { radius: 700, forceRefresh: true });
  const second = await make(async () => response({ stopPoints: [near, far] })).nearbyStops(confirmed, { radius: 700, forceRefresh: true });
  assert.equal(first.data.length, 1);
  assert.equal(first.data[0].distanceMetres, 600);
  assert.deepEqual(second.data, first.data);
  assert.equal(first.provenance.excludedOutsideRadiusCount, 0);
  assert.match(first.warnings.join(' '), /duplicate/i);
});
await test('malformed response is rejected', async () => assert.equal((await make(async () => response({ wrong: [] })).nearbyStops(confirmed)).code, 'invalid_response'));
await test('empty result is an explicit successful zero', async () => {
  const result = await make(async () => response({ stopPoints: [] })).nearbyStops(confirmed);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, []);
  assert.match(result.warnings.join(' '), /no bus stops/i);
});
await test('an all-outside valid response is a successful zero with accurate radius provenance', async () => {
  const result = await make(async () => response({ stopPoints: [stopAtDistance('OUTSIDE-ONLY', 900)] })).nearbyStops(confirmed, { radius: 700, forceRefresh: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, []);
  assert.equal(result.provenance.requestedRadiusMetres, 700);
  assert.equal(result.provenance.providerReturnedCount, 1);
  assert.equal(result.provenance.retainedWithinRadiusCount, 0);
  assert.equal(result.provenance.excludedOutsideRadiusCount, 1);
  assert.match(result.warnings.join(' '), /within the confirmed ATLAS radius/i);
});
await test('duplicate stop records are de-duplicated and warned', async () => {
  const result = await make(async () => response({ stopPoints: [fixture.stopPoints[0], fixture.stopPoints[0]] })).nearbyStops(confirmed);
  assert.equal(result.data.length, 1);
  assert.match(result.warnings.join(' '), /duplicate/i);
});
await test('network failure remains explicit', async () => assert.equal((await make(async () => { throw new Error('offline'); }).nearbyStops(confirmed)).code, 'unavailable_source'));
await test('timeout remains explicit', async () => {
  const fetchImpl = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  assert.equal((await make(fetchImpl).nearbyStops(confirmed)).code, 'timeout');
});
await test('an unconfirmed Site is rejected before network access', async () => {
  const candidate = createSite({ ...confirmed, suppliedAddress: 'Fixture', displayAddress: 'Fixture', geocodingSource: 'Fixture', geocodingSourceIdentifier: 'fixture/1', geocodingSourceEndpoint: 'https://fixture.test', retrievedAt: '2026-08-24T10:00:00Z', validationState: 'candidate' });
  assert.equal((await make(async () => response(fixture)).nearbyStops(candidate)).code, 'invalid_request');
});
await test('nearby-stop query uses the final moved and confirmed assessment point', async () => {
  const moved = confirmSite(setAssessmentPoint(confirmed, { latitude: 51.4205, longitude: -0.0795 }), { confirmedAt: '2026-08-24T10:04:00Z' });
  let requested;
  const result = await make(async url => { requested = new URL(url); return response(fixture); }).nearbyStops(moved);
  assert.equal(result.ok, true);
  assert.equal(requested.searchParams.get('lat'), '51.4205');
  assert.equal(requested.searchParams.get('lon'), '-0.0795');
  assert.notEqual(requested.searchParams.get('lat'), String(moved.geocoding.latitude));
});

console.log(`${passed} TfL adapter tests passed.`);
