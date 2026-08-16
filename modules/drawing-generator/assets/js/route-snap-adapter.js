import { assessGuidanceOrder } from './route-geometry.js';

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

export function roadSnapRequestUrl(geometry, provider = DEFAULT_ROAD_ROUTING_PROVIDER) {
  if (geometry?.type !== 'LineString' || geometry.coordinates.length < 2) throw new Error('At least two route-guidance points are required.');
  if (geometry.coordinates.length > provider.maximumWaypoints) throw new Error(`No more than ${provider.maximumWaypoints} route-guidance points may be sent.`);
  const coordinates = geometry.coordinates.map(([longitude, latitude]) => `${Number(longitude).toFixed(7)},${Number(latitude).toFixed(7)}`).join(';');
  return `${provider.endpoint}/${coordinates}?overview=full&geometries=geojson&steps=false&alternatives=false&continue_straight=true`;
}

export async function snapRouteThroughGuidance(roughGeometry, options = {}) {
  const provider = options.provider || DEFAULT_ROAD_ROUTING_PROVIDER;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const requestUrl = roadSnapRequestUrl(roughGeometry, provider);
    const response = await fetchImpl(requestUrl, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Road routing returned HTTP ${response.status}.`);
    const data = await response.json();
    const route = data?.routes?.[0];
    if (data?.code !== 'Ok' || route?.geometry?.type !== 'LineString' || route.geometry.coordinates.length < 2) {
      throw new Error(data?.message || 'Road routing did not return usable geometry.');
    }
    const assessment = assessGuidanceOrder(roughGeometry.coordinates, route.geometry);
    return {
      status: 'snapped-review', geometry: route.geometry,
      reviewRequired: !assessment.orderPreserved || assessment.maxGuidanceDeviationMetres > provider.maximumGuidanceDeviationMetres,
      provenance: {
        providerId: provider.id, providerName: provider.name, profile: provider.profile,
        providerPurpose: provider.purpose, attribution: provider.attribution, reportIssueUrl: provider.reportIssueUrl,
        waypointCount: roughGeometry.coordinates.length, waypointOrderPreserved: assessment.orderPreserved,
        maxGuidanceDeviationMetres: assessment.maxGuidanceDeviationMetres,
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
