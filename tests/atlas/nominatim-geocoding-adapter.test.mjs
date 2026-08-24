import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNominatimGeocodingAdapter } from '../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/nominatim-candidate.json', import.meta.url), 'utf8'));
const response = body => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });
let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`PASS Geocoding — ${name}`); };

await test('rate-limited normalised retries resolve the approved address without hard-coded coordinates', async () => {
  const queries = [];
  const adapter = createNominatimGeocodingAdapter({
    fetchImpl: async url => { queries.push(new URL(url).searchParams.get('q')); return response(queries.length < 3 ? [] : fixture); },
    cache: createJsonCache({ storage: createMemoryStorage() }),
    clock: () => new Date('2026-08-24T10:00:00.000Z'),
    sleep: async () => {}
  });
  const result = await adapter.searchAddress('33 Westow Street, Crystal Palace, London');
  assert.equal(result.ok, true);
  assert.deepEqual(queries, ['33 Westow Street, Crystal Palace, London', '33, Westow Street, Crystal Palace, London', '33, Westow Street, London']);
  assert.equal(result.data[0].latitude, 51.4184213);
  assert.match(result.warnings.join(' '), /normalised query retry/);
  assert.match(result.warnings.join(' '), /neighbourhood qualifier/);
});
await test('multiple candidates require explicit selection', async () => {
  const adapter = createNominatimGeocodingAdapter({ fetchImpl: async () => response([...fixture, { ...fixture[0], place_id: 2, osm_id: 3 }]), sleep: async () => {} });
  const result = await adapter.searchAddress('Westow Street');
  assert.equal(result.data.length, 2);
  assert.match(result.warnings.join(' '), /Multiple candidates/);
});
await test('empty result assumes no location', async () => {
  const adapter = createNominatimGeocodingAdapter({ fetchImpl: async () => response([]), sleep: async () => {} });
  const result = await adapter.searchAddress('Unknown fixture address');
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, []);
});
await test('invalid provider payload is explicit failure', async () => {
  const adapter = createNominatimGeocodingAdapter({ fetchImpl: async () => response({ bad: true }), sleep: async () => {} });
  assert.equal((await adapter.searchAddress('Fixture')).code, 'invalid_response');
});
await test('network failure is explicit', async () => {
  const adapter = createNominatimGeocodingAdapter({ fetchImpl: async () => { throw new Error('offline'); }, sleep: async () => {} });
  assert.equal((await adapter.searchAddress('Fixture')).code, 'unavailable_source');
});

console.log(`${passed} Geocoding adapter tests passed.`);
