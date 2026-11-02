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

const fallbackSection = {
  ...section, id: 'section-158-inbound', originationName: 'Stratford Bus Station',
  destinationName: 'Chingford Mount', originator: 'STRATFORD', destination: 'CHINGFORD-E', direction: 'inbound'
};
const fallbackSequence = {
  lineId: '158', direction: 'inbound', branchId: 'branch-158-inbound', serviceType: 'Regular',
  orderedStopPointIds: ['STRATFORD', 'TUFTON', 'CHINGFORD-E'],
  orderedStops: [
    { id: 'STRATFORD', name: 'Stratford Bus Station' },
    { id: 'TUFTON', name: 'Chingford Mount' },
    { id: 'CHINGFORD-E', name: 'Chingford Mount' }
  ]
};
const fallbackPopulation = createAuthoritativeBusTimetableAdapter({
  tflAdapter: {
    routeMetadataForLines: async () => ({ ok: true, data: [{ id: '158', routeSections: [fallbackSection] }], warnings: [], provenance: {} }),
    servicesForStop: async () => ({ ok: false, code: 'http_failure', warnings: ['simulated timetable failure'], provenance: {} }),
    routeSequencesForLineDirections: async requests => ({
      ok: true, data: requests.map(request => ({ ...request, sequences: [fallbackSequence] })), warnings: [], provenance: {}
    })
  },
  nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [{
    id: 'bods-158-inbound', routeNumber: '158', operator: 'London operator', origin: 'Stratford Bus Station',
    destination: 'Chingford Mount', direction: 'inbound', timetableSource: 'BODS', stopSchedules: { TUFTON: schedule }
  }], warnings: [], provenance: {} }) },
  londonCoverage: () => true
});
const fallbackResult = await fallbackPopulation.servicesForStops([
  { id: 'TUFTON', routes: ['158'], timetableAuthority: 'TfL' }
], { site: { latitude: 51.6, longitude: -0.1 } });
const fallbackRow = fallbackResult.data.find(record => record.source?.fallbackFor);
assert.equal(fallbackRow.timetableSource, 'BODS fallback after TfL failure');
assert.equal(fallbackRow.tflRouteSequenceEvidence.status, 'resolved', 'a unique TfL route sequence survives a failed timetable request');
assert.equal(fallbackRow.tflRouteSequenceEvidence.scheduledTimetableUsed, false, 'route topology is not misrepresented as timetable evidence');
assert.deepEqual(fallbackRow.tflRouteSequenceEvidence.routeTopologyEndpoints, { origin: 'STRATFORD', destination: 'CHINGFORD-E' });
assert.deepEqual(fallbackRow.stopSchedules.TUFTON, schedule, 'national fallback timetable is preserved unchanged');
const fallbackPrincipal = buildServiceSummaries([{ id: 'TUFTON', name: 'Tufton control' }], [fallbackRow])[0];
assert.deepEqual(fallbackPrincipal.principalLocations, ['Chingford Mount']);
assert.equal(fallbackPrincipal.principalLocationState, 'resolved');
const chingfordOutboundSection = {
  ...fallbackSection, id: 'section-158-outbound', direction: 'outbound', originationName: 'Chingford Mount',
  destinationName: 'Stratford Bus Station', originator: 'CHINGFORD-C', destination: 'STRATFORD'
};
const chingfordOutboundSequence = {
  lineId: '158', direction: 'outbound', branchId: 'branch-158-outbound', serviceType: 'Regular',
  orderedStopPointIds: ['CHINGFORD-C', 'HIGHAMS', 'STRATFORD'],
  orderedStops: [{ id: 'CHINGFORD-C', name: 'Chingford Mount' }, { id: 'HIGHAMS', name: 'Highams Park' }, { id: 'STRATFORD', name: 'Stratford Bus Station' }]
};
const bothDirectionCalls = [];
const twoDirectionPopulation = createAuthoritativeBusTimetableAdapter({
  tflAdapter: {
    routeMetadataForLines: async () => ({ ok: true, data: [{ id: '158', routeSections: [fallbackSection, chingfordOutboundSection] }], warnings: [], provenance: {} }),
    servicesForStop: async ({ stopPointId }) => stopPointId === 'CHINGFORD-E'
      ? ({ ok: false, code: 'http_failure', warnings: ['simulated inbound timetable failure'], provenance: {} })
      : ({ ok: true, data: [{
        id: 'tfl-158-outbound', routeNumber: '158', operator: 'London operator', origin: 'Chingford Mount',
        destination: 'Stratford Bus Station', direction: 'outbound', provider: 'TfL', timetableSource: 'TfL',
        source: { provider: 'TfL', primaryAuthority: 'TfL', lineId: '158', routeMetadata: 'matched' },
        routePatternStopIds: chingfordOutboundSequence.orderedStopPointIds,
        routePatternStops: chingfordOutboundSequence.orderedStops,
        stopSchedules: { 'CHINGFORD-C': schedule }
      }], warnings: [], provenance: {} }),
    routeSequencesForLineDirections: async requests => {
      bothDirectionCalls.push(...requests.map(request => request.direction));
      return { ok: true, data: requests.map(request => ({
        ...request, sequences: [request.direction === 'inbound' ? fallbackSequence : chingfordOutboundSequence]
      })), warnings: [], provenance: {} };
    }
  },
  nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [
    { id: 'bods-158-outbound', routeNumber: '158', operator: 'London operator', origin: 'Chingford Mount', destination: 'Stratford Bus Station', direction: 'outbound', timetableSource: 'BODS', stopSchedules: { 'CHINGFORD-C': schedule } },
    { id: 'bods-158-inbound', routeNumber: '158', operator: 'London operator', origin: 'Stratford Bus Station', destination: 'Chingford Mount', direction: 'inbound', timetableSource: 'BODS', stopSchedules: { 'CHINGFORD-E': schedule } }
  ], warnings: [], provenance: {} }) },
  londonCoverage: () => true
});
const twoDirectionResult = await twoDirectionPopulation.servicesForStops([
  { id: 'CHINGFORD-C', routes: ['158'], timetableAuthority: 'TfL' },
  { id: 'CHINGFORD-E', routes: ['158'], timetableAuthority: 'TfL' }
], { site: { latitude: 51.6, longitude: -0.1 } });
const chingfordInboundFallback = twoDirectionResult.data.find(record => record.source?.requestedStopPointId === 'CHINGFORD-E');
const chingfordOutboundTfL = twoDirectionResult.data.find(record => record.id === 'tfl-158-outbound');
assert.deepEqual(bothDirectionCalls.sort(), ['inbound', 'outbound'], 'both TfL route directions are queried independently');
assert.equal(chingfordInboundFallback.tflRouteSequenceEvidence.status, 'resolved');
assert.equal(chingfordOutboundTfL.tflRouteSequenceEvidence.status, 'resolved');
assert.equal(chingfordOutboundTfL.primaryAuthority, 'TfL');
assert.deepEqual(chingfordInboundFallback.stopSchedules['CHINGFORD-E'], schedule, 'the failed inbound timetable remains explicitly sourced from national fallback');
const ambiguousFallbackPopulation = createAuthoritativeBusTimetableAdapter({
  tflAdapter: {
    routeMetadataForLines: async () => ({ ok: true, data: [{ id: '158', routeSections: [{ ...fallbackSection, id: 'other-section', originator: 'ALT-START' }] }], warnings: [], provenance: {} }),
    servicesForStop: async () => ({ ok: false, warnings: ['simulated timetable failure'], provenance: {} }),
    routeSequencesForLineDirections: async requests => ({ ok: true, data: requests.map(request => ({ ...request, sequences: [fallbackSequence] })), warnings: [], provenance: {} })
  },
  nationalAdapter: { servicesForStops: async () => ({ ok: true, data: [{
    id: 'bods-158-inbound', routeNumber: '158', operator: 'London operator', origin: 'Stratford Bus Station',
    destination: 'Chingford Mount', direction: 'inbound', timetableSource: 'BODS', stopSchedules: { TUFTON: schedule }
  }], warnings: [], provenance: {} }) },
  londonCoverage: () => true
});
const ambiguousFallbackResult = await ambiguousFallbackPopulation.servicesForStops([
  { id: 'TUFTON', routes: ['158'], timetableAuthority: 'TfL' }
], { site: { latitude: 51.6, longitude: -0.1 } });
assert.equal(ambiguousFallbackResult.data[0].tflRouteSequenceEvidence, undefined, 'incompatible sequence endpoints do not promote principal-location evidence');

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

