import { requestJson } from '../infrastructure/http-client.mjs';

const PROFILES = Object.freeze({ walk: Object.freeze({ server: 'routed-foot', profile: 'foot' }), cycle: Object.freeze({ server: 'routed-bike', profile: 'bike' }) });
const ATTRIBUTION = 'Routing based on OpenStreetMap data and the OSRM routing service';

function point(value) {
  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Valid route coordinates are required.');
  return { latitude, longitude };
}

export function createOsrmAccessRoutingAdapter({ fetchImpl = globalThis.fetch, timeoutMs = 20000, baseDomain = 'routing.openstreetmap.de' } = {}) {
  async function matrix(site, destinations, mode) {
    const profile = PROFILES[mode];
    if (!profile) throw new Error('Routing mode must be walk or cycle.');
    const origin = point(site);
    const targets = (destinations ?? []).map(point);
    if (!targets.length) return Object.freeze({ ok: true, mode, routes: [], provenance: Object.freeze({ source: 'OSRM', attribution: ATTRIBUTION }) });
    const routes = [];
    const endpoints = [];
    for (let start = 0; start < targets.length; start += 40) {
      const batch = targets.slice(start, start + 40);
      const coordinates = [origin, ...batch].map(value => `${value.longitude},${value.latitude}`).join(';');
      const endpoint = `https://${baseDomain}/${profile.server}/table/v1/${profile.profile}/${coordinates}?sources=0&annotations=distance,duration`;
      endpoints.push(endpoint);
      const response = await requestJson({ url: endpoint, fetchImpl, timeoutMs });
      if (!response.ok || response.data?.code !== 'Ok' || !Array.isArray(response.data?.distances?.[0]) || !Array.isArray(response.data?.durations?.[0])) {
        routes.push(...batch.map(() => Object.freeze({ status: 'unavailable', distanceMetres: null, durationSeconds: null })));
        continue;
      }
      routes.push(...batch.map((_target, index) => {
        const distanceMetres = Number(response.data.distances[0][index + 1]);
        const durationSeconds = Number(response.data.durations[0][index + 1]);
        return Number.isFinite(distanceMetres) && Number.isFinite(durationSeconds)
          ? Object.freeze({ status: 'routed', distanceMetres: Math.round(distanceMetres), durationSeconds: Math.round(durationSeconds) })
          : Object.freeze({ status: 'unavailable', distanceMetres: null, durationSeconds: null });
      }));
    }
    const ok = routes.some(route => route.status === 'routed');
    return Object.freeze({ ok, code: ok ? null : 'unavailable_source', message: ok ? null : 'Routed access information could not be checked. Please try again.', mode, routes, warnings: routes.some(route => route.status !== 'routed') ? ['Some routed access results were unavailable.'] : [], provenance: Object.freeze({ source: 'OSRM', endpoints, attribution: ATTRIBUTION }) });
  }

  async function geometry(site, destination, mode) {
    const profile = PROFILES[mode];
    if (!profile) throw new Error('Routing mode must be walk or cycle.');
    const origin = point(site);
    const target = point(destination);
    const endpoint = `https://${baseDomain}/${profile.server}/route/v1/${profile.profile}/${origin.longitude},${origin.latitude};${target.longitude},${target.latitude}?overview=full&geometries=geojson`;
    const response = await requestJson({ url: endpoint, fetchImpl, timeoutMs });
    const route = response.data?.routes?.[0];
    if (!response.ok || response.data?.code !== 'Ok' || route?.geometry?.type !== 'LineString') return Object.freeze({ ok: false, status: 'unavailable', message: 'The route line is temporarily unavailable. The stop and timetable information is unchanged.', mode, provenance: Object.freeze({ source: 'OSRM', endpoint, attribution: ATTRIBUTION }) });
    return Object.freeze({ ok: true, status: 'routed', mode, distanceMetres: Math.round(route.distance), durationSeconds: Math.round(route.duration), geometry: route.geometry, provenance: Object.freeze({ source: 'OSRM', endpoint, attribution: ATTRIBUTION }) });
  }

  return Object.freeze({ id: 'osrm-access-routing-v1', matrix, geometry });
}
