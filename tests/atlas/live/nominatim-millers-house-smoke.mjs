import assert from 'node:assert/strict';
import { createNominatimGeocodingAdapter } from '../../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../../src/atlas/infrastructure/cache.mjs';

const query = 'first floor millers house stanstead abbotts';
const sourceResponses = [];
const identifiedFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), 'User-Agent': 'ATLAS/2.0.0-alpha.6 SITE-1 live verification' }
  });
  sourceResponses.push({ query: new URL(url).searchParams.get('q'), status: response.status });
  return response;
};
const adapter = createNominatimGeocodingAdapter({
  fetchImpl: identifiedFetch,
  cache: createJsonCache({ storage: createMemoryStorage() })
});
const result = await adapter.searchAddress(query, { forceRefresh: true });
assert.equal(result.ok, true, result.message);
assert.ok(sourceResponses.length >= 1, 'No live Nominatim request was made.');

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  suppliedQuery: query,
  sourceResponses,
  candidateCount: result.data.length,
  candidates: result.data.map(candidate => ({
    displayAddress: candidate.displayAddress,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    sourceIdentifier: candidate.geocoding.sourceIdentifier,
    queryUsed: candidate.geocoding.query,
    strategy: candidate.geocoding.strategy
  })),
  warnings: result.warnings,
  mapFallbackRequired: result.data.length === 0
}, null, 2));
