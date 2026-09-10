import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { formatAtlasTaskStatus } from '../../src/atlas/presentation/atlas-task-status.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const week = {
  monday: [360, 420, 480, 540, 600, 660],
  tuesday: [360, 420, 480, 540, 600, 660],
  wednesday: [360, 420, 480, 540, 600, 660],
  thursday: [360, 420, 480, 540, 600, 660],
  friday: [360, 420, 480, 540, 600, 660],
  saturday: [480, 540],
  sunday: [600]
};
const stop = { id: 'A', name: 'Waltham Cross Bus Station', indicator: 'G', distanceMetres: 110, walking: { status: 'routed', distanceMetres: 82 } };
const secondStop = { id: 'B', name: 'Waltham Cross Bus Station', indicator: 'H', distanceMetres: 95, walking: { status: 'routed', distanceMetres: 120 } };
const base = { routeNumber: '657', operator: 'Example Buses', direction: 'outbound', directionFamily: 'gtfs:0', origin: 'Waltham Cross', destination: 'Chingford', principalLocations: ['Enfield', 'Chingford Mount'], routePatternStopIds: ['A', 'B', 'C'], frequencyBasisStopId: 'A', stopIds: ['A'], departuresByDay: week, frequencyEvidence: [], sourceRecordIds: ['main'], serviceNote: 'School-day-only service.' };

const planner = buildPlannerBusServiceSummaries([
  base,
  { ...base, id: 'short', origin: 'Waltham Cross', destination: 'Enfield', routePatternStopIds: ['A', 'B'], departuresByDay: { ...week, monday: [360], tuesday: [360], wednesday: [360], thursday: [360], friday: [360], saturday: [], sunday: [] }, frequencyBasisStopId: 'A', stopIds: ['A'], sourceRecordIds: ['short'], serviceNote: 'Includes scheduled short workings or route variants in this direction; the main origin/destination shown is the most extensive pattern in the source timetable.' },
  { ...base, id: 'other-stop', frequencyBasisStopId: 'B', stopIds: ['B'], departuresByDay: { ...week, monday: [720, 780, 840], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] }, sourceRecordIds: ['other-stop'] },
  { ...base, id: 'branch', destination: 'Hoddesdon', routePatternStopIds: ['X', 'Y'], frequencyBasisStopId: 'A', stopIds: ['A'], departuresByDay: { ...week, monday: [400, 500], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] }, sourceRecordIds: ['branch'] },
  { ...base, id: 'inbound', direction: 'inbound', directionFamily: 'gtfs:1', origin: 'Chingford', destination: 'Waltham Cross', routePatternStopIds: ['C', 'B', 'A'], frequencyBasisStopId: 'A', stopIds: ['A'], departuresByDay: week, sourceRecordIds: ['inbound'] }
], [stop, secondStop]);

assert.equal(planner.length, 3, 'main direction, genuine branch and opposite direction remain distinct');
const main = planner.find(row => row.destination === 'Chingford');
assert.ok(main);
assert.equal(main.servedAtText, 'Waltham Cross Bus Station — G · 82 m');
assert.deepEqual(main.departuresByDay.monday, [360, 420, 480, 540, 600, 660], 'same representative-stop schedules are consolidated without cross-stop addition');
assert.deepEqual(main.typicalFrequencyLines, ['Mon-Fri: Every ~60 mins', 'Sat: 2 journeys/day', 'Sun: 1 journey/day']);
assert.match(main.operatingPeriodLines.join(' '), /Sun: Departs approx\. 10:00/);
assert.match(main.serviceNote, /School-day-only service/);
assert.doesNotMatch(main.serviceNote, /Includes scheduled short workings/);
assert.match(main.directionPatternText, /outbound — Waltham Cross to Chingford/);
assert.equal(planner.filter(row => row.routeNumber === '657').length, 3);

const word = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: [main], serviceSummaries: [] });
assert.deepEqual(word[1].headers, ['Route', 'Operator', 'Direction / main service pattern', 'Served at', 'Principal locations', 'Typical frequency', 'Operating period at stop']);
assert.equal(word[1].rows[0][3], main.servedAtText);
assert.ok(word[1].rows.some(row => !Array.isArray(row) && /representative stop/.test(row.text)));

assert.equal(formatAtlasTaskStatus({ phase: 'finding-stops' }), 'Finding nearby stops');
assert.equal(formatAtlasTaskStatus({ phase: 'routing-stops', completed: 2, total: 4 }), 'Routing stops — 2 of 4');
assert.match(formatAtlasTaskStatus({ phase: 'checking-timetables', waiting: true }), /Waiting briefly/);
assert.equal(formatAtlasTaskStatus({ phase: 'complete' }), 'Complete');
console.log('PASS Alpha.13 planner summary, Word parity and task-status contracts.');
