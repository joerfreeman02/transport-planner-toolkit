import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createTflBusStopAdapter } from '../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createTflRequestScheduler } from '../../src/atlas/adapters/tfl-request-scheduler.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createAtlasReferenceData } from '../../src/atlas/reference-data/atlas-reference-data.mjs';
import { createBusStopDiscovery } from '../../src/atlas/application/bus-stop-discovery.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';
import { createDeterministicEmptyTflFetch } from './helpers/s2e1-deterministic-empty-tfl.mjs';

const [candidateArg, reportArg, controlId = 'waltham'] = process.argv.slice(2);
if (!candidateArg || !reportArg) throw new Error('Usage: node tests/atlas/s2e1-normal-runtime-candidate-diagnostic.mjs <immutable-candidate-root> <report.json|-> [waltham|pipers|pe1|queensgate]');
const candidateRoot = path.resolve(candidateArg);
const reportPath = reportArg === '-' ? null : path.resolve(reportArg);
const busRoot = path.join(candidateRoot, 'atlas', 'data', 'bus');
const tndsRoot = path.join(candidateRoot, 'atlas', 'data', 'bus-tnds');
const nationalRequests = [];
const tflRequests = [];
const controls = {
  waltham: { label: '47 Berkley Avenue, Waltham Cross', latitude: 51.6857829, longitude: -0.0330001, radius: 700, focusRoutes: ['13', '13A', '13B', '13C'] },
  pipers: { label: 'Pipers Lane', latitude: 51.852700, longitude: -0.454343, radius: 700, focusRoutes: ['46', '230', '231', 'C'] },
  pe1: { label: 'PE1 2TL', latitude: 52.577554, longitude: -0.242489, radius: 500, focusRoutes: ['X4', '1', '2', '3', '4', '5', '6', '23', '24', '25', '27', '33', '37', '60', '61', '62', '63', '101', '102', '201', '202', '415', '904', '4P', 'A', 'B', 'C'] },
  queensgate: { label: 'Queensgate Bus Station', latitude: 52.5701, longitude: -0.2498, radius: 500, focusRoutes: ['X4', '1', '2', '3', '4', '5', '6', '23', '24', '25', '27', '33', '60', '61', '62', '63', '202', '415', '904', '5A', 'A', 'B', 'C'] }
};
const control = controls[controlId];
if (!control) throw new Error(`Unknown diagnostic control: ${controlId}`);

async function candidateFetch(input) {
  const pathname = new URL(input).pathname;
  const busMarker = '/atlas/data/bus/';
  const tndsMarker = '/atlas/data/bus-tnds/';
  const busIndex = pathname.indexOf(busMarker);
  const tndsIndex = pathname.indexOf(tndsMarker);
  const base = busIndex >= 0 ? busRoot : tndsIndex >= 0 ? tndsRoot : null;
  const relative = busIndex >= 0 ? pathname.slice(busIndex + busMarker.length) : tndsIndex >= 0 ? pathname.slice(tndsMarker.length) : null;
  if (!base || relative == null) return new Response('', { status: 404 });
  const file = path.resolve(base, decodeURIComponent(relative));
  if (file !== path.join(base, 'manifest.json') && !file.startsWith(`${base}${path.sep}`)) return new Response('', { status: 404 });
  nationalRequests.push({ source: base === busRoot ? 'BODS/NaPTAN' : 'TNDS', relative });
  try { return new Response(await readFile(file), { status: 200 }); }
  catch { return new Response('', { status: 404 }); }
}

