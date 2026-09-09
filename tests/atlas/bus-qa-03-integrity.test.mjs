import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createTflBusStopAdapter } from '../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createTflRequestScheduler } from '../../src/atlas/adapters/tfl-request-scheduler.mjs';
import { createBusAssessment, TFL_SAFE_DETAILED_PAIR_LIMIT } from '../../src/atlas/application/bus-assessment.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const schedule = values => Object.fromEntries(days.map(day => [day, values[day] ?? []]));
const normal = value => String(value ?? '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const directionFamily = service => {
  if (service?.directionFamily) return String(service.directionFamily);
  const explicit = String(service?.source?.directionId ?? '').trim();
  if (/^[01]$/.test(explicit)) return `gtfs:${explicit}`;
  const match = String(service?.id ?? '').match(/:([01]):[0-9a-f]{12}$/i);
  return match ? `gtfs:${match[1]}` : `headsign:${normal(service?.direction || service?.destination || service?.origin)}`;
};
const sourceGroupKey = (service, stopId) => [service?.routeNumber, service?.operator, directionFamily(service), service?.origin, service?.destination, stopId].map(normal).join('|');
const response = body => ({ ok: true, status: 200, headers: new Headers({ 'access-control-allow-origin': '*' }), json: async () => body });
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

let scopeRoutingCalls = 0;
const scopeStop = { id: 'SCOPE-STOP', name: 'Scope stop', routes: ['10'] };
const scopeAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [scopeStop], evidence: [], warnings: [], provenance: {} }) },
  timetableData: { servicesForStops: async () => ({ ok: true, data: [{ id: 'scope-service', routeNumber: '10', operator: 'Scope operator', origin: 'Scope origin', destination: 'Scope terminus', direction: 'Scope terminus', stopSchedules: { 'SCOPE-STOP': schedule({ monday: [420] }) } }], warnings: [], provenance: {} }) },
  accessRouting: { matrix: async (...args) => { scopeRoutingCalls += 1; return routed(...args); } }
});
const scopePreview = await scopeAssessment.inspectScope({ latitude: 51.685, longitude: -0.033 }, { radius: 700 });
assert.equal(scopePreview.ok, true);
assert.equal(scopeRoutingCalls, 0, 'inspectScope performs discovery only and makes no access-routing calls');
const scopeFull = await scopeAssessment.assess({ latitude: 51.685, longitude: -0.033 }, { radius: 700, mode: 'full' });
assert.equal(scopeFull.status, 'complete');
assert.equal(scopeRoutingCalls, 2, 'the real assessment makes exactly one walking and one cycling routing call');

const expandedRadiusCalls = [];
let expandedTimetableCalls = 0;
const expandedStop = { id: 'EXPANDED-STOP', name: 'Expanded stop', latitude: 51.685, longitude: -0.033, routes: ['10'], walkingDistance: 120 };
const expandedAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async (_site, { radius }) => { expandedRadiusCalls.push(Number(radius)); return { ok: true, data: [expandedStop], evidence: [], warnings: [], provenance: { radiusMetres: Number(radius) } }; } },
  timetableData: { servicesForStops: async selected => {
    expandedTimetableCalls += 1;
    return { ok: true, data: expandedTimetableCalls === 1 ? [] : [{ id: 'expanded-service', routeNumber: '10', operator: 'Expanded operator', origin: 'Expanded origin', destination: 'Expanded terminus', direction: 'Expanded terminus', stopSchedules: { [expandedStop.id]: schedule({ monday: [540] }) } }], warnings: [], provenance: {} };
  } },
  accessRouting: { matrix: routed }
});
const expandedResult = await expandedAssessment.assess({ latitude: 51.685, longitude: -0.033 }, { mode: 'nearest', radius: 400 });
assert.deepEqual(expandedRadiusCalls, [400, 2000]);
assert.equal(expandedResult.provenance.stops.selectedRadiusMetres, 400);
assert.equal(expandedResult.provenance.stops.actualDiscoveryRadiusMetres, 2000);
assert.equal(expandedResult.provenance.stops.radiusMetres, 2000);
assert.match(expandedResult.warnings.join(' '), /Nearest search expanded from 400 m to 2,000 m because no matched scheduled service was established in the initial radius\./);
assert.equal(expandedResult.serviceSummaries.length, 1);

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

