import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries, buildPlannerSummaryAudit } from '../../src/atlas/domain/bus-planner-summary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tests/atlas/fixtures/alpha15-waltham-cross-production.json'), 'utf8'));
const selectedStops = fixture.stops.map(stop => ({
  id: stop.id,
  name: stop.name,
  indicator: stop.indicator ?? null,
  locality: stop.locality ?? stop.localityQualifier ?? stop.parentLocality ?? null,
  routes: stop.routes ?? []
}));
const routeScope = new Set(['13', '13A', '13B', '13C', '15', '15A', '16', '16C', '25C', '66', '217', '242', '310', '491', 'A1', 'N279']);

async function localPreparedFetch(url) {
  const parsed = new URL(url);
  const tnds = parsed.pathname.includes('/bus-tnds/');
  const marker = tnds ? '/bus-tnds/' : '/bus/';
  const relative = parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length);
  const root = path.join(repoRoot, tnds ? 'atlas/data/bus-tnds' : 'atlas/data/bus');
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(path.resolve(root) + path.sep)) return new Response('Not found', { status: 404 });
  try {
    return new Response(fs.readFileSync(filePath), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

const prepared = createPreparedBusDataAdapter({
  fetchImpl: localPreparedFetch,
  baseUrl: 'https://atlas.local/atlas/data/bus/',
  tndsBaseUrl: 'https://atlas.local/atlas/data/bus-tnds/',
  clock: () => new Date('2026-09-15T00:00:00Z')
});
const preparedResult = await prepared.servicesForStops(fixture.stops);
if (!preparedResult.ok) throw new Error(preparedResult.message || 'Current prepared bus data could not be loaded.');
const serviceRecords = (preparedResult.data ?? []).filter(service => routeScope.has(String(service.routeNumber)));
const summaries = buildServiceSummaries(fixture.stops, serviceRecords);
const rows = buildPlannerBusServiceSummaries(summaries, fixture.stops);
const audit = buildPlannerSummaryAudit(rows);

const livePairs = [...new Map(serviceRecords.flatMap(service => {
  const stopIds = Object.entries(service.stopSchedules ?? {}).filter(([, schedules]) => Object.values(schedules ?? {}).some(values => Array.isArray(values) && values.length)).map(([stopId]) => stopId);
  return stopIds.map(stopPointId => [`${service.routeNumber}|${stopPointId}`, { lineId: service.routeNumber, stopPointId }]);
})).values()].sort((left, right) => `${left.lineId}|${left.stopPointId}`.localeCompare(`${right.lineId}|${right.stopPointId}`, 'en-GB', { numeric: true })).slice(0, 22);
const tfl = createTflBusTimetableAdapter();
const liveResults = [];
for (const request of livePairs) {
  const result = await tfl.servicesForStop(request);
  liveResults.push({ request, ok: result.ok, serviceCount: result.data?.length ?? 0, timetableConclusion: result.provenance?.timetableConclusion ?? null, provenance: result.provenance ?? null });
}

const readJson = relative => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
const bodsManifest = readJson('atlas/data/bus/manifest.json');
const tndsManifest = readJson('atlas/data/bus-tnds/manifest.json');
const output = {
  schema: 'atlas-alpha16-live-current-evidence-v1',
  generatedAt: new Date().toISOString(),
  purpose: 'Sanitized current Alpha.16 Waltham Cross runtime evidence. Selected public StopPoint identities are retained; assessment coordinates and private site metadata are intentionally excluded.',
  routeScope: [...routeScope],
  provenance: {
    preparedBods: { generatedAt: bodsManifest.generatedAt, snapshotDate: bodsManifest.snapshotDate, sourceSha256: bodsManifest.sources?.bods?.sha256 ?? null },
    preparedTnds: { generatedAt: tndsManifest.generatedAt, regions: tndsManifest.regions ?? [], schema: tndsManifest.schema },
    preparedResult: { serviceCount: preparedResult.data.length, warnings: preparedResult.warnings ?? [], provenance: preparedResult.provenance ?? {} },
    liveTfL: { requestCount: liveResults.length, successfulRequests: liveResults.filter(item => item.ok).length, failedRequests: liveResults.filter(item => !item.ok).length, unresolvedRequests: liveResults.filter(item => item.timetableConclusion === 'UNRESOLVED').length }
  },
  selectedStops,
  serviceRecords,
  plannerRows: rows.map(row => ({ routeNumber: row.routeNumber, rawRouteNumbers: row.rawRouteNumbers, operator: row.operator, origin: row.origin, destination: row.destination, directionPatternText: row.directionPatternText, circular: row.circular, serviceNote: row.serviceNote, routeGroupNote: row.routeGroupNote, frequencyBasisStopId: row.frequencyBasisStopId, sourceRecordIds: row.sourceRecordIds })),
  audit,
  liveTfL: liveResults
};
const outputPath = path.join(repoRoot, 'docs/atlas/alpha16-waltham-cross-live-current.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Wrote ${path.relative(repoRoot, outputPath)}: ${serviceRecords.length} prepared route records, ${rows.length} planner rows, ${liveResults.length} live TfL requests.`);
