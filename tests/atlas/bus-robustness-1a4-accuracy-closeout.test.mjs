import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const emptyWeek = () => Object.fromEntries(DAYS.map(day => [day, []]));
const weekday = values => ({ monday: values, tuesday: values, wednesday: values, thursday: values, friday: values, saturday: [], sunday: [] });
const endpoint = (place, stopPointId, stopAreaId, exact = true) => ({
  rawEndpointText: place,
  raw: place,
  chosen: place,
  chosenDisplayName: place,
  decisionType: exact ? 'exact-endpoint-resolved' : 'generic-endpoint-resolved',
  exactEvidence: exact,
  exact,
  primaryEndpointStopPointId: stopPointId,
  endpointStopPointId: stopPointId,
  endpointStopPointIds: [stopPointId],
  stopArea: { id: stopAreaId, name: place },
  stopAreas: [{ id: stopAreaId, name: place }]
});

function service({
  id,
  routeNumber = '313',
  origin = 'Origin',
  destination = 'Main Station',
  originStopPointId = 'ORIGIN',
  destinationStopPointId = 'MAIN',
  pattern = [originStopPointId, 'MID', destinationStopPointId],
  calendarProfileId = 'ordinary',
  departuresByDay = weekday([420, 450, 480, 510]),
  departureEvidenceByDay,
  circular = false,
  sourceRouteIds = [routeNumber],
  operator = 'Operator',
  direction = 'outbound',
  principalLocations = ['Corridor'],
  ...extra
} = {}) {
  const evidence = departureEvidenceByDay ?? Object.fromEntries(DAYS.map(day => [day, (departuresByDay[day] ?? []).map(minute => ({ minute, stopPointId: 'BASIS', journeyIdentity: null, provider: 'TfL' }))]));
  return {
    id: id || `${routeNumber}-${destination}-${calendarProfileId}`,
    sourceRecordIds: [id || `${routeNumber}-${destination}-${calendarProfileId}`],
    routeNumber,
    operator,
    provider: 'TfL',
    timetableSource: 'TfL',
    sourceAuthorities: ['TfL'],
    sourceProviders: ['TfL'],
    source: { provider: 'TfL', sourceRouteIds },
    origin,
    destination,
    direction,
    directionFamily: direction,
    circular,
    originStopPointId,
    destinationStopPointId,
    originStopPointIds: [originStopPointId],
    destinationStopPointIds: [destinationStopPointId],
    stopIds: [...new Set([originStopPointId, destinationStopPointId, 'BASIS'])],
    assessedStops: ['BASIS', 'SCHOOL'],
    routePatternStopIds: pattern,
    routePatternStops: pattern.map(id => ({ id, name: id })),
    routePatternExtent: pattern.length,
    orderedPatternEndpoints: [originStopPointId, destinationStopPointId],
    sourceRouteIds,
    originEndpointDecision: endpoint(origin, originStopPointId, origin === 'Origin' ? 'AREA-ORIGIN' : 'AREA-SCHOOL'),
    destinationEndpointDecision: endpoint(destination, destinationStopPointId, destination === 'School' ? 'AREA-SCHOOL' : 'AREA-MAIN'),
    calendarProfileId,
    calendarProfileLabel: calendarProfileId,
    calendarEvidence: [],
    serviceNote: calendarProfileId === 'school-day' ? 'Route operates on school days only.' : '',
    departuresByDay,
    departureEvidenceByDay: evidence,
    frequencyBasisStopId: 'BASIS',
    frequencyEvidence: [],
    recordActivity: Object.values(departuresByDay).flat().length,
    operatingPeriods: {},
    principalLocations,
    ...extra
  };
}

const assessedStops = [
  { id: 'BASIS', name: 'Assessed Stop', stopAreaId: 'AREA-BASIS', walking: { status: 'routed', distanceMetres: 120 } },
  { id: 'SCHOOL', name: 'School', stopAreaId: 'AREA-SCHOOL', walking: { status: 'routed', distanceMetres: 180 } }
];

