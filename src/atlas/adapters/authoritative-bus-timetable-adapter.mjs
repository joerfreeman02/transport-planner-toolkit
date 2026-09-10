import { isGreaterLondonPoint } from '../domain/geography.mjs';
import { deriveTimetableConclusion, hasScheduledEvidenceAt, scheduledStopIds, scopedScheduledService } from '../domain/scheduled-evidence.mjs';
import { timetableProviderLabelsFromText } from '../domain/bus-source-presentation.mjs';
import { sourceFailure, sourceSuccess } from './source-adapter.mjs';

const text = value => String(value ?? '').trim();
const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const textFields = Object.freeze(['operator', 'origin', 'destination', 'direction']);
const conflictWarning = 'TfL and the supplementary national timetable source contain conflicting information for one or more London services. ATLAS retained the TfL scheduled information and flagged the difference for planner review.';
const fallbackWarning = 'TfL scheduled timetable information was unavailable, so matching national evidence was used as an explicit supplementary fallback. This is not a TfL timetable result.';
const partialWarning = 'TfL scheduled timetable information could not be checked for one or more services. ATLAS retained available authoritative results and used matching national timetable evidence where available. Review the affected service evidence before formal use.';
const incompleteWarning = 'TfL scheduled timetable information could not be checked for one or more services, and no defensible national fallback was available. ATLAS did not assume zero service; review the incomplete evidence before formal use.';
const unprocessedWarning = 'Some detailed route/StopPoint timetable requests were not processed within the explicitly bounded assessment scope. The assessment is partial; unprocessed services were not treated as zero service.';
const crossBoundaryWarning = 'TfL timetable authority was used only for returned TfL StopPoint records outside the Greater London boundary; national-authority routes remain national-primary, while national evidence may supplement or explicitly fall back for TfL records.';
const nationalUnavailableWarning = 'National BODS/TNDS timetable evidence was unavailable for one or more selected national-authority routes. ATLAS retained available TfL evidence but did not assume zero national service.';

function isTfLStop(stop) { return normal(stop?.timetableAuthority) === 'tfl' || (stop?.timetableAuthorities ?? []).some(authority => normal(authority) === 'tfl'); }
function isDualAuthorityStop(stop) {
  const authorities = new Set((stop?.timetableAuthorities ?? []).map(normal).filter(Boolean));
  return authorities.has('tfl') && authorities.has('naptan');
}
function stopKey(stop) { return String(stop?.id || stop?.sourceId || ''); }
function stopRank(stop) {
  const walking = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number.POSITIVE_INFINITY;
  const distance = Number(stop?.distanceMetres);
  return [Number.isFinite(walking) ? walking : Number.POSITIVE_INFINITY, Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY, stopKey(stop)];
}
function compareStops(left, right) { const a = stopRank(left), b = stopRank(right); return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]); }

function routeAuthorities(stop, route) {
  const hasExplicitAuthorities = stop?.routeAuthorities && typeof stop.routeAuthorities === 'object';
  const explicit = hasExplicitAuthorities ? (stop.routeAuthorities[route] ?? stop.routeAuthorities[String(route)]) : null;
  if (Array.isArray(explicit)) return explicit.map(normal);
  if (explicit) return [normal(explicit)];
  if (hasExplicitAuthorities) return [];
  return (stop?.timetableAuthorities ?? [stop?.timetableAuthority]).map(normal).filter(Boolean);
}

