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

function endpointEvidenceEntries(service = {}, side = 'destination') {
  const evidence = service?.endpointEvidence?.[side];
  if (!evidence || typeof evidence !== 'object') return [];
  return Object.entries(evidence).map(([id, value]) => ({ id, ...(value && typeof value === 'object' ? value : {}) }));
}

const UNSPECIFIED_OPERATOR = /^(?:operator|operator name)\s+not supplied(?: in the timetable)?$|^unknown(?: operator)?$/i;

export function isUnspecifiedOperator(value) {
  return !text(value) || UNSPECIFIED_OPERATOR.test(text(value));
}

export function sourceProvider(service = {}) {
  const explicit = text(service.provider || service.source?.provider || service.source?.sourceProvider || service.sourceFile || service.source?.sourceFile);
  if (explicit) return explicit;
  const timetable = text(service.timetableSource);
  if (/^tfl\b/i.test(timetable)) return 'TfL';
  if (/^bods\b/i.test(timetable)) return 'BODS';
  if (/^tnds\b/i.test(timetable)) return 'TNDS';
  const provenance = normal(service.source?.provenance);
  if (provenance.includes('bods')) return 'BODS';
  if (provenance.includes('tnds')) return 'TNDS';
  return '';
}

export function sourceAuthorityRank(service = {}) {
  const values = value => Array.isArray(value) ? value : value ? [value] : [];
  const providers = unique([
    sourceProvider(service),
    ...values(service?.sourceProviders),
    ...values(service?.sourceAuthorities),
    service?.timetableSource,
    service?.source?.provider,
    service?.source?.supplementaryProvider
  ]).map(normal);
  if (providers.some(provider => /^(?:tfl|transport for london)$/.test(provider) || provider.includes('transport for london'))) return 3;
  if (providers.some(provider => /^(?:bods|tnds|national|national bus)/.test(provider))) return 2;
  return providers.some(Boolean) ? 1 : 0;
}

const ACCEPTED_EXACT_MATCH_METHOD = /^(?:gtfs-stop-id-equals-atco-code|gtfs-stop-code-equals-naptan-code|exact(?:-|$)|tfl(?:-|$))/i;

function preparedEndpointIsResolved(entry = {}) {
  const methods = unique([entry.exactMatchMethod, ...(entry.exactMatchMethods ?? [])]);
  return Boolean(text(entry.resolvedStopPointId) && methods.some(method => ACCEPTED_EXACT_MATCH_METHOD.test(method)));
}

function decisionEndpointIsResolved(decision = {}) {
  if (!decision || decision.conflict || decision.unresolved || decision.partialExactCoverage) return false;
  const ids = unique([decision.primaryEndpointStopPointId, decision.endpointStopPointId, ...(decision.endpointStopPointIds ?? [])]);
  if (!ids.length) return false;
  const type = normal(decision.decisionType);
  const source = normal(decision.evidenceSource);
  return decision.exact === true || decision.exactEvidence === true
    || /exact endpoint resolved|prepared exact endpoint|runtime exact endpoint|exact endpoint/.test(`${type} ${source}`);
}

function tflOrderedEndpointIsResolved(service, side) {
  if (sourceAuthorityRank(service) !== 3) return false;
  const ids = unique([service?.[`${side}StopPointId`], ...(service?.[`${side}StopPointIds`] ?? [])]);
  const routePattern = pattern(service);
  const endpointId = side === 'origin' ? routePattern[0] : routePattern.at(-1);
  const endpoint = Array.isArray(service?.routePatternStops)
    ? (side === 'origin' ? service.routePatternStops[0] : service.routePatternStops.at(-1))
    : null;
  return Boolean(endpointId && ids.includes(endpointId) && endpoint && (
    endpoint.nptgLocalityCode || endpoint.nptgLocalityName || endpoint.stopArea || endpoint.logicalGroupRefs?.length || endpoint.exactEvidence
  ));
}

/**
 * The only authoritative gate for BUS-GROUP exact endpoint/place logic.
 * Evidence containers are audit material; they become exact only when they
 * carry a resolved identity and an accepted exact-match contract.
 */
