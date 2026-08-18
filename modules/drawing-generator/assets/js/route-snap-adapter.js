import { assessGuidanceOrder, geometryCorridorDeviationMetres, haversineMetres, routeLengthMetres } from './route-geometry.js';

export const DEFAULT_ROAD_ROUTING_PROVIDER = Object.freeze({
  id: 'osm-osrm-car-match',
  name: 'OpenStreetMap road geometry via OSRM map matching',
  endpoint: 'https://routing.openstreetmap.de/routed-car/match/v1/driving',
  profile: 'driving',
  attribution: 'Road geometry (c) OpenStreetMap contributors; map matched by OSRM',
  reportIssueUrl: 'https://www.openstreetmap.org/fixthemap',
  purpose: 'geometry-assistance-only',
  maximumMatchLocations: 40,
  maximumMatchRequestsPerRoute: 12,
  minimumRequestIntervalMs: 1000
});

function guidanceCoordinates(geometry) {
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
    throw new Error('At least two route-guidance points are required.');
  }
  return geometry.coordinates.map(coordinate => {
    if (!Array.isArray(coordinate) || coordinate.length < 2 || !coordinate.every(Number.isFinite)) {
      throw new Error('Route guidance contains an invalid coordinate.');
    }
    return [Number(coordinate[0]), Number(coordinate[1])];
  });
}

export function guidanceToleranceMetres(geometry) {
  const length = routeLengthMetres(geometry);
  if (length <= 2500) return 50;
  if (length <= 8000) return 80;
  return 150;
}

export function tracePreparationProfile(geometry) {
  const length = routeLengthMetres(geometry);
  if (length <= 2500) {
    return Object.freeze({ sampleSpacingMetres: 120, originalRadiusMetres: 50, internalRadiusMetres: 180 });
  }
  if (length <= 8000) {
    return Object.freeze({ sampleSpacingMetres: 250, originalRadiusMetres: 80, internalRadiusMetres: 300 });
  }
  return Object.freeze({ sampleSpacingMetres: 500, originalRadiusMetres: 150, internalRadiusMetres: 500 });
}

function interpolate(start, end, ratio) {
  return [
    start[0] + ((end[0] - start[0]) * ratio),
    start[1] + ((end[1] - start[1]) * ratio)
  ];
}

export function prepareMatchTrace(geometry, options = {}) {
  const coordinates = guidanceCoordinates(geometry);
  const defaults = tracePreparationProfile(geometry);
  const sampleSpacingMetres = Number(options.sampleSpacingMetres ?? defaults.sampleSpacingMetres);
  const originalRadiusMetres = Number(options.originalRadiusMetres ?? defaults.originalRadiusMetres);
  const internalRadiusMetres = Number(options.internalRadiusMetres ?? defaults.internalRadiusMetres);
  const maxInternalPerSegment = Math.max(0, Math.floor(options.maxInternalPerSegment ?? 8));
  if (!(sampleSpacingMetres > 0) || !(originalRadiusMetres > 0) || !(internalRadiusMetres > 0)) {
    throw new Error('Map-matching trace preparation requires positive spacing and radius values.');
  }

  const trace = [{
    coordinate: [...coordinates[0]],
    originalIndex: 0,
    radiusMetres: originalRadiusMetres
  }];

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const distance = haversineMetres(start, end);
    const internalCount = Math.min(
      maxInternalPerSegment,
      Math.max(0, Math.ceil(distance / sampleSpacingMetres) - 1)
    );
    for (let step = 1; step <= internalCount; step += 1) {
      trace.push({
        coordinate: interpolate(start, end, step / (internalCount + 1)),
        originalIndex: null,
        radiusMetres: internalRadiusMetres
      });
    }
    trace.push({
      coordinate: [...end],
      originalIndex: index,
      radiusMetres: originalRadiusMetres
    });
  }
  return trace;
}

function previousOriginalTraceIndex(trace, fromIndex, lowerBound) {
  for (let index = fromIndex; index > lowerBound; index -= 1) {
    if (trace[index]?.originalIndex !== null && trace[index]?.originalIndex !== undefined) return index;
  }
  return null;
}

