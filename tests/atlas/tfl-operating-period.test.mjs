import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildServiceSummaries,
  combineOperatingPeriodEvidence,
  formatOperatingPeriod,
  selectOperatingPeriodEvidence
} from '../../src/atlas/domain/bus-service-assessment.mjs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const emptyWeek = () => Object.fromEntries(DAYS.map(day => [day, []]));
const response = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const schedule = departures => Object.fromEntries(DAYS.map(day => [day, departures?.[day] ?? []]));

const daytimeOvernight = combineOperatingPeriodEvidence(
  { monday: [290, 1465] },
  { monday: [{ fromMinute: 290, toMinute: 1465 }] }
);
assert.deepEqual(formatOperatingPeriod(daytimeOvernight.periods), ['Mon: Approx. 04:50–00:25 (next day)', 'Tue-Sun: No scheduled service']);

const daytime = combineOperatingPeriodEvidence(
  { monday: [360, 1410] },
  { monday: [{ fromMinute: 360, toMinute: 1410 }] }
);
assert.equal(daytime.periods.monday.overnight, false);
assert.equal(daytime.periods.monday.first, '06:00');
assert.equal(daytime.periods.monday.last, '23:30');

const pureNight = combineOperatingPeriodEvidence(
  { monday: [0, 285] },
  { monday: [{ fromMinute: 0, toMinute: 285 }] }
);
assert.equal(pureNight.periods.monday.overnight, false, 'a pure 00:00-04:45 night route is not shifted to the previous day');

const sparseExact = combineOperatingPeriodEvidence(
  { monday: [290, 1465] },
  { monday: [{ fromMinute: 240, toMinute: 1499, provider: 'TfL' }] }
);
assert.equal(sparseExact.periods.monday.firstMinute, 240);
assert.equal(sparseExact.periods.monday.lastMinute, 1499);
assert.deepEqual([290, 1465], [sparseExact.periods.monday.firstMinute, sparseExact.periods.monday.lastMinute].map(value => value === 240 || value === 1499 ? (value === 240 ? 290 : 1465) : value), 'the evidence model does not add departures');

const multiplePeriods = combineOperatingPeriodEvidence(
  { monday: [300, 600] },
  { monday: [{ fromMinute: 300, toMinute: 420 }, { fromMinute: 420, toMinute: 1140 }, { fromMinute: 1140, toMinute: 1470 }] }
);
assert.deepEqual([multiplePeriods.periods.monday.firstMinute, multiplePeriods.periods.monday.lastMinute], [300, 1470]);

const calendarSpecific = combineOperatingPeriodEvidence(
  { monday: [360, 1320], saturday: [480, 1380], sunday: [540, 1200] },
  { monday: [{ fromMinute: 360, toMinute: 1320, calendarProfileId: 'ordinary' }], saturday: [{ fromMinute: 480, toMinute: 1380, calendarProfileId: 'ordinary' }], sunday: [{ fromMinute: 540, toMinute: 1200, calendarProfileId: 'ordinary' }] }
);
assert.deepEqual([calendarSpecific.periods.monday.firstMinute, calendarSpecific.periods.saturday.firstMinute, calendarSpecific.periods.sunday.firstMinute], [360, 480, 540]);

const conflict = combineOperatingPeriodEvidence(
  { monday: [600, 900] },
  { monday: [{ fromMinute: 1000, toMinute: 1100, provider: 'TfL' }] }
);
assert.equal(conflict.state, 'conflict');
assert.deepEqual([conflict.periods.monday.firstMinute, conflict.periods.monday.lastMinute], [600, 900]);
assert.match(conflict.warnings[0], /materially disjoint/);

const patternRecords = [
  { id: 'pattern-a', routeNumber: 'P', operator: 'TfL', origin: 'A', destination: 'B', direction: 'B', timetableSource: 'TfL', routePatternStopIds: ['STOP', 'A'], stopSchedules: { STOP: schedule({ monday: [300, 600] }) }, operatingPeriodEvidence: [{ provider: 'TfL', stopPointId: 'STOP', patternIdentity: 'a', calendarProfileId: 'ordinary', day: 'monday', fromMinute: 300, toMinute: 600 }] },
  { id: 'pattern-b', routeNumber: 'P', operator: 'TfL', origin: 'A', destination: 'B', direction: 'B', timetableSource: 'TfL', routePatternStopIds: ['STOP', 'B'], stopSchedules: { STOP: schedule({ monday: [1000, 1200] }) }, operatingPeriodEvidence: [{ provider: 'TfL', stopPointId: 'STOP', patternIdentity: 'b', calendarProfileId: 'ordinary', day: 'monday', fromMinute: 1000, toMinute: 1200 }] }
];
const [patternSummary] = buildServiceSummaries([{ id: 'STOP' }], patternRecords);
assert.equal(patternSummary.operatingPeriodEvidenceState, 'resolved');
assert.deepEqual([patternSummary.operatingPeriods.monday.firstMinute, patternSummary.operatingPeriods.monday.lastMinute], [300, 1200], 'compatible TfL patterns contribute their union');
const oppositePatternEvidence = selectOperatingPeriodEvidence([
  patternRecords[0],
  { ...patternRecords[1], direction: 'reverse', origin: 'B', destination: 'A' }
], 'STOP');
assert.equal(oppositePatternEvidence.state, 'conflict');
assert.match(oppositePatternEvidence.warnings.join(' '), new RegExp('different route/pattern identities'));

