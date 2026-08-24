import assert from 'node:assert/strict';
import { createJsonCache, createMemoryStorage } from '../../../src/atlas/infrastructure/cache.mjs';
import { createNominatimGeocodingAdapter } from '../../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createTflBusStopAdapter } from '../../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createNaptanBusStopAdapter } from '../../../src/atlas/adapters/naptan-bus-stop-adapter.mjs';
import { createBusStopDiscovery } from '../../../src/atlas/application/bus-stop-discovery.mjs';
import { isGreaterLondonPoint } from '../../../src/atlas/domain/geography.mjs';

const identifiedFetch = (url, options = {}) => fetch(url, {
  ...options,
  headers: { ...(options.headers || {}), 'User-Agent': 'ATLAS/2.0.0-alpha.3 non-London live verification' }
});
const cache = createJsonCache({ storage: createMemoryStorage(), namespace: 'atlas-live-non-london' });
const geocoder = createNominatimGeocodingAdapter({ fetchImpl: identifiedFetch, cache });
const discovery = createBusStopDiscovery({
  tflAdapter: createTflBusStopAdapter({ fetchImpl: identifiedFetch, cache }),
  naptanAdapter: createNaptanBusStopAdapter({ fetchImpl: identifiedFetch, cache })
});
const address = '47 Berkeley Avenue, Waltham Cross, Hertfordshire';
const startedAt = new Date().toISOString();
const exactGeocoding = await geocoder.searchAddress(address, { forceRefresh: true });
assert.equal(exactGeocoding.ok, true, exactGeocoding.message);
const exactCandidate = exactGeocoding.data.find(item => /47.*Berkeley Avenue/i.test(item.displayAddress)) ?? exactGeocoding.data.find(item => /Berkeley Avenue/i.test(item.displayAddress));
const fallbackGeocoding = exactCandidate ? null : await geocoder.searchAddress('Waltham Cross, Hertfordshire', { forceRefresh: true });
if (fallbackGeocoding) assert.equal(fallbackGeocoding.ok, true, fallbackGeocoding.message);
const candidate = exactCandidate ?? fallbackGeocoding?.data.find(item => /^Waltham Cross, Broxbourne/i.test(item.displayAddress));
assert.ok(candidate, 'Live geocoding returned neither the Berkeley Avenue control nor the explicit Waltham Cross town fallback; no Site was assumed.');
const controlResolution = exactCandidate ? 'property-or-street candidate' : 'town-level fallback; the Berkeley Avenue property was not assumed';
const site = geocoder.confirm(candidate);
assert.equal(isGreaterLondonPoint(site), false, 'Waltham Cross control must not route to TfL.');
const result = await discovery.nearbyStops(site, { radius: 700, forceRefresh: true });
assert.equal(result.ok, false);
assert.equal(result.code, 'coverage_not_implemented');
assert.equal(result.provenance.providerAdapter, 'naptan-bus-stop-v1');
assert.equal(result.data, null);
console.log(JSON.stringify({
  startedAt,
  completedAt: new Date().toISOString(),
  address,
  controlResolution,
  site: { displayAddress: site.displayAddress, latitude: site.latitude, longitude: site.longitude, source: site.geocoding.source, sourceIdentifier: site.geocoding.sourceIdentifier },
  provider: 'Department for Transport NaPTAN',
  status: result.code,
  stopCount: null,
  services: 'not attempted because stop coverage is not connected',
  message: result.message,
  warnings: result.warnings
}, null, 2));
