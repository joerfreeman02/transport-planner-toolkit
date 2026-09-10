import assert from 'node:assert/strict';
import { buildStopDiscoverySourceLabel, buildStopTimetableSourcePresentation, buildTimetableSourcePresentation } from '../../src/atlas/domain/bus-source-presentation.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';

const schedule = departures => ({ monday: departures, tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });
const stop = (id, route, authorities) => ({ id, name: id, routes: [route], timetableAuthority: authorities[0], timetableAuthorities: authorities, routeAuthorities: { [route]: authorities } });
const tflStop = stop('STOP-A', '279', ['TfL']);
const nationalStop = stop('STOP-B', 'Q', ['NaPTAN']);
const dualStop = stop('STOP-C', '10', ['TfL', 'NaPTAN']);
const tflService = { id: 'tfl-279', routeNumber: '279', timetableSource: 'TfL', stopSchedules: { 'STOP-A': schedule([420]) } };
const nationalService = { id: 'bods-q', routeNumber: 'Q', timetableSource: 'BODS', stopSchedules: { 'STOP-B': schedule([450]) } };
const mixedProvenance = {
  tflTimetableAttempted: true,
  nationalTimetableAttempted: true,
  nationalSupplementaryAttempted: false,
  nationalEvidenceRequired: true,
  nationalEvidenceNotRequired: false,
  nationalTimetableStopIds: ['STOP-B', 'STOP-C'],
  tflTimetableRequestIdentities: ['279|STOP-A', '10|STOP-C'],
  nationalTimetableProviders: ['BODS', 'TNDS'],
  nationalSourceAvailable: true
};

assert.equal(buildTimetableSourcePresentation({ tflTimetableAttempted: true, nationalTimetableAttempted: false, nationalSupplementaryAttempted: true }, [tflService]).label, 'Transport for London scheduled timetables');
assert.equal(buildTimetableSourcePresentation({ tflTimetableAttempted: false, nationalTimetableAttempted: true, nationalTimetableProviders: ['BODS', 'TNDS'], nationalSourceAvailable: true }, [nationalService]).label, 'Department for Transport bus timetables');
assert.equal(buildTimetableSourcePresentation({ tflTimetableAttempted: true, nationalTimetableAttempted: false, nationalEvidenceNotRequired: true }, []).label, 'Transport for London scheduled timetables');
assert.equal(buildTimetableSourcePresentation(mixedProvenance, [tflService, nationalService]).label, 'Transport for London scheduled timetables + Department for Transport bus timetables');

const tflOnlyStopSources = buildStopTimetableSourcePresentation(tflStop, {
  ...mixedProvenance,
  nationalTimetableAttempted: true,
  nationalTimetableStopIds: ['STOP-B'],
  tflTimetableRequestIdentities: ['279|STOP-A']
}, []);
assert.deepEqual(tflOnlyStopSources.checked, ['TfL'], 'a national check for another stop must not contaminate a TfL-only stop');
assert.equal(tflOnlyStopSources.label, 'TfL');
assert.doesNotMatch(tflOnlyStopSources.label, /BODS|TNDS/);
assert.deepEqual(buildStopTimetableSourcePresentation(nationalStop, mixedProvenance, []).checked, ['BODS', 'TNDS']);
assert.deepEqual(buildStopTimetableSourcePresentation(dualStop, mixedProvenance, []).checked, ['TfL', 'BODS', 'TNDS']);
assert.deepEqual(buildStopTimetableSourcePresentation(tflStop, { ...mixedProvenance, tflTimetableRequestIdentities: ['10|STOP-C'] }, []).checked, [], 'a TfL request for another stop must not contaminate this stop');

const fallback = { id: 'bods-fallback', routeNumber: '10', timetableSource: 'BODS fallback after TfL unresolved', stopSchedules: { 'STOP-C': schedule([480]) } };
assert.deepEqual(buildStopTimetableSourcePresentation(dualStop, mixedProvenance, [fallback]).checked, ['TfL', 'BODS', 'TNDS']);

assert.equal(buildStopDiscoverySourceLabel({ crossBoundaryTfLAttempted: true, nationalStopSourceAvailable: true, tflStopSourceAvailable: true }), 'Department for Transport NaPTAN + Transport for London StopPoint');
assert.equal(buildStopDiscoverySourceLabel({ crossBoundaryTfLAttempted: true, nationalStopSourceAvailable: true, tflStopSourceAvailable: false }), 'Department for Transport NaPTAN');
assert.equal(buildStopDiscoverySourceLabel({ crossBoundaryTfLAttempted: true, nationalStopSourceAvailable: false, tflStopSourceAvailable: true }), 'Transport for London StopPoint');
assert.equal(buildStopDiscoverySourceLabel({ tflStopSourceAvailable: true, nationalStopSourceAvailable: null }), 'Transport for London');

const assessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [tflStop], warnings: [], provenance: { stopCoverageComplete: true } }) },
  timetableData: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: { ...mixedProvenance, nationalTimetableAttempted: false, nationalEvidenceRequired: false, nationalEvidenceNotRequired: true, nationalTimetableStopIds: [], tflTimetableRequestIdentities: ['279|STOP-A'], timetableConclusion: 'NO_CURRENT_MATCH' } }) },
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: {} }) }
});
const noCurrent = await assessment.assess({ latitude: 51.7, longitude: -0.1 });
assert.equal(noCurrent.stops[0].timetableEvidence, 'No current match · TfL checked');
assert.doesNotMatch(noCurrent.stops[0].timetableEvidence, /BODS|TNDS/);

const fallbackAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [dualStop], warnings: [], provenance: { stopCoverageComplete: true } }) },
  timetableData: { servicesForStops: async () => ({ ok: true, data: [fallback], warnings: [], provenance: mixedProvenance }) },
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: {} }) }
});
const fallbackResult = await fallbackAssessment.assess({ latitude: 51.7, longitude: -0.1 });
assert.equal(fallbackResult.stops[0].timetableEvidence, 'Matched · BODS fallback');

console.log('PASS Alpha.12 source/provenance presentation matrix — timetable, stop-specific, cross-boundary, fallback and no-current claims remain truthful.');