const mixedRecords = [
  {
    id: 'tfl-217', routeNumber: '217', operator: 'Shared operator', origin: 'Origin', destination: 'Terminus', direction: 'Terminus',
    timetableSource: 'TfL', frequencyBasisStopId: 'STOP', stopSchedules: { STOP: schedule({ monday: [290, 1465] }) },
    operatingPeriodEvidence: [{ provider: 'TfL', stopPointId: 'STOP', patternIdentity: 'tfl-217', calendarProfileId: 'ordinary', day: 'monday', fromMinute: 240, toMinute: 1499 }]
  },
  {
    id: 'bods-217', routeNumber: '217', operator: 'Shared operator', origin: 'Origin', destination: 'Terminus', direction: 'Terminus',
    timetableSource: 'BODS', frequencyBasisStopId: 'STOP', stopSchedules: { STOP: schedule({ monday: [5, 25, 290, 1465] }) }
  }
];
const [mixedSummary] = buildServiceSummaries([{ id: 'STOP', name: 'Control stop', distanceMetres: 10 }], mixedRecords);
assert.deepEqual([mixedSummary.operatingPeriods.monday.firstMinute, mixedSummary.operatingPeriods.monday.lastMinute], [240, 1499], 'TfL operating span beats supplementary exact departures');
assert.deepEqual(mixedSummary.departuresByDay.monday.slice(0, 2), [5, 25], 'supplementary departures remain retained for audit/frequency');
assert.match(mixedSummary.operatingPeriodReviewWarnings.join(' '), /retained for audit/);
assert.equal(mixedSummary.operatingPeriodAuthority.provider, 'TfL');
assert.deepEqual(mixedSummary.operatingPeriodAuthority.supplementaryProviders, ['BODS']);
const [mixedPlannerRow] = buildPlannerBusServiceSummaries([mixedSummary], [{ id: 'STOP', name: 'Control stop', distanceMetres: 10 }]);
assert.deepEqual([mixedPlannerRow.operatingPeriodLines[0], mixedPlannerRow.operatingPeriodLines[1]], ['Mon: Approx. 04:00–00:59 (next day)', 'Tue-Sun: No scheduled service']);

const singleJourney = [{
  id: 'tfl-657-single', routeNumber: '657', operator: 'TfL', origin: 'Grove Road', destination: 'Chingford', direction: 'Chingford',
  timetableSource: 'TfL', calendarProfileId: 'school-day', frequencyBasisStopId: 'STOP', stopSchedules: { STOP: schedule({ monday: [421], tuesday: [421], wednesday: [421], thursday: [421], friday: [421] }) },
  operatingPeriodEvidence: DAYS.slice(0, 5).map(day => ({ provider: 'TfL', stopPointId: 'STOP', calendarProfileId: 'school-day', day, fromMinute: 420, toMinute: 479 }))
}];
const [singleSummary] = buildServiceSummaries([{ id: 'STOP', name: 'Grove Road', distanceMetres: 10 }], singleJourney);
assert.equal(singleSummary.operatingPeriods.monday.firstMinute, 421);
assert.equal(singleSummary.operatingPeriods.monday.lastMinute, 421);
assert.equal(singleSummary.operatingPeriodLines[0], 'Mon-Fri: Departs approx. 07:01');
assert.equal(singleSummary.operatingPeriodEvidence[0].fromMinute, 420, 'broad TfL period remains technically retained');

const rollover = combineOperatingPeriodEvidence({ monday: [1430, 1460] }, { monday: [{ fromMinute: 1430, toMinute: 1460 }] });
assert.equal(rollover.periods.monday.last, '00:20');
assert.equal(rollover.periods.monday.overnight, true);

