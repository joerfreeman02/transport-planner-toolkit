import { createSite, confirmSite } from '../domain/site.mjs';
import { requestJson } from '../infrastructure/http-client.mjs';
import { runCachedSourceQuery, sourceFailure, sourceSuccess } from './source-adapter.mjs';

const SOURCE_NAME = 'OpenStreetMap Nominatim';
const ATTRIBUTION = '© OpenStreetMap contributors, ODbL 1.0';

function punctuationVariant(query) {
  return /^\d+\s+[^,]/.test(query) ? query.replace(/^(\d+)\s+/, '$1, ') : query;
}

function conservativeVariants(query) {
  const punctuated = punctuationVariant(query);
  const parts = punctuated.split(',').map(part => part.trim()).filter(Boolean);
  const localityReduced = parts.length >= 3 && /^\d+[a-z]?$/i.test(parts[0])
    ? `${parts[0]}, ${parts[1]}, ${parts.length >= 4 ? parts.at(-1) : 'UK'}`
    : punctuated;
  return [...new Set([query, punctuated, localityReduced])];
}

export function createNominatimGeocodingAdapter({
  fetchImpl = globalThis.fetch,
  cache,
  clock = () => new Date(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = 12000,
  baseUrl = 'https://nominatim.openstreetmap.org/search'
} = {}) {
  async function searchAddress(address, { forceRefresh = false } = {}) {
    const supplied = String(address ?? '').trim();
    const provenance = { source: SOURCE_NAME, endpoint: baseUrl, authoritativeFor: 'geocoding candidate', retrievedAt: null };
    if (!supplied) return sourceFailure({ code: 'invalid_request', message: 'Enter an address before searching.', provenance });
    const cacheKey = `geocode:${supplied.toLowerCase()}`;

    return runCachedSourceQuery({ cache, cacheKey, freshForMs: 15 * 60 * 1000, forceRefresh, load: async () => {
      const variants = conservativeVariants(supplied);
      const requestWarnings = [];
      let payload = [];
      let endpoint = baseUrl;
      let queryUsed = supplied;
      let httpStatus = null;

      for (let index = 0; index < variants.length; index += 1) {
        if (index) await sleep(1100);
        queryUsed = variants[index];
        const url = new URL(baseUrl);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('countrycodes', 'gb');
        url.searchParams.set('limit', '5');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('q', queryUsed);
        endpoint = url.toString();
        const response = await requestJson({ url: endpoint, fetchImpl, timeoutMs, headers: { 'Accept-Language': 'en-GB,en;q=0.8' } });
        if (!response.ok) return sourceFailure({ code: response.code, message: response.message, status: response.status, provenance: { ...provenance, endpoint } });
        if (!Array.isArray(response.data)) return sourceFailure({ code: 'invalid_response', message: 'Geocoding source did not return an array of candidates.', provenance: { ...provenance, endpoint } });
        httpStatus = response.status;
        payload = response.data;
        if (payload.length) {
          if (queryUsed !== supplied) requestWarnings.push('The source required a rate-limited normalised query retry; confirm the returned property carefully.');
          if (queryUsed === variants.at(-1) && variants.length > 2) requestWarnings.push('The neighbourhood qualifier was removed from the provider query after stricter searches returned no result; the full supplied address remains recorded.');
          break;
        }
      }

      const retrievedAt = clock().toISOString();
      const candidates = payload.map(record => createSite({
        suppliedAddress: supplied,
        displayAddress: record.display_name,
        latitude: record.lat,
        longitude: record.lon,
        geocodingSource: SOURCE_NAME,
        geocodingSourceIdentifier: record.osm_type && record.osm_id ? `${record.osm_type}/${record.osm_id}` : `nominatim-place/${record.place_id ?? 'unknown'}`,
        geocodingSourceEndpoint: endpoint,
        geocodingQuery: queryUsed,
        geocodingLicence: record.licence || ATTRIBUTION,
        retrievedAt,
        validationState: 'candidate',
        warnings: requestWarnings
      })).filter(candidate => candidate.validation.state !== 'invalid');

      if (payload.length && !candidates.length) return sourceFailure({ code: 'invalid_response', message: 'Geocoding candidates did not contain valid coordinates and provenance.', provenance: { ...provenance, endpoint, retrievedAt } });
      const warnings = [...requestWarnings];
      if (!candidates.length) warnings.push('No matching UK address candidate was returned. No location has been assumed.');
      if (candidates.length > 1) warnings.push('Multiple candidates were returned. Select and confirm the correct location.');
      return sourceSuccess({ data: candidates, warnings, evidence: [], provenance: { ...provenance, endpoint, retrievedAt, query: queryUsed, httpStatus, candidateCount: candidates.length } });
    }});
  }

  return Object.freeze({ id: 'nominatim-geocoding-v1', searchAddress, confirm: confirmSite });
}