const deterministicEmptyTflFetch = createDeterministicEmptyTflFetch({ requests: tflRequests });
const cache = createJsonCache({ storage: createMemoryStorage(), namespace: 's2e1-normal-runtime-diagnostic' });
const scheduler = createTflRequestScheduler();
const prepared = createPreparedBusDataAdapter({
  fetchImpl: candidateFetch,
  baseUrl: 'http://candidate.local/atlas/data/bus/',
  tndsBaseUrl: 'http://candidate.local/atlas/data/bus-tnds/',
  busFileUrl: relative => new URL(relative, 'http://candidate.local/atlas/data/bus/').toString(),
  tndsFileUrl: relative => new URL(relative, 'http://candidate.local/atlas/data/bus-tnds/').toString(),
  timeoutMs: 120000
});
const tflStops = createTflBusStopAdapter({ fetchImpl: deterministicEmptyTflFetch, cache, requestScheduler: scheduler });
const tflTimetable = createTflBusTimetableAdapter({ fetchImpl: deterministicEmptyTflFetch, cache, requestScheduler: scheduler });
const referenceData = createAtlasReferenceData({ adapter: prepared });
const stopDiscovery = createBusStopDiscovery({ tflAdapter: tflStops, naptanAdapter: prepared, referenceData, crossBoundaryTfL: true });
const timetableData = createAuthoritativeBusTimetableAdapter({ tflAdapter: tflTimetable, nationalAdapter: prepared, londonSupplementAdapter: prepared });
const assessmentApp = createBusAssessment({
  stopDiscovery,
  timetableData,
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'deterministic diagnostic stub' } }) },
  referenceData
});
const site = confirmSite(createSite({
  suppliedAddress: control.label,
  displayAddress: control.label,
  latitude: control.latitude,
  longitude: control.longitude,
  assessmentPoint: { method: 'coordinates_entered' }
}), { confirmedAt: '2026-10-21T00:00:00Z' });

const scope = await assessmentApp.inspectScope(site, { radius: control.radius });
if (!scope.ok) throw new Error(`Production inspectScope failed: ${scope.message || scope.code}`);
const assessment = await assessmentApp.assess(site, { radius: control.radius, mode: 'full', discovery: scope.discovery });
if (!assessment.ok) throw new Error(`Production assess failed: ${assessment.message || assessment.code}`);
const preparedOnlyApp = createBusAssessment({
  stopDiscovery: { nearbyStops: (...args) => prepared.nearbyStops(...args) },
  timetableData: { servicesForStops: (...args) => prepared.servicesForStops(...args) },
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'deterministic diagnostic stub' } }) }
});
const preparedOnly = await preparedOnlyApp.assess(site, { radius: control.radius, mode: 'full' });
if (!preparedOnly.ok) throw new Error(`Prepared-only comparison failed: ${preparedOnly.message || preparedOnly.code}`);
const wanted = new Set(control.focusRoutes);
const route = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
const unique = values => [...new Set(values ?? [])];
const stopRows = assessment.stops.map(stop => ({ id: stop.id, name: stop.name, distanceMetres: stop.distanceMetres,
  routes: stop.routes, routeAuthorities: stop.routeAuthorities, sourceAuthorities: stop.sourceAuthorities,
  timetableAuthorities: stop.timetableAuthorities, timetableEvidenceStatus: stop.timetableEvidenceStatus }));
const rawRows = assessment.services.filter(row => wanted.has(route(row.routeNumber))).map(row => ({
  id: row.id, routeNumber: row.routeNumber, operator: row.operator, timetableSource: row.timetableSource,
  provider: row.provider, source: row.source, origin: row.origin, destination: row.destination,
  direction: row.direction, stopScheduleIds: Object.keys(row.stopSchedules ?? {}),
  scheduledStops: Object.fromEntries(Object.entries(row.stopSchedules ?? {}).map(([id, days]) => [id,
    Object.fromEntries(Object.entries(days ?? {}).map(([day, times]) => [day, Array.isArray(times) ? times.length : 0]))]))
}));
const serviceSummaries = assessment.serviceSummaries.filter(row => wanted.has(route(row.routeNumber))).map(row => ({
  id: row.id, routeNumber: row.routeNumber, operator: row.operator, timetableSource: row.timetableSource,
  sourceAuthorities: row.sourceAuthorities, origin: row.origin, destination: row.destination,
  direction: row.direction, variantCount: row.variantCount, variantServiceIds: row.variantServiceIds,
  sourceRecordIds: row.sourceRecordIds, frequencyBasisStopId: row.frequencyBasisStopId,
  typicalFrequencyLines: row.typicalFrequencyLines, operatingPeriodLines: row.operatingPeriodLines
}));
const plannerRows = assessment.plannerServiceSummaries.filter(row => wanted.has(route(row.routeNumber)) || (row.routeNumbers ?? []).some(value => wanted.has(route(value)))).map(row => ({
  id: row.id, routeNumber: row.routeNumber, routeNumbers: row.routeNumbers, operator: row.operator,
  direction: row.direction, principalLocations: row.principalLocations, typicalFrequencyLines: row.typicalFrequencyLines,
  operatingPeriodLines: row.operatingPeriodLines, sourceRecordIds: row.sourceRecordIds,
  groupingDecision: row.publicServiceGroupingDecision,
  routeFamilyDecision: row.publicRouteFamilyDecision,
  circular: row.circular,
  circularClassification: row.circularServiceDecision?.classification ?? null,
  circularReason: row.circularServiceDecision?.reason ?? null,
  routeFamilyMembers: row.routeFamilyMembers?.map(member => ({
    routeNumber: member.routeNumber, origin: member.origin, destination: member.destination,
    typicalFrequencyLines: member.frequencyLines, operatingPeriodLines: member.operatingPeriodLines
  })) ?? []
}));

