import assert from 'node:assert/strict';
import { tflRouteSequenceEvidenceForService } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { resolvePlannerEndpointDecisions } from '../../src/atlas/domain/planner-endpoint-decision.mjs';

const seq = (ids, { branchId = null, direction = 'outbound', serviceType = 'Regular', nextBranchIds = [], prevBranchIds = [] } = {}) => ({
  lineId: '313', direction, branchId, serviceType, nextBranchIds, prevBranchIds,
  orderedStopPointIds: ids, orderedStops: ids.map(id => ({ id, name: id }))
});
const result = sequences => ({ data: [{ lineId: '313', direction: 'outbound', sequences }] });
const clipped = ({ pattern, destination, direction = 'outbound', line = '313' }) => ({
  routeNumber: line, direction, origin: '', destination,
  originStopPointId: pattern[0], destinationStopPointId: pattern.at(-1), routePatternStopIds: pattern,
  stopSchedules: { [pattern[0]]: { monday: [600] } },
  source: { provider: 'TfL', lineId: line, routePatternStartIsAssessedStop: true, intervalOriginStopPointId: pattern[0] }
});

// 1: a unique clipped sequence recovers the branch origin while keeping the
// timetable interval's exact terminus separate from the full branch endpoint.
const uniqueBranch = tflRouteSequenceEvidenceForService(clipped({ pattern: ['C', 'D', 'E'], destination: 'E' }), result([seq(['A', 'B', 'C', 'D', 'E'])]));
assert.equal(uniqueBranch.status, 'resolved');
assert.equal(uniqueBranch.matchType, 'ordered-subsequence');
assert.equal(uniqueBranch.routeTopologyEndpoints.origin, 'A');

// 2: common clipped section cannot choose between materially distinct branches.
const branchA = seq(['A', 'B', 'C', 'D', 'E1'], { branchId: 'A', nextBranchIds: ['B'] });
const branchB = seq(['X', 'B', 'C', 'D', 'E2'], { branchId: 'B', prevBranchIds: ['A'] });
const ambiguous = tflRouteSequenceEvidenceForService(clipped({ pattern: ['B', 'C', 'D'], destination: 'D' }), result([branchA, branchB]));
assert.equal(ambiguous.status, 'ambiguous-or-incomplete-link');
assert.equal(ambiguous.candidateCount, 2);

// 3: exact known full terminus discriminates the correct branch.
const selected = tflRouteSequenceEvidenceForService(clipped({ pattern: ['B', 'C', 'D', 'E1'], destination: 'E1' }), result([branchA, branchB]));
assert.equal(selected.status, 'resolved');
assert.equal(selected.routeTopologyEndpoints.origin, 'A');
const exactOriginService = clipped({ pattern: ['B', 'C', 'D'], destination: 'D' });
exactOriginService.originStopPointId = 'X';
exactOriginService.originStopPointIds = ['X'];
const selectedByExactOrigin = tflRouteSequenceEvidenceForService(exactOriginService, result([branchA, branchB]));
assert.equal(selectedByExactOrigin.status, 'resolved');
assert.equal(selectedByExactOrigin.routeTopologyEndpoints.origin, 'X', 'an exact known origin still discriminates clipped branches');

// 4: a materially conflicting authoritative endpoint must fail closed.
const conflictingEndpointService = clipped({ pattern: ['B', 'C', 'D'], destination: 'Not a terminus' });
conflictingEndpointService.destinationStopPointId = 'NOT-A-TERMINUS';
const endpointConflict = tflRouteSequenceEvidenceForService(conflictingEndpointService, result([branchA]));
assert.notEqual(endpointConflict.status, 'resolved');

// 5: an ordinary short-working terminus inside the full branch is not widened.
const shortWorking = clipped({ pattern: ['B', 'C', 'D', 'PB'], destination: 'PB' });
shortWorking.destinationStopPointId = 'PB';
shortWorking.source.routePatternStartIsAssessedStop = true;
const extended = seq(['A', 'B', 'C', 'D', 'PB', 'SCHOOL']);
const shortMatch = tflRouteSequenceEvidenceForService(shortWorking, result([extended]));
assert.equal(shortMatch.status, 'resolved');
assert.equal(shortWorking.destinationStopPointId, 'PB');
assert.equal(shortMatch.routeTopologyEndpoints.destination, 'SCHOOL');

// 6: the existing BUS-ROBUSTNESS-1A4A principal-endpoint regression verifies
// ordinary-versus-school public-family selection against the full planner row.
const schedule = { monday: [600], tuesday: [600], wednesday: [600], thursday: [600], friday: [600], saturday: [], sunday: [] };
const ordinary = { id: 'ordinary', routeNumber: '313', operator: 'TfL', origin: 'Chingford', destination: 'Potters Bar', direction: 'outbound', timetableSource: 'TfL', calendarProfileId: 'ordinary', routePatternStopIds: ['A', 'PB'], stopSchedules: { ASSESS: schedule }, source: { provider: 'TfL', directionId: '0' } };