// A1: an assessed school extension has cleaner endpoint evidence and a longer
// pattern, but the ordinary public destination has materially more journeys.
const ordinary313 = service({ id: '313-main', destination: 'Main Station', destinationStopPointId: 'MAIN', pattern: ['ORIGIN', 'MID', 'MAIN'], departuresByDay: weekday([420, 450, 480, 510, 540, 570, 600, 630, 660, 690, 720, 750]) });
const school313 = service({ id: '313-school', destination: 'School', destinationStopPointId: 'SCHOOL', pattern: ['ORIGIN', 'MID', 'SCHOOL', 'SCHOOL-GATE', 'SCHOOL-LOOP'], calendarProfileId: 'school-day', departuresByDay: weekday([420, 480]) });
const rows313 = buildPlannerBusServiceSummaries([ordinary313, school313], assessedStops);
assert.equal(rows313.length, 1, 'A1: main and school extension remain one public route row');
assert.equal(rows313[0].destination, 'Main Station', 'A1: ordinary high-volume principal destination wins');
assert.ok(rows313[0].plannerNotes.shortWorkings || rows313[0].plannerNotes.additionalServices, 'A1: school extension remains visible as a structured variant note');

// A2: a restricted extension cannot replace an ordinary principal even when
// its endpoint is the nearest assessed stop.
const ordinaryA2 = service({ id: '314-main', routeNumber: '314', destination: 'Main Station', destinationStopPointId: 'MAIN', departuresByDay: weekday([420, 450, 480, 510, 540, 570, 600, 630]) });
const schoolA2 = service({ id: '314-school', routeNumber: '314', destination: 'School', destinationStopPointId: 'SCHOOL', pattern: ['ORIGIN', 'MID', 'SCHOOL'], calendarProfileId: 'school-day', departuresByDay: weekday([420]) });
const rowsA2 = buildPlannerBusServiceSummaries([ordinaryA2, schoolA2], assessedStops);
assert.equal(rowsA2.length, 1, 'A2: restricted endpoint remains within one public row');
const rowA2 = rowsA2[0];
assert.equal(rowA2.destination, 'Main Station', 'A2: nearest assessed restricted endpoint does not outrank public journey support');

// A3: ordinary/school calendar evidence is still presented as one row with
// profile-qualified timetable evidence.
const calendarRows = buildPlannerBusServiceSummaries([
  service({ id: 'R3-ordinary', routeNumber: 'R3', destination: 'Main Station', departuresByDay: weekday([420, 480, 540]) }),
  service({ id: 'R3-school', routeNumber: 'R3', destination: 'Main Station', calendarProfileId: 'school-day', departuresByDay: weekday([450, 510]) })
], assessedStops);
assert.equal(calendarRows.length, 1, 'A3: calendar variants remain one public row');
assert.ok(calendarRows[0].calendarProfileIds.includes('ordinary') && calendarRows[0].calendarProfileIds.includes('school-day'), 'A3: both calendar profiles remain qualified');

// A4: a genuine distinct-corridor control still retains both public rows.
const opposite = buildPlannerBusServiceSummaries([
  service({ id: '13-north', routeNumber: '13', destination: 'North', destinationStopPointId: 'NORTH', sourceRouteIds: ['13'], direction: 'outbound' }),
  service({ id: '13a-east', routeNumber: '13A', destination: 'East', destinationStopPointId: 'EAST', sourceRouteIds: ['13A'], direction: 'outbound', pattern: ['ORIGIN', 'OTHER', 'EAST'] })
], assessedStops);
assert.equal(opposite.length, 2, 'A4: distinct public corridors are not collapsed by principal scoring');

// A5: Browser and Word consume the same corrected row, including its public
// destination and calendar-qualified evidence.
const browserWordRows = buildPlannerBusServiceSummaries([ordinary313, school313], assessedStops);
const wordText = buildBusWordTables({ ok: true, stops: assessedStops, plannerServiceSummaries: browserWordRows, serviceSummaries: [] })
  .flatMap(table => table.rows ?? [])
  .map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? ''))
  .join(' ');
assert.match(wordText, /Main Station/);
assert.doesNotMatch(wordText, /313\s+Operator\s+Towards\s+School/);

const frozen = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-group-1d-waltham-runtime.json', import.meta.url), 'utf8'));
const frozenRows = buildPlannerBusServiceSummaries(frozen.serviceSummaries, frozen.stops);
const frozenRoute = route => frozenRows.find(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route));

