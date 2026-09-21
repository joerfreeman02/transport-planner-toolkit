import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const EXPECTED_PUBLICATION_VERSION = '35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a';
const PRODUCTION_CONFIG_URL = 'https://joerfreeman02.github.io/transport-planner-toolkit/atlas/config/atlas-data-sources.json';
const CONTROLS = [
  {
    id: 'normanshire-99-700m',
    label: '99 Normanshire Drive, Chingford Mount / Highams Park',
    suppliedAddress: '99, Normanshire Drive, Chingford Mount, Highams Park, London Borough of Waltham Forest, Greater London, E4 9HB',
    displayAddress: '99, Normanshire Drive, Chingford Mount, Highams Park, London Borough of Waltham Forest, Greater London, England, E4 9HB, United Kingdom',
    latitude: 51.6165957,
    longitude: -0.0117893,
    locationMethod: 'geocoded_candidate',
    radius: 700
  },
  { id: 'waltham-cross-700m', label: 'Waltham Cross 700 m', suppliedAddress: 'Waltham Cross production-fidelity control', displayAddress: 'Waltham Cross production-fidelity control', latitude: 51.6857829, longitude: -0.0330001, locationMethod: 'coordinates_entered', radius: 700 },
  { id: 'pipers-lane-700m', label: 'Pipers Lane 700 m', suppliedAddress: 'Pipers Lane production-fidelity control', displayAddress: 'Pipers Lane production-fidelity control', latitude: 51.852700, longitude: -0.454343, locationMethod: 'coordinates_entered', radius: 700 }
];

