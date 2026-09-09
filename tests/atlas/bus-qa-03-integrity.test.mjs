import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createTflRequestScheduler } from '../../src/atlas/adapters/tfl-request-scheduler.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const schedule = values => Object.fromEntries(days.map(day => [day, values[day] ?? []]));
const routed = (_site, stops, mode) => ({
  ok: true,
  routes: stops.map((stop, index) => ({ status: 'routed', distanceMetres: mode === 'walk' ? Number(stop.walkingDistance ?? 100 + index) : Number(stop.cyclingDistance ?? 150 + index), durationSeconds: 60 + index })),
  warnings: [],
  provenance: { source: 'deterministic QA routing fixture' }
});

const denseStops = [
  { id: '490D-A', name: 'Waltham Cross Bus Station', locality: 'Waltham Cross', latitude: 51.6850, longitude: -0.0330, walkingDistance: 90, routes: ['217', '279', 'N279'] },
  { id: '490D-B', name: 'Waltham Cross Bus Station', locality: 'Waltham Cross', latitude: 51.6851, longitude: -0.0329, walkingDistance: 105, routes: ['217', '279', 'N279'] },
  { id: '490D-C', name: 'Waltham Cross Bus Station', locality: 'Waltham Cross', latitude: 51.6852, longitude: -0.0328, walkingDistance: 120, routes: ['217', '279'] },
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `490D-${String(index + 1).padStart(2, '0')}`,
    name: `Dense assessment stop ${index + 1}`,
    locality: 'Waltham Cross',
    latitude: 51.686 + index * 0.001,
    longitude: -0.033,
    walkingDistance: 300 + index,
    routes: ['217', '279']
  }))
];

let nearestCalls = [];
const nearestAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: denseStops, evidence: [], warnings: [], provenance: { source: 'prepared London StopPoint data' } }) },
  timetableData: { servicesForStops: async selected => {
    nearestCalls.push(selected.map(stop => stop.id));
    return {
      ok: true,
      data: selected.flatMap(stop => (stop.routes ?? []).slice(0, 1).map(route => ({ id: `tfl:${route}:${stop.id}`, routeNumber: route, operator: 'TfL', origin: 'Bus Station', destination: 'Manor House Station', direction: 'Manor House', stopSchedules: { [stop.id]: schedule({ monday: [420, 450], saturday: [480] }) } }))),
      warnings: [],
      provenance: { source: 'TfL scheduled timetable authority', processedRequests: selected.length, unprocessedRequests: 0, unresolvedRequests: 0 }
    };
  } },
  accessRouting: { matrix: routed }
});
const nearestResult = await nearestAssessment.assess({ latitude: 51.685, longitude: -0.033 }, { mode: 'nearest' });
assert.equal(nearestResult.status, 'complete');
assert.ok(nearestResult.scope.pairCount > 20, 'dense discovery contains more than twenty route × StopPoint pairs');
assert.deepEqual(nearestCalls, [['490D-A', '490D-B', '490D-C']], 'nearest mode selects the logical stop group before requesting timetable evidence');
assert.deepEqual(nearestResult.stops.map(stop => stop.id), ['490D-A', '490D-B', '490D-C']);

const fullStops = Array.from({ length: 21 }, (_, index) => ({ id: `FULL-${index}`, name: `Full assessment stop ${index}`, routes: [`R${index}`] }));
let fullCall;
const fullAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: fullStops, evidence: [], warnings: [], provenance: {} }) },
  timetableData: { servicesForStops: async selected => {
    fullCall = selected;
    return { ok: true, data: selected.map(stop => ({ id: stop.id, routeNumber: stop.routes[0], operator: 'Prepared operator', origin: 'Origin', destination: 'Destination', direction: 'Destination', stopSchedules: { [stop.id]: schedule({ monday: [420] }) } })), warnings: [], provenance: { processedRequests: 21, unprocessedRequests: 0, unresolvedRequests: 0 } };
  } },
  accessRouting: { matrix: routed }
});
const fullResult = await fullAssessment.assess({ latitude: 51.685, longitude: -0.033 }, { mode: 'full' });
assert.equal(fullResult.status, 'complete');
assert.equal(fullCall.length, 21, 'full assessment processes all 21 selected stops rather than stopping after the first successful stage');
assert.equal(fullResult.provenance.timetables.unprocessedRequests, 0);

let clock = 0;
const sleeps = [];
const scheduler = createTflRequestScheduler({ now: () => clock, sleep: async milliseconds => { sleeps.push(milliseconds); clock += milliseconds; } });
for (let index = 0; index < 46; index += 1) await scheduler.schedule('timetable', async () => ({ ok: true }));
assert.equal(sleeps.length, 1);
assert.ok(sleeps[0] >= 60000);
assert.equal(scheduler.snapshot().requestsInWindow, 1, 'the rolling window never retains more than the 45-request limit');

const partialAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [{ id: 'PARTIAL', name: 'Partial stop', routes: ['10'] }], evidence: [], warnings: [], provenance: {} }) },
  timetableData: { servicesForStops: async () => ({ ok: true, data: [{ id: 'partial', routeNumber: '10', operator: 'Example', origin: 'A', destination: 'B', direction: 'B', stopSchedules: { PARTIAL: schedule({ monday: [420] }) } }], warnings: [], provenance: { processedRequests: 1, unprocessedRequests: 1, unresolvedRequests: 0 } }) },
  accessRouting: { matrix: routed }
});
const partialResult = await partialAssessment.assess({ latitude: 51.685, longitude: -0.033 });
assert.equal(partialResult.status, 'partial', 'unprocessed timetable scope cannot be reported as complete');

