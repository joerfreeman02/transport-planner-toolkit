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
    let servicesResult = await timetableData.servicesForStops(enrichedDiscoveredStops, { forceRefresh });
    let services = servicesResult.ok ? servicesResult.data : [];
    if (assessmentMode === 'nearest') {
      let servedIds = new Set(services.flatMap(service => Object.keys(service.stopSchedules ?? {})));
      if (!servedIds.size && Number(radius) < 2000) {
        const expanded = await stopDiscovery.nearbyStops(site, { radius: 2000, forceRefresh });
        if (expanded.ok && expanded.data?.length) {
          const expandedStops = groupStopsForPresentation(expanded.data);
          const [expandedWalk, expandedCycle] = await Promise.all([accessRouting.matrix(site, expandedStops, 'walk'), accessRouting.matrix(site, expandedStops, 'cycle')]);
          const enrichedExpanded = expandedStops.map((stop, index) => Object.freeze({ ...stop, walking: routingFor(expandedWalk, index), cycling: routingFor(expandedCycle, index) }));
          const expandedServicesResult = await timetableData.servicesForStops(enrichedExpanded, { forceRefresh });
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
          stops: Object.freeze(enrichedDiscoveredStops),
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