export function hasResolvedExactEndpointEvidence(service = {}, side = 'destination') {
  const decision = service?.[`${side}EndpointDecision`] || {};
  if (decisionEndpointIsResolved(decision)) return true;
  const entries = endpointEvidenceEntries(service, side);
  if (entries.length && entries.every(preparedEndpointIsResolved)) return true;
  return tflOrderedEndpointIsResolved(service, side);
}

export function endpointPlaceKeys(service = {}, side = 'destination') {
  const decision = service?.[`${side}EndpointDecision`] || {};
  const evidence = decision.evidence || decision.exactEvidence || {};
  const preparedEntries = endpointEvidenceEntries(service, side);
  const resolvedPreparedEntries = preparedEntries.filter(preparedEndpointIsResolved);
  const exact = hasResolvedExactEndpointEvidence(service, side);
  if (!exact) return [];
  const keys = [];
  const add = (prefix, values) => unique(values).forEach(value => keys.push(`${prefix}:${value}`));
  const orderedPattern = pattern(service);
  const patternEndpoint = Array.isArray(service?.routePatternStops)
    ? (side === 'origin' ? service.routePatternStops[0] : service.routePatternStops.at(-1))
    : null;
  const stopAreas = [
    decision.stopArea?.id,
    ...(decision.stopAreas ?? []).map(area => area?.id),
    evidence.stopArea?.id,
    ...(evidence.stopAreas ?? []).map(area => area?.id),
    ...(decision.endpointLogicalGroupIds ?? []),
    ...(evidence.endpointLogicalGroupIds ?? []),
    ...resolvedPreparedEntries.flatMap(entry => [
      ...(entry.stopAreas ?? []).map(area => area?.id),
      ...(entry.logicalGroupRefs ?? []).map(ref => ref?.id)
    ]),
    patternEndpoint?.stopArea?.id,
    ...(patternEndpoint?.logicalGroupRefs ?? []).map(ref => ref?.id),
    ...(patternEndpoint?.logicalGroupIds ?? [])
  ].filter(Boolean);
  add('stop-area', stopAreas.map(value => normal(value)));
  add('place', [decision.endpointLogicalPlaceId, evidence.endpointLogicalPlaceId, decision.logicalPlaceId, evidence.logicalPlaceId,
    ...resolvedPreparedEntries.map(entry => entry.nptgLocalityName), patternEndpoint?.nptgLocalityName, patternEndpoint?.localityName].map(normal));
  add('stop-point', [
    decision.primaryEndpointStopPointId,
    decision.endpointStopPointId,
    ...(decision.endpointStopPointIds ?? []),
    evidence.endpointStopPointId,
    ...(evidence.endpointStopPointIds ?? []),
    ...resolvedPreparedEntries.map(entry => entry.resolvedStopPointId),
    service?.[`${side}StopPointId`],
    ...(service?.[`${side}StopPointIds`] ?? []),
    orderedPattern[side === 'origin' ? 0 : -1]
  ].map(normal));
  add('place-name', [decision.chosenDisplayName, decision.chosen, evidence.stopArea?.name, ...(evidence.stopAreas ?? []).map(area => area?.name),
    ...resolvedPreparedEntries.flatMap(entry => [entry.naptanCommonName, ...(entry.stopAreas ?? []).map(area => area?.name)])].map(normal));
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
  if (text(decision?.chosenDisplayName || decision?.chosen)) return text(decision.chosenDisplayName || decision.chosen);
  const evidence = endpointEvidenceEntries(service, side)[0];
  const name = text(evidence?.naptanCommonName || evidence?.stopAreas?.[0]?.name);
  const locality = text(evidence?.nptgLocalityName);
  if (name && locality && /^(?:bus|coach) station$/i.test(name)) return `${locality} ${name}`;
  return name || text(service?.[side]);
}

function sourceEndpointPair(service) {
  return ['origin', 'destination'].map(side => normal(endpointDisplay(service, side)));
}

