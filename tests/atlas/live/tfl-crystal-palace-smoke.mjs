import assert from 'node:assert/strict';
import { createJsonCache, createMemoryStorage } from '../../../src/atlas/infrastructure/cache.mjs';
import { createNominatimGeocodingAdapter } from '../../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createTflBusStopAdapter } from '../../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';

const identifiedFetch = (url, options = {}) => fetch(url, {
  ...options,
  headers: { ...(options.headers || {}), 'User-Agent': 'ATLAS/2.0.0-alpha.2 live verification' }
});
const cache = createJsonCache({ storage: createMemoryStorage(), namespace: 'atlas-live' });
const geocoder = createNominatimGeocodingAdapter({ fetchImpl: identifiedFetch, cache });
const tfl = createTflBusStopAdapter({ fetchImpl: identifiedFetch, cache });
const address = '33 Westow Street, Crystal Palace, London';
const startedAt = new Date().toISOString();
const geocoding = await geocoder.searchAddress(address, { forceRefresh: true });
assert.equal(geocoding.ok, true, geocoding.message);
assert.ok(geocoding.data.length, 'Live geocoding returned no candidates.');
const exactProperty = geocoding.data.find(candidate => /^33, Westow Street/i.test(candidate.displayAddress));
assert.ok(exactProperty, 'Live geocoding did not return the approved property candidate; no Site was assumed.');
const site = geocoder.confirm(exactProperty);
const stops = await tfl.nearbyStops(site, { radius: 700, forceRefresh: true });
assert.equal(stops.ok, true, stops.message);
assert.ok(stops.data.length, 'Live TfL request returned zero nearby bus stops.');
assert.equal(stops.evidence.length, stops.data.length);
console.log(JSON.stringify({
  startedAt,
  completedAt: new Date().toISOString(),
  address,
  site: { displayAddress: site.displayAddress, latitude: site.latitude, longitude: site.longitude, source: site.geocoding.source, sourceIdentifier: site.geocoding.sourceIdentifier, endpoint: site.geocoding.sourceEndpoint },
  tfl: { endpoint: stops.provenance.endpoint, httpStatus: stops.provenance.httpStatus, stopCount: stops.data.length, firstStops: stops.data.slice(0, 5).map(stop => ({ id: stop.id, name: stop.name, distanceMetres: stop.distanceMetres })), anonymousRequest: stops.provenance.anonymousRequest, apiKeyEmbedded: stops.provenance.apiKeyEmbedded },
  warnings: [...geocoding.warnings, ...stops.warnings]
}, null, 2));
