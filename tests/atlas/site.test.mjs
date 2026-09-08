import assert from 'node:assert/strict';
import { confirmSite, createSite, isConfirmedSite, setAssessmentPoint, SITE_LOCATION_METHODS } from '../../src/atlas/domain/site.mjs';

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
  geocodingQuery: '33 Westow Street, Crystal Palace, London',
  retrievedAt: '2026-08-24T10:00:00.000Z'
};

test('valid geocoded candidate separates identity, evidence and assessment point', () => {
  const site = createSite(base);
  assert.equal(site.validation.state, 'candidate');
  assert.equal(site.suppliedAddress, base.suppliedAddress);
  assert.equal(site.geocoding.latitude, 51.4184213);
  assert.equal(site.assessmentPoint.latitude, 51.4184213);
  assert.equal(site.assessmentPoint.method, SITE_LOCATION_METHODS.GEOCODED_CANDIDATE);
});
test('missing assessment-point coordinates are invalid and explicit', () => {
  const site = createSite({ suppliedAddress: 'Unlocated site', displayAddress: 'Unlocated site', latitude: null, longitude: null });
  assert.equal(site.validation.state, 'invalid');
  assert.match(site.validation.errors.join(' '), /Assessment-point latitude is required|Assessment-point longitude is required/);
});
test('out-of-range coordinates are rejected', () => assert.equal(createSite({ ...base, latitude: 120 }).validation.state, 'invalid'));
test('geocoding provenance includes the original source coordinates', () => {
  const site = createSite(base);
  assert.equal(site.geocoding.source, 'OpenStreetMap Nominatim');
  assert.equal(site.geocoding.sourceIdentifier, 'way/189209061');
  assert.deepEqual([site.geocoding.latitude, site.geocoding.longitude], [51.4184213, -0.0821281]);
});
test('map-only Site is valid without fabricated geocoding evidence', () => {
  const site = createSite({ latitude: 51.75, longitude: -0.01, locationMethod: SITE_LOCATION_METHODS.MAP_SELECTED });
  assert.equal(site.validation.state, 'candidate');
  assert.equal(site.suppliedAddress, '');
  assert.equal(site.displayAddress, '');
  assert.equal(site.geocoding.source, null);
  assert.equal(site.assessmentPoint.method, SITE_LOCATION_METHODS.MAP_SELECTED);
});
test('coordinate-only Site is valid without fabricated identity', () => {
  const site = createSite({ latitude: 51.76, longitude: -0.02, locationMethod: SITE_LOCATION_METHODS.COORDINATES_ENTERED });
  assert.equal(site.validation.state, 'candidate');
  assert.equal(site.suppliedAddress, '');
  assert.equal(site.displayAddress, '');
  assert.equal(site.assessmentPoint.method, SITE_LOCATION_METHODS.COORDINATES_ENTERED);
});
test('confirmed geocoded Site retains its real identity', () => {
  const confirmed = confirmSite(createSite(base), { confirmedAt: '2026-08-24T10:01:00.000Z' });
  assert.equal(confirmed.displayAddress, base.displayAddress);
  assert.equal(confirmed.suppliedAddress, base.suppliedAddress);
  assert.equal(confirmed.validation.state, 'confirmed');
});
test('moving the assessment point preserves original geocoding evidence', () => {
  const candidate = createSite(base);
  const moved = setAssessmentPoint(candidate, { latitude: 51.419, longitude: -0.08 });
  assert.deepEqual([moved.latitude, moved.longitude], [51.419, -0.08]);
  assert.deepEqual([moved.geocoding.latitude, moved.geocoding.longitude], [51.4184213, -0.0821281]);
  assert.equal(moved.assessmentPoint.method, SITE_LOCATION_METHODS.PLANNER_ADJUSTED);
  assert.equal(moved.assessmentPoint.adjustedFromCandidate, true);
});
test('manual coordinate entry is retained as its own method', () => {
  const entered = setAssessmentPoint(createSite(base), { latitude: 51.42, longitude: -0.081, method: SITE_LOCATION_METHODS.COORDINATES_ENTERED });
  assert.equal(entered.assessmentPoint.method, SITE_LOCATION_METHODS.COORDINATES_ENTERED);
  assert.equal(entered.validation.state, 'candidate');
});
test('changing a confirmed point requires confirmation again', () => {
  const confirmed = confirmSite(createSite(base), { confirmedAt: '2026-08-24T10:01:00.000Z' });
  const changed = setAssessmentPoint(confirmed, { latitude: 51.42, longitude: -0.081 });
  assert.equal(isConfirmedSite(changed), false);
  assert.equal(changed.validation.confirmedAt, null);
});
test('warnings and failures remain visible', () => {
  const site = createSite({ ...base, warnings: ['Confirm carefully'], errors: ['Provider conflict'] });
  assert.deepEqual(site.validation.warnings, ['Confirm carefully']);
  assert.equal(site.validation.state, 'invalid');
});
test('confirmation stores the final point and timestamp explicitly', () => {
  const moved = setAssessmentPoint(createSite(base), { latitude: 51.419, longitude: -0.08 });
  const site = confirmSite(moved, { confirmedAt: '2026-08-24T10:01:00.000Z' });
  assert.equal(site.validation.state, 'confirmed');
  assert.equal(site.assessmentPoint.confirmedAt, '2026-08-24T10:01:00.000Z');
  assert.deepEqual([site.latitude, site.longitude], [51.419, -0.08]);
  assert.equal(isConfirmedSite(site), true);
});

console.log(`${passed} Site tests passed.`);
