import assert from 'node:assert/strict';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { resolveCircularServiceDecision } from '../../src/atlas/domain/circular-service-decision.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';

const weekdays = { monday: [360, 420], tuesday: [360, 420], wednesday: [360, 420], thursday: [360, 420], friday: [360, 420], saturday: [], sunday: [] };
const stop = { id: 'PIPERS-A', name: 'Pipers Lane', distanceMetres: 40, walking: { status: 'routed', distanceMetres: 40 } };

const [scopedSummary] = buildServiceSummaries([stop], [{
  id: 'pattern-with-stop-scope', routeNumber: '230', operator: 'Centrebus South', provider: 'TNDS',
  source: { provider: 'TNDS' }, origin: 'Lyons Community Centre', destination: 'Caddington Woods',
  direction: 'outbound', stopSchedules: { 'PIPERS-A': weekdays },
  // Prepared whole-pattern evidence is repeated once per stop call and lacks
  // a stopPointId. The representative stop's schedule is the safe population.
  departureEvidenceByDay: Object.fromEntries(Object.keys(weekdays).map(day => [day, [360, 360, 420, 420].map(minute => ({ minute, journeyIdentity: `${day}-${minute}` }))]))
}]);
assert.deepEqual(scopedSummary.departuresByDay.monday, [360, 420]);
assert.equal(scopedSummary.frequencyByDay.monday.departureCount, 2);

const bodsLoop = {
  id: 'bods-230-loop', routeNumber: '230', operator: 'Centrebus', provider: 'BODS',
  source: { provider: 'BODS' }, direction: 'gtfs:0', circular: true,
  circularPatternStopIds: ['PIPERS-A', 'MID-1', 'MID-2', 'PIPERS-A']
};
const tndsOpenVariant = {
  id: 'tnds-230-open', routeNumber: '230', operator: 'Centrebus South', provider: 'TNDS',
  source: { provider: 'TNDS' }, direction: 'outbound', circular: false,
  circularPatternStopIds: ['PIPERS-A', 'MID-1', 'MID-2', 'REMOTE-END']
};
const circular = resolveCircularServiceDecision([bodsLoop, tndsOpenVariant], { principal: bodsLoop, component: [bodsLoop, tndsOpenVariant] });
assert.equal(circular.classification, 'circular', 'an open supplementary source pattern cannot veto a proven closed BODS principal');
assert.equal(circular.variantClassifications.length, 2, 'supplementary pattern remains available for audit');

