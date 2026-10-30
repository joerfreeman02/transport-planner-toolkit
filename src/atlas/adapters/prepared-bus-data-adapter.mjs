import { createEvidence } from '../domain/evidence.mjs';
import { isConfirmedSite } from '../domain/site.mjs';
import { requestJson } from '../infrastructure/http-client.mjs';
import { distanceMetres } from './tfl-bus-stop-adapter.mjs';
import { sourceFailure, sourceSuccess } from './source-adapter.mjs';
import { mergeBusTimetableSources } from '../domain/bus-timetable-merge.mjs';
import { hasScheduledEvidenceAt, scheduledStopIds, scopedScheduledService } from '../domain/scheduled-evidence.mjs';

const STOP_SOURCE = 'Department for Transport NaPTAN';
const TIMETABLE_SOURCE = 'Department for Transport Bus Open Data Service';
const STOP_ATTRIBUTION = 'NaPTAN data provided by the Department for Transport under the Open Government Licence';
const TIMETABLE_ATTRIBUTION = 'Bus timetable data provided by the Department for Transport Bus Open Data Service under the Open Government Licence';
const TNDS_QUARANTINE_WARNING = 'Supplementary timetable evidence is incomplete for one or more services relevant to this assessment. ATLAS excluded unsupported timetable patterns rather than estimating their timings.';
const MAX_LEGACY_TNDS_SERVICES = 100;
export const MAX_TNDS_RUNTIME_SHARD_BYTES = 8 * 1024 * 1024;
const PREPARED_TNDS_SCHEMAS = new Set(['atlas-prepared-bus-tnds-v1', 'atlas-prepared-bus-tnds-v2']);
const PREPARED_BUS_SCHEMAS = new Set(['atlas-prepared-bus-data-v1', 'atlas-prepared-bus-data-v2']);

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
function sourceTimestamp(value) { const text = String(value ?? '').trim(); return text && !Number.isNaN(Date.parse(text)) ? text : null; }
function decodePreparedRecords(records, fields = []) {
  return (records ?? []).map(record => Array.isArray(record) ? Object.fromEntries(fields.map((field, index) => [field, record[index]])) : record).filter(record => record && typeof record === 'object');
}

const SERVICE_DAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

export function reassemblePreparedTndsFragments(rows, expectedFragments = []) {
  const expectedByParent = new Map();
  const expectedByPath = new Map();
  for (const descriptor of expectedFragments) {
    if (!descriptor || typeof descriptor.parentServiceId !== 'string' || typeof descriptor.fragmentId !== 'string'
        || !Number.isInteger(descriptor.fragmentOrdinal) || !Number.isInteger(descriptor.fragmentCount)
        || !Number.isSafeInteger(descriptor.fragmentDepartureEvidenceCount) || descriptor.fragmentDepartureEvidenceCount < 0
        || !Number.isSafeInteger(descriptor.parentDepartureEvidenceCount) || descriptor.parentDepartureEvidenceCount < 1
        || !descriptor.parentEvidenceByDayCounts || typeof descriptor.parentEvidenceByDayCounts !== 'object' || Array.isArray(descriptor.parentEvidenceByDayCounts)
        || descriptor.fragmentOrdinal < 1 || descriptor.fragmentOrdinal > descriptor.fragmentCount || descriptor.fragmentCount < 2) {
      return { ok: false, services: [], error: 'Prepared TNDS fragment manifest identity is malformed.' };
    }
    if (typeof descriptor.path !== 'string' || !descriptor.path) return { ok: false, services: [], error: 'Prepared TNDS fragment manifest path is malformed.' };
    const ordinalMap = expectedByParent.get(descriptor.parentServiceId) ?? new Map();
    if (!ordinalMap.has(descriptor.fragmentOrdinal)) ordinalMap.set(descriptor.fragmentOrdinal, []);
    ordinalMap.get(descriptor.fragmentOrdinal).push(descriptor);
    expectedByParent.set(descriptor.parentServiceId, ordinalMap);
    if (expectedByPath.has(descriptor.path)) return { ok: false, services: [], error: `Prepared TNDS fragment path is duplicated in the manifest for ${descriptor.parentServiceId}.` };
    expectedByPath.set(descriptor.path, descriptor);
  }
  const actualByParent = new Map();
  const ordinary = [];
  for (const item of rows) {
    const fragment = item.service?.fragment;
    if (!fragment) { ordinary.push(item.service); continue; }
    const expected = expectedByPath.get(item.path);
    if (!expected || expected.fragmentId !== fragment.fragmentId || expected.fragmentOrdinal !== fragment.ordinal || expected.fragmentCount !== fragment.count
        || expected.fragmentDepartureEvidenceCount !== fragment.fragmentDepartureEvidenceCount || expected.parentDepartureEvidenceCount !== fragment.parentDepartureEvidenceCount
        || JSON.stringify(expected.parentEvidenceByDayCounts) !== JSON.stringify(fragment.parentEvidenceByDayCounts)
        || item.service.id !== fragment.parentServiceId) {
      return { ok: false, services: [], error: `Prepared TNDS fragment metadata did not match its manifest descriptor for ${fragment.parentServiceId || 'unknown parent'}.` };
    }
    const ordinalMap = actualByParent.get(fragment.parentServiceId) ?? new Map();
    if (!ordinalMap.has(fragment.ordinal)) ordinalMap.set(fragment.ordinal, []);
    ordinalMap.get(fragment.ordinal).push(item.service);
    actualByParent.set(fragment.parentServiceId, ordinalMap);
  }
  for (const [parentId, descriptorByOrdinal] of expectedByParent) {
    const descriptors = [...descriptorByOrdinal.values()].flat();
    const count = descriptors[0]?.fragmentCount;
    const equivalent = (left, right) => left.fragmentId === right.fragmentId && left.fragmentCount === right.fragmentCount
      && left.fragmentDepartureEvidenceCount === right.fragmentDepartureEvidenceCount
      && left.parentDepartureEvidenceCount === right.parentDepartureEvidenceCount
      && JSON.stringify(left.parentEvidenceByDayCounts) === JSON.stringify(right.parentEvidenceByDayCounts);
    if (descriptors.some(item => item.fragmentCount !== count)
        || Array.from({ length: count }, (_, index) => index + 1).some(ordinal => !descriptorByOrdinal.has(ordinal))
        || [...descriptorByOrdinal.values()].some(copies => copies.some(item => !equivalent(copies[0], item)))) {
      return { ok: false, services: [], error: `Prepared TNDS fragment set is incomplete in the selected manifest for ${parentId}.` };
    }
    const actualByOrdinal = actualByParent.get(parentId) ?? new Map();
    const fragmentCopies = Array.from({ length: count }, (_, index) => actualByOrdinal.get(index + 1));
    if (fragmentCopies.some(copies => !copies?.length)) {
      return { ok: false, services: [], error: `Prepared TNDS fragment set is incomplete after loading for ${parentId}.` };
    }
    const sharedMetadata = service => {
      const common = { ...service };
      delete common.fragment;
      delete common.departureEvidenceByDay;
      delete common.stopSchedules;
      delete common.tndsQuarantine;
      return common;
    };
    const canonicalQuarantine = quarantine => {
      if (!quarantine) return null;
      const common = { ...quarantine };
      delete common.affectedStopIds;
      delete common.patterns;
      const patterns = (quarantine.patterns ?? []).map(pattern => {
        const shared = { ...pattern };
        delete shared.affectedStopIds;
        return { shared, affectedStopIds: [...new Set(pattern.affectedStopIds ?? [])].sort() };
      });
      return { common, patterns };
    };
    const fragments = [];
    for (const copies of fragmentCopies) {
      const reference = copies[0];
      const referenceShared = JSON.stringify(sharedMetadata(reference));
      const referenceFragment = JSON.stringify(reference.fragment);
      const referenceEvidence = JSON.stringify(reference.departureEvidenceByDay);
      const referenceQuarantine = canonicalQuarantine(reference.tndsQuarantine);
      if (copies.some(copy => JSON.stringify(sharedMetadata(copy)) !== referenceShared
          || JSON.stringify(copy.fragment) !== referenceFragment
          || JSON.stringify(copy.departureEvidenceByDay) !== referenceEvidence)) {
        return { ok: false, services: [], error: `Prepared TNDS stop-prefix copies disagree on shared fragment evidence or metadata for ${parentId}/${reference.fragment.ordinal}.` };
      }
      const stopSchedules = {};
      const affectedStopIds = new Set();
      const patternMap = new Map();
      let quarantineCommon = referenceQuarantine?.common ?? null;
      for (const copy of copies) {
        Object.assign(stopSchedules, copy.stopSchedules ?? {});
        if (!copy.tndsQuarantine) continue;
        const quarantine = copy.tndsQuarantine;
        const copyCommon = Object.fromEntries(Object.entries(quarantine).filter(([key]) => !['affectedStopIds', 'patterns'].includes(key)));
        if (quarantineCommon && JSON.stringify(copyCommon) !== JSON.stringify(quarantineCommon)) {
          return { ok: false, services: [], error: `Prepared TNDS stop-prefix quarantine metadata disagrees for ${parentId}/${reference.fragment.ordinal}.` };
        }
        quarantineCommon ??= copyCommon;
        for (const stopId of quarantine.affectedStopIds ?? []) affectedStopIds.add(stopId);
        for (const pattern of quarantine.patterns ?? []) {
          const shared = { ...pattern };
          delete shared.affectedStopIds;
          const key = JSON.stringify(shared);
          const existing = patternMap.get(key) ?? { ...shared, affectedStopIds: new Set() };
          for (const stopId of pattern.affectedStopIds ?? []) existing.affectedStopIds.add(stopId);
          patternMap.set(key, existing);
        }
      }
      const tndsQuarantine = quarantineCommon ? {
        ...quarantineCommon,
        affectedStopIds: [...affectedStopIds].sort(),
        patterns: [...patternMap.values()].map(pattern => ({ ...pattern, affectedStopIds: [...pattern.affectedStopIds].sort() }))
      } : null;
      fragments.push({ ...reference, stopSchedules, tndsQuarantine });
    }
    const expectedEvidenceCount = descriptors[0].parentDepartureEvidenceCount;
    const expectedDayCounts = descriptors[0].parentEvidenceByDayCounts;
    const actualEvidenceCount = fragments.reduce((total, item) => total + SERVICE_DAYS.reduce((dayTotal, day) => dayTotal + (item.departureEvidenceByDay?.[day] ?? []).length, 0), 0);
    if (descriptors.some(item => item.parentDepartureEvidenceCount !== expectedEvidenceCount)
        || descriptors.some(item => JSON.stringify(item.parentEvidenceByDayCounts) !== JSON.stringify(expectedDayCounts))
        || SERVICE_DAYS.reduce((total, day) => total + Number(expectedDayCounts[day] ?? -1), 0) !== expectedEvidenceCount
        || fragments.some(item => SERVICE_DAYS.reduce((total, day) => total + (item.departureEvidenceByDay?.[day] ?? []).length, 0) !== item.fragment.fragmentDepartureEvidenceCount)
        || actualEvidenceCount !== expectedEvidenceCount) {
      return { ok: false, services: [], error: `Prepared TNDS journey evidence count was not conserved across fragments for ${parentId}.` };
    }
    const base = { ...fragments[0] };
    delete base.fragment;
    delete base.departureEvidenceByDay;
    if (fragments.some(item => JSON.stringify(sharedMetadata(item)) !== JSON.stringify(sharedMetadata(base)))) return { ok: false, services: [], error: `Prepared TNDS fragments disagree on shared service metadata for ${parentId}.` };
    const departureEvidenceByDay = {};
    for (const day of SERVICE_DAYS) {
      const indexedRows = [];
      for (const item of fragments) {
        const order = item.fragment.evidenceOrderByDay?.[day];
        const rows = item.departureEvidenceByDay?.[day] ?? [];
        if (!Array.isArray(order) || order.length !== rows.length || order.some(index => !Number.isSafeInteger(index) || index < 0)) {
          return { ok: false, services: [], error: `Prepared TNDS fragment row order is malformed for ${parentId}/${day}.` };
        }
        rows.forEach((entry, index) => indexedRows.push({ index: order[index], entry }));
      }
      indexedRows.sort((left, right) => left.index - right.index);
      const expectedCount = expectedDayCounts[day];
      if (!Number.isSafeInteger(expectedCount) || expectedCount < 0 || indexedRows.length !== expectedCount
          || indexedRows.some((row, index) => row.index !== index)) {
        return { ok: false, services: [], error: `Prepared TNDS fragment row order is incomplete for ${parentId}/${day}.` };
      }
      departureEvidenceByDay[day] = indexedRows.map(row => row.entry);
    }
    ordinary.push({ ...base, departureEvidenceByDay });
  }
  return { ok: true, services: ordinary };
}

