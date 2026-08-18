import assert from 'node:assert/strict';
import { routeArrowPlacements } from '../assets/js/route-geometry.js';
import { corridorToleranceMetres, snapRouteThroughGuidance, DEFAULT_ROAD_ROUTING_PROVIDER } from '../assets/js/route-snap-adapter.js';

const rough = { type: 'LineString', coordinates: [[-0.1000, 51.5000], [-0.0900, 51.5000]] };
assert.equal(corridorToleranceMetres(rough), 90);

const responseWith = geometry => ({
  ok: true,
  json: async () => ({ code: 'Ok', routes: [{ distance: 1200, duration: 150, geometry }] })
});

// A normal road curve can sit tens of metres away from the straight planner
// chord between waypoints. HF2 incorrectly used the much tighter waypoint
// snap radius as the whole-corridor rejection threshold.
const gentleRoadCurve = {
  type: 'LineString',
  coordinates: [[-0.1000, 51.5000], [-0.0950, 51.50045], [-0.0900, 51.5000]]
};
const accepted = await snapRouteThroughGuidance(rough, {
  fetchImpl: async () => responseWith(gentleRoadCurve),
  provider: { ...DEFAULT_ROAD_ROUTING_PROVIDER, endpoint: 'https://routing.test/route/v1/driving' }
});
assert.equal(accepted.reviewRequired, false);
assert.deepEqual(accepted.geometry, gentleRoadCurve);

const wildDetour = {
  type: 'LineString',
  coordinates: [[-0.1000, 51.5000], [-0.0950, 51.5040], [-0.0900, 51.5000]]
};
const rejected = await snapRouteThroughGuidance(rough, {
  fetchImpl: async () => responseWith(wildDetour),
  provider: { ...DEFAULT_ROAD_ROUTING_PROVIDER, endpoint: 'https://routing.test/route/v1/driving' }
});
assert.equal(rejected.reviewRequired, true);
assert.deepEqual(rejected.geometry, rough);
assert.match(rejected.reviewReason, /(selected corridor|guidance length)/);

const localArrowRoute = { type: 'LineString', coordinates: [[-0.10, 51.50], [-0.09, 51.50], [-0.08, 51.50]] };
const arrows = routeArrowPlacements(localArrowRoute, 'local');
assert.ok(arrows.length >= 1 && arrows.length <= 7);

console.log('HF3 routing acceptance and restrained direction-placement regressions passed.');
