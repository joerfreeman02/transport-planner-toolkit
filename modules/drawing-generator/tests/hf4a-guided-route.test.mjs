import assert from 'node:assert/strict';
import {
  DEFAULT_ROAD_ROUTING_PROVIDER,
  chunkGuidedRouteTrace,
  guidancePreparationProfile,
  prepareGuidedRouteTrace,
  roadSnapRequestUrl,
  routeRequestUrl,
  snapRouteThroughGuidance
} from '../assets/js/route-snap-adapter.js';
import { geometryCorridorDeviationMetres, routeLengthMetres } from '../assets/js/route-geometry.js';

const syntheticProvider = {
  ...DEFAULT_ROAD_ROUTING_PROVIDER,
  endpoint: 'https://routing.test/route/v1/driving',
  endpoints: ['https://routing.test/route/v1/driving'],
  minimumRequestIntervalMs: 0
};

function guidanceFromUrl(url) {
  return new URL(url).pathname.split('/driving/')[1].split(';').map(value => value.split(',').map(Number));
}

function responseWith(geometry, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    clone() { return this; },
    text: async () => options.text || '',
    json: async () => options.payload || ({
      code: 'Ok',
      waypoints: guidanceFromUrl(options.url || 'https://routing.test/route/v1/driving/0,0;1,1').map(location => ({ location })),
      routes: [{ distance: options.distance ?? routeLengthMetres(geometry), duration: 100, geometry }]
    })
  };
}

function routeResponse(url, geometry = null, options = {}) {
  const guidance = guidanceFromUrl(url);
  const resolved = geometry || { type: 'LineString', coordinates: guidance };
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    clone() { return this; },
    text: async () => options.text || '',
    json: async () => options.payload || ({
      code: 'Ok',
      waypoints: guidance.map(location => ({ location })),
      routes: [{ distance: routeLengthMetres(resolved), duration: 100, geometry: resolved }]
    })
  };
}

// Local route: dense internal guidance should constrain the service rather than
// relying on sparse fastest-route waypoints.
{
  const rough = { type: 'LineString', coordinates: [
    [-0.1100, 51.5000], [-0.1080, 51.5000], [-0.1060, 51.5000], [-0.1040, 51.5000],
    [-0.1020, 51.5000], [-0.1000, 51.5000], [-0.0980, 51.5000], [-0.0960, 51.5000]
  ] };
  const prepared = prepareGuidedRouteTrace(rough);
  assert.ok(prepared.length > rough.coordinates.length);
  assert.equal(prepared.filter(item => item.originalIndex !== null).length, 8);
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    fetchImpl: async url => routeResponse(url)
  });
  assert.equal(result.reviewRequired, false);
  assert.equal(result.provenance.providerService, 'route-guided');
  assert.ok(result.provenance.preparedGuidanceCount > 8);
}

// HF3's old whole-corridor and length-ratio blockers are diagnostic only.
{
  const rough = { type: 'LineString', coordinates: [[-0.12, 51.50], [-0.10, 51.50]] };
  const curved = { type: 'LineString', coordinates: [
    [-0.12, 51.50], [-0.115, 51.506], [-0.11, 51.494], [-0.105, 51.506], [-0.10, 51.50]
  ] };
  assert.ok(routeLengthMetres(curved) / routeLengthMetres(rough) > 1.6);
  assert.ok(geometryCorridorDeviationMetres(curved, rough) > 90);
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    traceOptions: { maxInternalPerSegment: 0 },
    maximumPreparedDeviationMetres: 1000,
    fetchImpl: async url => routeResponse(url, curved)
  });
  assert.equal(result.reviewRequired, false);
  assert.equal(result.provenance.routeLengthRatioDiagnosticOnly, true);
  assert.equal(result.provenance.corridorDeviationDiagnosticOnly, true);
}

