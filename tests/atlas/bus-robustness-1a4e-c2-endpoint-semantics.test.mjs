import assert from 'node:assert/strict';
import { tflRouteSequenceEvidenceForService } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { resolvePlannerEndpointDecisions } from '../../src/atlas/domain/planner-endpoint-decision.mjs';

const schedule = { monday: [600], tuesday: [600], wednesday: [600], thursday: [600], friday: [600], saturday: [], sunday: [] };
const sequence = {
  lineId: '456', direction: 'outbound', branchId: 'branch-1', serviceType: 'Regular',
  nextBranchIds: [], prevBranchIds: [], orderedStopPointIds: ['A', 'B', 'C', 'D'],
  orderedStops: ['A', 'B', 'C', 'D'].map(id => ({ id, name: id }))
};
const wrappedMetadata = section => ({ ok: true, data: [{ id: '456', routeSections: [section] }], warnings: [], provenance: {} });
const section = {
  id: 'section-456', direction: 'outbound', originationName: 'Route origin', destinationName: 'Route terminus',
  originator: 'A', destination: 'D', serviceType: 'Regular', validFrom: '2026-09-01', validTo: '2026-12-31'
};
const clippedService = {
  routeNumber: '456', direction: 'outbound', origin: '', destination: 'D', routePatternStopIds: ['B', 'C', 'D'],
  originStopPointId: 'B', destinationStopPointId: 'D', stopSchedules: { B: { monday: [600] } },
  source: { provider: 'TfL', lineId: '456', routePatternStartIsAssessedStop: true, intervalOriginStopPointId: 'B', assessedStopPointId: 'B' },
  validFrom: '2026-10-01', validTo: '2026-11-30'
};
const wrappedResult = { data: [{ lineId: '456', direction: 'outbound', sequences: [sequence] }], routeMetadata: wrappedMetadata(section) };
const wrappedMatch = tflRouteSequenceEvidenceForService(clippedService, wrappedResult);
assert.equal(wrappedMatch.status, 'resolved', 'production wrapper .data route metadata is unwrapped and applied');
assert.deepEqual(wrappedMatch.matchedRouteSections.map(item => item.id), ['section-456']);
for (const badSection of [
  { ...section, originator: 'OTHER' },
  { ...section, destination: 'OTHER' },
  { ...section, serviceType: 'Night' },
  { ...section, direction: 'inbound' },
  { ...section, validFrom: '2027-01-01', validTo: '2027-12-31' }
]) {
  const rejected = tflRouteSequenceEvidenceForService(clippedService, { ...wrappedResult, routeMetadata: wrappedMetadata(badSection) });
  assert.notEqual(rejected.status, 'resolved', `incompatible wrapped route section is rejected: ${JSON.stringify(badSection)}`);
}
assert.notEqual(tflRouteSequenceEvidenceForService(clippedService, {
  ...wrappedResult, routeMetadata: { ok: false, data: null, warnings: ['source unavailable'] }
}).status, 'resolved', 'failed wrapped metadata cannot be treated as a successful empty response');
let metadataPassedToTimetable = null;
const productionAdapter = createAuthoritativeBusTimetableAdapter({
  tflAdapter: {
    routeMetadataForLines: async () => wrappedMetadata(section),
    servicesForStop: async ({ routeMetadata }) => {
      metadataPassedToTimetable = routeMetadata;
      return { ok: true, data: [{ ...clippedService, routeNumber: '456', stopSchedules: { B: schedule } }], warnings: [], provenance: {} };
    },
    routeSequencesForLineDirections: async () => ({
      ok: true, data: [{ lineId: '456', direction: 'outbound', sequences: [sequence] }], warnings: [], provenance: {}
    })
  },
  nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [], warnings: [], provenance: {} }) }
});
const productionComposition = await productionAdapter.servicesForStops([
  { id: 'B', routes: ['456'], timetableAuthority: 'TfL' }
], { site: { latitude: 51.6, longitude: -0.1 } });
assert.equal(metadataPassedToTimetable.ok, true);
assert.equal(productionComposition.data[0].tflRouteSequenceEvidence.status, 'resolved',
  'the authoritative adapter production composition resolves the same wrapped metadata shape');
