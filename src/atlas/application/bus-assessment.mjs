import {
  buildControlledBusWording,
  buildServiceSummaries,
  collectServiceWarnings,
  groupStopsForPresentation,
  selectNearestStopGroup
} from '../domain/bus-service-assessment.mjs';

function routingFor(result, index) {
  return result?.routes?.[index] ?? Object.freeze({ status: 'unavailable', distanceMetres: null, durationSeconds: null });
}

function hasScheduledEvidence(schedule = {}) { return Object.values(schedule).some(day => Array.isArray(day) && day.length > 0); }

function sourceLabel(service) {
  const source = String(service?.timetableSource || service?.source?.provider || '').trim();
  if (/fallback/i.test(source)) return 'BODS fallback';
  if (/TfL\s*\+\s*BODS/i.test(source)) return 'TfL + BODS supplementary';
  if (/TfL/i.test(source)) return 'TfL';
  if (/TNDS/i.test(source)) return 'TNDS';
  if (/BODS|Bus Open Data/i.test(source)) return 'BODS';
  return source || 'timetable source';
}

function checkedSourceLabels(provenance = {}) {
  const source = String(provenance.source || '');
  const labels = [];
  if (/TfL/i.test(source)) labels.push('TfL');
  if (/Bus Open Data|BODS/i.test(source)) labels.push('BODS');
  if (/Traveline|TNDS/i.test(source)) labels.push('TNDS');
  return [...new Set(labels)];
}