const plannerRowsFor = target => plannerRows.filter(row => route(row.routeNumber) === target || (row.routeNumbers ?? []).some(value => route(value) === target));
const circularEvidenceAudit = controlId === 'pipers' ? {
  route: '230',
  sourceRecords: assessment.services.filter(row => route(row.routeNumber) === '230').map(row => ({
    id: row.id, operator: row.operator, provider: row.provider, timetableSource: row.timetableSource,
    sourceProvider: row.source?.provider ?? null, primaryAuthority: row.source?.primaryAuthority ?? row.primaryAuthority ?? null,
    sourceCircular: row.source?.circular ?? null, circular: row.circular ?? null,
    circularPatternStopIds: row.circularPatternStopIds ?? [], routePatternStopIds: row.routePatternStopIds ?? [],
    direction: row.direction, origin: row.origin, destination: row.destination
  })),
  serviceSummaries: assessment.serviceSummaries.filter(row => route(row.routeNumber) === '230').map(row => ({
    id: row.id, timetableSource: row.timetableSource, source: row.source,
    circular: row.circular ?? null, circularPatternStopIds: row.circularPatternStopIds ?? [],
    routePatternStopIds: row.routePatternStopIds ?? [], routePatternStops: row.routePatternStops ?? [],
    orderedPatternStops: row.orderedPatternStops ?? [], direction: row.direction
  })),
  plannerRows: assessment.plannerServiceSummaries.filter(row => route(row.routeNumber) === '230').map(row => ({
    circular: row.circular, classification: row.circularServiceDecision?.classification ?? null,
    reason: row.circularServiceDecision?.reason ?? null,
    principalSourceRecordId: row.circularServiceDecision?.principalSourceRecordId ?? null,
    variants: (row.circularServiceDecision?.variantClassifications ?? []).map(item => ({
      sourceRecordIds: item.sourceRecordIds, classification: item.classification,
      variantClassification: item.variantClassification, loopClosureEvidence: item.loopClosureEvidence,
      completeOrderedPattern: item.completeOrderedPattern, orderedStopPoints: item.orderedStopPoints
    }))
  }))
} : null;
if (controlId === 'waltham') {
  const family = plannerRowsFor('13').find(row => route(row.routeNumber) === '13' && ['13', '13A', '13B', '13C'].every(member => (row.routeNumbers ?? []).includes(member)));
  if (!family || family.routeFamilyDecision?.principalRouteNumber !== '13') {
    throw new Error('Actual Run #75 Waltham runtime did not present routes 13/13A/13B/13C under principal route 13.');
  }
  const route13c = family.routeFamilyMembers?.find(member => member.routeNumber === '13C');
  if (!route13c || !/Two Brewers/i.test(`${route13c.destination} ${route13c.origin}`)) {
    throw new Error('Actual Run #75 route 13C branch destination was not retained as a distinct family member.');
  }
}
if (controlId === 'pipers') {
  const route230 = plannerRowsFor('230');
  if (!route230.length || !route230.every(row => row.typicalFrequencyLines?.length)) {
    throw new Error('Actual Run #75 Pipers route 230 planner evidence or frequency is missing.');
  }
}
if (controlId === 'pe1' || controlId === 'queensgate') {
  const routeX4 = plannerRowsFor('X4');
  if (routeX4.length !== 2 || !routeX4.every(row => row.typicalFrequencyLines?.length)) {
    throw new Error(`Actual Run #75 ${controlId} X4 should retain two directional frequency rows; received ${routeX4.length}.`);
  }
}

