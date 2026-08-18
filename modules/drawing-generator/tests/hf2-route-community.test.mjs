import assert from 'node:assert/strict';
import { pointInPolygon, resolveCommunityCandidateGeometry } from '../assets/js/community-association.js';
import { guidanceToleranceMetres, roadSnapRequestUrl, snapRouteThroughGuidance, DEFAULT_ROAD_ROUTING_PROVIDER } from '../assets/js/route-snap-adapter.js';

const closedBuilding = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
assert.equal(pointInPolygon([0.5, 0.5], closedBuilding), true);
assert.equal(pointInPolygon([3, 3], closedBuilding), false, 'closed-ring duplicate coordinate must not make every building contain every point');

const candidate = { type: 'Feature', id: 'node/church', properties: { class: 'community-candidate', sourceId: 'node/church' }, geometry: { type: 'Point', coordinates: [3, 3] } };
const building = { type: 'Feature', id: 'way/building', properties: { class: 'building-support', sourceId: 'way/building' }, geometry: closedBuilding };
const missing = resolveCommunityCandidateGeometry([candidate, building])[0];
assert.equal(missing.properties.communityEvidence.associationMethod, 'none');
assert.equal(missing.properties.communityEvidence.footprintChoices, undefined);

const localRough = { type: 'LineString', coordinates: [[-0.1000, 51.5000], [-0.0950, 51.5000], [-0.0900, 51.5000]] };
assert.equal(guidanceToleranceMetres(localRough), 50);
const provider = { ...DEFAULT_ROAD_ROUTING_PROVIDER, endpoint: 'https://routing.test/match/v1/driving', minimumRequestIntervalMs: 0 };
const request = roadSnapRequestUrl(localRough, provider, { maxInternalPerSegment: 0 });
assert.match(request, /\/match\/v1\/driving\//);
assert.match(request, /radiuses=50;50;50/);
assert.doesNotMatch(request, /continue_straight|alternatives=/);

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
      matchings: [{ confidence: 0.95, distance: 1500, duration: 180, geometry }]
    })
  };
}

function coordinatesFromUrl(url) {
  return new URL(url).pathname.split('/driving/')[1].split(';').map(value => value.split(',').map(Number));
}

const wrongCandidate = {
  type: 'LineString',
  coordinates: [[-0.1000, 51.5000], [-0.0950, 51.5040], [-0.0900, 51.5000]]
};
const rejected = await snapRouteThroughGuidance(localRough, {
  fetchImpl: async url => responseWith(coordinatesFromUrl(url), wrongCandidate),
  provider,
  traceOptions: { maxInternalPerSegment: 0 }
});
assert.equal(rejected.reviewRequired, true);
assert.deepEqual(rejected.geometry, localRough, 'unsafe provider candidate must not replace visible planner guidance');
assert.deepEqual(rejected.candidateGeometry, wrongCandidate);

const tidy = {
  type: 'LineString',
  coordinates: [[-0.1000, 51.5000], [-0.0950, 51.50005], [-0.0900, 51.5000]]
};
const accepted = await snapRouteThroughGuidance(localRough, {
  fetchImpl: async url => responseWith(coordinatesFromUrl(url), tidy),
  provider,
  traceOptions: { maxInternalPerSegment: 0 }
});
assert.equal(accepted.reviewRequired, false);
assert.deepEqual(accepted.geometry, tidy);
assert.equal(accepted.provenance.providerService, 'match');

console.log('HF2 community containment and planner-authority routing regressions passed.');