function buildStopTimetableEvidence(stop, services, servicesResult) {
  if (!servicesResult?.ok) return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: 'Timetable source unavailable' });
  const stopId = String(stop.id || stop.sourceId || '');
  const matched = (services ?? []).filter(service => hasScheduledEvidence(service.stopSchedules?.[stopId] || {}));
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

  async function assess(site, { radius = 700, forceRefresh = false, mode = 'full' } = {}) {
    const assessmentMode = mode === 'nearest' ? 'nearest' : 'full';
    const stopsResult = await stopDiscovery.nearbyStops(site, { radius, forceRefresh });
    if (!stopsResult.ok) return Object.freeze({ ok: false, stage: 'stops', code: stopsResult.code, message: stopsResult.message, warnings: stopsResult.warnings ?? [], stopsResult, servicesResult: null });

    const discoveredStops = groupStopsForPresentation(stopsResult.data);
    if (!discoveredStops.length) return Object.freeze({
      ok: true,
      status: 'complete',
      assessmentMode,
      discoveredStopCount: 0,
      stops: [],
      services: [],
      serviceSummaries: [],
      wording: 'No authoritative bus stops were found within the selected discovery radius.',
      warnings: stopsResult.warnings,
      provenance: { stops: stopsResult.provenance }
    });

    const [walkingResult, cyclingResult] = await Promise.all([
      accessRouting.matrix(site, discoveredStops, 'walk'),
      accessRouting.matrix(site, discoveredStops, 'cycle')
    ]);
    const enrichedDiscoveredStops = discoveredStops.map((stop, index) => Object.freeze({
      ...stop,
      walking: routingFor(walkingResult, index),
      cycling: routingFor(cyclingResult, index)
    }));

    let selectedStops = enrichedDiscoveredStops;
    let nearestGroup = null;
    let servicesResult = await timetableData.servicesForStops(enrichedDiscoveredStops, { forceRefresh, site });
    let services = servicesResult.ok ? servicesResult.data : [];
    if (assessmentMode === 'nearest') {
      let servedIds = new Set(services.flatMap(service => Object.keys(service.stopSchedules ?? {})));
      if (!servedIds.size && Number(radius) < 2000) {
        const expanded = await stopDiscovery.nearbyStops(site, { radius: 2000, forceRefresh });
        if (expanded.ok && expanded.data?.length) {
          const expandedStops = groupStopsForPresentation(expanded.data);
          const [expandedWalk, expandedCycle] = await Promise.all([accessRouting.matrix(site, expandedStops, 'walk'), accessRouting.matrix(site, expandedStops, 'cycle')]);
          const enrichedExpanded = expandedStops.map((stop, index) => Object.freeze({ ...stop, walking: routingFor(expandedWalk, index), cycling: routingFor(expandedCycle, index) }));
          const expandedServicesResult = await timetableData.servicesForStops(enrichedExpanded, { forceRefresh, site });
          if (expandedServicesResult.ok) { servicesResult = expandedServicesResult; services = expandedServicesResult.data; servedIds = new Set(services.flatMap(service => Object.keys(service.stopSchedules ?? {}))); }
          if (servedIds.size) enrichedDiscoveredStops.splice(0, enrichedDiscoveredStops.length, ...enrichedExpanded);
        }
      }
      const servedStops = enrichedDiscoveredStops.filter(stop => servedIds.has(String(stop.id || stop.sourceId)));
      const selection = selectNearestStopGroup(servedStops);
      if (!selection.ok) {
        const warnings = [...new Set([
          ...(stopsResult.warnings ?? []),
          ...(walkingResult.warnings ?? []),
          ...(cyclingResult.warnings ?? []),
          'No matched scheduled bus service was found within the controlled 2,000 metre nearest-search limit. Service beyond 2,000 metres was not assessed.'
        ])];
        return Object.freeze({
          ok: true,
          status: 'partial',
          assessmentMode,
          discoveredStopCount: enrichedDiscoveredStops.length,
          nearestGroup: null,
          stops: Object.freeze(enrichedDiscoveredStops.map(stop => Object.freeze({ ...stop, timetableMatch: false, timetableEvidence: 'Timetable source unavailable', timetableEvidenceStatus: 'SOURCE_UNAVAILABLE' }))),
          services: Object.freeze([]),
          serviceSummaries: Object.freeze([]),
          wording: buildControlledBusWording([]),
          warnings: Object.freeze(warnings),
          provenance: Object.freeze({ stops: stopsResult.provenance, timetables: servicesResult.provenance, walking: walkingResult.provenance, cycling: cyclingResult.provenance }),
          evidence: Object.freeze(stopsResult.evidence ?? [])
        });
      }
      selectedStops = selection.stops;
      nearestGroup = Object.freeze({
        name: selection.groupName,
        anchorStopId: selection.anchor.id,
        anchorWalkingDistanceMetres: selection.anchor.walking.distanceMetres,
        basis: selection.basis
      });
    }
    if (assessmentMode === 'nearest') {
      const selectedIds = new Set(selectedStops.map(stop => String(stop.id || stop.sourceId)));
      services = services.filter(service => Object.keys(service.stopSchedules ?? {}).some(id => selectedIds.has(id)));
    }
    const serviceSummaries = buildServiceSummaries(selectedStops, services);
    const routesByStop = new Map(selectedStops.map(stop => [String(stop.id || stop.sourceId), new Set()]));
    for (const service of services) {
      for (const stopId of Object.keys(service.stopSchedules ?? {})) {
        if (routesByStop.has(stopId) && service.routeNumber) routesByStop.get(stopId).add(String(service.routeNumber));
      }
    }
    selectedStops = selectedStops.map(stop => {
      const timetableEvidence = buildStopTimetableEvidence(stop, services, servicesResult);
      return Object.freeze({
      ...stop,
      routes: [...new Set([...(stop.routes ?? []), ...(routesByStop.get(String(stop.id || stop.sourceId)) ?? new Set())])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      timetableMatch: (routesByStop.get(String(stop.id || stop.sourceId))?.size ?? 0) > 0,
      timetableEvidence: timetableEvidence.label,
      timetableEvidenceStatus: timetableEvidence.status,
      timetableEvidenceSources: timetableEvidence.sources ?? []
      });
    });
    const warnings = [...new Set([
      ...(stopsResult.warnings ?? []),
      ...(servicesResult.warnings ?? []),
      ...(walkingResult.warnings ?? []),
      ...(cyclingResult.warnings ?? []),
      ...collectServiceWarnings(services),
      ...(!servicesResult.ok ? ['Timetable information is unavailable. Stop and routed-access results are still shown.'] : []),
      ...(!walkingResult.ok ? ['Walking routes could not be checked. Please try again.'] : []),
      ...(!cyclingResult.ok ? ['Cycling routes could not be checked. Please try again.'] : [])
    ])];

    const routingComplete = selectedStops.every(stop => stop.walking.status === 'routed' && stop.cycling.status === 'routed');
    const status = servicesResult.ok && serviceSummaries.length && routingComplete ? 'complete' : 'partial';
    const selectedIds = new Set(selectedStops.map(stop => stop.id));

    return Object.freeze({
      ok: true,
      status,
      assessmentMode,
      discoveredStopCount: enrichedDiscoveredStops.length,
      nearestGroup,
      stops: Object.freeze(selectedStops),
      services: Object.freeze(services),
      serviceSummaries: Object.freeze(serviceSummaries),
      wording: buildControlledBusWording(serviceSummaries, { nearestGroupName: nearestGroup?.name ?? null }),
      warnings: Object.freeze(warnings),
      provenance: Object.freeze({
        stops: stopsResult.provenance,
        timetables: servicesResult.provenance,
        walking: walkingResult.provenance,
        cycling: cyclingResult.provenance
      }),
      evidence: Object.freeze((stopsResult.evidence ?? []).filter(item => assessmentMode === 'full' || selectedIds.has(item?.subject?.id)))
    });
  }

  return Object.freeze({ id: 'atlas-bus-assessment-v1', assess });
}
