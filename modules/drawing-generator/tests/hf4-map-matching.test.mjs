import assert from 'node:assert/strict';
import {
  DEFAULT_ROAD_ROUTING_PROVIDER,
  chunkPreparedTrace,
  matchRequestUrl,
  prepareMatchTrace,
  snapRouteThroughGuidance
} from '../assets/js/route-snap-adapter.js';
import { geometryCorridorDeviationMetres, routeLengthMetres } from '../assets/js/route-geometry.js';

function guidanceFromUrl(url) {
  const path = new URL(url).pathname;
  const encoded = path.split('/driving/')[1];
  return encoded.split(';').map(value => value.split(',').map(Number));
}

function okMatchResponse(guidance, geometry = guidance, options = {}) {
  const matchingIndex = options.matchingIndex ?? 0;
  return {
    ok: true,
    json: async () => ({
      code: 'Ok',
      tracepoints: guidance.map((coordinate, index) => {
        if (options.nullTraceIndices?.includes(index)) return null;
        return {
          location: options.tracepointLocations?.[index] || coordinate,
          matchings_index: matchingIndex,
          waypoint_index: index,
          alternatives_count: 0
        };
      }),
      matchings: [{
        confidence: options.confidence ?? 0.95,
        distance: options.distance ?? 1000,
        duration: options.duration ?? 120,
        geometry: { type: 'LineString', coordinates: Array.isArray(geometry) ? geometry : geometry.coordinates }
      }]
    })
  };
}

const syntheticProvider = {
  ...DEFAULT_ROAD_ROUTING_PROVIDER,
  endpoint: 'https://routing.test/match/v1/driving',
  minimumRequestIntervalMs: 0
};

{
  const localRough = {
    type: 'LineString',
    coordinates: [
      [-0.1100, 51.5000],
      [-0.1080, 51.5000],
      [-0.1060, 51.5000],
      [-0.1040, 51.5000],
      [-0.1020, 51.5000],
      [-0.1000, 51.5000],
      [-0.0980, 51.5000],
      [-0.0960, 51.5000]
    ]
  };
  const bowedRoad = {
    type: 'LineString',
    coordinates: [
      [-0.1100, 51.5000],
      [-0.1090, 51.5011],
      [-0.1080, 51.5000],
      [-0.1060, 51.5000],
      [-0.1040, 51.5000],
      [-0.1020, 51.5000],
      [-0.1000, 51.5000],
      [-0.0980, 51.5000],
      [-0.0960, 51.5000]
    ]
  };
  assert.ok(geometryCorridorDeviationMetres(bowedRoad, localRough) > 90);
  const result = await snapRouteThroughGuidance(localRough, {
    provider: syntheticProvider,
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async url => okMatchResponse(guidanceFromUrl(url), bowedRoad)
  });
  assert.equal(result.reviewRequired, false);
  assert.deepEqual(result.geometry, bowedRoad);
  assert.ok(result.provenance.maxSnappedCorridorDeviationMetres > 90);
}

{
  const rough = { type: 'LineString', coordinates: [[-0.12, 51.50], [-0.10, 51.50]] };
  const longButFaithful = {
    type: 'LineString',
    coordinates: [
      [-0.12, 51.50],
      [-0.115, 51.506],
      [-0.11, 51.494],
      [-0.105, 51.506],
      [-0.10, 51.50]
    ]
  };
  const ratio = routeLengthMetres(longButFaithful) / routeLengthMetres(rough);
  assert.ok(ratio > 1.6, `Expected diagnostic ratio above HF3 blocker, got ${ratio}`);
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async url => okMatchResponse(guidanceFromUrl(url), longButFaithful)
  });
  assert.equal(result.reviewRequired, false);
  assert.ok(result.provenance.routeLengthRatio > 1.6);
  assert.equal(result.provenance.routeLengthRatioDiagnosticOnly, true);
}

{
  const manyPointRoute = {
    type: 'LineString',
    coordinates: Array.from({ length: 120 }, (_, index) => [-0.20 + (index * 0.0005), 51.50 + (index * 0.00001)])
  };
  const requestedCounts = [];
  const sleepCalls = [];
  let syntheticNow = 1000;
  const result = await snapRouteThroughGuidance(manyPointRoute, {
    provider: { ...syntheticProvider, maximumMatchLocations: 40, minimumRequestIntervalMs: 1000 },
    traceOptions: { maxInternalPerSegment: 0 },
    sleepImpl: async milliseconds => { sleepCalls.push(milliseconds); syntheticNow += milliseconds; },
    nowImpl: () => syntheticNow,
    fetchImpl: async url => {
      const guidance = guidanceFromUrl(url);
      requestedCounts.push(guidance.length);
      return okMatchResponse(guidance);
    }
  });
  assert.equal(result.reviewRequired, false);
  assert.equal(result.provenance.waypointCount, 120);
  assert.ok(requestedCounts.length >= 3);
  assert.ok(requestedCounts.every(count => count <= 40));
  assert.equal(sleepCalls.length, requestedCounts.length - 1);
  assert.ok(sleepCalls.every(value => value === 1000));
  assert.equal(result.geometry.coordinates.length, 120);
}

