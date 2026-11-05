import assert from 'node:assert/strict';
import { assembleResidential, ISOCHRONE_BANDS, parseIso4App, parseNamedPois } from '../core.js';

const point = (longitude, latitude, mobility = 'pedestrian') => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [longitude, latitude] },
  properties: { name: 'start point', mobility, isolineValue: 1800 }
});
const segment = (coordinates, to, extra = {}) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties: { name: 'segment', from: to - 300, to, unit: 'seconds', ...extra }
});

const forward = [[-0.25, 51.65], [-0.249, 51.651]];
const reversed = [...forward].reverse();
const anotherRoute = [[-0.25, 51.65], [-0.2495, 51.6505], [-0.249, 51.651]];
const collection = parseIso4App({
  type: 'FeatureCollection',
  features: [
    point(-0.25, 51.65),
    point(-0.25, 51.65),
    segment(forward, 300, { sourceTag: 'kept' }),
    segment(reversed, 300),
    segment(anotherRoute, 300),
    segment([[0, 0], [1, 1]], 301),
    segment([[0, 0], [1, 1]], 901)
  ]
}, 'Rowley Lane Roundabout Ped.json');

assert.equal(ISOCHRONE_BANDS.length, 6);
assert.equal(collection.access, 'roundabout');
assert.equal(collection.mode, 'pedestrian');
assert.equal(collection.origins.length, 1, 'identical repeated start points are collapsed');
assert.equal(collection.features.length, 4, 'reversed exact duplicates are removed; different time bands and distinct geometry are retained');
assert.equal(collection.features[0].properties.easBand, 0, 'to=300 is in the 0–5 minute band');
assert.equal(collection.features[2].properties.easBand, 1, 'to=301 belongs to the 5–10 minute band');
assert.equal(collection.features[3].properties.easBand, 3, 'to=901 belongs to the 15–20 minute band');
assert.equal(collection.features[0].properties.sourceTag, 'kept', 'source properties remain available');
assert.equal(collection.features[0].properties.sourceScenario, 'Rowley Lane Roundabout Ped.json');
assert.equal(collection.features[0].properties.mode, 'pedestrian');
assert.equal(collection.ignoredSegments, 0);

const cycling = parseIso4App({ type: 'FeatureCollection', features: [
  point(-0.25, 51.65, 'bicycle'), segment(forward, 900), segment(anotherRoute, 901)
] }, 'Rowley Lane Pub Cyc.json');
assert.equal(cycling.access, 'pub');
assert.deepEqual(cycling.features.map(feature => feature.properties.easBand), [2]);
assert.equal(cycling.ignoredSegments, 1, 'cycling segments beyond fifteen minutes are excluded');
assert.throws(() => parseIso4App({ type: 'FeatureCollection', features: [point(0, 0, 'car'), segment(forward, 300)] }, 'bad.json'), /mobility/);

const node = (lon, lat) => ({ lon, lat });
const ringMembers = (ring, role = 'outer') => ring.slice(0, -1).map((start, index) => ({
  role,
  geometry: [node(...ring[index + 1]), node(...start)]
}));
const outer = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
const hole = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]];
const outerSecond = [[5, 0], [6, 0], [6, 1], [5, 1], [5, 0]];
const residential = assembleResidential([
  { type: 'relation', id: 99, tags: { landuse: 'residential' }, members: [
    ...ringMembers(outer), ...ringMembers(hole, 'inner'), ...ringMembers(outerSecond)
  ] },
  { type: 'way', id: 12, tags: { landuse: 'residential' }, geometry: outer.map(([lon, lat]) => node(lon, lat)) },
  { type: 'way', id: 13, tags: { landuse: 'residential' }, geometry: [node(8, 8), node(9, 9)] },
  { type: 'way', id: 14, tags: { landuse: 'residential' }, geometry: [] },
  { type: 'relation', id: 100, tags: { landuse: 'residential' }, members: [] }
]);
assert.equal(residential.features.length, 3, 'a multipolygon relation preserves both outer areas and its hole');
const relationFeature = residential.features.find(feature => feature.properties.osmId === 99);
assert.equal(relationFeature.geometry.type, 'Polygon');
assert.equal(relationFeature.geometry.coordinates.length, 2, 'inner ring is retained as a hole');
assert.equal(residential.incomplete.length, 3, 'open, geometry-missing and member-missing areas are reported as incomplete');
assert.equal(residential.coverage, 'unknown', 'OSM tags do not imply geographic completeness');

const pois = parseNamedPois([
  { type: 'node', id: 1, lat: 51.65, lon: -0.25, tags: { amenity: 'school', name: 'Example School' } },
  { type: 'way', id: 2, center: { lat: 51.66, lon: -0.24 }, tags: { shop: 'supermarket', name: 'Tesco Borehamwood' } },
  { type: 'node', id: 3, lat: 0, lon: 0, tags: { amenity: 'school' } },
  { type: 'node', id: 4, lat: 1, lon: 1, tags: { amenity: 'cafe', name: 'Ignore Me' } }
]);
assert.deepEqual(pois.map(item => item.category), ['School', 'Supermarket']);
assert.equal(pois[1].source, 'OSM way 2');

console.log('ATLAS isochrone core tests passed');
