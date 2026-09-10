import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries, plannerSourceWarning } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildServiceSummaries, calculateTypicalServiceFrequency } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { createAtlasTaskStatus, formatAtlasTaskStatus } from '../../src/atlas/presentation/atlas-task-status.mjs';
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
assert.deepEqual(main.departuresByDay.monday, [360, 360, 420, 480, 540, 600, 660], 'same representative-stop schedules are consolidated without cross-stop addition while a destination-distinguished short working remains represented');
assert.deepEqual(main.typicalFrequencyLines, ['Mon-Fri: Every ~60 mins', 'Sat: 2 journeys/day', 'Sun: 1 journey/day']);
assert.match(main.operatingPeriodLines.join(' '), /Sun: Departs approx\. 10:00/);
assert.match(main.serviceNote, /School-day-only service/);
assert.doesNotMatch(main.serviceNote, /Includes scheduled short workings/);
assert.equal(main.directionPatternText, 'Towards Chingford');
assert.equal(planner.filter(row => row.routeNumber === '657').length, 3);

const word = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: [main], serviceSummaries: [] });
assert.deepEqual(word[1].headers, ['Route', 'Operator', 'Direction / main service pattern', 'Served at', 'Principal locations', 'Typical frequency', 'Operating period at stop']);
assert.equal(word[1].rows[0][3], main.servedAtText);
assert.ok(word[1].rows.some(row => !Array.isArray(row) && /representative stop/.test(row.text)));

assert.equal(formatAtlasTaskStatus({ phase: 'finding-stops' }), 'Step 1 of 5 · Finding nearby stops');
assert.equal(formatAtlasTaskStatus({ phase: 'routing-stops', completed: 2, total: 4 }), 'Step 2 of 5 · Routing stops — 2 of 4');
assert.equal(formatAtlasTaskStatus({ phase: 'checking-timetables', completed: 12, total: 31 }), 'Step 3 of 5 · Checking timetables — 12 of 31');
assert.match(formatAtlasTaskStatus({ phase: 'checking-timetables', waiting: true }), /Waiting briefly/);
assert.equal(formatAtlasTaskStatus({ phase: 'complete' }), 'Complete');
assert.equal(formatAtlasTaskStatus({ phase: 'partial', detail: 'one source was unavailable' }), 'Partial — review evidence — one source was unavailable');
assert.equal(formatAtlasTaskStatus({ phase: 'unavailable' }), 'Assessment unavailable');

const statusMessage = { textContent: '' };
const statusRegion = { dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
const statusProgress = { hidden: false, max: 0, value: 0, dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; } };
const statusCount = { textContent: '' };
const taskStatus = createAtlasTaskStatus({ messageElement: statusMessage, regionElement: statusRegion, progressElement: statusProgress, countElement: statusCount });
taskStatus.update({ phase: 'checking-timetables', completed: 12, total: 31 });
assert.equal(statusMessage.textContent, 'Step 3 of 5 · Checking timetables — 12 of 31');
assert.equal(statusProgress.hidden, false);
assert.equal(statusProgress.max, 31);
assert.equal(statusProgress.value, 12);
assert.equal(statusProgress.dataset.progressMode, 'determinate');
assert.equal(statusCount.textContent, '12 of 31');
assert.equal(statusRegion.attributes['aria-busy'], 'true');
taskStatus.update({ phase: 'partial', detail: 'one timetable request failed' });
assert.equal(statusProgress.hidden, true);
assert.equal(statusRegion.attributes['aria-busy'], 'false');

