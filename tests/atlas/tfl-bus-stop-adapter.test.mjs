import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSite, confirmSite, setAssessmentPoint } from '../../src/atlas/domain/site.mjs';
import { createTflBusStopAdapter } from '../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-nearby-stops.json', import.meta.url), 'utf8'));
const confirmed = confirmSite(createSite({ suppliedAddress: 'Fixture', displayAddress: 'Fixture', latitude: 51.4184213, longitude: -0.0821281, geocodingSource: 'Fixture geocoder', geocodingSourceIdentifier: 'fixture/1', geocodingSourceEndpoint: 'https://fixture.test', retrievedAt: '2026-08-24T10:00:00Z' }));
const response = body => ({ ok: true, status: 200, headers: new Headers({ 'access-control-allow-origin': '*' }), json: async () => body });
const make = fetchImpl => createTflBusStopAdapter({ fetchImpl, cache: createJsonCache({ storage: createMemoryStorage() }), clock: () => new Date('2026-08-24T10:05:00.000Z'), timeoutMs: 10 });
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
await test('malformed response is rejected', async () => assert.equal((await make(async () => response({ wrong: [] })).nearbyStops(confirmed)).code, 'invalid_response'));
await test('empty result is an explicit successful zero', async () => {
  const result = await make(async () => response({ stopPoints: [] })).nearbyStops(confirmed);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, []);
  assert.match(result.warnings.join(' '), /no bus stops/i);
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
