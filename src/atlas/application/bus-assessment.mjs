import {
  buildControlledBusWording,
  buildServiceSummaries,
  collectServiceWarnings,
  groupStopsForPresentation,
  selectNearestStopGroup
} from '../domain/bus-service-assessment.mjs';

function routingFor(result, index) { return result?.routes?.[index] ?? Object.freeze({ status: 'unavailable', distanceMetres: null, durationSeconds: null }); }
function hasScheduledEvidence(schedule = {}) { return Object.values(schedule).some(day => Array.isArray(day) && day.length > 0); }
function stopKey(stop) { return String(stop?.id || stop?.sourceId || ''); }
function routePairs(stops) { return new Set((stops ?? []).flatMap(stop => (stop.routes ?? []).map(route => `${route}|${stopKey(stop)}`))); }
function hasServiceForStops(services, stops) {
  const selectedIds = new Set(stops.map(stopKey));
  return (services ?? []).some(service => Object.entries(service.stopSchedules ?? {}).some(([id, schedule]) => selectedIds.has(id) && hasScheduledEvidence(schedule)));
}

function sourceLabel(service) {
  const source = String(service?.timetableSource || service?.source?.provider || '').trim();
  if (/fallback/i.test(source)) return /TNDS/i.test(source) ? 'TNDS fallback' : 'BODS fallback';
  if (/TfL\s*\+\s*BODS/i.test(source)) return 'TfL + BODS supplementary';
  if (/TfL/i.test(source)) return 'TfL';
  if (/TNDS/i.test(source)) return 'TNDS';
  if (/BODS|Bus Open Data/i.test(source)) return 'BODS';
  return source || 'timetable source';
}

function checkedSourceLabels(provenance = {}) {
  const source = String(provenance.source || '');
  return [...new Set([
    /TfL/i.test(source) ? 'TfL' : null,
    /Bus Open Data|BODS/i.test(source) ? 'BODS' : null,
    /Traveline|TNDS/i.test(source) ? 'TNDS' : null
  ].filter(Boolean))];
}

function buildStopTimetableEvidence(stop, services, servicesResult) {
  if (!servicesResult?.ok) return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: 'Timetable source unavailable' });
  const matched = (services ?? []).filter(service => hasScheduledEvidence(service.stopSchedules?.[stopKey(stop)] || {}));
  const labels = [...new Set(matched.map(sourceLabel))];
  if (labels.length) {
    const status = labels.some(label => /fallback/i.test(label)) ? 'FALLBACK' : labels.some(label => /supplementary/i.test(label)) ? 'SUPPLEMENTED' : 'MATCHED';
    return Object.freeze({ status, label: `Matched · ${labels.join(' + ')}`, sources: labels });
  }
  const checked = checkedSourceLabels(servicesResult.provenance);
  if (Number(servicesResult.provenance?.failedRequests || 0) > 0 || servicesResult.provenance?.unavailable === true) return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: 'Timetable source unavailable', sources: checked });
  return Object.freeze({ status: 'NO_CURRENT_MATCH', label: `No current match · ${checked.join('/') || 'timetable sources'} checked`, sources: checked });
}

