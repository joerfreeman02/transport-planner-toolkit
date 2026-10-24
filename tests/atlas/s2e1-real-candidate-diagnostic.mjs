import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { sourceSuccess } from '../../src/atlas/adapters/source-adapter.mjs';
import { createAtlasReferenceData } from '../../src/atlas/reference-data/atlas-reference-data.mjs';
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
  { id: 'waltham', label: '47 Berkley Avenue, Waltham Cross', latitude: 51.6857829, longitude: -0.0330001, radius: 700, focusRoutes: ['13', '13A', '13B', '13C', '66', '217', '279', '317', '327', '491', 'N279'] },
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
    uniqueTimes: new Set(entries.map(item => typeof item === 'string' || typeof item === 'number' ? item : item?.minute ?? item?.departureMinute ?? item?.time ?? item?.departureTime ?? item?.scheduledTime).filter(value => value !== null && value !== undefined && value !== '')).size,
    sample: unique(entries.slice(0, 8).map(item => typeof item === 'string' || typeof item === 'number' ? item : item?.minute ?? item?.departureMinute ?? item?.time ?? item?.departureTime ?? item?.scheduledTime))
  }]));
}

function compactCalendarEvidence(value) {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  return entries.map(item => item && typeof item === 'object' ? {
    id: item.id ?? item.calendarId ?? item.profileId ?? null,
    profileId: item.calendarProfileId ?? item.profileId ?? null,
    operatingDays: item.operatingDays ?? item.days ?? null,
    validFrom: item.validFrom ?? item.from ?? null,
    validTo: item.validTo ?? item.to ?? null,
    specialDaysOperation: item.specialDaysOperation ?? item.operation ?? null
  } : item).slice(0, 30);
}

function compactEvidenceRecord(record = {}, assessedStopIds = []) {
  const relevantStopIds = new Set(assessedStopIds);
  const schedules = Object.fromEntries(Object.entries(record.stopSchedules ?? {}).filter(([stopId]) => relevantStopIds.has(stopId)));
  const rawSpecialDays = record.specialDaysOperation ?? record.source?.specialDaysOperation ?? null;
  return {
    id: record.id ?? null,
    routeNumber: record.routeNumber ?? null,
    operator: record.operator ?? null,
    timetableSource: record.timetableSource ?? record.provider ?? record.source?.provider ?? null,
    source: compactSource(record.source),
    origin: record.origin ?? null,
    destination: record.destination ?? null,
    direction: record.direction ?? null,
    routePatternStopIds: (record.routePatternStopIds ?? []).slice(0, 100),
    routePatternNames: (record.routePatternStops ?? []).slice(0, 100).map(stop => text(stop.name ?? stop.commonName ?? stop)),
    patternIds: (Array.isArray(record.source?.patternIds ?? record.source?.patternVariantId ?? record.source?.patternId) ? record.source?.patternIds ?? record.source?.patternVariantId ?? record.source?.patternId : [record.source?.patternIds ?? record.source?.patternVariantId ?? record.source?.patternId]).filter(Boolean).slice(0, 50),
    calendarProfileId: record.calendarProfileId ?? record.source?.calendarProfileId ?? null,
    calendarEvidence: compactCalendarEvidence(record.calendarEvidence),
    specialDaysOperation: Array.isArray(rawSpecialDays) ? rawSpecialDays.slice(0, 20) : rawSpecialDays && typeof rawSpecialDays === 'object' ? Object.fromEntries(Object.entries(rawSpecialDays).slice(0, 20)) : rawSpecialDays,
    validFrom: record.validFrom ?? record.validity?.from ?? null,
    validTo: record.validTo ?? record.validity?.to ?? null,
    fragment: record.fragment ?? record.source?.fragment ?? null,
    stopIds: Object.keys(record.stopSchedules ?? {}).filter(stopId => relevantStopIds.has(stopId)),
    departuresByStopAndDay: Object.fromEntries(Object.entries(schedules).map(([stopId, schedule]) => [stopId, departureCounts(schedule)])),
    departureEvidenceByDay: departureCounts(record.departureEvidenceByDay),
    frequencyByDay: record.frequencyByDay ?? null,
    typicalFrequency: record.typicalFrequency ?? null,
    operatingPeriods: record.operatingPeriods ?? null,
    frequencyEvidence: Array.isArray(record.frequencyEvidence) ? record.frequencyEvidence.slice(0, 40).map(item => item && typeof item === 'object' ? {
      source: item.source ?? item.provider ?? null,
      stopId: item.stopId ?? item.stopPointId ?? null,
      day: item.day ?? item.dayType ?? null,
      count: item.departureCount ?? item.uniqueJourneyCount ?? item.count ?? null,
      basis: item.basis ?? null,
      calendarProfileId: item.calendarProfileId ?? null
    } : item) : []
  };
}

