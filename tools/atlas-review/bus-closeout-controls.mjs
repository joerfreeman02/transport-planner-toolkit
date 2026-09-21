import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docxBlob } from '../../assets/js/word-export.js';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';
import { createTflBusStopAdapter } from '../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createTflRequestScheduler } from '../../src/atlas/adapters/tfl-request-scheduler.mjs';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createOsrmAccessRoutingAdapter } from '../../src/atlas/adapters/osrm-access-routing-adapter.mjs';
import { createBusStopDiscovery } from '../../src/atlas/application/bus-stop-discovery.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { confirmSite, createSite } from '../../src/atlas/domain/site.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { startReviewServer } from './review-server.mjs';

const rootDir = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const outputDir = path.join(rootDir, 'work', 'bus-closeout-1', 'controls');
const temporaryDir = path.join(rootDir, 'work', 'bus-closeout-1', 'tmp');
await mkdir(outputDir, { recursive: true });
await mkdir(temporaryDir, { recursive: true });

const review = await startReviewServer({ rootDir, preferredPort: 0, maximumPort: 0, stateFile: path.join(temporaryDir, 'review-state.json'), openBrowser: false });
const identifiedFetch = (url, options = {}) => fetch(url, { ...options, headers: { ...(options.headers || {}), 'User-Agent': 'ATLAS BUS-CLOSEOUT-1 control capture' } });
const cache = createJsonCache({ storage: createMemoryStorage(), namespace: 'atlas-bus-closeout-1-controls' });
const prepared = createPreparedBusDataAdapter({ fetchImpl: identifiedFetch, baseUrl: new URL('data/bus/', review.url) });
const tfl = createTflBusStopAdapter({ fetchImpl: identifiedFetch, cache });
const tflTimetable = createTflBusTimetableAdapter({ cache, fetchImpl: identifiedFetch, requestScheduler: createTflRequestScheduler() });
const authoritativeTimetable = createAuthoritativeBusTimetableAdapter({ tflAdapter: tflTimetable, nationalAdapter: prepared, londonSupplementAdapter: prepared });
const discovery = createBusStopDiscovery({ tflAdapter: tfl, naptanAdapter: prepared, crossBoundaryTfL: true });
const assessment = createBusAssessment({ stopDiscovery: discovery, timetableData: authoritativeTimetable, accessRouting: createOsrmAccessRoutingAdapter({ fetchImpl: identifiedFetch }) });

const controls = [
  { id: 'normanshire-drive-400m', label: 'Normanshire Drive 400 m', latitude: 51.6162611, longitude: -0.0125148, radius: 400, mode: 'full' },
  { id: 'normanshire-drive-700m', label: 'Normanshire Drive 700 m', latitude: 51.6162611, longitude: -0.0125148, radius: 700, mode: 'full' },
  { id: 'pipers-lane-700m', label: 'Pipers Lane 700 m', latitude: 51.852700, longitude: -0.454343, radius: 700, mode: 'full' },
  { id: 'waltham-cross-700m', label: 'Waltham Cross 700 m', latitude: 51.6857829, longitude: -0.0330001, radius: 700, mode: 'full' }
];

try {
  const register = [];
  for (const control of controls) {
    const site = confirmSite(createSite({ suppliedAddress: `${control.label} control point`, displayAddress: `${control.label} control point`, latitude: control.latitude, longitude: control.longitude, locationMethod: 'coordinates_entered' }), { confirmedAt: new Date().toISOString() });
    const result = await assessment.assess(site, { radius: control.radius, forceRefresh: true, mode: control.mode });
    const tables = buildBusWordTables(result);
    const bytes = new Uint8Array(await (await docxBlob(`ATLAS Bus Assessment — ${control.label}`, tables, result.wording || '')).arrayBuffer());
    const filename = `ATLAS BUS-CLOSEOUT-1 — ${control.id}.docx`;
    await writeFile(path.join(outputDir, filename), bytes);
    register.push({
      ...control,
      ok: result.ok,
      status: result.status,
      stopCount: result.stops?.length ?? 0,
      routeCount: new Set((result.stops || []).flatMap(stop => stop.routes || [])).size,
      serviceSummaryCount: result.serviceSummaries?.length ?? 0,
      plannerRowCount: result.plannerServiceSummaries?.length ?? 0,
      stopRoutes: [...new Set((result.stops || []).flatMap(stop => stop.routes || []))].sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true })),
      plannerRoutes: [...new Set((result.plannerServiceSummaries || []).map(row => row.routeNumber))].sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true })),
      unresolvedRequestIdentities: result.provenance?.timetables?.tflUnresolvedRequestIdentities || result.provenance?.timetables?.unresolvedRequestIdentities || [],
      tflRequestIdentities: result.provenance?.timetables?.tflTimetableRequestIdentities || [],
      tflProvenance: result.provenance?.timetables || {},
      reviewItemCount: result.reviewItems?.length ?? 0,
      plannerDirectionRows444: (result.plannerServiceSummaries || []).filter(row => row.routeNumber === '444').map(row => row.directionPatternText),
      warnings: result.warnings || [],
      docx: { filename, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }
    });
  }
  await writeFile(path.join(outputDir, 'BUS-CLOSEOUT-1-control-register.json'), JSON.stringify({ capturedAt: new Date().toISOString(), baselineSha: 'c670698dbf709a953d15b3927ee677fb502d1b3a', release: 'ATLAS-2.0.0-alpha.15', controls: register }, null, 2));
  console.log(JSON.stringify(register, null, 2));
} finally {
  if (review.close) await review.close();
  await review.closed;
}
