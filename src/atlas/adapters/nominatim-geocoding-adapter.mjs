import { createSite, confirmSite } from '../domain/site.mjs';
import { requestJson } from '../infrastructure/http-client.mjs';
import { runCachedSourceQuery, sourceFailure, sourceSuccess } from './source-adapter.mjs';

const SOURCE_NAME = 'OpenStreetMap Nominatim';
const ATTRIBUTION = '© OpenStreetMap contributors, ODbL 1.0';
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const LEADING_DESCRIPTOR = /^(?:(?:(?:lower|upper)\s+ground|ground|basement|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+floor|(?:unit|suite|flat|room|office)\s+(?:no\.?\s*)?[a-z0-9][a-z0-9/-]*)(?:\s*,\s*|\s+)/i;

function normaliseSpacing(query) {
  return query.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
}

function punctuationVariant(query) {
  return /^\d+\s+[^,]/.test(query) ? query.replace(/^(\d+)\s+/, '$1, ') : query;
}

function withoutLeadingDescriptors(query) {
  let reduced = query;
  let previous;
  do {
    previous = reduced;
    reduced = reduced.replace(LEADING_DESCRIPTOR, '').trim();
  } while (reduced && reduced !== previous);
  return reduced;
}

function numberedLocalityVariant(query) {
  const parts = query.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 3 || !/^\d+[a-z]?$/i.test(parts[0])) return null;
  return `${parts[0]}, ${parts[1]}, ${parts.length >= 4 ? parts.at(-1) : 'UK'}`;
}

function localityOnlyVariant(query) {
  const parts = query.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2 || /^\d+[a-z]?$/i.test(parts[0])) return null;
  return parts.at(-1);
}

export function buildNominatimQueryVariants(value) {
  const supplied = String(value ?? '').trim();
  if (!supplied) return [];
  const variants = [];
  const add = (query, strategy, relaxed = false) => {
    const clean = normaliseSpacing(query ?? '');
    if (!clean || variants.some(item => item.query.toLowerCase() === clean.toLowerCase())) return;
    variants.push(Object.freeze({ query: clean, strategy, relaxed }));
  };

  add(supplied, 'original');
  if (POSTCODE.test(supplied)) return Object.freeze(variants);

  const spaced = normaliseSpacing(supplied);
  add(spaced, 'spacing_normalised');
  const punctuated = punctuationVariant(spaced);
  add(punctuated, 'street_punctuation');

  const withoutDescriptors = withoutLeadingDescriptors(spaced);
  if (withoutDescriptors !== spaced) add(withoutDescriptors, 'building_without_floor_or_unit', true);

  const numberedReduced = numberedLocalityVariant(punctuated);
  if (numberedReduced) add(numberedReduced, 'numbered_address_without_neighbourhood', true);

  const localityOnly = localityOnlyVariant(withoutDescriptors);
  if (withoutDescriptors !== spaced && localityOnly) add(localityOnly, 'locality_for_map', true);
  return Object.freeze(variants);
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
    if (!supplied) return sourceFailure({ code: 'invalid_request', message: 'Enter a site address or name before searching.', provenance });
    const cacheKey = `geocode:${supplied.toLowerCase()}`;

    return runCachedSourceQuery({ cache, cacheKey, freshForMs: 15 * 60 * 1000, forceRefresh, load: async () => {
      const variants = buildNominatimQueryVariants(supplied);
      const requestWarnings = [];
      let payload = [];
      let endpoint = baseUrl;
      let selectedVariant = variants[0];
      let httpStatus = null;

      for (let index = 0; index < variants.length; index += 1) {
        if (index) await sleep(1100);
        selectedVariant = variants[index];
        const url = new URL(baseUrl);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('countrycodes', 'gb');
        url.searchParams.set('limit', '5');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('q', selectedVariant.query);
        endpoint = url.toString();
        const response = await requestJson({ url: endpoint, fetchImpl, timeoutMs, headers: { 'Accept-Language': 'en-GB,en;q=0.8' } });
        if (!response.ok) return sourceFailure({ code: response.code, message: response.message, status: response.status, provenance: { ...provenance, endpoint } });
        if (!Array.isArray(response.data)) return sourceFailure({ code: 'invalid_response', message: 'Geocoding source did not return an array of candidates.', provenance: { ...provenance, endpoint } });
        httpStatus = response.status;
        payload = response.data;
        if (payload.length) {
          if (selectedVariant.strategy !== 'original') requestWarnings.push('A broader address search was needed. Check the possible match and map before confirming.');
          if (selectedVariant.strategy === 'locality_for_map') requestWarnings.push('Only a general location was found. Move the assessment point to the correct access before confirming.');
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
        geocodingQuery: selectedVariant.query,
        geocodingStrategy: selectedVariant.strategy,
        geocodingLicence: record.licence || ATTRIBUTION,
        retrievedAt,
        validationState: 'candidate',
        warnings: requestWarnings
      })).filter(candidate => candidate.validation.state !== 'invalid');

      if (payload.length && !candidates.length) return sourceFailure({ code: 'invalid_response', message: 'Geocoding candidates did not contain valid coordinates and provenance.', provenance: { ...provenance, endpoint, retrievedAt } });
      const warnings = [...requestWarnings];
      if (!candidates.length) warnings.push('No matching UK address candidate was returned. No location has been assumed.');
      if (candidates.length > 1) warnings.push('Multiple candidates were returned. Select and confirm the correct location.');
      return sourceSuccess({
        data: candidates,
        warnings,
        evidence: [],
        provenance: {
          ...provenance,
          endpoint,
          retrievedAt,
          suppliedQuery: supplied,
          query: selectedVariant.query,
          queryStrategy: selectedVariant.strategy,
          relaxed: selectedVariant.relaxed,
          httpStatus,
          candidateCount: candidates.length
        }
      });
    }});
  }

  return Object.freeze({ id: 'nominatim-geocoding-v2', searchAddress, confirm: confirmSite });
}
