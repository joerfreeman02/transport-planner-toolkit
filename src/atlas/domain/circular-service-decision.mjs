/*
 * BUS-CIRC: ordered-pattern circular-service intelligence.
 *
 * Source wording, endpoint names and source circular flags are retained as
 * evidence only. A public circular classification requires an ordered
 * structured pattern whose first and last StopPoint or authoritative logical
 * place close, with enough intermediate structure to distinguish a loop from
 * an endpoint-only assertion or an out-and-back journey.
 */

export const CIRCULAR_CLASSIFICATIONS = Object.freeze([
  'linear',
  'circular',
  'partial-loop',
  'out-and-back',
  'unresolved-review'
]);

function text(value) { return String(value ?? '').trim(); }
function normal(value) { return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function unique(values) { return [...new Set((values ?? []).map(text).filter(Boolean))]; }

function firstValue(...values) {
  return values.map(text).find(Boolean) || null;
}

function sourcePatternId(service) {
  return firstValue(
    service?.sourcePatternId,
    service?.patternId,
    service?.source?.patternId,
    service?.source?.patternVariantId,
    service?.source?.journeyPatternId,
    service?.source?.id
  );
}

function sourcePatternIds(service) {
  return unique([
    ...(Array.isArray(service?.sourcePatternIds) ? service.sourcePatternIds : []),
    sourcePatternId(service),
    service?.id
  ]);
}

function stopPointId(stop) {
  return firstValue(stop?.id, stop?.stopPointId, stop?.sourceId, typeof stop === 'string' ? stop : null);
}

function stopAreaId(stop) {
  return firstValue(
    stop?.stopAreaId,
    stop?.stopArea?.id,
    stop?.logicalPlaceId,
    stop?.logicalGroupId,
    stop?.logicalGroupIds?.[0],
    stop?.logicalGroupRefs?.find(ref => ref?.id)?.id
  );
}

function stopAreaName(stop) {
  return firstValue(
    stop?.stopArea?.name,
    stop?.stopAreaName,
    stop?.logicalGroupName,
    stop?.logicalGroupLabel,
    stop?.logicalPlaceName
  );
}

function stopName(stop) {
  return firstValue(stop?.name, stop?.commonName, stop?.naptanCommonName) || stopPointId(stop);
}

function orderedStopPoints(service) {
  const explicit = Array.isArray(service?.routePatternStops) && service.routePatternStops.length
    ? service.routePatternStops
    : Array.isArray(service?.orderedPatternStops) && service.orderedPatternStops.length
      ? service.orderedPatternStops
      : null;
  if (explicit) return explicit.map(stop => typeof stop === 'string' ? { id: stop, name: stop } : { ...stop });
  const ids = service?.routePatternStopIds?.length
    ? service.routePatternStopIds
    : service?.orderedPatternEndpoints?.length
      ? service.orderedPatternEndpoints
      : service?.source?.orderedPatternEndpoints;
  if (Array.isArray(ids)) return ids.map(id => typeof id === 'string' ? { id, name: null } : { ...id });
  return [];
}

function exactPlaceKey(stop) {
  const area = stopAreaId(stop);
  return area ? `place:${area}` : null;
}

function pointKey(stop) {
  const id = stopPointId(stop);
  return id ? `point:${id}` : null;
}

function structuredKey(stop) {
  return pointKey(stop) || exactPlaceKey(stop);
}

function freezeStops(stops) {
  return Object.freeze(stops.map((stop, index) => Object.freeze({
    index,
    id: stopPointId(stop),
    name: stopName(stop),
    stopAreaId: stopAreaId(stop),
    stopAreaName: stopAreaName(stop),
    locality: firstValue(stop?.locality, stop?.localityName, stop?.nptgLocalityName),
    latitude: Number.isFinite(Number(stop?.latitude)) ? Number(stop.latitude) : null,
    longitude: Number.isFinite(Number(stop?.longitude)) ? Number(stop.longitude) : null,
    source: stop
  })));
}

function occurrenceEvidence(stops) {
  const byKey = new Map();
  stops.forEach((stop, index) => {
    for (const key of [pointKey(stop), exactPlaceKey(stop)].filter(Boolean)) {
      const current = byKey.get(key) ?? [];
      current.push(index);
      byKey.set(key, current);
    }
  });
  return Object.freeze([...byKey.entries()]
    .filter(([, positions]) => positions.length > 1)
    .map(([key, positions]) => Object.freeze({ key, positions: Object.freeze(positions) })));
}

function endpointClosure(stops) {
  const first = stops[0] ?? null;
  const last = stops.at(-1) ?? null;
  const samePhysicalStopPoint = Boolean(first && last && pointKey(first) && pointKey(first) === pointKey(last));
  const sameAuthoritativeStopArea = Boolean(first && last && exactPlaceKey(first) && exactPlaceKey(first) === exactPlaceKey(last));
  const sameLogicalPlace = sameAuthoritativeStopArea;
  return Object.freeze({
    firstStopPointId: stopPointId(first),
    lastStopPointId: stopPointId(last),
    firstStopAreaId: stopAreaId(first),
    lastStopAreaId: stopAreaId(last),
    samePhysicalStopPoint,
    sameAuthoritativeStopArea,
    sameLogicalPlace,
    proven: samePhysicalStopPoint || sameAuthoritativeStopArea,
    basis: samePhysicalStopPoint ? 'same-physical-stop-point' : sameAuthoritativeStopArea ? 'same-authoritative-stop-area' : null
  });
}

function sourceCircularAssertion(service) {
  const value = service?.source?.circular ?? service?.authoritativeCircular ?? service?.circular;
  return typeof value === 'boolean' ? value : null;
}

function directionMarker(service) {
  return firstValue(
    service?.source?.directionId,
    service?.directionFamily,
    service?.source?.directionFamily,
    service?.directionId
  );
}

function orderedKeys(stops) {
  // Use the exact authoritative logical place when it exists. This allows
  // different physical stands in one StopArea to prove closure while keeping
  // physical StopPoint IDs visible in the evidence payload.
  return stops.map(stop => exactPlaceKey(stop) || pointKey(stop)).filter(Boolean);
}

function isPalindrome(values) {
  // A three-position A → B → A pattern is the smallest genuine loop shape.
  // Require a longer, at-least-three-place palindrome before calling it an
  // out-and-back, which is the observable retracing pattern A → B → C → B → A.
  return values.length >= 5
    && new Set(values).size >= 3
    && values.every((value, index) => value === values.at(-1 - index));
}

function hasCompleteStructuredPattern(stops) {
  return stops.length >= 3 && new Set(orderedKeys(stops)).size >= 2;
}

function geometryFor(service) {
  return service?.routePatternGeometry
    ?? service?.patternGeometry
    ?? service?.geometry
    ?? service?.source?.routePatternGeometry
    ?? service?.source?.geometry
    ?? null;
}

function explicitOrientation(service) {
  const value = firstValue(
    service?.orientation,
    service?.directionOrientation,
    service?.source?.orientation,
    service?.source?.directionOrientation
  );
  if (!value) return null;
  if (/^clockwise$/i.test(value)) return 'clockwise';
  if (/^anticlockwise$/i.test(value)) return 'anticlockwise';
  return null;
}

function orientationEvidence(service, closed) {
  const orientation = closed ? explicitOrientation(service) : null;
  return Object.freeze({ orientation, basis: orientation ? 'authoritative-direction-metadata' : null });
}

function classifyPattern(stops, sourceAssertion) {
  const closure = endpointClosure(stops);
  const keys = orderedKeys(stops);
  const occurrences = occurrenceEvidence(stops);
  const internalRepeat = occurrences.some(item => item.positions.some(position => position > 0 && position < stops.length - 1));
  const complete = hasCompleteStructuredPattern(stops);
  if (closure.proven && complete) {
    if (isPalindrome(keys)) return { classification: 'out-and-back', reason: 'The ordered pattern closes at the origin but retraces the same corridor in reverse order; closure is not sufficient to prove a circulating loop.' };
    return { classification: 'circular', reason: `The ordered pattern closes through ${closure.basis === 'same-authoritative-stop-area' ? 'the same authoritative StopArea/logical place' : 'the same physical StopPoint'} and contains intermediate structured stops.` };
  }
  if (internalRepeat) return { classification: 'partial-loop', reason: 'The ordered pattern repeats an internal StopPoint/StopArea but does not close at the origin.' };
  if (closure.proven && !complete) {
    return sourceAssertion === true
      ? { classification: 'unresolved-review', reason: 'The source asserts circular service, but the frozen evidence contains only endpoint closure and no complete ordered pattern.' }
      : { classification: 'linear', reason: 'The frozen evidence does not contain enough intermediate ordered structure to establish a loop.' };
  }
  if (complete) return { classification: 'linear', reason: sourceAssertion === true ? 'The source circular assertion is contradicted by an open ordered pattern; structured evidence takes precedence.' : 'The ordered pattern is open and contains no internal loop closure.' };
  return sourceAssertion === true
    ? { classification: 'unresolved-review', reason: 'The source asserts circular service, but no complete ordered StopPoint/StopArea pattern is available for verification.' }
    : { classification: 'linear', reason: 'No ordered circular evidence was supplied.' };
}

function strictSubsequence(candidate, principal) {
  if (candidate.length >= principal.length || !candidate.length || !principal.length) return false;
  let index = 0;
  for (const key of principal) if (key === candidate[index]) index += 1;
  return index === candidate.length;
}

function commonPrefix(left, right) {
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) count += 1;
  return count;
}