function stagedRequests(stops, { insideLondon = false } = {}) {
  const entries = stops.flatMap(stop => (stop.routes ?? []).map(line => {
    const lineId = text(line), stopPointId = stopKey(stop);
    if (!insideLondon && !routeAuthorities(stop, lineId).includes('tfl')) return [];
    return lineId && stopPointId ? [`${lineId}|${stopPointId}`, { lineId, stopPointId, stop }] : [];
  })).filter(entry => Array.isArray(entry) && entry.length === 2);
  return [...new Map(entries.sort(([, left], [, right]) => compareStops(left.stop, right.stop) || left.lineId.localeCompare(right.lineId, 'en-GB', { numeric: true }))).values()];
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function isTnds(service) { return /^tnds:/i.test(text(service?.id)) || /TNDS|Traveline National Dataset/i.test(text(service?.timetableSource || service?.source?.provider || service?.source?.schema || service?.source?.type)); }
function isBods(service) { return !isTnds(service); }

function matchNationalRequest(lineId, stopPointId, nationalServices) {
  const candidates = (nationalServices ?? []).filter(service => normal(service.routeNumber) === normal(lineId) && hasScheduledEvidenceAt(service, stopPointId));
  for (const type of ['BODS', 'TNDS']) {
    const typed = candidates.filter(service => type === 'BODS' ? isBods(service) : isTnds(service));
    if (typed.length === 1) return typed[0];
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function requestIdentity(request) { return request?.lineId && request?.stopPointId ? `${request.lineId}|${request.stopPointId}` : null; }

function matchBods(tfl, bods) {
  const tflStopIds = scheduledStopIds(tfl);
  const candidates = (bods ?? []).filter(service => normal(service.routeNumber) === normal(tfl.routeNumber) && tflStopIds.some(id => hasScheduledEvidenceAt(service, id)));
  if (!candidates.length) return null;
  const sameDirection = candidates.filter(service => normal(service.direction || service.destination || service.origin) === normal(tfl.direction || tfl.destination || tfl.origin));
  return sameDirection.length === 1 ? sameDirection[0] : candidates.length === 1 ? candidates[0] : null;
}

function serviceIdentity(service) {
  return {
    route: normal(service?.routeNumber),
    operator: normal(service?.operator),
    direction: normal(service?.direction || service?.destination || service?.origin),
    origin: normal(service?.origin),
    destination: normal(service?.destination)
  };
}

function sameServiceIdentity(left, right) {
  const leftIdentity = serviceIdentity(left), rightIdentity = serviceIdentity(right);
  if (!leftIdentity.route || leftIdentity.route !== rightIdentity.route) return false;
  if (leftIdentity.operator && rightIdentity.operator && leftIdentity.operator !== rightIdentity.operator) return false;
  if (leftIdentity.origin && leftIdentity.destination && rightIdentity.origin && rightIdentity.destination) return leftIdentity.origin === rightIdentity.origin && leftIdentity.destination === rightIdentity.destination && (!leftIdentity.direction || !rightIdentity.direction || leftIdentity.direction === rightIdentity.direction);
  return Boolean(matchBods(left, [right]));
}

function nationalRoutesForStop(stop) {
  if (stop?.routeAuthorities && typeof stop.routeAuthorities === 'object') {
    return Object.entries(stop.routeAuthorities)
      .filter(([, authorities]) => (Array.isArray(authorities) ? authorities : [authorities]).some(authority => normal(authority) !== 'tfl'))
      .map(([route]) => text(route))
      .filter(Boolean);
  }
  return isTfLStop(stop) ? [] : (stop?.routes ?? []).map(text).filter(Boolean);
}

function sameText(left, right) { return normal(left) === normal(right); }
function sameSequence(left, right) { return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameText(value, right[index])); }

function supplement(tfl, bods) {
  const match = matchBods(tfl, bods);
  if (!match) return { service: tfl, matched: false, conflict: false };
  let supplemented = false, conflict = false;
  const service = { ...tfl };
  for (const field of textFields) {
    const tfValue = service[field], bodsValue = match[field];
    const tfEmpty = Array.isArray(tfValue) ? tfValue.length === 0 : !text(tfValue);
    const bodsEmpty = Array.isArray(bodsValue) ? bodsValue.length === 0 : !text(bodsValue);
    if (tfEmpty && !bodsEmpty) { service[field] = Array.isArray(bodsValue) ? [...bodsValue] : bodsValue; supplemented = true; }
    else if (!tfEmpty && !bodsEmpty && !sameText(tfValue, bodsValue)) conflict = true;
  }
  if ((!Array.isArray(service.principalLocations) || !service.principalLocations.length) && Array.isArray(match.principalLocations) && match.principalLocations.length) { service.principalLocations = [...match.principalLocations]; supplemented = true; }
  else if (service.principalLocations?.length && match.principalLocations?.length && !sameSequence(service.principalLocations, match.principalLocations)) conflict = true;
  if ((!Array.isArray(service.routePatternStopIds) || !service.routePatternStopIds.length) && Array.isArray(match.routePatternStopIds) && match.routePatternStopIds.length) { service.routePatternStopIds = [...match.routePatternStopIds]; supplemented = true; }
  else if (service.routePatternStopIds?.length && match.routePatternStopIds?.length && !sameSequence(service.routePatternStopIds, match.routePatternStopIds)) conflict = true;
  service.timetableSource = supplemented ? 'TfL + BODS supplementary' : 'TfL';
  service.source = { ...service.source, supplementaryProvider: supplemented ? 'BODS' : null };
  return { service, matched: true, conflict };
}

function fallbackService(service, request, reason = 'failure') {
  const provider = isTnds(service) ? 'TNDS' : 'BODS';
  const fallbackReason = reason === 'unresolved' ? 'TfL unresolved timetable result' : 'TfL scheduled timetable failure';
  const sourceLabel = reason === 'unresolved' ? 'TfL unresolved' : 'TfL failure';
  return {
    ...scopedScheduledService(service, [request.stopPointId]),
    timetableSource: `${provider} fallback after ${sourceLabel}`,
    source: {
      ...(service.source ?? {}), provider, fallbackFor: fallbackReason,
      fallbackSourceId: service.id, requestedLineId: request.lineId, requestedStopPointId: request.stopPointId
    }
  };
}

function scopeNationalResult(result, stops) {
  if (!result?.ok) return result;
  const selectedStopIds = new Set((stops ?? []).map(stopKey));
  const data = (result.data ?? []).map(service => scopedScheduledService(service, selectedStopIds))
    .filter(service => scheduledStopIds(service).length);
  const unresolvedRequestIdentities = [...new Set([
    ...(result.provenance?.unresolvedRequestIdentities ?? []),
    ...(result.provenance?.nationalUnresolvedRequestIdentities ?? [])
  ])].map(String);
  const explicit = result.timetableConclusion || result.provenance?.timetableConclusion;
  const timetableConclusion = deriveTimetableConclusion({
    hasScheduledService: data.length > 0,
    explicitNoCurrentMatch: explicit === 'NO_CURRENT_MATCH',
    unresolvedRequestIdentities,
    unprocessedRequestIdentities: result.provenance?.unprocessedRequestIdentities ?? [],
    unprocessedRequests: result.provenance?.unprocessedRequests,
    nationalSourceAvailable: result.provenance?.nationalSourceAvailable,
    nationalUnresolvedRoutes: result.provenance?.nationalUnresolvedRoutes ?? [],
    failedRequests: result.provenance?.failedRequests,
    unavailable: result.provenance?.unavailable === true,
    semanticUnresolved: explicit === 'UNRESOLVED',
    quarantine: Boolean(result.provenance?.quarantine || result.provenance?.quarantinedRequestIdentities?.length)
  });
  return sourceSuccess({
    ...result,
    data,
    provenance: {
      ...(result.provenance ?? {}),
      unresolvedRequestIdentities,
      nationalUnresolvedRequestIdentities: unresolvedRequestIdentities,
      timetableConclusion,
      tflTimetableAttempted: false,
      nationalTimetableAttempted: true,
      nationalSupplementaryAttempted: false,
      nationalEvidenceRequired: true,
      nationalEvidenceNotRequired: false,
      nationalTimetableStopIds: [...selectedStopIds],
      tflTimetableRequestIdentities: [],
      nationalTimetableProviders: timetableProviderLabelsFromText(result.provenance?.source)
    }
  });
}

function nationalCoverageAfterAuthority(service, tflServices, fallbackServices, nationalStopIds) {
  const candidateStopIds = scheduledStopIds(service).filter(stopId => nationalStopIds.has(stopId));
  const fallbackSourceId = text(service.id);
  const retainedStopIds = candidateStopIds.filter(stopId => {
    const usedAsFallback = fallbackServices.some(fallback => text(fallback.source?.fallbackSourceId) === fallbackSourceId && hasScheduledEvidenceAt(fallback, stopId));
    if (usedAsFallback) return false;
    return !(tflServices ?? []).some(tfl => sameServiceIdentity(tfl, service) && hasScheduledEvidenceAt(tfl, stopId));
  });
  return retainedStopIds.length ? scopedScheduledService(service, retainedStopIds) : null;
}

export function createAuthoritativeBusTimetableAdapter({ tflAdapter, nationalAdapter, londonSupplementAdapter = nationalAdapter, londonCoverage = isGreaterLondonPoint, requestLimit = 20 } = {}) {
  if (!tflAdapter?.servicesForStop || !nationalAdapter?.servicesForStops || !londonSupplementAdapter?.servicesForStops) throw new Error('TfL, national and London supplementary timetable adapters are required.');

  async function servicesForStops(stops, options = {}) {
    if (!stops?.length) return sourceSuccess({ data: [], warnings: [], provenance: { source: 'TfL scheduled timetable authority', authority: 'TfL', requestCount: 0, processedRequests: 0, unprocessedRequests: 0, timetableConclusion: 'NO_CURRENT_MATCH', tflTimetableAttempted: false, nationalTimetableAttempted: false, nationalSupplementaryAttempted: false, nationalEvidenceRequired: false, nationalEvidenceNotRequired: true, nationalTimetableStopIds: [], tflTimetableRequestIdentities: [], nationalTimetableProviders: [] } });
    const site = options.site ?? stops[0];
    const insideLondon = londonCoverage(site);
    const tflStops = insideLondon ? stops : stops.filter(isTfLStop);
    if (!insideLondon && !tflStops.length) return scopeNationalResult(await nationalAdapter.servicesForStops(stops, options), stops);
    const nationalStops = insideLondon ? stops : stops.filter(stop => !isTfLStop(stop) || isDualAuthorityStop(stop));
    const nationalEvidenceRequired = !insideLondon && nationalStops.length > 0;
    const national = nationalEvidenceRequired || insideLondon
      ? await (insideLondon ? londonSupplementAdapter : nationalAdapter).servicesForStops(nationalStops.length ? nationalStops : stops, options)
      : sourceSuccess({ data: [], warnings: [], provenance: { source: 'National timetable authority not required for the selected TfL-only scope', authority: 'not-required', nationalEvidenceRequired: false, nationalEvidenceNotRequired: true, nationalSourceAvailable: true, timetableConclusion: 'NO_CURRENT_MATCH', tflTimetableAttempted: false, nationalTimetableAttempted: false, nationalSupplementaryAttempted: false, nationalTimetableStopIds: [], nationalTimetableProviders: [] } });
    const nationalServices = national.ok ? national.data ?? [] : [];
    const bods = nationalServices.filter(isBods);
    const requests = stagedRequests(tflStops, { insideLondon });
    const stageSize = Math.max(1, Number(requestLimit) || 20);
    const maximumRequests = Number.isInteger(Number(options.maxRequests)) && Number(options.maxRequests) >= 0 ? Number(options.maxRequests) : requests.length;
    const processedRequests = requests.slice(0, maximumRequests);
    const unprocessed = requests.slice(maximumRequests);
    const nationalRequired = nationalEvidenceRequired;
    const nationalSourceAvailable = !nationalRequired || Boolean(national.ok);
    const nationalUnresolvedRoutes = nationalSourceAvailable ? [] : [...new Set(nationalStops.flatMap(nationalRoutesForStop))].sort((left, right) => left.localeCompare(right, 'en-GB', { numeric: true }));
    const warnings = [...new Set([...(national.warnings ?? []), ...(insideLondon ? [] : [crossBoundaryWarning]), ...(nationalSourceAvailable ? [] : [nationalUnavailableWarning]), ...(unprocessed.length ? [unprocessedWarning] : [])])];
    const routeMetadata = tflAdapter.routeMetadataForLines && processedRequests.length
      ? await tflAdapter.routeMetadataForLines([...new Set(processedRequests.map(request => request.lineId))], { forceRefresh: options.forceRefresh })
      : null;
    const stageResults = [];
    for (const [stageIndex, stage] of chunks(processedRequests, stageSize).entries()) {
      const results = [];
      for (const request of stage) results.push(await tflAdapter.servicesForStop({ lineId: request.lineId, stopPointId: request.stopPointId, forceRefresh: options.forceRefresh, routeMetadata }));
      stageResults.push({ stageIndex, stage, results, routeMetadata });
    }
    const resultEntries = stageResults.flatMap(stage => stage.results.map((result, index) => ({ result, request: stage.stage[index] })));
    const results = resultEntries.map(entry => entry.result);
    const successful = resultEntries.filter(entry => entry.result.ok);
    const failed = resultEntries.filter(entry => !entry.result.ok);
    const actualTfLServices = entry => (entry.result?.data ?? [])
      .filter(service => normal(service.routeNumber) === normal(entry.request?.lineId) && hasScheduledEvidenceAt(service, entry.request?.stopPointId))
      .map(service => scopedScheduledService(service, [entry.request.stopPointId]));
    const unresolvedObserved = resultEntries.filter(({ result, request }) => {
      if (!result?.ok) return true;
      if (result.provenance?.timetableConclusion === 'UNRESOLVED') return true;
      if (result.provenance?.timetableConclusion === 'NO_CURRENT_MATCH') return false;
      return !actualTfLServices({ result, request }).length;
    });
    const services = successful.flatMap(entry => actualTfLServices(entry));
    const unresolvedEntries = unresolvedObserved.filter(({ request }) => !matchNationalRequest(request?.lineId, request?.stopPointId, nationalServices));
    const tflUnresolvedRequestIdentities = unresolvedEntries.map(({ request }) => requestIdentity(request)).filter(Boolean);
    const noCurrentRequestIdentities = resultEntries
      .filter(({ result }) => result?.ok && (result.timetableConclusion || result.provenance?.timetableConclusion) === 'NO_CURRENT_MATCH')
      .map(({ request }) => requestIdentity(request))
      .filter(Boolean);
    const rawNationalUnresolvedRequestIdentities = [...new Set([
      ...(national.provenance?.unresolvedRequestIdentities ?? []),
      ...(national.provenance?.nationalUnresolvedRequestIdentities ?? [])
    ])].map(String);
    const fallbackServices = unresolvedObserved.flatMap(({ result, request }) => {
      if (!request) return [];
      const fallback = matchNationalRequest(request.lineId, request.stopPointId, nationalServices);
      const unresolved = Boolean(result?.ok) && result?.provenance?.timetableConclusion === 'UNRESOLVED';
      return fallback ? [fallbackService(fallback, request, unresolved ? 'unresolved' : 'failure')] : [];
    });
    const nationalUnresolvedRequestIdentities = rawNationalUnresolvedRequestIdentities.filter(identity => !fallbackServices.some(fallback => `${fallback.source?.requestedLineId}|${fallback.source?.requestedStopPointId}` === identity));
    const unresolvedRequestIdentities = [...new Set([...tflUnresolvedRequestIdentities, ...nationalUnresolvedRequestIdentities])];
    let conflicts = 0;
    const composed = services.map(service => { const result = supplement(service, bods); if (result.conflict) conflicts += 1; return result.service; });
    composed.push(...fallbackServices);
    if (!insideLondon) {
      const nationalOnlyStopIds = new Set(nationalStops.map(stopKey));
      for (const service of nationalServices) {
        const retained = nationalCoverageAfterAuthority(service, services, fallbackServices, nationalOnlyStopIds);
        if (retained) composed.push(retained);
      }
    }
    if (conflicts) warnings.push(conflictWarning);
    if (unresolvedObserved.length && (fallbackServices.length || unresolvedEntries.length)) warnings.push(partialWarning);
    if (unresolvedEntries.length || nationalUnresolvedRequestIdentities.length) warnings.push(incompleteWarning);
    if (!nationalSourceAvailable) warnings.push(nationalUnavailableWarning);
    if (fallbackServices.length) warnings.push(fallbackWarning);
    if (unprocessed.length) warnings.push(`Unprocessed timetable scope: ${unprocessed.map(request => `${request.lineId}/${request.stopPointId}`).join(', ')}.`);
    const routeMetadataRequests = routeMetadata && routeMetadata.cache?.status !== 'hit' ? 1 : 0;
    const provenance = {
      source: insideLondon ? 'TfL scheduled timetable authority; BODS/TNDS controlled supplementary evidence' : 'TfL StopPoint authority with national BODS/TNDS evidence',
      authority: 'TfL', crossBoundaryTfL: !insideLondon, requestCount: requests.length, detailedRequests: results.length,
      requestLimit: stageSize, requestStages: stageResults.length, selectedStage: null, unrequestedRequests: unprocessed.length,
      processedRequests: processedRequests.length, unprocessedRequests: unprocessed.length, processedRequestIdentities: processedRequests.map(request => `${request.lineId}|${request.stopPointId}`),
      unprocessedRequestIdentities: unprocessed.map(request => `${request.lineId}|${request.stopPointId}`), timetableRequests: results.length,
      routeMetadataRequests, totalTfLRequests: results.length + routeMetadataRequests, successfulRequests: successful.length, failedRequests: failed.length,
      unresolvedRequests: unresolvedRequestIdentities.length, unresolvedRequestIdentities,
      noCurrentRequestIdentities: [...new Set(noCurrentRequestIdentities)],
      nationalUnresolvedRequestIdentities,
      nationalSourceAvailable,
      nationalUnresolvedRoutes,
      tflTimetableAttempted: processedRequests.length > 0,
      nationalTimetableAttempted: nationalRequired,
      nationalSupplementaryAttempted: insideLondon,
      nationalTimetableStopIds: nationalStops.map(stopKey),
      tflTimetableRequestIdentities: processedRequests.map(request => requestIdentity(request)),
      nationalTimetableProviders: timetableProviderLabelsFromText(national.provenance?.source),
      realtimeArrivalsUsed: false, anonymousRequest: true, apiKeyEmbedded: false
    };
    const nationalConclusion = national.timetableConclusion || national.provenance?.timetableConclusion;
    const tflNoCurrent = requests.length === noCurrentRequestIdentities.length
      && noCurrentRequestIdentities.length > 0
      && unresolvedObserved.length === 0
      && failed.length === 0
      && unprocessed.length === 0;
    const nationalNoCurrent = !nationalRequired
      || (national.ok && nationalConclusion === 'NO_CURRENT_MATCH' && rawNationalUnresolvedRequestIdentities.length === 0);
    provenance.nationalEvidenceRequired = nationalRequired;
    provenance.nationalEvidenceNotRequired = !nationalRequired;
    provenance.nationalTimetableConclusion = nationalConclusion || null;
    provenance.timetableConclusion = deriveTimetableConclusion({
      hasScheduledService: composed.length > 0,
      explicitNoCurrentMatch: tflNoCurrent && nationalNoCurrent,
      unresolvedRequestIdentities,
      unprocessedRequestIdentities: provenance.unprocessedRequestIdentities,
      unprocessedRequests: unprocessed.length,
      nationalSourceAvailable,
      nationalUnresolvedRoutes,
      failedRequests: failed.length,
      unavailable: failed.length > 0 || !nationalSourceAvailable,
      semanticUnresolved: unresolvedEntries.length > 0 || nationalConclusion === 'UNRESOLVED',
      quarantine: Boolean(national.provenance?.quarantine || national.provenance?.quarantinedRequestIdentities?.length)
    });
    if (!composed.length && provenance.timetableConclusion === 'UNRESOLVED') {
      const candidateCode = results[0]?.code || (!nationalSourceAvailable ? national?.code : null);
      const code = ['timeout', 'http_failure', 'invalid_response', 'unavailable_source', 'invalid_request', 'coverage_not_implemented'].includes(candidateCode) ? candidateCode : 'unavailable_source';
      return sourceFailure({ code, message: 'TfL scheduled timetable information could not be checked. No London zero-service conclusion has been assumed.', warnings, provenance });
    }
    return sourceSuccess({ data: composed, warnings, provenance });
  }
  return Object.freeze({ id: 'authoritative-bus-timetable-v1', servicesForStops });
}
