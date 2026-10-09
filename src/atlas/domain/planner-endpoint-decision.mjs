/*
 * BUS-DEST: the single domain decision boundary for planner endpoint/place
 * identity.  This module deliberately knows nothing about browser or Word
 * presentation.  It only combines source endpoint text with exact physical
 * StopPoint evidence and the reference evidence attached to that StopPoint.
 */

function text(value) { return String(value ?? '').trim(); }
function normal(value) { return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function unique(values) { return [...new Set((values ?? []).map(text).filter(Boolean))]; }

const GENERIC_ENDPOINT = /^(?:(?:temp|temporary)\s+)?(?:bus|coach)\s+station$|^(?:stand|bay|platform|stop)\s+[a-z0-9-]+$|^interchange$/i;
const STREET_OR_LANDMARK = /\b(?:street|st|road|rd|lane|ln|avenue|ave|way|close|drive|dr|terrace|gardens?|green|parade|square|hill|common|junction|crossroads?)\b/i;
const STRONG_FACILITY_WORDING = /\b(?:bus|coach)\s+station\b|\b(?:station|hospital|school|interchange|centre|center)\b/i;
const INVALID_TEXT = /^(?:origin|destination)\s+(?:not supplied|not resolved)$/i;

function usable(value) {
  const candidate = text(value);
  return candidate && !INVALID_TEXT.test(candidate) && !/^(?:unknown|not supplied|not resolved|unspecified|various)$/i.test(candidate);
}

function endpointIdValues(endpoint = {}) {
  return unique([endpoint.endpointStopPointId, ...(endpoint.endpointStopPointIds ?? [])]);
}

function firstName(...values) { return values.map(text).find(Boolean) || null; }

function clippedTfLOrigin(service) {
  const source = service?.source ?? {};
  const sequence = service?.tflRouteSequenceEvidence;
  return source.provider === 'TfL'
    && source.routePatternStartIsAssessedStop === true
    && sequence?.status === 'resolved'
    && Boolean(sequence.routeTopologyEndpoints?.origin);
}

function intervalEdgeOriginId(service) {
  const source = service?.source ?? {};
  const direct = text(service?.originStopPointId);
  return source.routePatternStartIsAssessedStop === true
    && direct
    && direct === text(source.intervalOriginStopPointId)
    ? direct
    : null;
}

function clippedOriginEdgeIds(service) {
  const source = service?.source ?? {};
  if (source.routePatternStartIsAssessedStop !== true) return [];
  const patternIds = new Set((service?.routePatternStopIds ?? service?.orderedPatternEndpoints ?? []).map(text));
  return unique([source.assessedStopPointId, source.intervalOriginStopPointId, intervalEdgeOriginId(service)]
    .filter(id => patternIds.has(text(id))));
}

function localityEvidence(endpoint = {}) {
  const locality = endpoint.nptgLocality ?? endpoint.nptgLocalityEvidence ?? {};
  return {
    code: text(endpoint.nptgLocalityCode || locality.code || locality.id?.replace?.(/^nptg:/, '')) || null,
    name: firstName(endpoint.nptgLocalityName, locality.name),
    parentId: text(endpoint.parentLocalityId || locality.parentLocalityId || locality.parentLocality?.id) || null,
    parentName: firstName(endpoint.parentLocalityName, locality.parentLocalityName, locality.parentLocality?.name)
  };
}

function logicalGroups(endpoint = {}) {
  const groups = endpoint.primaryLogicalGroupEvidence ?? endpoint.logicalGroupEvidence ?? endpoint.logicalGroups ?? [];
  const ids = unique([
    ...(endpoint.endpointLogicalGroupIds ?? []),
    ...(endpoint.logicalGroupIds ?? [])
  ]);
  return { ids, evidence: Array.isArray(groups) ? groups.filter(Boolean) : [] };
}

function stopAreaEvidence(endpoint = {}, groups) {
  const explicit = endpoint.stopArea ?? endpoint.primaryStopAreas?.[0] ?? endpoint.stopAreaEvidence ?? null;
  const candidates = [explicit, ...(groups.evidence ?? [])].filter(Boolean);
  const byName = candidates.find(candidate => usable(candidate.name || candidate.stopAreaName));
  const id = text(explicit?.id || explicit?.logicalGroupId || groups.evidence[0]?.id || groups.ids[0]) || null;
  const name = firstName(explicit?.name, explicit?.stopAreaName, byName?.name, byName?.stopAreaName);
  return { id: id || null, name: name || null, evidence: candidates };
}

function meaningfulSourceText(raw) { return Boolean(usable(raw) && !GENERIC_ENDPOINT.test(text(raw))); }

function candidatePlaceName(raw, endpoint, locality, stopArea) {
  const stopAreaName = text(stopArea.name);
  const localityName = text(locality.name);
  const stopName = text(endpoint.endpointStopName || endpoint.stopName);
  if (stopAreaName && !GENERIC_ENDPOINT.test(stopAreaName)) return stopAreaName;
  if (localityName && raw && GENERIC_ENDPOINT.test(raw)) return `${localityName} ${raw}`.trim();
  if (localityName && raw && STREET_OR_LANDMARK.test(raw) && normal(raw) !== normal(localityName)) return `${localityName} (${raw})`;
  if (stopName && localityName && GENERIC_ENDPOINT.test(raw) && !GENERIC_ENDPOINT.test(stopName)) return stopName;
  return firstName(stopName, localityName, raw);
}

/**
 * Make a deterministic decision from one already-resolved endpoint evidence
 * object.  No names, coordinates, route numbers or locality-only evidence
 * resolve an endpoint here; the caller must supply an exact StopPoint ID.
 */
export function makePlannerEndpointDecision({ rawEndpointText = '', endpoint = {}, provider = null, sourceRecordId = null, provenance = null } = {}) {
  const raw = text(rawEndpointText);
  const ids = endpointIdValues(endpoint);
  const locality = localityEvidence(endpoint);
  const groups = logicalGroups(endpoint);
  const stopArea = stopAreaEvidence(endpoint, groups);
  const placeCandidates = unique([
    stopArea.name,
    endpoint.endpointLogicalPlaceName,
    endpoint.logicalPlaceName,
    locality.name,
    endpoint.endpointStopName,
    endpoint.stopName
  ]);
  const placeKeys = new Set(placeCandidates.map(normal).filter(Boolean));
  const conflict = Boolean(endpoint.conflict || endpoint.materialConflict);
  const evidenceSource = text(endpoint.evidenceSource) || (conflict ? 'runtime-prepared-conflict' : endpoint.hydrated ? 'runtime-exact-endpoint' : 'source-only');
  const partialExactCoverage = Boolean(endpoint.partialExactCoverage);
  const hasExactEvidence = Boolean(ids.length && (endpoint.hydrated || endpoint.exact || endpoint.endpointStopName || locality.name || stopArea.name || groups.ids.length));
  const sourceMeaningful = meaningfulSourceText(raw);
  let chosen = raw;
  let decisionType = 'source-retained';
  let reason = raw ? 'Meaningful authoritative source endpoint wording was retained.' : 'No endpoint wording was supplied.';
  let unresolved = false;

  if (conflict) {
    chosen = sourceMeaningful ? raw : firstName(stopArea.name, endpoint.endpointStopName, locality.name, raw) || 'Destination requires review';
    decisionType = 'conflict-review';
    reason = 'Exact endpoint evidence contains materially conflicting place identities; the strongest safe source presentation was retained for technical review.';
    unresolved = true;
  } else if (endpoint.primaryUnresolvedWithSecondaryHydrated) {
    chosen = raw || 'Destination requires review';
    decisionType = raw ? 'partial-exact-coverage' : 'unresolved';
    reason = raw
      ? 'The primary exact endpoint ID was unresolved; hydrated secondary variant evidence was retained for review without promoting it to the main planner endpoint.'
      : 'The primary exact endpoint ID was unresolved; hydrated secondary variant evidence was retained for review without inventing endpoint wording.';
    unresolved = true;
  } else if (!raw && !hasExactEvidence) {
    chosen = 'Destination requires review';
    decisionType = 'unresolved';
    reason = 'No usable source endpoint or exact endpoint place evidence was available.';
    unresolved = true;
  } else if (!raw && hasExactEvidence) {
    chosen = candidatePlaceName(raw, endpoint, locality, stopArea) || 'Destination requires review';
    decisionType = chosen === 'Destination requires review' ? 'unresolved' : 'exact-endpoint-resolved';
    reason = chosen === 'Destination requires review'
      ? 'The exact endpoint was identified but did not provide a safe public place name.'
      : 'Endpoint place was resolved from the exact physical StopPoint and authoritative locality/StopArea evidence.';
    unresolved = chosen === 'Destination requires review';
  } else if (!sourceMeaningful && hasExactEvidence) {
    chosen = candidatePlaceName(raw, endpoint, locality, stopArea) || raw || 'Destination requires review';
    decisionType = chosen === raw ? 'source-retained' : 'generic-endpoint-resolved';
    reason = chosen === raw
      ? 'Generic source endpoint was retained because exact evidence did not establish a better public place name.'
      : 'Generic source endpoint was resolved using the exact StopPoint plus authoritative locality/StopArea evidence.';
    unresolved = chosen === 'Destination requires review';
  } else if (!sourceMeaningful && !hasExactEvidence) {
    chosen = raw || 'Destination requires review';
    decisionType = raw ? 'unresolved-source-retained' : 'unresolved';
    reason = raw
      ? 'Generic source endpoint was retained because no exact endpoint identity was available; no place was inferred.'
      : 'No usable source endpoint or exact endpoint place evidence was available.';
    unresolved = true;
  } else if (sourceMeaningful && hasExactEvidence && locality.name && STREET_OR_LANDMARK.test(raw)
    && !STRONG_FACILITY_WORDING.test(raw) && !/^tfl(?:\b|\s|\+)/i.test(text(provider)) && normal(raw) !== normal(locality.name)) {
    chosen = `${locality.name} (${raw})`;
    decisionType = 'street-landmark-qualified';
    reason = 'Street or landmark endpoint was qualified with the direct authoritative NPTG locality resolved from the exact StopPoint.';
  } else if (!raw) {
    chosen = 'Destination requires review';
    decisionType = 'unresolved';
    reason = 'No usable source endpoint wording was supplied.';
    unresolved = true;
  }

  if (partialExactCoverage && !conflict && !endpoint.primaryUnresolvedWithSecondaryHydrated
    && !reason.includes('partial exact coverage')) {
    reason += ' Partial exact coverage is retained because one or more secondary endpoint IDs were unresolved.';
  }

  const decision = {
    rawEndpointText: raw || null,
    raw: raw || null,
    endpointStopPointId: ids[0] || null,
    endpointStopPointIds: Object.freeze(ids),
    primaryEndpointStopPointId: endpoint.primaryEndpointStopPointId || ids[0] || null,
    requestedEndpointStopPointIds: Object.freeze(endpoint.requestedEndpointStopPointIds ?? ids),
    hydratedEndpointStopPointIds: Object.freeze(endpoint.hydratedEndpointStopPointIds ?? (endpoint.hydrated ? ids : [])),
    unresolvedEndpointStopPointIds: Object.freeze(endpoint.unresolvedEndpointStopPointIds ?? []),
    partialExactCoverage,
    endpointStopName: firstName(endpoint.endpointStopName, endpoint.stopName),
    endpointLogicalGroupIds: Object.freeze(groups.ids),
    endpointLogicalPlaceName: firstName(endpoint.endpointLogicalPlaceName, endpoint.logicalPlaceName, stopArea.name),
    nptgLocalityCode: locality.code,
    nptgLocalityName: locality.name,
    parentLocalityId: locality.parentId,
    parentLocalityName: locality.parentName,
    stopArea: stopArea.name || stopArea.id ? Object.freeze({ id: stopArea.id, name: stopArea.name }) : null,
    stopAreas: Object.freeze((endpoint.stopAreas ?? (stopArea.name || stopArea.id ? [stopArea] : [])).map(area => Object.freeze({ id: area.id || null, name: area.name || null }))),
    stopAreaEvidence: Object.freeze(stopArea.evidence),
    chosenPlaceName: chosen || null,
    chosenDisplayName: chosen || null,
    chosen: chosen || null,
    decisionType,
    reason,
    provider: text(provider) || null,
    sourceRecordId: text(sourceRecordId) || null,
    conflict,
    evidenceSource,
    unresolved,
    exactEvidence: hasExactEvidence,
    provenance: provenance || null,
    evidence: Object.freeze({
      endpoint: endpoint.exactEvidence || endpoint,
      endpointEvidenceById: endpoint.endpointEvidenceById || {},
      endpointEvidenceSet: Object.freeze(endpoint.endpointEvidenceSet ?? []),
      requestedEndpointStopPointIds: Object.freeze(endpoint.requestedEndpointStopPointIds ?? ids),
      hydratedEndpointStopPointIds: Object.freeze(endpoint.hydratedEndpointStopPointIds ?? []),
      runtimeHydratedEndpointStopPointIds: Object.freeze(endpoint.runtimeHydratedEndpointStopPointIds ?? []),
      referenceHydratedEndpointStopPointIds: Object.freeze(endpoint.referenceHydratedEndpointStopPointIds ?? []),
      preparedEvidenceEndpointStopPointIds: Object.freeze(endpoint.preparedEvidenceEndpointStopPointIds ?? []),
      unresolvedEndpointStopPointIds: Object.freeze(endpoint.unresolvedEndpointStopPointIds ?? []),
      localities: Object.freeze(endpoint.nptgLocalities ?? (locality.name ? [locality] : [])),
      stopAreas: Object.freeze(endpoint.stopAreas ?? (stopArea.name || stopArea.id ? [stopArea] : [])),
      stopArea: stopArea.name || stopArea.id ? { id: stopArea.id, name: stopArea.name } : null,
      evidenceSource
    })
  };
  return Object.freeze(decision);
}

function endpointFromService(service, side) {
  const pattern = Array.isArray(service?.routePatternStops) ? service.routePatternStops : [];
  const patternEndpoint = side === 'origin' ? pattern[0] : pattern.at(-1);
  const orderedIds = unique(service?.routePatternStopIds ?? service?.orderedPatternEndpoints ?? service?.source?.orderedPatternEndpoints ?? []);
  const orderedEndpointId = orderedIds.length >= 2 ? (side === 'origin' ? orderedIds[0] : orderedIds.at(-1)) : null;
  const isClippedOrigin = side === 'origin' && clippedTfLOrigin(service);
  const intervalEdges = isClippedOrigin ? new Set(clippedOriginEdgeIds(service)) : new Set();
  const directIds = unique([
    service?.[`${side}StopPointId`],
    ...(service?.[`${side}StopPointIds`] ?? [])
  ]).filter(id => !intervalEdges.has(id));
  const candidateIds = unique([
    ...directIds,
    // Existing ordered pattern evidence is accepted only as an exact
    // provider endpoint when it carries its own identity and locality data.
    !isClippedOrigin && patternEndpoint?.id && (patternEndpoint?.nptgLocalityCode || patternEndpoint?.nptgLocalityName || patternEndpoint?.stopArea || patternEndpoint?.logicalGroupRefs) ? patternEndpoint.id : null,
    ...preparedEndpointEvidenceForService(service, side).map(item => item.resolvedStopPointId).filter(id => !intervalEdges.has(text(id)))
  ]);
  const ids = orderedEndpointId && !candidateIds.includes(orderedEndpointId) && !isClippedOrigin ? [] : candidateIds;
  const prepared = preparedEndpointEvidenceForService(service, side).find(item => !orderedEndpointId || item.resolvedStopPointId === orderedEndpointId)
    || (!ids.length ? null : preparedEndpointEvidenceForService(service, side)[0]) || null;
  return {
    rawEndpointText: side === 'origin' ? service?.origin : service?.destination,
    endpointStopPointId: ids[0] || null,
    endpointStopPointIds: ids,
    endpointStopName: patternEndpoint?.name || patternEndpoint?.commonName || null,
    nptgLocalityCode: patternEndpoint?.nptgLocalityCode || null,
    nptgLocalityName: patternEndpoint?.nptgLocalityName || patternEndpoint?.localityName || patternEndpoint?.locality || null,
    logicalGroupRefs: patternEndpoint?.logicalGroupRefs || [],
    logicalGroupIds: patternEndpoint?.logicalGroupIds || [],
    stopArea: patternEndpoint?.stopArea || null,
    exact: Boolean(ids.length),
    hydrated: Boolean(prepared),
    evidenceSource: prepared ? 'prepared-exact-endpoint' : 'source-only',
    ...(prepared ? preparedEndpointToEndpoint(prepared) : {}),
    ...(service?.[`${side}EndpointEvidence`] && !Array.isArray(service?.[`${side}EndpointEvidence`]) ? service[`${side}EndpointEvidence`] : {})
  };
}

function providerFor(service) { return text(service?.provider || service?.timetableSource || service?.source?.provider) || null; }

export function plannerEndpointDecisionForService(service, side = 'destination') {
  const supplied = service?.[`${side}EndpointDecision`];
  if (supplied?.chosenDisplayName || supplied?.chosen) return supplied;
  const endpoint = endpointFromService(service, side);
  return makePlannerEndpointDecision({ rawEndpointText: endpoint.rawEndpointText, endpoint, provider: providerFor(service), sourceRecordId: service?.id || null });
}

function endpointIdsForService(service, side) {
  const isClippedOrigin = side === 'origin' && clippedTfLOrigin(service);
  const intervalEdges = isClippedOrigin ? new Set(clippedOriginEdgeIds(service)) : new Set();
  const ids = unique([
    service?.[`${side}StopPointId`],
    ...(service?.[`${side}StopPointIds`] ?? []),
    ...preparedEndpointEvidenceForService(service, side).map(item => item.resolvedStopPointId).filter(id => !intervalEdges.has(text(id)))
  ]).filter(id => !intervalEdges.has(id));
  const ordered = unique(service?.routePatternStopIds ?? service?.orderedPatternEndpoints ?? service?.source?.orderedPatternEndpoints ?? []);
  if (ordered.length < 2) return ids;
  const orderedEndpointId = side === 'origin' ? ordered[0] : ordered.at(-1);
  return ids.includes(orderedEndpointId) || isClippedOrigin ? ids : [];
}

function preparedEndpointEvidenceForService(service, side) {
  const direct = service?.endpointEvidence?.[side] ?? service?.[`${side}EndpointEvidence`];
  if (!direct || typeof direct !== 'object') return [];
  if (direct.resolvedStopPointId || direct.rawGtfsStopId) return [direct];
  return Object.values(direct).filter(item => item && typeof item === 'object');
}

function preparedEndpointToEndpoint(evidence = {}) {
  const code = text(evidence.nptgLocalityCode);
  const locality = evidence.nptgLocalityName ? { id: code ? `nptg:${code}` : null, code, name: evidence.nptgLocalityName, parentLocalityId: evidence.parentLocalityId || null, parentLocalityName: evidence.parentLocalityName || null } : null;
  const stopAreas = (evidence.stopAreas ?? []).map(area => ({ id: area.id || null, name: area.name || null, ...area }));
  const physicalStop = evidence.resolvedStopPointId ? {
    id: evidence.resolvedStopPointId,
    name: evidence.naptanCommonName || null,
    naptanCode: evidence.naptanCode || null,
    indicator: evidence.indicator || null,
    stopType: evidence.stopType || null,
    busStopType: evidence.busStopType || null,
    status: evidence.status || null,
    transportMode: evidence.transportMode || null,
    busPreparedEligible: evidence.busPreparedEligible,
    nptgLocalityCode: code || null,
    nptgLocalityName: evidence.nptgLocalityName || null,
    parentLocalityId: evidence.parentLocalityId || null,
    parentLocalityName: evidence.parentLocalityName || null,
    logicalGroupRefs: evidence.logicalGroupRefs ?? [],
    provenance: evidence.provenance || null
  } : null;
  return {
    endpointStopPointId: evidence.resolvedStopPointId || null,
    endpointStopName: evidence.naptanCommonName || null,
    physicalStop,
    logicalGroupRefs: evidence.logicalGroupRefs ?? [],
    logicalGroupEvidence: stopAreas,
    stopAreas,
    stopArea: stopAreas[0] || null,
    locality,
    nptgLocality: locality,
    nptgLocalityCode: code || null,
    nptgLocalityName: evidence.nptgLocalityName || null,
    parentLocalityId: evidence.parentLocalityId || null,
    parentLocalityName: evidence.parentLocalityName || null,
    exact: Boolean(evidence.resolvedStopPointId),
    hydrated: Boolean(evidence.resolvedStopPointId),
    evidenceSource: 'prepared-exact-endpoint',
    preparedEvidence: evidence
  };
}

function groupRecordsForPhysicalStop(stop, groupsById) {
  return [...new Map((stop?.logicalGroupRefs ?? [])
    .map(ref => [text(ref?.id), groupsById.get(text(ref?.id))])
    .filter(([id, group]) => id && group && usable(group.name))).values()];
}

function localityForPhysicalStop(stop, localitiesById) {
  if (!stop) return null;
  const code = text(stop.nptgLocalityCode);
  return localitiesById.get(code) || localitiesById.get(`nptg:${code}`) || localitiesById.get(text(stop.nptgLocalityId)) || null;
}

function endpointPlaceIdentity(evidence) {
  const stopAreas = evidence.stopAreas ?? [];
  if (stopAreas.length) return { tier: 'stop-area', keys: stopAreas.map(area => `stop-area:${text(area.id) || normal(area.name)}`).filter(Boolean) };
  const locality = evidence.locality;
  if (locality) return { tier: 'nptg-locality', keys: [`nptg:${text(locality.id || locality.code) || normal(locality.name)}`] };
  const physical = evidence.physicalStop;
  return physical ? { tier: 'physical-stop', keys: [`physical:${text(physical.id) || normal(physical.name)}`].filter(Boolean) } : { tier: 'unresolved', keys: [] };
}

function materiallyConflicts(endpointEvidence) {
  const hydrated = endpointEvidence.filter(evidence => evidence.hydrated);
  if (hydrated.length < 2) return false;
  const availableTiers = ['stop-area', 'nptg-locality', 'physical-stop'];
  for (const tier of availableTiers) {
    const atTier = hydrated
      .map(evidence => ({ evidence, identity: endpointPlaceIdentity(evidence) }))
      .filter(item => item.identity.tier === tier && item.identity.keys.length);
    if (atTier.length < 2) continue;
    if (new Set(atTier.flatMap(item => item.identity.keys)).size > 1) return true;
    return false;
  }
  return false;
}

function preparedEvidenceById(record, side) {
  return new Map(preparedEndpointEvidenceForService(record, side)
    .filter(item => text(item.resolvedStopPointId))
    .map(item => [text(item.resolvedStopPointId), item]));
}

function preparedRuntimeConflict(prepared, physicalStop, stopAreas, locality) {
  if (!prepared || !physicalStop) return false;
  const preparedLocality = text(prepared.nptgLocalityCode);
  const runtimeLocality = text(physicalStop.nptgLocalityCode || locality?.code);
  if (preparedLocality && runtimeLocality && preparedLocality !== runtimeLocality) return true;
  const preparedGroups = new Set((prepared.stopAreas ?? []).map(area => text(area.id)).filter(Boolean));
  const runtimeGroups = new Set((stopAreas ?? []).map(area => text(area.id)).filter(Boolean));
  if (preparedGroups.size && runtimeGroups.size && [...preparedGroups].some(id => !runtimeGroups.has(id))) return true;
  // Both records are keyed by the same exact StopPoint ID at this boundary.
  // Names are presentation aliases and can vary across snapshots/providers;
  // authoritative reference/runtime wording wins without manufacturing a
  // physical-place conflict. Identity disagreements above remain reviewable.
  return false;
}

function endpointEvidenceForRecord(record, side, hydratedById, referenceById, localitiesById, groupsById) {
  const ids = endpointIdsForService(record, side);
  const preparedById = preparedEvidenceById(record, side);
  const endpointEvidenceById = Object.fromEntries(ids.map(id => {
    const physicalStop = hydratedById.get(id) || null;
    const referenceStop = referenceById.get(id) || null;
    const prepared = preparedById.get(id) || null;
    const authoritativeStop = physicalStop || referenceStop || null;
    const locality = localityForPhysicalStop(authoritativeStop, localitiesById);
    const logicalGroups = groupRecordsForPhysicalStop(physicalStop, groupsById);
    const preparedEndpoint = prepared ? preparedEndpointToEndpoint(prepared) : null;
    const stopAreas = [...logicalGroups.map(group => ({ id: group.id, name: group.name })).filter(area => usable(area.name)), ...(preparedEndpoint?.stopAreas ?? [])]
      .filter((area, index, values) => values.findIndex(candidate => text(candidate.id) === text(area.id) && normal(candidate.name) === normal(area.name)) === index);
    const materialConflict = preparedRuntimeConflict(prepared, authoritativeStop, stopAreas, locality);
    const evidenceSource = materialConflict
      ? 'runtime-prepared-conflict'
      : physicalStop && prepared ? 'runtime-and-prepared-exact-endpoint'
        : physicalStop ? 'runtime-exact-endpoint'
          : referenceStop ? 'authoritative-reference-endpoint'
            : prepared ? 'prepared-exact-endpoint' : 'unresolved';
    return [id, {
      endpointStopPointId: id,
      hydrated: Boolean(authoritativeStop || prepared),
      runtimeHydrated: Boolean(physicalStop),
      referenceHydrated: Boolean(referenceStop),
      preparedEvidence: prepared,
      physicalStop: authoritativeStop || preparedEndpoint?.physicalStop || null,
      endpointStopName: authoritativeStop?.name || prepared?.naptanCommonName || null,
      logicalGroupRefs: physicalStop?.logicalGroupRefs ?? prepared?.logicalGroupRefs ?? [],
      logicalGroupEvidence: [...logicalGroups, ...(preparedEndpoint?.logicalGroupEvidence ?? [])],
      stopAreas,
      stopArea: stopAreas[0] || null,
      locality: locality || preparedEndpoint?.locality || authoritativeStop?.nptgLocality || null,
      nptgLocality: locality || preparedEndpoint?.locality || authoritativeStop?.nptgLocality || null,
      nptgLocalityCode: authoritativeStop?.nptgLocalityCode || locality?.code || prepared?.nptgLocalityCode || null,
      nptgLocalityName: locality?.name || authoritativeStop?.nptgLocalityName || prepared?.nptgLocalityName || null,
      parentLocalityId: locality?.parentLocalityId || locality?.parentLocality?.id || authoritativeStop?.parentLocalityId || prepared?.parentLocalityId || null,
      parentLocalityName: locality?.parentLocalityName || locality?.parentLocality?.name || authoritativeStop?.parentLocalityName || prepared?.parentLocalityName || null,
      evidenceSource,
      materialConflict
    }];
  }));
  const evidenceSet = ids.map(id => endpointEvidenceById[id]).filter(Boolean);
  const hydratedIds = ids.filter(id => endpointEvidenceById[id]?.hydrated);
  const unresolvedIds = ids.filter(id => !endpointEvidenceById[id]?.hydrated);
  const primaryId = ids[0] || null;
  const primary = primaryId ? endpointEvidenceById[primaryId] : null;
  const allGroups = [...new Map(evidenceSet.flatMap(item => item.logicalGroupEvidence ?? []).map(group => [text(group.id), group]).filter(([id]) => id)).values()];
  const allStopAreas = [...new Map(evidenceSet.flatMap(item => item.stopAreas ?? []).map(area => [text(area.id) || normal(area.name), area])).values()];
  const allLocalities = [...new Map(evidenceSet.map(item => item.locality).filter(Boolean).map(locality => [text(locality.id || locality.code) || normal(locality.name), locality])).values()];
  const conflict = materiallyConflicts(evidenceSet) || evidenceSet.some(item => item.materialConflict);
  const runtimeHydratedIds = ids.filter(id => endpointEvidenceById[id]?.runtimeHydrated);
  const referenceHydratedIds = ids.filter(id => endpointEvidenceById[id]?.referenceHydrated);
  const preparedIds = ids.filter(id => endpointEvidenceById[id]?.preparedEvidence);
  const evidenceSource = conflict
    ? 'runtime-prepared-conflict'
    : runtimeHydratedIds.length && preparedIds.length ? 'runtime-and-prepared-exact-endpoint'
      : runtimeHydratedIds.length ? 'runtime-exact-endpoint'
        : referenceHydratedIds.length ? 'authoritative-reference-endpoint'
          : preparedIds.length ? 'prepared-exact-endpoint' : 'source-only';
  return {
    endpointStopPointId: primaryId,
    endpointStopPointIds: ids,
    primaryEndpointStopPointId: primaryId,
    requestedEndpointStopPointIds: ids,
    hydratedEndpointStopPointIds: hydratedIds,
    runtimeHydratedEndpointStopPointIds: runtimeHydratedIds,
    referenceHydratedEndpointStopPointIds: referenceHydratedIds,
    preparedEvidenceEndpointStopPointIds: preparedIds,
    unresolvedEndpointStopPointIds: unresolvedIds,
    endpointEvidenceById,
    endpointEvidenceSet: evidenceSet,
    endpointStopName: primary?.endpointStopName || null,
    logicalGroupRefs: primary?.logicalGroupRefs ?? [],
    primaryLogicalGroupEvidence: primary?.logicalGroupEvidence ?? [],
    logicalGroupEvidence: allGroups,
    primaryStopAreas: primary?.stopAreas ?? [],
    stopAreas: allStopAreas,
    stopArea: primary?.stopArea || null,
    nptgLocality: primary?.locality || null,
    nptgLocalities: allLocalities,
    nptgLocalityCode: primary?.nptgLocalityCode || null,
    nptgLocalityName: primary?.nptgLocalityName || null,
    parentLocalityId: primary?.parentLocalityId || null,
    parentLocalityName: primary?.parentLocalityName || null,
    partialExactCoverage: Boolean(hydratedIds.length && unresolvedIds.length),
    primaryHydrated: Boolean(primary?.hydrated),
    primaryUnresolvedWithSecondaryHydrated: Boolean(primaryId && !primary?.hydrated && hydratedIds.length),
    materialConflict: conflict,
    evidenceSource,
    exact: Boolean(hydratedIds.length),
    hydrated: Boolean(primary?.hydrated)
  };
}

/** Batch exact endpoint hydration for all service summaries. */
export async function resolvePlannerEndpointDecisions(services = [], referenceData = null, { forceRefresh = false } = {}) {
  const records = services ?? [];
  const ids = [...new Set(records.flatMap(service => ['origin', 'destination'].flatMap(side => endpointIdsForService(service, side))))];
  let hydrated = [];
  let referenceStops = [];
  let prepared = { warnings: [], provenance: {} };
  let referenceStopResolution = { ok: false, referenceStopPoints: [], warnings: [], provenance: {} };
  let reference = { ok: false, logicalGroups: [], localities: [], warnings: [], provenance: {} };
  let structure = { ok: false, structure: { groups: [], members: [] }, warnings: [], provenance: {} };
  if (ids.length && typeof referenceData?.resolvePreparedStopPointsByIds === 'function') {
    try {
      const result = await referenceData.resolvePreparedStopPointsByIds(ids, { forceRefresh });
      prepared = result && typeof result === 'object' ? result : prepared;
      hydrated = result?.physicalStops ?? result?.data ?? [];
      if (typeof referenceData.resolveStopReferences === 'function' && hydrated.length) reference = await referenceData.resolveStopReferences(hydrated, { forceRefresh });
      if (typeof referenceData.resolveStopAreaStructure === 'function' && hydrated.length) structure = await referenceData.resolveStopAreaStructure(hydrated, { forceRefresh });
    } catch (error) {
      prepared = { warnings: [`Exact endpoint physical StopPoint resolution failed softly: ${text(error?.message || error)}`], provenance: { failed: true } };
      reference = { ok: false, logicalGroups: [], localities: [], warnings: [], provenance: { failed: true } };
    }
  }
  const hydratedIds = new Set(hydrated.map(record => text(record.id)).filter(Boolean));
  const unresolvedReferenceIds = ids.filter(id => !hydratedIds.has(id));
  if (unresolvedReferenceIds.length && typeof referenceData?.resolveReferenceStopPointsByIds === 'function') {
    try {
      referenceStopResolution = await referenceData.resolveReferenceStopPointsByIds(unresolvedReferenceIds, { forceRefresh });
      referenceStops = referenceStopResolution?.referenceStopPoints ?? referenceStopResolution?.data ?? [];
      if (typeof referenceData.resolveStopReferences === 'function' && referenceStops.length) {
        const fallbackReference = await referenceData.resolveStopReferences(referenceStops, { forceRefresh });
        reference = {
          ...reference,
          logicalGroups: [...(reference.logicalGroups ?? []), ...(fallbackReference?.logicalGroups ?? [])],
          localities: [...(reference.localities ?? []), ...(fallbackReference?.localities ?? [])],
          warnings: [...(reference.warnings ?? []), ...(fallbackReference?.warnings ?? [])],
          provenance: { ...(reference.provenance ?? {}), authoritativeEndpointReferences: fallbackReference?.provenance ?? {} }
        };
      }
    } catch (error) {
      referenceStopResolution = { ok: false, referenceStopPoints: [], warnings: [`Exact endpoint authoritative reference resolution failed softly: ${text(error?.message || error)}`], provenance: { failed: true } };
    }
  }
  const hydratedById = new Map(hydrated.map(record => [text(record.id), record]));
  const referenceById = new Map(referenceStops.map(record => [text(record.id), record]).filter(([key]) => key));
  const localities = reference?.localities ?? [];
  const localitiesById = new Map(localities.flatMap(locality => [[text(locality.code), locality], [text(locality.id), locality], [text(locality.id).replace(/^nptg:/, ''), locality]]).filter(([key]) => key));
  const groups = reference?.logicalGroups ?? [];
  const structureGroups = structure?.structure?.groups ?? structure?.data?.groups ?? [];
  const groupsById = new Map([...groups, ...structureGroups].map(group => [text(group.id), group]).filter(([key]) => key));
  const warnings = [...new Set([...(prepared?.warnings ?? []), ...(reference?.warnings ?? []), ...(structure?.warnings ?? [])])];
  const enriched = records.map(service => {
    const decisions = {};
    for (const side of ['origin', 'destination']) {
      const idsForSide = endpointIdsForService(service, side);
      const exactEvidence = idsForSide.length ? endpointEvidenceForRecord(service, side, hydratedById, referenceById, localitiesById, groupsById) : endpointFromService(service, side);
      const decision = makePlannerEndpointDecision({ rawEndpointText: side === 'origin' ? service.origin : service.destination, endpoint: exactEvidence, provider: providerFor(service), sourceRecordId: service.id, provenance: { exactRequestedIds: exactEvidence.requestedEndpointStopPointIds ?? [], exactHydratedIds: exactEvidence.hydratedEndpointStopPointIds ?? [], exactUnresolvedIds: exactEvidence.unresolvedEndpointStopPointIds ?? [], runtimeHydratedIds: exactEvidence.runtimeHydratedEndpointStopPointIds ?? [], preparedEvidenceIds: exactEvidence.preparedEvidenceEndpointStopPointIds ?? [], primaryEndpointStopPointId: exactEvidence.primaryEndpointStopPointId ?? null, partialExactCoverage: Boolean(exactEvidence.partialExactCoverage), materialConflict: Boolean(exactEvidence.materialConflict), evidenceSource: exactEvidence.evidenceSource || null, reference: reference?.provenance ?? {}, stopArea: structure?.provenance ?? {} } });
      decisions[side] = decision;
    }
    return Object.freeze({ ...service, originEndpointEvidence: decisions.origin.evidence, destinationEndpointEvidence: decisions.destination.evidence, originEndpointDecision: decisions.origin, destinationEndpointDecision: decisions.destination, endpointResolutionWarnings: Object.freeze(warnings) });
  });
  const finalWarnings = [...new Set([...warnings, ...(referenceStopResolution?.warnings ?? [])])];
  return Object.freeze({
    services: Object.freeze(enriched),
    warnings: Object.freeze(finalWarnings),
    provenance: Object.freeze({
      exactRequestedIds: ids.sort(),
      exactHydratedIds: [...new Set([...hydratedById.keys(), ...referenceById.keys()])].sort(),
      runtimeHydratedIds: [...hydratedById.keys()].sort(),
      referenceHydratedIds: [...referenceById.keys()].sort(),
      exactUnresolvedIds: ids.filter(id => !hydratedById.has(id) && !referenceById.has(id)).sort(),
      physicalStops: prepared?.provenance ?? {},
      authoritativeReferenceStops: referenceStopResolution?.provenance ?? {},
      nptg: reference?.provenance ?? {},
      stopArea: structure?.provenance ?? {},
      preparedEndpointEvidence: 'persisted-in-service-records'
    })
  });
}

export const PlannerEndpointDecision = makePlannerEndpointDecision;