// B1: the frozen circular route 16 terminal population keeps useful boarding
// observations, not the arrival-only terminal observations.
const row16 = frozenRoute('16');
assert.equal(row16.terminusDecision.proven, true, 'B1: route 16 terminal is proven from closed exact endpoint evidence');
assert.match(row16.typicalFrequencyText, /every ~30 mins/i, 'B1: route 16 no longer reports a 5-minute lower band');
assert.match(row16.operatingPeriodLines.join('\n'), /08:15–21:40/);
assert.equal(row16.canonicalDeparturePopulationAll.monday.length, 27, 'B1: route 16 Monday population excludes terminal arrivals');

// B2: 16C is broadly hourly and its outgoing short workings remain useful.
const row16c = frozenRoute('16C');
assert.equal(row16c.terminusDecision.proven, true, 'B2: route 16C terminal is proven from closed exact endpoint evidence');
assert.match(row16c.typicalFrequencyText, /every ~60 mins/i, 'B2: route 16C is presented as broadly hourly');
assert.match(row16c.operatingPeriodLines.join('\n'), /08:00–19:45/);
assert.equal(row16c.canonicalDeparturePopulationAll.sunday.length, 14, 'B2: route 16C Sunday population excludes terminal arrivals but retains short workings');

// B3: explicit occurrence roles are authoritative when available; the same
// physical journey's terminating arrival is never counted as a departure.
const explicitCircular = service({
  id: 'C3', routeNumber: 'C3', circular: true, origin: 'Loop', destination: 'Loop', originStopPointId: 'BASIS', destinationStopPointId: 'BASIS', pattern: ['BASIS', 'MID', 'BASIS'],
  departuresByDay: emptyWeek(),
  departureEvidenceByDay: { ...emptyWeek(), monday: [
    { minute: 480, stopPointId: 'BASIS', journeyIdentity: 'J1', occurrenceRole: 'departure', provider: 'TNDS' },
    { minute: 540, stopPointId: 'BASIS', journeyIdentity: 'J1', occurrenceRole: 'arrival', provider: 'TNDS' },
    { minute: 600, stopPointId: 'BASIS', journeyIdentity: 'J2', occurrenceRole: 'departure', provider: 'TNDS' },
    { minute: 660, stopPointId: 'BASIS', journeyIdentity: 'J2', occurrenceRole: 'arrival', provider: 'TNDS' }
  ] }
});
const explicitRow = buildPlannerBusServiceSummaries([explicitCircular], assessedStops)[0];
assert.deepEqual(explicitRow.canonicalDeparturePopulationAll.monday.map(entry => entry.minute), [480, 600], 'B3: explicit departure/arrival occurrence roles are respected');

// B4: non-circular same-minute journeys remain distinct; the terminal rule is
// scoped to proven closed circular evidence and does not become global dedupe.
const sameMinute = service({
  id: 'C4', routeNumber: 'C4', departuresByDay: emptyWeek(),
  departureEvidenceByDay: { ...emptyWeek(), monday: [
    { minute: 600, stopPointId: 'BASIS', journeyIdentity: 'J1', provider: 'TNDS' },
    { minute: 600, stopPointId: 'BASIS', journeyIdentity: 'J2', provider: 'TNDS' }
  ] }
});
const sameMinuteRow = buildPlannerBusServiceSummaries([sameMinute], assessedStops)[0];
assert.equal(sameMinuteRow.canonicalDeparturePopulationAll.monday.length, 2, 'B4: unrelated non-circular same-minute journeys remain distinct');

// B5: Browser/Word parity uses the same corrected circular rows and terminal
// decision as the planner summary.
const wordCircularText = buildBusWordTables({ ok: true, stops: frozen.stops, plannerServiceSummaries: [row16, row16c], serviceSummaries: [] })
  .flatMap(table => table.rows ?? [])
  .map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? ''))
  .join(' ');
assert.match(wordCircularText, /Waltham Cross Bus Station/);
assert.match(wordCircularText, /every ~30 mins/i);
assert.match(wordCircularText, /every ~60 mins/i);

console.log('PASS BUS-ROBUSTNESS-1A4 final accuracy closeout: restricted principal destination, proven circular terminal departure population, operating periods, and Browser/Word parity.');