function sameSourceEndpointPair(first, second) {
  const left = sourceEndpointPair(first), right = sourceEndpointPair(second);
  return left.every(Boolean) && right.every(Boolean) && left.every((value, index) => value === right[index]);
}

function endpointStopIdsForComparison(service, side) {
  const decision = service?.[`${side}EndpointDecision`] || {};
  const patternStops = pattern(service);
  return unique([
    service?.[`${side}StopPointId`],
    ...(service?.[`${side}StopPointIds`] ?? []),
    decision.primaryEndpointStopPointId,
    decision.endpointStopPointId,
    ...(decision.endpointStopPointIds ?? []),
    patternStops[side === 'origin' ? 0 : -1]
  ]);
}

function sharedEndpointStopEvidence(first, second) {
  return ['origin', 'destination'].some(side => {
    const right = new Set(endpointStopIdsForComparison(second, side));
    return endpointStopIdsForComparison(first, side).some(id => right.has(id));
  });
}

function sharedAssessedStopCount(first, second) {
  const right = new Set(unique([...(second?.stopIds ?? []), ...(second?.assessedStops ?? [])]));
  return unique([...(first?.stopIds ?? []), ...(first?.assessedStops ?? [])]).filter(id => right.has(id)).length;
}

function endpointStopIds(service, side) {
  const decision = service?.[`${side}EndpointDecision`] || {};
  const preparedEntries = endpointEvidenceEntries(service, side);
  const resolved = hasResolvedExactEndpointEvidence(service, side);
  return unique([
    ...(resolved ? [service?.[`${side}StopPointId`], ...(service?.[`${side}StopPointIds`] ?? [])] : []),
    ...(resolved ? [decision.primaryEndpointStopPointId, decision.endpointStopPointId, ...(decision.endpointStopPointIds ?? [])] : []),
    ...preparedEntries.filter(preparedEndpointIsResolved).map(entry => entry.resolvedStopPointId)
  ]);
}

function endpointIsExact(service, side) {
  return hasResolvedExactEndpointEvidence(service, side);
}

function endpointIsAssessed(service, side) {
  if (!endpointIsExact(service, side)) return false;
  const assessed = new Set(unique(service?.assessedStops ?? service?.stopIds ?? []));
  return endpointStopIds(service, side).some(id => assessed.has(id));
}

function sharedDirectionMarker(first, second) {
  const left = text(first?.directionFamily || first?.direction || first?.stopDirection).toLowerCase();
  const right = text(second?.directionFamily || second?.direction || second?.stopDirection).toLowerCase();
  return left && right && left === right;
}

function containedEndpointShortWorking(shorterService, longerService) {
  if (text(shorterService?.routeNumber).toUpperCase() !== text(longerService?.routeNumber).toUpperCase()) return false;
  if (!sharedDirectionMarker(shorterService, longerService)) return false;
  if (!lineageIds(shorterService).some(value => lineageIds(longerService).map(normal).includes(normal(value)))) return false;
  for (const side of ['origin', 'destination']) {
    const other = side === 'origin' ? 'destination' : 'origin';
    if (endpointIdentity(shorterService, side) !== endpointIdentity(longerService, side)) continue;
    if (endpointIdentity(shorterService, other) === endpointIdentity(longerService, other)) continue;
    if (!endpointIsAssessed(shorterService, other) && endpointIsAssessed(longerService, other)) return true;
  }
  return false;
}

export function assessedEndpointSupport(service = {}) {
  return Number(endpointIsAssessed(service, 'origin')) + Number(endpointIsAssessed(service, 'destination'));
}

function pattern(service) {
  const explicit = unique(service?.routePatternStopIds ?? []);
  if (explicit.length) return explicit;
  return unique(service?.orderedPatternEndpoints ?? service?.source?.orderedPatternEndpoints ?? []);
}
function patternNames(service) { return unique((service?.routePatternStops ?? service?.routePatternStopNames ?? []).map(stop => typeof stop === 'string' ? stop : stop?.name || stop?.commonName)); }

