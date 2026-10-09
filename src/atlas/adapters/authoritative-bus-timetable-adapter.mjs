import { isGreaterLondonPoint } from '../domain/geography.mjs';
import { deriveTimetableConclusion, hasScheduledEvidenceAt, scheduledStopIds, scopedScheduledService } from '../domain/scheduled-evidence.mjs';
import { timetableProviderLabelsFromText } from '../domain/bus-source-presentation.mjs';
import { sourceFailure, sourceSuccess } from './source-adapter.mjs';
import { tflRouteSequenceEvidenceForService } from './tfl-bus-timetable-adapter.mjs';

const text = value => String(value ?? '').trim();
const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const unique = values => [...new Set(values.map(text).filter(Boolean))];
const textFields = Object.freeze(['origin', 'destination', 'direction']);
const conflictWarning = 'TfL and supplementary national evidence disagree on an unresolved route identity for one or more London services. ATLAS retained the authoritative TfL schedule; inspect the affected service evidence before formal use.';
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

function tflRoutesForStops(stops) {
  return new Set((stops ?? []).flatMap(stop => Object.entries(stop?.routeAuthorities ?? {})
    .filter(([, authorities]) => (Array.isArray(authorities) ? authorities : [authorities]).some(authority => normal(authority) === 'tfl'))
    .map(([route]) => normal(route))
    .filter(Boolean)));
}

