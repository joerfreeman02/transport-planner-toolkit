import assert from 'node:assert/strict';
import { DEFAULT_ROAD_ROUTING_PROVIDER, routeRequestUrl } from '../assets/js/route-snap-adapter.js';

// Guarded deliberate provider-contract smoke. Non-client coordinates are the
// public Berlin coordinates used in OSRM's documentation. This file is NOT CI.
const items = [
  { coordinate: [13.388860, 52.517037], radiusMetres: 100 },
  { coordinate: [13.397634, 52.529407], radiusMetres: 100 },
  { coordinate: [13.428555, 52.523219], radiusMetres: 100 }
];

const endpoints = DEFAULT_ROAD_ROUTING_PROVIDER.endpoints;
const failures = [];
let success = null;

for (const endpoint of endpoints) {
  const url = routeRequestUrl(items, endpoint);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TPT-DG-HF4A-live-provider-smoke/1.0 (manual non-client QA)'
        }
      });
    } finally {
      clearTimeout(timeout);
    }
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* diagnostics below */ }
    if (!response.ok || data?.code !== 'Ok' || data?.routes?.[0]?.geometry?.type !== 'LineString') {
      throw new Error(`HTTP ${response.status}: ${data?.code || ''} ${data?.message || text.slice(0, 200)}`.trim());
    }
    success = {
      endpoint,
      code: data.code,
      waypointCount: Array.isArray(data.waypoints) ? data.waypoints.length : null,
      routeCoordinateCount: data.routes[0].geometry.coordinates.length
    };
    break;
  } catch (error) {
    failures.push(`${endpoint}: ${error?.name === 'AbortError' ? 'timeout' : (error?.message || error)}`);
  }
}

assert.ok(success, `No configured no-key OSRM Route endpoint passed the guarded smoke. ${failures.join(' | ')}`);
console.log(JSON.stringify({ liveProviderSmoke: 'PASS', success, failures }, null, 2));
