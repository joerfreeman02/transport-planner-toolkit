import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const [candidateArg, reportArg] = process.argv.slice(2);
if (!candidateArg || !reportArg) throw new Error('Usage: node tests/atlas/s2e1-real-candidate-diagnostic.mjs <candidate-root> <report.json>');
const candidateRoot = path.resolve(candidateArg);
const reportPath = path.resolve(reportArg);
const busRoot = path.join(candidateRoot, 'atlas', 'data', 'bus');
const tndsRoot = path.join(candidateRoot, 'atlas', 'data', 'bus-tnds');
const requests = [];
let activeControl = null;

const controls = [
  { id: 'waltham', label: '47 Berkley Avenue, Waltham Cross', latitude: 51.6857829, longitude: -0.0330001, radius: 700, focusRoutes: ['13', '13A', '13B', '13C', '217', '279', '317', '327', '491', 'N279'] },
  { id: 'pipers', label: 'Pipers Lane', latitude: 51.852700, longitude: -0.454343, radius: 700, focusRoutes: ['46', '230', '231', 'C'] },
  { id: 'chingford', label: 'Normanshire Drive, Chingford', latitude: 51.616596, longitude: -0.0117893, radius: 250, focusRoutes: ['357', '444', '657', 'W16'] },
  { id: 'pe1', label: 'PE1 2TL', latitude: 52.577554, longitude: -0.242489, radius: 500, focusRoutes: ['X4', '1', '2', '3', '4', '5', '5A', '37', '101', '102'] },
  { id: 'queensgate', label: 'Queensgate Bus Station', latitude: 52.5701, longitude: -0.2498, radius: 500, focusRoutes: ['X4', '1', '2', '3', '4', '5', '5A', '37', '101', '102'] }
];

const text = value => String(value ?? '').trim();
const unique = values => [...new Set((values ?? []).map(text).filter(Boolean))];
const routeKey = value => text(value).toUpperCase().replace(/\s+/g, '');
const asDays = value => Object.fromEntries(Object.entries(value ?? {}).map(([day, entries]) => [day, Array.isArray(entries) ? entries : []]));

function compactSource(source = {}) {
  return {
    provider: source.provider ?? null,
    primaryAuthority: source.primaryAuthority ?? null,
    supplementaryProvider: source.supplementaryProvider ?? null,
    region: source.region ?? null,
    serviceCode: source.serviceCode ?? null,
    lineId: source.lineId ?? null,
    directionId: source.directionId ?? null,
    intervalId: source.intervalId ?? null,
    patternIds: source.patternIds ?? source.patternVariantId ?? null,
    patternVariantCount: source.patternVariantCount ?? null,
    fragmentId: source.fragmentId ?? source.fragment?.fragmentId ?? null,
    fragmentIndex: source.fragmentIndex ?? source.fragment?.fragmentIndex ?? null,
    fragmentCount: source.fragmentCount ?? source.fragment?.fragmentCount ?? null,
    parentServiceId: source.parentServiceId ?? source.fragment?.parentServiceId ?? null,
    calendarProfileId: source.calendarProfileId ?? null
  };
}

function departureCounts(value = {}) {
  return Object.fromEntries(Object.entries(asDays(value)).map(([day, entries]) => [day, {
    entries: entries.length,
    uniqueTimes: new Set(entries.map(item => typeof item === 'string' ? item : item?.time ?? item?.departureTime ?? item?.scheduledTime).filter(Boolean)).size,
    sample: unique(entries.slice(0, 8).map(item => typeof item === 'string' ? item : item?.time ?? item?.departureTime ?? item?.scheduledTime))
  }]));
}

function compactEvidenceRecord(record = {}) {
  return {
    id: record.id ?? null,
    routeNumber: record.routeNumber ?? null,
    operator: record.operator ?? null,
    timetableSource: record.timetableSource ?? record.provider ?? record.source?.provider ?? null,
    source: compactSource(record.source),
    origin: record.origin ?? null,
    destination: record.destination ?? null,
    direction: record.direction ?? null,
    routePatternStopIds: record.routePatternStopIds ?? [],
    routePatternNames: (record.routePatternStops ?? []).map(stop => text(stop.name ?? stop.commonName ?? stop)),
    patternIds: record.source?.patternIds ?? record.source?.patternVariantId ?? record.source?.patternId ?? [],
    calendarProfileId: record.calendarProfileId ?? record.source?.calendarProfileId ?? null,
    calendarEvidence: record.calendarEvidence ?? [],
    specialDaysOperation: record.specialDaysOperation ?? record.source?.specialDaysOperation ?? null,
    validFrom: record.validFrom ?? record.validity?.from ?? null,
    validTo: record.validTo ?? record.validity?.to ?? null,
    fragment: record.fragment ?? record.source?.fragment ?? null,
    stopIds: Object.keys(record.stopSchedules ?? {}),
    departuresByStopAndDay: Object.fromEntries(Object.entries(record.stopSchedules ?? {}).map(([stopId, schedule]) => [stopId, departureCounts(schedule)])),
    departureEvidenceByDay: departureCounts(record.departureEvidenceByDay),
    frequencyByDay: record.frequencyByDay ?? null,
    typicalFrequency: record.typicalFrequency ?? null,
    operatingPeriods: record.operatingPeriods ?? null,
    frequencyEvidence: record.frequencyEvidence ?? []
  };
}

