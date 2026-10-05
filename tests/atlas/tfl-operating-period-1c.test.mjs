import assert from 'node:assert/strict';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const week = values => Object.fromEntries(DAYS.map(day => [day, values?.[day] ?? []]));
const evidenceWeek = entries => Object.fromEntries(DAYS.map(day => [day, entries?.[day] ?? []]));
const stop = { id: 'NATIONAL-STOP', name: 'Boundary stop', indicator: 'A', routes: ['R1'], timetableAuthority: 'NaPTAN', timetableAuthorities: ['NaPTAN'], routeAuthorities: { R1: ['BODS'] }, walking: { status: 'routed', distanceMetres: 10 }, distanceMetres: 10 };
const tflStop = { id: 'TFL-STOP', name: 'Boundary TfL stop', indicator: 'B', routes: ['R1'], timetableAuthority: 'TfL', timetableAuthorities: ['TfL'], routeAuthorities: { R1: ['TfL'] }, walking: { status: 'routed', distanceMetres: 20 }, distanceMetres: 20 };
const site = { latitude: 51.6857829, longitude: -0.0330001 };

function entry(minute, provider, journeyIdentity) {
  return { minute, stopPointId: stop.id, provider, primaryAuthority: provider, journeyIdentity, routeNumber: 'R1', direction: 'Destination', origin: 'Origin', destination: 'Destination' };
}

function composition({ tflResult = null, nationalData = [], tflStopResult = null } = {}) {
  const tfl = {
    routeMetadataForLines: async () => ({ ok: true, data: [] }),
    servicesForStop: async ({ stopPointId }) => stopPointId === stop.id && tflResult
      ? { ok: true, data: [tflResult], warnings: [], provenance: { timetableConclusion: 'MATCHED' } }
      : tflStopResult || { ok: true, data: [], warnings: [], provenance: { timetableConclusion: 'NO_CURRENT_MATCH' } }
  };
  const national = { servicesForStops: async () => ({ ok: true, data: nationalData, warnings: [], provenance: { source: 'BODS', timetableConclusion: 'MATCHED' } }) };
  return createAuthoritativeBusTimetableAdapter({ tflAdapter: tfl, nationalAdapter: national, londonSupplementAdapter: national });
}

function service({ provider, minutes, entries, id = `${provider}-R1`, calendarProfileId = null, operatingPeriodEvidence = [] }) {
  return {
    id, routeNumber: 'R1', operator: 'Example operator', origin: 'Origin', destination: 'Destination', direction: 'Destination',
    provider, primaryAuthority: provider, timetableSource: provider,
    source: { provider, primaryAuthority: provider, routeId: 'R1' }, calendarProfileId,
    stopSchedules: { [stop.id]: week({ monday: minutes }) },
    departureEvidenceByDay: evidenceWeek({ monday: entries }), operatingPeriodEvidence
  };
}

const tflOne = service({ provider: 'TfL', minutes: [480], entries: [entry(480, 'TfL', 'journey-1')], operatingPeriodEvidence: [{ provider: 'TfL', stopPointId: stop.id, day: 'monday', fromMinute: 480, toMinute: 540 }] });
const bodsOne = service({ provider: 'BODS', minutes: [700], entries: [entry(700, 'BODS', 'journey-1-bods')] });
const adapter = composition({ tflResult: tflOne, nationalData: [bodsOne] });
const composed = await adapter.servicesForStops([stop, tflStop], { site });
assert.equal(composed.ok, true);
const composedTfl = composed.data.find(item => item.provider === 'TfL');
assert.ok(composedTfl, 'successful TfL evidence is retained as a TfL-primary record');
assert.deepEqual(composedTfl.stopSchedules[stop.id].monday, [480], 'supplementary BODS minutes do not enter authoritative stopSchedules');
assert.deepEqual(composedTfl.departureEvidenceByDay.monday.map(item => item.minute), [480], 'supplementary BODS minutes do not enter authoritative departureEvidenceByDay');
assert.deepEqual(composedTfl.supplementaryDepartureEvidenceByDay.monday.map(item => item.minute), [700], 'supplementary BODS evidence remains attached for audit');
assert.equal(composedTfl.primaryAuthority, 'TfL');