function orderedLocalCorridorEvidence(first, second) {
  const left = patternNames(first).map(normal).filter(Boolean);
  const right = patternNames(second).map(normal).filter(Boolean);
  if (!left.length || !right.length) return false;
  let cursor = 0;
  let matches = 0;
  for (const name of left) {
    const found = right.indexOf(name, cursor);
    if (found < 0) continue;
    matches += 1;
    cursor = found + 1;
  }
  return matches >= 2;
}

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

function sameExactEndpointEvidence(first, second) {
  const left = ['origin', 'destination'].map(side => endpointPlaceKeys(first, side)[0]);
  const right = ['origin', 'destination'].map(side => endpointPlaceKeys(second, side)[0]);
  return left.every(Boolean) && right.every(Boolean) && left.some((value, index) => value === right[index]);
}

function sharedPatternEvidence(first, second) {
  const left = pattern(first), right = pattern(second);
  if (!left.length || !right.length) return false;
  if (left.join('|') === right.join('|') || strictSubsequenceServices(first, second) || strictSubsequenceServices(second, first)) return true;
  const rightSet = new Set(right);
  return left.filter(value => rightSet.has(value)).length >= 2;
}

function sameCalendarProfile(first, second) {
  const left = calendarIds(first), right = calendarIds(second);
  // A source that makes no calendar assertion is compatible with an
  // authoritative resolved profile; it is not evidence of a conflict or an
  // unresolved calendar. Only two explicit, differing assertions vary.
  if (!left.length || !right.length) return true;
  return left.length === right.length && left.every(value => right.includes(value));
}

function sharedScheduledPatternEvidence(first, second) {
  const left = pattern(first);
  const right = pattern(second);
  const rightSet = new Set(right);
  const sharedPatternStops = left.filter(value => rightSet.has(value));
  const leftStops = unique([...(first?.stopIds ?? []), ...(first?.assessedStops ?? [])]);
  const rightStops = new Set(unique([...(second?.stopIds ?? []), ...(second?.assessedStops ?? [])]));
  const sharedAssessedStops = leftStops.filter(value => rightStops.has(value));
  return {
    sharedPatternStops,
    sharedAssessedStops,
    orderedPatternMatch: sharedPatternEvidence(first, second)
      || strictSubsequenceServices(first, second)
      || strictSubsequenceServices(second, first),
    orderedLocalCorridorMatch: orderedLocalCorridorEvidence(first, second)
  };
}

function scheduledDepartureOverlap(first, second) {
  const left = new Set(Object.values(first?.departureEvidenceByDay ?? {})
    .flatMap(items => (items ?? []).map(item => `${item?.stopPointId ?? ''}|${item?.minute ?? item?.time ?? ''}`))
    .filter(value => !/^\|$/.test(value)));
  return Object.values(second?.departureEvidenceByDay ?? {})
    .flatMap(items => (items ?? []).map(item => `${item?.stopPointId ?? ''}|${item?.minute ?? item?.time ?? ''}`))
    .some(value => left.has(value));
}

function directedEndpointPair(service) {
  const origin = endpointIdentity(service, 'origin');
  const destination = endpointIdentity(service, 'destination');
  return origin && destination ? { origin, destination } : null;
}

function sameDirectedCorridor(first, second, evidence) {
  const left = directedEndpointPair(first), right = directedEndpointPair(second);
  if (sameSourceEndpointPair(first, second)) return true;
  // A shared exact source StopPoint at the same directed endpoint plus one
  // shared assessed StopPoint is sufficient cross-feed corridor evidence.
  // The BUS-DEST exactness gate is unchanged: this is only a reconciliation
  // signal, never an exact endpoint decision.
  if (sharedEndpointStopEvidence(first, second) && sharedAssessedStopCount(first, second) >= 1) return true;
  if (left && right && left.origin === right.origin && left.destination === right.destination) return true;
  if (evidence.sharedAssessedStops.length < 2) return false;
  return evidence.orderedPatternMatch
    || evidence.sharedPatternStops.length >= 2
    || scheduledDepartureOverlap(first, second);
}

