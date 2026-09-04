import assert from 'node:assert/strict';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const stop = { id: '2100A', name: 'High Street', indicator: 'Stop A', direction: 'N', latitude: 51.7, longitude: -0.03, routes: ['10'] };
const service = { id: 'svc', routeNumber: '10', operator: 'Example', origin: 'Alpha', destination: 'Beta', direction: 'Beta', principalLocations: ['Hospital'], qualifications: [], stopSchedules: { '2100A': { monday: [360, 390], tuesday: [360, 390], wednesday: [360, 390], thursday: [360, 390], friday: [360, 390], saturday: [420], sunday: [] } } };
const route = { ok: true, routes: [{ status: 'routed', distanceMetres: 250, durationSeconds: 180 }], warnings: [], provenance: { source: 'OSRM' } };

test('complete assessment joins stops, timetable services and separate routed modes', async () => {
  const assessment = createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [stop], evidence: [], warnings: [], provenance: { source: 'NaPTAN' } }) },
    timetableData: { servicesForStops: async () => ({ ok: true, data: [service], warnings: [], provenance: { source: 'BODS' } }) },
    accessRouting: { matrix: async (_site, _stops, mode) => ({ ...route, routes: [{ ...route.routes[0], distanceMetres: mode === 'walk' ? 250 : 300 }] }) }
  });
  const result = await assessment.assess({});
  assert.equal(result.status, 'complete');
  assert.equal(result.stops[0].walking.distanceMetres, 250);
  assert.equal(result.stops[0].cycling.distanceMetres, 300);
  assert.equal(result.serviceSummaries[0].routeNumber, '10');
});

test('timetable and routing failures produce an honest partial assessment', async () => {
  const assessment = createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [stop], evidence: [], warnings: [], provenance: {} }) },
    timetableData: { servicesForStops: async () => ({ ok: false, code: 'unavailable_source', warnings: [], provenance: {} }) },
    accessRouting: { matrix: async () => ({ ok: false, routes: [{ status: 'unavailable', distanceMetres: null, durationSeconds: null }], warnings: [], provenance: {} }) }
  });
  const result = await assessment.assess({});
  assert.equal(result.ok, true);
  assert.equal(result.status, 'partial');
  assert.equal(result.stops[0].walking.distanceMetres, null);
  assert.match(result.warnings.join(' '), /Timetable information is unavailable/);
});

test('genuine authoritative zero remains complete and distinct from source failure', async () => {
  const assessment = createBusAssessment({ stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [], warnings: [], provenance: {} }) }, timetableData: { servicesForStops() { throw new Error('not called'); } }, accessRouting: { matrix() { throw new Error('not called'); } } });
  const result = await assessment.assess({});
  assert.equal(result.status, 'complete');
  assert.equal(result.stops.length, 0);
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS Bus assessment - ${name}`);
}
console.log(`${tests.length} Bus assessment tests passed.`);
