import { createEvidence } from '../domain/evidence.mjs';
import { isConfirmedSite } from '../domain/site.mjs';
import { requestJson } from '../infrastructure/http-client.mjs';
import { runCachedSourceQuery, sourceFailure, sourceSuccess } from './source-adapter.mjs';
import { createTflRequestScheduler } from './tfl-request-scheduler.mjs';

const SOURCE_NAME = 'Transport for London Unified API';
const ATTRIBUTION = 'Data provided by Transport for London';

export function distanceMetres(from, to) {
  const radians = degrees => degrees * Math.PI / 180;
  const earthRadius = 6371008.8;
  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const deltaLat = radians(to.latitude - from.latitude);
  const deltaLon = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function createTflBusStopAdapter({
  fetchImpl = globalThis.fetch,
  cache,
  clock = () => new Date(),
  timeoutMs = 12000,
  baseUrl = 'https://api.tfl.gov.uk',
  requestScheduler = createTflRequestScheduler()
} = {}) {
  async function nearbyStops(site, { radius = 700, forceRefresh = false } = {}) {
    const provenance = { source: SOURCE_NAME, authoritativeFor: 'TfL stop-point records', endpoint: `${baseUrl}/StopPoint`, retrievedAt: null };
    if (!isConfirmedSite(site)) return sourceFailure({ code: 'invalid_request', message: 'Confirm a valid Site before requesting nearby stops.', provenance });
    const numericRadius = Number(radius);
    if (!Number.isFinite(numericRadius) || numericRadius < 100 || numericRadius > 2000) return sourceFailure({ code: 'invalid_request', message: 'Search radius must be between 100 and 2,000 metres.', provenance });

    const url = new URL('/StopPoint', baseUrl);
    url.searchParams.set('stopTypes', 'NaptanPublicBusCoachTram');
    url.searchParams.set('radius', String(Math.round(numericRadius)));
    url.searchParams.set('useStopPointHierarchy', 'false');
    url.searchParams.set('modes', 'bus');
    url.searchParams.set('categories', 'none');
    url.searchParams.set('returnLines', 'true');
    url.searchParams.set('lat', String(site.latitude));
    url.searchParams.set('lon', String(site.longitude));
    const endpoint = url.toString();
    const cacheKey = `tfl-stops:${site.latitude.toFixed(6)}:${site.longitude.toFixed(6)}:${Math.round(numericRadius)}`;

    return runCachedSourceQuery({ cache, cacheKey, freshForMs: 5 * 60 * 1000, forceRefresh, load: async () => {
      const response = await requestScheduler.schedule('stop-point-discovery', () => requestJson({ url: endpoint, fetchImpl, timeoutMs }));
      if (!response.ok) return sourceFailure({ code: response.code, message: response.message, status: response.status, provenance: { ...provenance, endpoint } });
      if (!response.data || !Array.isArray(response.data.stopPoints)) return sourceFailure({ code: 'invalid_response', message: 'TfL response did not contain a stopPoints array.', provenance: { ...provenance, endpoint } });

      const retrievedAt = clock().toISOString();
      const warnings = [];
      const records = new Map();
      let invalidCount = 0;
      let duplicateCount = 0;

      for (const raw of response.data.stopPoints) {
        const id = String(raw?.id ?? raw?.naptanId ?? '').trim();
        const name = String(raw?.commonName ?? '').trim();
        const latitude = Number(raw?.lat);
        const longitude = Number(raw?.lon);
        if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          invalidCount += 1;
          continue;
        }
        if (records.has(id)) {
          duplicateCount += 1;
          continue;
        }
        const distance = distanceMetres(site, { latitude, longitude });
        const routes = [...new Set((Array.isArray(raw.lines) ? raw.lines : [])
          .map(line => String(line?.name ?? line?.id ?? '').trim())
          .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true }));
        records.set(id, {
          id,
          naptanCode: String(raw?.naptanId ?? id).trim() || id,
          name,
          indicator: String(raw.indicator ?? raw.stopLetter ?? '').trim() || null,
          direction: String(raw?.towards ?? '').trim() || null,
          latitude,
          longitude,
          stopType: String(raw.stopType ?? '').trim() || null,
          sourceId: id,
          timetableAuthority: 'TfL',
          routes,
          distanceMetres: distance
        });
      }

      if (response.data.stopPoints.length && !records.size) return sourceFailure({ code: 'invalid_response', message: 'TfL returned stop records, but none contained the required identity, name and coordinates.', provenance: { ...provenance, endpoint, retrievedAt } });
      if (invalidCount) warnings.push(`${invalidCount} incomplete TfL stop record(s) were excluded.`);
      if (duplicateCount) warnings.push(`${duplicateCount} duplicate TfL stop record(s) were de-duplicated by stop identifier.`);
      if (!records.size) warnings.push('TfL returned no bus stops for the confirmed Site and radius.');
      warnings.push('TfL did not provide a source dataset timestamp/version in this response.');

      const validUntil = new Date(clock().getTime() + 5 * 60 * 1000).toISOString();
      const stops = [...records.values()].sort((a, b) => a.distanceMetres - b.distanceMetres || a.id.localeCompare(b.id));
      const evidence = stops.map(stop => createEvidence({
        subject: { entityType: 'bus-stop', id: stop.id, name: stop.name },
        evidenceType: 'bus.stop.nearby',
        value: stop,
        units: 'metres',
        source: { name: SOURCE_NAME, authoritative: true, recordIdentifier: stop.id, endpoint, attribution: ATTRIBUTION },
        retrievedAt,
        calculationMethodology: 'Straight-line distance calculated using the WGS84 haversine formula from the confirmed Site coordinate to the TfL stop coordinate; rounded to the nearest metre.',
        validationStatus: 'validated',
        confidenceStatus: 'authoritative',
        warnings: ['TfL response did not include a source dataset timestamp/version.'],
        freshness: { status: 'live-current', assessedAt: retrievedAt, validUntil },
        cache: { status: 'miss', key: cacheKey }
      }));

      return sourceSuccess({
        data: stops,
        evidence,
        warnings,
        provenance: { ...provenance, endpoint, retrievedAt, httpStatus: response.status, resultCount: stops.length, serviceDiscovery: 'available-from-stop-records', anonymousRequest: true, apiKeyEmbedded: false }
      });
    }});
  }

  return Object.freeze({ id: 'tfl-bus-stop-v1', nearbyStops });
}