let mixedNationalStopIds;
const mixedTfLService = { id: 'tfl:279:outbound:pattern', routeNumber: '279', operator: 'TfL', origin: 'TfL Origin', destination: 'TfL Terminus', direction: 'TfL Terminus', timetableSource: 'TfL', stopSchedules: { 'MIX-TFL': schedule({ monday: [420] }) } };
const mixedNationalDuplicate = { id: 'bods-279', routeNumber: '279', operator: 'TfL', origin: 'TfL Origin', destination: 'TfL Terminus', direction: 'TfL Terminus', timetableSource: 'BODS', stopSchedules: { 'MIX-NATIONAL': schedule({ monday: [430] }) } };
const mixedNationalService = { id: 'bods-X', routeNumber: 'X', operator: 'National operator', origin: 'National Origin', destination: 'National Terminus', direction: 'National Terminus', timetableSource: 'BODS', stopSchedules: { 'MIX-NATIONAL': schedule({ monday: [450] }) } };
const mixedAuthority = createAuthoritativeBusTimetableAdapter({
  tflAdapter: { servicesForStop: async ({ lineId, stopPointId }) => ({ ok: true, data: [{ ...mixedTfLService, id: `tfl:${lineId}`, routeNumber: lineId, stopSchedules: { [stopPointId]: schedule({ monday: [420] }) } }], warnings: [], provenance: {} }) },
  nationalAdapter: { servicesForStops: async selected => { mixedNationalStopIds = selected.map(stop => stop.id); return { ok: true, data: [mixedNationalDuplicate, mixedNationalService], warnings: [], provenance: { source: 'BODS' } }; } },
  londonCoverage: () => false
});
const mixedResult = await mixedAuthority.servicesForStops([
  { id: 'MIX-TFL', timetableAuthority: 'TfL', routes: ['279'] },
  { id: 'MIX-NATIONAL', timetableAuthority: 'NaPTAN', routes: ['X'] }
], { site: { latitude: 51.7, longitude: -0.1 } });
assert.deepEqual(mixedNationalStopIds, ['MIX-NATIONAL'], 'mixed outside-London composition requests national evidence for national-only stops');
assert.equal(mixedResult.ok, true);
assert.equal(mixedResult.data.filter(service => service.routeNumber === '279').length, 1, 'a TfL service is not duplicated through the national path');
assert.equal(mixedResult.data.find(service => service.routeNumber === '279').timetableSource, 'TfL');
assert.equal(mixedResult.data.find(service => service.routeNumber === 'X').timetableSource, 'BODS');

let dualNationalStopIds;
const dualNationalService = { id: 'bods-dual-10', routeNumber: '10', operator: 'National operator', origin: 'Dual Origin', destination: 'Dual Terminus', direction: 'Dual Terminus', timetableSource: 'BODS', source: { provider: 'BODS' }, stopSchedules: { 'DUAL-STOP': schedule({ monday: [510] }) } };
const dualAuthority = createAuthoritativeBusTimetableAdapter({
  tflAdapter: { servicesForStop: async () => ({ ok: false, code: 'offline', warnings: [], provenance: {} }) },
  nationalAdapter: { servicesForStops: async selected => { dualNationalStopIds = selected.map(stop => stop.id); return { ok: true, data: [dualNationalService], warnings: [], provenance: { source: 'BODS' } }; } },
  londonCoverage: () => false
});
const dualResult = await dualAuthority.servicesForStops([{ id: 'DUAL-STOP', timetableAuthority: 'TfL', timetableAuthorities: ['NaPTAN', 'TfL'], routes: ['10'] }], { site: { latitude: 51.7, longitude: -0.1 } });
assert.deepEqual(dualNationalStopIds, ['DUAL-STOP'], 'dual-authority physical stops remain in the national evidence scope');
assert.equal(dualResult.ok, true);
assert.equal(dualResult.data[0].timetableSource, 'BODS fallback after TfL failure');
assert.equal(dualResult.data[0].source.provider, 'BODS');

