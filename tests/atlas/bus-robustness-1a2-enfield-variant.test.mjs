import assert from 'node:assert/strict';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { buildPlannerBusServiceSummaries, plannerAnnotationTaxonomy } from '../../src/atlas/domain/bus-planner-summary.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const week = Object.freeze(Object.fromEntries(DAYS.map(day => [day, [420, 480]])));
const weekday = Object.freeze(Object.fromEntries(DAYS.map(day => [day, day === 'saturday' || day === 'sunday' ? [] : [420, 480]])));
const stops = [{ id: 'A', name: 'Assessed stop', distanceMetres: 80, walking: { status: 'routed', distanceMetres: 80 } }];

function endpoint(name, stopPointId, area = `area:${name.toLowerCase().replaceAll(' ', '-')}`) {
  return {
    chosen: name,
    chosenDisplayName: name,
    decisionType: 'exact-endpoint-resolved',
    exact: true,
    exactEvidence: true,
    endpointStopPointId: stopPointId,
    endpointStopPointIds: [stopPointId],
    primaryEndpointStopPointId: stopPointId,
    stopArea: { id: area, name },
    stopAreas: [{ id: area, name }]
  };
}

function record({
  id,
  routeNumber = 'X1',
  origin = 'Origin',
  destination = 'Main Terminal',
  originStopPointId = 'O',
  destinationStopPointId = 'B',
  destinationArea = 'area:main',
  pattern = ['O', 'A', 'B'],
  calendarProfileId = 'ordinary',
  departuresByDay = week,
  serviceNote = '',
  destinationEndpointDecision = endpoint(destination, destinationStopPointId, destinationArea),
  ...extra
} = {}) {
  return {
    id,
    routeNumber,
    operator: 'Example Buses',
    provider: 'TfL',
    source: { provider: 'TfL' },
    timetableSource: 'TfL',
    origin,
    destination,
    direction: 'outbound',
    directionFamily: 'outbound',
    originStopPointId,
    destinationStopPointId,
    originStopPointIds: [originStopPointId],
    destinationStopPointIds: [destinationStopPointId],
    originEndpointDecision: endpoint(origin, originStopPointId, 'area:origin'),
    destinationEndpointDecision,
    routePatternStopIds: pattern,
    routePatternStops: pattern.map(id => ({ id, name: id })),
    routePatternExtent: pattern.length,
    stopIds: ['A'],
    assessedStops: ['A'],
    principalLocations: ['Example town'],
    departuresByDay,
    departureEvidenceByDay: Object.fromEntries(DAYS.map(day => [day, (departuresByDay[day] ?? []).map((minute, index) => ({ minute, journeyIdentity: `${id}-${day}-${index}`, stopPointId: 'A', provider: 'TfL' }))])),
    calendarProfileId,
    serviceNote,
    sourceRecordIds: [id],
    frequencyBasisStopId: 'A',
    recordActivity: 10,
    ...extra
  };
}

function directTaxonomy({ variantDestination, variantResolvedDestination = variantDestination, variantKind = 'short-working' }) {
  const main = record({ id: 'main', destination: 'Main Terminal', destinationStopPointId: 'B', destinationArea: 'area:main' });
  const variant = record({
    id: 'variant',
    destination: variantResolvedDestination,
    destinationStopPointId: 'C',
    destinationArea: 'area:variant',
    pattern: ['A', 'C'],
    destinationEndpointDecision: variantResolvedDestination === 'Destination not supplied'
      ? { chosen: 'Destination not supplied', chosenDisplayName: 'Destination not supplied', decisionType: 'unresolved-review', unresolved: true }
      : endpoint(variantResolvedDestination, 'C', 'area:variant')
  });
  const row = {
    routeNumber: 'X1',
    origin: main.origin,
    destination: main.destination,
    destinationDecision: main.destinationEndpointDecision,
    rawServiceSummaries: [main, variant],
    publicServiceGroupingDecision: {
      shortWorkingRecordIds: variantKind === 'short-working' ? ['variant'] : [],
      branchVariantRecordIds: variantKind === 'branch-variant' ? ['variant'] : [],
      deduplicatedSourceRecordIds: [],
      variantDestinationEvidence: [{ kind: variantKind, destination: variantDestination, sourceRecordIds: ['variant'] }]
    }
  };
  return { row, variant };
}

const pureCalendarRows = buildPlannerBusServiceSummaries([
  record({ id: 'calendar-school', routeNumber: 'CAL', calendarProfileId: 'school-day', departuresByDay: weekday, serviceNote: 'School-day-only service.' }),
  record({ id: 'calendar-non-school', routeNumber: 'CAL', calendarProfileId: 'non-school-day', departuresByDay: weekday, serviceNote: 'Non-school days only.' })
], stops);
assert.equal(pureCalendarRows.length, 1);
assert.equal(pureCalendarRows[0].serviceNote, '');
assert.equal(pureCalendarRows[0].routeVariantNote, null, 'calendar-only records do not create a generic variant note');
assert.equal(pureCalendarRows[0].routeGroupNote, null);
assert.equal(pureCalendarRows[0].plannerNotes.shortWorkings, null);

