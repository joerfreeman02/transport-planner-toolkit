import {
  buildControlledBusWording,
  buildServiceSummaries,
  collectServiceWarnings,
  groupStopsForPresentation,
  selectNearestStopGroup
} from '../domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries } from '../domain/bus-planner-summary.mjs';
import { DEFAULT_TFL_REQUEST_LIMIT } from '../adapters/tfl-request-scheduler.mjs';
import { deriveTimetableConclusion, hasScheduledEvidence } from '../domain/scheduled-evidence.mjs';
import { buildStopTimetableSourcePresentation } from '../domain/bus-source-presentation.mjs';

export const TFL_REQUEST_WINDOW_LIMIT = DEFAULT_TFL_REQUEST_LIMIT;
export const TFL_ASSESSMENT_FIXED_REQUESTS = 2;
export const TFL_SAFE_DETAILED_PAIR_LIMIT = TFL_REQUEST_WINDOW_LIMIT - TFL_ASSESSMENT_FIXED_REQUESTS;

function routingFor(result, index) { return result?.routes?.[index] ?? Object.freeze({ status: 'unavailable', distanceMetres: null, durationSeconds: null }); }
function stopKey(stop) { return String(stop?.id || stop?.sourceId || ''); }
function routePairs(stops) { return new Set((stops ?? []).flatMap(stop => (stop.routes ?? []).map(route => `${route}|${stopKey(stop)}`))); }
function hasServiceForStops(services, stops) {
  const selectedIds = new Set(stops.map(stopKey));
  return (services ?? []).some(service => Object.entries(service.stopSchedules ?? {}).some(([id, schedule]) => selectedIds.has(id) && hasScheduledEvidence(schedule)));
}

function routeAuthorities(stop, route) {
  const explicit = stop?.routeAuthorities && typeof stop.routeAuthorities === 'object' ? stop.routeAuthorities[route] : null;
  if (Array.isArray(explicit)) return explicit.map(value => String(value).trim().toLowerCase());
  if (explicit) return [String(explicit).trim().toLowerCase()];
  if (stop?.routeAuthorities && typeof stop.routeAuthorities === 'object') return [];
  return (stop?.timetableAuthorities ?? [stop?.timetableAuthority]).map(value => String(value ?? '').trim().toLowerCase()).filter(Boolean);
}

function requiresNationalEvidence(stop) {
  if (stop?.routeAuthorities && typeof stop.routeAuthorities === 'object') {
    return Object.keys(stop.routeAuthorities).some(route => routeAuthorities(stop, route).some(authority => authority !== 'tfl'));
  }
  return routeAuthorities(stop, '').some(authority => authority !== 'tfl') || !routeAuthorities(stop, '').length;
}

function nationalEvidenceUnavailableForStop(stop, provenance = {}) {
  const unresolvedRoutes = new Set((provenance.nationalUnresolvedRoutes ?? []).map(route => String(route)));
  const nationalUnavailable = provenance.nationalSourceAvailable === false;
  if (!nationalUnavailable && !unresolvedRoutes.size) return false;
  if (stop?.routeAuthorities && typeof stop.routeAuthorities === 'object') {
    return Object.keys(stop.routeAuthorities).some(route => (unresolvedRoutes.has(String(route)) || nationalUnavailable) && routeAuthorities(stop, route).some(authority => authority !== 'tfl'));
  }
  return requiresNationalEvidence(stop);
}

function incompleteTimetableIdentitiesForStop(stop, provenance = {}) {
  const identitySuffix = `|${stopKey(stop)}`;
  return [...new Set([
    ...(provenance.unresolvedRequestIdentities ?? []),
    ...(provenance.nationalUnresolvedRequestIdentities ?? []),
    ...(provenance.unprocessedRequestIdentities ?? []),
    ...(provenance.quarantinedRequestIdentities ?? [])
  ].map(String).filter(identity => identity.endsWith(identitySuffix)))];
}

function hasNoCurrentTimetableConclusionForStop(stop, provenance = {}) {
  const identitySuffix = `|${stopKey(stop)}`;
  return (provenance.noCurrentRequestIdentities ?? []).map(String).some(identity => identity.endsWith(identitySuffix));
}

