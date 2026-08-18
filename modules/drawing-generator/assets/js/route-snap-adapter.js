import { assessGuidanceOrder, geometryCorridorDeviationMetres, haversineMetres, routeLengthMetres } from './route-geometry.js';

const PRIMARY_ROUTE_ENDPOINT = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
const FALLBACK_ROUTE_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';

export const DEFAULT_ROAD_ROUTING_PROVIDER = Object.freeze({
  id: 'osm-osrm-car-guided-route',
  name: 'OpenStreetMap road geometry via OSRM guided routing',
  endpoint: PRIMARY_ROUTE_ENDPOINT,
  endpoints: Object.freeze([PRIMARY_ROUTE_ENDPOINT, FALLBACK_ROUTE_ENDPOINT]),
  profile: 'driving',
  attribution: 'Road geometry (c) OpenStreetMap contributors; routed by OSRM',
  reportIssueUrl: 'https://www.openstreetmap.org/fixthemap',
  purpose: 'geometry-assistance-only',
  maximumRouteLocations: 40,
  minimumRequestIntervalMs: 1000
});

function guidanceCoordinates(geometry) {
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
    throw new Error('At least two route-guidance points are required.');
  }
  return geometry.coordinates.map(coordinate => {
    if (!Array.isArray(coordinate) || coordinate.length < 2 || !coordinate.slice(0, 2).every(Number.isFinite)) {
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

export function guidancePreparationProfile(geometry) {
  const length = routeLengthMetres(geometry);
  if (length <= 2500) return Object.freeze({ sampleSpacingMetres: 35, originalRadiusMetres: 50, internalRadiusMetres: 85 });
  if (length <= 8000) return Object.freeze({ sampleSpacingMetres: 120, originalRadiusMetres: 80, internalRadiusMetres: 160 });
  return Object.freeze({ sampleSpacingMetres: 220, originalRadiusMetres: 150, internalRadiusMetres: 280 });
}

function interpolate(start, end, ratio) {
  return [
    start[0] + ((end[0] - start[0]) * ratio),
    start[1] + ((end[1] - start[1]) * ratio)
  ];
}

export function prepareGuidedRouteTrace(geometry, options = {}) {
  const coordinates = guidanceCoordinates(geometry);
  const defaults = guidancePreparationProfile(geometry);
  const sampleSpacingMetres = Number(options.sampleSpacingMetres ?? defaults.sampleSpacingMetres);
  const originalRadiusMetres = Number(options.originalRadiusMetres ?? defaults.originalRadiusMetres);
  const internalRadiusMetres = Number(options.internalRadiusMetres ?? defaults.internalRadiusMetres);
  const maxInternalPerSegment = Math.max(0, Math.floor(options.maxInternalPerSegment ?? 16));
  if (!(sampleSpacingMetres > 0) || !(originalRadiusMetres > 0) || !(internalRadiusMetres > 0)) {
    throw new Error('Guided road snapping requires positive spacing and radius values.');
  }

  const trace = [{ coordinate: [...coordinates[0]], originalIndex: 0, radiusMetres: originalRadiusMetres }];
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const distance = haversineMetres(start, end);
    const internalCount = Math.min(maxInternalPerSegment, Math.max(0, Math.ceil(distance / sampleSpacingMetres) - 1));
    for (let step = 1; step <= internalCount; step += 1) {
      trace.push({
        coordinate: interpolate(start, end, step / (internalCount + 1)),
        originalIndex: null,
        radiusMetres: internalRadiusMetres
      });
    }
    trace.push({ coordinate: [...end], originalIndex: index, radiusMetres: originalRadiusMetres });
  }
  return trace;
}

function previousOriginalTraceIndex(trace, fromIndex, lowerBound) {
  for (let index = fromIndex; index > lowerBound; index -= 1) {
    if (trace[index]?.originalIndex !== null && trace[index]?.originalIndex !== undefined) return index;
  }
  return null;
}

export function chunkGuidedRouteTrace(trace, maximumLocations = DEFAULT_ROAD_ROUTING_PROVIDER.maximumRouteLocations) {
  if (!Array.isArray(trace) || trace.length < 2) throw new Error('Prepared guided route requires at least two locations.');
  const maximum = Math.max(4, Math.floor(maximumLocations));
  const chunks = [];
  let startIndex = 0;
  while (startIndex < trace.length - 1) {
    let endIndex = Math.min(trace.length - 1, startIndex + maximum - 1);
    if (endIndex < trace.length - 1) {
      const originalBoundary = previousOriginalTraceIndex(trace, endIndex, startIndex);
      if (originalBoundary !== null) endIndex = originalBoundary;
    }
    if (endIndex <= startIndex) throw new Error('Could not create a bounded guided-routing request chunk.');
    chunks.push({ startIndex, endIndex, items: trace.slice(startIndex, endIndex + 1) });
    if (endIndex === trace.length - 1) break;
    startIndex = endIndex; // one planner-authored overlap point
  }
  return chunks;
}

function providerEndpoints(provider, suppliedProvider = {}) {
  if (Array.isArray(suppliedProvider.endpoints) && suppliedProvider.endpoints.length) return suppliedProvider.endpoints;
  if (typeof suppliedProvider.endpoint === 'string' && suppliedProvider.endpoint.trim()) return [suppliedProvider.endpoint.trim()];
  if (Array.isArray(provider.endpoints) && provider.endpoints.length) return provider.endpoints;
  return [provider.endpoint];
}

export function routeRequestUrl(traceItems, endpoint = DEFAULT_ROAD_ROUTING_PROVIDER.endpoint) {
  if (!Array.isArray(traceItems) || traceItems.length < 2) throw new Error('At least two guided-routing locations are required.');
  const coordinates = traceItems.map(item => item.coordinate)
    .map(([longitude, latitude]) => `${Number(longitude).toFixed(7)},${Number(latitude).toFixed(7)}`)
    .join(';');
  const radiuses = traceItems.map(item => Number(item.radiusMetres).toFixed(0)).join(';');
  return `${endpoint}/${coordinates}?overview=full&geometries=geojson&steps=false&alternatives=false&continue_straight=false&generate_hints=false&radiuses=${radiuses}`;
}

// Compatibility export for deterministic callers. For large/dense planner traces,
// snapRouteThroughGuidance performs the required internal chunking automatically.
export function roadSnapRequestUrl(geometry, provider = DEFAULT_ROAD_ROUTING_PROVIDER, options = {}) {
  const trace = prepareGuidedRouteTrace(geometry, options);
  const maximum = Number(provider.maximumRouteLocations ?? DEFAULT_ROAD_ROUTING_PROVIDER.maximumRouteLocations);
  if (trace.length > maximum) throw new Error('Prepared guidance requires multiple route requests; use snapRouteThroughGuidance.');
  return routeRequestUrl(trace, provider.endpoint || DEFAULT_ROAD_ROUTING_PROVIDER.endpoint);
}

const endpointQueues = new Map();
const endpointLastStartedAt = new Map();

async function runScheduledRequest(endpoint, intervalMs, task, options = {}) {
  const waitInterval = Math.max(0, Number(options.throttleMs ?? intervalMs ?? 0));
  if (waitInterval === 0) return task();
  const sleepImpl = options.sleepImpl || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const nowImpl = options.nowImpl || Date.now;
  const previous = endpointQueues.get(endpoint) || Promise.resolve();
  const scheduled = previous.catch(() => {}).then(async () => {
    const previousStart = endpointLastStartedAt.get(endpoint);
    if (Number.isFinite(previousStart)) {
      const waitMs = Math.max(0, waitInterval - (nowImpl() - previousStart));
      if (waitMs > 0) await sleepImpl(waitMs);
    }
    endpointLastStartedAt.set(endpoint, nowImpl());
    return task();
  });
  endpointQueues.set(endpoint, scheduled.then(() => undefined, () => undefined));
  return scheduled;
}

async function responseError(response) {
  let detail = '';
  try {
    const payload = await response.clone().json();
    detail = [payload?.code, payload?.message].filter(Boolean).join(' — ');
  } catch {
    try { detail = String(await response.clone().text()).trim().slice(0, 300); } catch { /* no-op */ }
  }
  return `HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
}

async function fetchRoute(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(await responseError(response));
    const data = await response.json();
    if (data?.code !== 'Ok') throw new Error([data?.code, data?.message].filter(Boolean).join(' — ') || 'OSRM routing did not return a usable route.');
    const route = data.routes?.[0];
    if (route?.geometry?.type !== 'LineString' || route.geometry.coordinates?.length < 2) {
      throw new Error('OSRM routing did not return usable LineString geometry.');
    }
    return { data, route };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Road routing timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function orientGeometry(geometry, start, end) {
  const coordinates = geometry.coordinates.map(coordinate => [...coordinate]);
  const forward = haversineMetres(coordinates[0], start) + haversineMetres(coordinates.at(-1), end);
  const reverse = haversineMetres(coordinates.at(-1), start) + haversineMetres(coordinates[0], end);
  return { type: 'LineString', coordinates: reverse + 0.5 < forward ? coordinates.reverse() : coordinates };
}

async function routeChunk(chunk, provider, endpoints, fetchImpl, timeoutMs, options) {
  const failures = [];
  for (const endpoint of endpoints) {
    const url = routeRequestUrl(chunk.items, endpoint);
    try {
      const result = await runScheduledRequest(
        endpoint,
        provider.minimumRequestIntervalMs,
        () => fetchRoute(url, fetchImpl, timeoutMs),
        options
      );
      const start = chunk.items[0].coordinate;
      const end = chunk.items.at(-1).coordinate;
      return {
        geometry: orientGeometry(result.route.geometry, start, end),
        endpoint,
        distanceMetres: Number(result.route.distance || 0),
        durationSeconds: Number(result.route.duration || 0),
        waypointCount: Array.isArray(result.data.waypoints) ? result.data.waypoints.length : null
      };
    } catch (error) {
      failures.push(`${endpoint}: ${error?.message || error}`);
    }
  }
  throw new Error(`All free OSRM route providers failed for one guidance chunk. ${failures.join(' | ')}`);
}

function stitchChunkRoutes(results, options = {}) {
  if (!results.length) throw new Error('Road routing returned no route chunks.');
  const joinToleranceMetres = Number(options.chunkJoinToleranceMetres ?? 15);
  let coordinates = results[0].geometry.coordinates.map(coordinate => [...coordinate]);
  for (let index = 1; index < results.length; index += 1) {
    let next = results[index].geometry.coordinates.map(coordinate => [...coordinate]);
    const direct = haversineMetres(coordinates.at(-1), next[0]);
    const reversed = haversineMetres(coordinates.at(-1), next.at(-1));
    if (reversed < direct) next = next.reverse();
    const separation = haversineMetres(coordinates.at(-1), next[0]);
    if (separation > joinToleranceMetres) {
      throw new Error(`Guided-routing chunks could not be joined safely (${separation.toFixed(0)} m gap).`);
    }
    coordinates.push(...next.slice(1));
  }
  return { type: 'LineString', coordinates };
}

export async function snapRouteThroughGuidance(roughGeometry, options = {}) {
  const suppliedProvider = options.provider || {};
  const provider = Object.freeze({ ...DEFAULT_ROAD_ROUTING_PROVIDER, ...suppliedProvider });
  const endpoints = providerEndpoints(provider, suppliedProvider);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs ?? 20000);

  try {
    const roughCoordinates = guidanceCoordinates(roughGeometry);
    const preparedTrace = prepareGuidedRouteTrace(roughGeometry, options.traceOptions || {});
    const maximumLocations = Number(options.maximumRouteLocations ?? provider.maximumRouteLocations ?? 40);
    const chunks = chunkGuidedRouteTrace(preparedTrace, maximumLocations);
    const chunkResults = [];
    for (const chunk of chunks) {
      chunkResults.push(await routeChunk(chunk, provider, endpoints, fetchImpl, timeoutMs, options));
    }

    const candidateGeometry = stitchChunkRoutes(chunkResults, options);
    const originalAssessment = assessGuidanceOrder(roughCoordinates, candidateGeometry);
    const preparedCoordinates = preparedTrace.map(item => item.coordinate);
    const preparedAssessment = assessGuidanceOrder(preparedCoordinates, candidateGeometry);
    const originalToleranceMetres = Number(options.maximumGuidanceDeviationMetres ?? guidanceToleranceMetres(roughGeometry));
    const internalToleranceMetres = Number(options.maximumPreparedDeviationMetres
      ?? Math.max(...preparedTrace.map(item => item.radiusMetres)) + 10);

    const reviewReasons = [];
    if (!originalAssessment.orderPreserved) reviewReasons.push('The road-snapped route did not preserve planner point order.');
    if (originalAssessment.maxGuidanceDeviationMetres > originalToleranceMetres) {
      reviewReasons.push(`A planner point snapped ${originalAssessment.maxGuidanceDeviationMetres.toFixed(0)} m away (review limit ${originalToleranceMetres.toFixed(0)} m).`);
    }
    if (!preparedAssessment.orderPreserved) reviewReasons.push('The road-snapped route did not preserve the internally prepared guidance order.');
    if (preparedAssessment.maxGuidanceDeviationMetres > internalToleranceMetres) {
      reviewReasons.push(`The road-snapped route departed materially from prepared guidance (${preparedAssessment.maxGuidanceDeviationMetres.toFixed(0)} m).`);
    }

    const roughLengthMetres = routeLengthMetres(roughGeometry);
    const snappedLengthMetres = routeLengthMetres(candidateGeometry);
    const routeLengthRatio = roughLengthMetres ? snappedLengthMetres / roughLengthMetres : Number.POSITIVE_INFINITY;
    const corridorDiagnosticMetres = geometryCorridorDeviationMetres(candidateGeometry, roughGeometry);
    const reviewRequired = reviewReasons.length > 0;

    return {
      status: 'snapped-review',
      geometry: reviewRequired ? structuredClone(roughGeometry) : candidateGeometry,
      candidateGeometry: structuredClone(candidateGeometry),
      reviewRequired,
      reviewReason: reviewReasons.join(' '),
      provenance: {
        providerId: provider.id,
        providerName: provider.name,
        providerService: 'route-guided',
        providerPurpose: provider.purpose,
        attribution: provider.attribution,
        reportIssueUrl: provider.reportIssueUrl,
        endpointsTried: [...new Set(chunkResults.map(item => item.endpoint))],
        primaryEndpoint: endpoints[0],
        fallbackConfigured: endpoints.length > 1,
        waypointCount: roughCoordinates.length,
        preparedGuidanceCount: preparedTrace.length,
        routeRequestCount: chunks.length,
        maximumRouteLocations: maximumLocations,
        waypointOrderPreserved: originalAssessment.orderPreserved,
        preparedOrderPreserved: preparedAssessment.orderPreserved,
        maxGuidanceDeviationMetres: originalAssessment.maxGuidanceDeviationMetres,
        maxPreparedGuidanceDeviationMetres: preparedAssessment.maxGuidanceDeviationMetres,
        guidanceToleranceMetres: originalToleranceMetres,
        maxSnappedCorridorDeviationMetres: corridorDiagnosticMetres,
        corridorDeviationDiagnosticOnly: true,
        routeLengthRatio,
        routeLengthRatioDiagnosticOnly: true,
        roughLengthMetres,
        matchedLengthMetres: snappedLengthMetres,
        distanceMetres: chunkResults.reduce((sum, item) => sum + item.distanceMetres, 0),
        durationSeconds: chunkResults.reduce((sum, item) => sum + item.durationSeconds, 0),
        retrievedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'snap-failed',
      geometry: structuredClone(roughGeometry),
      candidateGeometry: null,
      reviewRequired: true,
      reviewReason: error?.message || 'Road snapping failed.',
      error: error?.message || 'Road snapping failed.',
      provenance: null
    };
  }
}
