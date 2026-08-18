import assert from 'node:assert/strict';
import { pointInPolygon, resolveCommunityCandidateGeometry } from '../assets/js/community-association.js';
import { geometryCorridorDeviationMetres } from '../assets/js/route-geometry.js';
import { guidanceToleranceMetres, roadSnapRequestUrl, snapRouteThroughGuidance, DEFAULT_ROAD_ROUTING_PROVIDER } from '../assets/js/route-snap-adapter.js';

const closedBuilding = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
assert.equal(pointInPolygon([0.5, 0.5], closedBuilding), true);
assert.equal(pointInPolygon([3, 3], closedBuilding), false, 'closed-ring duplicate coordinate must not make every building contain every point');

const candidate = { type: 'Feature', id: 'node/church', properties: { class: 'community-candidate', sourceId: 'node/church' }, geometry: { type: 'Point', coordinates: [3, 3] } };
const building = { type: 'Feature', id: 'way/building', properties: { class: 'building-support', sourceId: 'way/building' }, geometry: closedBuilding };
const missing = resolveCommunityCandidateGeometry([candidate, building])[0];
assert.equal(missing.properties.communityEvidence.associationMethod, 'none');
assert.equal(missing.properties.communityEvidence.footprintChoices, undefined);

const localRough = { type: 'LineString', coordinates: [[-0.1000, 51.5000], [-0.0900, 51.5000]] };
assert.equal(guidanceToleranceMetres(localRough), 30);
const request = roadSnapRequestUrl(localRough, { ...DEFAULT_ROAD_ROUTING_PROVIDER, endpoint: 'https://routing.test/route/v1/driving' }, { snapRadiusMetres: 30 });
assert.match(request, /radiuses=30;30/);

const detour = { type: 'LineString', coordinates: [[-0.1000, 51.5000], [-0.0950, 51.5030], [-0.0900, 51.5000]] };
assert.ok(geometryCorridorDeviationMetres(detour, localRough) > 100);

const responseWith = geometry => ({
  ok: true,
  json: async () => ({ code: 'Ok', routes: [{ distance: 1500, duration: 180, geometry }] })
});

const rejected = await snapRouteThroughGuidance(localRough, {
  fetchImpl: async () => responseWith(detour),
  provider: { ...DEFAULT_ROAD_ROUTING_PROVIDER, endpoint: 'https://routing.test/route/v1/driving' }
});
assert.equal(rejected.reviewRequired, true);
assert.deepEqual(rejected.geometry, localRough, 'unsafe provider candidate must not replace visible planner guidance');
assert.deepEqual(rejected.candidateGeometry, detour);
assert.ok(rejected.provenance.maxSnappedCorridorDeviationMetres > rejected.provenance.guidanceToleranceMetres);

const tidy = { type: 'LineString', coordinates: [[-0.1000, 51.5000], [-0.0950, 51.50005], [-0.0900, 51.5000]] };
const accepted = await snapRouteThroughGuidance(localRough, {
  fetchImpl: async () => responseWith(tidy),
  provider: { ...DEFAULT_ROAD_ROUTING_PROVIDER, endpoint: 'https://routing.test/route/v1/driving' }
});
assert.equal(accepted.reviewRequired, false);
assert.deepEqual(accepted.geometry, tidy);

console.log('HF2 community containment and planner-corridor routing regressions passed.');