export function chunkPreparedTrace(trace, maximumLocations = DEFAULT_ROAD_ROUTING_PROVIDER.maximumMatchLocations) {
  if (!Array.isArray(trace) || trace.length < 2) throw new Error('Prepared map-matching trace requires at least two locations.');
  const maximum = Math.max(4, Math.floor(maximumLocations));
  const chunks = [];
  let startIndex = 0;

  while (startIndex < trace.length - 1) {
    let endIndex = Math.min(trace.length - 1, startIndex + maximum - 1);
    if (endIndex < trace.length - 1) {
      const originalBoundary = previousOriginalTraceIndex(trace, endIndex, startIndex);
      if (originalBoundary !== null) endIndex = originalBoundary;
    }
    if (endIndex <= startIndex) throw new Error('Could not create a bounded map-matching request chunk.');
    chunks.push({
      startIndex,
      endIndex,
      items: trace.slice(startIndex, endIndex + 1)
    });
    if (endIndex === trace.length - 1) break;

    // Overlap at one planner-authored point. This is a provider implementation
    // detail only; the stored planner geometry is never shortened or rewritten.
    startIndex = endIndex;
  }

  return chunks;
}

export function matchRequestUrl(traceItems, provider = DEFAULT_ROAD_ROUTING_PROVIDER) {
  if (!Array.isArray(traceItems) || traceItems.length < 2) throw new Error('At least two map-matching locations are required.');
  if (traceItems.length > provider.maximumMatchLocations) {
    throw new Error('Prepared map-matching chunk exceeds the provider request limit.');
  }
  const coordinates = traceItems
    .map(item => item.coordinate)
    .map(([longitude, latitude]) => `${Number(longitude).toFixed(7)},${Number(latitude).toFixed(7)}`)
    .join(';');
  const radiuses = traceItems.map(item => Number(item.radiusMetres).toFixed(0)).join(';');
  return `${provider.endpoint}/${coordinates}?overview=full&geometries=geojson&steps=false&gaps=split&tidy=false&generate_hints=false&radiuses=${radiuses}`;
}

// Compatibility export retained for deterministic callers. The application
// itself uses prepared/chunked Match requests via snapRouteThroughGuidance.
export function roadSnapRequestUrl(geometry, provider = DEFAULT_ROAD_ROUTING_PROVIDER, options = {}) {
  const trace = prepareMatchTrace(geometry, options);
  if (trace.length > provider.maximumMatchLocations) {
    throw new Error('Prepared trace needs multiple map-matching requests; use snapRouteThroughGuidance.');
  }
  return matchRequestUrl(trace, provider);
}

function matchingGeometry(value) {
  return value?.geometry?.type === 'LineString' && value.geometry.coordinates?.length >= 2
    ? value.geometry.coordinates.map(coordinate => [...coordinate])
    : null;
}

function orientCoordinates(coordinates, firstLocation, lastLocation) {
  if (!firstLocation || !lastLocation) return coordinates;
  const forward = haversineMetres(coordinates[0], firstLocation)
    + haversineMetres(coordinates.at(-1), lastLocation);
  const reverse = haversineMetres(coordinates.at(-1), firstLocation)
    + haversineMetres(coordinates[0], lastLocation);
  return reverse + 0.5 < forward ? [...coordinates].reverse() : coordinates;
}

