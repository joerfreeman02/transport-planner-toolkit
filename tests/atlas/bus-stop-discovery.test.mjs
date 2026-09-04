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

console.log(`${passed} bus discovery tests passed.`);
