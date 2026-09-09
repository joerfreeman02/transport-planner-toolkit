import { isGreaterLondonPoint } from '../domain/geography.mjs';
import { sourceFailure, sourceSuccess } from './source-adapter.mjs';

const text = value => String(value ?? '').trim();
const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const textFields = Object.freeze(['operator', 'origin', 'destination', 'direction']);
const conflictWarning = 'TfL and the supplementary national timetable source contain conflicting information for one or more London services. ATLAS retained the TfL scheduled information and flagged the difference for planner review.';
const fallbackWarning = 'TfL scheduled timetable information was unavailable, so matching BODS evidence was used as an explicit supplementary fallback. This is not a TfL timetable result.';
const partialWarning = 'TfL scheduled timetable information could not be checked for one or more services. ATLAS retained available authoritative results and used matching national timetable evidence where available. Review the affected service evidence before formal use.';
const incompleteWarning = 'TfL scheduled timetable information could not be checked for one or more services, and no defensible national fallback was available. ATLAS did not assume zero service; review the incomplete evidence before formal use.';
const stagedWarning = 'London timetable requests were staged by deterministic stop and route order. The result is controlled and may be partial; unrequested route/stop pairs were not silently treated as zero service.';
const crossBoundaryWarning = 'TfL timetable authority was used only for returned TfL StopPoint records outside the Greater London boundary; national evidence remains supplementary or fallback evidence for other selected stops.';

function isTfLStop(stop) {
  return String(stop?.timetableAuthority || '').toLowerCase() === 'tfl';
}

function stopKey(stop) { return String(stop?.id || stop?.sourceId || ''); }

function stopRank(stop) {
  const walking = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number.POSITIVE_INFINITY;
  const distance = Number(stop?.distanceMetres);
  return [Number.isFinite(walking) ? walking : Number.POSITIVE_INFINITY, Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY, stopKey(stop)];
}

function compareStops(left, right) {
  const a = stopRank(left), b = stopRank(right);
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
}

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

function matchBods(tfl, bods) {
  const candidates = (bods ?? []).filter(service => normal(service.routeNumber) === normal(tfl.routeNumber) && Object.keys(service.stopSchedules ?? {}).some(id => Object.keys(tfl.stopSchedules ?? {}).includes(id)));
  if (!candidates.length) return null;
  const sameDirection = candidates.filter(service => normal(service.direction || service.destination || service.origin) === normal(tfl.direction || tfl.destination || tfl.origin));
  return sameDirection.length === 1 ? sameDirection[0] : candidates.length === 1 ? candidates[0] : null;
}
function matchBodsRequest(lineId, stopPointId, bods) {
  const candidates = (bods ?? []).filter(service => normal(service.routeNumber) === normal(lineId) && Object.prototype.hasOwnProperty.call(service.stopSchedules ?? {}, stopPointId));
  return candidates.length === 1 ? candidates[0] : null;
}
function sameText(left, right) { return normal(left) === normal(right); }
function sameSequence(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameText(value, right[index]));
}
function supplement(tfl, bods) {
  const match = matchBods(tfl, bods);
  if (!match) return { service: tfl, matched: false, conflict: false };
  let supplemented = false, conflict = false;
  const service = { ...tfl };
  for (const field of textFields) {
    const tfValue = service[field];
    const bodsValue = match[field];
    const tfEmpty = Array.isArray(tfValue) ? tfValue.length === 0 : !text(tfValue);
    const bodsEmpty = Array.isArray(bodsValue) ? bodsValue.length === 0 : !text(bodsValue);
    if (tfEmpty && !bodsEmpty) { service[field] = Array.isArray(bodsValue) ? [...bodsValue] : bodsValue; supplemented = true; }
    else if (!tfEmpty && !bodsEmpty && !sameText(tfValue, bodsValue)) conflict = true;
  }
  const tflLocations = service.principalLocations;
  const bodsLocations = match.principalLocations;
  if ((!Array.isArray(tflLocations) || !tflLocations.length) && Array.isArray(bodsLocations) && bodsLocations.length) { service.principalLocations = [...bodsLocations]; supplemented = true; }
  else if (Array.isArray(tflLocations) && tflLocations.length && Array.isArray(bodsLocations) && bodsLocations.length && !sameSequence(tflLocations, bodsLocations)) conflict = true;
  const tflPattern = service.routePatternStopIds;
  const bodsPattern = match.routePatternStopIds;
  if ((!Array.isArray(tflPattern) || !tflPattern.length) && Array.isArray(bodsPattern) && bodsPattern.length) { service.routePatternStopIds = [...bodsPattern]; supplemented = true; }
  else if (Array.isArray(tflPattern) && tflPattern.length && Array.isArray(bodsPattern) && bodsPattern.length && !sameSequence(tflPattern, bodsPattern)) conflict = true;
  if (typeof service.operatingPeriodEvidence !== 'boolean' && typeof match.operatingPeriodEvidence === 'boolean') { service.operatingPeriodEvidence = match.operatingPeriodEvidence; supplemented = true; }
  else if (typeof service.operatingPeriodEvidence === 'boolean' && typeof match.operatingPeriodEvidence === 'boolean' && service.operatingPeriodEvidence !== match.operatingPeriodEvidence) conflict = true;
  service.timetableSource = supplemented ? 'TfL + BODS supplementary' : 'TfL';
  service.source = { ...service.source, supplementaryProvider: supplemented ? 'BODS' : null };
  return { service, matched: true, conflict };
}

