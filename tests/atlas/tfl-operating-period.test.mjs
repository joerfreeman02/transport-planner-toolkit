import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildServiceSummaries,
  combineOperatingPeriodEvidence,
  formatOperatingPeriod
} from '../../src/atlas/domain/bus-service-assessment.mjs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
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
assert.equal(patternSummary.operatingPeriodEvidenceState, 'conflict');
assert.match(patternSummary.operatingPeriodReviewWarnings.join(' '), new RegExp('different route/pattern identities'));

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

console.log('PASS TfL operating-period evidence, service-day chronology, conflict isolation and Waltham diagnostic fixture tests.');
