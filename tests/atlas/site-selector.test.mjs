import assert from 'node:assert/strict';
import { createSiteSelector } from '../../src/atlas/application/site-selector.mjs';
import { createSite, SITE_LOCATION_METHODS } from '../../src/atlas/domain/site.mjs';

const candidate = createSite({
  suppliedAddress: 'First Floor, Example House, Hertford',
  displayAddress: 'Example House, High Street, Hertford',
  latitude: 51.8,
  longitude: -0.08,
  geocodingSource: 'Fixture geocoder',
  geocodingSourceIdentifier: 'fixture/1',
  geocodingSourceEndpoint: 'https://fixture.test/search',
  geocodingQuery: 'Example House, Hertford',
  retrievedAt: '2026-08-24T10:00:00Z'
});
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS Site selector — ${name}`); };

test('candidate selection does not silently confirm the Site', () => {
  const selector = createSiteSelector();
  selector.selectCandidate(candidate);
  assert.equal(selector.getSnapshot().isConfirmed, false);
});
test('map adjustment preserves original candidate evidence', () => {
  const selector = createSiteSelector();
  selector.selectCandidate(candidate);
  const moved = selector.chooseOnMap({ latitude: 51.801, longitude: -0.079 });
  assert.equal(moved.assessmentPoint.method, SITE_LOCATION_METHODS.PLANNER_ADJUSTED);
  assert.deepEqual([moved.geocoding.latitude, moved.geocoding.longitude], [51.8, -0.08]);
});
test('map-only selection does not copy arbitrary search-box text', () => {
  const selector = createSiteSelector();
  const site = selector.chooseOnMap({ latitude: 52, longitude: -0.1 });
  assert.equal(site.suppliedAddress, '');
  assert.equal(site.displayAddress, '');
  assert.equal(site.geocoding.source, null);
  assert.equal(site.assessmentPoint.method, SITE_LOCATION_METHODS.MAP_SELECTED);
});
test('coordinate-only selection remains addressless', () => {
  const selector = createSiteSelector();
  const site = selector.enterCoordinates({ latitude: 52, longitude: -0.1 });
  assert.equal(site.suppliedAddress, '');
  assert.equal(site.displayAddress, '');
  assert.equal(site.assessmentPoint.method, SITE_LOCATION_METHODS.COORDINATES_ENTERED);
});
test('manual coordinates remain secondary but auditable', () => {
  const selector = createSiteSelector();
  selector.selectCandidate(candidate);
  const site = selector.enterCoordinates({ latitude: 51.802, longitude: -0.078 });
  assert.equal(site.assessmentPoint.method, SITE_LOCATION_METHODS.COORDINATES_ENTERED);
  assert.equal(site.assessmentPoint.adjustedFromCandidate, true);
});
test('invalid coordinates are rejected safely', () => {
  const selector = createSiteSelector();
  assert.throws(() => selector.chooseOnMap({ suppliedAddress: 'Test site', latitude: 120, longitude: -0.1 }), /valid location/i);
});
test('confirmation records the final assessment point', () => {
  const selector = createSiteSelector({ clock: () => new Date('2026-08-24T11:00:00Z') });
  selector.selectCandidate(candidate);
  selector.chooseOnMap({ latitude: 51.801, longitude: -0.079 });
  const confirmed = selector.confirm();
  assert.equal(confirmed.validation.state, 'confirmed');
  assert.equal(confirmed.assessmentPoint.confirmedAt, '2026-08-24T11:00:00.000Z');
  assert.deepEqual([confirmed.latitude, confirmed.longitude], [51.801, -0.079]);
});
test('changing a confirmed point invalidates confirmation', () => {
  const selector = createSiteSelector();
  selector.selectCandidate(candidate);
  selector.confirm();
  selector.chooseOnMap({ latitude: 51.803, longitude: -0.077 });
  assert.equal(selector.getSnapshot().isConfirmed, false);
});

console.log(`${passed} Site-selector tests passed.`);
