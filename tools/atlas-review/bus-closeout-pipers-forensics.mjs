import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAtlasDataSourceResolver } from '../../src/atlas/infrastructure/atlas-data-sources.mjs';
import { createPreparedBusDataAdapter, nearbyGridCellKeys } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createTflBusStopAdapter, distanceMetres } from '../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const OUTPUT_DIR = path.join(ROOT_DIR, 'work', 'bus-closeout-1c', 'forensics');
const PUBLICATION_VERSION = '35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a';
const CONFIG_URL = 'https://joerfreeman02.github.io/transport-planner-toolkit/atlas/config/atlas-data-sources.json';
const point = confirmSite(createSite({ suppliedAddress: 'Pipers Lane current BUS-CLOSEOUT fixture point', displayAddress: 'Pipers Lane current BUS-CLOSEOUT fixture point', latitude: 51.852700, longitude: -0.454343, locationMethod: 'coordinates_entered' }), { confirmedAt: new Date().toISOString() });
const worktree = execFileSync('git', ['-C', ROOT_DIR, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).trim();
if (worktree !== 'true') throw new Error('Pipers forensic control requires a Git worktree.');
const status = execFileSync('git', ['-C', ROOT_DIR, 'status', '--porcelain'], { encoding: 'utf8' });
if (status.trim()) throw new Error('Pipers forensic control requires a clean Git worktree.');
const executedCodeSha = execFileSync('git', ['-C', ROOT_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ATLAS BUS-CLOSEOUT-1B Pipers forensic control' } });
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const body = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString('utf8') : new TextDecoder().decode(bytes);
  return JSON.parse(body);
}
function relevant(stop) {
  return (stop?.routes ?? []).some(route => ['46', 'C'].includes(String(route))) || /woodside animal farm|caddington hall|caddington service/i.test(String(stop?.name ?? ''));
}
function sourceRecord(stop, source) {
  return { ...stop, source, distanceMetres: distanceMetres(point, stop) };
}

const config = await fetchJson(CONFIG_URL);
if (config.publicationVersion !== PUBLICATION_VERSION) throw new Error(`Unexpected production publication: ${config.publicationVersion}`);
const resolver = createAtlasDataSourceResolver(config);
const prepared = createPreparedBusDataAdapter({ fetchImpl: globalThis.fetch, baseUrl: resolver.baseUrl('bus'), tndsBaseUrl: resolver.baseUrl('tnds'), busFileUrl: relative => resolver.fileUrl('bus', relative), tndsFileUrl: relative => resolver.fileUrl('tnds', relative) });
const tfl = createTflBusStopAdapter({ fetchImpl: globalThis.fetch, cache: createJsonCache({ storage: createMemoryStorage(), namespace: 'atlas-bus-closeout-1b-pipers' }) });
const manifest = await fetchJson(resolver.manifestUrl('bus'));
const keys = nearbyGridCellKeys(point, 700, manifest.gridSize);
const rawStops = [];
for (const key of keys) {
  const shard = manifest.stopShards?.[key];
  if (!shard) continue;
  const data = await fetchJson(resolver.fileUrl('bus', shard));
  for (const raw of data.stops ?? []) {
    const stop = Array.isArray(raw) ? Object.fromEntries((manifest.stopFields ?? []).map((field, index) => [field, raw[index]])) : raw;
    if (relevant(stop)) rawStops.push(sourceRecord({ ...stop, sourceId: stop.id, sourceAuthorities: ['NaPTAN'], timetableAuthority: 'NaPTAN', routeDiscoverySource: 'BODS' }, 'Run24 BODS/NaPTAN stop metadata'));
  }
}
const national = await prepared.nearbyStops(point, { radius: 700, forceRefresh: true });
const tflResult = await tfl.nearbyStops(point, { radius: 700, forceRefresh: true });
const allSourceStops = [...new Map([...rawStops, ...(national.data ?? []).map(stop => sourceRecord(stop, 'Run24 BODS/NaPTAN stop metadata')), ...(tflResult.data ?? []).map(stop => sourceRecord(stop, 'live TfL StopPoint metadata'))].map(stop => [String(stop.id), stop])).values()];
const nearby = allSourceStops.filter(stop => stop.distanceMetres <= 700);
const discovered = allSourceStops.filter(stop => stop.distanceMetres <= 2000 && relevant(stop))
  .sort((left, right) => left.distanceMetres - right.distanceMetres || String(left.id).localeCompare(String(right.id)));
const sourceStops = [...new Map([...national.data ?? [], ...tflResult.data ?? []].map(stop => [String(stop.id), stop])).values()];
const insideStops = [...new Map(nearby.map(stop => [String(stop.id), stop])).values()];
const outsideRoute46Stops = discovered.filter(stop => stop.distanceMetres > 700 && (stop.routes ?? []).map(String).includes('46'));
const evidenceStops = [...new Map([...insideStops, ...outsideRoute46Stops].map(stop => [String(stop.id), stop])).values()];
const timetable = await prepared.servicesForStops(evidenceStops, { forceRefresh: true });
const services = timetable.data ?? [];
function hasScheduledEvidenceAt(service, stopId) {
  const schedule = service?.stopSchedules?.[String(stopId)];
  return schedule && Object.values(schedule).some(day => Array.isArray(day) && day.length > 0);
}
function evidenceIds(stop, routeNumber, predicate) {
  const route = String(routeNumber).trim().toUpperCase();
  return services.filter(service => String(service.routeNumber).trim().toUpperCase() === route && predicate(service) && hasScheduledEvidenceAt(service, stop.id)).map(service => String(service.id)).sort();
}
const recordFor = stop => {
  const bodsRoute46ScheduledEvidenceIds = evidenceIds(stop, '46', service => !/^tnds[:/]/i.test(String(service.id)));
  const tndsRoute46ScheduledEvidenceIds = evidenceIds(stop, '46', service => /^tnds[:/]/i.test(String(service.id)));
  const bodsRouteCScheduledEvidenceIds = evidenceIds(stop, 'C', service => !/^tnds[:/]/i.test(String(service.id)));
  const tndsRouteCScheduledEvidenceIds = evidenceIds(stop, 'C', service => /^tnds[:/]/i.test(String(service.id)));
  const inside = stop.distanceMetres <= 700;
  const routes = (stop.routes ?? []).map(String);
  const metadataRoute46 = routes.includes('46');
  const metadataRouteC = routes.includes('C');
  const evidenceRoute46 = bodsRoute46ScheduledEvidenceIds.length > 0 || tndsRoute46ScheduledEvidenceIds.length > 0;
  const evidenceRouteC = bodsRouteCScheduledEvidenceIds.length > 0 || tndsRouteCScheduledEvidenceIds.length > 0;
  let reason = inside ? 'Inside 700 m; route 46/C evidence was independently searched in Run #24 BODS/TNDS regardless of StopPoint route metadata.' : 'Outside 700 m; excluded by the 700 m assessment radius but independently inspected for route 46 evidence.';
  if (inside && !metadataRoute46 && evidenceRoute46) reason = 'STOP: inside-radius route 46 scheduled evidence exists without route 46 StopPoint metadata; Technical Director review required.';
  if (inside && !metadataRouteC && evidenceRouteC) reason = 'STOP: inside-radius route C scheduled evidence exists without route C StopPoint metadata; Technical Director review required.';
  if (inside && !metadataRoute46 && !metadataRouteC && !evidenceRoute46 && !evidenceRouteC) reason = 'Inside 700 m, but neither route 46 nor route C metadata or independently matched scheduled evidence was established.';
  return {
    id: String(stop.id), name: String(stop.name ?? ''), latitude: Number(stop.latitude), longitude: Number(stop.longitude), discoveryDistanceMetres: stop.distanceMetres, inside700m: inside, source: stop.source, routes,
    bodsRoute46ScheduledEvidenceIds, tndsRoute46ScheduledEvidenceIds, bodsRouteCScheduledEvidenceIds, tndsRouteCScheduledEvidenceIds,
    metadataRoute46, metadataRouteC, evidenceRoute46, evidenceRouteC,
    evidenceClassification: { route46: metadataRoute46 && evidenceRoute46 ? 'metadata-and-evidence' : metadataRoute46 ? 'metadata-without-evidence' : evidenceRoute46 ? 'evidence-without-metadata' : 'neither', routeC: metadataRouteC && evidenceRouteC ? 'metadata-and-evidence' : metadataRouteC ? 'metadata-without-evidence' : evidenceRouteC ? 'evidence-without-metadata' : 'neither' },
    reason
  };
};
const records = discovered.map(recordFor);
const nearbyRecords = nearby.map(recordFor);
if (nearbyRecords.some(record => record.evidenceClassification.route46 === 'evidence-without-metadata' || record.evidenceClassification.routeC === 'evidence-without-metadata')) throw new Error('STOP: independent route evidence was found without matching inside-radius StopPoint metadata.');
const knownRoute46 = records.filter(record => /woodside animal farm|caddington hall/i.test(record.name) || record.routes.includes('46'));
const knownRouteC = records.filter(record => /caddington service/i.test(record.name) || record.routes.includes('C'));
const report = {
  capturedAt: new Date().toISOString(), executedCodeSha, worktreeClean: true, productionPublicationVersion: config.publicationVersion, point: { latitude: point.latitude, longitude: point.longitude, radiusMetres: 700 },
  fixtureStatus: 'current-fixture-not-historical-golden',
  sourceAvailability: { nationalStops: national.ok, tflStops: tflResult.ok, nationalTimetable: timetable.ok, nationalPublicationVersion: PUBLICATION_VERSION, independentlyQueriedInsideStopCount: insideStops.length, independentlyQueriedOutsideRoute46StopCount: outsideRoute46Stops.length },
  allNearbyStopRecords: nearbyRecords,
  insideRadiusStopRecords: nearbyRecords,
  nearbyStopCount: nearbyRecords.length,
  route46OrCStopCandidatesWithin2km: records,
  outsideRadiusRoute46Records: knownRoute46.filter(record => !record.inside700m),
  knownRoute46,
  knownRouteC,
  allRelevantNearbyStopRecords: nearbyRecords,
  routeCIndependentSearch: { searchedInLoadedRun24Evidence: true, candidateRecords: knownRouteC, conclusion: knownRouteC.length ? 'Route C metadata or evidence was present in the loaded Run #24 evidence; no route was inserted into the assessment.' : 'No route C StopPoint candidate or scheduled evidence was found in the loaded Run #24 evidence.' },
  conclusion: 'The current fixture result is bounded to the Run #24 publication, the 700 m geometry, and independent BODS/TNDS scheduled-evidence searches for every inside-radius StopPoint plus named outside-radius route 46 cases. No route was inserted into the assessment.'
};
await mkdir(OUTPUT_DIR, { recursive: true });
const filename = path.join(OUTPUT_DIR, 'BUS-CLOSEOUT-1C-pipers-route-46-C-forensics.json');
await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, output: filename }, null, 2));
