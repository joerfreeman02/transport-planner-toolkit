import assert from 'node:assert/strict';
import { confirmSite, createSite, isConfirmedSite } from '../../src/atlas/domain/site.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS Site — ${name}`); };
const base = {
  suppliedAddress: '33 Westow Street, Crystal Palace, London',
  displayAddress: '33, Westow Street, London, SE19 3RW, United Kingdom',
  latitude: 51.4184213,
  longitude: -0.0821281,
  geocodingSource: 'OpenStreetMap Nominatim',
  geocodingSourceIdentifier: 'way/189209061',
  geocodingSourceEndpoint: 'https://nominatim.openstreetmap.org/search?q=fixture',
  retrievedAt: '2026-08-24T10:00:00.000Z'
};

test('valid candidate creation', () => assert.equal(createSite(base).validation.state, 'candidate'));
test('missing coordinates are invalid and explicit', () => {
  const site = createSite({ ...base, latitude: null, longitude: null });
  assert.equal(site.validation.state, 'invalid');
  assert.match(site.validation.errors.join(' '), /Latitude is required|Longitude is required/);
});
test('out-of-range coordinates are rejected', () => assert.equal(createSite({ ...base, latitude: 120 }).validation.state, 'invalid'));
test('geocoding provenance is retained', () => {
  const site = createSite(base);
  assert.equal(site.geocoding.source, 'OpenStreetMap Nominatim');
  assert.equal(site.geocoding.sourceIdentifier, 'way/189209061');
});
test('warnings and failures remain visible', () => {
  const site = createSite({ ...base, warnings: ['Confirm carefully'], errors: ['Provider conflict'] });
  assert.deepEqual(site.validation.warnings, ['Confirm carefully']);
  assert.equal(site.validation.state, 'invalid');
});
test('confirmation is explicit', () => {
  const site = confirmSite(createSite(base), { confirmedAt: '2026-08-24T10:01:00.000Z' });
  assert.equal(site.validation.state, 'confirmed');
  assert.equal(isConfirmedSite(site), true);
});

console.log(`${passed} Site tests passed.`);