function argumentValue(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] || fallback) : fallback;
}
function text(value) { return String(value ?? '').trim(); }
function importFrom(root, relative) { return import(pathToFileURL(path.join(root, relative)).href); }
function gitSha(root) { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
function uniqueSorted(values) { return [...new Set(values.map(value => text(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true })); }
function stopSummary(stop) { return { id: text(stop?.id), name: text(stop?.name), indicator: text(stop?.indicator), distanceMetres: Number(stop?.distanceMetres), routes: uniqueSorted(stop?.routes ?? []) }; }
function rowSummary(row) { return { routeNumber: text(row?.routeNumber), direction: text(row?.directionPatternText), origin: text(row?.origin), destination: text(row?.destination), servedAtStopId: text(row?.servedAtStopId), stopIds: uniqueSorted(row?.stopIds ?? []) }; }
function authoritySummary(stop) {
  return {
    id: text(stop?.id),
    sourceAuthorities: uniqueSorted(stop?.sourceAuthorities ?? stop?.timetableAuthorities ?? [stop?.timetableAuthority]),
    timetableAuthorities: uniqueSorted(stop?.timetableAuthorities ?? [stop?.timetableAuthority]),
    routeAuthorities: Object.fromEntries(Object.entries(stop?.routeAuthorities ?? {}).sort(([left], [right]) => left.localeCompare(right, 'en-GB', { numeric: true })).map(([route, authorities]) => [route, uniqueSorted(Array.isArray(authorities) ? authorities : [authorities])]))
  };
}
function splitRequestIdentity(identity) {
  const value = text(identity);
  const separator = value.indexOf('|');
  return separator < 1 ? { lineId: value, stopPointId: '' } : { lineId: value.slice(0, separator), stopPointId: value.slice(separator + 1) };
}
function hasTfLScheduledMatch(result, lineId, stopPointId) {
  return Boolean(result?.ok && (result.data ?? []).some(service =>
    text(service?.routeNumber).toLowerCase() === text(lineId).toLowerCase()
    && Object.entries(service?.stopSchedules ?? {}).some(([id, schedule]) => text(id) === text(stopPointId) && hasScheduledEvidence(schedule))
  ));
}
async function classifyTfLRequests(tflTimetable, identities) {
  const classifications = [];
  for (const identity of uniqueSorted(identities ?? [])) {
    const { lineId, stopPointId } = splitRequestIdentity(identity);
    const result = await tflTimetable.servicesForStop({ lineId, stopPointId, forceRefresh: false });
    const conclusion = text(result?.timetableConclusion || result?.provenance?.timetableConclusion).toUpperCase() || null;
    const matched = hasTfLScheduledMatch(result, lineId, stopPointId);
    const category = !result?.ok ? 'failed' : matched ? 'matched' : conclusion === 'NO_CURRENT_MATCH' ? 'no-current-match' : 'unresolved';
    classifications.push({ identity, lineId, stopPointId, category, matched, conclusion, code: result?.code ?? null });
  }
  return classifications;
}

const codeRoot = path.resolve(argumentValue('--code-root', ROOT_DIR));
const only = text(argumentValue('--only'));
const selected = only ? CONTROLS.filter(control => control.id === only) : CONTROLS;
if (!selected.length) throw new Error(`Unknown control: ${only}`);
const executedCodeSha = gitSha(codeRoot);

const [
  { createAtlasDataSourceResolver },
  { createPreparedBusDataAdapter },
  { createTflBusStopAdapter },
  { createTflBusTimetableAdapter },
  { createAuthoritativeBusTimetableAdapter },
  { createTflRequestScheduler },
  { createJsonCache, createMemoryStorage },
  { createOsrmAccessRoutingAdapter },
  { createBusStopDiscovery },
  { createBusAssessment },
  { createSite, confirmSite },
  { isGreaterLondonPoint },
  { hasScheduledEvidence }
] = await Promise.all([
  importFrom(codeRoot, 'src/atlas/infrastructure/atlas-data-sources.mjs'),
  importFrom(codeRoot, 'src/atlas/adapters/prepared-bus-data-adapter.mjs'),
  importFrom(codeRoot, 'src/atlas/adapters/tfl-bus-stop-adapter.mjs'),
  importFrom(codeRoot, 'src/atlas/adapters/tfl-bus-timetable-adapter.mjs'),
  importFrom(codeRoot, 'src/atlas/adapters/authoritative-bus-timetable-adapter.mjs'),
  importFrom(codeRoot, 'src/atlas/adapters/tfl-request-scheduler.mjs'),
  importFrom(codeRoot, 'src/atlas/infrastructure/cache.mjs'),
  importFrom(codeRoot, 'src/atlas/adapters/osrm-access-routing-adapter.mjs'),
  importFrom(codeRoot, 'src/atlas/application/bus-stop-discovery.mjs'),
  importFrom(codeRoot, 'src/atlas/application/bus-assessment.mjs'),
  importFrom(codeRoot, 'src/atlas/domain/site.mjs'),
  importFrom(codeRoot, 'src/atlas/domain/geography.mjs'),
  importFrom(codeRoot, 'src/atlas/domain/scheduled-evidence.mjs')
]);

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ATLAS BUS-T02A radius control' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

const productionConfig = await fetchJson(PRODUCTION_CONFIG_URL);
if (productionConfig.publicationVersion !== EXPECTED_PUBLICATION_VERSION) throw new Error(`Unexpected publication ${productionConfig.publicationVersion}`);
const resolver = createAtlasDataSourceResolver(productionConfig);
const cache = createJsonCache({ storage: createMemoryStorage(), namespace: `atlas-bus-t02a-${executedCodeSha.slice(0, 12)}` });
const prepared = createPreparedBusDataAdapter({ fetchImpl: fetch, baseUrl: resolver.baseUrl('bus'), tndsBaseUrl: resolver.baseUrl('tnds'), busFileUrl: relative => resolver.fileUrl('bus', relative), tndsFileUrl: relative => resolver.fileUrl('tnds', relative) });
const tflStops = createTflBusStopAdapter({ fetchImpl: fetch, cache });
const tflTimetable = createTflBusTimetableAdapter({ fetchImpl: fetch, cache, requestScheduler: createTflRequestScheduler() });
const authoritative = createAuthoritativeBusTimetableAdapter({ tflAdapter: tflTimetable, nationalAdapter: prepared, londonSupplementAdapter: prepared });
const discovery = createBusStopDiscovery({ tflAdapter: tflStops, naptanAdapter: prepared, crossBoundaryTfL: true });
const assessment = createBusAssessment({ stopDiscovery: discovery, timetableData: authoritative, accessRouting: createOsrmAccessRoutingAdapter({ fetchImpl: fetch }) });

const controls = [];
for (const control of selected) {
  const site = confirmSite(createSite({ suppliedAddress: control.suppliedAddress, displayAddress: control.displayAddress, latitude: control.latitude, longitude: control.longitude, locationMethod: control.locationMethod }), { confirmedAt: new Date().toISOString() });
  const providerResult = isGreaterLondonPoint(site)
    ? await tflStops.nearbyStops(site, { radius: control.radius, forceRefresh: true })
    : await prepared.nearbyStops(site, { radius: control.radius, forceRefresh: true });
  const result = await assessment.assess(site, { radius: control.radius, forceRefresh: true, mode: 'full' });
  const timetable = result.provenance?.timetables ?? {};
  const stopProvenance = result.provenance?.stops ?? {};
  const tflRequestClassifications = control.id === 'waltham-cross-700m'
    ? await classifyTfLRequests(tflTimetable, timetable.tflTimetableRequestIdentities ?? [])
    : null;
  const sparseStopHIdentities = ['217', '279', '317', '327', '491', 'N279'].map(route => `${route}|490003378H`);
  const tflRequestEvidence = tflRequestClassifications
    ? {
        requestIdentities: tflRequestClassifications.map(item => item.identity),
        unresolvedRequestIdentities: tflRequestClassifications.filter(item => item.category === 'unresolved').map(item => item.identity),
        failedRequestIdentities: tflRequestClassifications.filter(item => item.category === 'failed').map(item => item.identity),
        noCurrentMatchIdentities: tflRequestClassifications.filter(item => item.category === 'no-current-match').map(item => item.identity),
        unprocessedRequestIdentities: timetable.unprocessedRequestIdentities ?? [],
        classifications: tflRequestClassifications,
        sparseStopH: sparseStopHIdentities.map(identity => tflRequestClassifications.find(item => item.identity === identity) ?? { identity, category: 'not-requested', matched: false })
      }
    : null;
  const crossBoundaryEvidence = !isGreaterLondonPoint(site)
    ? {
        national: {
          returnedCount: stopProvenance.national?.providerReturnedCount ?? stopProvenance.national?.resultCount ?? null,
          retainedCount: stopProvenance.national?.resultCount ?? null,
          excludedByRadiusCount: stopProvenance.national?.excludedOutsideRadiusCount ?? 0,
          stopIds: (result.stops ?? []).filter(stop => (stop.timetableAuthorities ?? [stop.timetableAuthority]).includes('NaPTAN')).map(stop => text(stop.id))
        },
        tfl: {
          returnedCount: stopProvenance.tfl?.providerReturnedCount ?? null,
          retainedCount: stopProvenance.tfl?.retainedWithinRadiusCount ?? stopProvenance.tfl?.resultCount ?? null,
          excludedByRadiusCount: stopProvenance.tfl?.excludedOutsideRadiusCount ?? 0,
          retainedStopIds: (stopProvenance.tfl?.resultCount ? result.stops ?? [] : []).filter(stop => (stop.timetableAuthorities ?? [stop.timetableAuthority]).includes('TfL')).map(stop => text(stop.id)),
          provenance: stopProvenance.tfl ?? null
        },
        finalMergedStopPopulation: (result.stops ?? []).map(authoritySummary)
      }
    : null;
  controls.push({
    id: control.id,
    label: control.label,
    address: control.displayAddress,
    coordinates: { latitude: site.latitude, longitude: site.longitude },
    locationMethod: site.assessmentPoint.method,
    mode: 'full',
    requestedRadiusMetres: control.radius,
    actualDiscoveryRadiusMetres: result.provenance?.stops?.actualDiscoveryRadiusMetres ?? control.radius,
    executedCodeSha,
    publicationVersion: productionConfig.publicationVersion,
    providerReturnedCount: providerResult.provenance?.providerReturnedCount ?? providerResult.data?.length ?? null,
    providerStopIds: (providerResult.data ?? []).map(stop => stopSummary(stop)),
    providerProvenance: providerResult.provenance ?? null,
    retainedCoreStopCount: result.stops?.length ?? 0,
    retainedCoreStopIds: (result.stops ?? []).map(stop => stopSummary(stop)),
    sourceAuthorityByStop: (result.stops ?? []).map(authoritySummary),
    crossBoundaryEvidence,
    routePopulation: uniqueSorted((result.stops ?? []).flatMap(stop => stop.routes ?? [])),
    plannerRows: (result.plannerServiceSummaries ?? []).map(rowSummary),
    unresolvedRequestIdentities: timetable.unresolvedRequestIdentities ?? [],
    timetableRequestCount: timetable.tflTimetableRequestIdentities?.length ?? 0,
    nationalUnresolvedRequestIdentities: timetable.nationalUnresolvedRequestIdentities ?? [],
    tflRequestEvidence,
    warnings: result.warnings ?? [],
    status: result.status,
    ok: result.ok
  });
}

console.log(JSON.stringify({ schema: 'atlas-bus-t02a-radius-control-v1', capturedAt: new Date().toISOString(), executedCodeSha, publicationVersion: productionConfig.publicationVersion, controls }, null, 2));
