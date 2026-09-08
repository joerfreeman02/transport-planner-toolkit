import { isGreaterLondonPoint } from '../domain/geography.mjs';
import { sourceFailure, sourceSuccess } from './source-adapter.mjs';

const text = value => String(value ?? '').trim();
const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const textFields = Object.freeze(['operator', 'origin', 'destination', 'direction']);
const conflictWarning = 'TfL and the supplementary national timetable source contain conflicting information for one or more London services. ATLAS retained the TfL scheduled information and flagged the difference for planner review.';
const fallbackWarning = 'TfL scheduled timetable information was unavailable, so matching BODS evidence was used as an explicit supplementary fallback. This is not a TfL timetable result.';
const partialWarning = 'TfL scheduled timetable information could not be checked for one or more services. ATLAS retained available authoritative results and used matching national timetable evidence where available. Review the affected service evidence before formal use.';
const incompleteWarning = 'TfL scheduled timetable information could not be checked for one or more services, and no defensible national fallback was available. ATLAS did not assume zero service; review the incomplete evidence before formal use.';

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

export function createAuthoritativeBusTimetableAdapter({ tflAdapter, nationalAdapter, londonSupplementAdapter = nationalAdapter, londonCoverage = isGreaterLondonPoint, requestLimit = 20 } = {}) {
  if (!tflAdapter?.servicesForStop || !nationalAdapter?.servicesForStops || !londonSupplementAdapter?.servicesForStops) throw new Error('TfL, national and London supplementary timetable adapters are required.');
  async function servicesForStops(stops, options = {}) {
    if (!stops?.length) return sourceSuccess({ data: [], warnings: [], provenance: { source: 'TfL scheduled timetable authority', authority: 'TfL', requestCount: 0 } });
    const site = options.site ?? stops[0];
    if (!londonCoverage(site)) return nationalAdapter.servicesForStops(stops, options);
    const national = await londonSupplementAdapter.servicesForStops(stops, options);
    const bods = national.ok ? national.data : [];
    const requests = [...new Set(stops.flatMap(stop => (stop.routes ?? []).map(line => `${line}|${stop.id || stop.sourceId}`)))].map(value => { const [lineId, stopPointId] = value.split('|'); return { lineId, stopPointId }; });
    if (requests.length > requestLimit) return sourceFailure({ code: 'invalid_request', message: 'The selected London assessment would exceed the controlled TfL anonymous request budget. Reduce the assessment scope and try again.', provenance: { source: 'TfL scheduled timetable authority', authority: 'TfL', requestCount: requests.length, requestLimit } });
    const routeMetadata = tflAdapter.routeMetadataForLines ? await tflAdapter.routeMetadataForLines([...new Set(requests.map(request => request.lineId))], { forceRefresh: options.forceRefresh }) : null;
    const results = await Promise.all(requests.map(request => tflAdapter.servicesForStop({ ...request, forceRefresh: options.forceRefresh, routeMetadata })));
    const successful = results.filter(result => result.ok);
    const failed = results.filter(result => !result.ok);
    const services = successful.flatMap(result => result.data);
    const warnings = [...new Set([...(national.ok ? national.warnings ?? [] : []), ...results.flatMap(result => result.warnings ?? [])])];
    let conflicts = 0;
    const composed = services.map(service => { const result = supplement(service, bods); if (result.conflict) conflicts += 1; return result.service; });
    const requestResults = requests.map((request, index) => ({ request, result: results[index] }));
    const fallbackServices = [];
    let unresolvedFailure = false;
    for (const { request, result } of requestResults.filter(item => !item.result.ok)) {
      const fallback = matchBodsRequest(request.lineId, request.stopPointId, bods);
      if (fallback) fallbackServices.push({ ...fallback, timetableSource: 'BODS fallback after TfL failure', source: { ...(fallback.source ?? {}), provider: 'BODS', fallbackFor: 'TfL scheduled timetable' } });
      else unresolvedFailure = true;
    }
    composed.push(...fallbackServices);
    if (conflicts) warnings.push(conflictWarning);
    if (failed.length && (fallbackServices.length || unresolvedFailure)) warnings.push(partialWarning);
    if (failed.length && unresolvedFailure) warnings.push(incompleteWarning);
    if (!successful.length && fallbackServices.length) { warnings.push(fallbackWarning); return sourceSuccess({ data: fallbackServices, warnings, provenance: { source: 'TfL scheduled timetable authority; BODS controlled fallback', authority: 'TfL', fallback: 'BODS', requestCount: requests.length, realtimeArrivalsUsed: false, anonymousRequest: true, apiKeyEmbedded: false } }); }
    if (!successful.length) return sourceFailure({ code: results[0]?.code || 'unavailable_source', message: 'TfL scheduled timetable information could not be checked. No London zero-service conclusion has been assumed.', warnings, provenance: { source: 'TfL scheduled timetable authority', authority: 'TfL', requestCount: requests.length, realtimeArrivalsUsed: false, anonymousRequest: true, apiKeyEmbedded: false } });
    const routeMetadataRequests = routeMetadata ? routeMetadata.cache?.status === 'hit' ? 0 : 1 : 0;
    return sourceSuccess({ data: composed, warnings, provenance: { source: 'TfL scheduled timetable authority; BODS controlled supplementary evidence', authority: 'TfL', requestCount: requests.length, timetableRequests: requests.length, routeMetadataRequests, totalTfLRequests: requests.length + routeMetadataRequests, successfulRequests: successful.length, failedRequests: failed.length, realtimeArrivalsUsed: false, anonymousRequest: true, apiKeyEmbedded: false } });
  }
  return Object.freeze({ id: 'authoritative-bus-timetable-v1', servicesForStops });
}