function variantKind(service, principal, principalDecision) {
  if (service === principal) return 'principal pattern';
  const candidate = orderedKeys(freezeStops(orderedStopPoints(service)));
  const main = orderedKeys(principalDecision.orderedStopPoints);
  if (strictSubsequence(candidate, main)) return 'contained Short working';
  const shared = commonPrefix(candidate, main);
  const divergent = candidate.length > shared || main.length > shared;
  if (shared >= 2 && divergent) return 'genuine branch / Additional service';
  if (candidate.length && main.length && candidate[0] === main[0] && candidate.at(-1) !== main.at(-1)) return 'distinct public service';
  return 'unresolved';
}

function destinationDecision(service, side) {
  const decision = side === 'origin' ? service?.originEndpointDecision : service?.destinationEndpointDecision;
  return decision && typeof decision === 'object' ? decision : null;
}

function principalFor(services, explicit) {
  if (explicit && services.includes(explicit)) return explicit;
  return [...services].sort((left, right) => {
    const leftPattern = orderedStopPoints(left).length;
    const rightPattern = orderedStopPoints(right).length;
    return rightPattern - leftPattern || Number(right?.recordActivity ?? 0) - Number(left?.recordActivity ?? 0) || text(left?.id).localeCompare(text(right?.id));
  })[0] ?? null;
}

