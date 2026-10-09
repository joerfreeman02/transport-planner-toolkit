import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isOtherNearbyStopRecord, plannerFacingServiceNote } from '../../src/atlas/domain/bus-source-presentation.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { collectServiceWarnings } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const coachRecord = { id: '490006586T', name: 'Cecil Road', transportMode: 'bus_coach', routes: [], status: 'active', timetableMatch: false };
assert.equal(isOtherNearbyStopRecord(coachRecord), true, 'an active route-less coach-mode record is retained as other nearby evidence');
assert.equal(isOtherNearbyStopRecord({ ...coachRecord, timetableMatch: true }), false, 'a matched timetable record remains route-bearing evidence');
assert.equal(isOtherNearbyStopRecord({ ...coachRecord, routes: ['313'] }), false, 'route metadata keeps a coach-mode record in the normal stop table');
assert.equal(isOtherNearbyStopRecord({ id: 'BUS-X', routes: [], transportMode: 'bus' }), false, 'ordinary bus candidate status is not reclassified');
assert.equal(plannerFacingServiceNote('Additional short workings and timetable variants operate.').length, 0);
assert.equal(plannerFacingServiceNote('Some route 313 journeys operate to Crown Road (EN1). Additional short workings and timetable variants operate.'), 'Some route 313 journeys operate to Crown Road (EN1).', 'only a generic banner is removed; evidenced short-working wording remains');
assert.deepEqual(collectServiceWarnings([{ qualifications: ['Full TfL route origin and destination were not deterministically established.', 'Operator identity was not deterministically supplied for one timetable pattern.'] }]), [], 'routine route/operator metadata absence stays in technical evidence unless a planner-facing identity cannot be established');

const routeStop = { id: '490001101K', name: 'Enfield Town Station', transportMode: 'bus', routes: ['121'], walking: { status: 'routed', distanceMetres: 110 }, cycling: { status: 'routed', distanceMetres: 130 } };
const matchedCoach = { ...coachRecord, id: 'COACH-MATCHED', timetableMatch: true, timetableEvidenceStatus: 'MATCHED', routes: [] };
const wordStopRows = buildBusWordTables({ ok: true, stops: [routeStop, coachRecord, matchedCoach], plannerServiceSummaries: [], serviceSummaries: [] })[0].rows;
assert.equal(wordStopRows.length, 2, 'Word excludes only the non-route-evidenced coach record');
assert.ok(wordStopRows.some(row => row[1] === 'Enfield Town Station'));
assert.ok(wordStopRows.some(row => row[1] === 'Cecil Road' && row[5].includes('Timetable evidence matched')));
const app = fs.readFileSync(new URL('../../atlas/assets/js/app.mjs', import.meta.url), 'utf8');
assert.match(app, /Other nearby stop records — no route information currently available \(\$\{otherNearbyRecords\.length\}\)/);
assert.match(app, /These records remain on the map and in the detailed source evidence/);
assert.match(app, /result\.stops\.filter\(stop => !isOtherNearbyStopRecord\(stop\)\)/);
assert.match(app, /other-nearby-stop-table/);
assert.match(app, /Walking distance \/ time/);
assert.match(app, /Technical source note/);
assert.match(app, /operator: \$\{service\.operator \|\| 'not supplied'\}/);

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const weekday = Object.fromEntries(days.map(day => [day, day === 'sunday' ? [] : [420, 480, 540]]));
const plannerRecord = ({ id, calendarProfileId = 'ordinary', origin = 'Enfield Town Station', destination = 'Potters Bar Railway Station', pattern = ['ORIGIN', 'CROWN', 'MID', 'DEST'], serviceNote = '' }) => ({
  id, sourceRecordIds: [id], routeNumber: '313', operator: 'TfL operator', provider: 'TfL', timetableSource: 'TfL',
  sourceAuthorities: ['TfL'], sourceProviders: ['TfL'], source: { provider: 'TfL', sourceRouteIds: ['313'] },
  origin, destination, direction: 'outbound', directionFamily: 'outbound',
  originStopPointId: pattern[0], destinationStopPointId: pattern.at(-1), originStopPointIds: [pattern[0]], destinationStopPointIds: [pattern.at(-1)],
  routePatternStopIds: pattern, routePatternStops: pattern.map(id => ({ id, name: id })), routePatternExtent: pattern.length,
  orderedPatternEndpoints: [pattern[0], pattern.at(-1)], stopIds: ['MID'], assessedStops: ['MID'], principalLocations: ['Enfield'],
  departuresByDay: weekday, departureEvidenceByDay: Object.fromEntries(days.map(day => [day, weekday[day].map(minute => ({ minute, stopPointId: 'MID', journeyIdentity: `${id}-${day}-${minute}`, provider: 'TfL' }))])),
  calendarProfileId, calendarProfileLabel: calendarProfileId, calendarEvidence: [], serviceNote,
  frequencyBasisStopId: 'MID', frequencyEvidence: [], recordActivity: 12, operatingPeriods: {}
});

const calendarOnly = buildPlannerBusServiceSummaries([
  plannerRecord({ id: 'ordinary' }),
  plannerRecord({ id: 'school', calendarProfileId: 'school-day', pattern: ['ORIGIN', 'CROWN', 'MID', 'ALT', 'DEST'], serviceNote: 'Route operates on school days only.' })
], [routeStop]);
assert.equal(calendarOnly.length, 1);
assert.doesNotMatch(`${calendarOnly[0].plannerNotes?.shortWorkings ?? ''} ${calendarOnly[0].plannerNotes?.additionalServices ?? ''}`, /Additional short workings and timetable variants operate/i, 'calendar and timetable differences do not create a structured planner annotation');
const calendarWord = buildBusWordTables({ ok: true, stops: [routeStop], plannerServiceSummaries: calendarOnly, serviceSummaries: [] })
  .flatMap(table => table.rows ?? []).map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? '')).join(' ');
assert.doesNotMatch(calendarWord, /Additional short workings and timetable variants operate/i, 'calendar-only differences do not leak the legacy generic note to Word');

const explicitShortWorking = buildPlannerBusServiceSummaries([
  plannerRecord({ id: 'ordinary' }),
  plannerRecord({ id: 'crown-short', origin: 'Crown Road (EN1)', pattern: ['CROWN', 'MID', 'DEST'] })
], [routeStop]);
const explicitNote = `${explicitShortWorking[0]?.plannerNotes?.shortWorkings ?? ''} ${explicitShortWorking[0]?.plannerNotes?.additionalServices ?? ''}`;
assert.doesNotMatch(explicitNote, /Additional short workings and timetable variants operate/i);
assert.match(explicitNote, /Crown Road \(EN1\)|Crown Road|Potters Bar Railway Station/i, 'a proven short working keeps its named endpoint evidence');

console.log('PASS BUS-ROBUSTNESS-1A4D stop-record presentation, Word exclusion, named variant evidence, and calendar-only note suppression.');
