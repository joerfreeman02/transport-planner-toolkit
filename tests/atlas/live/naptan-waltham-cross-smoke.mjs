import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreparedBusDataAdapter } from '../../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createOsrmAccessRoutingAdapter } from '../../../src/atlas/adapters/osrm-access-routing-adapter.mjs';
import { createBusStopDiscovery } from '../../../src/atlas/application/bus-stop-discovery.mjs';
import { createBusAssessment } from '../../../src/atlas/application/bus-assessment.mjs';
import { confirmSite, createSite } from '../../../src/atlas/domain/site.mjs';
import { isGreaterLondonPoint } from '../../../src/atlas/domain/geography.mjs';
import { startReviewServer } from '../../../tools/atlas-review/review-server.mjs';

const rootDir = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atlas-national-live-'));
const review = await startReviewServer({ rootDir, preferredPort: 0, maximumPort: 0, stateFile: path.join(temporary, 'review-state.json'), openBrowser: false });
const identifiedFetch = (url, options = {}) => fetch(url, { ...options, headers: { ...(options.headers || {}), 'User-Agent': 'ATLAS/2.0.0-alpha.4 national live verification' } });
const site = confirmSite(createSite({ suppliedAddress: 'Waltham Cross manual control point', displayAddress: 'Waltham Cross town centre control point', latitude: 51.6857829, longitude: -0.0330001, locationMethod: 'coordinates_entered' }), { confirmedAt: new Date().toISOString() });
const prepared = createPreparedBusDataAdapter({ fetchImpl: identifiedFetch, baseUrl: new URL('data/bus/', review.url) });
const discovery = createBusStopDiscovery({ tflAdapter: { id: 'unused-tfl', nearbyStops() { throw new Error('Waltham Cross must not use TfL.'); } }, naptanAdapter: prepared });
const assessment = createBusAssessment({ stopDiscovery: discovery, timetableData: prepared, accessRouting: createOsrmAccessRoutingAdapter({ fetchImpl: identifiedFetch }) });

try {
  assert.equal(isGreaterLondonPoint(site), false, 'Waltham Cross control must not route to TfL.');
  const result = await assessment.assess(site, { radius: 700, forceRefresh: true });
  assert.equal(result.ok, true, result.message);
  assert.ok(result.stops.length > 0, 'Prepared NaPTAN index returned no Waltham Cross stops.');
  assert.ok(result.serviceSummaries.length > 0, 'Prepared BODS index returned no Waltham Cross services.');
  assert.ok(result.stops.some(stop => stop.walking.status === 'routed'));
  assert.ok(result.stops.some(stop => stop.cycling.status === 'routed'));
  const nearest = await assessment.assess(site, { radius: 700, forceRefresh: false, mode: 'nearest' });
  assert.equal(nearest.ok, true, nearest.message);
  assert.equal(nearest.assessmentMode, 'nearest');
  assert.match(nearest.nearestGroup?.name || '', /bus station/i);
  assert.ok(nearest.stops.length >= 2, 'Nearest mode must retain multiple Bus Station stop/stand records.');
  const nearestStopRoutes = [...new Set(nearest.stops.flatMap(stop => stop.routes ?? []))].sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true }));
  const nearestSummaryRoutes = [...new Set(nearest.serviceSummaries.map(service => service.routeNumber))].sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true }));
  assert.deepEqual(nearestStopRoutes.filter(route => !nearestSummaryRoutes.includes(route)), [], 'Nearest Bus Station routes missing from service summary.');
  console.log(JSON.stringify({ control: 'Waltham Cross nearest group', group: nearest.nearestGroup, stopCount: nearest.stops.length, stopRoutes: nearestStopRoutes, serviceSummaryCount: nearest.serviceSummaries.length, routes: nearestSummaryRoutes }, null, 2));
  console.log(JSON.stringify({
    control: 'Waltham Cross', pointMethod: 'manual coordinates; no property was assumed', site: { latitude: site.latitude, longitude: site.longitude },
    provider: result.provenance.stops.providerAdapter, stopCount: result.stops.length, serviceSummaryCount: result.serviceSummaries.length,
    firstStop: result.stops[0], firstServices: result.serviceSummaries.slice(0, 5).map(service => ({ route: service.routeNumber, operator: service.operator, origin: service.origin, destination: service.destination, periods: service.operatingPeriodLines, note: service.serviceNote })),
    status: result.status, credentialsRequired: false, warnings: result.warnings
  }, null, 2));
} finally {
  await review.close(); await review.closed;
  await rm(temporary, { recursive: true, force: true });
}