function compactCircularDecision(value = {}) {
  value ??= {};
  return {
    type: value.type ?? null,
    publicRouteIdentity: value.publicRouteIdentity ?? null,
    classification: value.classification ?? null,
    reason: value.reason ?? null,
    principalSourceRecordId: value.principalSourceRecordId ?? null,
    sourceRecordCount: value.sourceRecordIds?.length ?? 0,
    patternCount: value.variantClassifications?.length ?? 0,
    principalLoopClosure: value.loopClosureEvidence ? {
      proven: value.loopClosureEvidence.proven ?? null,
      basis: value.loopClosureEvidence.basis ?? null,
      samePhysicalStopPoint: value.loopClosureEvidence.samePhysicalStopPoint ?? null,
      sameAuthoritativeStopArea: value.loopClosureEvidence.sameAuthoritativeStopArea ?? null,
      sameLogicalPlace: value.loopClosureEvidence.sameLogicalPlace ?? null
    } : null,
    closedPatternCount: (value.variantClassifications ?? []).filter(item => item.loopClosureEvidence?.proven || item.classification === 'circular').length,
    openPatternCount: (value.variantClassifications ?? []).filter(item => item.completeOrderedPattern && item.classification !== 'circular').length,
    variantClassifications: (value.variantClassifications ?? []).map(item => ({
      sourceRecordId: item.sourceRecordId ?? item.recordId ?? null,
      classification: item.classification ?? null,
      reason: item.reason ?? null,
      completeOrderedPattern: item.completeOrderedPattern ?? null,
      loopClosureProven: item.loopClosureEvidence?.proven ?? null,
      loopClosureBasis: item.loopClosureEvidence?.basis ?? null
    })).slice(0, 40)
  };
}

function compactGroupingDecision(value = {}) {
  value ??= {};
  return {
    type: value.type ?? null,
    decision: value.decision ?? null,
    reason: value.reason ?? null,
    publicRouteFamilyKey: value.publicRouteFamilyKey ?? null,
    routeNumber: value.routeNumber ?? null,
    authority: value.authority ?? null,
    providers: value.providers ?? [],
    operators: value.operators ?? [],
    sourceRecordCount: value.sourceRecordIds?.length ?? 0,
    groupedRecordCount: value.groupedSourceRecordIds?.length ?? 0,
    deduplicatedRecordCount: value.deduplicatedSourceRecordIds?.length ?? 0,
    shortWorkingRecordCount: value.shortWorkingRecordIds?.length ?? 0,
    shortWorkingRecordIds: value.shortWorkingRecordIds ?? [],
    branchVariantRecordIds: value.branchVariantRecordIds ?? [],
    branchVariantRecordCount: value.branchVariantRecordIds?.length ?? 0,
    calendarVariantRecordCount: value.calendarVariantRecordIds?.length ?? 0,
    alternateDestinations: (value.alternateDestinations ?? []).slice(0, 20),
    materialDestinationEvidence: (value.materialDestinationEvidence ?? []).slice(0, 20),
    calendarProfiles: value.calendarProfiles ?? [],
    principalPattern: value.principalPattern ? {
      sourceRecordId: value.principalPattern.sourceRecordId ?? null,
      stopCount: value.principalPattern.orderedRoutePatternStopIds?.length ?? 0,
      origin: value.principalPattern.endpoint?.origin ?? null,
      destination: value.principalPattern.endpoint?.destination ?? null
    } : null
  };
}

