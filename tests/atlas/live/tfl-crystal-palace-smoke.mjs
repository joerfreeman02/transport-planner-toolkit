import assert from 'node:assert/strict';
import { createJsonCache, createMemoryStorage } from '../../../src/atlas/infrastructure/cache.mjs';
import { createNominatimGeocodingAdapter } from '../../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createTflBusStopAdapter } from '../../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createPreparedBusDataAdapter } from '../../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createOsrmAccessRoutingAdapter } from '../../../src/atlas/adapters/osrm-access-routing-adapter.mjs';
import { createBusStopDiscovery } from '../../../src/atlas/application/bus-stop-discovery.mjs';
import { createBusAssessment } from '../../../src/atlas/application/bus-assessment.mjs';
import { startReviewServer } from '../../../tools/atlas-review/review-server.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atlas-crystal-palace-live-'));
const review = await startReviewServer({
  rootDir,
  preferredPort: 0,
  maximumPort: 0,
  stateFile: path.join(temporary, 'review-state.json'),
  openBrowser: false
});

const identifiedFetch = (url, options = {}) => fetch(url, {
  ...options,
  headers: {
    ...(options.headers || {}),
    'User-Agent': 'ATLAS/2.0.0-alpha.4 Crystal Palace live verification'
  }
});

const cache = createJsonCache({ storage: createMemoryStorage(), namespace: 'atlas-live-crystal-palace' });
const geocoder = createNominatimGeocodingAdapter({ fetchImpl: identifiedFetch, cache });
const tfl = createTflBusStopAdapter({ fetchImpl: identifiedFetch, cache });
const prepared = createPreparedBusDataAdapter({
  fetchImpl: identifiedFetch,
  baseUrl: new URL('data/bus/', review.url)
});
const discovery = createBusStopDiscovery({ tflAdapter: tfl, naptanAdapter: prepared });
const assessment = createBusAssessment({
  stopDiscovery: discovery,
  timetableData: prepared,
  accessRouting: createOsrmAccessRoutingAdapter({ fetchImpl: identifiedFetch })
});

const address = '33 Westow Street, Crystal Palace, London';
const startedAt = new Date().toISOString();

try {
  const geocoding = await geocoder.searchAddress(address, { forceRefresh: true });
  assert.equal(geocoding.ok, true, geocoding.message);
  assert.ok(geocoding.data.length, 'Live geocoding returned no candidates.');

  const exactProperty = geocoding.data.find(candidate => /^33, Westow Street/i.test(candidate.displayAddress));
  assert.ok(exactProperty, 'Live geocoding did not return the approved property candidate; no site was assumed.');

  const site = geocoder.confirm(exactProperty);
  const result = await assessment.assess(site, { radius: 700, forceRefresh: true });

  assert.equal(result.ok, true, result.message);
  assert.equal(
    result.provenance.stops.providerAdapter,
    'tfl-bus-stop-v1',
    'Crystal Palace did not use the TfL stop adapter.'
  );
  assert.ok(result.stops.length > 0, 'TfL returned no nearby authoritative bus stops.');
  assert.ok(result.serviceSummaries.length > 0, 'Prepared BODS data returned no service summaries for the TfL stops.');
  assert.ok(result.stops.some(stop => stop.walking.status === 'routed'), 'No routed walking result was returned.');
  assert.ok(result.stops.some(stop => stop.cycling.status === 'routed'), 'No routed cycling result was returned.');
  assert.equal(result.provenance.timetables.apiKeyEmbedded, false);
  assert.equal(result.provenance.timetables.anonymousRequest, true);

  console.log(JSON.stringify({
    startedAt,
    completedAt: new Date().toISOString(),
    address,
    site: {
      displayAddress: site.displayAddress,
      latitude: site.latitude,
      longitude: site.longitude
    },
    provider: result.provenance.stops.providerAdapter,
    stopCount: result.stops.length,
    serviceSummaryCount: result.serviceSummaries.length,
    firstStops: result.stops.slice(0, 5).map(stop => ({
      id: stop.id,
      name: stop.name,
      indicator: stop.indicator,
      direction: stop.direction,
      walking: stop.walking,
      cycling: stop.cycling,
      routes: stop.routes
    })),
    firstRoutes: result.serviceSummaries.slice(0, 12).map(service => service.routeNumber),
    status: result.status,
    credentialsRequired: false,
    warnings: result.warnings
  }, null, 2));
} finally {
  await review.close();
  await review.closed;
  await rm(temporary, { recursive: true, force: true });
}