const evidence = (minutes, prefix, extra = {}) => minutes.map((minute, index) => ({ minute, journeyIdentity: `${prefix}-${index}`, ...extra }));
const plannerRecord = ({ routeNumber = '279', destination = 'Theobalds Grove', direction = 'outbound', pattern = ['A', 'B', 'C'], departures = [], ids = 'journey', serviceNote = '', ...extra } = {}) => ({
  id: `${routeNumber}-${destination}-${pattern.join('-')}-${ids}`,
  routeNumber,
  operator: 'TfL',
  origin: 'Waltham Cross',
  destination,
  direction,
  directionFamily: direction,
  routePatternStopIds: pattern,
  principalLocations: ['Waltham Cross', 'Theobalds Grove'],
  frequencyBasisStopId: 'A',
  stopIds: ['A'],
  departuresByDay: { monday: departures, tuesday: departures, wednesday: departures, thursday: departures, friday: departures, saturday: [], sunday: [] },
  departureEvidenceByDay: { monday: evidence(departures, ids), tuesday: evidence(departures, ids), wednesday: evidence(departures, ids), thursday: evidence(departures, ids), friday: evidence(departures, ids), saturday: [], sunday: [] },
  frequencyEvidence: [],
  sourceRecordIds: [ids],
  serviceNote,
  ...extra
});
const coherentStops = [
  { id: 'A', name: 'Waltham Cross Bus Station', indicator: 'G', distanceMetres: 110, walking: { status: 'routed', distanceMetres: 82 } },
  { id: 'B', name: 'Waltham Cross Bus Station', indicator: 'H', distanceMetres: 95, walking: { status: 'routed', distanceMetres: 120 } }
];

const route279Departures = [300, 310, 320, 330, 340, 350, 360, 460, 470, 480, 490, 500, 510, 520, 530, 540, 550, 560, 570, 580, 590, 600, 1500];
const route279 = buildPlannerBusServiceSummaries([
  plannerRecord({ pattern: ['A', 'B', 'C', 'D'], departures: route279Departures, ids: '279-journey' }),
  plannerRecord({ pattern: ['A', 'B', 'C'], departures: route279Departures, ids: '279-journey' })
], coherentStops);
assert.equal(route279.length, 1, 'many same-direction patterns consolidate to one planner row');
assert.equal(route279[0].departuresByDay.monday.length, route279Departures.length, 'duplicate timetable representations do not inflate the canonical departure population');
assert.match(route279[0].typicalFrequencyLines[0], /Approx\. every \d+ mins \(irregular\)/, 'frequent irregular service uses a rounded average headway');
assert.match(route279[0].operatingPeriodLines[0], /Approx\. 05:00–01:00 \(next day\)/, 'operating period uses the same canonical population and preserves overnight chronology');
assert.equal(route279[0].servedAtStopId, 'A');
assert.equal(route279[0].frequencyBasisStopId, 'A');
assert.equal(route279[0].canonicalDeparturePopulation.monday.every(item => item.stopPointId === 'A'), true);
assert.equal(route279[0].routeGroupNote, 'Additional timetable variants and short workings operate; some journeys serve different destinations and operate at different times.');
assert.equal(route279[0].directionPatternText, 'Towards Theobalds Grove');

const sameTime = buildPlannerBusServiceSummaries([
  plannerRecord({ routeNumber: 'Q', departures: [420], ids: 'same-physical' }),
  plannerRecord({ routeNumber: 'Q', pattern: ['A', 'B'], departures: [420], ids: 'same-physical' }),
  plannerRecord({ routeNumber: 'Q', pattern: ['A', 'B'], departures: [420], ids: 'different-physical' })
], coherentStops)[0];
assert.equal(sameTime.departuresByDay.monday.length, 2, 'distinguishable same-time physical journeys remain distinct while duplicate identities collapse');

const samePhysicalDifferentEndpoints = buildPlannerBusServiceSummaries([
  plannerRecord({ routeNumber: 'P', destination: 'Terminal One', pattern: ['A', 'B'], departures: [420], ids: 'physical-1' }),
  plannerRecord({ routeNumber: 'P', origin: 'Remote Origin', destination: 'Terminal Two', pattern: ['A', 'B'], departures: [420], ids: 'physical-1' })
], coherentStops)[0];
assert.equal(samePhysicalDifferentEndpoints.departuresByDay.monday.length, 1, 'one physical journey is not double-counted when endpoint representations differ');
assert.equal(samePhysicalDifferentEndpoints.routeGroupNote, null, 'endpoint representations for one physical journey do not create a false variant note');

const distinctPhysicalJourneys = buildPlannerBusServiceSummaries([
  plannerRecord({ routeNumber: 'P2', pattern: ['A', 'B'], departures: [420], ids: 'physical-1' }),
  plannerRecord({ routeNumber: 'P2', pattern: ['A', 'B'], departures: [420], ids: 'physical-2' })
], coherentStops)[0];
assert.equal(distinctPhysicalJourneys.departuresByDay.monday.length, 2, 'distinct physical journeys at one minute remain separate');

