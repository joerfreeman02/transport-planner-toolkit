import assert from 'node:assert/strict';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { createBusStopDiscovery } from '../../src/atlas/application/bus-stop-discovery.mjs';

const schedule = departures => ({ monday: departures, tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });
const sourceSuccess = (source, data = [], provenance = {}) => ({ ok: true, data, evidence: [], warnings: [], provenance: { source, ...provenance } });
const sourceFailure = (source, warning = `${source} unavailable`) => ({ ok: false, code: 'offline', data: null, evidence: [], warnings: [warning], provenance: { source, unavailable: true } });
const routed = async (_site, stops) => ({ ok: true, routes: stops.map(stop => ({ status: 'routed', distanceMetres: Number(stop.walking?.distanceMetres) || 100, durationSeconds: 60 })), warnings: [], provenance: {} });

const nationalStop = { id: 'NATIONAL-STOP', name: 'National stop', routes: ['X'], timetableAuthority: 'NaPTAN', routeAuthorities: { X: ['NaPTAN'] } };
const tflStop = { id: 'TFL-STOP', name: 'TfL stop', routes: ['279'], timetableAuthority: 'TfL', routeAuthorities: { '279': ['TfL'] } };

const crossBoundary = createBusStopDiscovery({
  tflAdapter: { id: 'tfl', nearbyStops: async () => sourceSuccess('TfL', [{ ...tflStop }]) },
  naptanAdapter: { id: 'naptan', nearbyStops: async () => sourceFailure('NaPTAN', 'NaPTAN fixture unavailable') },
  londonCoverage: () => false,
  crossBoundaryTfL: true
});
const naptanFailureTfLSuccess = await crossBoundary.nearbyStops({ latitude: 51.7, longitude: -0.1 });
assert.equal(naptanFailureTfLSuccess.ok, true);
assert.equal(naptanFailureTfLSuccess.status, 'partial');
assert.equal(naptanFailureTfLSuccess.data.length, 1);
assert.equal(naptanFailureTfLSuccess.provenance.nationalStopSourceAvailable, false);
assert.equal(naptanFailureTfLSuccess.provenance.tflStopSourceAvailable, true);
assert.equal(naptanFailureTfLSuccess.provenance.stopCoverageComplete, false);
assert.match(naptanFailureTfLSuccess.warnings.join(' '), /NaPTAN fixture unavailable/);

const naptanFailureTfLZero = createBusStopDiscovery({
  tflAdapter: { id: 'tfl', nearbyStops: async () => sourceSuccess('TfL', []) },
  naptanAdapter: { id: 'naptan', nearbyStops: async () => sourceFailure('NaPTAN', 'NaPTAN source failed') },
  londonCoverage: () => false,
  crossBoundaryTfL: true
});
const zeroStops = await naptanFailureTfLZero.nearbyStops({ latitude: 51.7, longitude: -0.1 });
assert.equal(zeroStops.ok, true);
assert.equal(zeroStops.data.length, 0);
assert.equal(zeroStops.status, 'partial');
assert.equal(zeroStops.provenance.stopCoverageComplete, false);

const tflFailureNationalSuccess = createBusStopDiscovery({
  tflAdapter: { id: 'tfl', nearbyStops: async () => sourceFailure('TfL', 'TfL StopPoint source failed') },
  naptanAdapter: { id: 'naptan', nearbyStops: async () => sourceSuccess('NaPTAN', [{ ...nationalStop }]) },
  londonCoverage: () => false,
  crossBoundaryTfL: true
});
const tflFailure = await tflFailureNationalSuccess.nearbyStops({ latitude: 51.7, longitude: -0.1 });
assert.equal(tflFailure.ok, true);
assert.equal(tflFailure.status, 'partial');
assert.equal(tflFailure.data[0].id, 'NATIONAL-STOP');
assert.equal(tflFailure.provenance.nationalStopSourceAvailable, true);
assert.equal(tflFailure.provenance.tflStopSourceAvailable, false);
assert.match(tflFailure.warnings.join(' '), /TfL StopPoint source failed/);

const bothFailed = createBusStopDiscovery({
  tflAdapter: { id: 'tfl', nearbyStops: async () => sourceFailure('TfL') },
  naptanAdapter: { id: 'naptan', nearbyStops: async () => sourceFailure('NaPTAN') },
  londonCoverage: () => false,
  crossBoundaryTfL: true
});
const bothFailedResult = await bothFailed.nearbyStops({ latitude: 51.7, longitude: -0.1 });
assert.equal(bothFailedResult.ok, false);
assert.match(bothFailedResult.warnings.join(' '), /no authoritative zero-stop conclusion/i);

const incompleteZeroAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => zeroStops },
  timetableData: { servicesForStops: async () => { throw new Error('timetable must not be called for zero discovered stops'); } },
  accessRouting: { matrix: async () => { throw new Error('routing must not be called for zero discovered stops'); } }
});
const incompleteZero = await incompleteZeroAssessment.assess({ latitude: 51.7, longitude: -0.1 });
assert.equal(incompleteZero.status, 'partial');
assert.doesNotMatch(incompleteZero.wording, /No authoritative bus stops were found/);
assert.match(incompleteZero.wording, /coverage was incomplete/i);

const duplicateTfL = { id: 'tfl-279', routeNumber: '279', operator: 'Shared operator', origin: 'Origin', destination: 'Terminus', direction: 'Terminus', timetableSource: 'TfL', stopSchedules: { 'STOP-A': schedule([420]) } };
const duplicateBods = { id: 'bods-279', routeNumber: '279', operator: 'Shared operator', origin: 'Origin', destination: 'Terminus', direction: 'Terminus', timetableSource: 'BODS', stopSchedules: { 'STOP-A': schedule([422]), 'STOP-B': schedule([430]), 'STOP-C': schedule([440]) } };
const duplicateAuthority = createAuthoritativeBusTimetableAdapter({
  tflAdapter: { servicesForStop: async ({ stopPointId }) => sourceSuccess('TfL', [{ ...duplicateTfL, stopSchedules: { [stopPointId]: schedule([420]) } }], {}) },
  nationalAdapter: { servicesForStops: async () => sourceSuccess('BODS', [duplicateBods]) },
  londonCoverage: () => false
});
const selectedOnly = await duplicateAuthority.servicesForStops([{ id: 'STOP-A', timetableAuthority: 'TfL', timetableAuthorities: ['NaPTAN', 'TfL'], routes: ['279'], routeAuthorities: { '279': ['NaPTAN', 'TfL'] } }], { site: { latitude: 51.7, longitude: -0.1 } });
assert.equal(selectedOnly.data.filter(service => service.routeNumber === '279').length, 1, 'unselected schedules must not prevent same-stop duplicate suppression');
assert.deepEqual(Object.keys(selectedOnly.data[0].stopSchedules), ['STOP-A']);

const selectedTwo = await duplicateAuthority.servicesForStops([
  { id: 'STOP-A', timetableAuthority: 'TfL', timetableAuthorities: ['NaPTAN', 'TfL'], routes: ['279'], routeAuthorities: { '279': ['NaPTAN', 'TfL'] } },
  { id: 'STOP-B', timetableAuthority: 'TfL', timetableAuthorities: ['NaPTAN', 'TfL'], routes: ['279'], routeAuthorities: { '279': ['NaPTAN', 'TfL'] } }
], { site: { latitude: 51.7, longitude: -0.1 } });
assert.equal(selectedTwo.data.filter(service => service.routeNumber === '279').length, 2, 'a second selected stop not covered by TfL must retain the national record');

const evidenceServices = [{ id: 'tfl-279', routeNumber: '279', timetableSource: 'TfL', stopSchedules: { 'TFL-STOP': schedule([420]) } }];
const evidenceAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => sourceSuccess('NaPTAN', [
    { ...nationalStop },
    { ...tflStop }
  ], { stopCoverageComplete: true }) },
  timetableData: { servicesForStops: async () => sourceSuccess('TfL + BODS/TNDS', evidenceServices, { nationalSourceAvailable: false, nationalUnresolvedRoutes: ['X'] }) },
  accessRouting: { matrix: routed }
});
const evidenceResult = await evidenceAssessment.assess({ latitude: 51.7, longitude: -0.1 });
const nationalEvidence = evidenceResult.stops.find(stop => stop.id === 'NATIONAL-STOP');
const tflEvidence = evidenceResult.stops.find(stop => stop.id === 'TFL-STOP');
assert.equal(nationalEvidence.timetableEvidenceStatus, 'SOURCE_UNAVAILABLE');
assert.match(nationalEvidence.timetableEvidence, /required national evidence could not be checked/);
assert.equal(tflEvidence.timetableEvidenceStatus, 'MATCHED');
assert.match(tflEvidence.timetableEvidence, /^Matched · TfL$/);

const dualEvidenceAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => sourceSuccess('NaPTAN + TfL', [{ id: 'DUAL', name: 'Dual', routes: ['279', 'X'], timetableAuthorities: ['NaPTAN', 'TfL'], timetableAuthority: 'TfL', routeAuthorities: { '279': ['TfL'], X: ['NaPTAN'] } }], { stopCoverageComplete: true }) },
  timetableData: { servicesForStops: async () => sourceSuccess('TfL + BODS/TNDS', [{ id: 'tfl-279', routeNumber: '279', timetableSource: 'TfL', stopSchedules: { DUAL: schedule([420]) } }], { nationalSourceAvailable: false, nationalUnresolvedRoutes: ['X'] }) },
  accessRouting: { matrix: routed }
});
const dualEvidence = await dualEvidenceAssessment.assess({ latitude: 51.7, longitude: -0.1 });
assert.equal(dualEvidence.stops[0].timetableEvidenceStatus, 'PARTIAL');

