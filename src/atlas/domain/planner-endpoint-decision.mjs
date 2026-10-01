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
  const groups = endpoint.logicalGroupEvidence ?? endpoint.logicalGroups ?? [];
  const ids = unique([
    ...(endpoint.endpointLogicalGroupIds ?? []),
    ...(endpoint.logicalGroupIds ?? []),
    ...(endpoint.logicalGroupRefs ?? []).map(ref => ref?.id)
  ]);
  return { ids, evidence: Array.isArray(groups) ? groups.filter(Boolean) : [] };
}

function stopAreaEvidence(endpoint = {}, groups) {
  const explicit = endpoint.stopArea ?? endpoint.stopAreaEvidence ?? null;
  const candidates = [explicit, ...(groups.evidence ?? [])].filter(Boolean);
  const byName = candidates.find(candidate => usable(candidate.name || candidate.stopAreaName));
  const id = text(explicit?.id || explicit?.logicalGroupId || groups.evidence[0]?.id || groups.ids[0]) || null;
  const name = firstName(explicit?.name, explicit?.stopAreaName, byName?.name, byName?.stopAreaName);
  return { id, name, evidence: candidates };
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

  const decision = {
    rawEndpointText: raw || null,
    raw: raw || null,
    endpointStopPointId: ids[0] || null,
    endpointStopPointIds: Object.freeze(ids),
    endpointStopName: firstName(endpoint.endpointStopName, endpoint.stopName),
    endpointLogicalGroupIds: Object.freeze(groups.ids),
    endpointLogicalPlaceName: firstName(endpoint.endpointLogicalPlaceName, endpoint.logicalPlaceName, stopArea.name),
    nptgLocalityCode: locality.code,
    nptgLocalityName: locality.name,
    parentLocalityId: locality.parentId,
    parentLocalityName: locality.parentName,
    stopArea: Object.freeze({ id: stopArea.id, name: stopArea.name }),
    stopAreaEvidence: Object.freeze(stopArea.evidence),
    chosenPlaceName: chosen || null,
    chosenDisplayName: chosen || null,
    chosen: chosen || null,
    decisionType,
    reason,
    provider: text(provider) || null,
    sourceRecordId: text(sourceRecordId) || null,
    conflict,
    unresolved,
    exactEvidence: hasExactEvidence,
    provenance: provenance || null,
    evidence: Object.freeze({ endpoint: endpoint.exactEvidence || endpoint, locality, stopArea: { id: stopArea.id, name: stopArea.name } })
  };
  return Object.freeze(decision);
}

function endpointFromService(service, side) {
  const suffix = side === 'origin' ? 'Origin' : 'Destination';
  const pattern = Array.isArray(service?.routePatternStops) ? service.routePatternStops : [];
  const patternEndpoint = side === 'origin' ? pattern[0] : pattern.at(-1);
  const ids = unique([
    service?.[`${side}StopPointId`],
    ...(service?.[`${side}StopPointIds`] ?? []),
    // Existing ordered pattern evidence is accepted only as an exact
    // provider endpoint when it carries its own identity and locality data.
    patternEndpoint?.id && (patternEndpoint?.nptgLocalityCode || patternEndpoint?.nptgLocalityName || patternEndpoint?.stopArea || patternEndpoint?.logicalGroupRefs) ? patternEndpoint.id : null
  ]);
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
    hydrated: Boolean(service?.[`${side}EndpointEvidence`]?.hydrated),
    ...(service?.[`${side}EndpointEvidence`] ?? {})
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
  return unique([service?.[`${side}StopPointId`], ...(service?.[`${side}StopPointIds`] ?? [])]);
}

function endpointEvidenceForRecord(record, side, hydratedById, localitiesById, groupsById, stopAreasById) {
  const ids = endpointIdsForService(record, side);
  const id = ids[0] || null;
  const hydrated = id ? hydratedById.get(id) : null;
  const locality = hydrated ? localitiesById.get(text(hydrated.nptgLocalityCode)) || localitiesById.get(`nptg:${text(hydrated.nptgLocalityCode)}`) : null;
  const groupRefs = hydrated?.logicalGroupRefs ?? [];
  const groups = groupRefs.map(ref => groupsById.get(text(ref.id))).filter(Boolean);
  const stopArea = groups.find(group => usable(group.name)) || (id ? stopAreasById.get(id) : null) || null;
  const evidence = {
    ...(hydrated ?? {}),
    endpointStopPointId: id,
    endpointStopPointIds: ids,
    endpointStopName: hydrated?.name || null,
    logicalGroupRefs: groupRefs,
    logicalGroupEvidence: groups,
    nptgLocality: locality || hydrated?.nptgLocality || null,
    nptgLocalityCode: hydrated?.nptgLocalityCode || locality?.code || null,
    nptgLocalityName: locality?.name || hydrated?.nptgLocalityName || null,
    parentLocalityId: locality?.parentLocalityId || locality?.parentLocality?.id || hydrated?.parentLocalityId || null,
    parentLocalityName: locality?.parentLocalityName || locality?.parentLocality?.name || hydrated?.parentLocalityName || null,
    stopArea: stopArea ? { id: stopArea.id, name: stopArea.name } : null,
    materialConflict: ids.length > 1 && new Set([
      ...ids.map(endpointId => text(hydratedById.get(endpointId)?.logicalGroupRefs?.map(ref => groupsById.get(text(ref.id))?.name).find(Boolean))),
      ...ids.map(endpointId => text(hydratedById.get(endpointId)?.nptgLocalityName || localitiesById.get(text(hydratedById.get(endpointId)?.nptgLocalityCode))?.name)),
      ...ids.map(endpointId => text(hydratedById.get(endpointId)?.name))
    ].filter(Boolean).map(normal)).size > 1,
    exact: Boolean(hydrated),
    hydrated: Boolean(hydrated)
  };
  return evidence;
}

