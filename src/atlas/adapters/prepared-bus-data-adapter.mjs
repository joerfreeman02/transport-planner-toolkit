import { createEvidence } from '../domain/evidence.mjs';
import { isConfirmedSite } from '../domain/site.mjs';
import { requestJson } from '../infrastructure/http-client.mjs';
import { distanceMetres } from './tfl-bus-stop-adapter.mjs';
import { sourceFailure, sourceSuccess } from './source-adapter.mjs';

const STOP_SOURCE = 'Department for Transport NaPTAN';
const TIMETABLE_SOURCE = 'Department for Transport Bus Open Data Service';
const STOP_ATTRIBUTION = 'NaPTAN data provided by the Department for Transport under the Open Government Licence';
const TIMETABLE_ATTRIBUTION = 'Bus timetable data provided by the Department for Transport Bus Open Data Service under the Open Government Licence';

function cellToken(value) { return value < 0 ? `m${Math.abs(value)}` : String(value); }
export function gridCellKey(latitudeIndex, longitudeIndex) { return `g${cellToken(latitudeIndex)}_${cellToken(longitudeIndex)}`; }

export function nearbyGridCellKeys(site, radiusMetres, gridSize = 0.1) {
  const latitude = Number(site?.latitude ?? site?.lat);
  const longitude = Number(site?.longitude ?? site?.lon);
  const radius = Number(radiusMetres);
  const latitudeDelta = radius / 111320;
  const longitudeDelta = radius / (111320 * Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
  const keys = [];
  for (let lat = Math.floor((latitude - latitudeDelta) / gridSize); lat <= Math.floor((latitude + latitudeDelta) / gridSize); lat += 1) {
    for (let lon = Math.floor((longitude - longitudeDelta) / gridSize); lon <= Math.floor((longitude + longitudeDelta) / gridSize); lon += 1) keys.push(gridCellKey(lat, lon));
  }
  return [...new Set(keys)];
}

function resolveUrl(baseUrl, relativePath) { return new URL(relativePath, baseUrl).toString(); }

async function requestPreparedJson({ url, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json, application/gzip' } });
    if (!response.ok) return { ok: false, code: 'http_failure', status: response.status, message: `Source returned HTTP ${response.status}.` };
    const bytes = new Uint8Array(await response.arrayBuffer());
    let body;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (typeof DecompressionStream !== 'function') return { ok: false, code: 'invalid_response', status: response.status, message: 'This browser cannot open the prepared bus-data file.' };
      body = await new Response(new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'))).text();
    } else body = new TextDecoder().decode(bytes);
    try { return { ok: true, status: response.status, data: JSON.parse(body) }; }
    catch { return { ok: false, code: 'invalid_response', status: response.status, message: 'Prepared bus data was not valid JSON.' }; }
  } catch (error) {
    return { ok: false, code: error?.name === 'AbortError' ? 'timeout' : 'unavailable_source', status: null, message: error?.name === 'AbortError' ? 'Prepared bus data timed out.' : 'Prepared bus data could not be loaded.' };
  } finally { clearTimeout(timer); }
}

export function createPreparedBusDataAdapter({
  fetchImpl = globalThis.fetch,
  baseUrl,
  clock = () => new Date(),
  timeoutMs = 20000
} = {}) {
  if (!baseUrl) throw new Error('Prepared bus-data base URL is required.');
  let manifestPromise = null;
  const documentPromises = new Map();

  async function loadJson(relativePath, forceRefresh = false) {
    if (forceRefresh) documentPromises.delete(relativePath);
    if (!documentPromises.has(relativePath)) documentPromises.set(relativePath, relativePath.endsWith('.gz')
      ? requestPreparedJson({ url: resolveUrl(baseUrl, relativePath), fetchImpl, timeoutMs })
      : requestJson({ url: resolveUrl(baseUrl, relativePath), fetchImpl, timeoutMs }));
    const response = await documentPromises.get(relativePath);
    if (!response.ok) documentPromises.delete(relativePath);
    return response;
  }

  async function manifest(forceRefresh = false) {
    if (forceRefresh) manifestPromise = null;
    if (!manifestPromise) manifestPromise = loadJson('manifest.json', forceRefresh);
    const response = await manifestPromise;
    if (!response.ok || response.data?.schema !== 'atlas-prepared-bus-data-v1') {
      manifestPromise = null;
      return sourceFailure({ code: response.code || 'invalid_response', message: 'National bus information could not be checked. Please try again.', provenance: { source: `${STOP_SOURCE} and ${TIMETABLE_SOURCE}`, endpoint: resolveUrl(baseUrl, 'manifest.json') } });
    }
    return sourceSuccess({ data: response.data, provenance: { source: `${STOP_SOURCE} and ${TIMETABLE_SOURCE}`, endpoint: resolveUrl(baseUrl, 'manifest.json') } });
  }

  function snapshotWarnings(data) {
    const warnings = [];
    const generated = Date.parse(data.generatedAt);
    if (!Number.isFinite(generated)) warnings.push('The prepared bus dataset does not contain a valid update time.');
    else {
      const ageDays = (clock().getTime() - generated) / 86400000;
      if (ageDays > Number(data.refreshAfterDays || 8)) warnings.push(`The prepared bus dataset is ${Math.floor(ageDays)} days old and should be refreshed before formal use.`);
    }
    return warnings;
  }

  async function nearbyStops(site, { radius = 700, forceRefresh = false } = {}) {
    const provenance = { source: STOP_SOURCE, authoritativeFor: 'NaPTAN public-transport access-node records', endpoint: resolveUrl(baseUrl, 'manifest.json'), retrievedAt: null };
    if (!isConfirmedSite(site)) return sourceFailure({ code: 'invalid_request', message: 'Confirm a valid site before checking nearby stops.', provenance });
    const numericRadius = Number(radius);
    if (!Number.isFinite(numericRadius) || numericRadius < 100 || numericRadius > 2000) return sourceFailure({ code: 'invalid_request', message: 'Search radius must be between 100 and 2,000 metres.', provenance });
    const manifestResult = await manifest(forceRefresh);
    if (!manifestResult.ok) return manifestResult;
    const index = manifestResult.data;
    const keys = nearbyGridCellKeys(site, numericRadius, index.gridSize);
    const paths = keys.map(key => index.stopShards?.[key]).filter(Boolean);
    const responses = await Promise.all(paths.map(path => loadJson(path, forceRefresh)));
    if (responses.some(response => !response.ok)) return sourceFailure({ code: 'unavailable_source', message: 'National bus-stop information could not be checked. Please try again.', provenance, warnings: ['The prepared NaPTAN stop files could not all be loaded.'] });
    if (responses.some(response => response.data?.schema !== 'atlas-prepared-bus-data-v1' || !Array.isArray(response.data?.stops))) return sourceFailure({ code: 'invalid_response', message: 'National bus-stop information could not be safely interpreted. Please try again.', provenance, warnings: ['A prepared NaPTAN stop file was incomplete or malformed.'] });
    const deduplicated = new Map();
    const fields = index.stopFields ?? [];
    for (const response of responses) for (const rawStop of response.data?.stops ?? []) {
      const stop = Array.isArray(rawStop) ? Object.fromEntries(fields.map((field, position) => [field, rawStop[position]])) : rawStop;
      const distance = distanceMetres(site, stop);
      if (distance <= numericRadius && !deduplicated.has(stop.id)) deduplicated.set(stop.id, { ...stop, sourceId: stop.id, distanceMetres: distance, routes: [...new Set(stop.routes ?? [])] });
    }
    const stops = [...deduplicated.values()].sort((a, b) => a.distanceMetres - b.distanceMetres || a.id.localeCompare(b.id));
    const checkedAt = clock().toISOString();
    const warnings = snapshotWarnings(index);
    if (!stops.length) warnings.push('The prepared NaPTAN dataset contains no bus stops within the confirmed radius.');
    const evidence = stops.map(stop => createEvidence({
      subject: { entityType: 'bus-stop', id: stop.id, name: stop.name },
      evidenceType: 'bus.stop.nearby',
      value: stop,
      units: 'metres',
      source: { name: STOP_SOURCE, authoritative: true, recordIdentifier: stop.id, endpoint: index.sources.naptan.url, datasetTimestamp: index.sources.naptan.downloadedAt, datasetVersion: index.sources.naptan.sha256, attribution: STOP_ATTRIBUTION },
      retrievedAt: checkedAt,
      calculationMethodology: 'Straight-line discovery distance calculated using the WGS84 haversine formula from the confirmed assessment point to the authoritative NaPTAN stop coordinate.',
      validationStatus: 'validated', confidenceStatus: 'authoritative', warnings,
      freshness: { status: warnings.length ? 'stale' : 'live-current', assessedAt: checkedAt }, cache: { status: 'not-used' }
    }));
    return sourceSuccess({ data: stops, evidence, warnings, provenance: { ...provenance, endpoint: index.sources.naptan.url, retrievedAt: checkedAt, dataPreparedAt: index.generatedAt, datasetVersion: index.sources.naptan.sha256, resultCount: stops.length, providerAdapter: 'prepared-naptan-bus-stop-v1', anonymousRequest: true, apiKeyEmbedded: false } });
  }

  async function servicesForStops(stops, { forceRefresh = false } = {}) {
    const manifestResult = await manifest(forceRefresh);
    if (!manifestResult.ok) return manifestResult;
    const index = manifestResult.data;
    const stopIds = new Set((stops ?? []).map(stop => String(stop.id || stop.sourceId || '')).filter(Boolean));
    const prefixLength = Number(index.serviceShardKeyLength || 3);
    const shardKeys = [...new Set((stops ?? []).map(stop => String(stop.id || stop.sourceId || '').slice(0, prefixLength)).filter(code => code.length === prefixLength))];
    const paths = [...new Set(shardKeys.flatMap(code => {
      const configured = index.serviceShards?.[code];
      return Array.isArray(configured) ? configured : configured ? [configured] : [];
    }))];
    const responses = await Promise.all(paths.map(path => loadJson(path, forceRefresh)));
    if (!paths.length || responses.some(response => !response.ok)) return sourceFailure({ code: 'unavailable_source', message: 'Bus timetable information could not be checked. Please try again.', provenance: { source: TIMETABLE_SOURCE, endpoint: index.sources.bods.url }, warnings: ['No prepared timetable file was available for one or more stop areas.'] });
    if (responses.some(response => response.data?.schema !== 'atlas-prepared-bus-data-v1' || !Array.isArray(response.data?.services))) return sourceFailure({ code: 'invalid_response', message: 'Bus timetable information could not be safely interpreted. Please try again.', provenance: { source: TIMETABLE_SOURCE, endpoint: index.sources.bods.url }, warnings: ['A prepared timetable file was incomplete or malformed.'] });
    const services = new Map();
    for (const response of responses) for (const service of response.data?.services ?? []) {
      if (!Object.keys(service.stopSchedules ?? {}).some(id => stopIds.has(id))) continue;
      const existing = services.get(service.id);
      if (!existing) services.set(service.id, structuredClone(service));
      else Object.assign(existing.stopSchedules, service.stopSchedules);
    }
    const checkedAt = clock().toISOString();
    const warnings = snapshotWarnings(index);
    if (!services.size) warnings.push('No current BODS timetable records matched the selected authoritative stop identifiers.');
    return sourceSuccess({
      data: [...services.values()], evidence: [], warnings,
      provenance: { source: TIMETABLE_SOURCE, endpoint: index.sources.bods.url, retrievedAt: checkedAt, dataPreparedAt: index.generatedAt, datasetVersion: index.sources.bods.sha256, regions: index.sources.bods.regions, representativeDates: index.representativeDates, anonymousRequest: true, apiKeyEmbedded: false, attribution: TIMETABLE_ATTRIBUTION }
    });
  }

  return Object.freeze({ id: 'prepared-national-bus-data-v1', manifest, nearbyStops, servicesForStops });
}
