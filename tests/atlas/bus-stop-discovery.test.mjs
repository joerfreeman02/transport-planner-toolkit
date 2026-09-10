import assert from 'node:assert/strict';
import { createBusStopDiscovery } from '../../src/atlas/application/bus-stop-discovery.mjs';

const success = source => ({ ok: true, data: [], evidence: [], warnings: [], provenance: { source } });
let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`PASS Bus discovery — ${name}`); };

await test('London point selects TfL without a UI provider choice', async () => {
  let tflCalls = 0;
  let naptanCalls = 0;
  const discovery = createBusStopDiscovery({
    tflAdapter: { id: 'tfl', nearbyStops: async () => { tflCalls += 1; return success('TfL'); } },
    naptanAdapter: { id: 'naptan', nearbyStops: async () => { naptanCalls += 1; return success('NaPTAN'); } },
    londonCoverage: () => true
  });
  const result = await discovery.nearbyStops({ latitude: 51.5, longitude: -0.1 });
  assert.equal(tflCalls, 1);
  assert.equal(naptanCalls, 0);
  assert.equal(result.provenance.providerAdapter, 'tfl');
});
await test('outside-London point selects NaPTAN and preserves coverage blocker', async () => {
  const discovery = createBusStopDiscovery({
    tflAdapter: { id: 'tfl', nearbyStops: async () => success('TfL') },
    naptanAdapter: { id: 'naptan', nearbyStops: async () => ({ ok: false, code: 'coverage_not_implemented', data: null, evidence: [], warnings: [], provenance: { source: 'NaPTAN' } }) },
    londonCoverage: () => false
  });
  const result = await discovery.nearbyStops({ latitude: 51.68, longitude: -0.03 });
  assert.equal(result.code, 'coverage_not_implemented');
  assert.equal(result.provenance.providerAdapter, 'naptan');
});
await test('outside-London point can retain returned TfL StopPoint authority alongside NaPTAN', async () => {
  const discovery = createBusStopDiscovery({
    tflAdapter: { id: 'tfl', nearbyStops: async () => ({ ...success('TfL'), data: [{ id: '490WC', name: 'Bus Station', latitude: 51.685, longitude: -0.034, routes: ['279'], timetableAuthority: 'TfL' }] }) },
    naptanAdapter: { id: 'naptan', nearbyStops: async () => ({ ...success('NaPTAN'), data: [{ id: '2100WC', name: 'Bus Station', latitude: 51.6851, longitude: -0.0341, routes: ['217'], timetableAuthority: 'NaPTAN' }] }) },
    londonCoverage: () => false,
    crossBoundaryTfL: true
  });
  const result = await discovery.nearbyStops({ latitude: 51.685, longitude: -0.034 });
  assert.equal(result.ok, true);
  assert.equal(result.data.length, 2);
  assert.deepEqual(result.data.map(stop => stop.timetableAuthority).sort(), ['NaPTAN', 'TfL']);
  assert.equal(result.provenance.crossBoundaryTfL, true);
  assert.match(result.warnings.join(' '), /outside the Greater London boundary/);
});
await test('cross-boundary merge uses physical StopPoint identity without authority duplication', async () => {
  const discovery = createBusStopDiscovery({
    tflAdapter: { id: 'tfl', nearbyStops: async () => ({ ...success('TfL'), data: [{ id: 'SHARED', name: 'Shared Stop', latitude: 51.685, longitude: -0.034, distanceMetres: 30, routes: ['279'], timetableAuthority: 'TfL', routeAuthorities: { '279': ['TfL'] } }] }) },
    naptanAdapter: { id: 'naptan', nearbyStops: async () => ({ ...success('NaPTAN'), data: [{ id: 'SHARED', name: 'Shared Stop', latitude: 51.6851, longitude: -0.0341, distanceMetres: 40, routes: ['279', 'X'], timetableAuthority: 'NaPTAN', routeAuthorities: { '279': ['BODS'], X: ['BODS'] }, routeDiscoverySource: 'BODS' }] }) },
    londonCoverage: () => false,
    crossBoundaryTfL: true
  });
  const result = await discovery.nearbyStops({ latitude: 51.685, longitude: -0.034 });
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.data[0].sourceAuthorities, ['NaPTAN', 'TfL']);
  assert.deepEqual(result.data[0].timetableAuthorities, ['NaPTAN', 'TfL']);
  assert.deepEqual(result.data[0].routes, ['279', 'X']);
  assert.deepEqual(result.data[0].routeAuthorities, { '279': ['BODS', 'TfL'], X: ['BODS'] });
  assert.equal(result.data[0].timetableAuthority, 'TfL');
});

console.log(`${passed} bus discovery tests passed.`);