function timetableConclusion(result, selection) {
  const explicit = result?.timetableConclusion || result?.provenance?.timetableConclusion;
  const provenance = result?.provenance ?? {};
  return deriveTimetableConclusion({
    hasScheduledService: hasServiceForStops(result?.data, selection.stops),
    explicitNoCurrentMatch: explicit === 'NO_CURRENT_MATCH',
    unresolvedRequestIdentities: [
      ...(provenance.unresolvedRequestIdentities ?? []),
      ...(provenance.nationalUnresolvedRequestIdentities ?? [])
    ],
    unprocessedRequestIdentities: provenance.unprocessedRequestIdentities ?? [],
    unprocessedRequests: provenance.unprocessedRequests,
    nationalSourceAvailable: provenance.nationalSourceAvailable,
    nationalUnresolvedRoutes: provenance.nationalUnresolvedRoutes ?? [],
    failedRequests: provenance.failedRequests,
    unavailable: !result?.ok || provenance.unavailable === true,
    semanticUnresolved: explicit === 'UNRESOLVED',
    quarantine: Boolean(provenance.quarantine || provenance.quarantinedRequestIdentities?.length)
  });
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

function checkedSourceLabels(stop, provenance = {}, services = []) {
  return buildStopTimetableSourcePresentation(stop, provenance, services).checked;
}

function buildStopTimetableEvidence(stop, services, servicesResult) {
  const provenance = servicesResult?.provenance ?? {};
  const incompleteIdentities = incompleteTimetableIdentitiesForStop(stop, provenance);
  const incompleteCount = incompleteIdentities.length;
  const incompleteLabel = `timetable evidence unresolved or incomplete for ${incompleteCount} route${incompleteCount === 1 ? '' : 's'}`;
  const matched = (services ?? []).filter(service => hasScheduledEvidence(service.stopSchedules?.[stopKey(stop)] || {}));
  const labels = [...new Set(matched.map(sourceLabel))];
  const nationalIncomplete = nationalEvidenceUnavailableForStop(stop, provenance);
  if (labels.length) {
    if (nationalIncomplete) return Object.freeze({ status: 'PARTIAL', label: `Matched · ${labels.join(' + ')} · national timetable source unavailable for required route coverage`, sources: labels });
    if (incompleteCount) return Object.freeze({ status: 'PARTIAL', label: `Matched · ${labels.join(' + ')} · ${incompleteLabel}`, sources: labels });
    const status = labels.some(label => /fallback/i.test(label)) ? 'FALLBACK' : labels.some(label => /supplementary/i.test(label)) ? 'SUPPLEMENTED' : 'MATCHED';
    return Object.freeze({ status, label: `Matched · ${labels.join(' + ')}`, sources: labels });
  }
  const sourcePresentation = buildStopTimetableSourcePresentation(stop, provenance, services);
  const checked = sourcePresentation.checked;
  if (incompleteCount) return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: `Timetable source unavailable · ${incompleteLabel}`, sources: checked });
  if (!servicesResult?.ok && Number(provenance.failedRequests || 0) === 0 && provenance.unavailable !== true && hasNoCurrentTimetableConclusionForStop(stop, provenance)) {
    return Object.freeze({ status: 'NO_CURRENT_MATCH', label: `No current match · ${checked.join('/') || 'timetable sources'} checked`, sources: checked });
  }
  if (!servicesResult?.ok) return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: 'Timetable source unavailable', sources: checked });
  if (Number(provenance.unprocessedRequests || 0) > 0) return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: 'Timetable source unavailable · timetable request scope was incomplete', sources: checked });
  if (Number(provenance.failedRequests || 0) > 0 || provenance.unavailable === true) return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: 'Timetable source unavailable', sources: checked });
  if (nationalIncomplete) return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: 'Timetable source unavailable · required national evidence could not be checked', sources: checked });
  if ((provenance.timetableConclusion || servicesResult?.timetableConclusion) === 'UNRESOLVED') return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: 'Timetable source unavailable · evidence remained unresolved', sources: checked });
  if (((provenance.timetableConclusion || servicesResult?.timetableConclusion) === 'NO_CURRENT_MATCH' && checked.length) || hasNoCurrentTimetableConclusionForStop(stop, provenance)) {
    return Object.freeze({ status: 'NO_CURRENT_MATCH', label: `No current match · ${checked.join('/') || 'timetable sources'} checked`, sources: checked });
  }
  return Object.freeze({ status: 'SOURCE_UNAVAILABLE', label: 'Timetable source unavailable · no scheduled evidence was established', sources: checked });
}