assert.deepEqual(productionComposition.data[0].tflRouteSequenceEvidence.routeTopologyEndpoints, { origin: 'A', destination: 'D' });
assert.ok(!('endpointStopPointIds' in productionComposition.data[0].tflRouteSequenceEvidence),
  'production sidecar does not mislabel topology as exact service endpoints');

const clippedForEndpoint = {
  id: 'clipped-origin', routeNumber: '313', direction: 'outbound', operator: 'TfL', origin: '', destination: 'Known destination',
  timetableSource: 'TfL', stopSchedules: { ASSESS: schedule }, routePatternStopIds: [],
  originStopPointId: 'ASSESS', originStopPointIds: ['ASSESS'], destinationStopPointId: 'END',
  source: { provider: 'TfL', lineId: '313', routePatternStartIsAssessedStop: true, assessedStopPointId: 'ASSESS', intervalOriginStopPointId: 'ASSESS' },
  tflRouteSequenceEvidence: {
    status: 'resolved', routeTopologyEndpoints: { origin: 'FULL-ORIGIN', destination: 'FULL-END' },
    matchedSequence: { branchId: 'branch-1' }, routeTopologyIdentities: [{ branchId: 'branch-1', sectionIds: ['section-1'] }]
  }
};
let requestedIds = [];
const endpointOnlyTopology = await resolvePlannerEndpointDecisions([clippedForEndpoint], {
  resolvePreparedStopPointsByIds: async ids => {
    requestedIds = ids;
    return { ok: true, physicalStops: [], warnings: [], provenance: {} };
  }
});
assert.ok(!requestedIds.includes('FULL-ORIGIN'), 'full-route topology endpoint is not hydrated as an exact service endpoint');
assert.equal(endpointOnlyTopology.services[0].originEndpointDecision.conflict, false);

async function assess(records, referenceData = null) {
  const stop = { id: 'ASSESS', name: 'Assessment stop', latitude: 51.6, longitude: -0.1, routes: ['456'], timetableAuthority: 'TfL' };
  const app = createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [stop], warnings: [], evidence: [], provenance: { stopCoverageComplete: true } }) },
    accessRouting: { matrix: async () => ({ ok: true, routes: [{ status: 'routed', distanceMetres: 100, durationSeconds: 80 }], warnings: [], provenance: {} }) },
    timetableData: { servicesForStops: async () => ({ ok: true, data: records, warnings: [], provenance: {} }) },
    referenceData
  });
  return app.assess({ latitude: 51.6, longitude: -0.1 }, { radius: 250 });
}
const conflictingOrigin = {
  id: 'conflict-origin', routeNumber: '456', operator: 'Go Ahead London', origin: 'Crews Hill', destination: 'North Middlesex Hospital', direction: 'Towards Crews Hill',
  timetableSource: 'TfL', stopSchedules: { ASSESS: schedule }, routePatternStopIds: [],
  originStopPointIds: ['PLACE-A', 'PLACE-B'], destinationStopPointId: 'END', source: { provider: 'TfL', lineId: '456' },
  tflRouteSequenceEvidence: {
    status: 'resolved', routeTopologyEndpoints: { origin: 'TOPOLOGY-A', destination: 'TOPOLOGY-Z' },
    routeTopologyIdentities: [{ branchId: 'b1', sectionIds: ['s1'] }]
  }
};
const places = {
  'PLACE-A': { id: 'PLACE-A', name: 'Cecil Road', nptgLocalityCode: 'LOC-A', nptgLocalityName: 'Enfield Town', busPreparedEligible: true },
  'PLACE-B': { id: 'PLACE-B', name: 'Crews Hill', nptgLocalityCode: 'LOC-B', nptgLocalityName: 'Crews Hill', busPreparedEligible: true },
  END: { id: 'END', name: 'North Middlesex Hospital', nptgLocalityCode: 'LOC-END', nptgLocalityName: 'Edmonton', busPreparedEligible: true }
};
const endpointReference = { resolvePreparedStopPointsByIds: async ids => ({ ok: true, physicalStops: ids.map(id => places[id]).filter(Boolean), warnings: [], provenance: {} }) };
const originOnlyConflict = await assess([conflictingOrigin], endpointReference);
assert.equal(originOnlyConflict.reviewItems.filter(item => item.code === 'planner-endpoint-resolution').length, 0,
  'resolved route, direction, and destination make an origin-place disagreement technical-only');