const diagnostic = JSON.parse(await readFile(new URL('./fixtures/tfl-waltham-operating-period-diagnostic.json', import.meta.url), 'utf8'));
const adapter = createTflBusTimetableAdapter({
  cache: createJsonCache({ storage: createMemoryStorage(), namespace: 'tfl-operating-period-fixture' }),
  fetchImpl: async url => {
    const text = String(url);
    if (text.includes('/Route')) return response({ id: 'fixture', sections: [{ direction: 'inbound', originationName: 'Origin', destinationName: 'Destination' }] });
    const line = decodeURIComponent(text.match(/\/Line\/([^/]+)\/Timetable/)?.[1] ?? '');
    const request = diagnostic.requests.find(item => item.lineId.toLowerCase() === line.toLowerCase());
    if (!request) return new Response('not found', { status: 404 });
    const body = structuredClone(request.response);
    body.stations = [{ id: '210021703440', name: 'Following stop' }];
    body.stops = body.stations;
    return response(body);
  }
});
for (const route of ['217', '279', '317', '327', '491', 'N279']) {
  const result = await adapter.servicesForStop({ lineId: route, stopPointId: diagnostic.requestedStopPointId });
  assert.equal(result.ok, true, `${route} diagnostic fixture resolves`);
  assert.ok(result.data[0].operatingPeriodEvidence.length, `${route} retains structured TfL period evidence`);
  assert.ok(result.data[0].frequencyEvidence.every(item => item.source === 'TfL'), `${route} frequency evidence remains separate`);
}

const tfl217 = await adapter.servicesForStop({ lineId: '217', stopPointId: diagnostic.requestedStopPointId });
const [summary217] = buildServiceSummaries([{ id: diagnostic.requestedStopPointId }], tfl217.data);
assert.ok(summary217.operatingPeriods.monday.firstMinute < 60 * 24, '217 is not reduced to an overnight-only tiny span');
assert.ok(summary217.operatingPeriods.monday.lastMinute >= 1440, '217 preserves next-day chronology');
const source217Monday = new Set(tfl217.data[0].stopSchedules[diagnostic.requestedStopPointId].monday);
assert.ok(summary217.departuresByDay.monday.every(minute => source217Monday.has(minute)), 'period evidence does not create departures');

const tfl317 = await adapter.servicesForStop({ lineId: '317', stopPointId: diagnostic.requestedStopPointId });
const [summary317] = buildServiceSummaries([{ id: diagnostic.requestedStopPointId }], tfl317.data);
assert.equal(summary317.operatingPeriods.monday.overnight, true);
assert.equal(summary317.operatingPeriods.monday.first, '05:00');
assert.equal(summary317.operatingPeriods.monday.lastMinute >= 1440, true);

const stopADiagnostic = JSON.parse(await readFile(new URL('./fixtures/tfl-waltham-stop-a-operating-period-1a.json', import.meta.url), 'utf8'));
const stopAAdapter = createTflBusTimetableAdapter({
  cache: createJsonCache({ storage: createMemoryStorage(), namespace: 'tfl-operating-period-1a-stop-a-fixture' }),
  fetchImpl: async url => {
    const value = String(url);
    if (value.includes('/Route')) return response([]);
    const line = decodeURIComponent(value.match(/\/Line\/([^/]+)\/Timetable/)?.[1] ?? '');
    const request = stopADiagnostic.requests.find(item => item.lineId.toLowerCase() === line.toLowerCase());
    if (!request) return new Response('not found', { status: 404 });
    const body = structuredClone(request.response);
    const stations = body.timetable.routes.flatMap(route => route.stationIntervals.flatMap(pattern => pattern.intervals.map(interval => ({ id: interval.stopId, name: interval.stopId }))));
    body.stations = stations;
    body.stops = stations;
    return response(body);
  }
});
for (const route of ['217', '317', '327']) {
  const result = await stopAAdapter.servicesForStop({ lineId: route, stopPointId: stopADiagnostic.requestedStopPointId });
  assert.equal(result.ok, true, `${route} Stop A fixture resolves`);
  assert.ok(result.data.some(service => service.operatingPeriodEvidence.some(item => item.stopPointId === stopADiagnostic.requestedStopPointId)), `${route} has Stop A TfL period evidence`);
}
const stopA217 = await stopAAdapter.servicesForStop({ lineId: '217', stopPointId: stopADiagnostic.requestedStopPointId });
const [stopA217Summary] = buildServiceSummaries([{ id: stopADiagnostic.requestedStopPointId }], stopA217.data);
assert.ok(stopA217Summary.operatingPeriods.monday.firstMinute >= 240 && stopA217Summary.operatingPeriods.monday.firstMinute < 360, '217 Stop A keeps the official daytime start');
assert.ok(stopA217Summary.operatingPeriods.monday.lastMinute >= 1440, '217 Stop A keeps the after-midnight finish');

const stopA317 = await stopAAdapter.servicesForStop({ lineId: '317', stopPointId: stopADiagnostic.requestedStopPointId });
const [stopA317Summary] = buildServiceSummaries([{ id: stopADiagnostic.requestedStopPointId }], stopA317.data);
assert.ok(stopA317Summary.operatingPeriods.monday.firstMinute >= 300 && stopA317Summary.operatingPeriods.monday.firstMinute < 360, '317 Stop A keeps the official morning start');
assert.ok(stopA317Summary.operatingPeriods.monday.lastMinute >= 1440, '317 Stop A keeps the after-midnight finish');

console.log('PASS TfL operating-period evidence, service-day chronology, conflict isolation and Waltham diagnostic fixture tests.');
