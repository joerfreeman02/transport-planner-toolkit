import { assessGuidanceOrder, routeLengthMetres } from './route-geometry.js';

export const DEFAULT_ROAD_ROUTING_PROVIDER = Object.freeze({
  id: 'osm-osrm-car',
  name: 'OpenStreetMap road geometry via OSRM',
  endpoint: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  profile: 'driving',
  attribution: 'Road geometry (c) OpenStreetMap contributors; routed by OSRM',
  reportIssueUrl: 'https://www.openstreetmap.org/fixthemap',
  purpose: 'geometry-assistance-only',
  maximumGuidanceDeviationMetres: 150,
  maximumWaypoints: 50
});

export function guidanceToleranceMetres(geometry) {
  const length = routeLengthMetres(geometry);
  if (length <= 2500) return 30;
  if (length <= 8000) return 60;
  return 100;
}

export function corridorToleranceMetres(geometry) {
  const length = routeLengthMetres(geometry);
  if (length <= 2500) return 90;
  if (length <= 8000) return 220;
  return 450;
}

export function roadSnapRequestUrl(geometry, provider = DEFAULT_ROAD_ROUTING_PROVIDER, options = {}) {
  if (geometry?.type !== 'LineString' || geometry.coordinates.length < 2) throw new Error('At least two route-guidance points are required.');
  if (geometry.coordinates.length > provider.maximumWaypoints) throw new Error(`No more than ${provider.maximumWaypoints} route-guidance points may be sent.`);
  const coordinates = geometry.coordinates.map(([longitude, latitude]) => `${Number(longitude).toFixed(7)},${Number(latitude).toFixed(7)}`).join(';');
  const radius = Number(options.snapRadiusMetres);
  const radiuses = Number.isFinite(radius) && radius > 0 ? `&radiuses=${geometry.coordinates.map(() => radius.toFixed(0)).join(';')}` : '';
  return `${provider.endpoint}/${coordinates}?overview=full&geometries=geojson&steps=false&alternatives=false&continue_straight=true${radiuses}`;
}

export async function snapRouteThroughGuidance(roughGeometry, options = {}) {
  const provider = options.provider || DEFAULT_ROAD_ROUTING_PROVIDER;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const toleranceMetres = options.maximumGuidanceDeviationMetres ?? guidanceToleranceMetres(roughGeometry);
    const corridorTolerance = options.maximumCorridorDeviationMetres ?? corridorToleranceMetres(roughGeometry);
    const maximumRouteLengthRatio = options.maximumRouteLengthRatio ?? 1.6;
    const snapRadiusMetres = options.snapRadiusMetres ?? toleranceMetres;
    const requestUrl = roadSnapRequestUrl(roughGeometry, provider, { snapRadiusMetres });
    const response = await fetchImpl(requestUrl, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Road routing returned HTTP ${response.status}.`);
    const data = await response.json();
    const route = data?.routes?.[0];
    if (data?.code !== 'Ok' || route?.geometry?.type !== 'LineString' || route.geometry.coordinates.length < 2) {
      throw new Error(data?.message || 'Road routing did not return usable geometry.');
    }
    const assessment = assessGuidanceOrder(roughGeometry.coordinates, route.geometry);
    const roughLengthMetres = routeLengthMetres(roughGeometry);
    const snappedLengthMetres = routeLengthMetres(route.geometry);
    const routeLengthRatio = roughLengthMetres ? snappedLengthMetres / roughLengthMetres : Number.POSITIVE_INFINITY;
    const reviewReasons = [];
    if (!assessment.orderPreserved) reviewReasons.push('The snapped route did not preserve planner waypoint order.');
    if (assessment.maxGuidanceDeviationMetres > toleranceMetres) {
      reviewReasons.push(`A planner waypoint snapped ${assessment.maxGuidanceDeviationMetres.toFixed(0)} m away (limit ${toleranceMetres.toFixed(0)} m).`);
    }
    if (assessment.maxSnappedCorridorDeviationMetres > corridorTolerance) {
      reviewReasons.push(`The snapped route left the selected corridor by ${assessment.maxSnappedCorridorDeviationMetres.toFixed(0)} m (review limit ${corridorTolerance.toFixed(0)} m).`);
    }
    if (routeLengthRatio > maximumRouteLengthRatio) {
      reviewReasons.push(`The snapped road route is ${routeLengthRatio.toFixed(2)}x the planner guidance length (review limit ${maximumRouteLengthRatio.toFixed(2)}x).`);
    }
    const reviewRequired = reviewReasons.length > 0;
    return {
      status: 'snapped-review',
      // Fail safe: never replace the planner's visible route with a provider
      // candidate that departs materially from the drawn corridor. The bad
      // candidate remains available for diagnostics, while the planner sees
      // and can edit the guidance they actually selected.
      geometry: reviewRequired ? structuredClone(roughGeometry) : route.geometry,
      candidateGeometry: structuredClone(route.geometry),
      reviewRequired,
      reviewReason: reviewReasons.join(' '),
      provenance: {
        providerId: provider.id, providerName: provider.name, profile: provider.profile,
        providerPurpose: provider.purpose, attribution: provider.attribution, reportIssueUrl: provider.reportIssueUrl,
        waypointCount: roughGeometry.coordinates.length, waypointOrderPreserved: assessment.orderPreserved,
        maxGuidanceDeviationMetres: assessment.maxGuidanceDeviationMetres,
        maxSnappedCorridorDeviationMetres: assessment.maxSnappedCorridorDeviationMetres,
        guidanceToleranceMetres: toleranceMetres,
        corridorToleranceMetres: corridorTolerance,
        routeLengthRatio, maximumRouteLengthRatio,
        snapRadiusMetres,
        distanceMetres: Number(route.distance || 0), durationSeconds: Number(route.duration || 0),
        retrievedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'snap-failed', geometry: structuredClone(roughGeometry),
      error: error?.name === 'AbortError' ? 'Road routing timed out.' : String(error?.message || error)
    };
  } finally {
    clearTimeout(timeout);
  }
}
