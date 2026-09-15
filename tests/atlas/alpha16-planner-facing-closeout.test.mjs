import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries, PLANNER_METHODOLOGY_NOTE } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const stops = [
  { id: 'A', name: 'Selected Stop A', locality: 'Selected Town', distanceMetres: 100, walking: { status: 'routed', distanceMetres: 90 } },
  { id: 'B', name: 'Selected Stop B', locality: 'Selected Town', distanceMetres: 150, walking: { status: 'routed', distanceMetres: 130 } }
];

function record({
  routeNumber,
  id,
  origin,
  destination,
  direction = 'gtfs:0',
  directionFamily = direction,
  pattern = ['ORIGIN', 'A', 'B', 'DESTINATION'],
  departures = [420, 480],
  serviceNote = '',
  source = 'BODS',
  operator = 'Example Buses',
  circular = false
}) {
  const departureEvidenceByDay = Object.fromEntries(days.map(day => [day, departures.map((minute, index) => ({
    minute,
    journeyIdentity: `${id}-${day}-${index}`,
    provider: source
  }))]));
  return {
    id,
    routeNumber,
    operator,
    origin,
    destination,
    direction,
    directionFamily,
    circular,
    routePatternStopIds: pattern,
    routePatternStops: pattern.map((stopId, index) => ({ id: stopId, name: stopId === 'ORIGIN' ? origin : stopId === 'DESTINATION' ? destination : `Pattern stop ${index}` })),
    principalLocations: [origin, destination],
    frequencyBasisStopId: 'A',
    stopIds: ['A', 'B'],
    departuresByDay: Object.fromEntries(days.map(day => [day, departures])),
    departureEvidenceByDay,
    frequencyEvidence: [],
    sourceRecordIds: [id],
    timetableSource: source,
    calendarProfileId: 'ordinary',
    serviceNote
  };
}

const familyRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: '13', id: '13-main-out', origin: 'Waltham Cross', destination: 'North Weald', direction: 'gtfs:0' }),
  record({ routeNumber: '13', id: '13-main-in', origin: 'North Weald', destination: 'Waltham Cross', direction: 'gtfs:1', directionFamily: 'gtfs:1', pattern: ['DESTINATION', 'B', 'A', 'ORIGIN'] }),
  record({ routeNumber: '13A', id: '13a-short', origin: 'Waltham Cross', destination: 'Epping', serviceNote: 'Short working towards Epping.' })
], stops);
assert.equal(familyRows.length, 2, 'main and short-working directions remain concise rows');
const familyNote = familyRows.map(row => row.routeGroupNote).find(Boolean) ?? '';
assert.match(familyNote, /principal Route 13 service operates between (Waltham Cross and North Weald|North Weald and Waltham Cross)/i);
assert.match(familyNote, /Route 13A/);
assert.ok(familyRows.some(row => row.rawRouteNumbers.includes('13A')), 'raw route suffix remains retained on the planner row');

const shortWorkingRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: '25C', id: '25c-full', origin: 'Waltham Cross', destination: 'Harlow', pattern: ['ORIGIN', 'A', 'B', 'DESTINATION'] }),
  record({ routeNumber: '25C', id: '25c-short', origin: 'Waltham Cross', destination: 'Short Terminus', pattern: ['ORIGIN', 'A'], serviceNote: 'Short working towards Short Terminus.' })
], stops);
const shortWorkingNote = shortWorkingRows.map(row => row.routeGroupNote).find(Boolean) ?? '';
assert.match(shortWorkingNote, /shorter workings to Short Terminus/i);
assert.ok(shortWorkingRows.some(row => row.destination === 'Harlow'), 'principal destination remains the headline');

const unsafeRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: 'XA', id: 'xa-out', origin: 'Origin Town', destination: 'Destination Town', direction: 'gtfs:0' }),
  record({ routeNumber: 'XB', id: 'xb-in', origin: 'Destination Town', destination: 'Origin Town', direction: 'gtfs:1', directionFamily: 'gtfs:1', pattern: ['DESTINATION', 'B', 'A', 'ORIGIN'] })
], stops);
const unsafeNote = unsafeRows.map(row => row.routeGroupNote).find(Boolean) ?? '';
assert.doesNotMatch(unsafeNote, /principal Route/i, 'no principal is asserted when no base route can be established');
assert.match(unsafeNote, /service family includes Routes/i);

const multiLoopRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: 'L16', id: 'loop-a', origin: 'Loop Hub', destination: 'Loop Hub', pattern: ['ORIGIN', 'A', 'B', 'ORIGIN'], circular: true }),
  record({ routeNumber: 'L16', id: 'loop-b', origin: 'Loop Hub', destination: 'Loop Hub', pattern: ['ORIGIN', 'A', 'B', 'C', 'ORIGIN'], circular: true }),
  record({ routeNumber: 'L16', id: 'linear-short', origin: 'Loop Hub', destination: 'Short Terminus', pattern: ['ORIGIN', 'A', 'B'], circular: false })
], stops);
assert.ok(multiLoopRows.every(row => !row.circular && !row.directionPatternText.startsWith('Circular —')), 'multiple closed variants with open evidence remain linear in the planner');

const plannerText = familyRows.concat(unsafeRows).map(row => [
  row.directionPatternText,
  row.principalLocationsText,
  row.serviceNote,
  row.routeGroupNote
].filter(Boolean).join(' ')).join(' ');
assert.doesNotMatch(plannerText, /selected variant|resolved family|PublicServiceFamily|source component|semantic group|prepared feed|provider reconciliation/i);

assert.match(PLANNER_METHODOLOGY_NOTE, /Served at.*selected search radius/i);
assert.match(PLANNER_METHODOLOGY_NOTE, /not the complete list of stops/i);
assert.match(PLANNER_METHODOLOGY_NOTE, /timetable basis/i);
const wordServiceTable = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: familyRows, serviceSummaries: [] })[1];
assert.ok(wordServiceTable.rows.some(row => row?.kind === 'summary' && row.text === PLANNER_METHODOLOGY_NOTE), 'Word export uses the shared Served-at explanation');
const indexHtml = fs.readFileSync(new URL('../../atlas/index.html', import.meta.url), 'utf8');
const appModule = fs.readFileSync(new URL('../../atlas/assets/js/app.mjs', import.meta.url), 'utf8');
assert.ok(indexHtml.includes(PLANNER_METHODOLOGY_NOTE), 'Browser markup contains the shared Served-at explanation');
assert.match(appModule, /serviceSummaryMethodology.*PLANNER_METHODOLOGY_NOTE/s, 'Browser rendering uses the shared Served-at explanation');

console.log('PASS Alpha.16 planner-facing closeout: hierarchy, neutral wording, family retention and Served-at parity.');
