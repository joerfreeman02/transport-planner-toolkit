import assert from 'node:assert/strict';
import {
  endpointPlaceKeys,
  hasResolvedExactEndpointEvidence,
  makePublicServiceGroupingDecision,
  makeTerminusDecision,
  sourceAuthorityRank
} from '../../src/atlas/domain/bus-grouping.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const ordinaryWeek = Object.fromEntries(DAYS.map(day => [day, [420]]));

function exactEndpoint(place, stopPointId, stopAreaId) {
  return {
    chosen: place,
    chosenDisplayName: place,
    decisionType: 'exact-endpoint-resolved',
    exact: true,
    exactEvidence: true,
    primaryEndpointStopPointId: stopPointId,
    endpointStopPointId: stopPointId,
    endpointStopPointIds: [stopPointId],
    stopArea: { id: stopAreaId, name: place },
    stopAreas: [{ id: stopAreaId, name: place }],
    evidence: { endpointEvidenceSet: [{ endpointStopPointId: stopPointId }] }
  };
}

function fictionalRecord({
  id,
  routeNumber = 'Q1',
  provider = 'BODS',
  operator = 'Fictional Transit',
  origin = 'Alpha Depot',
  destination = 'Beta Terminal',
  originStopPointId = 'A1',
  destinationStopPointId = 'B1',
  originArea = 'area:ALPHA',
  destinationArea = 'area:BETA',
  pattern = ['A1', 'MID1', 'B1'],
  sourceRouteIds = ['fictional-line'],
  calendarProfileId = 'ordinary',
  serviceNote = '',
  departuresByDay = ordinaryWeek,
  endpointEvidence,
  ...extra
} = {}) {
  return {
    id,
    routeNumber,
    operator,
    provider,
    source: { provider },
    timetableSource: provider,
    origin,
    destination,
    originStopPointId,
    destinationStopPointId,
    originStopPointIds: [originStopPointId],
    destinationStopPointIds: [destinationStopPointId],
    originEndpointDecision: exactEndpoint(origin, originStopPointId, originArea),
    destinationEndpointDecision: exactEndpoint(destination, destinationStopPointId, destinationArea),
    ...(endpointEvidence ? { endpointEvidence } : {}),
    routePatternStopIds: pattern,
    routePatternStops: pattern.map(id => ({ id, name: id })),
    routePatternExtent: pattern.length,
    direction: destination,
    directionFamily: destination,
    sourceRouteIds,
    stopIds: pattern,
    principalLocations: ['Fictional Interchange'],
    departuresByDay,
    departureEvidenceByDay: Object.fromEntries(DAYS.map(day => [day, (departuresByDay[day] ?? []).map(minute => ({ minute, journeyIdentity: `${id}-${day}-${minute}`, stopPointId: 'A1', provider }))])),
    calendarProfileId,
    serviceNote,
    recordActivity: 10,
    frequencyBasisStopId: 'A1',
    frequencyEvidence: [],
    sourceRecordIds: [id],
    ...extra
  };
}

const unresolvedPrepared = {
  endpointEvidence: {
    destination: {
      raw: { rawGtfsStopCode: 'RAW-B1', exactMatchMethod: 'unresolved' }
    }
  },
  destinationEndpointDecision: { chosen: 'Beta Terminal', decisionType: 'unresolved-review', exact: false, conflict: false }
};
assert.equal(hasResolvedExactEndpointEvidence(unresolvedPrepared, 'destination'), false);
assert.deepEqual(endpointPlaceKeys(unresolvedPrepared, 'destination'), []);

const resolvedPrepared = {
  endpointEvidence: {
    destination: {
      resolved: { resolvedStopPointId: 'B1', exactMatchMethod: 'gtfs-stop-id-equals-atco-code', stopAreas: [{ id: 'area:BETA', name: 'Beta Terminal' }] }
    }
  }
};
assert.equal(hasResolvedExactEndpointEvidence(resolvedPrepared, 'destination'), true);
assert.ok(endpointPlaceKeys(resolvedPrepared, 'destination').includes('stop-area:area beta'));

assert.equal(sourceAuthorityRank({ provider: 'TfL', timetableSource: 'TfL + BODS supplementary' }), 3);
assert.equal(sourceAuthorityRank({ provider: 'BODS', timetableSource: 'BODS fallback after TfL failure' }), 2);
assert.equal(sourceAuthorityRank({ provider: 'TNDS', timetableSource: 'TNDS fallback after TfL unresolved' }), 2);

const main = fictionalRecord({ id: 'q1-main' });
const duplicate = fictionalRecord({ id: 'q1-duplicate', operator: 'Operator not supplied', provider: 'TNDS' });
const short = fictionalRecord({ id: 'q1-short', destination: 'Midpoint', destinationStopPointId: 'MID1', destinationArea: 'area:MIDPOINT', pattern: ['A1', 'MID1'], serviceNote: 'Additional short working.' });
const branch = fictionalRecord({ id: 'q1-branch', destination: 'Gamma Branch', destinationStopPointId: 'G1', destinationArea: 'area:GAMMA', pattern: ['A1', 'X1', 'G1'] });
const school = fictionalRecord({ id: 'q1-school', routeNumber: 'Q1', calendarProfileId: 'school-day', serviceNote: 'School-day-only journey towards Midpoint.', destination: 'Midpoint', destinationStopPointId: 'MID1', destinationArea: 'area:MIDPOINT', pattern: ['A1', 'MID1'] });