// 7: direction is part of identity; a reverse-only branch cannot satisfy an
// outbound clipped pattern.
const wrongDirection = tflRouteSequenceEvidenceForService(clipped({ pattern: ['B', 'C', 'D'], destination: 'D' }), result([seq(['A', 'B', 'C', 'D'], { direction: 'inbound' })]));
assert.notEqual(wrongDirection.status, 'resolved');

// 7b: linked topology remains available, but is not promoted to an exact
// selected-service endpoint or sent for endpoint hydration.
const clippedGateService = {
  id: 'clipped-gate', routeNumber: '313', direction: 'outbound', origin: '', destination: 'Known destination',
  provider: 'TfL', timetableSource: 'TfL', source: { provider: 'TfL', lineId: '313', routePatternStartIsAssessedStop: true, assessedStopPointId: 'C', intervalOriginStopPointId: 'C' },
  originStopPointId: 'C', originStopPointIds: ['C'], destinationStopPointId: 'E', routePatternStopIds: ['C', 'D', 'E'],
  stopSchedules: { C: { monday: [600] } },
  tflRouteSequenceEvidence: { status: 'resolved', routeTopologyEndpoints: { origin: 'A', destination: 'Z' }, routeTopologyStops: { origin: { id: 'A', name: 'Full route origin' } } }
};
let requestedEndpointIds = [];
const clippedGate = await resolvePlannerEndpointDecisions([clippedGateService], {
  resolvePreparedStopPointsByIds: async ids => {
    requestedEndpointIds = ids;
    return { ok: true, physicalStops: [{ id: 'A', name: 'Full route origin', nptgLocalityCode: null, logicalGroupRefs: [], busPreparedEligible: true }], warnings: [], provenance: {} };
  }
});
assert.ok(!requestedEndpointIds.includes('A'), 'full-route topology is not treated as an exact service endpoint');
assert.ok(!requestedEndpointIds.includes('C'), 'the clipped assessed/interval edge is not treated as the full origin');
assert.equal(clippedGate.services[0].originEndpointDecision.endpointStopPointId, null);

// 8-13: sequence sidecars do not alter routePatternStopIds, grouping/CIRC,
// frequency, operating periods, or calendar evidence.
const baselineSummary = buildServiceSummaries([{ id: 'ASSESS' }], [ordinary])[0];
const enrichedSummary = buildServiceSummaries([{ id: 'ASSESS' }], [{
  ...ordinary,
  tflRouteSequenceEvidence: { status: 'resolved', routeTopologyEndpoints: { origin: 'FULL-A', destination: 'FULL-Z' }, matchedSequence: { branchId: 'one', nextBranchIds: ['two'], prevBranchIds: [], orderedStopPointIds: ['FULL-A', 'A', 'PB', 'FULL-Z'] } }
}])[0];
for (const field of ['routePatternStopIds', 'circularPatternStopIds', 'typicalFrequencyText', 'operatingPeriods', 'calendarEvidence', 'calendarProfileId']) {
  assert.deepEqual(enrichedSummary[field], baselineSummary[field], `sidecar isolation for ${field}`);
}

// Build a compact assessment through the production review-item path.
async function assessmentFor(serviceRecords, referenceData = null) {
  const stop = { id: 'ASSESS', name: 'Assessment stop', latitude: 51.6, longitude: -0.1, routes: ['313'], timetableAuthority: 'TfL' };
  const assessment = createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [stop], warnings: [], evidence: [], provenance: { stopCoverageComplete: true } }) },
    accessRouting: { matrix: async () => ({ ok: true, routes: [{ status: 'routed', distanceMetres: 100, durationSeconds: 80 }], warnings: [], provenance: {} }) },
    timetableData: { servicesForStops: async () => ({ ok: true, data: serviceRecords, warnings: [], provenance: {} }) },
    referenceData
  });
  return assessment.assess({ latitude: 51.6, longitude: -0.1 }, { radius: 250 });
}

const unresolvedNonMaterial = { id: 'u-origin', routeNumber: '313', operator: 'TfL', origin: '', destination: 'Known destination', direction: 'outbound', timetableSource: 'TfL', stopSchedules: { ASSESS: schedule }, routePatternStopIds: [], source: { provider: 'TfL', lineId: '313' } };
const nonMaterialAssessment = await assessmentFor([unresolvedNonMaterial]);
assert.equal(nonMaterialAssessment.reviewItems.filter(item => item.code === 'planner-endpoint-resolution').length, 0, '14: non-material unknown origin is technical-only');

const materialUnresolved = { ...unresolvedNonMaterial, id: 'u-structural', plannerStructuralBranchResolved: false };
const materialAssessment = await assessmentFor([materialUnresolved]);
assert.ok(materialAssessment.reviewItems.some(item => item.code === 'planner-endpoint-resolution'), '15: structural unresolved origin is planner-reviewable');

const duplicatedFact = [
  { ...materialUnresolved, id: 'dup-one', stopSchedules: { ASSESS: schedule }, sourceRecordIds: ['same-fact'], source: { ...materialUnresolved.source, intervalId: '0' } },
  { ...materialUnresolved, id: 'dup-two', stopSchedules: { ASSESS: schedule }, sourceRecordIds: ['same-fact'], source: { ...materialUnresolved.source, intervalId: '0' } }
];
const deduped = await assessmentFor(duplicatedFact);
assert.equal(deduped.reviewItems.filter(item => item.code === 'planner-endpoint-resolution').length, 1, '16: the same material planner fact is deduplicated');

