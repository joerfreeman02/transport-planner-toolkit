import assert from 'node:assert/strict';
import { GREATER_LONDON_BOUNDARY_SOURCE, isGreaterLondonPoint, wgs84ToBritishNationalGrid } from '../../src/atlas/domain/geography.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS Geography — ${name}`); };

test('Crystal Palace control is inside the official Greater London boundary', () => assert.equal(isGreaterLondonPoint({ latitude: 51.418421, longitude: -0.082128 }), true));
test('Waltham Cross control is outside the official Greater London boundary', () => assert.equal(isGreaterLondonPoint({ latitude: 51.686, longitude: -0.034 }), false));
test('a distant England point is not routed to TfL', () => assert.equal(isGreaterLondonPoint({ latitude: 51.4543, longitude: -0.9781 }), false));
test('WGS84 conversion produces plausible British National Grid coordinates', () => {
  const point = wgs84ToBritishNationalGrid(51.418421, -0.082128);
  assert.ok(point.easting > 533000 && point.easting < 534000);
  assert.ok(point.northing > 170000 && point.northing < 171000);
});
test('boundary provenance is retained', () => {
  assert.match(GREATER_LONDON_BOUNDARY_SOURCE.source, /Greater London Authority/);
  assert.equal(GREATER_LONDON_BOUNDARY_SOURCE.crs, 'EPSG:27700');
});

console.log(`${passed} geography tests passed.`);