function assembleChunkMatch(data, chunk, options = {}) {
  if (data?.code !== 'Ok') throw new Error(data?.message || `Road map matching returned ${data?.code || 'an unknown error'}.`);
  if (!Array.isArray(data.tracepoints) || data.tracepoints.length !== chunk.items.length) {
    throw new Error('Road map matching returned an invalid tracepoint set.');
  }
  if (!Array.isArray(data.matchings) || !data.matchings.length) {
    throw new Error('Road map matching returned no usable matching geometry.');
  }

  const unmatchedOriginalIndices = [];
  let unmatchedInternalTracepoints = 0;
  chunk.items.forEach((item, index) => {
    if (data.tracepoints[index]) return;
    if (item.originalIndex === null || item.originalIndex === undefined) unmatchedInternalTracepoints += 1;
    else unmatchedOriginalIndices.push(item.originalIndex);
  });

  const matchingGroups = new Map();
  data.tracepoints.forEach((tracepoint, traceIndex) => {
    if (!tracepoint || !Number.isInteger(tracepoint.matchings_index)) return;
    const list = matchingGroups.get(tracepoint.matchings_index) || [];
    list.push(traceIndex);
    matchingGroups.set(tracepoint.matchings_index, list);
  });
  const orderedMatchingIndices = [...matchingGroups.entries()]
    .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))
    .map(([matchingIndex]) => matchingIndex);

  if (!orderedMatchingIndices.length) throw new Error('Road map matching returned no ordered matching geometry.');

  const joinToleranceMetres = Number(options.subtraceJoinToleranceMetres ?? 5);
  let geometryCoordinates = [];
  const confidences = [];

  orderedMatchingIndices.forEach((matchingIndex, orderIndex) => {
    const matching = data.matchings[matchingIndex];
    const coordinates = matchingGeometry(matching);
    if (!coordinates) throw new Error('Road map matching returned malformed matching geometry.');
    if (Number.isFinite(Number(matching.confidence))) confidences.push(Number(matching.confidence));

    const traceIndices = matchingGroups.get(matchingIndex);
    const firstTracepoint = data.tracepoints[Math.min(...traceIndices)]?.location;
    const lastTracepoint = data.tracepoints[Math.max(...traceIndices)]?.location;
    const oriented = orientCoordinates(coordinates, firstTracepoint, lastTracepoint);

    if (orderIndex === 0) {
      geometryCoordinates = oriented;
      return;
    }

    const separation = haversineMetres(geometryCoordinates.at(-1), oriented[0]);
    if (separation > joinToleranceMetres) {
      throw new Error(`Road map matching split the selected trace into discontinuous sub-traces (${separation.toFixed(0)} m gap).`);
    }
    geometryCoordinates.push(...oriented.slice(1));
  });

  return {
    geometry: { type: 'LineString', coordinates: geometryCoordinates },
    tracepoints: data.tracepoints,
    unmatchedOriginalIndices,
    unmatchedInternalTracepoints,
    matchingCount: orderedMatchingIndices.length,
    minimumConfidence: confidences.length ? Math.min(...confidences) : null
  };
}

function stitchChunkMatches(results, options = {}) {
  if (!results.length) throw new Error('Road map matching returned no chunks.');
  const joinToleranceMetres = Number(options.chunkJoinToleranceMetres ?? 5);
  let coordinates = results[0].geometry.coordinates.map(coordinate => [...coordinate]);

  for (let index = 1; index < results.length; index += 1) {
    const next = results[index].geometry.coordinates;
    const separation = haversineMetres(coordinates.at(-1), next[0]);
    if (separation > joinToleranceMetres) {
      throw new Error(`Road map-matching chunks could not be joined safely (${separation.toFixed(0)} m gap).`);
    }
    coordinates.push(...next.slice(1).map(coordinate => [...coordinate]));
  }
  return { type: 'LineString', coordinates };
}


const providerRequestQueues = new Map();
const providerLastRequestStartedAt = new Map();

async function runScheduledProviderRequest(provider, task, options = {}) {
  const intervalMs = Math.max(0, Number(options.throttleMs ?? provider.minimumRequestIntervalMs ?? 0));
  if (intervalMs === 0) return task();

  const key = `${provider.id || 'provider'}|${provider.endpoint}`;
  const sleepImpl = options.sleepImpl || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const nowImpl = options.nowImpl || Date.now;
  const previous = providerRequestQueues.get(key) || Promise.resolve();

  const scheduled = previous.catch(() => {}).then(async () => {
    const previousStart = providerLastRequestStartedAt.get(key);
    if (Number.isFinite(previousStart)) {
      const waitMs = Math.max(0, intervalMs - (nowImpl() - previousStart));
      if (waitMs > 0) await sleepImpl(waitMs);
    }
    providerLastRequestStartedAt.set(key, nowImpl());
    return task();
  });

  providerRequestQueues.set(key, scheduled.then(() => undefined, () => undefined));
  return scheduled;
}