const decision = makePublicServiceGroupingDecision({ services: [main, duplicate, short, branch, school], principal: main });
assert.ok(decision.deduplicatedSourceRecordIds.includes('q1-duplicate'));
assert.ok(!decision.deduplicatedSourceRecordIds.includes('q1-short'));
assert.ok(decision.shortWorkingRecordIds.includes('q1-short'));
assert.ok(decision.branchVariantRecordIds.includes('q1-branch'));
assert.ok(decision.calendarVariantRecordIds.includes('q1-school'));
assert.ok(decision.variantDestinationEvidence.some(item => item.routeNumber === 'Q1' && item.destination === 'Midpoint'));

const unresolvedDuplicate = fictionalRecord({ id: 'q1-unresolved' });
unresolvedDuplicate.destinationEndpointDecision = { chosen: 'Beta Terminal', decisionType: 'unresolved-review', exact: false };
assert.equal(makePublicServiceGroupingDecision({ services: [main, unresolvedDuplicate], principal: main }).deduplicatedSourceRecordIds.length, 0);

const assessedStops = [
  { id: 'A1', name: 'Alpha stop', stopAreaId: 'area:ALPHA', stopAreaName: 'Alpha Interchange', walking: { status: 'routed', distanceMetres: 100 } },
  { id: 'B1', name: 'Beta stop', stopAreaId: 'area:BETA', stopAreaName: 'Beta Terminal', walking: { status: 'routed', distanceMetres: 300 } },
  { id: 'B2', name: 'Beta stand', stopAreaId: 'area:BETA', stopAreaName: 'Beta Terminal', walking: { status: 'routed', distanceMetres: 310 } },
  { id: 'A2', name: 'Alpha stand', stopAreaId: 'area:ALPHA', stopAreaName: 'Alpha Interchange', walking: { status: 'routed', distanceMetres: 110 } }
];
const terminusService = fictionalRecord({ id: 'q1-terminus', origin: 'Remote Origin', originStopPointId: 'O1', originArea: 'area:REMOTE', pattern: ['O1', 'MID1', 'B1'] });
const terminus = makeTerminusDecision({ services: [terminusService], principal: terminusService, assessedStops });
assert.ok(terminus.evidence.candidatePlaceKeys.includes('stop-area:area beta'));
assert.equal(terminus.assessedPlace, 'Beta Terminal');

const ambiguous = fictionalRecord({ id: 'q1-ambiguous', origin: 'Remote Origin', originStopPointId: 'O1', originArea: 'area:REMOTE', destination: 'Beta Terminal', destinationStopPointId: 'B1', destinationArea: 'area:BETA', pattern: ['O1', 'B1', 'G1'] });
ambiguous.endpointEvidence = {
  destination: {
    beta: { resolvedStopPointId: 'B1', exactMatchMethod: 'gtfs-stop-id-equals-atco-code', stopAreas: [{ id: 'area:BETA', name: 'Beta Terminal' }] },
    gamma: { resolvedStopPointId: 'G1', exactMatchMethod: 'gtfs-stop-id-equals-atco-code', stopAreas: [{ id: 'area:GAMMA', name: 'Gamma Terminal' }] }
  }
};
const ambiguousStops = [
  { id: 'A1', name: 'Alpha stop', stopAreaId: 'area:ALPHA', walking: { status: 'routed', distanceMetres: 100 } },
  { id: 'B1', name: 'Beta stop', stopAreaId: 'area:BETA', walking: { status: 'routed', distanceMetres: 250 } },
  { id: 'G1', name: 'Gamma stop', stopAreaId: 'area:GAMMA', walking: { status: 'routed', distanceMetres: 250 } }
];
const ambiguousDecision = makeTerminusDecision({ services: [ambiguous], principal: ambiguous, assessedStops: ambiguousStops });
assert.equal(ambiguousDecision.status, 'unresolved-review');
assert.equal(ambiguousDecision.presentation, 'none');

const plannerRows = buildPlannerBusServiceSummaries([main, duplicate, short, branch, school], assessedStops);
assert.ok(plannerRows.length >= 2, 'the fictional branch remains a separate public row while the ordinary/short/calendar records retain grouped evidence');
const plannerText = plannerRows.map(row => `${row.serviceNote} ${row.routeGroupNote ?? ''} ${row.routeVariantNote ?? ''}`).join(' ');
assert.match(plannerText, /Q1/);
assert.match(plannerText, /Midpoint/);
assert.match(plannerText, /school days only/i);
const wordTables = buildBusWordTables({ ok: true, stops: assessedStops, plannerServiceSummaries: plannerRows, serviceSummaries: [] });
const wordText = wordTables.flatMap(table => table.rows ?? []).map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? '')).join(' ');
assert.match(wordText, /Q1/);
assert.match(wordText, /school days only/i);

console.log('PASS BUS-GROUP-1A exactness, authority, audit, calendar, route attribution, service-relevant terminus, ambiguity, and fictional generalisation controls.');
