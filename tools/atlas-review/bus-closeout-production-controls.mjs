import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXPECTED_PRODUCTION_BASE_SHA = 'c670698dbf709a953d15b3927ee677fb502d1b3a';
const EXPECTED_PUBLICATION_VERSION = '35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a';
const PRODUCTION_CONFIG_URL = 'https://joerfreeman02.github.io/transport-planner-toolkit/atlas/config/atlas-data-sources.json';
const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const OUTPUT_ROOT = path.join(ROOT_DIR, 'work', 'bus-closeout-1a', 'production-controls');
const CONTROLS = [
  { id: 'normanshire-drive-400m', label: 'Normanshire Drive 400 m', latitude: 51.6162611, longitude: -0.0125148, radius: 400 },
  { id: 'normanshire-drive-700m', label: 'Normanshire Drive 700 m', latitude: 51.6162611, longitude: -0.0125148, radius: 700 },
  { id: 'pipers-lane-700m', label: 'Pipers Lane 700 m', latitude: 51.852700, longitude: -0.454343, radius: 700 },
  { id: 'waltham-cross-700m', label: 'Waltham Cross 700 m', latitude: 51.6857829, longitude: -0.0330001, radius: 700 }
];

function text(value) { return String(value ?? '').trim(); }
function argumentValue(flag, fallback = '') { const index = process.argv.indexOf(flag); return index >= 0 ? (process.argv[index + 1] || fallback) : fallback; }
function codeRootFromArgument() { return path.resolve(argumentValue('--code-root', ROOT_DIR)); }
function labelFromArgument() { return text(argumentValue('--label', 'branch')); }
function onlyFromArgument() { return text(argumentValue('--only')); }
function importFrom(root, relative) { return import(pathToFileURL(path.join(root, ...relative.split('/'))).href); }
function gitSha(root) { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ATLAS BUS-CLOSEOUT-1A production-fidelity control' } });
  if (!response.ok) throw new Error(`Production control could not load ${url}: HTTP ${response.status}`);
  return response.json();
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

const codeRoot = codeRootFromArgument();
const label = labelFromArgument();
const executedCodeSha = gitSha(codeRoot);
const only = onlyFromArgument();
const selectedControls = only ? CONTROLS.filter(control => control.id === only) : CONTROLS;
if (only && !selectedControls.length) throw new Error(`Unknown control: ${only}`);

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
  { confirmSite, createSite },
  { buildBusWordTables },
  { docxBlob },
  { isGreaterLondonPoint }
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
  importFrom(codeRoot, 'src/atlas/presentation/bus-word-export.mjs'),
  importFrom(codeRoot, 'assets/js/word-export.js'),
  importFrom(codeRoot, 'src/atlas/domain/geography.mjs')
]);
const release = JSON.parse(await readFile(path.join(codeRoot, 'atlas', 'config', 'atlas-release.json'), 'utf8'));

const productionConfig = await fetchJson(PRODUCTION_CONFIG_URL);
if (productionConfig.publicationVersion !== EXPECTED_PUBLICATION_VERSION) throw new Error(`Production publication version mismatch: ${productionConfig.publicationVersion}`);
const resolver = createAtlasDataSourceResolver(productionConfig);
const busManifest = await fetchJson(resolver.manifestUrl('bus'));
const activeRoots = productionConfig.datasets?.tnds?.activeRoots ?? [];
if (productionConfig.datasets?.tnds?.activeBank !== 'A' || activeRoots.map(root => root.id).join(',') !== 'A1,A2,A3') throw new Error('Production TNDS active bank is not the expected Bank A roots A1/A2/A3.');
const tndsManifests = await Promise.all(activeRoots.map(async root => ({
  id: root.id,
  baseUrl: root.baseUrl,
  manifest: await fetchJson(new URL(root.manifest || 'manifest.json', root.baseUrl).toString()),
  publication: await fetchJson(new URL(root.publicationManifest || 'publication-manifest.json', root.baseUrl).toString())
})));
for (const root of tndsManifests) {
  if (root.manifest.generatedAt !== productionConfig.generatedAt) throw new Error(`TNDS root ${root.id} generatedAt does not match deployed configuration.`);
  if (root.publication.publicationVersion !== EXPECTED_PUBLICATION_VERSION) throw new Error(`TNDS root ${root.id} publication version mismatch.`);
}
const busPublication = await fetchJson(resolver.publicationManifestUrl('bus'));
if (busPublication.publicationVersion !== EXPECTED_PUBLICATION_VERSION) throw new Error('Bus publication manifest version mismatch.');
if (busManifest.generatedAt !== productionConfig.generatedAt) throw new Error('Bus manifest generatedAt does not match deployed configuration.');