function viaNames(stops, principalLocations = []) {
  const names = unique([
    ...stops.slice(1, -1).map(stop => stopName(stop)),
    ...principalLocations
  ]);
  return names.slice(0, 3);
}

function plannerWording(route, decision) {
  if (decision.classification !== 'circular') return null;
  const via = viaNames(decision.orderedStopPoints, decision.principalLocations);
  const orientation = decision.orientation ? ` ${decision.orientation}` : '';
  const viaText = via.length ? ` via ${via.length === 1 ? via[0] : `${via.slice(0, -1).join(', ')} and ${via.at(-1)}`}` : '';
  return `Route ${route || 'the service'} operates${orientation} as a circular service${viaText}.`;
}

export function inspectCircularPattern(service = {}) {
  const rawStops = orderedStopPoints(service);
  const stops = freezeStops(rawStops);
  const sourceAssertion = sourceCircularAssertion(service);
  const result = classifyPattern(stops, sourceAssertion);
  const closure = endpointClosure(stops);
  const orientation = orientationEvidence(service, result.classification === 'circular');
  return Object.freeze({
    type: 'CircularServiceDecision',
    publicRouteIdentity: text(service?.routeNumber) || null,
    sourcePatternIds: Object.freeze(sourcePatternIds(service)),
    sourceRecordIds: Object.freeze(unique([service?.id, ...(service?.sourceRecordIds ?? [])])),
    orderedStopPoints: stops,
    orderedStopAreas: Object.freeze(stops.map(stop => Object.freeze({ id: stop.stopAreaId, name: stop.stopAreaName }))),
    originDecision: destinationDecision(service, 'origin'),
    destinationDecision: destinationDecision(service, 'destination'),
    repeatedStopsOrPlaces: occurrenceEvidence(stops),
    loopClosureEvidence: closure,
    routePatternGeometry: geometryFor(service),
    branchEvidence: Object.freeze([]),
    shortWorkingEvidence: Object.freeze([]),
    authoritativeSourceCircularAssertions: Object.freeze({ value: sourceAssertion, source: sourceAssertion === null ? null : service?.source?.circular !== undefined ? 'source.circular' : 'service.circular' }),
    orientation: orientation.orientation,
    orientationEvidence: orientation,
    classification: result.classification,
    reason: result.reason,
    completeOrderedPattern: hasCompleteStructuredPattern(stops),
    principalLocations: Object.freeze(unique(service?.principalLocations ?? []))
  });
}