export function createBusAssessment({ stopDiscovery, timetableData, accessRouting } = {}) {
  if (!stopDiscovery?.nearbyStops || !timetableData?.servicesForStops || !accessRouting?.matrix) throw new Error('Stop discovery, timetable data and access routing are required.');

  async function discoverStops(site, radius, forceRefresh, cachedDiscovery = null) {
    if (cachedDiscovery && Number(cachedDiscovery.radiusMetres) === Number(radius) && cachedDiscovery.stopsResult) return cachedDiscovery;
    const stopsResult = await stopDiscovery.nearbyStops(site, { radius, forceRefresh });
    if (!stopsResult.ok) return { stopsResult, discovered: [], radiusMetres: Number(radius) };
    const discoveredStops = groupStopsForPresentation(stopsResult.data);
    return { stopsResult, discovered: discoveredStops, radiusMetres: Number(radius) };
  }

  async function prepareStops(site, radius, forceRefresh, cachedDiscovery = null, onProgress = () => {}) {
    const discovered = await discoverStops(site, radius, forceRefresh, cachedDiscovery);
    if (!discovered.stopsResult.ok) return { stopsResult: discovered.stopsResult, enriched: [] };
    const discoveredStops = discovered.discovered ?? [];
    if (!discoveredStops.length) return { ...discovered, enriched: [] };
    onProgress({ phase: 'routing-stops', completed: 0, total: discoveredStops.length, detail: discoveredStops.length + ' stops' });
    const [walkingResult, cyclingResult] = await Promise.all([
      accessRouting.matrix(site, discoveredStops, 'walk'),
      accessRouting.matrix(site, discoveredStops, 'cycle')
    ]);
    const enriched = discoveredStops.map((stop, index) => Object.freeze({ ...stop, walking: routingFor(walkingResult, index), cycling: routingFor(cyclingResult, index) }));
    onProgress({ phase: 'routing-stops', completed: enriched.length, total: discoveredStops.length });
    return { ...discovered, enriched, walkingResult, cyclingResult };
  }

  async function nearestTimetable(enrichedStops, options, warnings, onProgress = () => {}) {
    const remaining = [...enrichedStops];
    let lastResult = null;
    while (remaining.length) {
      const selection = selectNearestStopGroup(remaining);
      if (!selection.ok) return { selectedStops: [], services: [], servicesResult: lastResult, nearestGroup: null, warnings };
      onProgress({ phase: 'checking-timetables' });
      const result = await timetableData.servicesForStops(selection.stops, options);
      lastResult = result;
      const conclusion = timetableConclusion(result, selection);
      if (conclusion === 'MATCHED') {
        return { selectedStops: selection.stops, services: result.data, servicesResult: result, nearestGroup: Object.freeze({ name: selection.groupName, anchorStopId: selection.anchor.id, anchorWalkingDistanceMetres: selection.anchor.walking.distanceMetres, basis: `${selection.basis} Detailed timetable evidence was requested only for this candidate group.` }), warnings };
      }
      if (conclusion === 'UNRESOLVED') {
        return {
          selectedStops: selection.stops,
          services: result.ok ? (result.data ?? []) : [],
          servicesResult: result,
          nearestGroup: Object.freeze({ name: selection.groupName, anchorStopId: selection.anchor.id, anchorWalkingDistanceMetres: selection.anchor.walking.distanceMetres, conclusion, basis: `${selection.basis} The nearest candidate was retained because timetable evidence was unresolved; a farther group was not substituted.` }),
          warnings: [...new Set([...(warnings ?? []), 'The nearest candidate group was retained because timetable evidence was unavailable or unresolved; ATLAS did not substitute a farther group.'])]
        };
      }
      const selectedIds = new Set(selection.stops.map(stopKey));
      remaining.splice(0, remaining.length, ...remaining.filter(stop => !selectedIds.has(stopKey(stop))));
    }
    return { selectedStops: [], services: [], servicesResult: lastResult, nearestGroup: null, warnings };
  }

  async function assess(site, { radius = 700, forceRefresh = false, mode = 'full', discovery = null, onProgress = () => {} } = {}) {
    const assessmentMode = mode === 'nearest' ? 'nearest' : 'full';
    const selectedRadiusMetres = Number(radius);
    let actualDiscoveryRadiusMetres = selectedRadiusMetres;
    onProgress({ phase: 'finding-stops' });
    let prepared = await prepareStops(site, radius, forceRefresh, discovery, onProgress);
    if (!prepared.stopsResult.ok) {
      onProgress({ phase: 'complete', detail: 'Assessment unavailable' });
      return Object.freeze({ ok: false, stage: 'stops', code: prepared.stopsResult.code, message: prepared.stopsResult.message, warnings: prepared.stopsResult.warnings ?? [], stopsResult: prepared.stopsResult, servicesResult: null });
    }
    let enrichedDiscoveredStops = prepared.enriched;
    if (!enrichedDiscoveredStops.length) {
      const stopCoverageComplete = prepared.stopsResult.provenance?.stopCoverageComplete !== false;
      onProgress({ phase: 'complete' });
      return Object.freeze({
        ok: true,
        status: stopCoverageComplete ? 'complete' : 'partial',
        assessmentMode,
        discoveredStopCount: 0,
        scope: { stopCount: 0, routeCount: 0, pairCount: 0 },
        stops: [],
        services: [],
        serviceSummaries: [],
        plannerServiceSummaries: [],
        wording: stopCoverageComplete
          ? 'No authoritative bus stops were found within the selected discovery radius.'
          : 'No bus stops were returned, but required stop-source coverage was incomplete; ATLAS could not make an authoritative zero-stop conclusion.',
        warnings: [...new Set([...(prepared.stopsResult.warnings ?? []), ...(!stopCoverageComplete ? ['Required stop-source coverage was incomplete; zero returned stops do not establish authoritative zero bus stops.'] : [])])],
        provenance: { stops: { ...prepared.stopsResult.provenance, radiusMetres: actualDiscoveryRadiusMetres, selectedRadiusMetres, actualDiscoveryRadiusMetres } }
      });
    }

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
      let nearest = await nearestTimetable(enrichedDiscoveredStops, { forceRefresh, site }, commonWarnings, onProgress);
      if (!nearest.selectedStops.length && Number(radius) < 2000) {
        const expanded = await prepareStops(site, 2000, forceRefresh, null, onProgress);
        if (expanded.stopsResult.ok) {
          prepared = expanded;
          actualDiscoveryRadiusMetres = 2000;
          enrichedDiscoveredStops = expanded.enriched;
          nearest = await nearestTimetable(expanded.enriched, { forceRefresh, site }, [...commonWarnings, `Nearest search expanded from ${selectedRadiusMetres} m to 2,000 m because no matched scheduled service was established in the initial radius.`]);
        }
      }
      assessmentWarnings = nearest.warnings;
      selectedStops = nearest.selectedStops.length ? nearest.selectedStops : enrichedDiscoveredStops;
      servicesResult = nearest.servicesResult;
      services = nearest.services;
      nearestGroup = nearest.nearestGroup;
    } else {
      onProgress({ phase: 'checking-timetables' });
      servicesResult = await timetableData.servicesForStops(enrichedDiscoveredStops, { forceRefresh, site });
      services = servicesResult.ok ? servicesResult.data : [];
    }
    onProgress({ phase: 'reconciling-evidence' });
    const serviceSummaries = buildServiceSummaries(selectedStops, services);
    onProgress({ phase: 'preparing-assessment' });
    const plannerServiceSummaries = buildPlannerBusServiceSummaries(serviceSummaries, selectedStops);
    const routesByStop = new Map(selectedStops.map(stop => [stopKey(stop), new Set()]));
    for (const service of services) for (const [id, schedule] of Object.entries(service.stopSchedules ?? {})) if (routesByStop.has(id) && service.routeNumber && hasScheduledEvidence(schedule)) routesByStop.get(id).add(String(service.routeNumber));
    selectedStops = selectedStops.map(stop => {
      const timetableEvidence = buildStopTimetableEvidence(stop, services, servicesResult);
      return Object.freeze({ ...stop, routes: [...new Set([...(stop.routes ?? []), ...(routesByStop.get(stopKey(stop)) ?? new Set())])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), timetableMatch: (routesByStop.get(stopKey(stop))?.size ?? 0) > 0, timetableEvidence: timetableEvidence.label, timetableEvidenceStatus: timetableEvidence.status, timetableEvidenceSources: timetableEvidence.sources ?? [] });
    });
    const warnings = [...new Set([...(assessmentWarnings ?? commonWarnings), ...(servicesResult?.warnings ?? []), ...collectServiceWarnings(services), ...(!servicesResult?.ok ? ['Timetable information is unavailable. Stop and routed-access results are still shown.'] : []), ...(!prepared.walkingResult?.ok ? ['Walking routes could not be checked. Please try again.'] : []), ...(!prepared.cyclingResult?.ok ? ['Cycling routes could not be checked. Please try again.'] : [])])];
    const routingComplete = selectedStops.every(stop => stop.walking.status === 'routed' && stop.cycling.status === 'routed');
    const stopCoverageComplete = prepared.stopsResult.provenance?.stopCoverageComplete !== false;
    const nationalEvidenceComplete = servicesResult?.provenance?.nationalSourceAvailable !== false && !(servicesResult?.provenance?.nationalUnresolvedRoutes?.length);
    const unresolvedIdentityCount = new Set([
      ...(servicesResult?.provenance?.unresolvedRequestIdentities ?? []),
      ...(servicesResult?.provenance?.nationalUnresolvedRequestIdentities ?? [])
    ].map(String)).size;
    const timetablesComplete = Boolean(servicesResult?.ok) && nationalEvidenceComplete && Number(servicesResult?.provenance?.unprocessedRequests || 0) === 0 && Math.max(Number(servicesResult?.provenance?.unresolvedRequests || 0), unresolvedIdentityCount) === 0;
    const status = stopCoverageComplete && timetablesComplete && serviceSummaries.length && routingComplete ? 'complete' : 'partial';
    const selectedIds = new Set(selectedStops.map(stopKey));
    const routes = new Set(enrichedDiscoveredStops.flatMap(stop => stop.routes ?? []));
    onProgress({ phase: 'complete' });
    return Object.freeze({ ok: true, status, assessmentMode, discoveredStopCount: enrichedDiscoveredStops.length, scope: { stopCount: enrichedDiscoveredStops.length, routeCount: routes.size, pairCount: routePairs(enrichedDiscoveredStops).size }, nearestGroup, stops: Object.freeze(selectedStops), services: Object.freeze(services), serviceSummaries: Object.freeze(serviceSummaries), plannerServiceSummaries: Object.freeze(plannerServiceSummaries), wording: buildControlledBusWording(plannerServiceSummaries, { nearestGroupName: nearestGroup?.name ?? null }), warnings: Object.freeze(warnings), provenance: Object.freeze({ stops: { ...prepared.stopsResult.provenance, radiusMetres: actualDiscoveryRadiusMetres, selectedRadiusMetres, actualDiscoveryRadiusMetres }, timetables: servicesResult?.provenance ?? {}, walking: prepared.walkingResult?.provenance ?? {}, cycling: prepared.cyclingResult?.provenance ?? {} }), evidence: Object.freeze((prepared.stopsResult.evidence ?? []).filter(item => assessmentMode === 'full' || selectedIds.has(item?.subject?.id))) });
  }

  async function inspectScope(site, { radius = 700, forceRefresh = false } = {}) {
    const discovered = await discoverStops(site, radius, forceRefresh);
    if (!discovered.stopsResult.ok) return Object.freeze({ ok: false, code: discovered.stopsResult.code, message: discovered.stopsResult.message, warnings: discovered.stopsResult.warnings ?? [] });
    const stops = discovered.discovered ?? [];
    const routes = new Set(stops.flatMap(stop => stop.routes ?? []));
    return Object.freeze({ ok: true, scope: Object.freeze({ stopCount: stops.length, routeCount: routes.size, pairCount: routePairs(stops).size }), warnings: discovered.stopsResult.warnings ?? [], discovery: Object.freeze(discovered) });
  }

  return Object.freeze({ id: 'atlas-bus-assessment-v1', assess, inspectScope });
}
