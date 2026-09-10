import assert from 'node:assert/strict';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const site = { latitude: 51.685, longitude: -0.033 };
const weekdays = { monday: [360], tuesday: [360], wednesday: [360], thursday: [360], friday: [360], saturday: [420], sunday: [480] };

test('nearest mode sends the complete nearest logical stop group to timetable processing', async () => {
  const serviceCalls = [];
  const stops = [
    { id: 'A', name: 'Bus Station', locality: 'Waltham Cross', latitude: 51.6850, longitude: -0.0330, indicator: 'Stand A', routes: ['251'] },
    { id: 'B', name: 'Bus Station', locality: 'Waltham Cross', latitude: 51.6851, longitude: -0.0328, indicator: 'Stand B', routes: ['251', '279'] },
    { id: 'C', name: 'Railway Station', locality: 'Waltham Cross', latitude: 51.6858, longitude: -0.0330, indicator: 'Stop R', routes: ['66'] }
  ];
  const stopDiscovery = { nearbyStops: async () => ({ ok: true, data: stops, warnings: [], evidence: stops.map(s => ({ subject: { id: s.id } })), provenance: { providerAdapter: 'prepared-national' } }) };
  const timetableData = { servicesForStops: async selected => {
    serviceCalls.push(selected.map(s => s.id));
    return {
      ok: true,
      warnings: [],
      provenance: { source: 'BODS' },
      data: [
        { id: '251', routeNumber: '251', operator: 'Arriva', origin: 'A', destination: 'B', direction: 'B', principalLocations: ['Waltham Cross'], stopSchedules: { A: weekdays, B: weekdays }, qualifications: [] },
        { id: '279', routeNumber: '279', operator: 'Arriva', origin: 'A', destination: 'C', direction: 'C', principalLocations: ['Edmonton'], stopSchedules: { B: weekdays }, qualifications: [] }
      ]
    };
  }};
  const accessRouting = { matrix: async (_site, selected, mode) => ({
    ok: true,
    warnings: [],
    provenance: { source: 'OSRM' },
    routes: selected.map((s, index) => ({
      status: 'routed',
      distanceMetres: mode === 'walk' ? [120, 140, 130][index] : [150, 160, 155][index],
      durationSeconds: 100 + index * 10
    }))
  })};

  const assessment = createBusAssessment({ stopDiscovery, timetableData, accessRouting });
  const result = await assessment.assess(site, { mode: 'nearest' });
  assert.equal(result.ok, true);
  assert.equal(result.assessmentMode, 'nearest');
  assert.deepEqual(result.stops.map(s => s.id), ['A', 'B']);
  assert.deepEqual(serviceCalls, [['A', 'B']]);
  assert.deepEqual(result.serviceSummaries.map(s => s.routeNumber), ['251', '279']);
  assert.equal(result.nearestGroup.name, 'Bus Station');
});

test('nearest mode returns a partial result when no service is found within 2km', async () => {
  const stop = { id: 'UNSERVED', name: 'Pipers Lane', locality: 'Example', latitude: site.latitude, longitude: site.longitude, routes: [] };
  const assessment = createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [stop], warnings: [], evidence: [], provenance: { source: 'prepared' } }) },
    timetableData: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS', timetableConclusion: 'NO_CURRENT_MATCH' } }) },
    accessRouting: { matrix: async () => ({ ok: true, warnings: [], provenance: { source: 'OSRM' }, routes: [{ status: 'routed', distanceMetres: 100, durationSeconds: 80 }] }) }
  });
  const result = await assessment.assess(site, { mode: 'nearest', radius: 500 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'partial');
  assert.match(result.warnings.join(' '), /Nearest search expanded from 500 m to 2,000 m because no matched scheduled service was established in the initial radius\./);
  assert.equal(result.provenance.stops.selectedRadiusMetres, 500);
  assert.equal(result.provenance.stops.actualDiscoveryRadiusMetres, 2000);
  assert.equal(result.provenance.stops.radiusMetres, 2000);
  assert.equal(result.nearestGroup, null);
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS Alpha.5 Bus assessment - ${name}`);
}
console.log(`${tests.length} Alpha.5 Bus assessment tests passed.`);