export function createAuthoritativeBusTimetableAdapter({ tflAdapter, nationalAdapter, londonSupplementAdapter = nationalAdapter, londonCoverage = isGreaterLondonPoint, requestLimit = 20, maxRequestStages = 3 } = {}) {
  if (!tflAdapter?.servicesForStop || !nationalAdapter?.servicesForStops || !londonSupplementAdapter?.servicesForStops) throw new Error('TfL, national and London supplementary timetable adapters are required.');
  async function servicesForStops(stops, options = {}) {
    if (!stops?.length) return sourceSuccess({ data: [], warnings: [], provenance: { source: 'TfL scheduled timetable authority', authority: 'TfL', requestCount: 0 } });
    const site = options.site ?? stops[0];
    const insideLondon = londonCoverage(site);
    const tflStops = insideLondon ? stops : stops.filter(isTfLStop);
    if (!insideLondon && !tflStops.length) return nationalAdapter.servicesForStops(stops, options);
    const nationalStops = insideLondon ? stops : stops.filter(stop => !isTfLStop(stop));
    const national = await (insideLondon ? londonSupplementAdapter : (nationalStops.length ? nationalAdapter : { ok: true, data: [], warnings: [], provenance: { source: 'National timetable authority', requestCount: 0 } })).servicesForStops(nationalStops.length ? nationalStops : stops, options);
    const bods = national.ok ? national.data : [];
    const requests = stagedRequests(tflStops);
    const stageSize = Math.max(1, Number(requestLimit) || 20);
    const stages = chunks(requests, stageSize).slice(0, Math.max(1, Number(maxRequestStages) || 1));
    const unrequested = requests.slice(stages.reduce((count, stage) => count + stage.length, 0));
    const warnings = [...new Set([...(national.ok ? national.warnings ?? [] : []), ...(insideLondon ? [] : [crossBoundaryWarning]), ...(unrequested.length ? [stagedWarning] : [])])];
    const stageResults = [];
    let selectedStage = null;
    for (const [stageIndex, stage] of stages.entries()) {
      const routeMetadata = tflAdapter.routeMetadataForLines ? await tflAdapter.routeMetadataForLines([...new Set(stage.map(request => request.lineId))], { forceRefresh: options.forceRefresh }) : null;
      const results = [];
      for (const request of stage) results.push(await tflAdapter.servicesForStop({ lineId: request.lineId, stopPointId: request.stopPointId, forceRefresh: options.forceRefresh, routeMetadata }));
      const stageServices = results.filter(result => result.ok).flatMap(result => result.data ?? []);
      const stageFallbacks = results.flatMap((result, index) => {
        if (result.ok) return [];
        const request = stage[index];
        const fallback = matchBodsRequest(request.lineId, request.stopPointId, bods);
        return fallback ? [{ ...fallback, timetableSource: 'BODS fallback after TfL failure', source: { ...(fallback.source ?? {}), provider: 'BODS', fallbackFor: 'TfL scheduled timetable' } }] : [];
      });
      stageResults.push({ stageIndex, stage, results, routeMetadata, stageServices, stageFallbacks });
      if (stageServices.length || stageFallbacks.length) { selectedStage = stageResults.at(-1); break; }
    }
    const processed = selectedStage ? stageResults : stageResults;
    const results = processed.flatMap(stage => stage.results);
    const successful = results.filter(result => result.ok);
    const failed = results.filter(result => !result.ok);
    const services = processed.flatMap(stage => stage.stageServices);
    const fallbackServices = processed.flatMap(stage => stage.stageFallbacks);
    const routeMetadata = selectedStage?.routeMetadata ?? processed.at(-1)?.routeMetadata ?? null;
    const nationalServices = !insideLondon && national.ok ? bods : [];
    let conflicts = 0;
    const composed = services.map(service => { const result = supplement(service, bods); if (result.conflict) conflicts += 1; return result.service; });
    composed.push(...fallbackServices, ...nationalServices);
    const processedRequests = processed.flatMap(stage => stage.stage);
    const unresolvedFailure = results.some((result, index) => !result.ok && !matchBodsRequest(processedRequests[index]?.lineId, processedRequests[index]?.stopPointId, bods));
    if (conflicts) warnings.push(conflictWarning);
    if (failed.length && (fallbackServices.length || unresolvedFailure)) warnings.push(partialWarning);
    if (failed.length && unresolvedFailure) warnings.push(incompleteWarning);
    if (!successful.length && fallbackServices.length) { warnings.push(fallbackWarning); }
    if (!successful.length && !fallbackServices.length && !nationalServices.length) return sourceFailure({ code: results[0]?.code || 'unavailable_source', message: 'TfL scheduled timetable information could not be checked. No London zero-service conclusion has been assumed.', warnings, provenance: { source: 'TfL scheduled timetable authority', authority: 'TfL', requestCount: requests.length, detailedRequests: results.length, requestLimit: stageSize, requestStages: stageResults.length, unrequestedRequests: unrequested.length, realtimeArrivalsUsed: false, anonymousRequest: true, apiKeyEmbedded: false } });
    const routeMetadataRequests = processed.filter(stage => stage.routeMetadata && stage.routeMetadata.cache?.status !== 'hit').length;
    return sourceSuccess({ data: composed, warnings, provenance: { source: insideLondon ? 'TfL scheduled timetable authority; BODS controlled supplementary evidence' : 'TfL StopPoint authority with national BODS/TNDS evidence', authority: 'TfL', crossBoundaryTfL: !insideLondon, requestCount: requests.length, detailedRequests: results.length, requestLimit: stageSize, requestStages: stageResults.length, selectedStage: selectedStage?.stageIndex ?? null, unrequestedRequests: unrequested.length, timetableRequests: results.length, routeMetadataRequests, totalTfLRequests: results.length + routeMetadataRequests, successfulRequests: successful.length, failedRequests: failed.length, realtimeArrivalsUsed: false, anonymousRequest: true, apiKeyEmbedded: false } });
  }
  return Object.freeze({ id: 'authoritative-bus-timetable-v1', servicesForStops });
}