function compactPlannerRow(row = {}) {
  const group = row.plannerServiceGroup ?? {};
  const decision = row.publicRouteFamilyDecision ?? group.publicRouteFamilyDecision ?? null;
  return {
    id: row.id,
    routeNumber: row.routeNumber,
    routeNumbers: row.routeNumbers ?? [],
    publicRouteNumbers: row.publicRouteNumbers ?? [],
    memberRouteNumbers: row.memberRouteNumbers ?? [],
    routeFamilyLabel: row.routeFamilyLabel ?? null,
    operator: row.operator ?? null,
    operatorRawNames: row.operatorRawNames ?? [],
    operatorIdentities: row.operatorIdentities ?? [],
    timetableSource: row.timetableSource ?? null,
    sourceAuthority: row.sourceAuthority ?? group.publicServiceGroupingDecision?.authority ?? null,
    origin: row.origin ?? null,
    destination: row.destination ?? null,
    direction: row.direction ?? null,
    directionPatternText: row.directionPatternText ?? null,
    principalLocations: row.principalLocations ?? [],
    routePatternStopIds: row.routePatternStops?.map(stop => stop.id ?? stop.stopPointId ?? stop) ?? [],
    routePatternExtent: row.routePatternExtent ?? null,
    recordActivity: row.recordActivity ?? null,
    servedAtStopId: row.servedAtStopId ?? null,
    servedStopIds: row.stopIds ?? [],
    timetableBasisStopLabel: row.timetableBasisStopLabel ?? null,
    frequencyBasisStopId: row.frequencyBasisStopId ?? null,
    calendarProfileIds: row.calendarProfileIds ?? [],
    frequencyByDay: row.frequencyByDay ?? null,
    typicalFrequency: row.typicalFrequency ?? null,
    typicalFrequencyLines: row.typicalFrequencyLines ?? [],
    operatingPeriods: row.operatingPeriods ?? null,
    operatingPeriodLines: row.operatingPeriodLines ?? [],
    uniqueDeparturesByDay: departureCounts(row.canonicalDeparturePopulationAll),
    circular: row.circular ?? null,
    circularServiceDecision: row.circularServiceDecision ?? null,
    qualificationNotes: row.qualificationNotes ?? [],
    serviceNote: row.serviceNote ?? null,
    shortWorkingClassification: row.shortWorkingClassification ?? row.groupingDecision?.shortWorkingClassification ?? null,
    additionalServiceClassification: row.additionalServiceClassification ?? row.groupingDecision?.additionalServiceClassification ?? null,
    groupingDecision: row.publicServiceGroupingDecision ?? group.publicServiceGroupingDecision ?? null,
    terminusDecision: row.terminusDecision ?? group.terminusDecision ?? null,
    publicRouteFamilyDecision: decision,
    routeFamilyMembers: row.routeFamilyMembers ?? [],
    sourceRecordIds: row.sourceRecordIds ?? [],
    sourceWarnings: row.sourceWarnings ?? []
  };
}

async function fileFetch(input) {
  const pathname = new URL(input).pathname;
  const busMarker = '/atlas/data/bus/';
  const tndsMarker = '/atlas/data/bus-tnds/';
  const busIndex = pathname.indexOf(busMarker);
  const tndsIndex = pathname.indexOf(tndsMarker);
  const base = busIndex >= 0 ? busRoot : tndsIndex >= 0 ? tndsRoot : null;
  const relative = busIndex >= 0 ? pathname.slice(busIndex + busMarker.length) : tndsIndex >= 0 ? pathname.slice(tndsIndex + tndsMarker.length) : null;
  if (!base || relative == null) return new Response('', { status: 404 });
  const file = path.resolve(base, decodeURIComponent(relative));
  if (file !== path.join(base, 'manifest.json') && !file.startsWith(`${base}${path.sep}`)) return new Response('', { status: 404 });
  requests.push({ control: activeControl, source: base === busRoot ? 'BODS/NaPTAN' : 'TNDS', relative });
  try { return new Response(await readFile(file), { status: 200 }); }
  catch { return new Response('', { status: 404 }); }
}