const tndsStop = { id: '021013518', routes: ['231'] };
const tndsService = { id: 'tnds:231:pattern-1', routeNumber: '231', operator: 'TNDS operator', origin: 'Pipers Lane', destination: 'Bedford', direction: 'Bedford', source: { type: 'TNDS', patternVariantId: 'pattern-1' }, stopSchedules: { [tndsStop.id]: schedule({ monday: [510] }) } };
const tndsFallback = createAuthoritativeBusTimetableAdapter({
  tflAdapter: { servicesForStop: async () => ({ ok: false, code: 'offline', warnings: [], provenance: {} }) },
  nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [tndsService], warnings: [], provenance: { source: 'BODS; Traveline National Dataset' } }) },
  londonSupplementAdapter: { servicesForStops: async () => ({ ok: true, data: [tndsService], warnings: [], provenance: { source: 'BODS; Traveline National Dataset' } }) },
  londonCoverage: () => true
});
const tndsResult = await tndsFallback.servicesForStops([tndsStop], { site: { latitude: 51.5, longitude: -0.1 } });
assert.equal(tndsResult.ok, true);
assert.equal(tndsResult.data[0].timetableSource, 'TNDS fallback after TfL failure');
assert.equal(tndsResult.data[0].source.provider, 'TNDS');

const preparedPath = new URL('../../atlas/data/bus/services/49000-london.json.gz', import.meta.url);
const prepared = JSON.parse(zlib.gunzipSync(fs.readFileSync(preparedPath)));
const actualStopId = '490003378G';
const londonRows = prepared.services.filter(service => ['279', '217', 'N279'].includes(String(service.routeNumber)) && service.stopSchedules?.[actualStopId]);
assert.ok(londonRows.length >= 7, 'prepared London source contains the actual 279 / 217 / N279 pattern records');
const londonSummaries = buildServiceSummaries([{ id: actualStopId, name: 'Waltham Cross Bus Station', indicator: 'G' }], londonRows);
assert.ok(londonSummaries.some(summary => summary.routeNumber === '217' && summary.departuresByDay.monday.some(value => value >= 1440)), 'actual 217 prepared evidence retains next-day chronology');
assert.ok(londonSummaries.some(summary => summary.routeNumber === 'N279'), 'N279 remains a distinct service family from daytime 279');
assert.ok(londonSummaries.filter(summary => summary.routeNumber === '279').length >= 2, 'actual 279 prepared data retains its distinct timetable termini/pattern rows');

const chronologyRow = prepared.services.find(service => Object.values(service.stopSchedules ?? {}).some(stopSchedule => Object.values(stopSchedule).some(values => values.some(value => values.includes(value + 1440)))));
assert.ok(chronologyRow, 'prepared London source contains a same-day next-day chronology pair');
const chronologyStopId = Object.keys(chronologyRow.stopSchedules).find(stopId => Object.values(chronologyRow.stopSchedules[stopId]).some(values => values.some(value => values.includes(value + 1440))));
const chronologyDay = days.find(day => (chronologyRow.stopSchedules[chronologyStopId][day] ?? []).some(value => chronologyRow.stopSchedules[chronologyStopId][day].includes(value + 1440)));
const chronologyValues = chronologyRow.stopSchedules[chronologyStopId][chronologyDay];
const chronologySummary = buildServiceSummaries([{ id: chronologyStopId }], [chronologyRow])[0];
assert.ok(chronologySummary.departuresByDay[chronologyDay].includes(chronologyValues[0] + 1440), 'normalisation preserves legitimate next-day values instead of modulo-deduplicating them');

const sameDirectionDifferentTermini = buildServiceSummaries([{ id: 'GTFS-STOP' }], [
  { id: 'gtfs-a', routeNumber: '10', operator: 'GTFS operator', origin: 'Origin', destination: 'Terminus A', direction: '1', source: { directionId: '1' }, stopSchedules: { 'GTFS-STOP': schedule({ monday: [420] }) } },
  { id: 'gtfs-b', routeNumber: '10', operator: 'GTFS operator', origin: 'Origin', destination: 'Terminus B', direction: '1', source: { directionId: '1' }, stopSchedules: { 'GTFS-STOP': schedule({ monday: [450] }) } }
]);
assert.equal(sameDirectionDifferentTermini.length, 2, 'GTFS records sharing a directionId remain separate when their termini differ');

const multiStopSummaries = buildServiceSummaries([
  { id: 'MULTI-A', name: 'Bus Station', indicator: 'A', walking: { status: 'routed', distanceMetres: 100 } },
  { id: 'MULTI-B', name: 'Bus Station', indicator: 'B', walking: { status: 'routed', distanceMetres: 130 } }
], [
  { id: 'prepared:10:pattern-1', routeNumber: '10', operator: 'Prepared operator', origin: 'Origin', destination: 'Destination', direction: 'Destination', source: { provider: 'BODS', patternVariantId: 'pattern-1' }, stopSchedules: { 'MULTI-A': schedule({ monday: [420, 450] }) } },
  { id: 'prepared:10:pattern-1', routeNumber: '10', operator: 'Prepared operator', origin: 'Origin', destination: 'Destination', direction: 'Destination', source: { provider: 'BODS', patternVariantId: 'pattern-1' }, stopSchedules: { 'MULTI-B': schedule({ monday: [600, 630] }) } }
]);
assert.equal(multiStopSummaries.length, 1, 'the same prepared service across two selected stops consolidates to one row');
assert.deepEqual(multiStopSummaries[0].assessedStops, ['MULTI-A', 'MULTI-B']);
assert.deepEqual(multiStopSummaries[0].departuresByDay.monday, [420, 450], 'multi-stop consolidation uses the deterministic representative stop without summing departures');

console.log('PASS BUS-QA-03 production-shaped scope, rolling request budget, TNDS fallback, London 279/217/N279 chronology and direction/terminus integrity.');