let sharedNow = 0;
const sharedSleeps = [];
const sharedScheduler = createTflRequestScheduler({ now: () => sharedNow, sleep: async milliseconds => { sharedSleeps.push(milliseconds); sharedNow += milliseconds; } });
const sharedSite = confirmSite(createSite({ suppliedAddress: 'Scheduler fixture', displayAddress: 'Scheduler fixture', latitude: 51.4184213, longitude: -0.0821281, geocodingSource: 'Fixture', geocodingSourceIdentifier: 'fixture/scheduler', geocodingSourceEndpoint: 'https://fixture.test', retrievedAt: '2026-08-24T10:00:00Z' }));
const sharedStorage = createMemoryStorage();
const sharedCache = createJsonCache({ storage: sharedStorage, namespace: 'qa03-shared-tfl' });
const sharedStopResponse = { stopPoints: [{ id: 'SHARED-STOP', naptanId: 'SHARED-STOP', commonName: 'Shared scheduler stop', lat: sharedSite.latitude, lon: sharedSite.longitude, lines: [{ name: '322' }] }] };
const sharedRouteMetadata = [{ id: '322', routeSections: [{ id: 'route-322', direction: 'outbound', originationName: 'Shared Origin', destinationName: 'Shared Terminus' }] }];
const sharedTimetable = { lineId: '322', direction: 'outbound', timetable: { routes: [{ stationIntervals: [{ id: 'shared-pattern', intervals: [{ stopId: 'SHARED-STOP', timeToArrival: 0 }, { stopId: 'SHARED-END', timeToArrival: 10 }], schedules: [{ name: 'Monday', knownJourneys: [{ departureTime: { hour: 7, minute: 0 }, intervalId: 'shared-pattern' }] }] }] }] }, stations: [{ id: 'SHARED-STOP', name: 'Shared scheduler stop' }, { id: 'SHARED-END', name: 'Shared scheduler terminus' }] };
const sharedFetch = async url => {
  const value = String(url);
  if (value.includes('/StopPoint')) return response(sharedStopResponse);
  if (value.includes('/Route')) return response(sharedRouteMetadata);
  return response(sharedTimetable);
};
const sharedStopAdapter = createTflBusStopAdapter({ cache: sharedCache, fetchImpl: sharedFetch, requestScheduler: sharedScheduler });
const sharedTimetableAdapter = createTflBusTimetableAdapter({ cache: sharedCache, fetchImpl: sharedFetch, requestScheduler: sharedScheduler });
await sharedStopAdapter.nearbyStops(sharedSite);
await sharedTimetableAdapter.routeMetadataForLines(['322']);
for (let index = 0; index < 43; index += 1) await sharedTimetableAdapter.servicesForStop({ lineId: '322', stopPointId: `SHARED-${String(index).padStart(3, '0')}` });
assert.equal(sharedScheduler.snapshot().requestsInWindow, 45, 'StopPoint, metadata and 43 timetable calls share one 45-request window');
assert.equal(sharedSleeps.length, 0);
await sharedTimetableAdapter.servicesForStop({ lineId: '322', stopPointId: 'SHARED-043' });
assert.equal(sharedSleeps.length, 1, 'the next uncached shared TfL request waits for the rolling window');
assert.ok(sharedSleeps[0] >= 60000);
assert.equal(sharedScheduler.snapshot().requestsInWindow, 1);
assert.equal(TFL_SAFE_DETAILED_PAIR_LIMIT, 43, 'dense-scope threshold reserves StopPoint discovery and route metadata budget');

const preparedPath = new URL('../../atlas/data/bus/services/49000-london.json.gz', import.meta.url);
const prepared = JSON.parse(zlib.gunzipSync(fs.readFileSync(preparedPath)));
const actualStopId = '490003378G';
const londonRows = prepared.services.filter(service => ['279', '217', 'N279'].includes(String(service.routeNumber)) && service.stopSchedules?.[actualStopId]);
assert.ok(londonRows.length >= 7, 'prepared London source contains the actual 279 / 217 / N279 pattern records');
const londonSummaries = buildServiceSummaries([{ id: actualStopId, name: 'Waltham Cross Bus Station', indicator: 'G' }], londonRows);
const expectedByGroup = new Map();
for (const service of londonRows) {
  const key = sourceGroupKey(service, actualStopId);
  if (!expectedByGroup.has(key)) expectedByGroup.set(key, Object.fromEntries(days.map(day => [day, new Set()])));
  const expected = expectedByGroup.get(key);
  for (const day of days) for (const departure of service.stopSchedules[actualStopId]?.[day] ?? []) expected[day].add(Number(departure));
}
const relevantSummaries = londonSummaries.filter(summary => ['279', '217', 'N279'].includes(String(summary.routeNumber)));
assert.equal(relevantSummaries.length, expectedByGroup.size, 'planner summary count matches the source-derived 279 / 217 / N279 service-group count');
for (const [key, expected] of expectedByGroup) {
  const summary = relevantSummaries.find(candidate => sourceGroupKey(candidate, actualStopId) === key);
  assert.ok(summary, `planner summary exists for source group ${key}`);
  for (const day of days) {
    const expectedDepartures = [...expected[day]].sort((left, right) => left - right);
    assert.deepEqual(summary.departuresByDay[day], expectedDepartures, `${summary.routeNumber} ${day} departures equal the prepared source set`);
    const period = summary.operatingPeriods[day];
    if (expectedDepartures.length) {
      assert.equal(period.firstMinute, expectedDepartures[0], `${summary.routeNumber} ${day} operating period starts at the source minimum`);
      assert.equal(period.lastMinute, expectedDepartures.at(-1), `${summary.routeNumber} ${day} operating period ends at the source maximum`);
    } else assert.equal(period, null, `${summary.routeNumber} ${day} has no fabricated operating period`);
  }
}
const sourceCounts = Object.fromEntries([...expectedByGroup].map(([key, expected]) => [key, Object.fromEntries(days.map(day => [day, expected[day].size]))]));
console.log(`QA-03 source-derived groups=${expectedByGroup.size}; planner groups=${relevantSummaries.length}; current source counts=${JSON.stringify(sourceCounts)}`);
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