/**
 * National supplementary records may not carry independently exact far-end
 * endpoint evidence.  That is deliberately not allowed to weaken
 * `hasResolvedExactEndpointEvidence`; it is a separate, source-reconcile
 * decision based on route identity, direction and shared scheduled corridor
 * evidence.  The named authoritative operator can therefore win without
 * inventing a national endpoint identity.
 */
export function hasPublicServiceCopyEvidence(first = {}, second = {}) {
  if (text(first.routeNumber).toUpperCase() !== text(second.routeNumber).toUpperCase()) return false;
  const authorityPair = [sourceAuthorityRank(first), sourceAuthorityRank(second)].sort((left, right) => right - left);
  if (authorityPair[0] !== 3 || authorityPair[1] !== 2) return false;
  if (endpointIdentity(first, 'origin') && endpointIdentity(second, 'origin')
    && endpointIdentity(first, 'destination') && endpointIdentity(second, 'destination')
    && endpointIdentity(first, 'origin') === endpointIdentity(second, 'destination')
    && endpointIdentity(first, 'destination') === endpointIdentity(second, 'origin')) return false;
  const evidence = sharedScheduledPatternEvidence(first, second);
  const sharedStops = new Set([...evidence.sharedPatternStops, ...evidence.sharedAssessedStops]);
  const exactEndpointEvidence = sameExactEndpointEvidence(first, second);
  const sourceEndpointEvidence = sameSourceEndpointPair(first, second);
  const sharedEndpointEvidence = sharedEndpointStopEvidence(first, second);
  const departureOverlap = scheduledDepartureOverlap(first, second);
  const independentCorridorEvidence = Number(evidence.orderedPatternMatch)
    + Number(evidence.orderedLocalCorridorMatch)
    + Number(evidence.sharedPatternStops.length >= 2)
    + Number(evidence.sharedAssessedStops.length >= 2)
    + Number(sharedEndpointEvidence && evidence.sharedAssessedStops.length >= 1)
    + Number(departureOverlap)
    + Number(exactEndpointEvidence)
    + Number(sourceEndpointEvidence)
    + Number(sharedEndpointEvidence);
  if (sharedStops.size < 2) {
    // A single common assessed StopPoint is not enough by itself, but it is
    // not an automatic rejection when two independent structured signals
    // corroborate the same public direction (for example exact endpoint
    // evidence plus timetable overlap or an ordered local corridor).
    if (!(sharedEndpointEvidence && sharedStops.size >= 1) && (evidence.sharedAssessedStops.length !== 1 || independentCorridorEvidence < 2)) return false;
  }
  if (!(sharedDirectionMarker(first, second) || sameDirectedCorridor(first, second, evidence))) return false;
  return independentCorridorEvidence >= 2
    && (sameCalendarProfile(first, second)
      || evidence.orderedPatternMatch
      || evidence.sharedAssessedStops.length >= 2
      || sharedEndpointEvidence);
}

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
  const shortWorkingRecords = records.filter(service => service !== principal
    && (strictSubsequenceServices(service, principal) || containedEndpointShortWorking(service, principal)));
  const calendarVariantRecords = records.filter(service => service !== principal && !sameCalendarProfile(service, principal));
  const destinations = destinationValues(records);
  const mainDestination = principal ? principalDestination(principal) : '';
  const alternateDestinations = destinations.filter(value => value !== mainDestination);
  const duplicateRecords = records.filter(service => service !== principal
    && !shortWorkingRecords.includes(service)
    && !calendarVariantRecords.includes(service)
    && text(service.routeNumber).toUpperCase() === text(principal?.routeNumber).toUpperCase()
    && (sameExactEndpointEvidence(service, principal) || hasPublicServiceCopyEvidence(service, principal))
    && (sameCalendarProfile(service, principal) || calendarIds(service).length === 0)
    && (sharedPatternEvidence(service, principal)
      || hasPublicServiceCopyEvidence(service, principal)
      || sourceAuthorityRank(service) !== sourceAuthorityRank(principal)));
  const branchRecords = records.filter(service => service !== principal
    && !shortWorkingRecords.includes(service)
    && !calendarVariantRecords.includes(service)
    && !duplicateRecords.includes(service));
  const variantDestinationEvidence = records
    .filter(service => service !== principal && !duplicateRecords.includes(service))
    .map(service => Object.freeze({
      routeNumber: text(service.routeNumber) || null,
      destination: principalDestination(service) || null,
      kind: shortWorkingRecords.includes(service) ? 'short-working' : branchRecords.includes(service) ? 'branch-variant' : calendarVariantRecords.includes(service) ? 'calendar-variant' : 'variant',
      calendarProfiles: Object.freeze(calendarIds(service)),
      sourceRecordIds: Object.freeze(sourceRecordIds([service])),
      sourceAuthority: sourceAuthorityRank(service),
      endpointPlaceKeys: Object.freeze(endpointPlaceKeys(service, 'destination')),
      endpointStopPointIds: Object.freeze(unique([
        service.destinationStopPointId,
        ...(service.destinationStopPointIds ?? [])
      ]))
    }));
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
    calendarVariantRecordIds: Object.freeze(calendarVariantRecords.map(serviceId).filter(Boolean)),
    variantDestinationEvidence: Object.freeze(variantDestinationEvidence),
    alternateDestinations: Object.freeze(alternateDestinations),
    materialDestinationEvidence: Object.freeze(destinationValues(records)),
    publicServiceEquivalenceEvidence: Object.freeze(records
      .filter(service => service !== principal && hasPublicServiceCopyEvidence(service, principal))
      .map(service => Object.freeze({
        sourceRecordIds: Object.freeze(sourceRecordIds([service])),
        exactEndpointEvidence: Object.freeze({
          origin: hasResolvedExactEndpointEvidence(service, 'origin'),
          destination: hasResolvedExactEndpointEvidence(service, 'destination')
        }),
        sourceEndpointEvidence: sameSourceEndpointPair(service, principal),
        sharedEndpointStopEvidence: sharedEndpointStopEvidence(service, principal),
        equivalenceBasis: 'authoritative/supplementary route-direction and shared scheduled corridor evidence; exact far endpoint not required'
      }))),
    calendarProfiles: Object.freeze(unique(records.flatMap(calendarIds))),
    ambiguousRecordIds: Object.freeze(ambiguousServices.map(serviceId).filter(Boolean)),
    deduplicatedSourceRecordIds: Object.freeze(sourceRecordIds(duplicateRecords)),
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

