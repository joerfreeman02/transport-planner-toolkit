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

test('nearest mode retains the nearest group after confirmed NO_CURRENT_MATCH', async () => {
  const serviceCalls = [];
  const stops = [
    { id: 'NEAR', name: 'Nearest Stop', locality: 'Example', latitude: 51.6850, longitude: -0.0330, routes: [] },
    { id: 'FAR', name: 'Farther Stop', locality: 'Example', latitude: 51.6860, longitude: -0.0330, routes: ['99'] }
  ];
  const stopDiscovery = { nearbyStops: async () => ({ ok: true, data: stops, warnings: [], evidence: [], provenance: { providerAdapter: 'prepared-national' } }) };
  const timetableData = { servicesForStops: async selected => {
    serviceCalls.push(selected.map(item => item.id));
    if (selected.some(item => item.id === 'NEAR')) return { ok: true, data: [], warnings: [], provenance: { source: 'BODS', timetableConclusion: 'NO_CURRENT_MATCH' } };
    return { ok: true, data: [{ id: '99', routeNumber: '99', operator: 'Example', origin: 'A', destination: 'B', direction: 'B', principalLocations: [], stopSchedules: { FAR: weekdays }, qualifications: [] }], warnings: [], provenance: { source: 'BODS', timetableConclusion: 'MATCHED' } };
  } };
  const accessRouting = { matrix: async (_site, selected, mode) => ({
    ok: true,
    warnings: [],
    provenance: { source: 'OSRM' },
    routes: selected.map(item => ({ status: 'routed', distanceMetres: item.id === 'NEAR' ? (mode === 'walk' ? 50 : 70) : (mode === 'walk' ? 190 : 220), durationSeconds: 60 }))
  }) };
  const result = await createBusAssessment({ stopDiscovery, timetableData, accessRouting }).assess(site, { mode: 'nearest' });
  assert.equal(result.ok, true);
  assert.deepEqual(serviceCalls, [['NEAR']], 'The approved Product Owner rule retains the closest walking group after confirmed NO_CURRENT_MATCH.');
  assert.equal(result.nearestGroup.anchorStopId, 'NEAR');
  assert.equal(result.nearestGroup.conclusion, 'NO_CURRENT_MATCH');
  assert.deepEqual(result.stops.map(item => item.id), ['NEAR']);
  assert.equal(result.serviceSummaries.length, 0);
  assert.match(result.wording, /No current timetable match was established/);
  assert.match(result.wording, /does not establish that no public bus service operates/);
});

test('nearest mode does not substitute a farther group when nearest timetable evidence is unresolved', async () => {
  const serviceCalls = [];
  const stops = [
    { id: 'NEAR', name: 'Nearest Stop', locality: 'Example', latitude: 51.6850, longitude: -0.0330, routes: ['10'] },
    { id: 'FAR', name: 'Farther Stop', locality: 'Example', latitude: 51.6860, longitude: -0.0330, routes: ['99'] }
  ];
  const assessment = createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: stops, warnings: [], evidence: [], provenance: { providerAdapter: 'prepared-national' } }) },
    timetableData: { servicesForStops: async selected => {
      serviceCalls.push(selected.map(item => item.id));
      return { ok: true, data: [], warnings: [], provenance: { source: 'BODS', timetableConclusion: 'UNRESOLVED', failedRequests: 1 } };
    } },
    accessRouting: { matrix: async (_site, selected) => ({ ok: true, warnings: [], provenance: { source: 'OSRM' }, routes: selected.map(item => ({ status: 'routed', distanceMetres: item.id === 'NEAR' ? 50 : 190, durationSeconds: 60 })) }) }
  });
  const result = await assessment.assess(site, { mode: 'nearest' });
  assert.deepEqual(serviceCalls, [['NEAR']]);
  assert.equal(result.nearestGroup.anchorStopId, 'NEAR');
  assert.equal(result.nearestGroup.conclusion, 'UNRESOLVED');
  assert.deepEqual(result.stops.map(item => item.id), ['NEAR']);
  assert.match(result.wording, /evidence .* remained unresolved/);
});