const nearestStops = [
  { id: 'NEAREST-A', name: 'Nearest A', latitude: 51.7, longitude: -0.1, routes: ['10'], walking: { status: 'routed', distanceMetres: 50 } },
  { id: 'FARTHER-B', name: 'Farther B', latitude: 51.71, longitude: -0.1, routes: ['10'], walking: { status: 'routed', distanceMetres: 200 } }
];
const nearestFailure = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => sourceSuccess('NaPTAN', nearestStops, { stopCoverageComplete: true }) },
  timetableData: { servicesForStops: async selected => selected[0].id === 'NEAREST-A' ? { ok: false, code: 'offline', data: null, warnings: ['Nearest timetable unavailable'], provenance: { timetableConclusion: 'UNRESOLVED' } } : sourceSuccess('BODS', [{ id: 'farther-service', routeNumber: '10', stopSchedules: { 'FARTHER-B': schedule([500]) } }], { timetableConclusion: 'MATCHED' }) },
  accessRouting: { matrix: routed }
});
const nearestFailureResult = await nearestFailure.assess({ latitude: 51.7, longitude: -0.1 }, { mode: 'nearest' });
assert.equal(nearestFailureResult.nearestGroup.anchorStopId, 'NEAREST-A');
assert.equal(nearestFailureResult.status, 'partial');
assert.match(nearestFailureResult.warnings.join(' '), /farther group/i);

let noMatchCalls = 0;
const nearestNoMatch = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => sourceSuccess('NaPTAN', nearestStops, { stopCoverageComplete: true }) },
  timetableData: { servicesForStops: async selected => {
    noMatchCalls += 1;
    return selected[0].id === 'NEAREST-A'
      ? sourceSuccess('TfL', [], { timetableConclusion: 'NO_CURRENT_MATCH' })
      : sourceSuccess('BODS', [{ id: 'farther-service', routeNumber: '10', stopSchedules: { 'FARTHER-B': schedule([500]) } }], { timetableConclusion: 'MATCHED' });
  } },
  accessRouting: { matrix: routed }
});
const nearestNoMatchResult = await nearestNoMatch.assess({ latitude: 51.7, longitude: -0.1 }, { mode: 'nearest' });
assert.equal(noMatchCalls, 2);
assert.equal(nearestNoMatchResult.nearestGroup.anchorStopId, 'FARTHER-B');
assert.equal(nearestNoMatchResult.status, 'complete');

const ambiguousFallbackService = { id: 'bods-279', routeNumber: '279', operator: 'National operator', origin: 'Origin', destination: 'Terminus', direction: 'Terminus', timetableSource: 'BODS', stopSchedules: { 'TFL-STOP': schedule([450]) } };
const ambiguousFallback = createAuthoritativeBusTimetableAdapter({
  tflAdapter: { servicesForStop: async () => ({ ok: true, data: [], warnings: ['TfL pattern ambiguous'], provenance: { timetableConclusion: 'UNRESOLVED' } }) },
  nationalAdapter: { servicesForStops: async () => sourceSuccess('BODS', [ambiguousFallbackService]) },
  londonSupplementAdapter: { servicesForStops: async () => sourceSuccess('BODS', [ambiguousFallbackService]) },
  londonCoverage: () => true
});
const ambiguousFallbackResult = await ambiguousFallback.servicesForStops([{ ...tflStop }], { site: { latitude: 51.5, longitude: -0.1 } });
assert.equal(ambiguousFallbackResult.ok, true);
assert.equal(ambiguousFallbackResult.provenance.timetableConclusion, 'MATCHED');
assert.equal(ambiguousFallbackResult.data[0].timetableSource, 'BODS fallback after TfL unresolved');
assert.match(ambiguousFallbackResult.warnings.join(' '), /fallback/i);

const ambiguousNoFallback = createAuthoritativeBusTimetableAdapter({
  tflAdapter: { servicesForStop: async () => ({ ok: true, data: [], warnings: ['TfL pattern ambiguous'], provenance: { timetableConclusion: 'UNRESOLVED' } }) },
  nationalAdapter: { servicesForStops: async () => sourceSuccess('BODS', []) },
  londonSupplementAdapter: { servicesForStops: async () => sourceSuccess('BODS', []) },
  londonCoverage: () => true
});
const ambiguousNoFallbackResult = await ambiguousNoFallback.servicesForStops([{ ...tflStop }], { site: { latitude: 51.5, longitude: -0.1 } });
assert.equal(ambiguousNoFallbackResult.ok, false);
assert.equal(ambiguousNoFallbackResult.provenance.timetableConclusion, 'UNRESOLVED');
assert.match(ambiguousNoFallbackResult.message, /No London zero-service conclusion/);

console.log('PASS Alpha.12 source completeness, selected-stop duplicate coverage, evidence, nearest, and ambiguous-TfL regressions.');