// Source records are normalised to one deterministic shape. A StopPoint key
// without a real departure remains metadata, not scheduled evidence.
export function normalisePreparedService(service = {}) {
  const rawSchedules = service.stopSchedules && typeof service.stopSchedules === 'object' ? service.stopSchedules : {};
  const stopSchedules = Object.fromEntries(Object.entries(rawSchedules).map(([stopId, schedule]) => [
    String(stopId),
    Object.fromEntries(SERVICE_DAYS.map(day => [day, Array.isArray(schedule?.[day]) ? schedule[day] : []]))
  ]));
  return {
    ...service,
    id: String(service.id ?? ''),
    routeNumber: String(service.routeNumber ?? '').trim(),
    operator: String(service.operator ?? '').trim(),
    origin: String(service.origin ?? '').trim(),
    destination: String(service.destination ?? '').trim(),
    destinationLocality: String(service.destinationLocality ?? service.destinationLocalityName ?? service.destinationQualifier ?? '').trim(),
    destinationLocalityEvidence: service.destinationLocalityEvidence ?? null,
    direction: String(service.direction ?? '').trim(),
    principalLocations: Array.isArray(service.principalLocations) ? service.principalLocations : [],
    routePatternStopIds: Array.isArray(service.routePatternStopIds) ? service.routePatternStopIds.map(String) : [],
    circularPatternStopIds: Array.isArray(service.circularPatternStopIds) ? service.circularPatternStopIds.map(String) : [],
    patternVariants: Array.isArray(service.patternVariants) ? service.patternVariants : [],
    frequencyEvidence: Array.isArray(service.frequencyEvidence) ? service.frequencyEvidence : [],
    operatingPeriodEvidence: Array.isArray(service.operatingPeriodEvidence) ? service.operatingPeriodEvidence : [],
    timetableSource: String(service.timetableSource ?? '').trim() || null,
    qualifications: Array.isArray(service.qualifications) ? service.qualifications : [],
    stopSchedules
  };
}