export function resolveCircularServiceDecision(services = [], { principal = null, component = services } = {}) {
  const records = (services ?? []).filter(Boolean);
  const scopedRecords = (component ?? records).filter(Boolean);
  const selectedPrincipal = principalFor(records, principal);
  const principalDecision = selectedPrincipal ? inspectCircularPattern(selectedPrincipal) : inspectCircularPattern({});
  const decisions = records.map(inspectCircularPattern);
  const scopedPrincipal = scopedRecords.includes(selectedPrincipal) ? selectedPrincipal : principalFor(scopedRecords, principal);
  const scopedPrincipalDecision = scopedPrincipal ? inspectCircularPattern(scopedPrincipal) : inspectCircularPattern({});
  const scopedDecisions = scopedRecords.map(inspectCircularPattern);
  const variants = decisions.map((decision, index) => Object.freeze({
    ...decision,
    variantClassification: variantKind(records[index], selectedPrincipal, principalDecision)
  }));
  const twoWayMarkers = unique(records.map(directionMarker));
  const scopedMarkers = unique(scopedRecords.map(directionMarker));
  const openPatternAcrossDirections = decisions.some(decision => decision.classification === 'linear' && decision.completeOrderedPattern);
  const scopedOpenPatterns = scopedDecisions.filter(decision => decision.classification === 'linear' && decision.completeOrderedPattern);
  const circularPatterns = decisions.filter(decision => decision.classification === 'circular');
  const openPatterns = decisions.filter(decision => decision.classification === 'linear' && decision.completeOrderedPattern);
  const patternKeys = decision => new Set(orderedKeys(decision.orderedStopPoints));
  const circularAndOpenPatternsOverlap = circularPatterns.some(circular => {
    const circularKeys = patternKeys(circular);
    return openPatterns.some(open => [...patternKeys(open)].some(key => circularKeys.has(key)));
  });
  const scopedCircularPatterns = scopedDecisions.filter(decision => decision.classification === 'circular');
  const scopedHasMixedClosedAndOpen = scopedCircularPatterns.length > 0 && scopedOpenPatterns.length > 0;
  const scopedPatternOverlap = scopedCircularPatterns.some(circular => {
    const circularKeys = patternKeys(circular);
    return scopedOpenPatterns.some(open => [...patternKeys(open)].some(key => circularKeys.has(key)));
  });
  const scopedOpenPatternExtendsClosed = scopedCircularPatterns.some(circular => scopedOpenPatterns.some(open =>
    open.orderedStopPoints.length > circular.orderedStopPoints.length
    && [...patternKeys(open)].some(key => patternKeys(circular).has(key))
  ));
  const familyContradictsCircular = scopedCircularPatterns.length > 0
    && ((scopedHasMixedClosedAndOpen && scopedPatternOverlap && scopedOpenPatternExtendsClosed)
      || (twoWayMarkers.length > 1 && openPatternAcrossDirections && circularAndOpenPatternsOverlap));
  const classificationDecisions = scopedDecisions.length ? scopedDecisions : decisions;
  const classificationPrincipal = scopedDecisions.length ? scopedPrincipalDecision : principalDecision;
  const classification = familyContradictsCircular
    ? 'linear'
    : classificationPrincipal.classification === 'circular'
      ? 'circular'
    : classificationDecisions.some(decision => decision.classification === 'circular')
      ? 'circular'
      : classificationPrincipal.classification === 'out-and-back'
        ? 'out-and-back'
        : classificationDecisions.some(decision => decision.classification === 'partial-loop')
          ? 'partial-loop'
          : classificationDecisions.some(decision => decision.classification === 'unresolved-review')
            ? 'unresolved-review'
            : 'linear';
  const branchEvidence = variants.filter(variant => variant.variantClassification === 'genuine branch / Additional service');
  const shortWorkingEvidence = variants.filter(variant => variant.variantClassification === 'contained Short working');
  const reason = familyContradictsCircular
    ? 'The route family contains explicit opposite-direction markers and an open ordered pattern; the closed source assertion is not a safe public circular classification.'
    : classification === 'circular'
    ? classificationPrincipal.classification === 'circular' ? classificationPrincipal.reason : 'At least one complete ordered pattern proves a loop; other records are retained as explicit variants.'
    : classification === 'unresolved-review'
      ? 'Circular presentation is withheld because the frozen source does not provide a complete ordered pattern for a definitive decision.'
      : principalDecision.reason;
  const decision = {
    type: 'CircularServiceDecision',
    publicRouteIdentity: text(selectedPrincipal?.routeNumber || records[0]?.routeNumber) || null,
    sourcePatternIds: unique(decisions.flatMap(item => item.sourcePatternIds)),
    sourceRecordIds: unique(decisions.flatMap(item => item.sourceRecordIds)),
    orderedStopPoints: principalDecision.orderedStopPoints,
    orderedStopAreas: principalDecision.orderedStopAreas,
    originDecision: principalDecision.originDecision,
    destinationDecision: principalDecision.destinationDecision,
    repeatedStopsOrPlaces: principalDecision.repeatedStopsOrPlaces,
    loopClosureEvidence: principalDecision.loopClosureEvidence,
    routePatternGeometry: principalDecision.routePatternGeometry,
    branchEvidence,
    shortWorkingEvidence,
    authoritativeSourceCircularAssertions: Object.freeze(decisions.map(item => item.authoritativeSourceCircularAssertions)),
    orientation: classification === 'circular' ? principalDecision.orientation : null,
    orientationEvidence: classification === 'circular' ? principalDecision.orientationEvidence : Object.freeze({ orientation: null, basis: null }),
    classification,
    reason,
    principalSourceRecordId: selectedPrincipal?.id || null,
    principalLocations: principalDecision.principalLocations,
    variantClassifications: Object.freeze(variants),
    plannerWording: null
  };
  decision.plannerWording = plannerWording(decision.publicRouteIdentity, decision);
  return Object.freeze({ ...decision, sourcePatternIds: Object.freeze(decision.sourcePatternIds), sourceRecordIds: Object.freeze(decision.sourceRecordIds) });
}

export function classifyCircularVariants(services = [], options = {}) {
  return resolveCircularServiceDecision(services, options).variantClassifications;
}

export function circularClassificationIsProven(decision) {
  return decision?.classification === 'circular';
}

export function plannerCircularWording(decision) {
  return decision?.classification === 'circular' ? decision.plannerWording : null;
}