const cache = createJsonCache({ storage: createMemoryStorage(), namespace: `atlas-bus-closeout-1a-${label}` });
const prepared = createPreparedBusDataAdapter({
  fetchImpl: globalThis.fetch,
  baseUrl: resolver.baseUrl('bus'),
  tndsBaseUrl: resolver.baseUrl('tnds'),
  busFileUrl: relativePath => resolver.fileUrl('bus', relativePath),
  tndsFileUrl: relativePath => resolver.fileUrl('tnds', relativePath)
});
const tfl = createTflBusStopAdapter({ fetchImpl: globalThis.fetch, cache });
const tflTimetable = createTflBusTimetableAdapter({ cache, fetchImpl: globalThis.fetch, requestScheduler: createTflRequestScheduler() });
const authoritativeTimetable = createAuthoritativeBusTimetableAdapter({ tflAdapter: tflTimetable, nationalAdapter: prepared, londonSupplementAdapter: prepared });
const discovery = createBusStopDiscovery({ tflAdapter: tfl, naptanAdapter: prepared, crossBoundaryTfL: true });
const assessment = createBusAssessment({ stopDiscovery: discovery, timetableData: authoritativeTimetable, accessRouting: createOsrmAccessRoutingAdapter({ fetchImpl: globalThis.fetch }) });