async function requestPreparedJson({ url, fetchImpl, timeoutMs, maxDecompressedBytes = null }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json, application/gzip' } });
    if (!response.ok) return { ok: false, code: 'http_failure', status: response.status, message: `Source returned HTTP ${response.status}.` };
    let body;
    const declaredBytes = Number(response.headers?.get?.('content-length'));
    if (maxDecompressedBytes && Number.isFinite(declaredBytes) && declaredBytes > maxDecompressedBytes) return { ok: false, code: 'invalid_response', status: response.status, message: 'Prepared supplementary timetable shard exceeds its bounded runtime size.' };
    const reader = response.body?.getReader?.();
    if (!reader) return { ok: false, code: 'invalid_response', status: response.status, message: 'Prepared bus data did not provide a readable response stream.' };
    const first = await reader.read();
    const firstBytes = first.value ?? new Uint8Array();
    const gzip = firstBytes[0] === 0x1f && firstBytes[1] === 0x8b;
    let stream = new ReadableStream({
      start(controller) {
        if (firstBytes.byteLength) controller.enqueue(firstBytes);
        if (first.done) controller.close();
        else (async () => {
          try {
            while (true) {
              const next = await reader.read();
              if (next.done) { controller.close(); break; }
              controller.enqueue(next.value);
            }
          } catch (error) { controller.error(error); }
        })();
      },
      cancel(reason) { return reader.cancel(reason); }
    });
    if (gzip) {
      if (typeof DecompressionStream !== 'function') return { ok: false, code: 'invalid_response', status: response.status, message: 'This browser cannot open the prepared bus-data file.' };
      stream = stream.pipeThrough(new DecompressionStream('gzip'));
    }
    const chunks = [];
    let byteLength = 0;
    const decoded = stream.getReader();
    while (true) {
      const part = await decoded.read();
      if (part.done) break;
      byteLength += part.value.byteLength;
      if (maxDecompressedBytes && byteLength > maxDecompressedBytes) {
        await decoded.cancel();
        return { ok: false, code: 'invalid_response', status: response.status, message: 'Prepared supplementary timetable shard exceeds its bounded runtime size.' };
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = new TextDecoder().decode(bytes);
    try { return { ok: true, status: response.status, data: JSON.parse(body) }; }
    catch { return { ok: false, code: 'invalid_response', status: response.status, message: 'Prepared bus data was not valid JSON.' }; }
  } catch (error) {
    return { ok: false, code: error?.name === 'AbortError' ? 'timeout' : 'unavailable_source', status: null, message: error?.name === 'AbortError' ? 'Prepared bus data timed out.' : 'Prepared bus data could not be loaded.' };
  } finally { clearTimeout(timer); }
}

function preparedServiceRecordValid(service) {
  return Boolean(service
    && typeof service === 'object'
    && String(service.id ?? '').trim()
    && service.stopSchedules
    && typeof service.stopSchedules === 'object'
    && !Array.isArray(service.stopSchedules));
}

function nationalRoutesAtStop(stop) {
  const routes = (stop?.routes ?? []).map(String);
  const authorities = stop?.routeAuthorities;
  if (authorities && typeof authorities === 'object') return routes.filter(route => {
    const value = authorities[route];
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return !values.length || values.some(authority => String(authority).trim().toLowerCase() !== 'tfl');
  });
  const defaults = (stop?.timetableAuthorities ?? [stop?.timetableAuthority]).map(value => String(value ?? '').trim().toLowerCase()).filter(Boolean);
  return !defaults.length || defaults.some(authority => authority !== 'tfl') ? routes : [];
}

function serviceShardFailure({ key, path: shardPath = null, status, code = null, message = null, stopIds = [] } = {}) {
  return Object.freeze({
    key: String(key),
    path: shardPath,
    status,
    code,
    message,
    stopIds: Object.freeze([...new Set(stopIds.map(String).filter(Boolean))].sort())
  });
}

export function createPreparedBusDataAdapter({
  fetchImpl = globalThis.fetch,
  baseUrl,
  tndsBaseUrl = null,
  busFileUrl = null,
  tndsFileUrl = null,
  clock = () => new Date(),
  timeoutMs = 20000
} = {}) {
  if (!baseUrl) throw new Error('Prepared bus-data base URL is required.');
  const resolveBusUrl = relativePath => busFileUrl ? busFileUrl(relativePath) : resolveUrl(baseUrl, relativePath);
  const resolveTndsUrl = relativePath => tndsFileUrl ? tndsFileUrl(relativePath) : resolveUrl(tndsBaseUrl, relativePath);
  let manifestPromise = null;
  const documentPromises = new Map();

  async function loadJson(relativePath, forceRefresh = false) {
    if (forceRefresh) documentPromises.delete(relativePath);
    if (!documentPromises.has(relativePath)) documentPromises.set(relativePath, relativePath.endsWith('.gz')
      ? requestPreparedJson({ url: resolveBusUrl(relativePath), fetchImpl, timeoutMs })
      : requestJson({ url: resolveBusUrl(relativePath), fetchImpl, timeoutMs }));
    const response = await documentPromises.get(relativePath);
    if (!response.ok) documentPromises.delete(relativePath);
    return response;
  }

  async function manifest(forceRefresh = false) {
    if (forceRefresh) manifestPromise = null;
    if (!manifestPromise) manifestPromise = loadJson('manifest.json', forceRefresh);
    const response = await manifestPromise;
    if (!response.ok || !PREPARED_BUS_SCHEMAS.has(response.data?.schema)) {
      manifestPromise = null;
      return sourceFailure({ code: response.code || 'invalid_response', message: 'National bus information could not be checked. Please try again.', provenance: { source: `${STOP_SOURCE} and ${TIMETABLE_SOURCE}`, endpoint: resolveBusUrl('manifest.json') } });
    }
    return sourceSuccess({ data: response.data, provenance: { source: `${STOP_SOURCE} and ${TIMETABLE_SOURCE}`, endpoint: resolveBusUrl('manifest.json') } });
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
    const provenance = { source: STOP_SOURCE, authoritativeFor: 'NaPTAN public-transport access-node records', endpoint: resolveBusUrl('manifest.json'), retrievedAt: null };
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
    if (responses.some(response => !PREPARED_BUS_SCHEMAS.has(response.data?.schema) || !Array.isArray(response.data?.stops))) return sourceFailure({ code: 'invalid_response', message: 'National bus-stop information could not be safely interpreted. Please try again.', provenance, warnings: ['A prepared NaPTAN stop file was incomplete or malformed.'] });
    const deduplicated = new Map();
    const fields = index.stopFields ?? [];
    for (const response of responses) for (const rawStop of response.data?.stops ?? []) {
      const stop = Array.isArray(rawStop) ? Object.fromEntries(fields.map((field, position) => [field, rawStop[position]])) : rawStop;
      const distance = distanceMetres(site, stop);
      if (distance <= numericRadius && !deduplicated.has(stop.id)) {
        const routes = [...new Set(stop.routes ?? [])];
        deduplicated.set(stop.id, {
          ...stop,
          sourceId: stop.id,
          timetableAuthority: 'NaPTAN',
          distanceMetres: distance,
          routes,
          routeAuthorities: Object.fromEntries(routes.map(route => [String(route), ['BODS']])),
          routeDiscoverySource: 'BODS'
        });
      }
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
      source: { name: STOP_SOURCE, authoritative: true, recordIdentifier: stop.id, endpoint: index.sources.naptan.url, datasetTimestamp: sourceTimestamp(stop.modifiedAt), datasetVersion: index.sources.naptan.sha256, attribution: STOP_ATTRIBUTION },
      retrievedAt: checkedAt,
      calculationMethodology: 'Straight-line discovery distance calculated using the WGS84 haversine formula from the confirmed assessment point to the authoritative NaPTAN stop coordinate.',
      validationStatus: 'validated', confidenceStatus: 'authoritative', warnings,
      freshness: { status: warnings.length ? 'stale' : 'live-current', assessedAt: checkedAt }, cache: { status: 'not-used' }
    }));
    return sourceSuccess({ data: stops, evidence, warnings, provenance: { ...provenance, endpoint: index.sources.naptan.url, retrievedAt: checkedAt, dataPreparedAt: index.generatedAt, datasetVersion: index.sources.naptan.sha256, routeDiscoverySource: 'BODS', resultCount: stops.length, providerAdapter: 'prepared-naptan-bus-stop-v1', anonymousRequest: true, apiKeyEmbedded: false } });
  }

  async function servicesForStops(stops, { forceRefresh = false } = {}) {
    const manifestResult = await manifest(forceRefresh);
    if (!manifestResult.ok) return manifestResult;
    const index = manifestResult.data;
    // Infrastructure/access StopPoints remain in the physical/reference data,
    // but do not create timetable shard requests or missing-call defects.
    const callStops = (stops ?? []).filter(stop => stop?.timetableCallEligible !== false);
    const stopIds = new Set(callStops.map(stop => String(stop.id || stop.sourceId || '')).filter(Boolean));
    const prefixLength = Number(index.serviceShardKeyLength || 3);
    const shardKeys = [...new Set(callStops.map(stop => String(stop.id || stop.sourceId || '').slice(0, prefixLength)).filter(code => code.length === prefixLength))];
    const stopIdsByShardKey = new Map(shardKeys.map(key => [key, [...stopIds].filter(stopId => stopId.slice(0, prefixLength) === key)]));
    const shardDiagnostics = [];
    const shardPayloads = [];
    for (const key of shardKeys) {
      const configured = index.serviceShards?.[key];
      const shardStopIds = stopIdsByShardKey.get(key) ?? [];
      if (!configured || (Array.isArray(configured) && configured.length === 0)) {
        shardDiagnostics.push(serviceShardFailure({ key, status: 'missing', code: 'missing_shard', message: `No prepared timetable shard is configured for stop prefix ${key}.`, stopIds: shardStopIds }));
        continue;
      }
      const paths = [...new Set(Array.isArray(configured) ? configured : [configured])];
      for (const shardPath of paths) {
        const response = await loadJson(shardPath, forceRefresh);
        if (!response.ok) {
          shardDiagnostics.push(serviceShardFailure({ key, path: shardPath, status: 'load-failed', code: response.code, message: response.message, stopIds: shardStopIds }));
          continue;
        }
        if (!PREPARED_BUS_SCHEMAS.has(response.data?.schema) || !Array.isArray(response.data?.services)) {
          shardDiagnostics.push(serviceShardFailure({ key, path: shardPath, status: 'malformed', code: 'malformed_shard', message: 'Prepared timetable shard schema or service collection was invalid.', stopIds: shardStopIds }));
          continue;
        }
        if (!response.data.services.every(preparedServiceRecordValid)) {
          shardDiagnostics.push(serviceShardFailure({ key, path: shardPath, status: 'validation-failed', code: 'invalid_service_record', message: 'One or more prepared timetable service records failed validation.', stopIds: shardStopIds }));
          continue;
        }
        shardDiagnostics.push(serviceShardFailure({ key, path: shardPath, status: 'loaded', stopIds: shardStopIds }));
        shardPayloads.push({ key, path: shardPath, services: response.data.services });
      }
    }
    if (!shardKeys.length) {
      return sourceSuccess({ data: [], evidence: [], warnings: [], provenance: { source: TIMETABLE_SOURCE, endpoint: index.sources.bods.url, sourceCompleteness: 'COMPLETE', timetableConclusion: 'NO_CURRENT_MATCH', requestedShardKeys: [], checkedStopIds: [] } });
    }
    const failedShardDiagnostics = shardDiagnostics.filter(item => item.status !== 'loaded');
    const successfulShardDiagnostics = shardDiagnostics.filter(item => item.status === 'loaded');
    if (!shardPayloads.length) {
      const failedStopIds = [...new Set(failedShardDiagnostics.flatMap(item => item.stopIds))].sort();
      return sourceFailure({
        code: failedShardDiagnostics.some(item => item.status === 'malformed' || item.status === 'validation-failed') ? 'invalid_response' : 'unavailable_source',
        message: 'Bus timetable information could not be checked. Please try again.',
        provenance: { source: TIMETABLE_SOURCE, endpoint: index.sources.bods.url, sourceCompleteness: 'SOURCE_UNAVAILABLE', timetableConclusion: 'UNRESOLVED', requestedShardKeys: shardKeys, unresolvedStopIds: failedStopIds, failedShardCount: failedShardDiagnostics.length, successfulShardCount: 0, failedShardDiagnostics, successfulShardDiagnostics, failedRequests: failedShardDiagnostics.length, unresolvedRequests: failedShardDiagnostics.length },
        warnings: [`Prepared timetable evidence was unavailable for ${failedStopIds.length || failedShardDiagnostics.length} selected stop area${(failedStopIds.length || failedShardDiagnostics.length) === 1 ? '' : 's'}. No zero-service conclusion has been assumed.`]
      });
    }
    const failedStopIds = [...new Set(failedShardDiagnostics.flatMap(item => item.stopIds))].sort();
    const incompleteRequestIdentities = [...new Set(failedStopIds.flatMap(stopId => {
      const stop = callStops.find(candidate => String(candidate.id || candidate.sourceId || '') === stopId);
      return (stop?.routes ?? []).map(route => `${String(route)}|${stopId}`);
    }))].sort();
    const unresolvedRoutes = [...new Set(callStops.filter(stop => failedStopIds.includes(String(stop.id || stop.sourceId || ''))).flatMap(stop => stop.routes ?? []).map(String))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const services = new Map();
    for (const shard of shardPayloads) for (const rawService of shard.services) {
      const service = normalisePreparedService(rawService);
      const scoped = scopedScheduledService(service, stopIds);
      if (!scheduledStopIds(scoped).length) continue;
      const existing = services.get(service.id);
      if (!existing) services.set(service.id, structuredClone(scoped));
      else Object.assign(existing.stopSchedules, scoped.stopSchedules);
    }
    let mergedServices = [...services.values()];
    let tndsProvenance = null;
    const tndsWarnings = new Set();
    const quarantinedRequestIdentities = new Set();
    let supplementaryFailure = null;
    const supplementaryUnresolvedIdentities = [...new Set(callStops.flatMap(stop => {
      const stopId = String(stop.id || stop.sourceId || '');
      return nationalRoutesAtStop(stop).map(route => `${route}|${stopId}`);
    }))].sort();
    const failSupplementary = (code, warning, details = {}) => {
      supplementaryFailure = { code, warning, ...details };
    };
    if (tndsBaseUrl) {
      const tndsManifest = await requestJson({ url: resolveTndsUrl('manifest.json'), fetchImpl, timeoutMs });
      if (!tndsManifest.ok || !PREPARED_TNDS_SCHEMAS.has(tndsManifest.data?.schema)) {
        failSupplementary('unavailable_source', 'Prepared supplementary timetable coverage is unavailable or malformed.', { endpoint: resolveTndsUrl('manifest.json') });
      }
      if (supplementaryFailure) {
        // BODS is the authoritative national source. Keep its loaded services
        // while making unavailable supplementary scope explicit below.
      } else {
      const manifest = tndsManifest.data;
      const boundedManifest = manifest.schema === 'atlas-prepared-bus-tnds-v2';
      const hasShards = manifest.serviceShards && typeof manifest.serviceShards === 'object' && !Array.isArray(manifest.serviceShards);
      let shardPaths = [];
      let legacy = false;
      if (hasShards) {
        const tndsPrefixLength = Number(manifest.serviceShardKeyLength);
        if (!Number.isInteger(tndsPrefixLength) || tndsPrefixLength < 1 || tndsPrefixLength > 32 || !Object.keys(manifest.serviceShards).length) failSupplementary('invalid_response', 'Prepared supplementary timetable shard coverage was malformed.', { endpoint: resolveTndsUrl('manifest.json') });
        const selectedKeys = [...new Set([...stopIds].map(stopId => stopId.slice(0, tndsPrefixLength)).filter(Boolean))];
        for (const key of supplementaryFailure ? [] : selectedKeys) {
          if (!Object.prototype.hasOwnProperty.call(manifest.serviceShards, key)) continue;
          const configured = manifest.serviceShards[key];
          if (!Array.isArray(configured) || configured.length === 0) {
            failSupplementary('invalid_response', 'Prepared supplementary timetable shard coverage was malformed.', { endpoint: resolveTndsUrl('manifest.json') });
            break;
          }
          if (boundedManifest) {
            const selectedStopIds = new Set(stopIdsByShardKey.get(key) ?? []);
            for (const descriptor of configured) {
              if (!descriptor || typeof descriptor.path !== 'string' || !Array.isArray(descriptor.stopIds) || !Number.isSafeInteger(descriptor.uncompressedBytes) || descriptor.uncompressedBytes < 1 || descriptor.uncompressedBytes > MAX_TNDS_RUNTIME_SHARD_BYTES) {
                failSupplementary('invalid_response', 'Prepared supplementary timetable shard index was malformed or exceeded its bounded runtime size.', { endpoint: resolveTndsUrl('manifest.json') });
                break;
              }
              if (descriptor.stopIds.some(id => selectedStopIds.has(String(id)))) shardPaths.push({ key, descriptor });
            }
            if (supplementaryFailure) break;
          } else shardPaths.push(...configured.map(file => ({ key, descriptor: { path: file, stopIds: [] } })));
        }
      } else if (Array.isArray(manifest.services) && manifest.services.length <= MAX_LEGACY_TNDS_SERVICES) {
        shardPaths = manifest.services;
        legacy = true;
      } else failSupplementary('invalid_response', 'Prepared supplementary timetable data requires stop-prefix shards.', { endpoint: resolveTndsUrl('manifest.json') });
      if (legacy && !supplementaryFailure) shardPaths = manifest.services.map(file => ({ key: null, descriptor: { path: file, stopIds: [] } }));
      const tndsRows = [];
      const expectedFragments = [];
      if (boundedManifest && hasShards && !supplementaryFailure) {
        const byParent = new Map();
        for (const selected of new Map(shardPaths.map(row => [row.descriptor.path, row])).values()) {
          const descriptor = selected.descriptor;
          if (!descriptor.fragmentId && !descriptor.parentServiceId && !descriptor.fragmentOrdinal && !descriptor.fragmentCount) continue;
          if (typeof descriptor.parentServiceId !== 'string' || typeof descriptor.fragmentId !== 'string' || !Number.isInteger(descriptor.fragmentOrdinal) || !Number.isInteger(descriptor.fragmentCount)) {
            failSupplementary('invalid_response', 'Prepared supplementary timetable fragment index was malformed.', { endpoint: resolveTndsUrl(descriptor.path), failedShard: descriptor.path });
            break;
          }
          const value = { ...descriptor };
          expectedFragments.push(value);
          if (!byParent.has(value.parentServiceId)) byParent.set(value.parentServiceId, []);
          byParent.get(value.parentServiceId).push(value);
        }
        for (const [parentId, descriptors] of byParent) {
          const count = descriptors[0]?.fragmentCount;
          if (descriptors.length !== count || new Set(descriptors.map(item => item.fragmentOrdinal)).size !== count
              || Array.from({ length: count }, (_, index) => index + 1).some(ordinal => !descriptors.some(item => item.fragmentOrdinal === ordinal))) {
            failSupplementary('invalid_response', `Prepared supplementary timetable fragments are incomplete for ${parentId}.`, { endpoint: resolveTndsUrl('manifest.json') });
            break;
          }
        }
      }
      for (const selected of [...new Map(shardPaths.map(row => [row.descriptor.path, row])).values()]) {
        if (supplementaryFailure) break;
        const file = selected.descriptor.path;
        const response = await (file.endsWith('.gz') ? requestPreparedJson({ url: resolveTndsUrl(file), fetchImpl, timeoutMs, maxDecompressedBytes: MAX_TNDS_RUNTIME_SHARD_BYTES }) : requestJson({ url: resolveTndsUrl(file), fetchImpl, timeoutMs }));
        if (!response.ok) {
          failSupplementary(response.code || 'unavailable_source', `Prepared supplementary timetable shard could not be loaded: ${file}.`, { endpoint: resolveTndsUrl(file), failedShard: file });
          continue;
        }
        const validSchema = boundedManifest ? response.data?.schema === 'atlas-prepared-bus-tnds-v2' : response.data?.schema === 'atlas-prepared-bus-tnds-v1';
        if (!legacy && (!Array.isArray(response.data?.services) || !validSchema || (hasShards && response.data?.stopPrefix !== selected.key))) {
          failSupplementary('invalid_response', `Prepared supplementary timetable shard was malformed: ${file}.`, { endpoint: resolveTndsUrl(file), failedShard: file });
          continue;
        }
        for (const service of legacy ? [response.data] : response.data.services) tndsRows.push({ path: file, service });
      }
      const fragmentResult = reassemblePreparedTndsFragments(tndsRows, expectedFragments);
      if (!fragmentResult.ok) failSupplementary('invalid_response', fragmentResult.error, { endpoint: resolveTndsUrl('manifest.json') });
      const matchedTndsRows = fragmentResult.services.map(service => normalisePreparedService(service)).map(service => {
          const scoped = scopedScheduledService(service, stopIds);
          const affectedAtStop = (service.tndsQuarantine?.affectedStopIds || []).filter(id => stopIds.has(id));
          if (affectedAtStop.length) {
            tndsWarnings.add(TNDS_QUARANTINE_WARNING);
            for (const stopId of affectedAtStop) if (service.routeNumber) quarantinedRequestIdentities.add(`${service.routeNumber}|${stopId}`);
          }
          return scoped;
        }).filter(service => scheduledStopIds(service).length && !service.tndsQuarantine?.serviceQuarantined);
        mergedServices = mergeBusTimetableSources({ bods: mergedServices, tnds: matchedTndsRows });
        const unresolvedRequestIdentities = [...quarantinedRequestIdentities].filter(identity => {
          const [routeNumber, stopId] = identity.split('|');
          return !mergedServices.some(service => String(service.routeNumber ?? '').trim().toLowerCase() === routeNumber.trim().toLowerCase()
            && hasScheduledEvidenceAt(service, stopId)
            && (!service.tndsQuarantine?.affectedStopIds?.includes(stopId) || !/^tnds:/i.test(String(service.id ?? ''))));
        }).sort();
        tndsProvenance = { source: 'Traveline National Dataset supplementary data', dataPreparedAt: manifest.generatedAt, regions: manifest.regions, serving: legacy ? 'bounded-legacy-manifest' : 'stop-prefix-subshards', shardRequests: [...new Set(shardPaths.map(row => row.descriptor.path))].length, unresolvedRequestIdentities };
      }
    }
    const orderedPatternIds = service => {
      if (service.routePatternStopIds?.length > 1) return service.routePatternStopIds.map(String);
      const candidate = (service.circularPatternStopIds ?? []).map(String);
      const originId = String(service.originStopPointId ?? service.originStopPointIds?.[0] ?? '');
      const destinationId = String(service.destinationStopPointId ?? service.destinationStopPointIds?.[0] ?? '');
      // Some frozen GTFS projections retain the full ordered call sequence in
      // circularPatternStopIds. Accept it as route direction evidence only
      // when its exact endpoint identities agree with this service record.
      return candidate.length > 1 && candidate[0] === originId && candidate.at(-1) === destinationId ? candidate : [];
    };
    const patternsNeedingCalls = mergedServices.filter(service => !service.routePatternStops?.length && orderedPatternIds(service).length > 1);
    const referenceIds = [...new Set(patternsNeedingCalls.flatMap(orderedPatternIds))];
    const referenceResult = referenceIds.length ? await referenceStopPointsByIds(referenceIds, { forceRefresh }) : null;
    if (referenceResult?.ok) {
      const byId = new Map(referenceResult.data.map(stop => [String(stop.id), stop]));
      const localityResult = await localitiesForStops(referenceResult.data, { forceRefresh });
      const localityByCode = new Map((localityResult?.ok ? localityResult.data : []).map(locality => [String(locality.id).replace(/^nptg:/, ''), locality]));
      for (const service of patternsNeedingCalls) {
        const ids = orderedPatternIds(service);
        service.routePatternStopIds = ids;
        service.routePatternStops = ids.map(id => {
          const stop = byId.get(id);
          const locality = stop ? localityByCode.get(String(stop.nptgLocalityCode ?? '')) : null;
          return stop ? {
            id,
            name: String(stop.commonName ?? stop.name ?? '').trim(),
            locality: String(locality?.name ?? stop.nptgLocalityName ?? stop.locality ?? '').trim(),
            localityQualifier: String(stop.localityQualifier ?? '').trim(),
            parentLocality: String(locality?.parentLocalityName ?? stop.parentLocalityName ?? '').trim()
          } : { id, name: '' };
        });
      }
    }
    const checkedAt = clock().toISOString();
    const partial = failedShardDiagnostics.length > 0;
    const warnings = [...snapshotWarnings(index), ...tndsWarnings];
    if (partial) warnings.push(`Prepared timetable evidence was incomplete for ${failedStopIds.length || failedShardDiagnostics.length} selected stop area${(failedStopIds.length || failedShardDiagnostics.length) === 1 ? '' : 's'}. Successful timetable shards were retained; affected route/stop evidence was not treated as absent.`);
    if (!mergedServices.some(service => scheduledStopIds(service).length)) warnings.push('No current BODS timetable records matched the selected authoritative stop identifiers.');
    const unresolvedRequestIdentities = [...new Set(tndsProvenance?.unresolvedRequestIdentities ?? [])].sort();
    const allUnresolvedRequestIdentities = [...new Set([...(tndsProvenance?.unresolvedRequestIdentities ?? []), ...(supplementaryFailure ? supplementaryUnresolvedIdentities : [])])].sort();
    const timetableConclusion = supplementaryFailure
      ? 'UNRESOLVED'
      : mergedServices.some(service => scheduledStopIds(service).length)
      ? 'MATCHED'
      : (partial || unresolvedRequestIdentities.length) ? 'UNRESOLVED' : 'NO_CURRENT_MATCH';
    allUnresolvedRequestIdentities.push(...incompleteRequestIdentities);
    const stableUnresolvedRequestIdentities = [...new Set(allUnresolvedRequestIdentities)].sort();
    const warningsWithSupplementary = [...warnings];
    if (supplementaryFailure) warningsWithSupplementary.push(`Supplementary TNDS evidence remains unresolved: ${supplementaryFailure.warning} Successfully loaded BODS-primary services were retained.`);
    return sourceSuccess({
      data: mergedServices, evidence: [], warnings: warningsWithSupplementary,
      provenance: { source: tndsProvenance ? `${TIMETABLE_SOURCE}; ${tndsProvenance.source}` : TIMETABLE_SOURCE, endpoint: index.sources.bods.url, retrievedAt: checkedAt, dataPreparedAt: index.generatedAt, tndsPreparedAt: tndsProvenance?.dataPreparedAt || null, tndsServing: tndsProvenance?.serving || null, tndsShardRequests: tndsProvenance?.shardRequests ?? null, supplementarySourceCondition: supplementaryFailure ? 'UNRESOLVED' : tndsBaseUrl ? 'CHECKED' : 'NOT_CONFIGURED', supplementarySourceFailure: supplementaryFailure ? { code: supplementaryFailure.code, endpoint: supplementaryFailure.endpoint, failedShard: supplementaryFailure.failedShard || null } : null, datasetVersion: index.sources.bods.sha256, regions: index.sources.bods.regions, representativeDates: index.representativeDates, anonymousRequest: true, apiKeyEmbedded: false, attribution: TIMETABLE_ATTRIBUTION, unresolvedRequestIdentities: stableUnresolvedRequestIdentities, nationalUnresolvedRequestIdentities: stableUnresolvedRequestIdentities, nationalUnresolvedRoutes: [...new Set([...(tndsProvenance?.unresolvedRequestIdentities ?? []).map(identity => String(identity).split('|')[0]), ...(supplementaryFailure ? supplementaryUnresolvedIdentities.map(identity => identity.split('|')[0]) : []), ...unresolvedRoutes])].filter(Boolean).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })), checkedStopIds: [...new Set(successfulShardDiagnostics.flatMap(item => item.stopIds))].sort(), unresolvedStopIds: [...new Set([...failedStopIds, ...(supplementaryFailure ? callStops.filter(stop => nationalRoutesAtStop(stop).length).map(stop => String(stop.id || stop.sourceId || '')) : [])])].sort(), requestedShardKeys: shardKeys, failedShardCount: failedShardDiagnostics.length + (supplementaryFailure ? 1 : 0), successfulShardCount: successfulShardDiagnostics.length, failedShardDiagnostics, successfulShardDiagnostics, failedRequests: failedShardDiagnostics.length + (supplementaryFailure ? 1 : 0), unresolvedRequests: failedShardDiagnostics.length + (supplementaryFailure ? 1 : 0), sourceCompleteness: partial || supplementaryFailure ? 'PARTIAL' : 'COMPLETE', timetableConclusion }
    });
  }

  async function logicalGroupsForStops(stops, { forceRefresh = false } = {}) {
    const manifestResult = await manifest(forceRefresh);
    if (!manifestResult.ok) return manifestResult;
    const index = manifestResult.data;
    if (index.schema !== 'atlas-prepared-bus-data-v2') return sourceSuccess({ data: [], warnings: ['Prepared v1 data does not contain logical StopArea sidecars.'], provenance: { source: STOP_SOURCE, preparedSchema: index.schema, groupingAvailable: false } });
    const keys = [...new Set((stops ?? []).flatMap(stop => (stop.logicalGroupRefs ?? []).map(ref => String(ref.sourceId ?? '').slice(0, Number(index.groupShardKeyLength || 3))).filter(Boolean)))];
    const paths = keys.map(key => index.groupShards?.[key]).filter(Boolean);
    const responses = await Promise.all(paths.map(path => loadJson(path, forceRefresh)));
    if (responses.some(response => !response.ok) || responses.some(response => response.data?.schema !== 'atlas-prepared-logical-groups-v1' || !Array.isArray(response.data?.groups))) return sourceFailure({ code: 'invalid_response', message: 'Logical bus-stop grouping could not be safely interpreted. Please try again.', provenance: { source: STOP_SOURCE, groupingAvailable: true } });
    const wanted = new Set((stops ?? []).flatMap(stop => (stop.logicalGroupRefs ?? []).map(ref => String(ref.id ?? ''))));
    const groups = responses.flatMap(response => response.data.groups).filter(group => wanted.has(group.id)).sort((a, b) => a.id.localeCompare(b.id));
    return sourceSuccess({ data: groups, provenance: { source: STOP_SOURCE, preparedSchema: index.schema, groupingAvailable: true, resultCount: groups.length } });
  }

  async function localitiesForStops(stops, { forceRefresh = false } = {}) {
    const manifestResult = await manifest(forceRefresh);
    if (!manifestResult.ok) return manifestResult;
    const index = manifestResult.data;
    if (index.schema !== 'atlas-prepared-bus-data-v2') return sourceSuccess({ data: [], warnings: ['Prepared v1 data does not contain NPTG locality sidecars.'], provenance: { source: STOP_SOURCE, localityAvailable: false } });
    const shardKey = code => String(code ?? '').slice(0, Number(index.localityShardKeyLength || 3));
    const keys = [...new Set((stops ?? []).map(stop => shardKey(stop.nptgLocalityCode)).filter(Boolean))];
    const paths = keys.map(key => index.localityShards?.[key]).filter(Boolean);
    const responses = await Promise.all(paths.map(path => loadJson(path, forceRefresh)));
    if (responses.some(response => !response.ok) || responses.some(response => response.data?.schema !== 'atlas-prepared-nptg-localities-v1' || !Array.isArray(response.data?.localities))) return sourceFailure({ code: 'invalid_response', message: 'NPTG locality data could not be safely interpreted.', provenance: { source: STOP_SOURCE, localityAvailable: true } });
    const wanted = new Set((stops ?? []).map(stop => `nptg:${stop.nptgLocalityCode}`).filter(id => id !== 'nptg:'));
    const direct = responses.flatMap(response => response.data.localities).filter(locality => wanted.has(locality.id));
    const parentIds = new Set(direct.map(locality => String(locality.parentLocalityId ?? '')).filter(Boolean));
    const loaded = new Map(responses.flatMap(response => response.data.localities).map(locality => [String(locality.id), locality]));
    const parentKeys = [...new Set([...parentIds].map(id => shardKey(id.replace(/^nptg:/, ''))).filter(key => key && !keys.includes(key)))];
    const parentPaths = parentKeys.map(key => index.localityShards?.[key]).filter(Boolean);
    if (parentPaths.length) {
      const parentResponses = await Promise.all(parentPaths.map(path => loadJson(path, forceRefresh)));
      if (parentResponses.some(response => !response.ok) || parentResponses.some(response => response.data?.schema !== 'atlas-prepared-nptg-localities-v1' || !Array.isArray(response.data?.localities))) return sourceFailure({ code: 'invalid_response', message: 'NPTG parent-locality data could not be safely interpreted.', provenance: { source: STOP_SOURCE, localityAvailable: true } });
      for (const locality of parentResponses.flatMap(response => response.data.localities)) loaded.set(String(locality.id), locality);
    }
    const localities = direct.map(locality => {
      const parent = loaded.get(String(locality.parentLocalityId ?? '')) || null;
      return {
        ...locality,
        ...(parent || locality.parentLocalityName ? { parentLocalityName: parent?.name || locality.parentLocalityName || null } : {}),
        ...(parent ? { parentLocality: parent } : {})
      };
    }).sort((a, b) => a.id.localeCompare(b.id));
    return sourceSuccess({ data: localities, provenance: { source: STOP_SOURCE, localityAvailable: true, resultCount: localities.length, parentLocalityRecordsLoaded: [...loaded.values()].filter(locality => parentIds.has(String(locality.id))).length } });
  }

  async function referenceStopPointsByIds(stopIds, { forceRefresh = false } = {}) {
    const manifestResult = await manifest(forceRefresh);
    if (!manifestResult.ok) return manifestResult;
    const index = manifestResult.data;
    const ids = [...new Set((stopIds ?? []).map(value => String(value ?? '').trim()).filter(Boolean))];
    if (index.schema !== 'atlas-prepared-bus-data-v2' || !index.referenceStopPointShards) return sourceSuccess({ data: [], warnings: ['Prepared v1 data does not contain national reference StopPoint shards.'], provenance: { source: STOP_SOURCE, referenceStopPointsAvailable: false, requestedIds: ids } });
    const shardKey = id => String(id).slice(0, Number(index.referenceStopPointShardKeyLength || 3));
    const keys = [...new Set(ids.map(shardKey).filter(Boolean))];
    const paths = keys.map(key => index.referenceStopPointShards?.[key]).filter(Boolean);
    const missingShardIds = ids.filter(id => !index.referenceStopPointShards?.[shardKey(id)]);
    const responses = await Promise.all(paths.map(path => loadJson(path, forceRefresh)));
    if (responses.some(response => !response.ok) || responses.some(response => response.data?.schema !== 'atlas-national-reference-stop-points-v1' || !Array.isArray(response.data?.stopPoints))) return sourceFailure({ code: 'invalid_response', message: 'National reference StopPoint data could not be safely interpreted.', provenance: { source: STOP_SOURCE, referenceStopPointsAvailable: true, requestedIds: ids } });
    const wanted = new Set(ids);
    const records = responses.flatMap(response => decodePreparedRecords(response.data.stopPoints, index.referenceStopFields)).filter(record => wanted.has(String(record?.id ?? '')));
    const seen = new Set();
    const data = [];
    const malformedIds = [];
    for (const record of records) {
      const id = String(record?.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (!Number.isFinite(Number(record.latitude)) || !Number.isFinite(Number(record.longitude)) || !Object.prototype.hasOwnProperty.call(record, 'status') || !Object.prototype.hasOwnProperty.call(record, 'busPreparedEligible')) malformedIds.push(id);
      else data.push(record);
    }
    const found = new Set(data.map(record => String(record.id)));
    const missingIds = [...new Set([...missingShardIds, ...ids.filter(id => !found.has(id) && !malformedIds.includes(id))])];
    return sourceSuccess({ data: data.sort((a, b) => String(a.id).localeCompare(String(b.id))), warnings: malformedIds.length ? ['One or more requested reference StopPoints were malformed and were not completed.'] : [], provenance: { source: STOP_SOURCE, referenceStopPointsAvailable: true, requestedIds: ids, resultCount: data.length, missingIds, malformedIds } });
  }

  async function preparedStopPointsByIds(stopIds, { forceRefresh = false } = {}) {
    const manifestResult = await manifest(forceRefresh);
    if (!manifestResult.ok) return manifestResult;
    const index = manifestResult.data;
    const ids = [...new Set((stopIds ?? []).map(value => String(value ?? '').trim()).filter(Boolean))];
    if (index.schema !== 'atlas-prepared-bus-data-v2' || !index.stopShards) return sourceSuccess({ data: [], warnings: ['Prepared v1 data does not contain full V2 physical StopPoint shards.'], provenance: { source: STOP_SOURCE, preparedStopPointsAvailable: false, requestedIds: ids } });
    const referenceResult = await referenceStopPointsByIds(ids, { forceRefresh });
    if (!referenceResult.ok) return referenceResult;
    const references = new Map((referenceResult.data ?? []).map(record => [String(record.id), record]));
    const invalidReferenceIds = [];
    const eligibleIds = [];
    for (const id of ids) {
      const reference = references.get(id);
      if (!reference) continue;
      const status = String(reference.status ?? '').toLowerCase();
      if (status !== 'active' || (reference.busDomainEligible ?? reference.busPreparedEligible) !== true || !['bus', 'bus_coach'].includes(String(reference.transportMode ?? '').toLowerCase()) || reference.coordinateValid !== true || !Number.isFinite(Number(reference.latitude)) || !Number.isFinite(Number(reference.longitude))) {
        invalidReferenceIds.push({ id, status: status || 'invalid-reference' });
        continue;
      }
      eligibleIds.push(id);
    }
    const gridSize = Number(index.gridSize);
    if (!Number.isFinite(gridSize) || gridSize <= 0) return sourceFailure({ code: 'invalid_response', message: 'Prepared physical StopPoint grid metadata was malformed.', provenance: { source: STOP_SOURCE, preparedStopPointsAvailable: true, requestedIds: ids } });
    const shardKey = reference => gridCellKey(Math.floor(Number(reference.latitude) / gridSize), Math.floor(Number(reference.longitude) / gridSize));
    const keys = [...new Set(eligibleIds.map(id => shardKey(references.get(id))).filter(Boolean))];
    const paths = keys.map(key => index.stopShards?.[key]).filter(Boolean);
    const missingShardIds = eligibleIds.filter(id => !index.stopShards?.[shardKey(references.get(id))]);
    const responses = await Promise.all(paths.map(path => loadJson(path, forceRefresh)));
    if (responses.some(response => !response.ok) || responses.some(response => response.data?.schema !== 'atlas-prepared-bus-data-v2' || !Array.isArray(response.data?.stops))) return sourceFailure({ code: 'invalid_response', message: 'Prepared physical StopPoint data could not be safely interpreted.', provenance: { source: STOP_SOURCE, preparedStopPointsAvailable: true, requestedIds: ids, stopShardRequests: paths.length } });
    const wanted = new Set(eligibleIds);
    const records = decodePreparedRecords(responses.flatMap(response => response.data.stops), index.stopFields).filter(record => wanted.has(String(record?.id ?? '')));
    const data = [];
    const malformedIds = [];
    const seen = new Set();
    for (const record of records) {
      const id = String(record.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (String(record.status ?? '').toLowerCase() !== 'active' || !Number.isFinite(Number(record.latitude)) || !Number.isFinite(Number(record.longitude))) malformedIds.push(id);
      else data.push(record);
    }
    const hydrated = new Set(data.map(record => String(record.id)));
    const unresolvedIds = [...new Set([...missingShardIds, ...eligibleIds.filter(id => !hydrated.has(id))])];
    return sourceSuccess({
      data: data.sort((a, b) => String(a.id).localeCompare(String(b.id))),
      warnings: unresolvedIds.length || malformedIds.length || invalidReferenceIds.length ? ['One or more exact physical StopPoint references could not be fully hydrated.'] : [],
      provenance: {
        source: STOP_SOURCE,
        preparedStopPointsAvailable: true,
        requestedIds: ids,
        hydratedIds: [...hydrated].sort(),
        unresolvedIds,
        malformedIds,
        invalidReferenceIds,
        stopShardRequests: paths.length,
        referenceProvenance: referenceResult.provenance
      }
    });
  }

  async function stopAreaStructureForStops(stops, { forceRefresh = false } = {}) {
    const manifestResult = await manifest(forceRefresh);
    if (!manifestResult.ok) return manifestResult;
    const index = manifestResult.data;
    if (index.schema !== 'atlas-prepared-bus-data-v2' || !index.referenceStopPointShards) return sourceSuccess({ data: { groups: [], members: [], invalidMembers: [], unresolvedGroups: [] }, warnings: ['Prepared v1 data does not contain StopArea completion sidecars.'], provenance: { source: STOP_SOURCE, stopAreaCompletionAvailable: false } });
    const coreStops = stops ?? [];
    const activeRefs = coreStops.flatMap(stop => (stop.logicalGroupRefs ?? []).filter(ref => String(ref?.status ?? '').toLowerCase() === 'active' && String(ref?.id ?? '').startsWith('naptan:')).map(ref => ({ ...ref, coreStopPointId: String(stop.id || stop.sourceId || '') })));
    const refIds = [...new Set(activeRefs.map(ref => String(ref.id)))];
    if (!refIds.length) return sourceSuccess({ data: { groups: [], members: [], invalidMembers: [], unresolvedGroups: [] }, provenance: { source: STOP_SOURCE, stopAreaCompletionAvailable: true, qualifiedGroupCount: 0, completedMemberCount: 0 } });
    const groupsResult = await logicalGroupsForStops(coreStops, { forceRefresh });
    if (!groupsResult.ok) return groupsResult;
    const requestedGroups = new Map((groupsResult.data ?? []).map(group => [String(group.id), group]));
    const groups = [];
    const unresolvedGroups = [];
    const groupMemberIds = new Set();
    for (const groupId of refIds) {
      const group = requestedGroups.get(groupId);
      if (!group) { unresolvedGroups.push({ id: groupId, status: 'missing' }); continue; }
      if (String(group.status ?? '').toLowerCase() !== 'active') { unresolvedGroups.push({ id: groupId, status: 'inactive', provenance: group.provenance ?? null }); continue; }
      if (!Array.isArray(group.memberStopPointIds)) { unresolvedGroups.push({ id: groupId, status: 'malformed', provenance: group.provenance ?? null }); continue; }
      const qualifiedBy = [...new Set(activeRefs.filter(ref => ref.id === groupId).map(ref => ref.coreStopPointId).filter(Boolean))];
      const directMemberIds = [...new Set(group.memberStopPointIds.map(String).filter(Boolean))];
      directMemberIds.forEach(id => groupMemberIds.add(id));
      groups.push({ ...group, directMemberIds, qualifiedByCoreStopPointIds: qualifiedBy });
    }
    const referenceResult = await referenceStopPointsByIds([...groupMemberIds], { forceRefresh });
    if (!referenceResult.ok) return referenceResult;
    const references = new Map((referenceResult.data ?? []).map(record => [String(record.id), record]));
    const candidateIds = [];
    const malformedReferenceIds = new Set(referenceResult.provenance?.malformedIds ?? []);
    const memberGroups = new Map();
    const invalidMembers = [];
    for (const group of groups) for (const id of group.directMemberIds) {
      const record = references.get(id);
      if (!record) { invalidMembers.push({ id, groupId: group.id, status: malformedReferenceIds.has(id) ? 'malformed-reference' : 'missing' }); continue; }
      const status = String(record.status ?? '').toLowerCase();
      if (status !== 'active') { invalidMembers.push({ id, groupId: group.id, status: status || 'missing-status' }); continue; }
      if ((record.busDomainEligible ?? record.busPreparedEligible) !== true || !['bus', 'bus_coach'].includes(String(record.transportMode ?? '').toLowerCase())) { invalidMembers.push({ id, groupId: group.id, status: 'non-bus' }); continue; }
      if (record.coordinateValid !== true || !Number.isFinite(Number(record.latitude)) || !Number.isFinite(Number(record.longitude))) { invalidMembers.push({ id, groupId: group.id, status: 'malformed-coordinate' }); continue; }
      if (!candidateIds.includes(id)) candidateIds.push(id);
      if (!memberGroups.has(id)) memberGroups.set(id, []);
      memberGroups.get(id).push(group.id);
    }
    const hydratedResult = await preparedStopPointsByIds(candidateIds, { forceRefresh });
    if (!hydratedResult.ok) return hydratedResult;
    const hydrated = new Map((hydratedResult.data ?? []).map(record => [String(record.id), record]));
    for (const id of candidateIds) if (!hydrated.has(id)) {
      for (const groupId of memberGroups.get(id) ?? []) invalidMembers.push({ id, groupId, status: 'unresolved-full-stop-record' });
      memberGroups.delete(id);
    }
    const members = [...memberGroups.entries()].map(([id, groupIds]) => ({ ...hydrated.get(id), groupIds: [...new Set(groupIds)].sort() })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return sourceSuccess({ data: { groups, members, invalidMembers, unresolvedGroups }, warnings: [...new Set([...(referenceResult.warnings ?? []), ...(hydratedResult.warnings ?? [])])], provenance: { source: STOP_SOURCE, stopAreaCompletionAvailable: true, qualifiedGroupCount: groups.length, completedMemberCount: members.length, invalidMemberCount: invalidMembers.length, unresolvedGroupCount: unresolvedGroups.length, referenceStopPointProvenance: referenceResult.provenance, preparedStopPointProvenance: hydratedResult.provenance } });
  }

  return Object.freeze({ id: 'prepared-national-bus-data-v1-v2-compatible', manifest, nearbyStops, servicesForStops, logicalGroupsForStops, localitiesForStops, referenceStopPointsByIds, preparedStopPointsByIds, stopAreaStructureForStops });
}