test('explicit no-match with incomplete source coverage is kept unresolved and never becomes a zero-service claim', async () => {
  const stop = { id: 'NEAR', name: 'Nearest Stop', locality: 'Example', latitude: 51.6850, longitude: -0.0330, routes: ['10'] };
  const assessment = createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [stop], warnings: [], evidence: [], provenance: { providerAdapter: 'prepared-national' } }) },
    timetableData: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS', timetableConclusion: 'NO_CURRENT_MATCH', nationalSourceAvailable: false } }) },
    accessRouting: { matrix: async (_site, selected) => ({ ok: true, warnings: [], provenance: { source: 'OSRM' }, routes: selected.map(() => ({ status: 'routed', distanceMetres: 50, durationSeconds: 60 })) }) }
  });
  const result = await assessment.assess(site, { mode: 'nearest' });
  assert.equal(result.nearestGroup.conclusion, 'UNRESOLVED');
  assert.equal(result.status, 'partial');
  assert.match(result.wording, /evidence .* remained unresolved/);
  assert.doesNotMatch(result.wording, /No current timetable match was established/);
});

test('nearest mode retains a matched closest group and leaves farther groups to full mode', async () => {
  const calls = [];
  const stops = [
    { id: 'NEAR', name: 'Nearest Stop', locality: 'Example', latitude: 51.6850, longitude: -0.0330, routes: ['10'] },
    { id: 'FAR', name: 'Farther Stop', locality: 'Example', latitude: 51.6860, longitude: -0.0330, routes: ['99'] }
  ];
  const assessment = createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: stops, warnings: [], evidence: [], provenance: { providerAdapter: 'prepared-national' } }) },
    timetableData: { servicesForStops: async selected => {
      calls.push(selected.map(item => item.id));
      return { ok: true, warnings: [], provenance: { source: 'BODS', timetableConclusion: 'MATCHED' }, data: [{ id: '10', routeNumber: '10', operator: 'Example', origin: 'A', destination: 'B', principalLocations: [], stopSchedules: { NEAR: weekdays }, qualifications: [] }] };
    } },
    accessRouting: { matrix: async (_site, selected) => ({ ok: true, warnings: [], provenance: { source: 'OSRM' }, routes: selected.map(item => ({ status: 'routed', distanceMetres: item.id === 'NEAR' ? 50 : 190, durationSeconds: 60 })) }) }
  });
  const nearest = await assessment.assess(site, { mode: 'nearest' });
  assert.deepEqual(calls, [['NEAR']]);
  assert.equal(nearest.nearestGroup.anchorStopId, 'NEAR');
  assert.deepEqual(nearest.stops.map(item => item.id), ['NEAR']);
  calls.length = 0;
  const full = await assessment.assess(site, { mode: 'full' });
  assert.deepEqual(calls, [['NEAR', 'FAR']]);
  assert.equal(full.nearestGroup, null);
  assert.deepEqual(full.stops.map(item => item.id), ['NEAR', 'FAR']);
});

test('nearest mode expands only when no valid routed nearest group was identified within the initial radius', async () => {
  const stop = { id: 'UNSERVED', name: 'Pipers Lane', locality: 'Example', latitude: site.latitude, longitude: site.longitude, routes: [] };
  const assessment = createBusAssessment({
    stopDiscovery: { nearbyStops: async (_site, { radius }) => ({ ok: true, data: radius === 500 ? [stop] : [{ ...stop, id: 'ROUTED', walking: undefined }], warnings: [], evidence: [], provenance: { source: 'prepared' } }) },
    timetableData: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { source: 'BODS', timetableConclusion: 'NO_CURRENT_MATCH' } }) },
    accessRouting: { matrix: async (_site, selected) => ({ ok: true, warnings: [], provenance: { source: 'OSRM' }, routes: selected.map(item => ({ status: item.id === 'UNSERVED' ? 'unavailable' : 'routed', distanceMetres: item.id === 'UNSERVED' ? null : 100, durationSeconds: 80 })) }) }
  });
  const result = await assessment.assess(site, { mode: 'nearest', radius: 500 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'partial');
  assert.match(result.warnings.join(' '), /Nearest search expanded from 500 m to 2,000 m because no stop group with a valid routed walking distance was identified in the initial radius\./);
  assert.equal(result.provenance.stops.selectedRadiusMetres, 500);
  assert.equal(result.provenance.stops.actualDiscoveryRadiusMetres, 2000);
  assert.equal(result.provenance.stops.radiusMetres, 2000);
  assert.equal(result.nearestGroup.anchorStopId, 'ROUTED');
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS Alpha.5 Bus assessment - ${name}`);
}
console.log(`${tests.length} Alpha.5 Bus assessment tests passed.`);