const conflictRecord = (id, calendarProfileId, endpointStopPointIds) => ({
  id, sourceRecordIds: [id], routeNumber: '313', operator: 'TfL', origin: 'Origin requires review', destination: 'Known destination', direction: 'outbound',
  calendarProfileId, timetableSource: 'TfL', plannerEndpointMateriality: 'material', stopSchedules: { ASSESS: schedule },
  source: { provider: 'TfL', lineId: '313', directionId: 'outbound', intervalId: id, calendarProfileId },
  originStopPointIds: endpointStopPointIds
});
const conflictPlaces = {
  'PLACE-A': { id: 'PLACE-A', name: 'Origin A', nptgLocalityCode: 'LOC-A', nptgLocalityName: 'Locality A', busPreparedEligible: true },
  'PLACE-B': { id: 'PLACE-B', name: 'Origin B', nptgLocalityCode: 'LOC-B', nptgLocalityName: 'Locality B', busPreparedEligible: true },
  'PLACE-C': { id: 'PLACE-C', name: 'Origin C', nptgLocalityCode: 'LOC-C', nptgLocalityName: 'Locality C', busPreparedEligible: true }
};
const repeatedConflict = await assessmentFor([
  conflictRecord('conflict-school', 'school-day', ['PLACE-A', 'PLACE-B']),
  conflictRecord('conflict-ordinary', 'ordinary', ['PLACE-A', 'PLACE-B']),
  conflictRecord('conflict-other-place', 'ordinary', ['PLACE-A', 'PLACE-C'])
], {
  resolvePreparedStopPointsByIds: async ids => ({ ok: true, physicalStops: ids.map(id => conflictPlaces[id]).filter(Boolean), warnings: [], provenance: {} })
});
const conflictReviews = repeatedConflict.reviewItems.filter(item => item.code === 'planner-endpoint-resolution');
assert.equal(conflictReviews.length, 2, '16a: repeated exact-place conflict facts collapse across calendars while different conflicting places remain reviewable');

function tflAdapterFor(service) {
  return { servicesForStop: async ({ stopPointId }) => ({ ok: true, data: [{ ...service, stopSchedules: { [stopPointId]: schedule } }], warnings: [], provenance: {} }) };
}
async function supplementOperator(tflService, bodsServices) {
  const adapter = createAuthoritativeBusTimetableAdapter({
    tflAdapter: tflAdapterFor(tflService),
    nationalAdapter: { servicesForStops: async () => ({ ok: true, data: bodsServices, warnings: [], provenance: { source: 'BODS' } }) }
  });
  return adapter.servicesForStops([{ id: 'ASSESS', routes: ['313'], timetableAuthority: 'TfL' }], { site: { latitude: 51.6, longitude: -0.1 } });
}
const tflNoOperator = { id: 'tfl-no-op', routeNumber: '313', operator: '', origin: 'A', destination: 'B', direction: 'outbound', stopSchedules: { ASSESS: schedule }, source: { provider: 'TfL', routeLineageId: 'family-1' } };
const bodsA = { id: 'bods-a', routeNumber: '313', operator: 'Metroline', origin: 'A', destination: 'B', direction: 'outbound', stopSchedules: { ASSESS: schedule }, source: { provider: 'BODS', routeLineageId: 'family-1' } };
const bodsB = { ...bodsA, id: 'bods-b', operator: 'METROLINE' };
const consensus = await supplementOperator(tflNoOperator, [bodsA, bodsB]);
assert.equal(consensus.data[0].operator, 'Metroline', '17: unanimous compatible BODS operator fills an empty TfL field');
assert.equal(consensus.data[0].source.supplementaryOperatorEvidence.timetableAuthorityUnchanged, 'TfL');
assert.equal(consensus.data[0].timetableSource, 'TfL', 'operator metadata alone does not relabel the timetable source');
assert.equal(consensus.data[0].primaryAuthority, 'TfL');
const incompatibleLineage = await supplementOperator(tflNoOperator, [{ ...bodsA, source: { provider: 'BODS', routeLineageId: 'different-family' } }]);
assert.equal(incompatibleLineage.data[0].operator, '', 'explicitly incompatible route lineage cannot fill the operator');
const disagreement = await supplementOperator(tflNoOperator, [bodsA, { ...bodsB, operator: 'Arriva' }]);
assert.equal(disagreement.data[0].operator, '', '18: conflicting BODS operators do not fill');
const authoritativeOperator = await supplementOperator({ ...tflNoOperator, operator: 'TfL Operator' }, [bodsA]);
assert.equal(authoritativeOperator.data[0].operator, 'TfL Operator', '19: BODS never overrides a supplied TfL operator');
console.log('BUS-ROBUSTNESS-1A4E-C1 clipped-pattern, materiality, sidecar-isolation, and BODS operator consensus tests passed.');