const plannerBase = {
  routeNumber: 'R1', origin: 'Origin', destination: 'Destination', direction: 'outbound', directionFamily: 'outbound',
  routePatternStopIds: ['ORIGIN', 'PIPERS-A', 'DESTINATION'], frequencyBasisStopId: 'PIPERS-A', stopIds: ['PIPERS-A'],
  departuresByDay: weekdays, frequencyEvidence: [], sourceRecordIds: ['main']
};
const departureEvidence = (minutes, provider, profile = null) => Object.fromEntries(Object.keys(weekdays).map(day => [day,
  ['saturday', 'sunday'].includes(day) ? [] : minutes.map((minute, index) => ({ minute, stopPointId: 'PIPERS-A', journeyIdentity: `${provider}-${day}-${index}-${minute}`, provider, ...(profile ? { calendarProfileId: profile } : {}) }))
]));
const hourlyMinutes = Array.from({ length: 12 }, (_value, index) => 360 + index * 60);
const authorityPriority = buildPlannerBusServiceSummaries([
  { ...plannerBase, id: 'bods-hourly', routeNumber: '230', provider: 'BODS', timetableSource: 'BODS', source: { provider: 'BODS' }, departureEvidenceByDay: departureEvidence(hourlyMinutes, 'BODS') },
  { ...plannerBase, id: 'tnds-duplicate-population', routeNumber: '230', provider: 'TNDS', timetableSource: 'TNDS', source: { provider: 'TNDS' }, departureEvidenceByDay: departureEvidence(hourlyMinutes.flatMap(minute => [minute, minute + 5, minute + 11]), 'TNDS') }
], [stop]);
assert.equal(authorityPriority.length, 1, 'matching BODS/TNDS public timetable evidence remains one planner row');
assert.deepEqual(authorityPriority[0].canonicalDeparturePopulation.monday.map(entry => entry.minute), hourlyMinutes, 'BODS primary departures define the ordinary frequency population when equivalent TNDS supplementation repeats the same public service');
assert.match(authorityPriority[0].typicalFrequencyText, /Every ~60 mins/i, 'supplementary national journey identities cannot inflate the BODS-led hourly headway');
const pipersBodsWeekly = Object.fromEntries(Object.keys(weekdays).map(day => [day,
  day === 'sunday' ? [] : Array.from({ length: day === 'saturday' ? 9 : 15 }, (_value, index) => ({ minute: 360 + index * 60, stopPointId: 'PIPERS-A', journeyIdentity: `BODS-${day}-${index}`, provider: 'BODS' }))
]));
const pipersTndsWeekly = Object.fromEntries(Object.keys(weekdays).map(day => [day,
  Array.from({ length: 15 }, (_value, index) => ({ minute: 360 + index * 60, stopPointId: 'PIPERS-A', journeyIdentity: `TNDS-${day}-${index}`, provider: 'TNDS' }))
]));
const pipers230WeeklyAuthority = buildPlannerBusServiceSummaries([
  {
    ...plannerBase, id: 'pipers-bods-230-circular', routeNumber: '230', operator: 'Centrebus', direction: 'Caddington Woods, Lyons Community Centre',
    origin: 'Lyons Community Centre', destination: 'Lyons Community Centre', provider: 'BODS', timetableSource: 'BODS', source: { provider: 'BODS' },
    circular: true, circularPatternStopIds: ['PIPERS-A', 'MID-1', 'MID-2', 'PIPERS-A'], departureEvidenceByDay: pipersBodsWeekly
  },
  {
    ...plannerBase, id: 'pipers-tnds-230-open', routeNumber: '230', operator: 'Centrebus South', direction: 'outbound',
    origin: 'Lyons Community Centre', destination: 'Caddington Woods', provider: 'TNDS', timetableSource: 'TNDS', source: { provider: 'TNDS' },
    circular: false, circularPatternStopIds: [], departureEvidenceByDay: pipersTndsWeekly
  },
  {
    ...plannerBase, id: 'pipers-tnds-231-only', routeNumber: '231', operator: 'South Beds Dial-a-Ride', direction: 'outbound',
    origin: 'Brickhill Park', destination: 'Dunstable Asda', provider: 'TNDS', timetableSource: 'TNDS', source: { provider: 'TNDS' },
    circular: false, circularPatternStopIds: [], departureEvidenceByDay: pipersTndsWeekly
  }
], [stop]);
const pipers230Primary = pipers230WeeklyAuthority.find(row => row.routeNumber === '230');
assert.ok(pipers230Primary, 'Pipers BODS/TNDS route 230 must produce a principal planner row.');
assert.deepEqual(pipers230Primary.canonicalDeparturePopulation.sunday, [], 'BODS explicit Sunday no-service must not be overwritten by TNDS departures for the same public route at the same stop.');
assert.match(pipers230Primary.typicalFrequencyText, /Sun: No scheduled service/i, 'BODS-primary route 230 presentation must retain its day-specific Sunday no-service calendar.');
assert.equal(pipers230Primary.circular, true, 'TNDS open-pattern evidence must not replace the BODS circular principal.');
assert.ok(pipers230WeeklyAuthority.some(row => row.routeNumber === '231'), 'a TNDS-only neighboring route must remain available.');
const calendarSupplement = buildPlannerBusServiceSummaries([
  { ...plannerBase, id: 'bods-ordinary', routeNumber: 'X4', provider: 'BODS', timetableSource: 'BODS', source: { provider: 'BODS' }, departureEvidenceByDay: departureEvidence(hourlyMinutes, 'BODS') },
  { ...plannerBase, id: 'tnds-school-pattern', routeNumber: 'X4', provider: 'TNDS', timetableSource: 'TNDS', calendarProfileId: 'school-day', calendarEvidence: [{ calendarProfileId: 'school-day', schoolDayOnly: true, calendarResolved: true, daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] }], source: { provider: 'TNDS', calendarProfileId: 'school-day' }, departureEvidenceByDay: departureEvidence([390, 450], 'TNDS', 'school-day') }
], [stop]);
assert.equal(calendarSupplement.length, 1, 'regular and school-specific timetable patterns remain grouped to the same public service');
assert.ok(calendarSupplement[0].typicalFrequencyLines.some(line => /60\s*mins/i.test(line)), `the regular BODS principal timetable remains visible beside a school-specific supplement: ${calendarSupplement[0].typicalFrequencyLines.join(' / ')}`);
assert.ok(calendarSupplement[0].typicalFrequencyLines.some(line => /school/i.test(line)), 'the distinct school-specific TNDS calendar remains qualified');
const planner = buildPlannerBusServiceSummaries([
  { ...plannerBase, id: 'bods-main', operator: 'Centrebus', timetableSource: 'BODS', source: { provider: 'BODS' } },
  { ...plannerBase, id: 'tnds-corroboration', operator: 'Centrebus South', timetableSource: 'TNDS', source: { provider: 'TNDS' } }
], [stop]);
assert.equal(planner.length, 1, 'matching BODS/TNDS evidence for one direction forms one planner row');
assert.equal(planner[0].operator, 'Centrebus', 'operator display comes from winning BODS evidence when feeds corroborate one row');
const mixedAuthorityCircularPlanner = buildPlannerBusServiceSummaries([
  {
    ...plannerBase, id: 'bods-230-loop', routeNumber: '230', operator: 'Centrebus', direction: 'outbound',
    timetableSource: 'BODS', provider: 'BODS', source: { provider: 'BODS', provenance: 'BODS GTFS frozen-source preparation' },
    circular: true, circularPatternStopIds: ['PIPERS-A', 'MID-1', 'MID-2', 'PIPERS-A'],
    routePatternStopIds: [], sourceRecordIds: ['bods-230-loop']
  },
  {
    ...plannerBase, id: 'tnds-230-open', routeNumber: '230', operator: 'Centrebus South', direction: 'outbound',
    timetableSource: 'TNDS', provider: 'TNDS', source: { provider: 'TNDS' }, circular: false,
    circularPatternStopIds: [], routePatternStopIds: ['PIPERS-A', 'MID-1', 'MID-2', 'REMOTE-END'],
    sourceRecordIds: ['tnds-230-open']
  }
], [stop]);
assert.equal(mixedAuthorityCircularPlanner.length, 1, 'BODS and TNDS patterns for one public route form one planner row');
assert.equal(mixedAuthorityCircularPlanner[0].circular, true, 'open TNDS supplementation cannot replace a closed BODS primary circular decision');
assert.equal(mixedAuthorityCircularPlanner[0].circularServiceDecision.principalSourceRecordId, 'bods-230-loop', 'circular principal follows source authority priority rather than longest supplementary pattern');
const tflOperatorFallback = buildPlannerBusServiceSummaries([
  { ...plannerBase, id: 'tfl-authority-r1', operator: 'Operator not supplied in the timetable', timetableSource: 'TfL', source: { provider: 'TfL' }, sourceRecordIds: ['tfl-r1'], sourceRouteIds: ['route-r1'] },
  { ...plannerBase, id: 'bods-copy-r1', operator: 'Arriva London North', timetableSource: 'BODS', provider: 'BODS', source: { provider: 'BODS' }, sourceRecordIds: ['bods-r1'], sourceRouteIds: ['route-r1'] }
], [stop]);
assert.equal(tflOperatorFallback.length, 1);
assert.equal(tflOperatorFallback[0].timetableSource, 'TfL', 'the direct TfL timetable remains the winning source');
assert.equal(tflOperatorFallback[0].operator, 'Arriva London North', 'a structurally corroborated named BODS operator can fill the missing TfL operator label');

console.log('PASS S2E planner corrections: stop-scoped departures and authority-scoped circular arbitration.');
