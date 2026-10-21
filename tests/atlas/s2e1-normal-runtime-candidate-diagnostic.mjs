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

const [candidateArg, reportArg, controlId = 'waltham'] = process.argv.slice(2);
if (!candidateArg || !reportArg) throw new Error('Usage: node tests/atlas/s2e1-normal-runtime-candidate-diagnostic.mjs <immutable-candidate-root> <report.json|-> [waltham|pipers|chingford|pe1|queensgate]');
const candidateRoot = path.resolve(candidateArg);
const reportPath = reportArg === '-' ? null : path.resolve(reportArg);
const busRoot = path.join(candidateRoot, 'atlas', 'data', 'bus');
const tndsRoot = path.join(candidateRoot, 'atlas', 'data', 'bus-tnds');
const nationalRequests = [];
const tflRequests = [];
const controls = {
  waltham: { label: '47 Berkley Avenue, Waltham Cross', latitude: 51.6857829, longitude: -0.0330001, radius: 700, focusRoutes: ['13', '13A', '13B', '13C'] },
  pipers: { label: 'Pipers Lane', latitude: 51.852700, longitude: -0.454343, radius: 700, focusRoutes: ['46', '230', '231', 'C'] },
  chingford: { label: 'Normanshire Drive, Chingford', latitude: 51.616596, longitude: -0.0117893, radius: 250, focusRoutes: ['357', '444', '657', 'W16'] },
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

// Fail closed for TfL instead of making live requests: this isolates the exact
// frozen candidate plus the production factories without changing national data.
async function noLiveTflFetch(input) {
  tflRequests.push(String(input));
  throw new Error('Deterministic diagnostic: live TfL HTTP is disabled');
}

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
const tflStops = createTflBusStopAdapter({ fetchImpl: noLiveTflFetch, cache, requestScheduler: scheduler });
const tflTimetable = createTflBusTimetableAdapter({ fetchImpl: noLiveTflFetch, cache, requestScheduler: scheduler });
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
  plannerServiceGroup: row.plannerServiceGroup
}));

const report = {
  schema: 'atlas-bus-s2e1-normal-runtime-diagnostic-v1',
  candidateRoot,
  candidateProducerRun: '39430415441',
  candidateProducerSha: '151199cc914c235870f444d26b03c2309edbd035',
  candidateArtifactId: '12275615359',
  candidateArtifactDigest: 'sha256:5cad24e0a47c4a77a8ec8616d746bf9f538404420fcb9505f297607632e1a471',
  controlId, control,
  composition: 'Production createBusStopDiscovery + TfL/prepared adapters + createAuthoritativeBusTimetableAdapter + createBusAssessment.inspectScope/assess + production summary/planner grouping',
  deterministicBoundary: 'Exact frozen Run #75 candidate files; TfL network calls deliberately disabled and reported; routing is a deterministic no-op stub.',
  sourceAcquisition: false, candidateModified: false,
  scope: scope.scope,
  stages: { stopsDiscovered: stopRows.length, stops: stopRows, tflRequestsAttempted: tflRequests.length,
    nationalFilesRead: [...new Map(nationalRequests.map(item => [`${item.source}|${item.relative}`, item])).values()],
    rawRecordsByTargetRoute: Object.fromEntries([...wanted].map(r => [r, rawRows.filter(row => route(row.routeNumber) === r)])),
    serviceSummariesByTargetRoute: Object.fromEntries([...wanted].map(r => [r, serviceSummaries.filter(row => route(row.routeNumber) === r)])),
    plannerRowsByTargetRoute: Object.fromEntries([...wanted].map(r => [r, plannerRows.filter(row => route(row.routeNumber) === r)])),
    sourceProvenance: assessment.provenance?.timetables ?? {},
    warnings: assessment.warnings ?? [] },
  sameCandidatePreparedOnlyComparison: {
    rawTargetCounts: Object.fromEntries([...wanted].map(r => [r, preparedOnly.services.filter(row => route(row.routeNumber) === r).length])),
    summaryTargetCounts: Object.fromEntries([...wanted].map(r => [r, preparedOnly.serviceSummaries.filter(row => route(row.routeNumber) === r).length])),
    plannerTargetRows: preparedOnly.plannerServiceSummaries.filter(row => wanted.has(route(row.routeNumber)) || (row.routeNumbers ?? []).some(value => wanted.has(route(value)))).map(row => ({ id: row.id, routeNumber: row.routeNumber, routeNumbers: row.routeNumbers }))
  },
  comparisonLimit: 'TfL HTTP is disabled, so the normal composition is exercised with its prepared-national fallback. This isolates the frozen national evidence and production planner path; it does not reproduce any TfL response/cache state from a historical browser session.',
  publicationAttempted: false, deploymentAttempted: false
};
if (reportPath) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify({ schema: report.schema, reportPath, status: assessment.status, stopCount: stopRows.length,
  controlId, scope: scope.scope, tflRequestsAttempted: tflRequests.length, rawTargetRecords: rawRows.length,
  summaries: Object.fromEntries([...wanted].map(r => [r, serviceSummaries.filter(row => route(row.routeNumber) === r).length]).filter(([, count]) => count)),
  planner: Object.fromEntries([...wanted].map(r => [r, plannerRows.filter(row => route(row.routeNumber) === r).length]).filter(([, count]) => count)),
  preparedOnly: report.sameCandidatePreparedOnlyComparison,
  stopRouteAuthority: stopRows.filter(stop => stop.routes?.some(value => wanted.has(route(value)))).map(stop => ({ id: stop.id, routes: stop.routes.filter(value => wanted.has(route(value))), routeAuthorities: Object.fromEntries(Object.entries(stop.routeAuthorities ?? {}).filter(([key]) => wanted.has(route(key)))) })),
  rawSourcesByRoute: Object.fromEntries([...wanted].map(r => [r, Object.fromEntries([...new Set(rawRows.filter(row => route(row.routeNumber) === r).map(row => row.timetableSource))].map(source => [source, rawRows.filter(row => route(row.routeNumber) === r && row.timetableSource === source).length]))])),
  summaryRows: serviceSummaries.map(({ routeNumber, timetableSource, origin, destination, direction }) => ({ routeNumber, timetableSource, origin, destination, direction })),
  plannerRows: plannerRows.map(row => ({ routeNumber: row.routeNumber, routeNumbers: row.routeNumbers,
    selectedPrincipal: row.publicRouteFamilyDecision?.principalRouteNumber,
    familyMembers: row.publicRouteFamilyDecision?.memberRouteNumbers,
    familyState: row.publicRouteFamilyDecision?.state,
    principalSelectionEvidence: row.publicRouteFamilyDecision?.principalSelectionEvidence })) })}\n`);