function compactTerminusDecision(value = {}) {
  value ??= {};
  return {
    type: value.type ?? null,
    status: value.status ?? null,
    presentation: value.presentation ?? null,
    proven: value.proven ?? null,
    assessedPlace: value.assessedPlace ?? null,
    reason: value.reason ?? null,
    note: value.note ?? null,
    suppressedArrivalCount: value.suppressedArrivalSourceRecordIds?.length ?? 0
  };
}

function compactFamilyDecision(value = {}) {
  value ??= {};
  return {
    type: value.type ?? null,
    state: value.state ?? null,
    candidateStem: value.candidateStem ?? null,
    familyKey: value.familyKey ?? null,
    memberRouteNumbers: value.memberRouteNumbers ?? [],
    principalRouteNumber: value.principalRouteNumber ?? null,
    principalMemberRowId: value.principalMemberRowId ?? null,
    principalSelectionEvidence: value.principalSelectionEvidence ? Object.fromEntries(Object.entries(value.principalSelectionEvidence).filter(([, entry]) => entry == null || ['string', 'number', 'boolean'].includes(typeof entry))) : null,
    reasonCount: value.reasons?.length ?? 0,
    unresolved: value.unresolved ?? null
  };
}

function compactRouteFamilyMembers(value = []) {
  value ??= [];
  return value.map(member => ({
    routeNumber: member.routeNumber ?? null,
    operator: member.operator ?? null,
    origin: member.origin ?? null,
    destination: member.destination ?? null,
    principalLocations: member.principalLocations ?? [],
    sourceAuthority: member.sourceAuthority ?? member.timetableSource ?? null,
    sourceRecordCount: member.sourceRecordIds?.length ?? 0,
    calendarProfileIds: member.calendarProfileIds ?? [],
    shortWorkingClassification: member.shortWorkingClassification ?? null,
    additionalServiceClassification: member.additionalServiceClassification ?? null
  })).slice(0, 40);
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
    circularServiceDecision: compactCircularDecision(row.circularServiceDecision),
    qualificationNotes: row.qualificationNotes ?? [],
    serviceNote: row.serviceNote ?? null,
    shortWorkingClassification: row.shortWorkingClassification ?? row.groupingDecision?.shortWorkingClassification ?? null,
    additionalServiceClassification: row.additionalServiceClassification ?? row.groupingDecision?.additionalServiceClassification ?? null,
    groupingDecision: compactGroupingDecision(row.publicServiceGroupingDecision ?? group.publicServiceGroupingDecision),
    terminusDecision: compactTerminusDecision(row.terminusDecision ?? group.terminusDecision),
    publicRouteFamilyDecision: compactFamilyDecision(decision),
    routeFamilyMembers: compactRouteFamilyMembers(row.routeFamilyMembers),
    sourceRecordIds: row.sourceRecordIds ?? [],
    sourceWarnings: row.sourceWarnings ?? [],
    debugKeys: { row: Object.keys(row), group: Object.keys(group) },
    groupingDetail: group.publicServiceGroupingDecision ? { shortWorkingRecordIds: group.publicServiceGroupingDecision.shortWorkingRecordIds, branchVariantRecordIds: group.publicServiceGroupingDecision.branchVariantRecordIds, calendarVariantRecordIds: group.publicServiceGroupingDecision.calendarVariantRecordIds, principalPattern: group.publicServiceGroupingDecision.principalPattern } : null,
    componentServices: (group.services ?? []).map(service => ({ id: service.id, sourceRecordIds: service.sourceRecordIds, origin: service.origin, destination: service.destination, direction: service.direction, routePatternStopIds: service.routePatternStopIds, calendarProfileId: service.calendarProfileId, schedulesAtBasis: service.stopSchedules?.[row.frequencyBasisStopId] ?? service.departuresByDay }))
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
const referenceData = createAtlasReferenceData({ adapter });
const deterministicNoTfL = {
  servicesForStop: async ({ lineId, stopPointId }) => sourceSuccess({
    data: [],
    warnings: [],
    provenance: { source: 'deterministic offline diagnostic', routeNumber: lineId, stopId: stopPointId, timetableConclusion: 'NO_CURRENT_MATCH' }
  })
};
const authoritativeTimetable = createAuthoritativeBusTimetableAdapter({
  tflAdapter: deterministicNoTfL,
  nationalAdapter: adapter,
  londonSupplementAdapter: adapter
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
  const timetableAdapter = control.id === 'waltham' ? authoritativeTimetable : adapter;
  const app = createBusAssessment({
    stopDiscovery: { nearbyStops: (...args) => adapter.nearbyStops(...args) },
    timetableData: { servicesForStops: async (...args) => (servicesResult = await timetableAdapter.servicesForStops(...args)) },
    ...(control.id === 'waltham' ? { referenceData } : {}),
    accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: { source: 'hosted frozen-candidate diagnostic' } }) }
  });
  const assessment = await app.assess(site, { radius: control.radius, mode: 'full' });
  const assessedStopIds = (assessment.stops ?? []).map(stop => stop.id).filter(Boolean);
  const rawRows = (servicesResult?.data ?? []).filter(row => control.focusRoutes.map(routeKey).includes(routeKey(row.routeNumber)));
  const serviceSummaries = (assessment.serviceSummaries ?? []).filter(row => control.focusRoutes.map(routeKey).includes(routeKey(row.routeNumber)) || (row.routeNumbers ?? []).some(route => control.focusRoutes.map(routeKey).includes(routeKey(route))));
  const plannerRows = (assessment.plannerServiceSummaries ?? []).map(compactPlannerRow);
  const focusPlannerRows = plannerRows.filter(row => control.focusRoutes.map(routeKey).includes(routeKey(row.routeNumber)) || [...row.routeNumbers, ...row.memberRouteNumbers, ...row.publicRouteNumbers].some(route => control.focusRoutes.map(routeKey).includes(routeKey(route))));
  const wordTables = buildBusWordTables(assessment);
  const wordRows = wordTables[1]?.rows ?? [];
  if (control.id === 'waltham') {
    const route66 = (assessment.plannerServiceSummaries ?? []).filter(row => String(row.routeNumber) === '66' && String(row.frequencyBasisStopId) === '210021703430');
    assert.equal(route66.length, 1, 'the production timetable/reference composition must produce one Route 66 principal row at Waltham Stop C');
    assert.ok((route66[0].canonicalDeparturePopulation?.monday?.length ?? 0) > 2, 'the complete frozen-candidate weekday Route 66 population cannot collapse to the historical two-journey subset');
    assert.ok((route66[0].canonicalDeparturePopulation?.saturday?.length ?? 0) > 1, 'the complete frozen-candidate Saturday Route 66 population cannot collapse to the historical one-journey subset');
    assert.equal(route66[0].operatingPeriods?.monday?.first, '05:29', 'Route 66 weekday start must reflect the selected-stop frozen population');
    assert.equal(route66[0].operatingPeriods?.monday?.last, '19:05', 'Route 66 weekday end must reflect the selected-stop frozen population');
    assert.ok(route66[0].sourceRecordIds.some(id => String(id).startsWith('tnds:')) && route66[0].sourceRecordIds.some(id => String(id).startsWith('south_east:')), 'the Route 66 principal row must retain both frozen TNDS and BODS provenance');
    const route66WordRow = wordRows.find(row => Array.isArray(row) && String(row[0]) === '66' && String(row[1]).includes('Arriva Herts'));
    assert.ok(route66WordRow, 'the frozen-candidate Route 66 principal service must reach the real Word table composition path');
    assert.match(String(route66WordRow[5]), /Typically every/i, 'the Route 66 Word summary must include its full principal frequency, not the historical 2/1 subset');
    assert.match(String(route66WordRow[6]), /05:29[\s\S]*19:05/, 'the Route 66 Word summary must retain the full operating period');
  }
  const plannerRouteNumbers = unique(plannerRows.flatMap(row => [row.routeNumber, ...row.routeNumbers, ...row.memberRouteNumbers, ...row.publicRouteNumbers]));
  const wordText = (wordRows ?? []).map(row => Array.isArray(row) ? String(row[0] ?? '') : String(row?.text ?? '')).join('\n');
  const wordRouteNumbers = plannerRouteNumbers.filter(route => new RegExp(`(^|[^A-Za-z0-9])${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(wordText));
  const plannerRowCounts = Object.fromEntries([...new Set(plannerRows.map(row => row.routeNumber))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(route => [route, plannerRows.filter(row => row.routeNumber === route).length]));
  const rawCounts = Object.fromEntries([...new Set(rawRows.map(row => text(row.routeNumber)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(route => [route, rawRows.filter(row => routeKey(row.routeNumber) === routeKey(route)).length]));
  const summaryCounts = Object.fromEntries([...new Set(serviceSummaries.map(row => text(row.routeNumber)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(route => [route, serviceSummaries.filter(row => routeKey(row.routeNumber) === routeKey(route)).length]));
  const overTwo = Object.entries(plannerRowCounts).filter(([, count]) => count > 2).map(([route, count]) => ({ route, count, rows: plannerRows.filter(row => row.routeNumber === route) }));
  const overTwoRows = overTwo.flatMap(item => item.rows);
  const capturedRows = [...new Map([...focusPlannerRows, ...overTwoRows].map(row => [row.id, row])).values()];
  const reviewItems = assessment.reviewItems ?? assessment.sourceChecks ?? [];
  const reviewItemsByCode = Object.fromEntries([...new Set(reviewItems.map(item => text(item.code ?? item.id ?? 'unknown')))].map(code => [code, reviewItems.filter(item => text(item.code ?? item.id ?? 'unknown') === code).length]));
  results[control.id] = {
    control,
    status: assessment.status,
    stopCount: assessment.discoveredStopCount,
    stops: (assessment.stops ?? []).map(stop => ({ id: stop.id, name: stop.name, routes: stop.routes ?? [], timetableAuthority: stop.timetableAuthority ?? null, timetableCallEligible: stop.timetableCallEligible ?? null, timetableEvidenceStatus: stop.timetableEvidenceStatus ?? null })),
    sourceCondition: servicesResult?.provenance?.supplementarySourceCondition ?? null,
    sourceCompleteness: servicesResult?.provenance?.sourceCompleteness ?? null,
    failedShards: servicesResult?.provenance?.failedShardDiagnostics ?? [],
    requestedShards: [...new Map(requests.filter(item => item.control === control.id).map(item => [`${item.source}|${item.relative}`, item])).values()],
    rawServiceRecords: rawRows.map(row => compactEvidenceRecord(row, assessedStopIds)),
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
      rawEvidence: (summary.rawServiceSummaries ?? []).map(row => compactEvidenceRecord(row, assessedStopIds))
    })),
    plannerRows: capturedRows,
    rowCounts: { rawEvidenceRecordsByRoute: rawCounts, serviceSummariesByRoute: summaryCounts, plannerRowsByRoute: plannerRowCounts, routesOverTwoPlannerRows: overTwo.map(({ route, count }) => ({ route, count })) },
    routesOverTwoPlannerRows: overTwo.map(({ route, count, rows }) => ({ route, count, rows })),
    qaReviewItems: reviewItems.slice(0, 100).map(item => ({ code: item.code ?? item.id ?? null, route: item.route ?? null, stop: item.stop ?? item.stopId ?? null, source: item.source ?? null, severity: item.severity ?? null, message: item.message ?? item.label ?? null })),
    qaSummary: { reviewItemCount: reviewItems.length, reviewItemsByCode, status: assessment.status },
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
      rawServiceRecords: (servicesResult?.data ?? []).filter(row => control.focusRoutes.map(routeKey).includes(routeKey(row.routeNumber))).map(row => compactEvidenceRecord(row)),
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
  pipelineCoverage: {
    stopDiscovery: 'prepared-bus-data-adapter-only',
    timetableData: 'prepared-bus-data-adapter-only',
    productionBrowserStopDiscovery: 'create-bus-stop-discovery-with-tfl-and-prepared-naptan',
    productionBrowserTimetableData: 'authoritative-adapter-with-tfl-and-prepared-national-sources',
    browserParity: 'not-established',
    firstUncomparedStage: 'stop-discovery-and-timetable-adapter-population'
  },
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