// >50 planner points must remain valid and be chunked internally.
{
  const rough = {
    type: 'LineString',
    coordinates: Array.from({ length: 120 }, (_, index) => [-0.20 + index * 0.0005, 51.50 + index * 0.00001])
  };
  const requests = [];
  const result = await snapRouteThroughGuidance(rough, {
    provider: { ...syntheticProvider, maximumRouteLocations: 40 },
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async url => { requests.push(url); return routeResponse(url); }
  });
  assert.equal(result.reviewRequired, false);
  assert.equal(result.provenance.waypointCount, 120);
  assert.ok(requests.length >= 3);
  assert.ok(requests.every(url => guidanceFromUrl(url).length <= 40));
  assert.equal(result.geometry.coordinates.length, 120);
}

// Chunk requests must be serialised at the provider boundary.
{
  const rough = { type: 'LineString', coordinates: Array.from({ length: 80 }, (_, i) => [-0.15 + i * .0005, 51.5]) };
  let now = 1000;
  const sleeps = [];
  const result = await snapRouteThroughGuidance(rough, {
    provider: { ...syntheticProvider, maximumRouteLocations: 30, minimumRequestIntervalMs: 1000 },
    traceOptions: { maxInternalPerSegment: 0 },
    nowImpl: () => now,
    sleepImpl: async ms => { sleeps.push(ms); now += ms; },
    fetchImpl: async url => routeResponse(url)
  });
  assert.equal(result.reviewRequired, false);
  assert.equal(sleeps.length, result.provenance.routeRequestCount - 1);
  assert.ok(sleeps.every(ms => ms === 1000));
}

// A genuine wrong candidate still stays behind planner review.
{
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50], [-0.09, 51.50]] };
  const wrong = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.53], [-0.09, 51.50]] };
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async url => routeResponse(url, wrong)
  });
  assert.equal(result.reviewRequired, true);
  assert.deepEqual(result.geometry, rough);
  assert.deepEqual(result.candidateGeometry, wrong);
}

// Provider failure remains non-destructive and parses useful HTTP details.
{
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50]] };
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    fetchImpl: async () => ({
      ok: false, status: 400,
      clone() { return this; },
      json: async () => ({ code: 'InvalidQuery', message: 'synthetic bad query detail' }),
      text: async () => ''
    })
  });
  assert.equal(result.status, 'snap-failed');
  assert.deepEqual(result.geometry, rough);
  assert.match(result.error, /InvalidQuery.*synthetic bad query detail/);
}

// Free fallback endpoint is used only after the primary fails.
{
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50]] };
  const calls = [];
  const provider = {
    ...DEFAULT_ROAD_ROUTING_PROVIDER,
    endpoints: ['https://primary.test/route/v1/driving', 'https://fallback.test/route/v1/driving'],
    minimumRequestIntervalMs: 0
  };
  const result = await snapRouteThroughGuidance(rough, {
    provider,
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async url => {
      calls.push(url);
      if (url.startsWith('https://primary.test/')) throw new Error('primary unavailable');
      return routeResponse(url);
    }
  });
  assert.equal(result.reviewRequired, false);
  assert.equal(calls.length, 2);
  assert.equal(result.provenance.endpointsTried[0], 'https://fallback.test/route/v1/driving');
}

// Request shape must be the proven Route service, with no Match-only options.
{
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50]] };
  const prepared = prepareGuidedRouteTrace(rough, { maxInternalPerSegment: 0 });
  const url = routeRequestUrl(prepared, 'https://routing.test/route/v1/driving');
  assert.match(url, /\/route\/v1\/driving\//);
  assert.match(url, /alternatives=false/);
  assert.match(url, /continue_straight=false/);
  assert.match(url, /generate_hints=false/);
  assert.match(url, /radiuses=/);
  assert.doesNotMatch(url, /\/match\/v1\/driving\//);
  assert.match(roadSnapRequestUrl(rough, syntheticProvider, { maxInternalPerSegment: 0 }), /\/route\/v1\/driving\//);
  assert.ok(chunkGuidedRouteTrace(prepared, 40).every(chunk => chunk.items.length <= 40));
  assert.ok(guidancePreparationProfile(rough).sampleSpacingMetres <= 35);
}

console.log('HF4A dense planner-guided OSRM Route regressions passed.');