const [summary] = buildServiceSummaries([stop, tflStop], composed.data);
const [plannerRow] = buildPlannerBusServiceSummaries([summary], [stop, tflStop]);
assert.equal(plannerRow.frequencyByDay.monday.departureCount, 1, 'one physical journey represented by TfL and BODS remains one planner journey');
assert.deepEqual(plannerRow.departuresByDay.monday, [480]);
assert.equal(plannerRow.operatingPeriods.monday.firstMinute, 480);
assert.deepEqual(summary.operatingPeriodAuthority.supplementaryProviders, ['BODS']);
assert.equal(summary.operatingPeriodAuthority.supplementaryDepartureEvidenceRetained.monday[0].minute, 700);
assert.match(summary.operatingPeriodAuthority.auditWarnings.join(' '), /retained for audit/);
assert.equal(plannerRow.operatingPeriodEvidenceState, 'resolved', 'supplementary span differences do not change resolved TfL authority');
assert.equal(plannerRow.operatingPeriodReviewRequired, false, 'resolved TfL authority does not require planner review');
assert.equal(plannerRow.plannerNotes.reviewNote, null, 'resolved TfL authority has no planner review note');
assert.doesNotMatch(plannerRow.serviceNote, /BODS departure evidence was retained for audit/);
const word = buildBusWordTables({ ok: true, stops: [stop, tflStop], plannerServiceSummaries: [plannerRow], serviceSummaries: [summary] });
const wordText = JSON.stringify(word);
assert.doesNotMatch(wordText, /BODS departure evidence was retained for audit/);
assert.doesNotMatch(wordText, /Operating-period evidence requires review before formal use/);

const tflTwo = service({ provider: 'TfL', minutes: [480, 600], entries: [entry(480, 'TfL', 'journey-1'), entry(600, 'TfL', 'journey-2')] });
const twoComposed = await composition({ tflResult: tflTwo, nationalData: [bodsOne] }).servicesForStops([stop, tflStop], { site });
const [twoSummary] = buildServiceSummaries([stop, tflStop], twoComposed.data);
const [twoRow] = buildPlannerBusServiceSummaries([twoSummary], [stop, tflStop]);
assert.equal(twoRow.frequencyByDay.monday.departureCount, 2, 'two distinct TfL journeys remain two journeys');

const fallbackNational = service({ provider: 'BODS', minutes: [720], entries: [entry(720, 'BODS', 'fallback-journey')] });
const fallback = await composition({ tflResult: null, nationalData: [fallbackNational], tflStopResult: { ok: false, code: 'timeout', warnings: [], provenance: { timetableConclusion: 'UNRESOLVED' } } }).servicesForStops([stop, tflStop], { site });
const fallbackService = fallback.data.find(item => /fallback/i.test(item.timetableSource || item.source?.fallbackFor || ''));
assert.ok(fallbackService, 'national evidence remains available through explicit TfL fallback');
assert.match(fallbackService.timetableSource, /BODS fallback/);
assert.equal(fallbackService.primaryAuthority, 'BODS');

const nationalOnly = await composition({ nationalData: [service({ provider: 'BODS', minutes: [720], entries: [entry(720, 'BODS', 'national-journey')] })] }).servicesForStops([stop], { site });
assert.equal(nationalOnly.data[0].primaryAuthority, 'BODS', 'BODS-only national service remains national-primary');

const conflictRecord = {
  ...service({ provider: 'TfL', minutes: [600, 900], entries: [entry(600, 'TfL', 'conflict-1'), entry(900, 'TfL', 'conflict-2')] }),
  operatingPeriodEvidence: [{ provider: 'TfL', stopPointId: stop.id, day: 'monday', fromMinute: 1100, toMinute: 1200 }]
};
const [conflictSummary] = buildServiceSummaries([stop], [conflictRecord]);
const [conflictRow] = buildPlannerBusServiceSummaries([conflictSummary], [stop]);
assert.equal(conflictRow.operatingPeriodEvidenceState, 'conflict');
assert.equal(conflictRow.plannerNotes.reviewNote, 'Operating-period evidence requires review before formal use.');
assert.match(JSON.stringify(conflictRow.operatingPeriodReviewWarnings), /materially disjoint/);

console.log('PASS BUS-TFL-PERIOD-1C authority-population separation, fallback, national-primary and presentation controls.');
