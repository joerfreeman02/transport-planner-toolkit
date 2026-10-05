import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const weekdaySchedule = Object.fromEntries(days.map(day => [day, day === 'saturday' || day === 'sunday' ? [] : [420]]));
const stops = [{ id: 'ASSESS', name: 'Assessment stop', walking: { status: 'routed', distanceMetres: 100 } }];

function endpointDecision({ id, label, locality = 'Context Town', area = 'Canonical Stop Area' }) {
  return {
    raw: label,
    rawEndpointText: label,
    chosen: label,
    chosenDisplayName: label,
    endpointStopPointId: id,
    endpointStopPointIds: [id],
    primaryEndpointStopPointId: id,
    endpointLogicalGroupIds: [`area:${area}`],
    stopArea: { id: `area:${area}`, name: area },
    stopAreas: [{ id: `area:${area}`, name: area }],
    nptgLocalityName: locality,
    exact: true,
    exactEvidence: true,
    hydrated: true,
    unresolved: false,
    conflict: false,
    evidenceSource: 'runtime-exact-endpoint',
    decisionType: 'exact-endpoint-resolved'
  };
}

function service({ id, destination, destinationId, destinationDecision, pattern, assessedStops = ['ASSESS'], serviceNote = '', calendarProfileId = 'ordinary' }) {
  return {
    id,
    routeNumber: 'X1',
    operator: 'Fixture Buses',
    origin: 'Origin',
    destination,
    direction: destination,
    directionFamily: 'outbound',
    originStopPointId: 'ORIGIN',
    destinationStopPointId: destinationId,
    routePatternStopIds: pattern,
    assessedStops,
    stopIds: assessedStops,
    sourceRouteIds: ['fixture-x1'],
    sourceRecordIds: [id],
    stopSchedules: { ASSESS: weekdaySchedule },
    departuresByDay: weekdaySchedule,
    departureEvidenceByDay: Object.fromEntries(days.map(day => (weekdaySchedule[day] ?? []).map(minute => ({ minute, stopPointId: 'ASSESS', calendarProfileId })))),
    calendarEvidence: calendarProfileId === 'school-day' ? [{ calendarProfileId, calendarResolved: true, daysOfWeek: days.slice(0, 5), schoolDayOnly: true }] : [],
    calendarProfileId,
    serviceNote,
    originEndpointDecision: endpointDecision({ id: 'ORIGIN', label: 'Origin', locality: 'Origin Town', area: 'Origin Area' }),
    destinationEndpointDecision: destinationDecision
  };
}

const aliasRows = buildPlannerBusServiceSummaries([
  service({
    id: 'alias-bare',
    destination: 'Bare Stop',
    destinationId: 'DEST-A',
    destinationDecision: endpointDecision({ id: 'DEST-A', label: 'Bare Stop' }),
    pattern: ['ORIGIN', 'DEST-A']
  }),
  service({
    id: 'alias-contextual',
    destination: 'Context Town (Bare Stop)',
    destinationId: 'DEST-A',
    destinationDecision: endpointDecision({ id: 'DEST-A', label: 'Context Town (Bare Stop)' }),
    pattern: ['ORIGIN', 'DEST-A']
  })
], stops);

assert.equal(aliasRows.length, 1, 'same canonical endpoint aliases remain one planner row');
assert.equal(aliasRows[0].destination, 'Context Town (Bare Stop)', 'contextual evidence-backed alias is preferred');
assert.equal(aliasRows[0].plannerNotes.shortWorkings, null, 'same endpoint aliases do not become short workings');
assert.equal(aliasRows[0].plannerNotes.additionalServices, null, 'same endpoint aliases do not become additional services');

const distinctRows = buildPlannerBusServiceSummaries([
  service({
    id: 'main',
    destination: 'Principal Terminal',
    destinationId: 'DEST-MAIN',
    destinationDecision: endpointDecision({ id: 'DEST-MAIN', label: 'Principal Terminal', area: 'Main Area' }),
    pattern: ['ORIGIN', 'MID', 'DEST-MAIN'],
    assessedStops: ['ASSESS', 'DEST-MAIN']
  }),
  service({
    id: 'short',
    destination: 'Intermediate Terminal',
    destinationId: 'DEST-SHORT',
    destinationDecision: endpointDecision({ id: 'DEST-SHORT', label: 'Intermediate Terminal', area: 'Short Area' }),
    pattern: ['ORIGIN', 'MID', 'DEST-SHORT'],
    assessedStops: ['ASSESS']
  })
], stops);

assert.equal(distinctRows.length, 1, 'genuine route variants remain one public direction');
assert.match(distinctRows[0].plannerNotes.shortWorkings ?? '', /Intermediate Terminal/, 'different endpoint retains short-working wording');

const school = service({
  id: 'school',
  destination: 'School Terminal',
  destinationId: 'DEST-SCHOOL',
  destinationDecision: endpointDecision({ id: 'DEST-SCHOOL', label: 'School Terminal', area: 'School Area' }),
  pattern: ['ORIGIN', 'DEST-SCHOOL'],
  calendarProfileId: 'school-day',
  serviceNote: 'School-day-only service.'
});
const schoolRows = buildPlannerBusServiceSummaries([school], stops);
assert.equal(schoolRows[0].serviceNote, 'School-day journeys only.');
assert.equal(schoolRows[0].departuresByDay.monday.length, 1);
assert.equal(schoolRows[0].departuresByDay.saturday.length, 0);

const ordinaryRows = buildPlannerBusServiceSummaries([service({
  id: 'ordinary',
  destination: 'Ordinary Terminal',
  destinationId: 'DEST-ORDINARY',
  destinationDecision: endpointDecision({ id: 'DEST-ORDINARY', label: 'Ordinary Terminal', area: 'Ordinary Area' }),
  pattern: ['ORIGIN', 'DEST-ORDINARY'],
  serviceNote: ''
})], stops);
assert.equal(ordinaryRows[0].serviceNote, '');
assert.equal(ordinaryRows[0].plannerNotes.serviceQualification, null);

console.log('PASS BUS-ENDPOINT-ALIAS-1 focused identity, label, short-working, calendar wording, and ordinary-service controls.');
