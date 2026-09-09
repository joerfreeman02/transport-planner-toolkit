import { isGreaterLondonPoint } from '../domain/geography.mjs';
import { sourceFailure, sourceSuccess } from './source-adapter.mjs';

const text = value => String(value ?? '').trim();
const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const textFields = Object.freeze(['operator', 'origin', 'destination', 'direction']);
const conflictWarning = 'TfL and the supplementary national timetable source contain conflicting information for one or more London services. ATLAS retained the TfL scheduled information and flagged the difference for planner review.';
const fallbackWarning = 'TfL scheduled timetable information was unavailable, so matching national evidence was used as an explicit supplementary fallback. This is not a TfL timetable result.';
const partialWarning = 'TfL scheduled timetable information could not be checked for one or more services. ATLAS retained available authoritative results and used matching national timetable evidence where available. Review the affected service evidence before formal use.';
const incompleteWarning = 'TfL scheduled timetable information could not be checked for one or more services, and no defensible national fallback was available. ATLAS did not assume zero service; review the incomplete evidence before formal use.';
const unprocessedWarning = 'Some detailed route/StopPoint timetable requests were not processed within the explicitly bounded assessment scope. The assessment is partial; unprocessed services were not treated as zero service.';
const crossBoundaryWarning = 'TfL timetable authority was used only for returned TfL StopPoint records outside the Greater London boundary; national evidence remains supplementary or fallback evidence for other selected stops.';

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