function serviceRelevantStops(services, assessedStops) {
  const relevantIds = new Set(services.flatMap(service => [
    ...(service.assessedStops ?? []),
    ...(service.stopIds ?? []),
    ...pattern(service)
  ]).map(normal));
  return (assessedStops ?? []).filter(stop => relevantIds.has(normal(stop.id || stop.sourceId)));
}

function serviceEndpointCandidates(service, side, relevantStops) {
  if (!endpointIsExact(service, side)) return [];
  const endpointKeys = new Set(endpointPlaceKeys(service, side));
  const endpointIds = new Set(endpointStopIds(service, side).map(normal));
  const candidates = new Map();
  for (const stop of relevantStops) {
    const stopIdValue = normal(stop.id || stop.sourceId);
    const stopKeys = stopPlaceKeys(stop);
    const sharedArea = stopKeys.find(key => endpointKeys.has(key) && /^(?:stop-area|place):/.test(key));
    const key = sharedArea || (endpointIds.has(stopIdValue) ? `stop-point:${stopIdValue}` : null);
    if (!key) continue;
    const current = candidates.get(key) ?? { key, stops: [], sides: [] };
    current.stops.push(stop);
    if (!current.sides.includes(side)) current.sides.push(side);
    candidates.set(key, current);
  }
  return [...candidates.values()];
}

