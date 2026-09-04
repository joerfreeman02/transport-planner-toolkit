import { requestJson } from '../infrastructure/http-client.mjs';

const PROFILES = Object.freeze({ walk: Object.freeze({ server: 'routed-foot', profile: 'foot' }), cycle: Object.freeze({ server: 'routed-bike', profile: 'bike' }) });
const ATTRIBUTION = 'Routing based on OpenStreetMap data and the OSRM routing service';
const DEFAULT_REQUEST_INTERVAL_MS = 1050;

function point(value) {
  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Valid route coordinates are required.');
  return { latitude, longitude };
}

function unavailable() {
  return Object.freeze({ status: 'unavailable', distanceMetres: null, durationSeconds: null });
}

function routed(distance, duration) {
  if (distance == null || duration == null || distance === '' || duration === '') return unavailable();
  const distanceMetres = Number(distance);
  const durationSeconds = Number(duration);
  if (!Number.isFinite(distanceMetres) || !Number.isFinite(durationSeconds) || distanceMetres < 0 || durationSeconds < 0 || (distanceMetres > 0 && durationSeconds === 0)) return unavailable();
  return Object.freeze({ status: 'routed', distanceMetres: Math.round(distanceMetres), durationSeconds: Math.round(durationSeconds) });
}

function straightLineMetres(from, to) {
  const radians = degrees => degrees * Math.PI / 180;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const latitude1 = radians(from.latitude);
  const latitude2 = radians(to.latitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export function createOsrmAccessRoutingAdapter({
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
  baseDomain = 'routing.openstreetmap.de',
  minimumRequestIntervalMs = DEFAULT_REQUEST_INTERVAL_MS,
  sleepImpl = sleep,
  now = () => Date.now()
} = {}) {
  let requestQueue = Promise.resolve();
  let nextRequestAt = 0;

  function scheduledJson(url) {
    const task = requestQueue.then(async () => {
      const waitMs = Math.max(0, nextRequestAt - now());
      if (waitMs) await sleepImpl(waitMs);
      nextRequestAt = now() + Math.max(0, Number(minimumRequestIntervalMs) || 0);
      return requestJson({ url, fetchImpl, timeoutMs });
    });
    requestQueue = task.catch(() => undefined);
    return task;
  }

  function tableEndpoint(origin, targets, profile) {
    const coordinates = [origin, ...targets].map(value => `${value.longitude},${value.latitude}`).join(';');
    return `https://${baseDomain}/${profile.server}/table/v1/${profile.profile}/${coordinates}?sources=0&annotations=distance,duration`;
  }

  function routeEndpoint(origin, target, profile, geometry = false) {
    const query = geometry ? 'overview=full&geometries=geojson' : 'overview=false';
    return `https://${baseDomain}/${profile.server}/route/v1/${profile.profile}/${origin.longitude},${origin.latitude};${target.longitude},${target.latitude}?${query}`;
  }

  async function individualRoute(origin, target, profile, endpoints) {
    const endpoint = routeEndpoint(origin, target, profile, false);
    endpoints.push(endpoint);
    const response = await scheduledJson(endpoint);
    const result = response.data?.routes?.[0];
    if (!response.ok || response.data?.code !== 'Ok' || !result) return unavailable();
    return routed(result.distance, result.duration);
  }

  async function resolveBatch(origin, batch, profile, endpoints) {
    const endpoint = tableEndpoint(origin, batch, profile);
    endpoints.push(endpoint);
    const response = await scheduledJson(endpoint);
    const distances = response.data?.distances?.[0];
    const durations = response.data?.durations?.[0];

    if (response.ok && response.data?.code === 'Ok' && Array.isArray(distances) && Array.isArray(durations)) {
      const results = [];
      for (let index = 0; index < batch.length; index += 1) {
        const candidate = routed(distances[index + 1], durations[index + 1]);
        const suspiciousZero = candidate.status === 'routed' && candidate.distanceMetres === 0 && straightLineMetres(origin, batch[index]) > 25;
        if (candidate.status === 'routed' && !suspiciousZero) results.push(candidate);
        else results.push(await individualRoute(origin, batch[index], profile, endpoints));
      }
      return results;
    }

    // A 400 from OSRM commonly means one coordinate could not participate in the
    // table (for example NoSegment/NoTable). Isolate the bad destination rather
    // than discarding valid routes for every stop in the batch. Do not fan out
    // on outages/timeouts/5xx responses.
    const isolatable = response.status === 400 || (response.ok && ['NoSegment', 'NoTable'].includes(response.data?.code));
    if (!isolatable) return batch.map(unavailable);
    if (batch.length === 1) return [await individualRoute(origin, batch[0], profile, endpoints)];

    const middle = Math.ceil(batch.length / 2);
    const left = await resolveBatch(origin, batch.slice(0, middle), profile, endpoints);
    const right = await resolveBatch(origin, batch.slice(middle), profile, endpoints);
    return [...left, ...right];
  }

  async function matrix(site, destinations, mode) {
    const profile = PROFILES[mode];
    if (!profile) throw new Error('Routing mode must be walk or cycle.');
    const origin = point(site);
    const targets = (destinations ?? []).map(point);
    if (!targets.length) return Object.freeze({ ok: true, mode, routes: [], provenance: Object.freeze({ source: 'OSRM', attribution: ATTRIBUTION }) });

    const routes = [];
    const endpoints = [];
    for (let start = 0; start < targets.length; start += 40) {
      routes.push(...await resolveBatch(origin, targets.slice(start, start + 40), profile, endpoints));
    }

    const ok = routes.some(route => route.status === 'routed');
    return Object.freeze({
      ok,
      code: ok ? null : 'unavailable_source',
      message: ok ? null : 'Routed access information could not be checked. Please try again.',
      mode,
      routes,
      warnings: routes.some(route => route.status !== 'routed') ? ['Some routed access results were unavailable.'] : [],
      provenance: Object.freeze({ source: 'OSRM', endpoints, attribution: ATTRIBUTION, requestIntervalMs: Math.max(0, Number(minimumRequestIntervalMs) || 0) })
    });
  }

  async function geometry(site, destination, mode) {
    const profile = PROFILES[mode];
    if (!profile) throw new Error('Routing mode must be walk or cycle.');
    const origin = point(site);
    const target = point(destination);
    const endpoint = routeEndpoint(origin, target, profile, true);
    const response = await scheduledJson(endpoint);
    const route = response.data?.routes?.[0];
    if (!response.ok || response.data?.code !== 'Ok' || route?.geometry?.type !== 'LineString') return Object.freeze({ ok: false, status: 'unavailable', message: 'The route line is temporarily unavailable. The stop and timetable information is unchanged.', mode, provenance: Object.freeze({ source: 'OSRM', endpoint, attribution: ATTRIBUTION }) });
    return Object.freeze({ ok: true, status: 'routed', mode, distanceMetres: Math.round(route.distance), durationSeconds: Math.round(route.duration), geometry: route.geometry, provenance: Object.freeze({ source: 'OSRM', endpoint, attribution: ATTRIBUTION }) });
  }

  return Object.freeze({ id: 'osrm-access-routing-v1', matrix, geometry });
}