const adapter = createPreparedBusDataAdapter({
  fetchImpl: fileFetch,
  baseUrl: 'http://candidate.local/atlas/data/bus/',
  tndsBaseUrl: 'http://candidate.local/atlas/data/bus-tnds/',
  timeoutMs: 120000
});

const results = {};
for (const control of controls) {
  activeControl = control.id;
  const site = confirmSite(createSite({
    suppliedAddress: control.label,
    displayAddress: control.label,
    latitude: control.latitude,
    longitude: control.longitude,
    assessmentPoint: { method: 'coordinates_entered' }
  }), { confirmedAt: '2026-10-20T00:00:00Z' });
  let servicesResult = null;
  try {
  const app = createBusAssessment({
    stopDiscovery: { nearbyStops: (...args) => adapter.nearbyStops(...args) },
    timetableData: { servicesForStops: async (...args) => (servicesResult = await adapter.servicesForStops(...args)) },
    accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'hosted frozen-candidate diagnostic' } }) }
  });
  const assessment = await app.assess(site, { radius: control.radius, mode: 'full' });
  const rawRows = (servicesResult?.data ?? []).filter(row => control.focusRoutes.map(routeKey).includes(routeKey(row.routeNumber)));
  const serviceSummaries = (assessment.serviceSummaries ?? []).filter(row => control.focusRoutes.map(routeKey).includes(routeKey(row.routeNumber)) || (row.routeNumbers ?? []).some(route => control.focusRoutes.map(routeKey).includes(routeKey(route))));
  const plannerRows = (assessment.plannerServiceSummaries ?? []).map(compactPlannerRow);
  const focusPlannerRows = plannerRows.filter(row => control.focusRoutes.map(routeKey).includes(routeKey(row.routeNumber)) || [...row.routeNumbers, ...row.memberRouteNumbers, ...row.publicRouteNumbers].some(route => control.focusRoutes.map(routeKey).includes(routeKey(route))));
  const wordTables = buildBusWordTables(assessment);
  const wordRows = wordTables[1]?.rows ?? [];
  const plannerRouteNumbers = unique(plannerRows.flatMap(row => [row.routeNumber, ...row.routeNumbers, ...row.memberRouteNumbers, ...row.publicRouteNumbers]));
  const wordText = (wordRows ?? []).map(row => Array.isArray(row) ? String(row[0] ?? '') : String(row?.text ?? '')).join('\n');
  const wordRouteNumbers = plannerRouteNumbers.filter(route => new RegExp(`(^|[^A-Za-z0-9])${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(wordText));
  const plannerRowCounts = Object.fromEntries([...new Set(plannerRows.map(row => row.routeNumber))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(route => [route, plannerRows.filter(row => row.routeNumber === route).length]));
  const rawCounts = Object.fromEntries([...new Set(rawRows.map(row => text(row.routeNumber)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(route => [route, rawRows.filter(row => routeKey(row.routeNumber) === routeKey(route)).length]));
  const summaryCounts = Object.fromEntries([...new Set(serviceSummaries.map(row => text(row.routeNumber)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(route => [route, serviceSummaries.filter(row => routeKey(row.routeNumber) === routeKey(route)).length]));
  const overTwo = Object.entries(plannerRowCounts).filter(([, count]) => count > 2).map(([route, count]) => ({ route, count, rows: plannerRows.filter(row => row.routeNumber === route) }));
  results[control.id] = {
    control,
    status: assessment.status,
    stopCount: assessment.discoveredStopCount,
    stops: (assessment.stops ?? []).map(stop => ({ id: stop.id, name: stop.name, routes: stop.routes ?? [], timetableAuthority: stop.timetableAuthority ?? null, timetableCallEligible: stop.timetableCallEligible ?? null, timetableEvidenceStatus: stop.timetableEvidenceStatus ?? null })),
    sourceCondition: servicesResult?.provenance?.supplementarySourceCondition ?? null,
    sourceCompleteness: servicesResult?.provenance?.sourceCompleteness ?? null,
    failedShards: servicesResult?.provenance?.failedShardDiagnostics ?? [],
    requestedShards: [...new Map(requests.filter(item => item.control === control.id).map(item => [`${item.source}|${item.relative}`, item])).values()],
    rawServiceRecords: rawRows.map(compactEvidenceRecord),
    serviceSummaries: serviceSummaries.map(summary => ({
      id: summary.id,
      routeNumber: summary.routeNumber,
      routeNumbers: summary.routeNumbers ?? [],
      operator: summary.operator,
      timetableSource: summary.timetableSource ?? summary.provider ?? summary.frequencyEvidenceSource ?? null,
      sourceAuthorities: summary.sourceAuthorities ?? summary.sourceProviders ?? [],
      origin: summary.origin,
      destination: summary.destination,
      direction: summary.direction,
      routePatternStopIds: summary.routePatternStopIds ?? [],
      routePatternExtent: summary.routePatternExtent ?? null,
      recordActivity: summary.recordActivity ?? null,
      variantCount: summary.variantCount ?? null,
      variantServiceIds: summary.variantServiceIds ?? [],
      sourceRecordIds: summary.sourceRecordIds ?? [],
      calendarProfileIds: summary.calendarProfileIds ?? (summary.calendarProfileId ? [summary.calendarProfileId] : []),
      frequencyByDay: summary.frequencyByDay ?? null,
      typicalFrequency: summary.typicalFrequency ?? null,
      typicalFrequencyLines: summary.typicalFrequencyLines ?? [],
      operatingPeriods: summary.operatingPeriods ?? null,
      operatingPeriodLines: summary.operatingPeriodLines ?? [],
      uniqueDeparturesByDay: departureCounts(summary.departuresByDay),
      circular: summary.circular ?? null,
      circularServiceDecision: summary.circularServiceDecision ?? null,
      serviceNote: summary.serviceNote ?? null,
      sourceWarnings: summary.sourceWarnings ?? [],
      rawEvidence: (summary.rawServiceSummaries ?? []).map(compactEvidenceRecord)
    })),
    plannerRows: focusPlannerRows,
    rowCounts: { rawEvidenceRecordsByRoute: rawCounts, serviceSummariesByRoute: summaryCounts, plannerRowsByRoute: plannerRowCounts, routesOverTwoPlannerRows: overTwo.map(({ route, count }) => ({ route, count })) },
    qaReviewItems: (assessment.reviewItems ?? assessment.sourceChecks ?? []).map(item => ({ code: item.code ?? item.id ?? null, route: item.route ?? null, stop: item.stop ?? item.stopId ?? null, source: item.source ?? null, severity: item.severity ?? null, message: item.message ?? item.label ?? null })),
    qaSummary: { reviewItemCount: (assessment.reviewItems ?? assessment.sourceChecks ?? []).length, status: assessment.status },
    wordRouteParity: { plannerRoutes: plannerRouteNumbers, wordRoutes: wordRouteNumbers, missingFromWord: plannerRouteNumbers.filter(route => !wordRouteNumbers.includes(route)) }
  };
  } catch (error) {
    results[control.id] = {
      control,
      status: 'diagnostic_error',
      error: { name: error?.name ?? 'Error', message: String(error?.message ?? error).slice(0, 2000) },
      sourceCondition: servicesResult?.provenance?.supplementarySourceCondition ?? null,
      sourceCompleteness: servicesResult?.provenance?.sourceCompleteness ?? null,
      failedShards: servicesResult?.provenance?.failedShardDiagnostics ?? [],
      requestedShards: [...new Map(requests.filter(item => item.control === control.id).map(item => [`${item.source}|${item.relative}`, item])).values()],
      rawServiceRecords: (servicesResult?.data ?? []).filter(row => control.focusRoutes.map(routeKey).includes(routeKey(row.routeNumber))).map(compactEvidenceRecord),
      serviceSummaries: [],
      plannerRows: [],
      rowCounts: { rawEvidenceRecordsByRoute: {}, serviceSummariesByRoute: {}, plannerRowsByRoute: {}, routesOverTwoPlannerRows: [] },
      qaReviewItems: [],
      qaSummary: { reviewItemCount: null, status: 'diagnostic_error' },
      wordRouteParity: { plannerRoutes: [], wordRoutes: [], missingFromWord: [] }
    };
  }
  activeControl = null;
}

const report = {
  schema: 'atlas-bus-s2e1-real-candidate-diagnostic-v1',
  candidateRoot,
  candidateProducerRun: '39430415441',
  candidateProducerSha: '151199cc914c235870f444d26b03c2309edbd035',
  candidateArtifactId: '12275615359',
  candidateArtifactDigest: 'sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471',
  sourceAcquisition: false,
  nationalPreparation: false,
  publicationAttempted: false,
  deploymentAttempted: false,
  controls: results,
  observedRequestCount: requests.length,
  noHttpFailures: requests.every(item => item.relative && item.control)
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ schema: report.schema, reportPath, controls: Object.fromEntries(Object.entries(results).map(([id, value]) => [id, { status: value.status, stopCount: value.stopCount, rawRows: value.rawServiceRecords.length, summaryRows: value.serviceSummaries.length, plannerRows: value.plannerRows.length, routesOverTwo: value.rowCounts.routesOverTwoPlannerRows }])) })}\n`);
