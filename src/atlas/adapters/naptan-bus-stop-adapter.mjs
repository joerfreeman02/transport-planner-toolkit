import { createEvidence } from '../domain/evidence.mjs';
import { isConfirmedSite } from '../domain/site.mjs';
import { requestText } from '../infrastructure/http-client.mjs';
import { distanceMetres } from './tfl-bus-stop-adapter.mjs';
import { runCachedSourceQuery, sourceFailure, sourceSuccess } from './source-adapter.mjs';

const SOURCE_NAME = 'Department for Transport NaPTAN';
const ATTRIBUTION = 'NaPTAN data provided by the Department for Transport under the Open Government Licence';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < String(text ?? '').length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += character;
  }
  if (quoted) throw new Error('CSV ended inside a quoted field.');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(values => values.some(value => value !== ''));
}

export function parseNaptanStops(csv, site, radius) {
  const rows = parseCsv(csv);
  if (rows.length < 1) throw new Error('NaPTAN CSV did not contain a header row.');
  const headers = rows[0].map(value => value.replace(/^\uFEFF/, '').trim());
  const required = ['ATCOCode', 'CommonName', 'Indicator', 'Bearing', 'Longitude', 'Latitude', 'StopType'];
  for (const field of required) if (!headers.includes(field)) throw new Error(`NaPTAN CSV is missing required field ${field}.`);
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  const records = [];
  let invalidCount = 0;
  for (const values of rows.slice(1)) {
    const get = field => String(values[index[field]] ?? '').trim();
    const latitude = Number(get('Latitude'));
    const longitude = Number(get('Longitude'));
    const stopType = get('StopType');
    const id = get('ATCOCode');
    const name = get('CommonName');
    if (!stopType.startsWith('BC')) continue;
    if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) { invalidCount += 1; continue; }
    const distance = distanceMetres(site, { latitude, longitude });
    if (distance > radius) continue;
    records.push({
      id,
      naptanCode: get('NaptanCode') || null,
      name,
      indicator: get('Indicator') || null,
      direction: get('Bearing') || null,
      latitude,
      longitude,
      stopType,
      sourceId: id,
      routes: [],
      distanceMetres: distance
    });
  }
  return { records, invalidCount };
}

export function createNaptanBusStopAdapter({
  fetchImpl = globalThis.fetch,
  cache,
  clock = () => new Date(),
  timeoutMs = 30000,
  baseUrl = 'https://naptan.api.dft.gov.uk',
  resolveAtcoAreaCodes = null
} = {}) {
  async function nearbyStops(site, { radius = 700, forceRefresh = false } = {}) {
    const provenance = { source: SOURCE_NAME, authoritativeFor: 'NaPTAN public-transport access-node records', endpoint: `${baseUrl}/v1/access-nodes`, retrievedAt: null };
    if (!isConfirmedSite(site)) return sourceFailure({ code: 'invalid_request', message: 'Confirm a valid Site before requesting nearby stops.', provenance });
    const numericRadius = Number(radius);
    if (!Number.isFinite(numericRadius) || numericRadius < 100 || numericRadius > 2000) return sourceFailure({ code: 'invalid_request', message: 'Search radius must be between 100 and 2,000 metres.', provenance });
    if (typeof resolveAtcoAreaCodes !== 'function') {
      return sourceFailure({
        code: 'coverage_not_implemented',
        message: 'NaPTAN is the authoritative stop source outside Greater London, but its official API provides bulk or ATCO-area downloads rather than a nearby-coordinate endpoint. A trusted geographic data gateway is required for this confirmed point.',
        provenance,
        warnings: ['No zero-stop conclusion has been made. National NaPTAN geographic retrieval is not connected in this browser.']
      });
    }

    const resolved = await resolveAtcoAreaCodes(site);
    const areaCodes = [...new Set((resolved?.atcoAreaCodes ?? []).map(value => String(value).trim()).filter(Boolean))];
    if (!areaCodes.length) return sourceFailure({ code: 'coverage_not_implemented', message: 'The confirmed point could not yet be matched to a NaPTAN ATCO area. No zero-stop conclusion has been made.', provenance });
    const url = new URL('/v1/access-nodes', baseUrl);
    url.searchParams.set('atcoAreaCodes', areaCodes.join(','));
    url.searchParams.set('dataFormat', 'csv');
    const endpoint = url.toString();
    const cacheKey = `naptan-stops:${areaCodes.join('-')}:${site.latitude.toFixed(6)}:${site.longitude.toFixed(6)}:${Math.round(numericRadius)}`;

    return runCachedSourceQuery({ cache, cacheKey, freshForMs: 24 * 60 * 60 * 1000, forceRefresh, load: async () => {
      const response = await requestText({ url: endpoint, fetchImpl, timeoutMs });
      if (!response.ok) return sourceFailure({ code: response.code, message: response.message, status: response.status, provenance: { ...provenance, endpoint } });
      let parsed;
      try { parsed = parseNaptanStops(response.data, site, numericRadius); }
      catch (error) { return sourceFailure({ code: 'invalid_response', message: error.message, provenance: { ...provenance, endpoint } }); }

      const retrievedAt = clock().toISOString();
      const warnings = [];
      const records = new Map();
      let duplicateCount = 0;
      for (const stop of parsed.records) {
        if (records.has(stop.id)) { duplicateCount += 1; continue; }
        records.set(stop.id, stop);
      }
      if (parsed.invalidCount) warnings.push(`${parsed.invalidCount} incomplete NaPTAN stop record(s) were excluded.`);
      if (duplicateCount) warnings.push(`${duplicateCount} duplicate NaPTAN stop record(s) were de-duplicated by ATCO identifier.`);
      if (!records.size) warnings.push('NaPTAN returned no bus stops within the confirmed radius for the resolved ATCO area.');
      const stops = [...records.values()].sort((a, b) => a.distanceMetres - b.distanceMetres || a.id.localeCompare(b.id));
      const validUntil = new Date(clock().getTime() + 24 * 60 * 60 * 1000).toISOString();
      const evidence = stops.map(stop => createEvidence({
        subject: { entityType: 'bus-stop', id: stop.id, name: stop.name },
        evidenceType: 'bus.stop.nearby',
        value: stop,
        units: 'metres',
        source: { name: SOURCE_NAME, authoritative: true, recordIdentifier: stop.id, endpoint, attribution: ATTRIBUTION },
        retrievedAt,
        calculationMethodology: 'Straight-line distance calculated using the WGS84 haversine formula from the confirmed Site coordinate to the NaPTAN stop coordinate; rounded to the nearest metre.',
        validationStatus: 'validated',
        confidenceStatus: 'authoritative',
        warnings: [],
        freshness: { status: 'live-current', assessedAt: retrievedAt, validUntil },
        cache: { status: 'miss', key: cacheKey }
      }));
      return sourceSuccess({
        data: stops,
        evidence,
        warnings,
        provenance: { ...provenance, endpoint, retrievedAt, httpStatus: response.status, resultCount: stops.length, atcoAreaCodes: areaCodes, areaResolution: resolved?.rationale ?? null, anonymousRequest: true, apiKeyEmbedded: false }
      });
    }});
  }

  return Object.freeze({ id: 'naptan-bus-stop-v1', nearbyStops });
}
