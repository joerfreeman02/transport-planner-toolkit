import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAtlasDataSourceResolver } from '../../src/atlas/infrastructure/atlas-data-sources.mjs';
import { createPreparedBusDataAdapter, nearbyGridCellKeys } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createTflBusStopAdapter, distanceMetres } from '../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const OUTPUT_DIR = path.join(ROOT_DIR, 'work', 'bus-closeout-1b', 'forensics');
const PUBLICATION_VERSION = '35352167115-c670698dbf709a953d15b3927ee677fb502d1b3a';
const CONFIG_URL = 'https://joerfreeman02.github.io/transport-planner-toolkit/atlas/config/atlas-data-sources.json';
const point = confirmSite(createSite({ suppliedAddress: 'Pipers Lane accepted control point', displayAddress: 'Pipers Lane accepted control point', latitude: 51.852700, longitude: -0.454343, locationMethod: 'coordinates_entered' }), { confirmedAt: new Date().toISOString() });
const worktree = execFileSync('git', ['-C', ROOT_DIR, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).trim();
if (worktree !== 'true') throw new Error('Pipers forensic control requires a Git worktree.');
const status = execFileSync('git', ['-C', ROOT_DIR, 'status', '--porcelain'], { encoding: 'utf8' });
if (status.trim()) throw new Error('Pipers forensic control requires a clean Git worktree.');
const executedCodeSha = execFileSync('git', ['-C', ROOT_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ATLAS BUS-CLOSEOUT-1B Pipers forensic control' } });
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  return response.json();
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
const discovered = [...new Map([...rawStops, ...(national.data ?? []).map(stop => sourceRecord(stop, 'Run24 BODS/NaPTAN stop metadata')), ...(tflResult.data ?? []).map(stop => sourceRecord(stop, 'live TfL StopPoint metadata'))].map(stop => [String(stop.id), stop])).values()]
  .filter(relevant)
  .sort((left, right) => left.distanceMetres - right.distanceMetres || String(left.id).localeCompare(String(right.id)));
const sourceStops = [...new Map([...national.data ?? [], ...tflResult.data ?? []].map(stop => [String(stop.id), stop])).values()];
const timetable = await prepared.servicesForStops(sourceStops, { forceRefresh: true });
const services = timetable.data ?? [];
const records = discovered.map(stop => {
  const bodsServices = services.filter(service => !/^tnds[:/]/i.test(String(service.id)) && String(service.routeNumber).trim().toUpperCase() === String(stop.routes?.find(route => ['46', 'C'].includes(String(route))) ?? '').trim().toUpperCase() && Object.prototype.hasOwnProperty.call(service.stopSchedules ?? {}, String(stop.id)));
  const tndsServices = services.filter(service => /^tnds[:/]/i.test(String(service.id)) && ['46', 'C'].includes(String(service.routeNumber).trim().toUpperCase()) && Object.prototype.hasOwnProperty.call(service.stopSchedules ?? {}, String(stop.id)));
  const inside = stop.distanceMetres <= 700;
  const routes = (stop.routes ?? []).map(String);
  let reason = inside ? 'Inside 700 m; retained as a discovered stop. Route 46/C inclusion depends on Run #24 stop metadata and scheduled evidence.' : 'Outside 700 m; excluded by the accepted assessment radius.';
  if (inside && !routes.some(route => ['46', 'C'].includes(route))) reason = 'Inside 700 m, but Run #24 stop metadata does not carry route 46 or C.';
  if (inside && routes.some(route => ['46', 'C'].includes(route)) && !bodsServices.length && !tndsServices.length) reason = 'Inside 700 m with route 46/C metadata, but no Run #24 BODS or TNDS scheduled evidence matched this StopPoint.';
  return { id: String(stop.id), name: String(stop.name ?? ''), latitude: Number(stop.latitude), longitude: Number(stop.longitude), discoveryDistanceMetres: stop.distanceMetres, inside700m: inside, source: stop.source, routes, bodsScheduledEvidence: bodsServices.map(service => service.id), tndsScheduledEvidence: tndsServices.map(service => service.id), reason };
});
const report = {
  capturedAt: new Date().toISOString(), executedCodeSha, worktreeClean: true, productionPublicationVersion: config.publicationVersion, point: { latitude: point.latitude, longitude: point.longitude, radiusMetres: 700 },
  sourceAvailability: { nationalStops: national.ok, tflStops: tflResult.ok, nationalTimetable: timetable.ok, nationalPublicationVersion: PUBLICATION_VERSION },
  knownRoute46: records.filter(record => /woodside animal farm|caddington hall/i.test(record.name) || record.routes.includes('46')),
  knownRouteC: records.filter(record => /caddington service/i.test(record.name) || record.routes.includes('C')),
  allRelevantNearbyStopRecords: records,
  conclusion: 'The route 46/C result is determined from Run #24 StopPoint metadata, accepted 700 m geometry, and matched BODS/TNDS scheduled evidence. No route was inserted into the assessment.'
};
await mkdir(OUTPUT_DIR, { recursive: true });
const filename = path.join(OUTPUT_DIR, 'BUS-CLOSEOUT-1B-pipers-route-46-C-forensics.json');
await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, output: filename }, null, 2));
