import { isGreaterLondonPoint } from '../domain/geography.mjs';

function normaliseRouteAuthorities(stop, authority = '') {
  const result = new Map();
  const explicit = stop?.routeAuthorities && typeof stop.routeAuthorities === 'object' ? stop.routeAuthorities : {};
  for (const [route, authorities] of Object.entries(explicit)) {
    const key = String(route).trim();
    if (!key) continue;
    const values = Array.isArray(authorities) ? authorities : [authorities];
    result.set(key, new Set(values.map(value => String(value).trim()).filter(Boolean)));
  }
  const hasExplicitRouteAuthorities = Object.prototype.hasOwnProperty.call(stop ?? {}, 'routeAuthorities');
  const fallback = String(authority || stop?.timetableAuthority || '').trim();
  if (!hasExplicitRouteAuthorities && fallback) for (const route of stop?.routes ?? []) {
    const key = String(route).trim();
    if (!key) continue;
    if (!result.has(key)) result.set(key, new Set());
    result.get(key).add(fallback);
  }
  return Object.fromEntries([...result.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([route, authorities]) => [route, [...authorities].sort()]));
}

function mergeRouteAuthorities(...stops) {
  const merged = new Map();
  for (const stop of stops) {
    for (const [route, authorities] of Object.entries(normaliseRouteAuthorities(stop))) {
      if (!merged.has(route)) merged.set(route, new Set());
      for (const authority of authorities) merged.get(route).add(authority);
    }
  }
  return Object.fromEntries([...merged.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([route, authorities]) => [route, [...authorities].sort()]));
}

export function createBusStopDiscovery({ tflAdapter, naptanAdapter, londonCoverage = isGreaterLondonPoint, crossBoundaryTfL = false } = {}) {
  if (!tflAdapter?.nearbyStops || !naptanAdapter?.nearbyStops) throw new Error('TfL and NaPTAN bus-stop adapters are required.');

  async function nearbyStops(site, options = {}) {
    const insideLondon = londonCoverage(site);
    const provider = insideLondon ? tflAdapter : naptanAdapter;
    let result = await provider.nearbyStops(site, options);
    if (!insideLondon && crossBoundaryTfL) {
      const [nationalResult, tflResult] = await Promise.allSettled([
        Promise.resolve(result),
        tflAdapter.nearbyStops(site, options)
      ]);
      const national = nationalResult.status === 'fulfilled' ? nationalResult.value : null;
      const tfl = tflResult.status === 'fulfilled' ? tflResult.value : null;
      const usable = [national, tfl].filter(candidate => candidate?.ok);
      if (usable.length) {
        const combined = usable.flatMap(candidate => candidate.data ?? []);
        const mergedStops = new Map();
        for (const stop of combined) {
          const id = String(stop.id || stop.sourceId || '').trim();
          if (!id) continue;
          const authority = String(stop.timetableAuthority || '').trim();
          const existing = mergedStops.get(id);
          if (!existing) {
            mergedStops.set(id, {
              ...stop,
              sourceId: stop.sourceId || id,
              sourceAuthorities: authority ? [authority] : [],
              timetableAuthorities: authority ? [authority] : [],
              routes: [...new Set(stop.routes ?? [])],
              routeAuthorities: normaliseRouteAuthorities(stop, authority)
            });
            continue;
          }
          const authorities = [...new Set([...(existing.sourceAuthorities ?? []), ...(authority ? [authority] : [])])].sort();
          const timetableAuthorities = [...new Set([...(existing.timetableAuthorities ?? []), ...(authority ? [authority] : [])])].sort();
          const prefersTfL = timetableAuthorities.includes('TfL');
          mergedStops.set(id, {
            ...existing,
            ...stop,
            id,
            name: existing.name || stop.name,
            latitude: Number.isFinite(Number(existing.latitude)) ? existing.latitude : stop.latitude,
            longitude: Number.isFinite(Number(existing.longitude)) ? existing.longitude : stop.longitude,
            distanceMetres: Math.min(Number(existing.distanceMetres) || Number.POSITIVE_INFINITY, Number(stop.distanceMetres) || Number.POSITIVE_INFINITY),
            sourceAuthorities: authorities,
            timetableAuthorities,
            timetableAuthority: prefersTfL ? 'TfL' : (timetableAuthorities[0] || existing.timetableAuthority || null),
            routes: [...new Set([...(existing.routes ?? []), ...(stop.routes ?? [])])].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
            routeAuthorities: mergeRouteAuthorities(existing, stop)
          });
        }
        const data = [...mergedStops.values()].sort((a, b) => Number(a.distanceMetres) - Number(b.distanceMetres) || String(a.id).localeCompare(String(b.id)));
        result = {
          ok: true,
          status: 'complete',
          data,
          evidence: usable.flatMap(candidate => candidate.evidence ?? []),
          warnings: [...new Set(usable.flatMap(candidate => candidate.warnings ?? [])), ...(tfl?.ok ? ['TfL StopPoint records were checked at this confirmed point outside the Greater London boundary; TfL timetable authority is limited to the returned StopPoint records.'] : ['TfL StopPoint records were unavailable; national stop and timetable evidence remains the only checked source.'])],
          provenance: {
            source: 'NaPTAN with source-aware TfL cross-boundary check',
            retrievedAt: national?.provenance?.retrievedAt || tfl?.provenance?.retrievedAt || null,
            providerSelectedBy: 'Confirmed point checked against the official Greater London boundary and returned source-specific StopPoint records',
            providerAdapter: 'prepared-naptan-bus-stop-v1 + tfl-bus-stop-v1',
            national: national?.provenance ?? null,
            tfl: tfl?.provenance ?? null,
            crossBoundaryTfL: Boolean(tfl?.ok)
          }
        };
      }
    }
    if (!result?.provenance) return result;
    return Object.freeze({
      ...result,
      provenance: Object.freeze({
        ...result.provenance,
        providerSelectedBy: 'Confirmed assessment point checked against the official Greater London boundary',
        providerAdapter: result.provenance.providerAdapter || provider.id
      })
    });
  }

  return Object.freeze({ id: 'authoritative-bus-stop-discovery-v1', nearbyStops });
}