const compactGroupingDecision = decision => decision ? ({
  decision: decision.decision, reason: decision.reason, routeNumber: decision.routeNumber,
  sourceRecordIds: decision.sourceRecordIds, branchVariantRecordIds: decision.branchVariantRecordIds,
  shortWorkingRecordIds: decision.shortWorkingRecordIds, calendarVariantRecordIds: decision.calendarVariantRecordIds,
  materialDestinationEvidence: decision.materialDestinationEvidence
}) : null;
const compactFamilyDecision = decision => decision ? ({
  state: decision.state, principalRouteNumber: decision.principalRouteNumber,
  memberRouteNumbers: decision.memberRouteNumbers, reasons: decision.reasons,
  branchMemberRelationships: decision.branchMemberRelationships
}) : null;
const compactPlannerRows = rows => rows.map(row => ({
  id: row.id, routeNumber: row.routeNumber, routeNumbers: row.routeNumbers, operator: row.operator,
  direction: row.direction, origin: row.origin, destination: row.destination,
  directionPatternText: row.directionPatternText, principalLocations: row.principalLocations,
  typicalFrequencyLines: row.typicalFrequencyLines, operatingPeriodLines: row.operatingPeriodLines,
  sourceRecordIds: row.sourceRecordIds, groupingDecision: compactGroupingDecision(row.groupingDecision),
  routeFamilyDecision: compactFamilyDecision(row.routeFamilyDecision), routeFamilyMembers: row.routeFamilyMembers,
  circular: row.circular, circularClassification: row.circularClassification, circularReason: row.circularReason
}));
const compactSummaryRows = rows => rows.map(row => ({
  id: row.id, routeNumber: row.routeNumber, operator: row.operator, timetableSource: row.timetableSource,
  origin: row.origin, destination: row.destination, direction: row.direction,
  frequency: row.typicalFrequencyLines, operatingPeriod: row.operatingPeriodLines, sourceRecordIds: row.sourceRecordIds
}));
const compactRawRows = rows => rows.map(row => ({
  id: row.id, routeNumber: row.routeNumber, operator: row.operator, timetableSource: row.timetableSource,
  origin: row.origin, destination: row.destination, direction: row.direction,
  stopScheduleIds: row.stopScheduleIds, scheduledStops: row.scheduledStops
}));
const compactStops = stopRows.map(stop => ({
  id: stop.id, name: stop.name, distanceMetres: stop.distanceMetres,
  routes: (stop.routes ?? []).filter(value => wanted.has(route(value))),
  routeAuthorities: Object.fromEntries(Object.entries(stop.routeAuthorities ?? {}).filter(([key]) => wanted.has(route(key))))
}));
const rowConsolidationAudit = [...wanted].map(target => {
  const rawCount = rawRows.filter(row => route(row.routeNumber) === target).length;
  const summaryCount = serviceSummaries.filter(row => route(row.routeNumber) === target).length;
  const finalRows = plannerRowsFor(target);
  return {
    route: target, rawRecordCount: rawCount, serviceSummaryCount: summaryCount,
    plannerRowCount: finalRows.length,
    retainedPlannerRows: finalRows.length > 2 ? compactPlannerRows(finalRows) : []
  };
});

