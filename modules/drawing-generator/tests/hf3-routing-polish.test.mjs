import assert from 'node:assert/strict';
import { routeArrowPlacements } from '../assets/js/route-geometry.js';
import { snapRouteThroughGuidance, DEFAULT_ROAD_ROUTING_PROVIDER } from '../assets/js/route-snap-adapter.js';

const rough = { type: 'LineString', coordinates: [[-0.1000, 51.5000], [-0.0950, 51.5000], [-0.0900, 51.5000]] };
const provider = { ...DEFAULT_ROAD_ROUTING_PROVIDER, endpoint: 'https://routing.test/match/v1/driving', minimumRequestIntervalMs: 0 };

function coordinatesFromUrl(url) {
  return new URL(url).pathname.split('/driving/')[1].split(';').map(value => value.split(',').map(Number));
}

function responseWith(inputCoordinates, geometry) {
  return {
    ok: true,
    json: async () => ({
      code: 'Ok',
      tracepoints: inputCoordinates.map((coordinate, index) => ({
        location: coordinate,
        matchings_index: 0,
        waypoint_index: index,
        alternatives_count: 0
      })),
      matchings: [{ confidence: 0.96, distance: 1200, duration: 150, geometry }]
    })
  };
}

const gentleRoadCurve = {
  type: 'LineString',
  coordinates: [[-0.1000, 51.5000], [-0.0950, 51.50045], [-0.0900, 51.5000]]
};
const accepted = await snapRouteThroughGuidance(rough, {
  fetchImpl: async url => responseWith(coordinatesFromUrl(url), gentleRoadCurve),
  provider,
  traceOptions: { maxInternalPerSegment: 0 }
});
assert.equal(accepted.reviewRequired, false);
assert.deepEqual(accepted.geometry, gentleRoadCurve);
assert.equal(accepted.provenance.routeLengthRatioDiagnosticOnly, true);

const wrongCandidate = {
  type: 'LineString',
  coordinates: [[-0.1000, 51.5000], [-0.0950, 51.5040], [-0.0900, 51.5000]]
};
const rejected = await snapRouteThroughGuidance(rough, {
  fetchImpl: async url => responseWith(coordinatesFromUrl(url), wrongCandidate),
  provider,
  traceOptions: { maxInternalPerSegment: 0 }
});
assert.equal(rejected.reviewRequired, true);
assert.deepEqual(rejected.geometry, rough);
assert.deepEqual(rejected.candidateGeometry, wrongCandidate);

const localArrowRoute = { type: 'LineString', coordinates: [[-0.10, 51.50], [-0.09, 51.50], [-0.08, 51.50]] };
const arrows = routeArrowPlacements(localArrowRoute, 'local');
assert.ok(arrows.length >= 1 && arrows.length <= 7);

console.log('HF3 routing presentation and planner-approval regressions passed under HF4 map matching.');
