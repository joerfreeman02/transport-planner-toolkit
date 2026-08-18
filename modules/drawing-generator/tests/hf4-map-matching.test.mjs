// HF4 historical requirements retained under HF4A's provider-compatible guided Route implementation.
import assert from 'node:assert/strict';
import { DEFAULT_ROAD_ROUTING_PROVIDER, prepareGuidedRouteTrace, snapRouteThroughGuidance } from '../assets/js/route-snap-adapter.js';

function coordinatesFromUrl(url) { return new URL(url).pathname.split('/driving/')[1].split(';').map(value => value.split(',').map(Number)); }
function okRoute(url) {
  const coordinates = coordinatesFromUrl(url);
  return { ok: true, status: 200, clone() { return this; }, text: async () => '', json: async () => ({ code: 'Ok', waypoints: coordinates.map(location => ({ location })), routes: [{ distance: 1000, duration: 100, geometry: { type: 'LineString', coordinates } }] }) };
}
const provider = { ...DEFAULT_ROAD_ROUTING_PROVIDER, endpoint: 'https://routing.test/route/v1/driving', endpoints: ['https://routing.test/route/v1/driving'], minimumRequestIntervalMs: 0 };

const detailed = { type: 'LineString', coordinates: Array.from({ length: 120 }, (_, index) => [-0.20 + index * .0005, 51.50]) };
const result = await snapRouteThroughGuidance(detailed, {
  provider: { ...provider, maximumRouteLocations: 40 }, traceOptions: { maxInternalPerSegment: 0 }, fetchImpl: async url => okRoute(url)
});
assert.equal(result.reviewRequired, false);
assert.equal(result.provenance.waypointCount, 120);
assert.ok(result.provenance.routeRequestCount >= 3);
assert.equal(result.provenance.routeLengthRatioDiagnosticOnly, true);
assert.equal(result.provenance.corridorDeviationDiagnosticOnly, true);
assert.ok(prepareGuidedRouteTrace({ type: 'LineString', coordinates: [[-0.11, 51.5], [-0.10, 51.5]] }).length > 2);

console.log('HF4 planner-authority/no-50-point regressions retained under HF4A guided routing.');