function mergeTerminusCandidates(services, principal, assessedStops) {
  const relevantStops = serviceRelevantStops(services, assessedStops);
  const merged = new Map();
  for (const service of services) for (const side of ['origin', 'destination']) {
    for (const candidate of serviceEndpointCandidates(service, side, relevantStops)) {
      const current = merged.get(candidate.key) ?? { ...candidate, sides: [] };
      current.stops = [...new Map([...current.stops, ...candidate.stops].map(stop => [text(stop.id || stop.sourceId), stop])).values()];
      for (const candidateSide of candidate.sides) if (!current.sides.includes(candidateSide)) current.sides.push(candidateSide);
      merged.set(candidate.key, current);
    }
  }
  return { relevantStops, candidates: [...merged.values()] };
}

function terminusEvidenceScore(service) {
  const exactEndpoints = ['origin', 'destination'].filter(side => endpointIsExact(service, side)).length;
  return [exactEndpoints, pattern(service).length];
}

function candidateAssessmentDistance(candidate) {
  const distances = candidate.stops.map(stop => stop?.walking?.status === 'routed'
    ? Number(stop.walking.distanceMetres)
    : Number(stop?.distanceMetres)).filter(Number.isFinite);
  return distances.length ? Math.min(...distances) : null;
}

function nearestRelevantStops(stops) {
  if (!stops.length) return [];
  const scored = stops.map(stop => ({ stop, distance: stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number(stop?.distanceMetres) }));
  const finite = scored.map(item => item.distance).filter(Number.isFinite);
  if (!finite.length) return [stops[0]];
  const nearest = Math.min(...finite);
  return scored.filter(item => item.distance === nearest).map(item => item.stop);
}

function terminusUnresolvedDecision(reason, assessedStops, principal, candidates = []) {
  return Object.freeze({
    type: 'TerminusDecision',
    status: 'unresolved-review',
    presentation: 'none',
    proven: false,
    assessedPlace: null,
    terminalSides: Object.freeze([]),
    terminalStopPointIds: Object.freeze([]),
    arrivalEvidence: Object.freeze([]),
    departureEvidence: Object.freeze([]),
    reason,
    note: null,
    evidence: Object.freeze({
      principalSourceRecordId: serviceId(principal) || null,
      serviceRelevantAssessedStopPointIds: Object.freeze(serviceRelevantStops([principal], assessedStops).map(stop => text(stop.id || stop.sourceId)).filter(Boolean)),
      candidatePlaceKeys: Object.freeze(candidates.map(candidate => candidate.key))
    })
  });
}