const endpointAuthorityRecords = [
  { id: 'tfl-primary', routeNumber: '900', operator: 'TfL operator', origin: 'Origin', destination: 'Terminus', direction: 'outbound', provider: 'TfL', primaryAuthority: 'TfL', timetableSource: 'TfL', source: { provider: 'TfL', primaryAuthority: 'TfL', routeMetadata: 'matched' }, originStopPointId: 'TFL-ORIGIN', destinationStopPointId: 'TFL-END', stopSchedules: { ASSESS: schedule } },
  { id: 'bods-supplement', routeNumber: '900', operator: 'TfL operator', origin: 'Origin', destination: 'Terminus', direction: 'outbound', provider: 'BODS', primaryAuthority: 'BODS', timetableSource: 'BODS', source: { provider: 'BODS', primaryAuthority: 'BODS' }, originStopPointId: 'BODS-ORIGIN', destinationStopPointId: 'BODS-END', stopSchedules: { ASSESS: schedule } }
];
const authoritativeEndpoints = buildServiceSummaries([{ id: 'ASSESS' }], endpointAuthorityRecords)[0];
assert.deepEqual(authoritativeEndpoints.originStopPointIds, ['TFL-ORIGIN']);
assert.deepEqual(authoritativeEndpoints.destinationStopPointIds, ['TFL-END']);
assert.equal(authoritativeEndpoints.rawServiceSummaries.length, 2, 'conflicting BODS identity remains in detailed source evidence');
const unresolvedTflEndpoints = buildServiceSummaries([{ id: 'ASSESS' }], endpointAuthorityRecords.map(record => record.id === 'tfl-primary'
  ? { ...record, source: { provider: 'TfL', primaryAuthority: 'TfL' }, originStopPointId: null, destinationStopPointId: null }
  : record))[0];
assert.deepEqual(unresolvedTflEndpoints.originStopPointIds, ['BODS-ORIGIN'], 'supplementary endpoint evidence is retained when TfL does not establish a safe identity');
const branchAwareReview = await assess([
  topologyRecord('calendar-a', 'branch-1', 'section-1', 'school-day'),
  topologyRecord('calendar-b', 'branch-1', 'section-1', 'ordinary'),
  topologyRecord('different-branch', 'branch-2', 'section-2', 'ordinary')
].map(record => ({ ...record, plannerEndpointMateriality: 'material' })), endpointReference);
assert.equal(branchAwareReview.reviewItems.filter(item => item.code === 'planner-endpoint-resolution').length, 2,
  'same-branch calendar copies collapse while a distinct route branch remains reviewable');

console.log('BUS-ROBUSTNESS-1A4E-C2 route-topology, service-endpoint, materiality, metadata-wrapper, and operator-consensus tests passed.');