const structuralOriginConflict = await assess([{
  ...conflictingOrigin, origin: '', originStopPointIds: [],
  tflRouteSequenceEvidence: { ...conflictingOrigin.tflRouteSequenceEvidence, status: 'ambiguous-or-incomplete-link' }
}], endpointReference);
assert.equal(structuralOriginConflict.reviewItems.filter(item => item.code === 'planner-endpoint-resolution').length, 1,
  'origin disagreement stays planner-reviewable when route topology is structurally ambiguous');

const consensusSchedule = { ASSESS: schedule };
const tflService = { id: 'tfl-no-operator', routeNumber: '313', operator: '', origin: 'A', destination: 'B', direction: 'outbound', stopSchedules: consensusSchedule, source: { provider: 'TfL', routeLineageId: 'family-1' } };
const bods = (id, operator, direction = 'outbound', lineage = 'family-1') => ({
  id, routeNumber: '313', operator, origin: 'A', destination: 'B', direction, stopSchedules: consensusSchedule,
  source: { provider: 'BODS', routeLineageId: lineage }
});
async function operatorResult(candidates) {
  const adapter = createAuthoritativeBusTimetableAdapter({
    tflAdapter: { servicesForStop: async ({ stopPointId }) => ({ ok: true, data: [{ ...tflService, stopSchedules: { [stopPointId]: schedule } }], warnings: [], provenance: {} }) },
    nationalAdapter: { servicesForStops: async () => ({ ok: true, data: candidates, warnings: [], provenance: { source: 'BODS' } }) }
  });
  return adapter.servicesForStops([{ id: 'ASSESS', routes: ['313'], timetableAuthority: 'TfL' }], { site: { latitude: 51.6, longitude: -0.1 } });
}
assert.equal((await operatorResult([bods('named', 'Metroline'), bods('blank', '')])).data[0].operator, '',
  'one relevant blank BODS operator blocks apparent consensus');
assert.equal((await operatorResult([bods('named', 'Metroline'), bods('directionless', '', '')])).data[0].operator, '',
  'a directionless route/stop candidate with no operator is not silently excluded from consensus');
assert.equal((await operatorResult([bods('named', 'Metroline'), bods('separate-lineage', '', 'outbound', 'other-family')])).data[0].operator, '',
  'lineage disagreement remains fail-closed when a candidate cannot be safely excluded');

const topologyRecord = (id, branchId, sectionId, calendarProfileId) => ({
  ...conflictingOrigin, id, sourceRecordIds: [id], calendarProfileId,
  source: { ...conflictingOrigin.source, intervalId: id, calendarProfileId },
  tflRouteSequenceEvidence: {
    status: 'resolved', routeTopologyEndpoints: { origin: 'TOPOLOGY-A', destination: 'TOPOLOGY-Z' },
    routeTopologyEndpoints: { origin: 'TOPOLOGY-A', destination: 'TOPOLOGY-Z' },
    matchedSequence: { branchId }, matchedRouteSections: [{ id: sectionId }],
    routeTopologyIdentities: [{ branchId, sectionIds: [sectionId] }]
  }
});
const summary = buildServiceSummaries([{ id: 'ASSESS' }], [
  topologyRecord('calendar-a', 'branch-1', 'section-1', 'school-day'),
  topologyRecord('calendar-b', 'branch-1', 'section-1', 'ordinary'),
  topologyRecord('different-branch', 'branch-2', 'section-2', 'ordinary')
]);
assert.ok(summary.some(item => item.tflRouteSequenceEvidence?.routeTopologyIdentities?.some(identity => identity.branchId === 'branch-2')),
  'production service aggregation retains actual branch/section identity for conflict de-duplication');
const branchAwareReview = await assess([
  topologyRecord('calendar-a', 'branch-1', 'section-1', 'school-day'),
  topologyRecord('calendar-b', 'branch-1', 'section-1', 'ordinary'),
  topologyRecord('different-branch', 'branch-2', 'section-2', 'ordinary')
].map(record => ({ ...record, plannerEndpointMateriality: 'material' })), endpointReference);
assert.equal(branchAwareReview.reviewItems.filter(item => item.code === 'planner-endpoint-resolution').length, 2,
  'same-branch calendar copies collapse while a distinct route branch remains reviewable');

console.log('BUS-ROBUSTNESS-1A4E-C2 route-topology, service-endpoint, materiality, metadata-wrapper, and operator-consensus tests passed.');