export function makeTerminusDecision({ services = [], principal = services[0] || null, assessedStops = [], publicPlace = null, circularDecision = null } = {}) {
  // BUS-CIRC owns circular truth.  The legacy source flag remains accepted
  // only for direct BUS-GROUP callers that have not supplied a decision; the
  // production planner always passes the evidence-led decision explicitly.
  const circularProven = circularDecision
    ? circularDecision.classification === 'circular'
    : services.some(service => service?.circular) || principal?.circular;
  if (circularProven) return Object.freeze({
    type: 'TerminusDecision',
    status: 'not-assessed-endpoint',
    presentation: 'none',
    proven: false,
    assessedPlace: text(publicPlace || assessedPlace(assessedStops, null)) || null,
    terminalSides: Object.freeze([]),
    terminalStopPointIds: Object.freeze([]),
    arrivalEvidence: Object.freeze([]),
    departureEvidence: Object.freeze([]),
    reason: circularDecision?.reason || 'Circular classification is preserved; ordinary terminus-arrival suppression was not applied.',
    note: null,
    evidence: Object.freeze({ circularClassificationDeferred: true, principalSourceRecordId: serviceId(principal) || null })
  });
  const stopsById = new Map((assessedStops ?? []).map(stop => [text(stop.id || stop.sourceId), stop]).filter(([id]) => id));
  const terminusPrincipal = [...services].sort((left, right) => {
    const leftScore = terminusEvidenceScore(left), rightScore = terminusEvidenceScore(right);
    // Equivalent source patterns can use different endpoint stands. Prefer
    // the exact record whose endpoint is actually in the assessed-stop
    // evidence before applying the stable pattern tie-break. This keeps the
    // BUS-DEST exactness gate unchanged while preventing an arbitrary source
    // copy from masking a proven assessed terminus.
    const principalHasExactEvidence = terminusEvidenceScore(principal)[0] > 0;
    return Number(principalHasExactEvidence && right === principal) - Number(principalHasExactEvidence && left === principal)
      || assessedEndpointSupport(right) - assessedEndpointSupport(left)
      || rightScore[0] - leftScore[0]
      || rightScore[1] - leftScore[1];
  })[0] || principal;
  const { relevantStops, candidates: allCandidates } = mergeTerminusCandidates(services, terminusPrincipal, assessedStops);
  const anchorStops = nearestRelevantStops(relevantStops);
  const anchorIds = new Set(anchorStops.map(stop => text(stop.id || stop.sourceId)));
  const anchorKeys = new Set(anchorStops.flatMap(stopPlaceKeys));
  const candidates = allCandidates.filter(candidate => candidate.stops.some(stop => anchorIds.has(text(stop.id || stop.sourceId))) || anchorKeys.has(candidate.key));
  let candidate = candidates[0] || null;
  if (candidates.length > 1) {
    const ranked = candidates.map(item => ({ item, distance: candidateAssessmentDistance(item) }))
      .sort((left, right) => (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY) || left.item.key.localeCompare(right.item.key));
    const best = ranked[0];
    const second = ranked[1];
    if (best.distance === null || second.distance === null || best.distance === second.distance) return terminusUnresolvedDecision(
      'More than one service-relevant assessed StopArea/place remained plausible; terminus suppression was not applied.',
      assessedStops,
      terminusPrincipal,
      candidates
    );
    candidate = best.item;
  }
  const targetStops = candidate?.stops ?? anchorStops;
  if (!targetStops.length) return Object.freeze({
    type: 'TerminusDecision',
    status: 'not-assessed-endpoint',
    presentation: 'none',
    proven: false,
    assessedPlace: text(publicPlace) || null,
    terminalSides: Object.freeze([]),
    terminalStopPointIds: Object.freeze([]),
    arrivalEvidence: Object.freeze([]),
    departureEvidence: Object.freeze([]),
    reason: 'The public service did not serve an assessed physical stop from which a terminal place could be established.',
    note: null,
    evidence: Object.freeze({ principalSourceRecordId: serviceId(terminusPrincipal) || null, serviceRelevantAssessedStopPointIds: Object.freeze([]), candidatePlaceKeys: Object.freeze([]) })
  });
  const assessedKeys = new Set(targetStops.flatMap(stop => [`stop-point:${normal(stop.id || stop.sourceId)}`, ...stopPlaceKeys(stop)]));
  const sides = {};
  for (const side of ['origin', 'destination']) {
    const matched = endpointMatchesAssessed(terminusPrincipal, side, stopsById, assessedKeys);
    const proof = patternPositionProof(terminusPrincipal, side, stopsById, assessedKeys);
    sides[side] = { ...matched, proof: proof.terminal, through: proof.through };
  }
  const provenSides = Object.entries(sides).filter(([, evidence]) => evidence.matched && evidence.proof).map(([side]) => side);
  const through = Object.values(sides).some(evidence => evidence.through);
  const firstPlace = sides.origin.place || sides.destination.place;
  const exactEndpointEvidence = ['origin', 'destination'].some(side => endpointIsExact(terminusPrincipal, side));
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
  const place = text(publicPlace || provenSides.map(side => endpointDisplay(terminusPrincipal, side)).find(Boolean) || assessedPlace(targetStops, firstPlace));
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
      serviceRelevantAssessedStopPointIds: Object.freeze(relevantStops.map(stop => text(stop.id || stop.sourceId)).filter(Boolean)),
      candidatePlaceKeys: Object.freeze(candidates.map(item => item.key)),
      assessedPlaceKeys: Object.freeze([...assessedKeys])
    })
  });
}

export const PublicServiceGroupingDecision = makePublicServiceGroupingDecision;
export const TerminusDecision = makeTerminusDecision;
