import assert from 'node:assert/strict';
import { createOsrmAccessRoutingAdapter } from '../../src/atlas/adapters/osrm-access-routing-adapter.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const site = { latitude: 51.5, longitude: -0.1 };
const stops = [{ latitude: 51.501, longitude: -0.101 }, { latitude: 51.502, longitude: -0.102 }];
const adapterWith = fetchImpl => createOsrmAccessRoutingAdapter({ fetchImpl, minimumRequestIntervalMs: 0 });

test('walking and cycling matrices retain routed results separately', async () => {
  const fetchImpl = async url => new Response(JSON.stringify({ code: 'Ok', distances: [[0, 120, 250]], durations: [[0, 90, 180]] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const adapter = adapterWith(fetchImpl);
  const walk = await adapter.matrix(site, stops, 'walk');
  const cycle = await adapter.matrix(site, stops, 'cycle');
  assert.equal(walk.routes[0].status, 'routed');
  assert.equal(cycle.routes[1].distanceMetres, 250);
  assert.notEqual(walk.routes, cycle.routes);
});

test('routing outage never fans out into repeated public requests', async () => {
  let requests = 0;
  const adapter = adapterWith(async () => { requests += 1; return new Response('', { status: 503 }); });
  const result = await adapter.matrix(site, stops, 'walk');
  assert.equal(result.ok, false);
  assert.equal(requests, 1);
  assert.ok(result.routes.every(route => route.status === 'unavailable' && route.distanceMetres === null));
});

test('a bad coordinate in a table is isolated instead of poisoning every stop', async () => {
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    const parsed = new URL(url);
    const isRoute = parsed.pathname.includes('/route/');
    const count = parsed.pathname.split('/').at(-1).split(';').length;
    if (!isRoute && count > 2) return new Response(JSON.stringify({ code: 'NoSegment' }), { status: 400, headers: { 'content-type': 'application/json' } });
    if (isRoute) return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 140, duration: 100 }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ code: 'Ok', distances: [[0, 130]], durations: [[0, 95]] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await adapterWith(fetchImpl).matrix(site, stops, 'walk');
  assert.equal(result.ok, true);
  assert.ok(result.routes.every(route => route.status === 'routed'));
  assert.ok(requests.length >= 3);
});

test('null table cells are retried as individual routes', async () => {
  let routeRequests = 0;
  const fetchImpl = async url => {
    if (new URL(url).pathname.includes('/route/')) {
      routeRequests += 1;
      return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 175, duration: 125 }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ code: 'Ok', distances: [[0, null, 250]], durations: [[0, null, 180]] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await adapterWith(fetchImpl).matrix(site, stops, 'walk');
  assert.equal(result.routes[0].distanceMetres, 175);
  assert.equal(result.routes[1].distanceMetres, 250);
  assert.equal(routeRequests, 1);
});

test('suspicious zero-distance table results for distinct points use a pairwise route check', async () => {
  let routeRequests = 0;
  const fetchImpl = async url => {
    if (new URL(url).pathname.includes('/route/')) {
      routeRequests += 1;
      return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 180, duration: 130 }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ code: 'Ok', distances: [[0, 0]], durations: [[0, 0]] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const result = await adapterWith(fetchImpl).matrix(site, [stops[0]], 'walk');
  assert.equal(result.routes[0].distanceMetres, 180);
  assert.equal(routeRequests, 1);
});

test('route geometry is retained only when the router returns a line', async () => {
  const adapter = adapterWith(async () => new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 130, duration: 95, geometry: { type: 'LineString', coordinates: [[-0.1, 51.5], [-0.101, 51.501]] } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const result = await adapter.geometry(site, stops[0], 'walk');
  assert.equal(result.ok, true);
  assert.equal(result.geometry.type, 'LineString');
});

test('large stop sets are split into bounded matrix requests without changing order', async () => {
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    const count = new URL(url).pathname.split('/').at(-1).split(';').length;
    const values = Array.from({ length: count }, (_value, index) => index * 10);
    return new Response(JSON.stringify({ code: 'Ok', distances: [values], durations: [values] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const manyStops = Array.from({ length: 81 }, (_value, index) => ({ latitude: 51.501 + index / 10000, longitude: -0.101 - index / 10000 }));
  const result = await adapterWith(fetchImpl).matrix(site, manyStops, 'walk');
  assert.equal(requests.length, 3);
  assert.equal(result.routes.length, 81);
  assert.ok(result.routes.every(route => route.status === 'routed'));
});

test('public routing requests honour the configured minimum interval', async () => {
  let current = 1000;
  const waits = [];
  const fetchImpl = async () => new Response(JSON.stringify({ code: 'Ok', distances: [[0, 100]], durations: [[0, 80]] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const adapter = createOsrmAccessRoutingAdapter({
    fetchImpl,
    minimumRequestIntervalMs: 1000,
    now: () => current,
    sleepImpl: async ms => { waits.push(ms); current += ms; }
  });
  await Promise.all([adapter.matrix(site, [stops[0]], 'walk'), adapter.matrix(site, [stops[0]], 'cycle')]);
  assert.deepEqual(waits, [1000]);
});

test('concurrent walk and cycle calls are serialized through one public-service queue', async () => {
  let active = 0;
  let maximumActive = 0;
  const fetchImpl = async url => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active -= 1;
    return new Response(JSON.stringify({ code: 'Ok', distances: [[0, 100]], durations: [[0, 80]] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const adapter = adapterWith(fetchImpl);
  await Promise.all([adapter.matrix(site, [stops[0]], 'walk'), adapter.matrix(site, [stops[0]], 'cycle')]);
  assert.equal(maximumActive, 1);
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS OSRM access routing - ${name}`);
}
console.log(`${tests.length} OSRM access-routing tests passed.`);
