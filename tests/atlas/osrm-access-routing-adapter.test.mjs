import assert from 'node:assert/strict';
import { createOsrmAccessRoutingAdapter } from '../../src/atlas/adapters/osrm-access-routing-adapter.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const site = { latitude: 51.5, longitude: -0.1 };
const stops = [{ latitude: 51.501, longitude: -0.101 }, { latitude: 51.502, longitude: -0.102 }];

test('walking and cycling matrices retain routed results separately', async () => {
  const fetchImpl = async url => new Response(JSON.stringify({ code: 'Ok', distances: [[0, 120, 250]], durations: [[0, 90, 180]] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const adapter = createOsrmAccessRoutingAdapter({ fetchImpl });
  const walk = await adapter.matrix(site, stops, 'walk');
  const cycle = await adapter.matrix(site, stops, 'cycle');
  assert.equal(walk.routes[0].status, 'routed');
  assert.equal(cycle.routes[1].distanceMetres, 250);
  assert.notEqual(walk.routes, cycle.routes);
});

test('routing failure never returns an estimated straight-line substitute', async () => {
  const adapter = createOsrmAccessRoutingAdapter({ fetchImpl: async () => new Response('', { status: 503 }) });
  const result = await adapter.matrix(site, stops, 'walk');
  assert.equal(result.ok, false);
  assert.ok(result.routes.every(route => route.status === 'unavailable' && route.distanceMetres === null));
});

test('route geometry is retained only when the router returns a line', async () => {
  const adapter = createOsrmAccessRoutingAdapter({ fetchImpl: async () => new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 130, duration: 95, geometry: { type: 'LineString', coordinates: [[-0.1, 51.5], [-0.101, 51.501]] } }] }), { status: 200, headers: { 'content-type': 'application/json' } }) });
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
  const result = await createOsrmAccessRoutingAdapter({ fetchImpl }).matrix(site, manyStops, 'walk');
  assert.equal(requests.length, 3);
  assert.equal(result.routes.length, 81);
  assert.ok(result.routes.every(route => route.status === 'routed'));
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS OSRM access routing - ${name}`);
}
console.log(`${tests.length} OSRM access-routing tests passed.`);