export function createBusAssessment({ stopDiscovery, timetableData, accessRouting } = {}) {
  if (!stopDiscovery?.nearbyStops || !timetableData?.servicesForStops || !accessRouting?.matrix) throw new Error('Stop discovery, timetable data and access routing are required.');

  async function prepareStops(site, radius, forceRefresh) {
    const stopsResult = await stopDiscovery.nearbyStops(site, { radius, forceRefresh });
    if (!stopsResult.ok) return { stopsResult, enriched: [] };
    const discoveredStops = groupStopsForPresentation(stopsResult.data);
    if (!discoveredStops.length) return { stopsResult, enriched: [] };
    const [walkingResult, cyclingResult] = await Promise.all([
      accessRouting.matrix(site, discoveredStops, 'walk'),
      accessRouting.matrix(site, discoveredStops, 'cycle')
    ]);
    const enriched = discoveredStops.map((stop, index) => Object.freeze({ ...stop, walking: routingFor(walkingResult, index), cycling: routingFor(cyclingResult, index) }));
    return { stopsResult, enriched, walkingResult, cyclingResult };
  }

  async function nearestTimetable(enrichedStops, options, warnings) {
    const remaining = [...enrichedStops];
    let lastResult = null;
    while (remaining.length) {
      const selection = selectNearestStopGroup(remaining);
      if (!selection.ok) return { selectedStops: [], services: [], servicesResult: lastResult, nearestGroup: null, warnings };
      const result = await timetableData.servicesForStops(selection.stops, options);
      lastResult = result;
      if (result.ok && hasServiceForStops(result.data, selection.stops)) {
        return { selectedStops: selection.stops, services: result.data, servicesResult: result, nearestGroup: Object.freeze({ name: selection.groupName, anchorStopId: selection.anchor.id, anchorWalkingDistanceMetres: selection.anchor.walking.distanceMetres, basis: `${selection.basis} Detailed timetable evidence was requested only for this candidate group.` }), warnings };
      }
      const selectedIds = new Set(selection.stops.map(stopKey));
      remaining.splice(0, remaining.length, ...remaining.filter(stop => !selectedIds.has(stopKey(stop))));
    }
    return { selectedStops: [], services: [], servicesResult: lastResult, nearestGroup: null, warnings };
  }

  async function assess(site, { radius = 700, forceRefresh = false, mode = 'full' } = {}) {
    const assessmentMode = mode === 'nearest' ? 'nearest' : 'full';
    let prepared = await prepareStops(site, radius, forceRefresh);
    if (!prepared.stopsResult.ok) return Object.freeze({ ok: false, stage: 'stops', code: prepared.stopsResult.code, message: prepared.stopsResult.message, warnings: prepared.stopsResult.warnings ?? [], stopsResult: prepared.stopsResult, servicesResult: null });
    let enrichedDiscoveredStops = prepared.enriched;
    if (!enrichedDiscoveredStops.length) return Object.freeze({ ok: true, status: 'complete', assessmentMode, discoveredStopCount: 0, scope: { stopCount: 0, routeCount: 0, pairCount: 0 }, stops: [], services: [], serviceSummaries: [], wording: 'No authoritative bus stops were found within the selected discovery radius.', warnings: prepared.stopsResult.warnings, provenance: { stops: { ...prepared.stopsResult.provenance, radiusMetres: Number(radius) } } });

    const commonWarnings = [
      ...(prepared.stopsResult.warnings ?? []),
      ...(prepared.walkingResult?.warnings ?? []),
      ...(prepared.cyclingResult?.warnings ?? [])
    ];
    let selectedStops = enrichedDiscoveredStops;
    let nearestGroup = null;
    let servicesResult;
    let services = [];
    let assessmentWarnings = commonWarnings;
    if (assessmentMode === 'nearest') {
      let nearest = await nearestTimetable(enrichedDiscoveredStops, { forceRefresh, site }, commonWarnings);
      if (!nearest.selectedStops.length && Number(radius) < 2000) {
        const expanded = await prepareStops(site, 2000, forceRefresh);
        if (expanded.stopsResult.ok && expanded.enriched.length) {
          prepared = expanded;
          enrichedDiscoveredStops = expanded.enriched;
          nearest = await nearestTimetable(expanded.enriched, { forceRefresh, site }, [...commonWarnings, 'The selected radius contained no defensible scheduled service within the controlled 2,000 metre nearest-search limit.']);
        }
      }
      assessmentWarnings = nearest.warnings;
      selectedStops = nearest.selectedStops.length ? nearest.selectedStops : enrichedDiscoveredStops;
      servicesResult = nearest.servicesResult;
      services = nearest.services;
      nearestGroup = nearest.nearestGroup;
    } else {
      servicesResult = await timetableData.servicesForStops(enrichedDiscoveredStops, { forceRefresh, site });
      services = servicesResult.ok ? servicesResult.data : [];
    }
    const serviceSummaries = buildServiceSummaries(selectedStops, services);
    const routesByStop = new Map(selectedStops.map(stop => [stopKey(stop), new Set()]));
    for (const service of services) for (const id of Object.keys(service.stopSchedules ?? {})) if (routesByStop.has(id) && service.routeNumber) routesByStop.get(id).add(String(service.routeNumber));
    selectedStops = selectedStops.map(stop => {
      const timetableEvidence = buildStopTimetableEvidence(stop, services, servicesResult);
      return Object.freeze({ ...stop, routes: [...new Set([...(stop.routes ?? []), ...(routesByStop.get(stopKey(stop)) ?? new Set())])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), timetableMatch: (routesByStop.get(stopKey(stop))?.size ?? 0) > 0, timetableEvidence: timetableEvidence.label, timetableEvidenceStatus: timetableEvidence.status, timetableEvidenceSources: timetableEvidence.sources ?? [] });
    });
    const warnings = [...new Set([...(assessmentWarnings ?? commonWarnings), ...(servicesResult?.warnings ?? []), ...collectServiceWarnings(services), ...(!servicesResult?.ok ? ['Timetable information is unavailable. Stop and routed-access results are still shown.'] : []), ...(!prepared.walkingResult?.ok ? ['Walking routes could not be checked. Please try again.'] : []), ...(!prepared.cyclingResult?.ok ? ['Cycling routes could not be checked. Please try again.'] : [])])];
    const routingComplete = selectedStops.every(stop => stop.walking.status === 'routed' && stop.cycling.status === 'routed');
    const timetablesComplete = Boolean(servicesResult?.ok) && Number(servicesResult?.provenance?.unprocessedRequests || 0) === 0 && Number(servicesResult?.provenance?.unresolvedRequests || 0) === 0;
    const status = timetablesComplete && serviceSummaries.length && routingComplete ? 'complete' : 'partial';
    const selectedIds = new Set(selectedStops.map(stopKey));
    const routes = new Set(enrichedDiscoveredStops.flatMap(stop => stop.routes ?? []));
    return Object.freeze({ ok: true, status, assessmentMode, discoveredStopCount: enrichedDiscoveredStops.length, scope: { stopCount: enrichedDiscoveredStops.length, routeCount: routes.size, pairCount: routePairs(enrichedDiscoveredStops).size }, nearestGroup, stops: Object.freeze(selectedStops), services: Object.freeze(services), serviceSummaries: Object.freeze(serviceSummaries), wording: buildControlledBusWording(serviceSummaries, { nearestGroupName: nearestGroup?.name ?? null }), warnings: Object.freeze(warnings), provenance: Object.freeze({ stops: { ...prepared.stopsResult.provenance, radiusMetres: Number(radius) }, timetables: servicesResult?.provenance ?? {}, walking: prepared.walkingResult?.provenance ?? {}, cycling: prepared.cyclingResult?.provenance ?? {} }), evidence: Object.freeze((prepared.stopsResult.evidence ?? []).filter(item => assessmentMode === 'full' || selectedIds.has(item?.subject?.id))) });
  }

  async function inspectScope(site, { radius = 700, forceRefresh = false } = {}) {
    const prepared = await prepareStops(site, radius, forceRefresh);
    if (!prepared.stopsResult.ok) return Object.freeze({ ok: false, code: prepared.stopsResult.code, message: prepared.stopsResult.message, warnings: prepared.stopsResult.warnings ?? [] });
    const routes = new Set(prepared.enriched.flatMap(stop => stop.routes ?? []));
    return Object.freeze({ ok: true, scope: Object.freeze({ stopCount: prepared.enriched.length, routeCount: routes.size, pairCount: routePairs(prepared.enriched).size }), warnings: prepared.stopsResult.warnings ?? [] });
  }

  return Object.freeze({ id: 'atlas-bus-assessment-v1', assess, inspectScope });
}
