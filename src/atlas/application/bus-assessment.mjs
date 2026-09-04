import { buildControlledBusWording, buildServiceSummaries, groupStopsForPresentation } from '../domain/bus-service-assessment.mjs';

function routingFor(result, index) {
  return result?.routes?.[index] ?? Object.freeze({ status: 'unavailable', distanceMetres: null, durationSeconds: null });
}

export function createBusAssessment({ stopDiscovery, timetableData, accessRouting } = {}) {
  if (!stopDiscovery?.nearbyStops || !timetableData?.servicesForStops || !accessRouting?.matrix) throw new Error('Stop discovery, timetable data and access routing are required.');

  async function assess(site, { radius = 700, forceRefresh = false } = {}) {
    const stopsResult = await stopDiscovery.nearbyStops(site, { radius, forceRefresh });
    if (!stopsResult.ok) return Object.freeze({ ok: false, stage: 'stops', code: stopsResult.code, message: stopsResult.message, warnings: stopsResult.warnings ?? [], stopsResult, servicesResult: null });
    const stops = groupStopsForPresentation(stopsResult.data);
    if (!stops.length) return Object.freeze({ ok: true, status: 'complete', stops: [], services: [], serviceSummaries: [], wording: 'No authoritative bus stops were found within the selected discovery radius.', warnings: stopsResult.warnings, provenance: { stops: stopsResult.provenance } });

    const [servicesResult, walkingResult, cyclingResult] = await Promise.all([
      timetableData.servicesForStops(stops, { forceRefresh }),
      accessRouting.matrix(site, stops, 'walk'),
      accessRouting.matrix(site, stops, 'cycle')
    ]);
    const enrichedStops = stops.map((stop, index) => Object.freeze({ ...stop, walking: routingFor(walkingResult, index), cycling: routingFor(cyclingResult, index) }));
    const services = servicesResult.ok ? servicesResult.data : [];
    const serviceSummaries = buildServiceSummaries(enrichedStops, services);
    const warnings = [...new Set([
      ...(stopsResult.warnings ?? []),
      ...(servicesResult.warnings ?? []),
      ...(walkingResult.warnings ?? []),
      ...(cyclingResult.warnings ?? []),
      ...(!servicesResult.ok ? ['Timetable information is unavailable. Stop and routed-access results are still shown.'] : []),
      ...(!walkingResult.ok ? ['Walking routes could not be checked. Please try again.'] : []),
      ...(!cyclingResult.ok ? ['Cycling routes could not be checked. Please try again.'] : [])
    ])];
    const routingComplete = enrichedStops.every(stop => stop.walking.status === 'routed' && stop.cycling.status === 'routed');
    const status = servicesResult.ok && serviceSummaries.length && routingComplete ? 'complete' : 'partial';
    return Object.freeze({
      ok: true,
      status,
      stops: Object.freeze(enrichedStops),
      services: Object.freeze(services),
      serviceSummaries: Object.freeze(serviceSummaries),
      wording: buildControlledBusWording(serviceSummaries),
      warnings: Object.freeze(warnings),
      provenance: Object.freeze({ stops: stopsResult.provenance, timetables: servicesResult.provenance, walking: walkingResult.provenance, cycling: cyclingResult.provenance }),
      evidence: Object.freeze(stopsResult.evidence ?? [])
    });
  }

  return Object.freeze({ id: 'atlas-bus-assessment-v1', assess });
}