{
  const rough = {
    type: 'LineString',
    coordinates: Array.from({ length: 80 }, (_, index) => [-0.15 + (index * 0.0005), 51.50])
  };
  let calls = 0;
  const result = await snapRouteThroughGuidance(rough, {
    provider: { ...syntheticProvider, maximumMatchLocations: 30 },
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async url => {
      calls += 1;
      if (calls === 2) return { ok: true, json: async () => ({ code: 'NoMatch', message: 'synthetic middle-chunk failure' }) };
      const guidance = guidanceFromUrl(url);
      return okMatchResponse(guidance);
    }
  });
  assert.equal(result.status, 'snap-failed');
  assert.deepEqual(result.geometry, rough);
  assert.equal(result.candidateGeometry, null);
}

{
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50], [-0.09, 51.50]] };
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async url => {
      const guidance = guidanceFromUrl(url);
      return okMatchResponse(guidance, guidance, { nullTraceIndices: [1] });
    }
  });
  assert.equal(result.status, 'snap-failed');
  assert.deepEqual(result.geometry, rough);
}

{
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.09, 51.50]] };
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    traceOptions: { sampleSpacingMetres: 250, maxInternalPerSegment: 4 },
    fetchImpl: async url => {
      const guidance = guidanceFromUrl(url);
      const middle = Math.floor(guidance.length / 2);
      return okMatchResponse(guidance, [guidance[0], guidance.at(-1)], { nullTraceIndices: [middle] });
    }
  });
  assert.equal(result.reviewRequired, false);
  assert.ok(result.provenance.unmatchedInternalTracepoints >= 1);
}

{
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50], [-0.09, 51.50]] };
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async url => {
      const guidance = guidanceFromUrl(url);
      return {
        ok: true,
        json: async () => ({
          code: 'Ok',
          tracepoints: [
            { location: guidance[0], matchings_index: 0, waypoint_index: 0 },
            { location: guidance[1], matchings_index: 0, waypoint_index: 1 },
            { location: guidance[2], matchings_index: 1, waypoint_index: 0 }
          ],
          matchings: [
            { confidence: 0.9, geometry: { type: 'LineString', coordinates: [guidance[0], guidance[1]] } },
            { confidence: 0.9, geometry: { type: 'LineString', coordinates: [[-0.05, 51.55], guidance[2]] } }
          ]
        })
      };
    }
  });
  assert.equal(result.status, 'snap-failed');
  assert.deepEqual(result.geometry, rough);
}

{
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50], [-0.09, 51.50]] };
  const wrongCandidate = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.53], [-0.09, 51.50]] };
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async url => okMatchResponse(guidanceFromUrl(url), wrongCandidate)
  });
  assert.equal(result.reviewRequired, true);
  assert.deepEqual(result.geometry, rough);
  assert.deepEqual(result.candidateGeometry, wrongCandidate);
}

{
  const rough = { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50]] };
  const result = await snapRouteThroughGuidance(rough, {
    provider: syntheticProvider,
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl: async () => {
      const error = new Error('synthetic timeout');
      error.name = 'AbortError';
      throw error;
    }
  });
  assert.equal(result.status, 'snap-failed');
  assert.match(result.error, /timed out/i);
  assert.deepEqual(result.geometry, rough);
}


{
  const provider = {
    ...syntheticProvider,
    id: 'synthetic-global-throttle',
    endpoint: 'https://routing-global-throttle.test/match/v1/driving',
    minimumRequestIntervalMs: 1000
  };
  let syntheticNow = 5000;
  const sleepCalls = [];
  const fetchImpl = async url => {
    const guidance = guidanceFromUrl(url);
    return okMatchResponse(guidance);
  };
  const options = {
    provider,
    traceOptions: { maxInternalPerSegment: 0 },
    fetchImpl,
    nowImpl: () => syntheticNow,
    sleepImpl: async milliseconds => { sleepCalls.push(milliseconds); syntheticNow += milliseconds; }
  };
  await Promise.all([
    snapRouteThroughGuidance({ type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50]] }, options),
    snapRouteThroughGuidance({ type: 'LineString', coordinates: [[-0.12, 51.50], [-0.10, 51.50]] }, options)
  ]);
  assert.deepEqual(sleepCalls, [1000], 'provider throttle must also serialize separate route jobs');
}

{
  const prepared = prepareMatchTrace(
    { type: 'LineString', coordinates: [[-0.11, 51.50], [-0.10, 51.50], [-0.09, 51.50]] },
    { maxInternalPerSegment: 0 }
  );
  const chunks = chunkPreparedTrace(prepared, 4);
  assert.ok(chunks.every(chunk => chunk.items.length <= 4));
  assert.match(matchRequestUrl(chunks[0].items, syntheticProvider), /\/match\/v1\/driving\//);
  assert.doesNotMatch(matchRequestUrl(chunks[0].items, syntheticProvider), /continue_straight|alternatives=/);
}

console.log('HF4 planner-guided OSRM map-matching regressions passed.');