/** Batch exact endpoint hydration for all service summaries. */
export async function resolvePlannerEndpointDecisions(services = [], referenceData = null, { forceRefresh = false } = {}) {
  const records = services ?? [];
  const ids = [...new Set(records.flatMap(service => ['origin', 'destination'].flatMap(side => endpointIdsForService(service, side))))];
  let hydrated = [];
  let reference = { ok: false, logicalGroups: [], localities: [], warnings: [], provenance: {} };
  let structure = { ok: false, structure: { groups: [], members: [] }, warnings: [], provenance: {} };
  if (ids.length && typeof referenceData?.resolvePreparedStopPointsByIds === 'function') {
    try {
      const result = await referenceData.resolvePreparedStopPointsByIds(ids, { forceRefresh });
      hydrated = result?.physicalStops ?? result?.data ?? [];
      if (typeof referenceData.resolveStopReferences === 'function' && hydrated.length) reference = await referenceData.resolveStopReferences(hydrated, { forceRefresh });
      if (typeof referenceData.resolveStopAreaStructure === 'function' && hydrated.length) structure = await referenceData.resolveStopAreaStructure(hydrated, { forceRefresh });
    } catch (error) {
      reference = { ok: false, logicalGroups: [], localities: [], warnings: [`Exact endpoint reference resolution failed softly: ${text(error?.message || error)}`], provenance: { failed: true } };
    }
  }
  const hydratedById = new Map(hydrated.map(record => [text(record.id), record]));
  const localities = reference?.localities ?? [];
  const localitiesById = new Map(localities.flatMap(locality => [[text(locality.code), locality], [text(locality.id), locality], [text(locality.id).replace(/^nptg:/, ''), locality]]).filter(([key]) => key));
  const groups = reference?.logicalGroups ?? [];
  const structureGroups = structure?.structure?.groups ?? structure?.data?.groups ?? [];
  const groupsById = new Map([...groups, ...structureGroups].map(group => [text(group.id), group]).filter(([key]) => key));
  const members = structure?.structure?.members ?? structure?.data?.members ?? [];
  const stopAreasById = new Map(members.map(member => [text(member.id), member]).filter(([key]) => key));
  const warnings = [...new Set([...(reference?.warnings ?? []), ...(structure?.warnings ?? [])])];
  const enriched = records.map(service => {
    const decisions = {};
    for (const side of ['origin', 'destination']) {
      const idsForSide = endpointIdsForService(service, side);
      const exactEvidence = idsForSide.length ? endpointEvidenceForRecord(service, side, hydratedById, localitiesById, groupsById, stopAreasById) : endpointFromService(service, side);
      const decision = makePlannerEndpointDecision({ rawEndpointText: side === 'origin' ? service.origin : service.destination, endpoint: exactEvidence, provider: providerFor(service), sourceRecordId: service.id, provenance: { exactRequestedIds: ids, exactHydratedIds: [...hydratedById.keys()].sort(), reference: reference?.provenance ?? {}, stopArea: structure?.provenance ?? {} } });
      decisions[side] = decision;
    }
    return Object.freeze({ ...service, originEndpointEvidence: decisions.origin.evidence, destinationEndpointEvidence: decisions.destination.evidence, originEndpointDecision: decisions.origin, destinationEndpointDecision: decisions.destination, endpointResolutionWarnings: Object.freeze(warnings) });
  });
  return Object.freeze({ services: Object.freeze(enriched), warnings: Object.freeze(warnings), provenance: Object.freeze({ exactRequestedIds: ids.sort(), exactHydratedIds: [...hydratedById.keys()].sort(), exactUnresolvedIds: ids.filter(id => !hydratedById.has(id)).sort(), nptg: reference?.provenance ?? {}, stopArea: structure?.provenance ?? {} }) });
}

export const PlannerEndpointDecision = makePlannerEndpointDecision;
