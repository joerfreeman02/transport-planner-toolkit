import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNominatimQueryVariants, createNominatimGeocodingAdapter } from '../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/nominatim-candidate.json', import.meta.url), 'utf8'));
const millersFixture = [{ ...fixture[0], display_name: 'Millers House, High Street, Stanstead Abbotts, SG12 8AA, United Kingdom', lat: '51.790100', lon: '0.012300', osm_id: 775533 }];
const response = body => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });
const cache = () => createJsonCache({ storage: createMemoryStorage() });
let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`PASS Geocoding — ${name}`); };

await test('numbered address keeps conservative ordered retries', async () => {
  const queries = [];
  const adapter = createNominatimGeocodingAdapter({
    fetchImpl: async url => { queries.push(new URL(url).searchParams.get('q')); return response(queries.length < 3 ? [] : fixture); },
    cache: cache(),
    clock: () => new Date('2026-08-24T10:00:00.000Z'),
    sleep: async () => {}
  });
  const result = await adapter.searchAddress('33 Westow Street, Crystal Palace, London');
  assert.equal(result.ok, true);
  assert.deepEqual(queries, ['33 Westow Street, Crystal Palace, London', '33, Westow Street, Crystal Palace, London', '33, Westow Street, London']);
  assert.equal(result.data[0].latitude, 51.4184213);
  assert.equal(result.data[0].validation.state, 'candidate');
  assert.match(result.warnings.join(' '), /broader address search/i);
});
await test('Product Owner floor and building query reaches a building-level variant without hard-coding the answer', async () => {
  const queries = [];
  const adapter = createNominatimGeocodingAdapter({
    fetchImpl: async url => {
      const query = new URL(url).searchParams.get('q');
      queries.push(query);
      return response(query === 'millers house stanstead abbotts' ? millersFixture : []);
    },
    cache: cache(), sleep: async () => {}
  });
  const supplied = 'first floor millers house stanstead abbotts';
  const result = await adapter.searchAddress(supplied);
  assert.deepEqual(queries, [supplied, 'millers house stanstead abbotts']);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].suppliedAddress, supplied);
  assert.equal(result.data[0].geocoding.query, 'millers house stanstead abbotts');
  assert.equal(result.data[0].geocoding.strategy, 'building_without_floor_or_unit');
  assert.equal(result.data[0].validation.state, 'candidate');
});
await test('floor or unit descriptors are removed conservatively while building names and towns remain', () => {
  assert.deepEqual(
    buildNominatimQueryVariants('Unit 3, Riverside House, Hertford').map(item => item.query),
    ['Unit 3, Riverside House, Hertford', 'Riverside House, Hertford', 'Hertford']
  );
  assert.deepEqual(
    buildNominatimQueryVariants('First Floor, Millers House, Stanstead Abbotts').map(item => item.query),
    ['First Floor, Millers House, Stanstead Abbotts', 'Millers House, Stanstead Abbotts', 'Stanstead Abbotts']
  );
});
await test('building name and town succeeds without unnecessary broadening', async () => {
  const queries = [];
  const adapter = createNominatimGeocodingAdapter({ fetchImpl: async url => { queries.push(new URL(url).searchParams.get('q')); return response(millersFixture); }, cache: cache(), sleep: async () => {} });
  const result = await adapter.searchAddress('Millers House, Stanstead Abbotts');
  assert.deepEqual(queries, ['Millers House, Stanstead Abbotts']);
  assert.equal(result.provenance.relaxed, false);
});
await test('UK postcode remains a single country-scoped query', async () => {
  const queries = [];
  const adapter = createNominatimGeocodingAdapter({ fetchImpl: async url => { queries.push(new URL(url).searchParams.get('q')); return response(fixture); }, cache: cache(), sleep: async () => {} });
  await adapter.searchAddress('SE19 3RW');
  assert.deepEqual(queries, ['SE19 3RW']);
});
await test('multiple candidates require explicit selection', async () => {
  const adapter = createNominatimGeocodingAdapter({ fetchImpl: async () => response([...fixture, { ...fixture[0], place_id: 2, osm_id: 3 }]), cache: cache(), sleep: async () => {} });
  const result = await adapter.searchAddress('Westow Street');
  assert.equal(result.data.length, 2);
  assert.match(result.warnings.join(' '), /Multiple candidates/);
  assert.ok(result.data.every(candidate => candidate.validation.state === 'candidate'));
});
await test('empty result assumes no location and leaves map fallback possible', async () => {
  const adapter = createNominatimGeocodingAdapter({ fetchImpl: async () => response([]), cache: cache(), sleep: async () => {} });
  const result = await adapter.searchAddress('Unknown fixture address');
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, []);
  assert.match(result.warnings.join(' '), /No location has been assumed/i);
});
await test('blank input is rejected before network access', async () => {
  let calls = 0;
  const adapter = createNominatimGeocodingAdapter({ fetchImpl: async () => { calls += 1; return response([]); } });
  const result = await adapter.searchAddress('   ');
  assert.equal(result.code, 'invalid_request');
  assert.equal(calls, 0);
});
await test('invalid provider payload and network failure remain explicit', async () => {
  const malformed = createNominatimGeocodingAdapter({ fetchImpl: async () => response({ bad: true }), cache: cache(), sleep: async () => {} });
  assert.equal((await malformed.searchAddress('Fixture')).code, 'invalid_response');
  const offline = createNominatimGeocodingAdapter({ fetchImpl: async () => { throw new Error('offline'); }, cache: cache(), sleep: async () => {} });
  assert.equal((await offline.searchAddress('Fixture')).code, 'unavailable_source');
});

console.log(`${passed} Geocoding adapter tests passed.`);
