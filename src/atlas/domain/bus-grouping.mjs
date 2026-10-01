/**
 * BUS-GROUP domain decisions.
 *
 * This module deliberately contains no presentation code.  It records the
 * evidence used to turn source timetable summaries into public-service groups
 * and to decide whether an assessed place is a proven terminus.
 */

function text(value) { return String(value ?? '').trim(); }
function normal(value) { return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function unique(values) { return [...new Set((values ?? []).map(text).filter(Boolean))]; }

const UNSPECIFIED_OPERATOR = /^(?:operator|operator name)\s+not supplied(?: in the timetable)?$|^unknown(?: operator)?$/i;

export function isUnspecifiedOperator(value) {
  return !text(value) || UNSPECIFIED_OPERATOR.test(text(value));
}

export function sourceProvider(service = {}) {
  return text(service.provider || service.timetableSource || service.source?.provider || service.sourceFile || service.source?.sourceFile);
}

export function sourceAuthorityRank(service = {}) {
  const provider = normal(sourceProvider(service));
  if (/^(?:tfl|transport for london)$/.test(provider) || provider.includes('transport for london')) return 3;
  if (/^(?:bods|tnds|national|national bus)/.test(provider)) return 2;
  return provider ? 1 : 0;
}

export function endpointPlaceKeys(service = {}, side = 'destination') {
  const decision = service?.[`${side}EndpointDecision`] || {};
  const evidence = decision.evidence || decision.exactEvidence || {};
  const exact = Boolean(decision.exactEvidence || decision.exact || evidence.endpoint || evidence.endpointEvidenceSet?.length
    || /^exact-|prepared-exact|runtime-and-prepared/.test(text(decision.decisionType) + ' ' + text(decision.evidenceSource)));
  if (!exact) return [];
  const keys = [];
  const add = (prefix, values) => unique(values).forEach(value => keys.push(`${prefix}:${value}`));
  const stopAreas = [
    decision.stopArea?.id,
    ...(decision.stopAreas ?? []).map(area => area?.id),
    evidence.stopArea?.id,
    ...(evidence.stopAreas ?? []).map(area => area?.id),
    ...(decision.endpointLogicalGroupIds ?? []),
    ...(evidence.endpointLogicalGroupIds ?? [])
  ].filter(Boolean);
  add('stop-area', stopAreas.map(value => normal(value)));
  add('place', [decision.endpointLogicalPlaceId, evidence.endpointLogicalPlaceId, decision.logicalPlaceId, evidence.logicalPlaceId].map(normal));
  add('stop-point', [
    decision.primaryEndpointStopPointId,
    decision.endpointStopPointId,
    ...(decision.endpointStopPointIds ?? []),
    evidence.endpointStopPointId,
    ...(evidence.endpointStopPointIds ?? [])
  ].map(normal));
  add('place-name', [decision.chosenDisplayName, decision.chosen, evidence.stopArea?.name, ...(evidence.stopAreas ?? []).map(area => area?.name)].map(normal));
  return unique(keys);
}

export function endpointIdentity(service = {}, side = 'destination') {
  const exactKeys = endpointPlaceKeys(service, side);
  if (exactKeys.length) return exactKeys[0];
  const raw = text(service?.[side]);
  return raw && !/^(?:origin|destination) not supplied|destination not resolved$/i.test(raw) ? `source:${normal(raw)}` : '';
}

function endpointDisplay(service, side) {
  const decision = service?.[`${side}EndpointDecision`];
  return text(decision?.chosenDisplayName || decision?.chosen || service?.[side]);
}

function endpointStopIds(service, side) {
  const decision = service?.[`${side}EndpointDecision`] || {};
  return unique([
    service?.[`${side}StopPointId`],
    ...(service?.[`${side}StopPointIds`] ?? []),
    decision.primaryEndpointStopPointId,
    decision.endpointStopPointId,
    ...(decision.endpointStopPointIds ?? [])
  ]);
}

function endpointIsExact(service, side) {
  const decision = service?.[`${side}EndpointDecision`] || {};
  return Boolean(decision.exactEvidence || decision.exact || decision.evidence?.endpointEvidenceSet?.length
    || /^exact-|prepared-exact|runtime-and-prepared/.test(text(decision.decisionType) + ' ' + text(decision.evidenceSource)));
}

function pattern(service) { return unique(service?.routePatternStopIds ?? []); }
function patternNames(service) { return unique((service?.routePatternStops ?? service?.routePatternStopNames ?? []).map(stop => typeof stop === 'string' ? stop : stop?.name || stop?.commonName)); }

function strictSubsequenceServices(shorterService, longerService) {
  const shorter = pattern(shorterService), longer = pattern(longerService);
  if (!shorter.length || shorter.length >= longer.length) return false;
  let cursor = 0;
  for (let index = 0; index < shorter.length; index += 1) {
    const value = shorter[index];
    let found = longer.indexOf(value, cursor);
    // Different physical stands can represent the same exact endpoint
    // StopArea.  Treat only the ordered endpoint position as equivalent; do
    // not turn ordinary internal stop-name similarity into grouping evidence.
    if (index === 0 && cursor === 0 && found < 0
      && endpointIdentity(shorterService, 'origin')
      && endpointIdentity(shorterService, 'origin') === endpointIdentity(longerService, 'origin')) found = 0;
    if (found < 0) return false;
    cursor = found + 1;
  }
  return true;
}

function serviceId(service) { return text(service.id || service.sourceRecordId); }
function sourceRecordIds(services) { return unique(services.flatMap(service => service.sourceRecordIds ?? [serviceId(service)])); }
function lineageIds(service) { return unique([service.serviceLineageId, ...(service.sourceRouteIds ?? []), service.routeId, service.source?.routeId]); }
function calendarIds(service) { return unique([service.calendarProfileId, ...(service.calendarEvidence ?? []).map(item => item?.calendarProfileId)]); }

function principalDestination(service) {
  return endpointDisplay(service, 'destination') || text(service.destination);
}

function destinationValues(services) {
  return unique(services.map(service => principalDestination(service))).filter(value => value && !/^(?:destination not supplied|destination not resolved)$/i.test(value));
}

function serviceAuthority(services) {
  const ranks = services.map(sourceAuthorityRank);
  return ranks.some(rank => rank === 3) ? 'TfL' : ranks.some(rank => rank === 2) ? 'national' : ranks.some(rank => rank > 0) ? 'other' : 'unresolved';
}

export function makePublicServiceGroupingDecision({
  services = [],
  principal = services[0] || null,
  publicRouteFamilyKey = null,
  ambiguousServices = []
} = {}) {
  const records = [...services];
  const mainPattern = pattern(principal);
  const shortWorkingRecords = records.filter(service => service !== principal && strictSubsequenceServices(service, principal));
  const destinations = destinationValues(records);
  const mainDestination = principal ? principalDestination(principal) : '';
  const alternateDestinations = destinations.filter(value => value !== mainDestination);
  const branchRecords = records.filter(service => service !== principal && !shortWorkingRecords.includes(service)
    && (endpointIdentity(service, 'origin') !== endpointIdentity(principal, 'origin')
      || endpointIdentity(service, 'destination') !== endpointIdentity(principal, 'destination')
      || text(service.routeNumber).toUpperCase() !== text(principal?.routeNumber).toUpperCase()));
  const patternEvidence = records.map(service => Object.freeze({
    sourceRecordId: serviceId(service) || null,
    orderedRoutePatternStopIds: Object.freeze(pattern(service)),
    orderedPatternPlaces: Object.freeze(patternNames(service)),
    endpoint: Object.freeze({ origin: endpointDisplay(service, 'origin') || null, destination: principalDestination(service) || null })
  }));
  const decision = ambiguousServices.length ? 'unresolved-review' : records.length > 1 ? 'same-public-service' : 'single-source-public-service';
  const reason = ambiguousServices.length
    ? 'One or more source records could connect to materially different corridors; the ambiguous evidence was retained and no unsafe consolidation was made.'
    : records.length > 1
      ? 'Source records share the route-family, endpoint/place, ordered-pattern, physical-stop, lineage or timetable evidence required for one public-service direction.'
      : 'One source record forms a public-service group; no source equivalence was asserted.';
  return Object.freeze({
    type: 'PublicServiceGroupingDecision',
    decision,
    reason,
    publicRouteFamilyKey: publicRouteFamilyKey || null,
    routeNumber: text(principal?.routeNumber) || null,
    routeFamily: text(publicRouteFamilyKey || principal?.routeNumber) || null,
    sourceRecordIds: Object.freeze(sourceRecordIds(records)),
    groupedSourceRecordIds: Object.freeze(sourceRecordIds(records)),
    providers: Object.freeze(unique(records.map(sourceProvider))),
    authority: serviceAuthority(records),
    operators: Object.freeze(unique(records.map(service => service.operator))),
    sourceLineageIds: Object.freeze(unique(records.flatMap(lineageIds))),
    endpointPlaceIds: Object.freeze({
      origin: Object.freeze(unique(records.map(service => endpointPlaceKeys(service, 'origin')[0]))),
      destination: Object.freeze(unique(records.map(service => endpointPlaceKeys(service, 'destination')[0])))
    }),
    assessedStopPointIds: Object.freeze(unique(records.flatMap(service => [...(service.assessedStops ?? []), ...(service.stopIds ?? [])]))),
    orderedPatternEvidence: Object.freeze(patternEvidence),
    principalPattern: Object.freeze({
      sourceRecordId: serviceId(principal) || null,
      orderedRoutePatternStopIds: Object.freeze(mainPattern),
      orderedPatternPlaces: Object.freeze(patternNames(principal))
    }),
    shortWorkingRecordIds: Object.freeze(shortWorkingRecords.map(serviceId).filter(Boolean)),
    branchVariantRecordIds: Object.freeze(branchRecords.map(serviceId).filter(Boolean)),
    alternateDestinations: Object.freeze(alternateDestinations),
    materialDestinationEvidence: Object.freeze(destinationValues(records)),
    calendarProfiles: Object.freeze(unique(records.flatMap(calendarIds))),
    ambiguousRecordIds: Object.freeze(ambiguousServices.map(serviceId).filter(Boolean)),
    deduplicatedSourceRecordIds: Object.freeze([]),
    retainedAmbiguousRecordIds: Object.freeze(ambiguousServices.map(serviceId).filter(Boolean))
  });
}

function stopPlaceKeys(stop = {}) {
  const keys = [];
  const add = (prefix, values) => unique(values).forEach(value => keys.push(`${prefix}:${normal(value)}`));
  add('stop-area', [stop.stopAreaId, stop.stopArea?.id, stop.logicalGroupId, ...(stop.logicalGroupIds ?? []), ...(stop.logicalGroupRefs ?? []).map(ref => ref?.id)]);
  add('place', [stop.stopAreaName, stop.stopArea?.name, stop.logicalGroupName, stop.logicalGroupLabel]);
  return unique(keys);
}

function assessedPlace(stops, matchedStop) {
  return text(matchedStop?.stopAreaName || matchedStop?.stopArea?.name || matchedStop?.logicalGroupName || matchedStop?.logicalGroupLabel || matchedStop?.name) || 'Assessed stop/place';
}

function endpointMatchesAssessed(service, side, stopsById, assessedKeys) {
  if (!endpointIsExact(service, side)) return { matched: false, proof: false, through: false, stopIds: [], place: null };
  const ids = endpointStopIds(service, side);
  const matchingStops = ids.map(id => stopsById.get(id)).filter(stop => stop && (assessedKeys.has(`stop-point:${normal(stop.id || stop.sourceId)}`) || stopPlaceKeys(stop).some(key => assessedKeys.has(key))));
  const exactStopMatch = matchingStops.length > 0;
  const endpointKeys = endpointPlaceKeys(service, side);
  const matchingPlace = endpointKeys.find(key => assessedKeys.has(key));
  const placeStop = matchingStops.find(stop => stopPlaceKeys(stop).some(key => assessedKeys.has(key))) || null;
  const matched = exactStopMatch || Boolean(matchingPlace || placeStop);
  const places = matchingStops.length ? matchingStops : placeStop ? [placeStop] : [];
  const place = places[0] || null;
  return { matched, proof: false, through: false, stopIds: ids, place };
}

function patternPositionProof(service, side, stopsById, assessedKeys) {
  const routePattern = pattern(service);
  if (routePattern.length < 2) return { terminal: false, through: false };
  const index = side === 'origin' ? 0 : routePattern.length - 1;
  const terminalId = routePattern[index];
  const terminalStop = stopsById.get(terminalId);
  const terminalKeys = new Set([...stopPlaceKeys(terminalStop), ...endpointPlaceKeys(service, side)]);
  const terminalMatches = stopsById.has(terminalId) && [...terminalKeys].some(key => assessedKeys.has(key));
  const internalMatches = routePattern.slice(1, -1).some(id => {
    const stop = stopsById.get(id);
    return id && (assessedKeys.has(`stop-point:${normal(id)}`) || stopPlaceKeys(stop).some(key => assessedKeys.has(key)));
  });
  return { terminal: terminalMatches, through: internalMatches && !terminalMatches };
}

export function makeTerminusDecision({ services = [], principal = services[0] || null, assessedStops = [], publicPlace = null } = {}) {
  const stopsById = new Map((assessedStops ?? []).map(stop => [text(stop.id || stop.sourceId), stop]).filter(([id]) => id));
  const placeCounts = new Map();
  for (const stop of assessedStops ?? []) {
    for (const key of stopPlaceKeys(stop).filter(value => /^(?:stop-area|place):/.test(value))) placeCounts.set(key, (placeCounts.get(key) ?? 0) + 1);
  }
  const targetPlaceKey = [...placeCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || null;
  const targetStops = targetPlaceKey
    ? (assessedStops ?? []).filter(stop => stopPlaceKeys(stop).includes(targetPlaceKey))
    : (assessedStops ?? []).slice(0, 1);
  const assessedKeys = new Set(targetStops.flatMap(stop => [`stop-point:${normal(stop.id || stop.sourceId)}`, ...stopPlaceKeys(stop)]));
  const sides = {};
  for (const side of ['origin', 'destination']) {
    const matched = endpointMatchesAssessed(principal, side, stopsById, assessedKeys);
    const proof = patternPositionProof(principal, side, stopsById, assessedKeys);
    sides[side] = { ...matched, proof: proof.terminal, through: proof.through };
  }
  const provenSides = Object.entries(sides).filter(([, evidence]) => evidence.matched && evidence.proof).map(([side]) => side);
  const through = Object.values(sides).some(evidence => evidence.through);
  const firstPlace = sides.origin.place || sides.destination.place;
  const place = text(publicPlace || assessedPlace(assessedStops, firstPlace));
  const exactEndpointEvidence = ['origin', 'destination'].some(side => endpointIsExact(principal, side));
  let status = 'not-assessed-endpoint';
  let presentation = 'none';
  let reason = 'The assessed place was not established as an ordered endpoint of the principal public pattern.';
  if (through) {
    status = 'through-service';
    reason = 'The assessed place appears inside the ordered principal pattern; the service continues beyond it.';
  } else if (provenSides.length && exactEndpointEvidence) {
    status = 'proven-terminus';
    presentation = provenSides.includes('origin') && !provenSides.includes('destination') ? 'departing-only'
      : provenSides.includes('destination') && !provenSides.includes('origin') ? 'arrival-only-suppress'
        : 'departing-and-arriving';
    reason = 'The BUS-DEST exact endpoint/place identity agrees with the ordered principal pattern endpoint; StopArea-level evidence may span different physical stands.';
  } else if (sides.origin.matched || sides.destination.matched) {
    status = 'unresolved-review';
    reason = 'The assessed place matched endpoint evidence, but ordered endpoint proof was incomplete; arrival suppression was not applied.';
  }
  return Object.freeze({
    type: 'TerminusDecision',
    status,
    presentation,
    proven: status === 'proven-terminus',
    assessedPlace: place || null,
    terminalSides: Object.freeze(provenSides),
    terminalStopPointIds: Object.freeze(unique(provenSides.flatMap(side => sides[side].stopIds))),
    arrivalEvidence: Object.freeze(provenSides.includes('destination') ? sourceRecordIds(services) : []),
    departureEvidence: Object.freeze(provenSides.includes('origin') ? sourceRecordIds(services) : []),
    reason,
    note: status === 'proven-terminus' ? `${place} is the route terminus.` : null,
    evidence: Object.freeze({
      principalSourceRecordId: serviceId(principal) || null,
      endpointSides: Object.freeze(Object.fromEntries(Object.entries(sides).map(([side, evidence]) => [side, Object.freeze({
        matched: evidence.matched,
        orderedEndpointProof: evidence.proof,
        through: evidence.through,
        endpointStopPointIds: Object.freeze(evidence.stopIds)
      })]))),
      assessedStopPointIds: Object.freeze(targetStops.map(stop => text(stop.id || stop.sourceId)).filter(Boolean)),
      assessedPlaceKeys: Object.freeze([...assessedKeys])
    })
  });
}

export const PublicServiceGroupingDecision = makePublicServiceGroupingDecision;
export const TerminusDecision = makeTerminusDecision;