const resolvedPlaceholder = directTaxonomy({ variantDestination: 'Destination not supplied', variantResolvedDestination: 'Resolved Midpoint' });
const resolvedNotes = plannerAnnotationTaxonomy(resolvedPlaceholder.row);
assert.equal(resolvedNotes.shortWorkings, 'Some route X1 journeys operate to Resolved Midpoint');
assert.doesNotMatch(JSON.stringify(resolvedNotes), /Destination not supplied/);

const unresolvedPlaceholder = directTaxonomy({ variantDestination: 'Destination not supplied', variantResolvedDestination: 'Destination not supplied' });
const unresolvedNotes = plannerAnnotationTaxonomy(unresolvedPlaceholder.row);
assert.equal(unresolvedNotes.shortWorkings, null, 'unresolved short workings do not claim a planner-facing location');
assert.equal(unresolvedNotes.additionalServices, null);
assert.equal(unresolvedPlaceholder.row.publicServiceGroupingDecision.variantDestinationEvidence[0].destination, 'Destination not supplied', 'unresolved evidence remains in provenance');

const genuineShort = buildPlannerBusServiceSummaries([
  record({ id: 'genuine-main', routeNumber: 'GEN', destination: 'Main Terminal' }),
  record({ id: 'genuine-short', routeNumber: 'GEN', destination: 'Resolved Midpoint', destinationStopPointId: 'C', destinationArea: 'area:variant', pattern: ['O', 'A'] })
], stops).find(row => row.plannerNotes.shortWorkings) ?? buildPlannerBusServiceSummaries([
  record({ id: 'genuine-main-fallback', routeNumber: 'GEN', destination: 'Main Terminal' }),
  record({ id: 'genuine-short-fallback', routeNumber: 'GEN', destination: 'Resolved Midpoint', destinationStopPointId: 'C', destinationArea: 'area:variant', pattern: ['O', 'A'] })
], stops)[0];
assert.match(genuineShort.plannerNotes.shortWorkings ?? '', /Resolved Midpoint/);

const genuineBranchNotes = plannerAnnotationTaxonomy(directTaxonomy({ variantDestination: 'Branch Terminal', variantResolvedDestination: 'Branch Terminal', variantKind: 'branch-variant' }).row);
assert.match(genuineBranchNotes.additionalServices ?? '', /Branch Terminal/);
const genuineBranch = { ...genuineShort, routeNumber: 'BR', publicRouteFamilyKey: 'BR', plannerNotes: genuineBranchNotes };

const school657 = buildPlannerBusServiceSummaries([
  record({ id: '657-school', routeNumber: '657', calendarProfileId: 'school-day', departuresByDay: weekday, serviceNote: 'School-day-only service.' })
], stops)[0];
assert.equal(school657.serviceNote, 'School-day journeys only.');
assert.match(school657.plannerNotes.serviceQualification ?? '', /School-day journeys only/);
assert.doesNotMatch(`${school657.serviceNote} ${school657.routeGroupNote ?? ''}`, /Timetable may vary during school holidays/);

const normalRoute = buildPlannerBusServiceSummaries([record({ id: 'normal', routeNumber: 'N1' })], stops)[0];
assert.equal(normalRoute.routeGroupNote, null);
assert.equal(normalRoute.routeVariantNote, null);
assert.equal(normalRoute.plannerNotes.shortWorkings, null);

const wordText = buildBusWordTables({
  ok: true,
  stops,
  provenance: { stops: { retrievedAt: '2026-10-07T12:34:56Z' } },
  plannerServiceSummaries: [pureCalendarRows[0], genuineShort, genuineBranch, school657, normalRoute],
  serviceSummaries: []
})
  .flatMap(table => table.rows ?? [])
  .map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? ''))
  .join(' ');
assert.match(wordText, /Timetable note: Where separate term-time and school-holiday timetables are published, the term-time timetable is shown\./);
assert.match(wordText, /Timetable information reflects the data available to ATLAS on 2026-10-07/);
assert.doesNotMatch(wordText, /Service note: Timetable may vary during school holidays/);
assert.match(wordText, /Resolved Midpoint/);
assert.match(wordText, /Branch Terminal/);
assert.match(wordText, /School-day journeys only/);
assert.doesNotMatch(wordText, /Destination not supplied|Destination not resolved/);

console.log('PASS BUS-ROBUSTNESS-1A2 Enfield calendar-only, placeholder, unresolved, genuine variant, calendar, normal-route, and Browser/Word controls.');
