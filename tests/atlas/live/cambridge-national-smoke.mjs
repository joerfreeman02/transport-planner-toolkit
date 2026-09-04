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
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atlas-cambridge-live-'));
const review = await startReviewServer({ rootDir, preferredPort: 0, maximumPort: 0, stateFile: path.join(temporary, 'review-state.json'), openBrowser: false });
const identifiedFetch = (url, options = {}) => fetch(url, { ...options, headers: { ...(options.headers || {}), 'User-Agent': 'ATLAS/2.0.0-alpha.4 Cambridge live verification' } });
const site = confirmSite(createSite({ suppliedAddress: 'Cambridge regional-city control point', displayAddress: 'Cambridge city-centre control point', latitude: 52.2053, longitude: 0.1218, locationMethod: 'coordinates_entered' }), { confirmedAt: new Date().toISOString() });
const prepared = createPreparedBusDataAdapter({ fetchImpl: identifiedFetch, baseUrl: new URL('data/bus/', review.url) });
const discovery = createBusStopDiscovery({ tflAdapter: { id: 'unused-tfl', nearbyStops() { throw new Error('Cambridge must not use TfL.'); } }, naptanAdapter: prepared });
const assessment = createBusAssessment({ stopDiscovery: discovery, timetableData: prepared, accessRouting: createOsrmAccessRoutingAdapter({ fetchImpl: identifiedFetch }) });

try {
  assert.equal(isGreaterLondonPoint(site), false);
  const result = await assessment.assess(site, { radius: 700, forceRefresh: true });
  assert.equal(result.ok, true, result.message);
  assert.ok(result.stops.length > 0, 'Prepared NaPTAN index returned no Cambridge stops.');
  assert.ok(result.serviceSummaries.length > 0, 'Prepared BODS index returned no Cambridge services.');
  assert.ok(result.stops.some(stop => stop.walking.status === 'routed'));
  assert.ok(result.stops.some(stop => stop.cycling.status === 'routed'));
  console.log(JSON.stringify({
    control: 'Cambridge', site: { latitude: site.latitude, longitude: site.longitude }, provider: result.provenance.stops.providerAdapter,
    stopCount: result.stops.length, serviceSummaryCount: result.serviceSummaries.length,
    firstStop: result.stops[0], firstRoutes: result.serviceSummaries.slice(0, 8).map(service => service.routeNumber), status: result.status,
    credentialsRequired: false, warnings: result.warnings
  }, null, 2));
} finally {
  await review.close(); await review.closed;
  await rm(temporary, { recursive: true, force: true });
}