async function fetchMatch(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Road map matching returned HTTP ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function snapRouteThroughGuidance(roughGeometry, options = {}) {
  const provider = Object.freeze({ ...DEFAULT_ROAD_ROUTING_PROVIDER, ...(options.provider || {}) });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 20000;

  try {
    const roughCoordinates = guidanceCoordinates(roughGeometry);
    const preparedTrace = prepareMatchTrace(roughGeometry, options.traceOptions || {});
    const chunks = chunkPreparedTrace(preparedTrace, options.maximumMatchLocations ?? provider.maximumMatchLocations);
    const maximumRequestsPerRoute = Math.max(1, Math.floor(options.maximumMatchRequestsPerRoute ?? provider.maximumMatchRequestsPerRoute ?? 12));
    if (chunks.length > maximumRequestsPerRoute) {
      throw new Error(`Planner route requires ${chunks.length} map-matching requests, above the public-provider safety cap of ${maximumRequestsPerRoute}. Use a less dense trace or an approved higher-capacity provider.`);
    }
    const chunkResults = [];
    let unmatchedInternalTracepoints = 0;
    let matchingCount = 0;
    let minimumConfidence = null;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const requestUrl = matchRequestUrl(chunk.items, provider);
      const data = await runScheduledProviderRequest(
        provider,
        () => fetchMatch(requestUrl, fetchImpl, timeoutMs),
        options
      );
      const result = assembleChunkMatch(data, chunk, options);
      if (result.unmatchedOriginalIndices.length) {
        throw new Error(`Road map matching could not match planner point${result.unmatchedOriginalIndices.length === 1 ? '' : 's'} ${result.unmatchedOriginalIndices.join(', ')}.`);
      }
      unmatchedInternalTracepoints += result.unmatchedInternalTracepoints;
      matchingCount += result.matchingCount;
      if (Number.isFinite(result.minimumConfidence)) {
        minimumConfidence = minimumConfidence === null
          ? result.minimumConfidence
          : Math.min(minimumConfidence, result.minimumConfidence);
      }
      chunkResults.push(result);
    }

    const candidateGeometry = stitchChunkMatches(chunkResults, options);
    const assessment = assessGuidanceOrder(roughCoordinates, candidateGeometry);
    const toleranceMetres = Number(options.maximumGuidanceDeviationMetres ?? guidanceToleranceMetres(roughGeometry));
    const endpointToleranceMetres = Number(options.endpointToleranceMetres ?? toleranceMetres);
    const startDeviationMetres = haversineMetres(roughCoordinates[0], candidateGeometry.coordinates[0]);
    const endDeviationMetres = haversineMetres(roughCoordinates.at(-1), candidateGeometry.coordinates.at(-1));
    const roughLengthMetres = routeLengthMetres(roughGeometry);
    const matchedLengthMetres = routeLengthMetres(candidateGeometry);
    const routeLengthRatio = roughLengthMetres ? matchedLengthMetres / roughLengthMetres : Number.POSITIVE_INFINITY;
    const corridorDiagnosticMetres = geometryCorridorDeviationMetres(candidateGeometry, roughGeometry);

    const reviewReasons = [];
    if (!assessment.orderPreserved) reviewReasons.push('The map-matched route did not preserve planner point order.');
    if (assessment.maxGuidanceDeviationMetres > toleranceMetres) {
      reviewReasons.push(`A planner point matched ${assessment.maxGuidanceDeviationMetres.toFixed(0)} m away (limit ${toleranceMetres.toFixed(0)} m).`);
    }
    if (startDeviationMetres > endpointToleranceMetres || endDeviationMetres > endpointToleranceMetres) {
      reviewReasons.push('The map-matched route endpoints departed materially from the planner-selected endpoints.');
    }

    const reviewRequired = reviewReasons.length > 0;
    return {
      status: 'snapped-review',
      geometry: reviewRequired ? structuredClone(roughGeometry) : structuredClone(candidateGeometry),
      candidateGeometry: structuredClone(candidateGeometry),
      reviewRequired,
      reviewReason: reviewReasons.join(' '),
      provenance: {
        providerId: provider.id,
        providerName: provider.name,
        profile: provider.profile,
        providerPurpose: provider.purpose,
        attribution: provider.attribution,
        reportIssueUrl: provider.reportIssueUrl,
        providerService: 'match',
        waypointCount: roughCoordinates.length,
        preparedTracePointCount: preparedTrace.length,
        matchRequestCount: chunks.length,
        maximumMatchLocations: provider.maximumMatchLocations,
        maximumMatchRequestsPerRoute: maximumRequestsPerRoute,
        waypointOrderPreserved: assessment.orderPreserved,
        maxGuidanceDeviationMetres: assessment.maxGuidanceDeviationMetres,
        guidanceToleranceMetres: toleranceMetres,
        startDeviationMetres,
        endDeviationMetres,
        unmatchedInternalTracepoints,
        matchingCount,
        minimumConfidence,
        maxSnappedCorridorDeviationMetres: corridorDiagnosticMetres,
        routeLengthRatio,
        routeLengthRatioDiagnosticOnly: true,
        retrievedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'snap-failed',
      geometry: structuredClone(roughGeometry),
      candidateGeometry: null,
      error: error?.name === 'AbortError' ? 'Road map matching timed out.' : String(error?.message || error)
    };
  }
}