const report = {
  schema: 'atlas-bus-s2e1-normal-runtime-diagnostic-v1',
  candidateRoot,
  candidateProducerRun: '39430415441',
  candidateProducerSha: '151199cc914c235870f444d26b03c2309edbd035',
  candidateArtifactId: '12275615359',
  candidateArtifactDigest: 'sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471',
  controlId, control,
  composition: 'Production createBusStopDiscovery + TfL/prepared adapters + createAuthoritativeBusTimetableAdapter + createBusAssessment.inspectScope/assess + production summary/planner grouping',
  deterministicBoundary: 'Exact frozen Run #75 candidate files; all TfL adapter requests receive deterministic successful empty fixture responses; routing is a deterministic no-op stub.',
  sourceAcquisition: false, candidateModified: false,
  scope: scope.scope,
  stages: { stopsDiscovered: stopRows.length, stops: compactStops, tflFixtureRequests: tflRequests, tflLiveRequests: 0,
    nationalFilesRead: [...new Map(nationalRequests.map(item => [`${item.source}|${item.relative}`, item])).values()],
    rawRecordsByTargetRoute: Object.fromEntries([...wanted].map(r => [r, compactRawRows(rawRows.filter(row => route(row.routeNumber) === r))])),
    serviceSummariesByTargetRoute: Object.fromEntries([...wanted].map(r => [r, compactSummaryRows(serviceSummaries.filter(row => route(row.routeNumber) === r))])),
    plannerRowsByTargetRoute: Object.fromEntries([...wanted].map(r => [r, compactPlannerRows(plannerRowsFor(r))])),
    rowConsolidationAudit,
    sourceProvenance: { sourceAuthorities: unique(serviceSummaries.map(row => row.timetableSource).filter(Boolean)), tflLiveRequests: 0 },
    warnings: (assessment.warnings ?? []).slice(0, 40) },
  sameCandidatePreparedOnlyComparison: {
    rawTargetCounts: Object.fromEntries([...wanted].map(r => [r, preparedOnly.services.filter(row => route(row.routeNumber) === r).length])),
    summaryTargetCounts: Object.fromEntries([...wanted].map(r => [r, preparedOnly.serviceSummaries.filter(row => route(row.routeNumber) === r).length])),
    plannerTargetRows: preparedOnly.plannerServiceSummaries.filter(row => wanted.has(route(row.routeNumber)) || (row.routeNumbers ?? []).some(value => wanted.has(route(value)))).map(row => ({ id: row.id, routeNumber: row.routeNumber, routeNumbers: row.routeNumbers }))
  },
  comparisonLimit: 'The national-candidate matrix uses successful empty TfL fixture responses, so it exercises the prepared-national fallback without claiming historical TfL evidence. Chingford TfL behavior is covered separately by the fixture-backed route 657 regression test.',
  circularEvidenceAudit,
  publicationAttempted: false, deploymentAttempted: false
};
if (reportPath) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify({ schema: report.schema, reportPath, status: assessment.status, stopCount: stopRows.length,
  controlId, scope: scope.scope, tflFixtureRequests: tflRequests.length, tflLiveRequests: 0, rawTargetRecords: rawRows.length,
  summaries: Object.fromEntries([...wanted].map(r => [r, serviceSummaries.filter(row => route(row.routeNumber) === r).length]).filter(([, count]) => count)),
  planner: Object.fromEntries([...wanted].map(r => [r, plannerRowsFor(r).length]).filter(([, count]) => count)),
  rowConsolidationAudit: rowConsolidationAudit.filter(row => row.plannerRowCount > 2),
  preparedOnly: report.sameCandidatePreparedOnlyComparison,
  rawSourcesByRoute: Object.fromEntries([...wanted].map(r => [r, Object.fromEntries([...new Set(rawRows.filter(row => route(row.routeNumber) === r).map(row => row.timetableSource))].map(source => [source, rawRows.filter(row => route(row.routeNumber) === r && row.timetableSource === source).length]))])),
  targetPlannerRows: [...wanted].flatMap(r => plannerRowsFor(r).map(row => ({ route: row.routeNumber, members: row.routeNumbers,
    family: row.routeFamilyDecision?.state, principal: row.routeFamilyDecision?.principalRouteNumber,
    frequency: row.typicalFrequencyLines, circular: row.circularClassification }))) })}\n`);