const mondayJourney = plannerRecord({ routeNumber: 'D', departures: [], ids: 'day-journey' });
const tuesdayJourney = plannerRecord({ routeNumber: 'D', departures: [], ids: 'day-journey' });
for (const day of ['tuesday', 'wednesday', 'thursday', 'friday']) mondayJourney.departuresByDay[day] = [];
for (const day of ['monday', 'wednesday', 'thursday', 'friday']) tuesdayJourney.departuresByDay[day] = [];
mondayJourney.departuresByDay.monday = [420];
tuesdayJourney.departuresByDay.tuesday = [420];
for (const day of ['tuesday', 'wednesday', 'thursday', 'friday']) mondayJourney.departureEvidenceByDay[day] = [];
for (const day of ['monday', 'wednesday', 'thursday', 'friday']) tuesdayJourney.departureEvidenceByDay[day] = [];
mondayJourney.departureEvidenceByDay.monday = [{ minute: 420, journeyIdentity: 'day-journey' }];
tuesdayJourney.departureEvidenceByDay.tuesday = [{ minute: 420, journeyIdentity: 'day-journey' }];
const daySeparated = buildPlannerBusServiceSummaries([mondayJourney, tuesdayJourney], coherentStops)[0];
assert.deepEqual(daySeparated.departuresByDay.monday, [420]);
assert.deepEqual(daySeparated.departuresByDay.tuesday, [420], 'the strong identity key includes service day');

const route13 = buildPlannerBusServiceSummaries([
  plannerRecord({ routeNumber: '13', destination: 'North Weald', pattern: ['A', 'B', 'C'], departures: [360, 420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200, 1260, 1320, 1380], ids: '13-main' }),
  plannerRecord({ routeNumber: '13', destination: 'North Weald', pattern: ['A', 'B'], departures: [390, 450, 510], ids: '13-short', serviceNote: 'Limited service: no more than three scheduled journeys on any represented day.' })
], coherentStops)[0];
assert.equal(route13.departuresByDay.monday.length, 21);
assert.doesNotMatch(route13.serviceNote, /Limited service|no more than three/i, 'limited-service notes are recalculated after consolidation');
assert.equal(route13.routeGroupNote, 'Additional timetable variants and short workings operate; some journeys serve different destinations and operate at different times.');
assert.equal(route13.directionPatternText, 'Towards North Weald');

const mixedPatternEvidence = buildPlannerBusServiceSummaries([
  plannerRecord({ routeNumber: 'E', departures: [420, 480, 540, 600, 660, 720], ids: 'e-main', frequencyEvidence: [{ periodType: 'FrequencyMinutes', day: 'monday', lowestFrequency: 10, highestFrequency: 10 }] }),
  plannerRecord({ routeNumber: 'E', pattern: ['A', 'B'], departures: [450, 510], ids: 'e-short' })
], coherentStops)[0];
assert.notEqual(mixedPatternEvidence.frequencyByDay.monday.basis, 'frequency-band', 'one constituent pattern cannot impose a frequency band on a consolidated row without equivalent evidence for the whole population');

const directionRows = buildPlannerBusServiceSummaries([
  plannerRecord({ routeNumber: 'R', destination: 'North Terminal', direction: 'outbound', pattern: ['A', 'B'], departures: [420], ids: 'north' }),
  plannerRecord({ routeNumber: 'R', origin: 'North', destination: 'Waltham Cross', direction: 'inbound', pattern: ['B', 'A'], departures: [420], ids: 'south' })
], coherentStops);
assert.equal(directionRows.length, 2, 'opposite directions never combine');

const bridgedDirections = buildPlannerBusServiceSummaries([
  plannerRecord({ routeNumber: 'BR', direction: 'inbound', pattern: ['A', 'B', 'C'], departures: [420], ids: 'br-in' }),
  plannerRecord({ routeNumber: 'BR', direction: '', directionFamily: '', destination: 'Bridge Terminal', pattern: ['B'], departures: [420], ids: 'br-ambiguous' }),
  plannerRecord({ routeNumber: 'BR', direction: 'outbound', pattern: ['C', 'B', 'A'], departures: [420], ids: 'br-out' })
], coherentStops);
assert.equal(bridgedDirections.length, 2, 'an ambiguous direction record cannot bridge two opposite direction components');
assert.ok(bridgedDirections.every(row => row.rawServiceSummaries.length < 3));

