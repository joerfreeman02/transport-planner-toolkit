import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const response = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const emptyWeek = () => Object.fromEntries(DAYS.map(day => [day, []]));
const schedule = monday => ({ ...emptyWeek(), monday });
const routeNumbers = ['217', '317', '327'];
const stopA = {
  id: '210021703420', name: 'Bus Station', indicator: 'Stop A', routes: routeNumbers,
  timetableAuthority: 'NaPTAN', timetableAuthorities: ['NaPTAN'],
  routeAuthorities: Object.fromEntries(routeNumbers.map(route => [route, ['BODS']])),
  walking: { status: 'routed', distanceMetres: 10 }, distanceMetres: 10
};
const returnedTfLStop = {
  id: '490003378G', name: 'Bullsmoor Lane', routes: routeNumbers,
  timetableAuthority: 'TfL', timetableAuthorities: ['TfL'],
  routeAuthorities: Object.fromEntries(routeNumbers.map(route => [route, ['TfL']])),
  walking: { status: 'routed', distanceMetres: 100 }, distanceMetres: 100
};
const diagnostic = JSON.parse(await readFile(new URL('./fixtures/tfl-waltham-stop-a-operating-period-1a.json', import.meta.url), 'utf8'));
const tflFixture = createTflBusTimetableAdapter({
  cache: createJsonCache({ storage: createMemoryStorage(), namespace: 'tfl-operating-period-1b-composition' }),
  fetchImpl: async url => {
    const value = String(url);
    if (value.includes('/Route')) return response([]);
    const stopPointId = decodeURIComponent(value.match(/\/Timetable\/([^/?]+)/)?.[1] ?? '');
    if (stopPointId !== stopA.id) return response({ lineId: 'no-current', stations: [], timetable: { departureStopId: stopPointId, routes: [] } });
    const line = decodeURIComponent(value.match(/\/Line\/([^/]+)\/Timetable/)?.[1] ?? '');
    const request = diagnostic.requests.find(item => item.lineId.toLowerCase() === line.toLowerCase());
    if (!request) return new Response('not found', { status: 404 });
    const body = structuredClone(request.response);
    const stations = body.timetable.routes.flatMap(route => route.stationIntervals.flatMap(pattern => pattern.intervals.map(interval => ({ id: interval.stopId, name: interval.stopId }))));
    body.stations = stations;
    body.stops = stations;
    return response(body);
  }
});
const tflAdapter = {
  servicesForStop: args => tflFixture.servicesForStop(args),
  routeMetadataForLines: args => tflFixture.routeMetadataForLines(args)
};
const bodsByRoute = {
  '217': [5, 25, 290, 1465],
  '317': [5, 35, 305, 1415],
  '327': [420, 1140]
};
const nationalAdapter = {
  servicesForStops: async () => ({
    ok: true,
    data: routeNumbers.map(route => ({
      id: `bods-${route}`, routeNumber: route, operator: 'Supplementary operator', origin: 'Waltham Cross', destination: 'TfL terminus', direction: 'outbound',
      timetableSource: 'BODS', provider: 'BODS', source: { provider: 'BODS', routeId: `route-${route}` },
      stopSchedules: { [stopA.id]: schedule(bodsByRoute[route]) }
    })),
    warnings: [],
    provenance: { source: 'BODS', timetableConclusion: 'MATCHED' }
  })
};
const authority = createAuthoritativeBusTimetableAdapter({ tflAdapter, nationalAdapter });
const composed = await authority.servicesForStops([stopA, returnedTfLStop], { site: { latitude: 51.6857829, longitude: -0.0330001 } });
assert.equal(composed.ok, true);
assert.deepEqual(composed.provenance.crossBoundaryTfLRoutes, routeNumbers);
assert.ok(composed.provenance.tflTimetableRequestIdentities.includes('217|210021703420'), 'cross-boundary TfL route overlay requests the actual planner basis StopPoint');
assert.ok(composed.provenance.tflTimetableRequestIdentities.includes('317|210021703420'));
assert.ok(composed.provenance.tflTimetableRequestIdentities.includes('327|210021703420'));

const stopAServices = composed.data.filter(service => service.stopSchedules?.[stopA.id]);
assert.equal(stopAServices.length, 3);
assert.ok(stopAServices.every(service => service.provider === 'TfL' && service.primaryAuthority === 'TfL' && service.source?.primaryAuthority === 'TfL'));
assert.ok(stopAServices.every(service => service.timetableSource === 'TfL + BODS supplementary'));

const summaries = buildServiceSummaries([stopA, returnedTfLStop], composed.data);
const planner = buildPlannerBusServiceSummaries(summaries, [stopA, returnedTfLStop]);
const row = route => planner.find(service => service.routeNumber === route && service.frequencyBasisStopId === stopA.id);
const row217 = row('217');
const row317 = row('317');
const row327 = row('327');
assert.ok(row217 && row317 && row327, 'the actual composition produces planner rows at Stop A');
assert.deepEqual([row217.operatingPeriods.monday.firstMinute, row217.operatingPeriods.monday.lastMinute], [240, 1499]);
assert.deepEqual([row317.operatingPeriods.monday.firstMinute, row317.operatingPeriods.monday.lastMinute], [300, 1499]);
assert.deepEqual([row327.operatingPeriods.monday.firstMinute, row327.operatingPeriods.monday.lastMinute], [420, 1199]);
assert.deepEqual(row217.departuresByDay.monday.slice(0, 2), [5, 25], 'supplementary BODS departures remain available in the planner audit population');
assert.deepEqual(row317.departuresByDay.monday.slice(0, 2), [5, 35]);
assert.equal(summaries.find(service => service.routeNumber === '217' && service.frequencyBasisStopId === stopA.id).operatingPeriodAuthority.provider, 'TfL');
assert.equal(summaries.find(service => service.routeNumber === '317' && service.frequencyBasisStopId === stopA.id).operatingPeriodAuthority.provider, 'TfL');
assert.equal(summaries.find(service => service.routeNumber === '327' && service.frequencyBasisStopId === stopA.id).operatingPeriodAuthority.provider, 'TfL');
assert.ok(row217.operatingPeriodReviewWarnings.some(warning => /retained for audit/.test(warning)));
assert.ok(row317.operatingPeriodReviewWarnings.some(warning => /retained for audit/.test(warning)));
assert.match(row217.operatingPeriodLines[0], /04:00–00:59/);
assert.match(row317.operatingPeriodLines[0], /05:00–00:59/);
assert.match(row327.operatingPeriodLines[0], /07:00–19:59/);
const wordRows = buildBusWordTables({ ok: true, stops: [stopA, returnedTfLStop], plannerServiceSummaries: planner, serviceSummaries: summaries })[1].rows.filter(row => Array.isArray(row));
for (const [route, row] of [['217', row217], ['317', row317], ['327', row327]]) {
  const wordRow = wordRows.find(candidate => candidate[0] === route && candidate[6] === row.operatingPeriodLines.join('\n'));
  assert.ok(wordRow, `${route} Word output consumes the corrected planner operating period`);
}

console.log('PASS BUS-TFL-PERIOD-1B production-fidelity authority composition, Stop A overlay, primary identity and planner regressions.');
