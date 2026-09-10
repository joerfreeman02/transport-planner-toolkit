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

function unavailableSourceResult(source, error = null) {
  const label = source === 'TfL' ? 'TfL StopPoint' : 'NaPTAN';
  return {
    ok: false,
    code: 'unavailable_source',
    message: `${label} bus-stop discovery was unavailable.`,
    data: null,
    evidence: [],
    warnings: [`${label} bus-stop discovery was unavailable; stop coverage is incomplete.`],
    provenance: { source: label, unavailable: true, technicalErrorType: error ? String(error?.name || 'source_rejected') : null }
  };
}

function settledSource(settled, source) {
  return settled.status === 'fulfilled' ? (settled.value ?? unavailableSourceResult(source)) : unavailableSourceResult(source, settled.reason);
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
      const national = settledSource(nationalResult, 'NaPTAN');
      const tfl = settledSource(tflResult, 'TfL');
      const nationalAvailable = Boolean(national?.ok);
      const tflAvailable = Boolean(tfl?.ok);
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
          status: nationalAvailable && tflAvailable ? 'complete' : 'partial',
          data,
          evidence: usable.flatMap(candidate => candidate.evidence ?? []),
          warnings: [...new Set([
            ...[national, tfl].flatMap(candidate => candidate.warnings ?? []),
            ...(nationalAvailable && tflAvailable ? [] : ['Cross-boundary stop coverage is incomplete because one required stop source was unavailable.']),
            ...(tflAvailable ? ['TfL StopPoint records were checked at this confirmed point outside the Greater London boundary; TfL timetable authority is limited to the returned StopPoint records.'] : []),
            ...(!tflAvailable ? ['TfL StopPoint records were unavailable; cross-boundary TfL stop coverage could not be checked.'] : []),
            ...(!nationalAvailable ? ['NaPTAN stop records were unavailable; national stop coverage could not be checked.'] : [])
          ])],
          provenance: {
            source: 'NaPTAN with source-aware TfL cross-boundary check',
            retrievedAt: national?.provenance?.retrievedAt || tfl?.provenance?.retrievedAt || null,
            providerSelectedBy: 'Confirmed point checked against the official Greater London boundary and returned source-specific StopPoint records',
            providerAdapter: 'prepared-naptan-bus-stop-v1 + tfl-bus-stop-v1',
            national: national?.provenance ?? null,
            tfl: tfl?.provenance ?? null,
            crossBoundaryTfL: tflAvailable,
            crossBoundaryTfLAttempted: true,
            nationalStopSourceAvailable: nationalAvailable,
            tflStopSourceAvailable: tflAvailable,
            stopCoverageComplete: nationalAvailable && tflAvailable
          }
        };
      } else {
        return {
          ok: false,
          code: national.code || tfl.code || 'unavailable_source',
          message: 'Required bus-stop sources could not be checked. Stop coverage is unavailable.',
          data: null,
          evidence: [],
          warnings: [...new Set([...(national.warnings ?? []), ...(tfl.warnings ?? []), 'Required national and TfL stop sources were unavailable; no authoritative zero-stop conclusion can be made.'])],
          provenance: {
            source: 'NaPTAN with source-aware TfL cross-boundary check',
            national: national.provenance ?? null,
            tfl: tfl.provenance ?? null,
            crossBoundaryTfL: false,
            crossBoundaryTfLAttempted: true,
            nationalStopSourceAvailable: false,
            tflStopSourceAvailable: false,
            stopCoverageComplete: false
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
        providerAdapter: result.provenance.providerAdapter || provider.id,
        nationalStopSourceAvailable: result.provenance.nationalStopSourceAvailable ?? (insideLondon ? null : Boolean(result.ok)),
        tflStopSourceAvailable: result.provenance.tflStopSourceAvailable ?? (insideLondon ? Boolean(result.ok) : null),
        stopCoverageComplete: result.provenance.stopCoverageComplete ?? Boolean(result.ok)
      })
    });
  }

  return Object.freeze({ id: 'authoritative-bus-stop-discovery-v1', nearbyStops });
}