const unresolvedRecord = plannerRecord({ routeNumber: 'U', destination: '', direction: '', directionFamily: '', pattern: ['A', 'B'], departures: [420], ids: 'u' });
assert.deepEqual(buildPlannerBusServiceSummaries([unresolvedRecord], coherentStops), [], 'unresolved route identity is not presented as a normal planner row');
assert.match(plannerSourceWarning(unresolvedRecord).join(' '), /Detailed Evidence/);

const operatorRecords = buildPlannerBusServiceSummaries([
  plannerRecord({ routeNumber: 'OP', ids: 'resolved' }),
  plannerRecord({ routeNumber: 'OP', ids: 'unresolved-operator', operator: '' })
], coherentStops);
assert.equal(operatorRecords.length, 1, 'an unresolved operator duplicate does not become a second planner row');

const internalNotes = buildPlannerBusServiceSummaries([plannerRecord({ routeNumber: 'N', departures: [420], ids: 'notes', serviceNote: 'TfL route metadata did not establish full route identity. Limited service: no more than three scheduled journeys on any represented day.' })], coherentStops)[0];
assert.doesNotMatch(internalNotes.serviceNote, /route metadata|limited service|no more than three/i, 'source diagnostics and redundant limited banners stay out of planner service notes');

const separateRoutes = buildPlannerBusServiceSummaries(['13', '13A', '13B', '13C'].map(routeNumber => plannerRecord({ routeNumber, departures: [420], ids: routeNumber })), coherentStops);
assert.deepEqual(separateRoutes.map(row => row.routeNumber), ['13', '13A', '13B', '13C'], 'related route labels remain separate route families');

const circularRows = buildPlannerBusServiceSummaries([
  plannerRecord({ routeNumber: 'C', destination: 'Town Centre', direction: 'Clockwise', pattern: ['A', 'B', 'C'], departures: [420], ids: 'clockwise', circular: true }),
  plannerRecord({ routeNumber: 'C', destination: 'Town Centre', direction: 'Anticlockwise', pattern: ['C', 'B', 'A'], departures: [420], ids: 'anticlockwise', circular: true })
], coherentStops);
assert.equal(circularRows.length, 2, 'circular directions remain distinct where timetable evidence distinguishes them');

const single = buildPlannerBusServiceSummaries([plannerRecord({ routeNumber: '657', departures: [982], ids: '657-single' })], coherentStops)[0];
assert.equal(single.typicalFrequencyLines[0], 'Mon-Fri: 1 journey/day');
assert.match(single.operatingPeriodLines[0], /Departs approx\. 16:22/);

const builtSummary = buildServiceSummaries([{ id: 'A', name: 'Waltham Cross Bus Station', walking: { status: 'routed', distanceMetres: 82 } }], [{
  id: 'record', routeNumber: '231', operator: 'Example', origin: 'Pipers Lane', destination: 'Bedford', direction: 'outbound', stopSchedules: { A: { monday: [678], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } }
}])[0];
assert.equal(builtSummary.departureEvidenceByDay.monday[0].minute, 678, 'raw summary retains traceable departure evidence for planner deduplication');

const wordRows = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: [route279[0]], serviceSummaries: [] })[1].rows;
assert.equal(wordRows[0][2], route279[0].directionPatternText, 'Word consumes the same direction model as Browser');
assert.equal(wordRows[0][5], route279[0].typicalFrequencyText, 'Word consumes the same frequency model as Browser');
assert.equal(wordRows.filter(row => !Array.isArray(row) && row.text === 'Service note: Additional timetable variants and short workings operate; some journeys serve different destinations and operate at different times.').length, 1, 'route-level variant note is emitted once');

const variable = calculateTypicalServiceFrequency([300, 310, 320, 330, 340, 350, 365, 380], { day: 'monday' });
assert.equal(variable.classification, 'variable-frequency');
assert.match(variable.valueText, /Typically every/);
console.log('PASS Alpha.13 coherence, canonical departure population, deduplication, frequency-rate, note and Browser/Word parity regressions.');
console.log('PASS Alpha.13 planner summary, Word parity and task-status contracts.');