function stagedRequests(stops) {
  return [...new Map(stops.flatMap(stop => (stop.routes ?? []).map(line => {
    const lineId = text(line), stopPointId = stopKey(stop);
    return lineId && stopPointId ? [`${lineId}|${stopPointId}`, { lineId, stopPointId, stop }] : [];
  })).sort(([, left], [, right]) => compareStops(left.stop, right.stop) || left.lineId.localeCompare(right.lineId, 'en-GB', { numeric: true }))).values()];
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function isTnds(service) { return /^tnds:/i.test(text(service?.id)) || /TNDS|Traveline National Dataset/i.test(text(service?.timetableSource || service?.source?.provider || service?.source?.schema || service?.source?.type)); }
function isBods(service) { return !isTnds(service); }

function matchNationalRequest(lineId, stopPointId, nationalServices) {
  const candidates = (nationalServices ?? []).filter(service => normal(service.routeNumber) === normal(lineId) && Object.prototype.hasOwnProperty.call(service.stopSchedules ?? {}, stopPointId));
  for (const type of ['BODS', 'TNDS']) {
    const typed = candidates.filter(service => type === 'BODS' ? isBods(service) : isTnds(service));
    if (typed.length === 1) return typed[0];
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function matchBods(tfl, bods) {
  const candidates = (bods ?? []).filter(service => normal(service.routeNumber) === normal(tfl.routeNumber) && Object.keys(service.stopSchedules ?? {}).some(id => Object.keys(tfl.stopSchedules ?? {}).includes(id)));
  if (!candidates.length) return null;
  const sameDirection = candidates.filter(service => normal(service.direction || service.destination || service.origin) === normal(tfl.direction || tfl.destination || tfl.origin));
  return sameDirection.length === 1 ? sameDirection[0] : candidates.length === 1 ? candidates[0] : null;
}

function serviceIdentity(service) {
  return {
    route: normal(service?.routeNumber),
    direction: normal(service?.direction || service?.destination || service?.origin),
    origin: normal(service?.origin),
    destination: normal(service?.destination)
  };
}

function sameServiceIdentity(left, right) {
  const leftIdentity = serviceIdentity(left), rightIdentity = serviceIdentity(right);
  if (!leftIdentity.route || leftIdentity.route !== rightIdentity.route) return false;
  if (leftIdentity.origin && leftIdentity.destination && rightIdentity.origin && rightIdentity.destination) return leftIdentity.origin === rightIdentity.origin && leftIdentity.destination === rightIdentity.destination && (!leftIdentity.direction || !rightIdentity.direction || leftIdentity.direction === rightIdentity.direction);
  return Boolean(matchBods(left, [right]));
}

function hasScheduledServiceAt(service, stopIds) {
  return Object.entries(service?.stopSchedules ?? {}).some(([stopId, schedule]) => stopIds.has(stopId) && Object.values(schedule ?? {}).some(day => Array.isArray(day) && day.length));
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

function fallbackService(service, request) {
  const provider = isTnds(service) ? 'TNDS' : 'BODS';
  return { ...service, timetableSource: `${provider} fallback after TfL failure`, source: { ...(service.source ?? {}), provider, fallbackFor: 'TfL scheduled timetable', requestedLineId: request.lineId, requestedStopPointId: request.stopPointId } };
}

export function createAuthoritativeBusTimetableAdapter({ tflAdapter, nationalAdapter, londonSupplementAdapter = nationalAdapter, londonCoverage = isGreaterLondonPoint, requestLimit = 20 } = {}) {
  if (!tflAdapter?.servicesForStop || !nationalAdapter?.servicesForStops || !londonSupplementAdapter?.servicesForStops) throw new Error('TfL, national and London supplementary timetable adapters are required.');

  async function servicesForStops(stops, options = {}) {
    if (!stops?.length) return sourceSuccess({ data: [], warnings: [], provenance: { source: 'TfL scheduled timetable authority', authority: 'TfL', requestCount: 0, processedRequests: 0, unprocessedRequests: 0 } });
    const site = options.site ?? stops[0];
    const insideLondon = londonCoverage(site);
    const tflStops = insideLondon ? stops : stops.filter(isTfLStop);
    if (!insideLondon && !tflStops.length) return nationalAdapter.servicesForStops(stops, options);
    const nationalStops = insideLondon ? stops : stops.filter(stop => !isTfLStop(stop) || isDualAuthorityStop(stop));
    const national = await (insideLondon ? londonSupplementAdapter : (nationalStops.length ? nationalAdapter : { ok: true, data: [], warnings: [], provenance: { source: 'National timetable authority', requestCount: 0 } })).servicesForStops(nationalStops.length ? nationalStops : stops, options);
    const nationalServices = national.ok ? national.data ?? [] : [];
    const bods = nationalServices.filter(isBods);
    const requests = stagedRequests(tflStops);
    const stageSize = Math.max(1, Number(requestLimit) || 20);
    const maximumRequests = Number.isInteger(Number(options.maxRequests)) && Number(options.maxRequests) >= 0 ? Number(options.maxRequests) : requests.length;
    const processedRequests = requests.slice(0, maximumRequests);
    const unprocessed = requests.slice(maximumRequests);
    const warnings = [...new Set([...(national.ok ? national.warnings ?? [] : []), ...(insideLondon ? [] : [crossBoundaryWarning]), ...(unprocessed.length ? [unprocessedWarning] : [])])];
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
    const services = successful.flatMap(entry => entry.result.data ?? []);
    const fallbackServices = failed.flatMap(({ result, request }) => {
      if (result.ok || !request) return [];
      const fallback = matchNationalRequest(request.lineId, request.stopPointId, nationalServices);
      return fallback ? [fallbackService(fallback, request)] : [];
    });
    const unresolvedFailure = failed.some(({ request }) => !matchNationalRequest(request?.lineId, request?.stopPointId, nationalServices));
    let conflicts = 0;
    const composed = services.map(service => { const result = supplement(service, bods); if (result.conflict) conflicts += 1; return result.service; });
    composed.push(...fallbackServices);
    if (!insideLondon) {
      const nationalOnlyStopIds = new Set(stops.filter(stop => !isTfLStop(stop)).map(stopKey));
      const fallbackIds = new Set(fallbackServices.map(service => text(service.id)));
      composed.push(...nationalServices.filter(service => hasScheduledServiceAt(service, nationalOnlyStopIds)
        && !fallbackIds.has(text(service.id))
        && !services.some(tfl => sameServiceIdentity(tfl, service))));
    }
    if (conflicts) warnings.push(conflictWarning);
    if (failed.length && (fallbackServices.length || unresolvedFailure)) warnings.push(partialWarning);
    if (unresolvedFailure) warnings.push(incompleteWarning);
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
      unresolvedRequests: failed.filter(({ request }) => !matchNationalRequest(request?.lineId, request?.stopPointId, nationalServices)).length,
      realtimeArrivalsUsed: false, anonymousRequest: true, apiKeyEmbedded: false
    };
    if (!successful.length && !fallbackServices.length) return sourceFailure({ code: results[0]?.code || 'unavailable_source', message: 'TfL scheduled timetable information could not be checked. No London zero-service conclusion has been assumed.', warnings, provenance });
    return sourceSuccess({ data: composed, warnings, provenance });
  }
  return Object.freeze({ id: 'authoritative-bus-timetable-v1', servicesForStops });
}