function stagedRequests(stops, { insideLondon = false, crossBoundaryTfLRoutes = new Set() } = {}) {
  const entries = stops.flatMap(stop => (stop.routes ?? []).map(line => {
    const lineId = text(line), stopPointId = stopKey(stop);
    const routeHasTfLCoverage = crossBoundaryTfLRoutes.has(normal(lineId));
    if (!insideLondon && !routeAuthorities(stop, lineId).includes('tfl') && !routeHasTfLCoverage) return [];
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

function annotateNationalSource(service) {
  const provider = isTnds(service) ? 'TNDS' : 'BODS';
  const existingProvider = text(service?.provider || service?.timetableSource || service?.source?.provider);
  if (existingProvider) return { ...service, primaryAuthority: service.primaryAuthority || provider, source: { ...(service.source ?? {}), provider: service.source?.provider || provider, primaryAuthority: service.source?.primaryAuthority || provider } };
  return { ...service, provider, primaryAuthority: provider, timetableSource: provider, source: { ...(service.source ?? {}), provider, primaryAuthority: provider } };
}

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

function explicitRouteLineage(service) {
  const source = service?.source ?? {};
  return unique([
    service?.routeLineageId, service?.lineageId,
    source.routeLineageId, source.lineageId, source.serviceFamilyId
  ].map(normal).filter(Boolean));
}

function routeLineageConflict(left, right) {
  const leftIds = explicitRouteLineage(left), rightIds = explicitRouteLineage(right);
  return leftIds.length > 0 && rightIds.length > 0 && !leftIds.some(id => rightIds.includes(id));
}

function bodsOperatorConsensus(tfl, bods) {
  if (text(tfl?.operator)) return null;
  const stopIds = scheduledStopIds(tfl);
  const sameRouteAndStop = (bods ?? []).filter(service => normal(service.routeNumber) === normal(tfl.routeNumber)
    && stopIds.some(id => hasScheduledEvidenceAt(service, id)));
  if (!sameRouteAndStop.length || sameRouteAndStop.some(service => routeLineageConflict(tfl, service))) return null;
  // A route/stop candidate with missing direction or operator cannot be
  // silently discarded in favour of a unanimous-looking subset. Only exact
  // incompatible lineage above can prove a candidate irrelevant.
  const candidates = sameRouteAndStop.map(service => ({ service, operator: text(service.operator), canonical: normal(service.operator) }));
  if (candidates.some(item => !item.canonical)) return null;
  const canonical = [...new Set(candidates.map(item => item.canonical))];
  if (!candidates.length || canonical.length !== 1) return null;
  return Object.freeze({
    operator: candidates[0].operator,
    canonicalOperator: canonical[0],
    candidates: Object.freeze(candidates.map(item => Object.freeze({ id: text(item.service.id) || null, operator: item.operator, routeNumber: text(item.service.routeNumber) || null })))
  });
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

const WEEK_DAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

function supplementaryDepartureEntries(match, stopId, day, schedule) {
  const explicit = Array.isArray(match?.departureEvidenceByDay?.[day])
    ? match.departureEvidenceByDay[day].filter(entry => !text(entry?.stopPointId) || text(entry.stopPointId) === stopId)
    : [];
  const sourceEntries = explicit.length ? explicit : (schedule?.[day] ?? []).map(minute => ({ minute }));
  return sourceEntries.map(entry => ({
    ...entry,
    minute: Number(entry?.minute ?? entry?.departureMinute ?? entry?.time),
    stopPointId: text(entry?.stopPointId) || stopId,
    provider: 'BODS',
    primaryAuthority: 'BODS',
    sourceRecordId: text(entry?.sourceRecordId) || text(match?.id) || null,
    routeNumber: text(entry?.routeNumber) || text(match?.routeNumber) || null,
    direction: text(entry?.direction) || text(match?.direction || match?.destination || match?.origin) || null,
    origin: text(entry?.origin) || text(match?.origin) || null,
    destination: text(entry?.destination) || text(match?.destination) || null,
    calendarProfileId: text(entry?.calendarProfileId) || text(match?.calendarProfileId || match?.source?.calendarProfileId) || null
  })).filter(entry => Number.isFinite(entry.minute));
}

function retainSupplementaryDepartures(service, match) {
  const tflStopIds = new Set(scheduledStopIds(service));
  const supplementaryDepartureEvidenceByDay = Object.fromEntries(WEEK_DAYS.map(day => [day, [...(service.supplementaryDepartureEvidenceByDay?.[day] ?? [])]]));
  const supplementaryStopSchedules = { ...(service.supplementaryStopSchedules ?? {}) };
  let retained = false;
  let addedDeparture = false;
  for (const [stopId, schedule] of Object.entries(match?.stopSchedules ?? {})) {
    if (!tflStopIds.has(stopId)) continue;
    const current = supplementaryStopSchedules[stopId] ?? {};
    for (const day of WEEK_DAYS) if ((schedule?.[day] ?? []).some(minute => !(current[day] ?? []).includes(minute))) addedDeparture = true;
    supplementaryStopSchedules[stopId] = Object.fromEntries(WEEK_DAYS.map(day => [day, [...new Set([...(current[day] ?? []), ...(schedule?.[day] ?? [])])].sort((left, right) => left - right)]));
    for (const day of WEEK_DAYS) {
      const entries = supplementaryDepartureEntries(match, stopId, day, schedule);
      if (!entries.length) continue;
      supplementaryDepartureEvidenceByDay[day].push(...entries);
      retained = true;
    }
  }
  return retained ? {
    service: { ...service, supplementaryStopSchedules, supplementaryDepartureEvidenceByDay },
    addedDeparture,
    retained: true
  } : { service, addedDeparture: false, retained: false };
}

function supplement(tfl, bods) {
  const match = matchBods(tfl, bods);
  const operatorConsensus = bodsOperatorConsensus(tfl, bods);
  if (!match && !operatorConsensus) return { service: tfl, matched: false, conflict: false };
  let supplemented = false;
  let operatorSupplemented = false;
  const conflictFields = [];
  let service = { ...tfl };
  if (operatorConsensus) {
    service.operator = operatorConsensus.operator;
    service.source = {
      ...(service.source ?? {}),
      supplementaryProvider: 'BODS',
      supplementaryOperatorEvidence: Object.freeze({
        provider: 'BODS',
        status: 'unanimous-matching-candidates',
        canonicalOperator: operatorConsensus.canonicalOperator,
        candidateCount: operatorConsensus.candidates.length,
        candidates: operatorConsensus.candidates,
        timetableAuthorityUnchanged: 'TfL'
      })
    };
    operatorSupplemented = true;
  }
  for (const field of textFields) {
    if (!match) break;
    const tfValue = service[field], bodsValue = match[field];
    const tfEmpty = Array.isArray(tfValue) ? tfValue.length === 0 : !text(tfValue);
    const bodsEmpty = Array.isArray(bodsValue) ? bodsValue.length === 0 : !text(bodsValue);
    if (tfEmpty && !bodsEmpty) { service[field] = Array.isArray(bodsValue) ? [...bodsValue] : bodsValue; supplemented = true; }
    else if (!tfEmpty && !bodsEmpty && !sameText(tfValue, bodsValue)) conflictFields.push(field);
  }
  if (match && text(tfl?.operator) && text(match.operator) && !sameText(tfl.operator, match.operator)) conflictFields.push('operator');
  if (match && (!Array.isArray(service.principalLocations) || !service.principalLocations.length) && Array.isArray(match.principalLocations) && match.principalLocations.length) { service.principalLocations = [...match.principalLocations]; supplemented = true; }
  else if (match && service.principalLocations?.length && match.principalLocations?.length && !sameSequence(service.principalLocations, match.principalLocations)) conflictFields.push('principalLocations');
  if (match && (!Array.isArray(service.routePatternStopIds) || !service.routePatternStopIds.length) && Array.isArray(match.routePatternStopIds) && match.routePatternStopIds.length) { service.routePatternStopIds = [...match.routePatternStopIds]; supplemented = true; }
  else if (match && service.routePatternStopIds?.length && match.routePatternStopIds?.length && !sameSequence(service.routePatternStopIds, match.routePatternStopIds)) conflictFields.push('routePatternStopIds');
  const withSupplementaryDepartures = match ? retainSupplementaryDepartures(service, match) : { service, addedDeparture: false, retained: false };
  if (withSupplementaryDepartures.service !== service) service = withSupplementaryDepartures.service;
  service.provider = 'TfL';
  service.primaryAuthority = 'TfL';
  const hasSupplementaryEvidence = supplemented || operatorSupplemented || withSupplementaryDepartures.retained;
  service.timetableSource = supplemented ? 'TfL + BODS supplementary' : 'TfL';
  service.source = { ...service.source, provider: 'TfL', primaryAuthority: 'TfL', supplementaryProvider: hasSupplementaryEvidence ? 'BODS' : null };
  const deterministicTfLIdentity = service.source?.routeMetadata === 'matched' && Boolean(text(service.origin) && text(service.destination));
  const identityFields = new Set(['origin', 'destination', 'direction', 'principalLocations', 'routePatternStopIds']);
  const materialConflictFields = conflictFields.filter(field => identityFields.has(field) && !deterministicTfLIdentity);
  if (conflictFields.length) {
    const diagnostic = Object.freeze({
      provider: 'BODS',
      type: 'supplementary-field-disagreement',
      fields: Object.freeze([...new Set(conflictFields)]),
      materialFields: Object.freeze([...new Set(materialConflictFields)]),
      classification: materialConflictFields.length ? 'material-identity-ambiguity' : 'audit-only-authoritative-TfL-result',
      authoritativeProvider: 'TfL'
    });
    service = { ...service, sourceAuthorityDiagnostics: Object.freeze([...(service.sourceAuthorityDiagnostics ?? []), diagnostic]) };
  }
  return { service, matched: Boolean(match || operatorConsensus), conflict: materialConflictFields.length > 0, technicalDiscrepancy: conflictFields.length > 0 };
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
    // Some compact prepared V2 service shards carry source identity only in
    // adapter provenance. Reattach that identity to each in-scope record so
    // the BUS-GROUP authority gate can distinguish national evidence from a
    // genuinely unresolved source without altering prepared-data contracts.
    const nationalServices = national.ok ? (national.data ?? []).map(annotateNationalSource) : [];
    const bods = nationalServices.filter(isBods);
    const crossBoundaryTfLRoutes = !insideLondon && typeof tflAdapter.routeMetadataForLines === 'function' ? tflRoutesForStops(stops) : new Set();
    const requestStops = insideLondon ? tflStops : stops;
    const requests = stagedRequests(requestStops, { insideLondon, crossBoundaryTfLRoutes });
    const stageSize = Math.max(1, Number(requestLimit) || 20);
    const maximumRequests = Number.isInteger(Number(options.maxRequests)) && Number(options.maxRequests) >= 0 ? Number(options.maxRequests) : requests.length;
    const processedRequests = requests.slice(0, maximumRequests);
    const unprocessed = requests.slice(maximumRequests);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    onProgress({ phase: 'checking-timetables', completed: 0, total: processedRequests.length, detail: `${processedRequests.length} timetable requests` });
    const nationalRequired = nationalEvidenceRequired;
    const nationalSourceAvailable = !nationalRequired || Boolean(national.ok);
    const nationalUnresolvedRoutes = nationalSourceAvailable ? [] : [...new Set(nationalStops.flatMap(nationalRoutesForStop))].sort((left, right) => left.localeCompare(right, 'en-GB', { numeric: true }));
    const warnings = [...new Set([...(national.warnings ?? []), ...(insideLondon ? [] : [crossBoundaryWarning]), ...(nationalSourceAvailable ? [] : [nationalUnavailableWarning]), ...(unprocessed.length ? [unprocessedWarning] : [])])];
    const routeMetadata = tflAdapter.routeMetadataForLines && processedRequests.length
      ? await tflAdapter.routeMetadataForLines([...new Set(processedRequests.map(request => request.lineId))], { forceRefresh: options.forceRefresh, progress: { phase: 'checking-timetables', completed: 0, total: processedRequests.length } })
      : null;
    const stageResults = [];
    for (const [stageIndex, stage] of chunks(processedRequests, stageSize).entries()) {
      const results = [];
      for (const request of stage) {
        const completed = stageResults.flatMap(item => item.results).length + results.length;
        results.push(await tflAdapter.servicesForStop({ lineId: request.lineId, stopPointId: request.stopPointId, forceRefresh: options.forceRefresh, routeMetadata, progress: { phase: 'checking-timetables', completed, total: processedRequests.length } }));
        onProgress({ phase: 'checking-timetables', completed: completed + 1, total: processedRequests.length });
      }
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
    const services = successful.flatMap(entry => actualTfLServices(entry).map(service => ({
      ...service,
      provider: 'TfL',
      primaryAuthority: 'TfL',
      source: { ...(service.source ?? {}), provider: 'TfL', primaryAuthority: 'TfL' }
    })));
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
    let technicalDiscrepancies = 0;
    const composed = services.map(service => {
      const result = supplement(service, bods);
      if (result.conflict) conflicts += 1;
      if (result.technicalDiscrepancy) technicalDiscrepancies += 1;
      return result.service;
    });
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
    let routeSequenceResult = null;
    if (typeof tflAdapter.routeSequencesForLineDirections === 'function' && services.length) {
      const sequenceRequests = [...new Map(services.map(service => {
        const lineId = text(service.source?.lineId);
        const direction = text(service.direction);
        return [`${normal(lineId)}|${normal(direction)}`, { lineId, direction }];
      }).filter(([, request]) => request.lineId && request.direction)).values()];
      routeSequenceResult = await tflAdapter.routeSequencesForLineDirections(sequenceRequests, {
        forceRefresh: options.forceRefresh,
        progress: { phase: 'checking-timetables', completed: processedRequests.length, total: processedRequests.length }
      });
      for (let index = 0; index < composed.length; index += 1) {
        const service = composed[index];
        if (normal(service.provider ?? service.timetableSource ?? service.source?.provider) !== 'tfl') continue;
        composed[index] = { ...service, tflRouteSequenceEvidence: tflRouteSequenceEvidenceForService(service, { ...routeSequenceResult, routeMetadata }) };
      }
      warnings.push(...(routeSequenceResult.warnings ?? []));
    }
    const routeMetadataRequests = routeMetadata && routeMetadata.cache?.status !== 'hit' ? 1 : 0;
    const provenance = {
      source: insideLondon ? 'TfL scheduled timetable authority; BODS/TNDS controlled supplementary evidence' : 'TfL StopPoint authority with national BODS/TNDS evidence',
      authority: 'TfL', crossBoundaryTfL: !insideLondon, requestCount: requests.length, detailedRequests: results.length,
      crossBoundaryTfLRoutes: [...crossBoundaryTfLRoutes].sort(),
      requestLimit: stageSize, requestStages: stageResults.length, selectedStage: null, unrequestedRequests: unprocessed.length,
      processedRequests: processedRequests.length, unprocessedRequests: unprocessed.length, processedRequestIdentities: processedRequests.map(request => `${request.lineId}|${request.stopPointId}`),
      unprocessedRequestIdentities: unprocessed.map(request => `${request.lineId}|${request.stopPointId}`), timetableRequests: results.length,
      routeMetadataRequests,
      routeSequenceRequests: routeSequenceResult?.provenance?.requestCount ?? 0,
      routeSequenceCacheHits: routeSequenceResult?.provenance?.cacheHits ?? 0,
      routeSequenceReusedRequests: routeSequenceResult?.provenance?.reusedRequests ?? 0,
      routeSequenceFailedRequests: routeSequenceResult?.provenance?.failedRequests ?? 0,
      routeSequenceAmbiguousMatches: composed.filter(service => service.tflRouteSequenceEvidence?.status === 'ambiguous-or-incomplete-link').length,
      totalTfLRequests: results.length + routeMetadataRequests + (routeSequenceResult?.provenance?.requestCount ?? 0), successfulRequests: successful.length, failedRequests: failed.length,
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
      supplementaryTechnicalDiscrepancyCount: technicalDiscrepancies,
      supplementaryMaterialConflictCount: conflicts,
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