await mkdir(OUTPUT_ROOT, { recursive: true });
const controls = [];
for (const control of selectedControls) {
  const site = confirmSite(createSite({ suppliedAddress: `${control.label} production-fidelity control point`, displayAddress: `${control.label} production-fidelity control point`, latitude: control.latitude, longitude: control.longitude, locationMethod: 'coordinates_entered' }), { confirmedAt: new Date().toISOString() });
  if (control.id === 'normanshire-drive-700m' && !isGreaterLondonPoint(site)) throw new Error('Normanshire production control was not classified inside Greater London.');
  const result = await assessment.assess(site, { radius: control.radius, forceRefresh: true, mode: 'full' });
  const timetable = result.provenance?.timetables ?? {};
  if (control.id === 'normanshire-drive-700m' && (!timetable.tflTimetableAttempted || !(timetable.tflTimetableRequestIdentities ?? []).length)) throw new Error('Normanshire production-fidelity control did not attempt live TfL timetable requests.');
  const tables = buildBusWordTables(result);
  const serviceRows = tables[1]?.rows ?? [];
  const bytes = new Uint8Array(await (await docxBlob(`ATLAS Bus Assessment — ${control.label} — ${label}`, tables, result.wording || '')).arrayBuffer());
  const filename = `ATLAS BUS-CLOSEOUT-1A — ${label} — ${control.id}.docx`;
  await writeFile(path.join(OUTPUT_ROOT, filename), bytes);
  controls.push({
    ...control,
    productionControl: true,
    greaterLondon: isGreaterLondonPoint(site),
    ok: result.ok,
    status: result.status,
    stopCount: result.stops?.length ?? 0,
    stopRoutePopulation: Object.fromEntries((result.stops ?? []).map(stop => [String(stop.id), [...(stop.routes ?? [])].sort((left, right) => String(left).localeCompare(String(right), 'en-GB', { numeric: true }))])),
    routePopulation: [...new Set((result.stops ?? []).flatMap(stop => stop.routes ?? []))].sort((left, right) => String(left).localeCompare(String(right), 'en-GB', { numeric: true })),
    serviceSummaryCount: result.serviceSummaries?.length ?? 0,
    plannerRowCount: result.plannerServiceSummaries?.length ?? 0,
    plannerRoutes: [...new Set((result.plannerServiceSummaries ?? []).map(row => row.routeNumber))].sort((left, right) => String(left).localeCompare(String(right), 'en-GB', { numeric: true })),
    plannerRows: (result.plannerServiceSummaries ?? []).map(row => ({ routeNumber: row.routeNumber, directionPatternText: row.directionPatternText, typicalFrequencyText: row.typicalFrequencyText, operatingPeriodLines: row.operatingPeriodLines })),
    plannerDirectionRows444: (result.plannerServiceSummaries ?? []).filter(row => row.routeNumber === '444').map(row => row.directionPatternText),
    reviewItemCount: result.reviewItems?.length ?? 0,
    reviewItemTypes: [...new Set((result.reviewItems ?? []).map(item => item.code))].sort(),
    reviewItemsRetainedInternally: Array.isArray(result.reviewItems),
    assessmentStatus: result.status,
    keyServiceFrequencies: (result.plannerServiceSummaries ?? []).filter(row => ['46', '215', '230', '231', '385', '397', '397A', '444', 'C'].includes(String(row.routeNumber))).map(row => ({ routeNumber: row.routeNumber, directionPatternText: row.directionPatternText, typicalFrequencyText: row.typicalFrequencyText })),
    tflTimetableAttempted: timetable.tflTimetableAttempted === true,
    tflTimetableRequestCount: Number(timetable.tflTimetableRequestIdentities?.length ?? 0),
    tflTimetableRequestIdentities: timetable.tflTimetableRequestIdentities ?? [],
    unresolvedRequestIdentities: timetable.unresolvedRequestIdentities ?? [],
    nationalSourceStatus: { nationalSourceAvailable: timetable.nationalSourceAvailable, nationalTimetableAttempted: timetable.nationalTimetableAttempted, nationalSupplementaryAttempted: timetable.nationalSupplementaryAttempted, nationalUnresolvedRoutes: timetable.nationalUnresolvedRoutes ?? [], nationalTimetableProviders: timetable.nationalTimetableProviders ?? [], timetableConclusion: timetable.timetableConclusion },
    word: { serviceTableRowCount: serviceRows.filter(row => Array.isArray(row)).length, summaryNoteRowCount: serviceRows.filter(row => !Array.isArray(row)).length, reviewQualificationCount: serviceRows.filter(row => !Array.isArray(row) && /^Planner review required:/.test(row.text)).length, bytes: bytes.byteLength, sha256: sha256(bytes), pageCount: null, filename }
  });
}

const register = {
  capturedAt: new Date().toISOString(),
  productionConfigUrl: PRODUCTION_CONFIG_URL,
  productionBaseSha: EXPECTED_PRODUCTION_BASE_SHA,
  executedCodeSha,
  productionPublicationVersion: productionConfig.publicationVersion,
  releaseBuild: release.default?.build ?? release.build ?? null,
  busManifest: { generatedAt: busManifest.generatedAt, version: busManifest.version, schema: busManifest.schema, snapshotDate: busManifest.snapshotDate, sourceBodsSha256: busManifest.sources?.bods?.sha256, sourceNaptanSha256: busManifest.sources?.naptan?.sha256 },
  tnds: { activeBank: productionConfig.datasets.tnds.activeBank, publicationGeneratedAt: productionConfig.generatedAt, roots: tndsManifests.map(root => ({ id: root.id, baseUrl: root.baseUrl, generatedAt: root.manifest.generatedAt, schema: root.manifest.schema, publicationVersion: root.publication.publicationVersion, publicationSha256: root.publication.payload?.sha256 ?? null, regions: root.publication.regionAllocation ?? root.manifest.regions ?? null })) },
  controls
};
await writeFile(path.join(OUTPUT_ROOT, `BUS-CLOSEOUT-1A-production-control-register-${label}.json`), `${JSON.stringify(register, null, 2)}\n`);
console.log(JSON.stringify(register, null, 2));
