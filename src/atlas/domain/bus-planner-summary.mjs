import {
  DAY_ORDER,
  LIMITED_SERVICE_JOURNEY_THRESHOLD,
  calculateOperatingPeriods,
  calculateTypicalServiceFrequency,
  formatOperatingPeriod,
  formatTypicalFrequency,
  formatServiceOriginDestination
} from './bus-service-assessment.mjs';
import { calendarProfileLabel, deriveCalendarProfileId } from './service-calendar.mjs';
import {
  endpointIdentity,
  assessedEndpointSupport,
  hasPublicServiceCopyEvidence,
  isUnspecifiedOperator,
  makePublicServiceGroupingDecision,
  makeTerminusDecision,
  sourceAuthorityRank
} from './bus-grouping.mjs';

export const PLANNER_METHODOLOGY_NOTE = '* Stop used for the frequency and operating-period information shown. The Served at column lists assessed route stops within the selected search radius, not the complete route stop list. Frequency and operating period are based on the closest of those stops with suitable timetable evidence. Additional source evidence remains available in the ATLAS assessment workspace.';
export const PLANNER_TERMINUS_PRESENTATION_NOTE = 'Where an assessed stop is the route terminus, ATLAS shows the useful departing direction only; arriving journeys terminating at that stop are not listed separately.';

const UNKNOWN_CALENDAR_PROFILE = 'unresolved';
const CALENDAR_PROFILE_ORDER = Object.freeze(['ordinary', 'school-day', 'term-time', 'non-school-day', 'holiday', 'other-resolved', UNKNOWN_CALENDAR_PROFILE]);
const CALENDAR_PROFILE_LABELS = Object.freeze({
  ordinary: 'Standard days',
  'school-day': 'School days',
  'term-time': 'Term time',
  'non-school-day': 'Non-school days',
  holiday: 'Holidays',
  'other-resolved': 'Specific calendar',
  unresolved: 'Calendar not confirmed'
});

function text(value) { return String(value ?? '').trim(); }
function normal(value) { return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function unique(values) { return [...new Set((values ?? []).map(text).filter(Boolean))]; }
function numeric(values) { return unique(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b); }
function stopId(stop) { return text(stop?.id || stop?.sourceId); }
function emptySchedule() { return Object.fromEntries(DAY_ORDER.map(day => [day, []])); }

function calendarProfileFromService(service) {
  const explicit = text(service?.calendarProfileId || service?.source?.calendarProfileId).toLowerCase();
  if (explicit) return explicit;
  const evidence = service?.calendarEvidence ?? service?.operatingCalendarEvidence ?? [];
  const profiles = unique((Array.isArray(evidence) ? evidence : [evidence]).map(item => {
    if (!item || typeof item !== 'object') return '';
    const itemProfile = text(item?.calendarProfileId).toLowerCase();
    if (itemProfile) return itemProfile;
    const hasCalendarAssertion = Boolean(item?.resolved !== undefined || item?.calendarResolved !== undefined
      || item?.resolutionStatus || item?.daysOfWeek?.length || item?.days?.length
      || item?.schoolDayOnly || item?.termTimeOnly || item?.nonSchoolDayOnly || item?.holidayOnly);
    if (!hasCalendarAssertion) return '';
    return deriveCalendarProfileId({
      resolved: Boolean(item?.resolved ?? item?.calendarResolved ?? item?.daysOfWeek?.length ?? item?.days?.length),
      schoolDayOnly: Boolean(item?.schoolDayOnly),
      termTimeOnly: Boolean(item?.termTimeOnly),
      nonSchoolDayOnly: Boolean(item?.nonSchoolDayOnly),
      holidayOnly: Boolean(item?.holidayOnly)
    });
  }));
  return profiles.length === 1 ? profiles[0] : profiles.length > 1 ? UNKNOWN_CALENDAR_PROFILE : null;
}

function calendarProfileFromEntry(service, item) {
  const explicit = text(item?.calendarProfileId).toLowerCase();
  if (explicit) return explicit;
  const hasCalendarAssertion = Boolean(item?.resolved !== undefined || item?.calendarResolved !== undefined
    || item?.resolutionStatus || item?.daysOfWeek?.length || item?.days?.length
    || item?.schoolDayOnly || item?.termTimeOnly || item?.nonSchoolDayOnly || item?.holidayOnly);
  return hasCalendarAssertion ? deriveCalendarProfileId({
    resolved: Boolean(item?.resolved ?? item?.calendarResolved ?? item?.daysOfWeek?.length ?? item?.days?.length),
    schoolDayOnly: Boolean(item?.schoolDayOnly), termTimeOnly: Boolean(item?.termTimeOnly),
    nonSchoolDayOnly: Boolean(item?.nonSchoolDayOnly), holidayOnly: Boolean(item?.holidayOnly)
  }) : calendarProfileFromService(service);
}

function hasCalendarMetadata(service) {
  const explicit = text(service?.calendarProfileId || service?.source?.calendarProfileId);
  if (explicit) return true;
  const evidence = service?.calendarEvidence ?? service?.operatingCalendarEvidence ?? [];
  if ((Array.isArray(evidence) ? evidence : [evidence]).some(item => calendarProfileFromEntry({}, item))) return true;
  return DAY_ORDER.some(day => (service?.departureEvidenceByDay?.[day] ?? []).some(item => text(item?.calendarProfileId)));
}

function calendarProfileIdsForEntry(entry) {
  const profiles = unique(entry?.calendarProfileIds ?? [entry?.calendarProfileId]).map(value => text(value).toLowerCase()).filter(Boolean);
  return profiles;
}

function orderedCalendarProfiles(values) {
  return unique(values).map(value => text(value).toLowerCase()).filter(Boolean).sort((first, second) => {
    const left = CALENDAR_PROFILE_ORDER.indexOf(first), right = CALENDAR_PROFILE_ORDER.indexOf(second);
    return (left < 0 ? CALENDAR_PROFILE_ORDER.length : left) - (right < 0 ? CALENDAR_PROFILE_ORDER.length : right) || first.localeCompare(second);
  });
}

function calendarProfileDisplayLabel(profileId) {
  return CALENDAR_PROFILE_LABELS[profileId] || calendarProfileLabel(profileId) || 'Calendar-specific service';
}

function directionKey(service) {
  const family = text(service?.directionFamily);
  if (family) return family.toLowerCase();
  const direction = text(service?.direction || service?.stopDirection || service?.destination || service?.origin);
  return normal(direction) || 'direction-not-supplied';
}

function explicitDirectionMarker(service) {
  const family = text(service?.directionFamily).toLowerCase();
  if (family && !/^headsign:/.test(family)) return family;
  const direction = normal(service?.direction || service?.stopDirection);
  if (/^(?:inbound|outbound|northbound|southbound|eastbound|westbound|clockwise|anticlockwise|north|south|east|west)$/.test(direction)) return direction;
  return '';
}

function sourceDirectionMarker(value) {
  return /^(?:inbound|outbound|northbound|southbound|eastbound|westbound|clockwise|anticlockwise|north|south|east|west)$/i.test(text(value));
}

function operatorTokens(value) {
  return new Set(normal(value).split(' ').filter(token => token && !['and', 'the', 'bus', 'buses', 'company', 'co', 'ltd', 'limited', 'travel', 'transport', 'in', 'of'].includes(token)));
}

function operatorFamilyCompatible(first, second) {
  if (isUnspecifiedOperator(first?.operator) || isUnspecifiedOperator(second?.operator)) return true;
  const left = normal(first?.operator);
  const right = normal(second?.operator);
  if (!left || !right) return true;
  if (left === right) return true;
  const leftTokens = operatorTokens(left), rightTokens = operatorTokens(right);
  const subset = (small, large) => small.size > 0 && [...small].every(token => large.has(token));
  return subset(leftTokens, rightTokens) || subset(rightTokens, leftTokens);
}

function operatorIdentityKey(value) {
  return [...operatorTokens(value)].sort().join(' ');
}

function operatorDisplayNames(services) {
  const candidates = unique(services.map(service => service?.operator)).filter(value => !isUnspecifiedOperator(value));
  const families = new Map();
  for (const candidate of candidates) {
    const key = operatorIdentityKey(candidate) || normal(candidate);
    const current = families.get(key) ?? [];
    current.push(candidate);
    families.set(key, current);
  }
  return [...families.values()]
    .map(names => names.slice().sort((left, right) => normal(left).length - normal(right).length || left.localeCompare(right))[0])
    .sort((left, right) => left.localeCompare(right));
}

function serviceLineageIds(service) {
  return unique([
    service?.serviceLineageId,
    ...(service?.sourceRouteIds ?? []),
    service?.source?.routeId,
    service?.routeId
  ]);
}

function sameServiceLineage(first, second) {
  const left = new Set(serviceLineageIds(first).map(normal));
  return serviceLineageIds(second).some(value => left.has(normal(value)));
}

function validLocation(value) {
  const valueText = text(value);
  if (!valueText || /^(?:origin|destination) not supplied|destination not resolved$/i.test(valueText)) return '';
  return normal(valueText);
}

function endpointPair(service) {
  return {
    origin: endpointIdentity(service, 'origin') || validLocation(service?.origin),
    destination: endpointIdentity(service, 'destination') || validLocation(service?.destination)
  };
}

function endpointValues(service) {
  return unique([endpointPair(service).origin, endpointPair(service).destination]);
}

function endpointRelationship(first, second) {
  const left = endpointValues(first);
  const right = new Set(endpointValues(second));
  return left.length > 0 && left.some(value => right.has(value));
}

function reverseEndpointRelationship(first, second) {
  const left = endpointPair(first), right = endpointPair(second);
  return Boolean(left.origin && left.destination && right.origin && right.destination
    && left.origin === right.destination && left.destination === right.origin
    && !(left.origin === right.origin && left.destination === right.destination));
}

function explicitPattern(service) {
  return (service?.routePatternStopIds ?? []).map(text).filter(Boolean);
}
function orderedPatternNames(service) {
  const named = Array.isArray(service?.routePatternStops)
    ? service.routePatternStops.map(stop => text(stop?.name ?? stop?.commonName)).filter(Boolean)
    : Array.isArray(service?.routePatternStopNames) ? service.routePatternStopNames.map(text).filter(Boolean) : [];
  return named;
}

function strictSubsequence(shorter, longer) {
  if (!shorter.length || shorter.length > longer.length) return false;
  let cursor = 0;
  for (const value of shorter) {
    const index = longer.indexOf(value, cursor);
    if (index < 0) return false;
    cursor = index + 1;
  }
  return true;
}

function commonPatternPrefixLength(left, right) {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length += 1;
  return length;
}

function comparablePatternValues(first, second) {
  const leftIds = explicitPattern(first).map(normal).filter(Boolean);
  const rightIds = explicitPattern(second).map(normal).filter(Boolean);
  const leftNames = orderedPatternNames(first).map(normal).filter(Boolean);
  const rightNames = orderedPatternNames(second).map(normal).filter(Boolean);
  const sharedIds = new Set(leftIds.filter(id => rightIds.includes(id)));
  // Provider-local names are a fallback only.  When the two feeds expose a
  // comparable physical-ID sequence, those IDs are the authoritative
  // corridor evidence even if the display names differ.
  if (leftIds.length >= 2 && rightIds.length >= 2
    && leftIds.length === rightIds.length && sharedIds.size >= 2) return [leftIds, rightIds];
  if (leftNames.length >= 2 && rightNames.length >= 2
    && leftNames.length === rightNames.length) return [leftNames, rightNames];
  return [leftIds, rightIds];
}

function disjointValues(left, right) {
  const rightSet = new Set(right);
  return left.every(value => !rightSet.has(value));
}

function materialDivergentTails(left, right, commonLength) {
  const leftTail = left.slice(commonLength), rightTail = right.slice(commonLength);
  return leftTail.length >= 2 && rightTail.length >= 2 && disjointValues(leftTail, rightTail);
}

function materialDivergentHeads(left, right, commonLength) {
  const leftHead = left.slice(0, left.length - commonLength), rightHead = right.slice(0, right.length - commonLength);
  return leftHead.length >= 2 && rightHead.length >= 2 && disjointValues(leftHead, rightHead);
}

function materialDivergentInternalCorridors(left, right) {
  const leftInternal = left.slice(1, -1), rightInternal = right.slice(1, -1);
  return leftInternal.length >= 2 && rightInternal.length >= 2 && disjointValues(leftInternal, rightInternal);
}

function hardCorridorSeparation(first, second) {
  const [leftPattern, rightPattern] = comparablePatternValues(first, second);
  if (leftPattern.length < 2 || rightPattern.length < 2) return false;
  const sharedPrefix = commonPatternPrefixLength(leftPattern, rightPattern);
  if (sharedPrefix >= 2 && materialDivergentTails(leftPattern, rightPattern, sharedPrefix)) return true;
  const sharedSuffix = commonPatternPrefixLength([...leftPattern].reverse(), [...rightPattern].reverse());
  if (sharedSuffix >= 2 && materialDivergentHeads(leftPattern, rightPattern, sharedSuffix)) return true;
  const leftEndpoints = endpointPair(first), rightEndpoints = endpointPair(second);
  return leftEndpoints.origin && leftEndpoints.destination
    && leftEndpoints.origin === rightEndpoints.origin
    && leftEndpoints.destination === rightEndpoints.destination
    && materialDivergentInternalCorridors(leftPattern, rightPattern);
}

function provenPatternRelationship(first, second) {
  const left = explicitPattern(first);
  const right = explicitPattern(second);
  if (!left.length || !right.length) return false;
  return strictSubsequence(left, right) || strictSubsequence(right, left);
}

function longestCommonSubsequenceLength(left, right) {
  const previous = Array(right.length + 1).fill(0);
  for (const leftValue of left) {
    const current = Array(right.length + 1).fill(0);
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = leftValue === right[rightIndex - 1]
        ? previous[rightIndex - 1] + 1
        : Math.max(previous[rightIndex], current[rightIndex - 1]);
    }
    for (let rightIndex = 0; rightIndex < previous.length; rightIndex += 1) previous[rightIndex] = current[rightIndex];
  }
  return previous.at(-1) ?? 0;
}

function reversePatternRelationship(first, second) {
  const left = explicitPattern(first), right = explicitPattern(second);
  if (left.length < 2 || right.length < 2) return false;
  const forwardRelationship = strictSubsequence(left, right) || strictSubsequence(right, left);
  if (forwardRelationship) return false;
  if (closedPhysicalShape(first) || closedPhysicalShape(second)) return false;
  return longestCommonSubsequenceLength(left, [...right].reverse()) >= 2;
}

function sharedPatternValues(first, second) {
  const right = new Set(explicitPattern(second));
  return new Set(explicitPattern(first).filter(value => right.has(value)));
}

function corridorNames(service) {
  return unique([...(service?.principalLocations ?? []), ...orderedPatternNames(service)]).map(normal).filter(Boolean);
}

function sharedCorridorNames(first, second) {
  const right = new Set(corridorNames(second));
  return new Set(corridorNames(first).filter(value => right.has(value)));
}

function sharedStopIds(first, second) {
  const right = new Set(unique([...(second?.stopIds ?? []), ...(second?.assessedStops ?? [])]));
  return new Set(unique([...(first?.stopIds ?? []), ...(first?.assessedStops ?? [])]).filter(value => right.has(value)));
}

function patternCorridorRelationship(first, second) {
  if (reverseEndpointRelationship(first, second) || reversePatternRelationship(first, second)) return false;
  const sameLineage = sameServiceLineage(first, second);
  const sameDirection = directionKey(first) === directionKey(second) && directionKey(first) !== 'direction-not-supplied';
  const endpointOverlap = endpointRelationship(first, second);
  const sharedPatterns = sharedPatternValues(first, second);
  const sharedNames = sharedCorridorNames(first, second);
  const sharedStops = sharedStopIds(first, second);
  if (provenPatternRelationship(first, second)) return true;
  if (sharedPatterns.size >= 2) return true;
  if (sameLineage && sharedNames.size >= 2) return true;
  if (sameLineage && sameDirection && (endpointOverlap || sharedNames.size > 0 || sharedStops.size >= 2)) return true;
  if (sameDirection && endpointOverlap && (sameLineage || sharedPatterns.size > 0 || sharedStops.size >= 2)) return true;
  return false;
}

function markerAliasPairs(services) {
  const byEndpoint = new Map();
  for (const service of services) {
    const pair = endpointPair(service);
    if (!pair.origin || !pair.destination) continue;
    const key = `${pair.origin}|${pair.destination}`;
    const current = byEndpoint.get(key) ?? [];
    current.push(service);
    byEndpoint.set(key, current);
  }
  const aliases = [];
  for (const endpointServices of byEndpoint.values()) {
    const markers = unique(endpointServices.map(explicitDirectionMarker).filter(Boolean));
    // A directed endpoint pair with exactly two feed-local markers is a
    // useful cross-feed alias.  Endpoint pairs with three or more markers
    // are directionally ambiguous and must be resolved by stronger evidence.
    if (markers.length !== 2) continue;
    const first = endpointServices.find(service => explicitDirectionMarker(service) === markers[0]);
    const second = endpointServices.find(service => explicitDirectionMarker(service) === markers[1]);
    const firstSource = normal(first?.timetableSource || first?.frequencyEvidenceSource || first?.source?.provider || first?.provider);
    const secondSource = normal(second?.timetableSource || second?.frequencyEvidenceSource || second?.source?.provider || second?.provider);
    // Marker aliasing is a cross-feed reconciliation rule.  Within one
    // source, a marker conflict remains meaningful direction evidence.
    if (first && second && firstSource && secondSource && firstSource !== secondSource && operatorFamilyCompatible(first, second)) aliases.push({ first, second });
  }
  return aliases;
}

function markerAliasMatch(first, second, aliases) {
  const leftMarker = explicitDirectionMarker(first), rightMarker = explicitDirectionMarker(second);
  if (!leftMarker || !rightMarker || leftMarker === rightMarker) return false;
  return aliases.some(alias => {
    const aliasLeft = explicitDirectionMarker(alias.first), aliasRight = explicitDirectionMarker(alias.second);
    return ((leftMarker === aliasLeft && rightMarker === aliasRight
      && operatorFamilyCompatible(first, alias.first) && operatorFamilyCompatible(second, alias.second))
      || (leftMarker === aliasRight && rightMarker === aliasLeft
        && operatorFamilyCompatible(first, alias.second) && operatorFamilyCompatible(second, alias.first)));
  });
}

function connectedServiceComponents(services) {
  const aliases = markerAliasPairs(services);
  const compatiblePairs = new Set();
  for (let left = 0; left < services.length; left += 1) {
    for (let right = left + 1; right < services.length; right += 1) {
      if (hardCorridorSeparation(services[left], services[right])) continue;
      if (!compatibleDirection(services[left], services[right], aliases)) continue;
      compatiblePairs.add(`${left}:${right}`);
    }
  }
  const ambiguousMarkerChoice = new Map();
  for (let index = 0; index < services.length; index += 1) {
    if (explicitDirectionMarker(services[index])) continue;
    const connectedMarkers = new Set();
    for (const pair of compatiblePairs) {
      const [left, right] = pair.split(':').map(Number);
      if (left !== index && right !== index) continue;
      const other = left === index ? right : left;
      const marker = explicitDirectionMarker(services[other]);
      if (marker) connectedMarkers.add(marker);
    }
    if (connectedMarkers.size > 1) ambiguousMarkerChoice.set(index, [...connectedMarkers][0]);
  }
  // A short working or markerless connector that is compatible with two
  // services which are themselves hard-separated is ambiguous evidence.  It
  // must remain auditable, but it cannot be allowed to choose a principal
  // branch based on input order.
  const ambiguousIndexes = new Set();
  for (let connector = 0; connector < services.length; connector += 1) {
    for (let left = 0; left < services.length; left += 1) {
      if (left === connector) continue;
      const leftPair = connector < left ? `${connector}:${left}` : `${left}:${connector}`;
      if (!compatiblePairs.has(leftPair)) continue;
      for (let right = left + 1; right < services.length; right += 1) {
        if (right === connector) continue;
        const rightPair = connector < right ? `${connector}:${right}` : `${right}:${connector}`;
        const leftMarker = explicitDirectionMarker(services[left]);
        const rightMarker = explicitDirectionMarker(services[right]);
        const connectorMarker = explicitDirectionMarker(services[connector]);
        const leftEndpoints = endpointPair(services[left]);
        const rightEndpoints = endpointPair(services[right]);
        const connectorEndpoints = endpointPair(services[connector]);
        const sharesCommonOrigin = connectorEndpoints.origin
          && leftEndpoints.origin && rightEndpoints.origin
          && connectorEndpoints.origin === leftEndpoints.origin
          && connectorEndpoints.origin === rightEndpoints.origin;
        const sharesCommonDestination = connectorEndpoints.destination
          && leftEndpoints.destination && rightEndpoints.destination
          && connectorEndpoints.destination === leftEndpoints.destination
          && connectorEndpoints.destination === rightEndpoints.destination;
        const markerEvidenceIsAmbiguous = !connectorMarker
          || (leftMarker && rightMarker && connectorMarker === leftMarker && connectorMarker === rightMarker);
        const connectorIsACommonShortWorking = provenPatternRelationship(services[connector], services[left])
          && provenPatternRelationship(services[connector], services[right]);
        if (compatiblePairs.has(rightPair) && hardCorridorSeparation(services[left], services[right])
          && markerEvidenceIsAmbiguous && (sharesCommonOrigin || sharesCommonDestination)
          && connectorIsACommonShortWorking) {
          ambiguousIndexes.add(connector);
        }
      }
    }
  }
  const components = [];
  const visited = new Set();
  for (let start = 0; start < services.length; start += 1) {
    if (visited.has(start) || ambiguousIndexes.has(start)) continue;
    const queue = [start];
    const component = [];
    const componentIndexes = [];
    visited.add(start);
    while (queue.length) {
      const current = queue.shift();
      component.push(services[current]);
      componentIndexes.push(current);
      for (let candidate = 0; candidate < services.length; candidate += 1) {
        if (visited.has(candidate) || ambiguousIndexes.has(candidate) || candidate === current) continue;
        const pair = current < candidate ? `${current}:${candidate}` : `${candidate}:${current}`;
        if (!compatiblePairs.has(pair)) continue;
        // Check all accepted and reserved members before reserving a
        // candidate; this keeps component formation independent of queue
        // order when a hard corridor conflict is present.
        const reservedConflict = [...componentIndexes, ...queue]
          .some(index => hardCorridorSeparation(services[index], services[candidate]));
        const queuedContinuation = queue.some(index => provenPatternRelationship(services[index], services[candidate]));
        if (reservedConflict && !queuedContinuation) continue;
        const currentChoice = ambiguousMarkerChoice.get(current);
        const candidateChoice = ambiguousMarkerChoice.get(candidate);
        const currentMarker = explicitDirectionMarker(services[candidate]);
        const candidateMarker = explicitDirectionMarker(services[current]);
        if ((currentChoice && currentMarker && currentChoice !== currentMarker)
          || (candidateChoice && candidateMarker && candidateChoice !== candidateMarker)) continue;
        visited.add(candidate);
        queue.push(candidate);
      }
    }
    const ambiguousServices = [...ambiguousIndexes]
      .filter(index => componentIndexes.some(member => compatiblePairs.has(
        member < index ? `${member}:${index}` : `${index}:${member}`)))
      .map(index => services[index]);
    Object.defineProperty(component, 'ambiguousServices', {
      value: Object.freeze(ambiguousServices), enumerable: false
    });
    components.push(component);
  }
  return components;
}

function compatibleDirection(first, second, aliases = []) {
  // Operator and feed identity are evidence fields, not public direction
  // identity.  The same route-direction can therefore be represented by
  // more than one current operator or prepared feed.
  if (hardCorridorSeparation(first, second)) return false;
  if (reverseEndpointRelationship(first, second)) return false;
  if (hasPublicServiceCopyEvidence(first, second)) return true;
  const leftEndpoints = endpointPair(first), rightEndpoints = endpointPair(second);
  if (leftEndpoints.origin && leftEndpoints.destination && rightEndpoints.origin && rightEndpoints.destination) {
    if (leftEndpoints.origin === rightEndpoints.origin || leftEndpoints.destination === rightEndpoints.destination) {
      // When both endpoint pairs are complete, physical endpoint orientation
      // is the primary public-direction evidence.  BODS/TNDS and operator
      // feeds may use different local markers for the same direction, so a
      // marker conflict must not split an otherwise evidenced corridor.
      const exactEndpointPair = leftEndpoints.origin === rightEndpoints.origin && leftEndpoints.destination === rightEndpoints.destination;
      const markerConflict = explicitDirectionMarker(first)
        && explicitDirectionMarker(second)
        && explicitDirectionMarker(first) !== explicitDirectionMarker(second);
      const sharedStops = sharedStopIds(first, second);
      const leftPattern = explicitPattern(first);
      const rightPattern = explicitPattern(second);
      const commonPrefixLength = commonPatternPrefixLength(leftPattern, rightPattern);
      const leftTailLength = leftPattern.length - commonPrefixLength;
      const rightTailLength = rightPattern.length - commonPrefixLength;
      const leftDestinationInRightPattern = orderedPatternNames(second).some(name => normal(name) === leftEndpoints.destination);
      const rightDestinationInLeftPattern = orderedPatternNames(first).some(name => normal(name) === rightEndpoints.destination);
      const materiallyDivergentBranchPatterns = leftPattern.length >= 2
        && rightPattern.length >= 2
        && commonPrefixLength >= 2
        && leftTailLength >= 2
        && rightTailLength >= 2
        && !provenPatternRelationship(first, second)
        && !leftDestinationInRightPattern
        && !rightDestinationInLeftPattern
        && (leftEndpoints.origin !== rightEndpoints.origin || leftEndpoints.destination !== rightEndpoints.destination);
      // A shared route lineage, direction label and trunk do not, by themselves,
      // prove that two complete patterned services are one public row.  When
      // both patterns share an ordered trunk and then carry material unique
      // tails to different endpoints, retain two physical branches.  A genuine
      // short working remains eligible because its pattern is a strict ordered
      // subsequence and therefore cannot satisfy both tail thresholds.
      if (materiallyDivergentBranchPatterns) return false;
      const corridorEvidence = exactEndpointPair
        || sameServiceLineage(first, second)
        || provenPatternRelationship(first, second)
        || sharedPatternValues(first, second).size > 0
        || (sameServiceLineage(first, second) && sharedCorridorNames(first, second).size > 0)
        || sharedStops.size >= 2;
      // A cross-feed marker conflict is safe only with an exact directed
      // endpoint pair or at least two shared physical stops.  This permits
      // BODS/TNDS variants to meet while preventing a marker from bridging
      // opposite directions through a single central stop.
      if (markerConflict) return markerAliasMatch(first, second, aliases)
        || sharedStops.size >= 2
        || provenPatternRelationship(first, second);
      return corridorEvidence;
    }
  }
  const leftMarker = explicitDirectionMarker(first);
  const rightMarker = explicitDirectionMarker(second);
  if (leftMarker && rightMarker) return leftMarker === rightMarker && patternCorridorRelationship(first, second);
  const leftPattern = explicitPattern(first);
  const rightPattern = explicitPattern(second);
  if (leftPattern.length && rightPattern.length) return patternCorridorRelationship(first, second);
  if (directionKey(first) === directionKey(second)) return patternCorridorRelationship(first, second);
  return endpointRelationship(first, second);
}

function routeGroupKey(service) {
  // Circular/linear is a service-family characteristic, not a row identity.
  // Keep the evidence available on the resulting row while allowing a
  // circular classification variant to consolidate with its principal
  // direction when the route/pattern evidence supports that relationship.
  return normal(service?.routeNumber).replace(/\s+/g, '');
}

function publicRouteNumberStem(service) {
  const route = text(service?.routeNumber).toUpperCase().replace(/\s+/g, '');
  if (/^N\d/.test(route)) return '';
  const match = route.match(/^(\d+)([A-Z]+)?$/);
  return match ? match[1] : '';
}

function publicRouteFamilyCandidate(first, second) {
  const left = publicRouteNumberStem(first), right = publicRouteNumberStem(second);
  if (!left || left !== right || routeGroupKey(first) === routeGroupKey(second)) return false;
  if (!operatorFamilyCompatible(first, second) || !compatibleDirection(first, second)) return false;
  return sameServiceLineage(first, second)
    || provenPatternRelationship(first, second)
    || sharedPatternValues(first, second).size >= 2;
}

function publicRouteFamilyBuckets(services = []) {
  const records = [...(services ?? [])];
  const parent = records.map((_, index) => index);
  const find = index => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (left, right) => { const a = find(left), b = find(right); if (a !== b) parent[b] = a; };
  for (let left = 0; left < records.length; left += 1) for (let right = left + 1; right < records.length; right += 1) {
    if (publicRouteFamilyCandidate(records[left], records[right])) join(left, right);
  }
  const buckets = new Map();
  records.forEach((service, index) => {
    const root = find(index);
    const key = publicRouteNumberStem(service) && records.some((candidate, candidateIndex) => find(candidateIndex) === root && candidateIndex !== index)
      ? `family:${publicRouteNumberStem(service)}`
      : `route:${routeGroupKey(service)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(service);
  });
  return buckets;
}

function closedPhysicalShape(service) {
  const pattern = explicitPattern(service);
  const names = orderedPatternNames(service).map(normal).filter(Boolean);
  const endpoints = endpointPair(service);
  return (pattern.length > 1 && pattern[0] === pattern.at(-1))
    || (names.length > 1 && names[0] === names.at(-1))
    || Boolean(endpoints.origin && endpoints.destination && endpoints.origin === endpoints.destination);
}

function hasTwoWayDirectionEvidence(services) {
  const markers = unique((services ?? []).map(explicitDirectionMarker).filter(Boolean));
  return markers.length > 1;
}

function resolveCircularPresentation(component, routeFamilyServices = component) {
  const relevantServices = (routeFamilyServices ?? []).filter(service => component.includes(service)
    || component.some(member => operatorFamilyCompatible(member, service)
      && sameServiceLineage(member, service)
      && patternCorridorRelationship(member, service)));
  const hasClosedCircularEvidence = component.some(service => Boolean(service?.circular) && closedPhysicalShape(service));
  const hasOpenLinearEvidence = relevantServices.some(service => service?.circular === false && !closedPhysicalShape(service));
  // A source may label one direction as a loop while the route family also
  // contains an open counterpart.  Once both direction markers and an open
  // pattern are present in the family, the loop label is not a safe public
  // row identity (the deployed 310 evidence is the motivating case).
  if (hasTwoWayDirectionEvidence(routeFamilyServices) && hasOpenLinearEvidence) return false;
  if (hasClosedCircularEvidence) return true;
  return component.some(service => Boolean(service?.circular));
}

function candidateStopIds(component) {
  return unique(component.flatMap(service => [service.frequencyBasisStopId, ...(service.stopIds ?? []), ...(service.assessedStops ?? [])]));
}

function hasTimetableEvidenceAt(service, id) {
  const stop = text(id);
  if (!stop) return false;
  const hasScheduledEntries = DAY_ORDER.some(day => (service?.departuresByDay?.[day] ?? []).length || (service?.departureEvidenceByDay?.[day] ?? []).length);
  if (text(service?.frequencyBasisStopId) === stop && hasScheduledEntries) return true;
  if (DAY_ORDER.some(day => (service?.departureEvidenceByDay?.[day] ?? []).some(item => text(item?.stopPointId) === stop))) return true;
  const candidates = unique([...(service?.stopIds ?? []), ...(service?.assessedStops ?? [])]);
  const hasUnboundEntries = DAY_ORDER.some(day => [
    ...(service?.departuresByDay?.[day] ?? []),
    ...(service?.departureEvidenceByDay?.[day] ?? [])
  ].some(item => !text(item?.stopPointId)));
  return hasUnboundEntries && candidates.length === 1 && candidates[0] === stop;
}

function stopRank(stop) {
  const walking = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number.POSITIVE_INFINITY;
  const distance = Number(stop?.distanceMetres);
  return [Number.isFinite(walking) ? 0 : 1, Number.isFinite(walking) ? walking : Number.POSITIVE_INFINITY, Number.isFinite(distance) ? 0 : 1, Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY, stopId(stop)];
}

function compareStopRank(first, second) {
  const left = stopRank(first);
  const right = stopRank(second);
  for (let index = 0; index < left.length - 1; index += 1) if (left[index] !== right[index]) return left[index] - right[index];
  return left.at(-1).localeCompare(right.at(-1));
}

function selectRepresentativeStop(component, stops) {
  const byId = new Map((stops ?? []).map(stop => [stopId(stop), stop]).filter(([id]) => id));
  const ids = candidateStopIds(component);
  const evidenceIds = ids.filter(id => component.some(service => hasTimetableEvidenceAt(service, id)));
  const candidates = (evidenceIds.length ? evidenceIds : ids).map(id => byId.get(id)).filter(Boolean);
  const stop = [...candidates].sort(compareStopRank)[0] ?? null;
  const fallbackId = (evidenceIds[0] || ids[0]) || null;
  return { stop, id: stopId(stop) || fallbackId, name: text(stop?.name) || text(component.find(service => service.frequencyBasisStopId === fallbackId)?.frequencyBasisStopName) || null };
}

function serviceAtRepresentative(service, representativeId) {
  if (!representativeId) return false;
  const basis = text(service?.frequencyBasisStopId);
  if (basis) return basis === representativeId;
  if (DAY_ORDER.some(day => (service?.departureEvidenceByDay?.[day] ?? []).some(item => text(item?.stopPointId) === representativeId))) return true;
  const candidates = unique([...(service?.stopIds ?? []), ...(service?.assessedStops ?? [])]);
  const hasUnboundEntries = DAY_ORDER.some(day => [
    ...(service?.departuresByDay?.[day] ?? []),
    ...(service?.departureEvidenceByDay?.[day] ?? [])
  ].some(item => !text(item?.stopPointId)));
  if (hasUnboundEntries) return candidates.length === 1 && candidates[0] === representativeId;
  return false;
}

function departureIdentity(item) {
  return text(item?.journeyIdentity || item?.journeyId || item?.sourceJourneyId || item?.vehicleJourneyCode || item?.tripId || item?.vehicleJourneyId || item?.journeyCode);
}

function serviceDepartureEntries(service, representativeId) {
  if (!serviceAtRepresentative(service, representativeId)) return [];
  const evidence = service?.departureEvidenceByDay;
  const hasEvidence = evidence && DAY_ORDER.some(day => Array.isArray(evidence[day]));
  return DAY_ORDER.flatMap(day => {
    const explicitEntries = hasEvidence && Array.isArray(evidence[day]) ? evidence[day] : null;
    const scopedEntries = explicitEntries && explicitEntries.some(item => text(item?.stopPointId))
      ? explicitEntries.filter(item => text(item?.stopPointId) === representativeId)
      : explicitEntries;
    const entries = scopedEntries?.length ? scopedEntries : (service?.departuresByDay?.[day] ?? []);
    return entries.map(item => {
      const minute = Number(item?.minute ?? item?.departureMinute ?? item?.time ?? item);
      if (!Number.isFinite(minute)) return null;
      const calendarProfileId = calendarProfileFromEntry(service, item);
      return { day, minute, stopPointId: text(item?.stopPointId) || representativeId, journeyIdentity: departureIdentity(item) || null, provider: text(item?.provider || service?.timetableSource || service?.source?.provider) || null, sourceRecordId: text(item?.sourceRecordId || service?.id) || null, routeNumber: text(item?.routeNumber || service?.routeNumber), direction: text(item?.direction || service?.direction || service?.destination || service?.origin), origin: text(item?.origin || service?.origin), destination: text(item?.destination || service?.destination), calendarProfileId, calendarProfileIds: [calendarProfileId] };
    }).filter(Boolean);
  });
}

function semanticDepartureKey(entry) {
  return [entry.routeNumber, entry.direction, entry.origin, entry.destination, entry.stopPointId, entry.day, entry.minute, entry.calendarProfileId].map(normal).join('|');
}

function deduplicateDepartureEntries(entries) {
  const bySemantic = new Map();
  const byStrongIdentity = new Map();
  const output = [];
  const ordered = entries.slice().sort((first, second) => DAY_ORDER.indexOf(first.day) - DAY_ORDER.indexOf(second.day) || first.minute - second.minute || (departureIdentity(first) ? 0 : 1) - (departureIdentity(second) ? 0 : 1) || semanticDepartureKey(first).localeCompare(semanticDepartureKey(second)));
  for (const entry of ordered) {
    const semantic = semanticDepartureKey(entry);
    const existing = bySemantic.get(semantic) ?? [];
    const identity = departureIdentity(entry);
    const strongKey = identity ? [entry.routeNumber, identity, entry.stopPointId, entry.day, entry.minute].map(normal).join('|') : null;
    const identityEntries = strongKey ? (byStrongIdentity.get(strongKey) ?? []) : [];
    // A stable physical journey identity is authoritative when the semantic
    // departure agrees.  Keep a provider-scoped copy when the same local ID
    // is attached to materially different route semantics; that is not safe
    // evidence that the two records describe one physical departure.
    const provider = normal(entry.provider) || 'provider-unspecified';
    const duplicateCandidate = strongKey
      ? identityEntries.find(candidate => (normal(candidate.provider) || 'provider-unspecified') === provider || semanticDepartureKey(candidate) === semantic)
      : null;
    if (duplicateCandidate) {
      duplicateCandidate.calendarProfileIds = unique([...calendarProfileIdsForEntry(duplicateCandidate), ...calendarProfileIdsForEntry(entry)]);
      duplicateCandidate.calendarProfileId = duplicateCandidate.calendarProfileIds.length === 1 ? duplicateCandidate.calendarProfileIds[0] : null;
      continue;
    }
    if (!strongKey && existing.length > 0) continue;
    if (strongKey) {
      identityEntries.push(entry);
      byStrongIdentity.set(strongKey, identityEntries);
    }
    existing.push(entry);
    bySemantic.set(semantic, existing);
    output.push(entry);
  }
  return output;
}

function canonicalDeparturePopulation(component, representativeId, main) {
  const eligible = component.filter(service => serviceAtRepresentative(service, representativeId));
  const records = eligible.length ? eligible : (main ? [main] : []);
  const entries = deduplicateDepartureEntries(records.flatMap(service => serviceDepartureEntries(service, representativeId)));
  const schedules = emptySchedule();
  for (const entry of entries) schedules[entry.day].push(entry.minute);
  for (const day of DAY_ORDER) schedules[day].sort((first, second) => first - second);
  return { entries, schedules, eligible };
}

function schedulesFromEntries(entries) {
  const schedules = emptySchedule();
  for (const entry of entries) schedules[entry.day].push(entry.minute);
  for (const day of DAY_ORDER) schedules[day].sort((first, second) => first - second);
  return schedules;
}

function physicalDepartureKey(entry) {
  const identity = departureIdentity(entry);
  return identity ? [entry.routeNumber, identity, entry.stopPointId, entry.day, entry.minute].map(normal).join('|') : null;
}

function calendarPartition(entries, profileId, ordinaryEntries, hasOrdinaryProfile) {
  const candidates = entries.filter(entry => {
    const profiles = calendarProfileIdsForEntry(entry);
    // Missing supplementary taxonomy can corroborate an authoritative
    // ordinary calendar, but must not be relabelled as restricted or
    // unresolved calendar evidence.
    return profiles.includes(profileId)
      || (profileId === 'ordinary' && profiles.length === 0)
      || (profileId === null && profiles.length === 0);
  });
  const ordinaryPhysicalJourneys = hasOrdinaryProfile && profileId !== 'ordinary'
    ? new Set(ordinaryEntries.map(physicalDepartureKey).filter(Boolean))
    : new Set();
  const partitionEntries = profileId !== 'ordinary' && ordinaryPhysicalJourneys.size
    ? candidates.filter(entry => {
      const key = physicalDepartureKey(entry);
      return !key || !ordinaryPhysicalJourneys.has(key);
    })
    : candidates;
  return { entries: partitionEntries, schedules: schedulesFromEntries(partitionEntries) };
}

function profileFrequencyEvidence(component, representativeId, profileId) {
  return component.filter(service => serviceAtRepresentative(service, representativeId)).flatMap(service => (service.frequencyEvidence ?? [])
    .filter(item => !item.stopPointId || text(item.stopPointId) === representativeId)
    .filter(item => calendarProfileFromEntry(service, item) === profileId));
}

function profileEligibleServices(component, representativeId, profileId) {
  return component.filter(service => serviceAtRepresentative(service, representativeId)
    && serviceDepartureEntries(service, representativeId).some(entry => {
      const profiles = calendarProfileIdsForEntry(entry);
      return profiles.includes(profileId) || ((profileId === 'ordinary' || profileId === null) && profiles.length === 0);
    }));
}

function calculateProfileResult(component, representativeId, profileId, partition) {
  const eligible = profileEligibleServices(component, representativeId, profileId);
  const evidence = profileFrequencyEvidence(eligible.length ? eligible : component, representativeId, profileId);
  const calculationEvidence = eligible.length <= 1 || eligible.every(service => (service.frequencyEvidence ?? [])
    .some(item => (!item.stopPointId || text(item.stopPointId) === representativeId) && calendarProfileFromEntry(service, item) === profileId)) ? evidence : [];
  const frequencyByDay = Object.freeze(Object.fromEntries(DAY_ORDER.map(day => [day, calculateTypicalServiceFrequency(partition.schedules[day], { day, frequencyEvidence: calculationEvidence })])));
  return Object.freeze({
    entries: Object.freeze(partition.entries),
    schedules: Object.freeze(partition.schedules),
    periods: calculateOperatingPeriods(partition.schedules),
    frequencyByDay,
    frequencyLines: Object.freeze(formatTypicalFrequency(frequencyByDay)),
    operatingLines: Object.freeze(formatOperatingPeriod(calculateOperatingPeriods(partition.schedules))),
    frequencyEvidence: Object.freeze(evidence)
  });
}

function calendarQualifiedLines(lines, profileId, additional = false) {
  const label = calendarProfileDisplayLabel(profileId) + (additional ? ' (additional)' : '');
  return lines.map(line => `${label}: ${line}`);
}

function hasCalendarTaxonomyNote(note) {
  return /^(?:School days only\.|Non-school days only\.|Term-time service\.|Timetable varies between school and non-school days\.)$/i.test(text(note));
}

function principalJourneyKeys(service, representativeId) {
  return new Set(serviceDepartureEntries(service, representativeId).map(entry => physicalDepartureKey(entry) || semanticDepartureKey(entry)));
}

function principalSupport(service, component, representativeId) {
  const destination = normal(plannerDestination(service));
  const destinationServices = component.filter(candidate => normal(plannerDestination(candidate)) === destination);
  const destinationJourneys = new Set(destinationServices.flatMap(candidate => [...principalJourneyKeys(candidate, representativeId)]));
  const journeys = principalJourneyKeys(service, representativeId);
  return {
    destinationJourneys: destinationJourneys.size,
    destinationRecords: destinationServices.length,
    journeys: journeys.size,
    activity: Number(service.recordActivity) || 0
  };
}

function compareMain(first, second, representativeId, component = [first, second]) {
  const firstSupport = principalSupport(first, component, representativeId);
  const secondSupport = principalSupport(second, component, representativeId);
  return Number(resolvedPlannerDestination(second)) - Number(resolvedPlannerDestination(first))
    || sourceAuthorityRank(second) - sourceAuthorityRank(first)
    || assessedEndpointSupport(second) - assessedEndpointSupport(first)
    || secondSupport.destinationJourneys - firstSupport.destinationJourneys
    || secondSupport.destinationRecords - firstSupport.destinationRecords
    || secondSupport.journeys - firstSupport.journeys
    || secondSupport.activity - firstSupport.activity
    || (second.routePatternExtent ?? explicitPattern(second).length) - (first.routePatternExtent ?? explicitPattern(first).length)
    || (second.principalLocations?.length ?? 0) - (first.principalLocations?.length ?? 0)
    || (text(first.origin) + '|' + text(first.destination) + '|' + text(first.id)).localeCompare(text(second.origin) + '|' + text(second.destination) + '|' + text(second.id));
}

function frequencyEvidence(component, representativeId) {
  return component.filter(service => serviceAtRepresentative(service, representativeId))
    .flatMap(service => (service.frequencyEvidence ?? []).filter(item => !item.stopPointId || text(item.stopPointId) === representativeId));
}

function plannerDirection(service) {
  const value = text(service?.stopDirection || service?.direction);
  if (!value || /^(?:gtfs|headsign):/i.test(value)) return '';
  return value;
}

function directionPatternText(service) {
  const destination = text(service?.destination);
  const direction = plannerDirection(service);
  if (service?.circular) {
    const names = orderedPatternNames(service);
    const target = destination && !sourceDirectionMarker(destination) && !/^(?:destination not supplied|destination not resolved)$/i.test(destination)
      ? destination
      : names[0] || '';
    const anchor = unique([...names, ...(service?.principalLocations ?? [])]).find(name => normal(name) !== normal(target) && normal(name) !== normal(service?.origin));
    let value = target && anchor ? `Circular — ${target} via ${anchor}` : '';
    if (!value && names.length > 1 && normal(names[0]) === normal(names.at(-1))) value = `Circular — starts/ends at ${names[0]}`;
    if (!value) value = 'Circular service';
    return direction ? `${value} (${direction})` : value;
  }
  const locality = text(service?.destinationLocality || service?.destinationLocalityName || service?.destinationQualifier);
  const target = destination && !/^(?:destination not supplied|destination not resolved)$/i.test(destination)
    ? destination
    : direction && !sourceDirectionMarker(direction) ? direction : '';
  if (!target || sourceDirectionMarker(target)) return 'Destination not resolved';
  return locality && normal(locality) !== normal(target) ? `Towards ${target} (${locality})` : `Towards ${target}`;
}

function servedAtText(representative) {
  const stop = representative.stop;
  const name = text(stop?.name) || representative.name || 'Representative stop not supplied';
  const indicator = text(stop?.indicator);
  const distance = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number(stop?.distanceMetres);
  const suffix = Number.isFinite(distance) ? ' · ' + Math.round(distance).toLocaleString('en-GB') + ' m' : '';
  return name + (indicator ? ' — ' + indicator : '') + suffix;
}

function materialServiceNote(note) {
  const value = text(note);
  if (!value) return null;
  if (/operating days could not be fully confirmed|calendar applicability is not confirmed|unresolved calendar/i.test(value)) return 'Operating days could not be fully confirmed; check the timetable before use.';
  if (/school[- ]?days?.*non[- ]school|non[- ]school.*school[- ]?days?/i.test(value)) return 'Timetable varies between school and non-school days.';
  if (/non[- ]school|school holidays?/i.test(value)) return 'Non-school days only.';
  if (/school[- ]?days?(?:[- ]only)?|schooldays?/i.test(value)) return 'School days only.';
  if (/term[- ]time|term[- ]only/i.test(value)) return 'Term-time service.';
  if (/circular service/i.test(value)) return 'Circular service.';
  if (/^Includes scheduled short workings or route variants/i.test(value)) return null;
  if (/^\d+ scheduled variants are retained/i.test(value)) return null;
  if (/^(?:Schedule integrity note:|TfL supplied|ATLAS retained|source (?:evidence|processing)|representative stop.*(?:evidence|frequency)|(?:frequency|operating[- ]period).*evidence|timetable evidence.*(?:derived|retained)|full tfl route origin|the timetable did not supply|tfl route metadata|the scheduled evidence is retained|limited service:\s*no more than three scheduled journeys)/i.test(value)) return null;
  return value;
}

function materialServiceNotesForService(service) {
  const raw = text(service?.serviceNote);
  const route = text(service?.routeNumber);
  if (route && /(?:school[- ]?days?|schooldays?)/i.test(raw) && new RegExp(`\\b${route.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(raw)) {
    return [`Route ${route} operates on school days only.`];
  }
  if (route && /term[- ]time|term[- ]only/i.test(raw) && new RegExp(`\\b${route.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(raw)) {
    return [`Route ${route} operates in term time only.`];
  }
  return raw.split(/(?<=[.!?])\s+(?=[A-Z])/u).map(materialServiceNote).filter(Boolean);
}

function noteAppliesToCanonicalPopulation(note, schedules, service = {}) {
  const representedDays = DAY_ORDER.filter(day => (schedules[day] ?? []).length);
  if (/limited service|no more than three scheduled journeys/i.test(note)) return representedDays.length > 0 && representedDays.every(day => (schedules[day] ?? []).length <= 3);
  if (/weekday-only service/i.test(note)) return representedDays.length > 0 && !representedDays.some(day => day === 'saturday' || day === 'sunday');
  if (/^School days only\.$/i.test(note) && text(service?.calendarProfileId).toLowerCase() === 'school-day') return true;
  if (!/non[- ]school/i.test(note) && /school\s*days?/i.test(note) && representedDays.some(day => day === 'saturday' || day === 'sunday')) return false;
  return true;
}

function materialServiceNotesForComponent(component, fallbackSchedules = {}) {
  return unique(component.flatMap(service => materialServiceNotesForService(service)
    .filter(note => noteAppliesToCanonicalPopulation(note,
      hasCalendarMetadata(service) ? (service?.departuresByDay ?? service?.stopSchedules ?? {}) : fallbackSchedules, service))));
}

function preparedEndpointDisplay(service, side = 'destination') {
  const evidence = service?.endpointEvidence?.[side];
  const first = evidence && typeof evidence === 'object' ? Object.values(evidence)[0] : null;
  const name = text(first?.naptanCommonName || first?.stopAreas?.[0]?.name);
  const locality = text(first?.nptgLocalityName);
  if (name && locality && /^(?:bus|coach) station$/i.test(name)) return `${locality} ${name}`;
  return name;
}

function plannerDestination(service) {
  const destination = text(service?.destinationEndpointDecision?.chosenDisplayName
    || service?.destinationEndpointDecision?.chosen
    || preparedEndpointDisplay(service, 'destination')
    || service?.destination);
  return destination && !/^(?:destination not supplied|destination not resolved)$/i.test(destination) && !sourceDirectionMarker(destination)
    ? destination
    : '';
}

function destinationLocalityCandidates(service) {
  const endpoint = Array.isArray(service?.routePatternStops) ? service.routePatternStops.at(-1) : null;
  return unique([
    service?.destinationLocality,
    service?.destinationLocalityName,
    service?.destinationQualifier,
    service?.destinationLocalityEvidence?.name,
    service?.destinationLocalityEvidence?.locality,
    endpoint?.locality,
    endpoint?.localityName,
    endpoint?.nptgLocalityName,
    endpoint?.nptgLocality?.name
  ]).filter(candidate => !/^(?:unknown|not supplied|not resolved|unspecified|various)$/i.test(candidate));
}

function plannerDestinationDecision(service) {
  const resolved = service?.destinationEndpointDecision;
  if (resolved?.chosenDisplayName || resolved?.chosen) return resolved;
  const raw = plannerDestination(service);
  const locality = destinationLocalityCandidates(service).find(candidate => normal(candidate) !== normal(raw));
  if (raw && locality && /\b(?:bus|coach)?\s*(?:station|stand|bay|platform|stop|interchange)\b/i.test(raw)) {
    // Compatibility for direct, pre-BUS-DEST domain callers. Production
    // assessment records carry destinationEndpointDecision from the exact-ID
    // resolver above and therefore never use locality-only evidence.
    return Object.freeze({ raw, rawEndpointText: raw, chosen: locality, chosenDisplayName: locality, simplified: true, decisionType: 'legacy-locality-fallback', reason: 'Destination stand or stop wording was simplified using supplied locality evidence.', evidence: locality });
  }
  return Object.freeze({ raw, rawEndpointText: raw, chosen: raw, chosenDisplayName: raw, simplified: false, decisionType: raw ? 'source-retained' : 'unresolved', reason: raw ? 'The supplied destination wording was retained.' : 'No resolved destination was supplied.', evidence: locality || null });
}

function plannerOrigin(service) {
  const origin = text(service?.originEndpointDecision?.chosenDisplayName
    || service?.originEndpointDecision?.chosen
    || service?.origin);
  return origin && !/^(?:origin not supplied|origin not resolved)$/i.test(origin) && !sourceDirectionMarker(origin)
    ? origin
    : '';
}

function serviceEndpointDecision(service, side) {
  if (side === 'destination') return plannerDestinationDecision(service);
  const resolved = service?.originEndpointDecision;
  if (resolved?.chosenDisplayName || resolved?.chosen) return resolved;
  const raw = text(service?.origin);
  return Object.freeze({
    raw,
    rawEndpointText: raw,
    chosen: raw,
    chosenDisplayName: raw,
    decisionType: raw ? 'source-retained' : 'unresolved',
    reason: raw ? 'The supplied origin wording was retained.' : 'No resolved origin was supplied.',
    unresolved: !raw,
    conflict: false
  });
}

function destinationNames(values) {
  const names = unique(values).filter(Boolean);
  const normalised = names.map(name => ({ name, key: normal(name), words: normal(name).split(' ').filter(Boolean) }));
  return normalised
    .filter(candidate => !normalised.some(other => other !== candidate && other.words.length > candidate.words.length && other.key.includes(candidate.key)))
    .map(candidate => candidate.name)
    .slice(0, 4);
}

function alternateDestinations(component, main) {
  const mainDestination = normal(plannerDestination(main));
  return destinationNames(component.map(plannerDestination).filter(value => normal(value) !== mainDestination));
}

function preparedEndpointLocalities(service, side = 'origin') {
  const evidence = service?.endpointEvidence?.[side];
  if (!evidence || typeof evidence !== 'object') return [];
  return unique(Object.values(evidence).map(entry => entry?.nptgLocalityName).filter(Boolean));
}

function originVariantNames(sourceServices, group) {
  const headlineOrigins = new Set(group.map(({ row }) => normal(row.origin)).filter(Boolean));
  return unique(sourceServices.flatMap(service => preparedEndpointLocalities(service, 'origin')))
    .filter(name => !headlineOrigins.has(normal(name)));
}

function variantCalendarQualification(service) {
  const raw = text(service?.serviceNote);
  const profile = calendarProfileFromService(service);
  if (profile === 'non-school-day' || /non[- ]school/i.test(raw)) return 'non-school days only';
  if (profile === 'school-day' || /\bschool[- ]?days?\b|\bschooldays?\b/i.test(raw)) return 'school days only';
  if (profile === 'term-time' || /term[- ]time|term[- ]only/i.test(raw)) return 'term time only';
  if (profile === 'holiday' || /holiday/i.test(raw)) return 'holidays only';
  return '';
}

function variantNote(component, main, groupingDecision) {
  const endpoints = unique(component.map(service => text(service.origin) + ' → ' + text(service.destination)));
  const patterns = unique(component.map(service => explicitPattern(service).map(text).join('>')).filter(Boolean));
  const journeyIdentitySets = component.map(service => new Set(DAY_ORDER.flatMap(day => (service.departureEvidenceByDay?.[day] ?? []).map(item => departureIdentity(item)).filter(Boolean))));
  const sharedJourneyIdentity = journeyIdentitySets.length > 1 && journeyIdentitySets.every(set => set.size) && [...journeyIdentitySets[0]].some(identity => journeyIdentitySets.every(set => set.has(identity)));
  const hasVariant = component.length > 1 && ((endpoints.length > 1 && !sharedJourneyIdentity)
    || patterns.length > 1
    || component.some(service => Number(service.patternVariantCount) > 1)
    || (groupingDecision?.calendarVariantRecordIds?.length ?? 0) > 0);
  if (!hasVariant) return null;
  const principalDestinationValue = normal(plannerDestination(main));
  const principalOriginEndpoint = endpointPair(main).origin;
  const duplicateIds = new Set(groupingDecision?.deduplicatedSourceRecordIds ?? []);
  const shortIds = new Set(groupingDecision?.shortWorkingRecordIds ?? []);
  const branchIds = new Set(groupingDecision?.branchVariantRecordIds ?? []);
  const calendarIds = new Set(groupingDecision?.calendarVariantRecordIds ?? []);
  const candidates = component
    .filter(service => service !== main)
    .filter(service => !duplicateIds.has(serviceIdForPlanner(service)))
    .map(service => {
      const id = serviceIdForPlanner(service);
      const destination = plannerDestination(service);
      const kind = shortIds.has(id) ? 'short working' : branchIds.has(id) ? 'route variant' : calendarIds.has(id) ? 'calendar variant' : 'variant';
      const qualification = variantCalendarQualification(service);
      const origin = plannerOrigin(service);
      const originDiffers = origin && normal(origin) !== normal(plannerOrigin(main));
      const returnsToAssessedOrigin = endpointPair(service).destination && principalOriginEndpoint
        && endpointPair(service).destination === principalOriginEndpoint
        && originDiffers;
      const endpointRole = kind === 'short working' && originDiffers && normal(destination) === principalDestinationValue ? 'origin' : 'destination';
      return { route: text(service.routeNumber) || 'Route not supplied', destination: endpointRole === 'origin' ? origin : destination, endpointRole, kind, qualification, returnsToAssessedOrigin };
    })
    .filter(item => !item.returnsToAssessedOrigin && item.destination && (item.endpointRole === 'origin' || normal(item.destination) !== principalDestinationValue || item.qualification));
  const grouped = new Map();
  for (const item of candidates) {
    const key = `${item.kind}|${item.endpointRole}|${normal(item.destination)}|${normal(item.qualification)}`;
    const current = grouped.get(key) ?? { ...item, routes: [] };
    if (!current.routes.includes(item.route)) current.routes.push(item.route);
    grouped.set(key, current);
  }
  const notes = [...grouped.values()].map(item => {
    const route = item.routes.length > 1 ? item.routes.join(' / ') : item.routes[0];
    const prefix = item.kind === 'short working' ? 'Additional short workings' : item.kind === 'route variant' ? 'Additional route variants' : 'Additional variants';
    const preposition = item.endpointRole === 'origin' ? 'from' : 'towards';
    return `${route} – ${prefix} ${preposition} ${item.destination}${item.qualification ? ` (${item.qualification})` : ''}.`;
  });
  return notes.length ? notes.join(' ') : 'Additional short workings and timetable variants operate.';
}

function serviceIdForPlanner(service) {
  return text(service?.id || service?.sourceRecordId);
}

function resolvedPlannerDestination(service) {
  const destination = text(service?.destination);
  const direction = plannerDirection(service);
  return Boolean(destination && !/^(?:destination not supplied|destination not resolved)$/i.test(destination) && !sourceDirectionMarker(destination))
    || Boolean(direction && !sourceDirectionMarker(direction));
}

export function plannerSourceWarning(service) {
  const route = text(service?.routeNumber) || 'Unknown route';
  const warnings = [];
  if (!resolvedPlannerDestination(service)) warnings.push(`Route ${route} — one timetable pattern could not be assigned a complete route identity. It is retained as a concise review item and under Detailed Evidence.`);
  if (!text(service?.operator) || /not supplied/i.test(text(service?.operator))) warnings.push(`Route ${route} — operator identity was not deterministically supplied for one timetable pattern. The source evidence is retained under Detailed Evidence.`);
  return warnings;
}

function principalText(main) {
  const locations = unique(main?.principalLocations ?? []);
  return locations.length ? locations.join(', ') : 'See route origin / destination';
}

function plannerStopLabel(stop, { basis = false } = {}) {
  const name = text(stop?.name) || stopId(stop) || 'Selected stop';
  const indicator = text(stop?.indicator);
  const distance = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number(stop?.distanceMetres);
  const suffix = Number.isFinite(distance) ? ` · ${Math.round(distance).toLocaleString('en-GB')} m` : '';
  const reference = text(stop?.mapReference);
  return `${name}${indicator ? ` — ${indicator}` : ''}${suffix}${reference ? ` [${reference}]` : ''}${basis ? '*' : ''}`;
}

function publicDirectionIdentity(component, main) {
  const pairs = component.map(endpointPair).filter(pair => pair.origin || pair.destination);
  const origins = unique(pairs.map(pair => pair.origin));
  const destinations = unique(pairs.map(pair => pair.destination));
  if (origins.length === 1 && destinations.length > 0) return `from:${origins[0]}`;
  if (destinations.length === 1 && origins.length > 0) return `to:${destinations[0]}`;
  return `marker:${directionKey(main)}`;
}

/**
 * A PlannerServiceGroup is the public-service abstraction between prepared
 * timetable records and presentation rows. It intentionally keeps operator,
 * feed, stop, calendar and pattern evidence as members of one group rather
 * than treating any one source record as the row identity.
 */
function buildPlannerServiceGroup(component, stops, main, representative, publicRouteFamilyKey = null) {
  const byId = new Map((stops ?? []).map(stop => [stopId(stop), stop]).filter(([id]) => id));
  const ids = candidateStopIds(component);
  const evidenceIds = ids.filter(id => component.some(service => hasTimetableEvidenceAt(service, id)));
  // `stopIds` is the served-stop evidence set; it must not be reduced to the
  // single stop used for headline calculations.  The evidenceIds set is only
  // used to identify a safe timetable basis below.
  const servedIds = ids.filter(id => byId.has(id));
  const orderedStops = servedIds.map(id => byId.get(id)).sort(compareStopRank);
  const basisId = representative.id || evidenceIds[0] || ids[0] || null;
  const servedStopEvidence = orderedStops.map(stop => Object.freeze({
    id: stopId(stop),
    name: text(stop?.name) || null,
    indicator: text(stop?.indicator) || null,
    mapReference: text(stop?.mapReference) || null,
    logicalGroupLabel: text(stop?.logicalGroupLabel) || null,
    distanceMetres: Number.isFinite(Number(stop?.distanceMetres)) ? Number(stop.distanceMetres) : null,
    walkingDistanceMetres: stop?.walking?.status === 'routed' && Number.isFinite(Number(stop.walking.distanceMetres)) ? Number(stop.walking.distanceMetres) : null,
    timetableBasis: stopId(stop) === basisId,
    label: plannerStopLabel(stop, { basis: stopId(stop) === basisId })
  }));
  const rawOperatorNames = unique(component.map(service => service?.operator));
  const sourceRecordIds = unique(component.flatMap(service => service?.sourceRecordIds ?? [service?.id]));
  const operatorNames = operatorDisplayNames(component);
  const endpointEvidence = unique(component.map(service => `${text(service.origin)} → ${text(service.destination)}`)).sort();
  const endpointIdentity = endpointEvidence.map(value => normal(value)).join('~');
  const originDecision = serviceEndpointDecision(main, 'origin');
  const destinationDecision = serviceEndpointDecision(main, 'destination');
  const groupingDecision = makePublicServiceGroupingDecision({
    services: component,
    principal: main,
    publicRouteFamilyKey,
    ambiguousServices: component.ambiguousServices ?? []
  });
  const terminusDecision = makeTerminusDecision({
    services: component,
    principal: main,
    assessedStops: stops
  });
  return Object.freeze({
    serviceIdentity: `${routeGroupKey(main)}|${publicDirectionIdentity(component, main)}|${endpointIdentity}`,
    routeNumber: text(main?.routeNumber) || 'Not supplied',
    publicDirection: publicDirectionIdentity(component, main),
    principalDestination: destinationDecision.chosen || null,
    principalOrigin: originDecision.chosen || text(main?.origin) || null,
    originEndpointDecision: originDecision,
    destinationEndpointDecision: destinationDecision,
    operatorNames: Object.freeze(operatorNames),
    rawOperatorNames: Object.freeze(rawOperatorNames),
    operatorIdentities: Object.freeze(unique(rawOperatorNames.map(operatorIdentityKey))),
    servedStops: Object.freeze(servedStopEvidence),
    timetableBasis: Object.freeze({
      stopId: basisId,
      name: text(byId.get(basisId)?.name) || text(representative.name) || null,
      label: servedStopEvidence.find(stop => stop.id === basisId)?.label || plannerStopLabel(representative.stop, { basis: true })
    }),
    sourceRecordIds: Object.freeze(sourceRecordIds),
    ambiguousEvidence: Object.freeze([...(component.ambiguousServices ?? [])]),
    services: Object.freeze(component),
    sourceServiceCount: component.length,
    alternateDestinations: Object.freeze(alternateDestinations(component, main)),
    publicServiceGroupingDecision: groupingDecision,
    terminusDecision,
    endpointEvidence: Object.freeze(endpointEvidence),
    calendarEvidence: Object.freeze(component.flatMap(service => service.calendarEvidence ?? [])),
    patternEvidence: Object.freeze(component.map(service => Object.freeze({
      id: text(service.id) || null,
      stopIds: Object.freeze([...(service.routePatternStopIds ?? [])]),
      names: Object.freeze(orderedPatternNames(service))
    })))
  });
}

export function buildPlannerServiceGroups(serviceSummaries = [], stops = []) {
  // Route-family presentation is intentionally downstream of public-service
  // grouping.  A 50 / 50A / 50B family must retain three child public
  // services, even when their common trunk would otherwise connect them in
  // the component graph.  The family decision is applied after these
  // route-number-specific components have been built.
  const grouped = new Map();
  for (const service of serviceSummaries ?? []) {
    const key = `route:${routeGroupKey(service)}`;
    const current = grouped.get(key) ?? [];
    current.push(service);
    grouped.set(key, current);
  }
  return [...grouped.entries()].flatMap(([publicRouteFamilyKey, services]) => connectedServiceComponents(services).map(component => {
    const representative = selectRepresentativeStop(component, stops);
    const main = [...component].sort((first, second) => compareMain(first, second, representative.id, component))[0];
    return Object.freeze({ ...buildPlannerServiceGroup(component, stops, main, representative, publicRouteFamilyKey), publicRouteFamilyKey });
  }));
}

function profileLines(lines, profileLabel) {
  if (!profileLabel) return lines;
  const label = calendarProfileDisplayLabel(profileLabel);
  return lines.map(line => line.replace(/^([^:]+):\s*/, `$1 (${label}): `));
}

function buildPlannerRow(component, stops, componentIndex, routeFamilyServices = component, publicRouteFamilyKey = null, serviceGroupOverride = null) {
  const representative = selectRepresentativeStop(component, stops);
  const main = [...component].sort((first, second) => compareMain(first, second, representative.id, component))[0];
  const plannerServiceGroup = serviceGroupOverride || buildPlannerServiceGroup(component, stops, main, representative, publicRouteFamilyKey);
  const destinationDecision = serviceEndpointDecision(main, 'destination');
  const originDecision = serviceEndpointDecision(main, 'origin');
  const rowCircular = resolveCircularPresentation(component, routeFamilyServices);
  const canonical = canonicalDeparturePopulation(component, representative.id, main);
  const profileIds = orderedCalendarProfiles([
    ...component.map(calendarProfileFromService),
    ...canonical.entries.flatMap(calendarProfileIdsForEntry)
  ]);
  const hasOrdinaryProfile = profileIds.includes('ordinary');
  const ordinaryEntries = canonical.entries.filter(entry => calendarProfileIdsForEntry(entry).includes('ordinary'));
  const profileResults = new Map(profileIds.map(profileId => [
    profileId,
    calculateProfileResult(component, representative.id, profileId, calendarPartition(canonical.entries, profileId, ordinaryEntries, hasOrdinaryProfile))
  ]));
  const effectiveProfileIds = profileIds.filter(profileId => profileResults.get(profileId).entries.length);
  const displayProfileId = effectiveProfileIds.includes('ordinary') ? 'ordinary' : effectiveProfileIds[0] ?? profileIds[0] ?? null;
  const displayResult = profileResults.get(displayProfileId) ?? calculateProfileResult(component, representative.id, displayProfileId, calendarPartition(canonical.entries, displayProfileId, ordinaryEntries, hasOrdinaryProfile));
  const mixedProfileOutput = effectiveProfileIds.length > 1;
  const outputProfileIds = mixedProfileOutput ? effectiveProfileIds : [displayProfileId];
  const unresolvedNeedsQualification = profileIds.includes(UNKNOWN_CALENDAR_PROFILE)
    && (profileIds.length > 1 || component.some(hasCalendarMetadata));
  const displayFrequencyLines = [...displayResult.frequencyLines];
  const displayOperatingLines = [...displayResult.operatingLines];
  let frequencyLines = displayFrequencyLines;
  let operatingLines = displayOperatingLines;
  if (mixedProfileOutput) {
    frequencyLines = outputProfileIds.flatMap(profileId => calendarQualifiedLines(profileResults.get(profileId).frequencyLines, profileId, hasOrdinaryProfile && profileId !== 'ordinary'));
    operatingLines = outputProfileIds.flatMap(profileId => calendarQualifiedLines(profileResults.get(profileId).operatingLines, profileId, hasOrdinaryProfile && profileId !== 'ordinary'));
  } else if (displayProfileId !== 'ordinary' && (displayProfileId !== UNKNOWN_CALENDAR_PROFILE || unresolvedNeedsQualification)) {
    frequencyLines = profileLines(displayFrequencyLines, displayProfileId);
    operatingLines = profileLines(displayOperatingLines, displayProfileId);
  }
  const calendarProfileId = profileIds.length === 1 ? profileIds[0] : null;
  const calendarProfile = calendarProfileLabel(calendarProfileId);
  const profileNotes = [];
  if (mixedProfileOutput) profileNotes.push('Calendar profiles vary; each frequency line is labelled.');
  if (unresolvedNeedsQualification) profileNotes.push('Operating days could not be fully confirmed; check the timetable before use.');
  const notes = materialServiceNotesForComponent(component, displayResult.schedules);
  notes.push(...profileNotes);
  const ids = unique(component.flatMap(service => service.sourceRecordIds ?? []));
  const groupingDecision = Object.freeze({
    ...plannerServiceGroup.publicServiceGroupingDecision,
    deduplicatedSourceRecordIds: Object.freeze(plannerServiceGroup.publicServiceGroupingDecision.deduplicatedSourceRecordIds ?? [])
  });
  const principalLocations = unique(main.principalLocations ?? []);
  const profileSchedules = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).schedules])));
  const profilePopulations = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).entries])));
  const profileFrequency = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).frequencyByDay])));
  const profilePeriods = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).periods])));
  const profileEvidence = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).frequencyEvidence])));
  const servedAtLines = plannerServiceGroup.servedStops.map(stop => stop.label);
  const servedStopIds = unique(plannerServiceGroup.servedStops.map(stop => stop.id));
  const row = {
    id: 'planner:' + plannerServiceGroup.serviceIdentity + '|' + (componentIndex + 1),
    routeNumber: text(main.routeNumber) || 'Not supplied',
    // A planner-facing row must never expose the adapter's unresolved
    // operator placeholder.  The source-level warning remains available in
    // Detailed Evidence; a genuinely unresolved public operator is blank.
    operator: plannerServiceGroup.operatorNames.join(' · '),
    origin: text(main.origin) || 'Origin not supplied',
    destination: destinationDecision.chosen || text(main.destination) || 'Destination not resolved',
    rawDestination: destinationDecision.raw || text(main.destination) || null,
    rawOrigin: originDecision.raw || text(main.origin) || null,
    originEndpointDecision: originDecision,
    destinationDecision,
    direction: text(main.direction),
    stopDirection: text(main.stopDirection) || null,
    circular: rowCircular,
    calendarProfileId,
    calendarProfileLabel: calendarProfile,
    calendarProfileIds: Object.freeze(profileIds),
    calendarProfileLabels: Object.freeze(profileIds.map(calendarProfileDisplayLabel)),
    directionFamily: directionKey(main),
    directionPatternText: directionPatternText({ ...main, destination: destinationDecision.chosen, destinationLocality: null, circular: rowCircular }),
    servedAtStopId: representative.id,
    servedAtText: servedAtLines.join('\n') || servedAtText(representative),
    servedAtStops: Object.freeze(servedAtLines),
    servedStopEvidence: plannerServiceGroup.servedStops,
    timetableBasisStopLabel: plannerServiceGroup.timetableBasis.label,
    frequencyBasisStopId: representative.id,
    frequencyBasisStopName: representative.name,
    principalLocations: Object.freeze(principalLocations),
    principalLocationsText: principalText(main),
    typicalFrequency: displayResult.frequencyByDay[DAY_ORDER.find(day => !displayResult.frequencyByDay[day].noService) ?? 'monday'],
    typicalFrequencyLines: Object.freeze(frequencyLines),
    typicalFrequencyText: frequencyLines.join('\n'),
    frequencyByDay: displayResult.frequencyByDay,
    operatingPeriods: displayResult.periods,
    operatingPeriodLines: Object.freeze(operatingLines),
    departuresByDay: Object.freeze(displayResult.schedules),
    canonicalDeparturePopulation: Object.freeze(Object.fromEntries(DAY_ORDER.map(day => [day, Object.freeze(displayResult.entries.filter(entry => entry.day === day))]))),
    canonicalDeparturePopulationAll: Object.freeze(Object.fromEntries(DAY_ORDER.map(day => [day, Object.freeze(canonical.entries.filter(entry => entry.day === day))]))),
    calendarSchedulesByProfile: profileSchedules,
    calendarDeparturePopulationByProfile: profilePopulations,
    calendarFrequencyByProfile: profileFrequency,
    calendarOperatingPeriodsByProfile: profilePeriods,
    calendarFrequencyEvidenceByProfile: profileEvidence,
    frequencyEvidence: Object.freeze(displayResult.frequencyEvidence),
    serviceNote: unique(notes).join(' '),
    routeGroupKey: routeGroupKey(main),
    publicRouteFamilyKey: publicRouteFamilyKey || routeGroupKey(main),
    stopIds: Object.freeze(servedStopIds.length ? servedStopIds : (representative.id ? [representative.id] : unique(component.flatMap(service => service.stopIds ?? [])))),
    sourceRecordIds: Object.freeze(ids),
    variantCount: component.length,
    variantServiceIds: Object.freeze(unique(component.map(service => service.id))),
    routePatternExtent: Math.max(0, ...component.map(service => Number(service.routePatternExtent) || explicitPattern(service).length)),
    routePatternStops: Object.freeze([...(main.routePatternStops ?? [])]),
    recordActivity: Math.max(0, ...component.map(service => Number(service.recordActivity) || 0)),
    presentation: Object.freeze({ principalLocationsText: principalText(main), rank: 0 }),
    rawServiceSummaries: Object.freeze(component),
    ambiguousServiceSummaries: Object.freeze([...(component.ambiguousServices ?? [])]),
    plannerServiceGroup,
    operatorRawNames: plannerServiceGroup.rawOperatorNames,
    operatorIdentities: plannerServiceGroup.operatorIdentities,
    sourceSelection: canonical.eligible.length ? 'representative-stop scheduled evidence' : 'representative-stop summary fallback',
    routeVariantNote: variantNote(component, main, groupingDecision),
    alternateDestinationNames: Object.freeze(alternateDestinations(component, main)),
    materialAlternateDestinations: groupingDecision.materialDestinationEvidence,
    publicServiceGroupingDecision: groupingDecision,
    sourceAuthority: groupingDecision.authority,
    terminusDecision: plannerServiceGroup.terminusDecision,
    sourceWarnings: Object.freeze(unique(component.flatMap(service => service.sourceWarnings ?? [])))
  };
  return Object.freeze(row);
}

function familyRowsServices(row) {
  return row?.rawServiceSummaries?.length ? [...row.rawServiceSummaries] : [row];
}

function familyDirectionMarker(row) {
  const markers = unique(familyRowsServices(row).map(explicitDirectionMarker).filter(Boolean));
  return markers.length === 1 ? markers[0] : text(row?.directionFamily) || text(row?.direction) || 'direction-not-supplied';
}

function familyStem(row) {
  return publicRouteNumberStem({ routeNumber: row?.routeNumber });
}

function familyPrincipalScore(row) {
  const profileIds = row?.calendarProfileIds ?? [];
  const departurePopulation = Object.values(row?.canonicalDeparturePopulationAll ?? {}).flat().length;
  return Object.freeze({
    routeNumber: text(row?.routeNumber),
    endpointSupport: assessedEndpointSupport(row),
    patternExtent: Number(row?.routePatternExtent) || 0,
    ordinaryCalendar: Number(profileIds.includes('ordinary')),
    timetablePopulation: departurePopulation,
    activity: Number(row?.recordActivity) || 0,
    principalLocationCount: row?.principalLocations?.length ?? 0
  });
}

function compareFamilyPrincipalEvidence(left, right) {
  const leftScore = familyPrincipalScore(left), rightScore = familyPrincipalScore(right);
  return rightScore.endpointSupport - leftScore.endpointSupport
    || rightScore.patternExtent - leftScore.patternExtent
    || rightScore.ordinaryCalendar - leftScore.ordinaryCalendar
    || rightScore.timetablePopulation - leftScore.timetablePopulation
    || rightScore.activity - leftScore.activity
    || rightScore.principalLocationCount - leftScore.principalLocationCount
    || leftScore.routeNumber.localeCompare(rightScore.routeNumber, undefined, { numeric: true });
}

function selectFamilyPrincipal(members) {
  const ordered = [...members].sort(compareFamilyPrincipalEvidence);
  const first = ordered[0] || null;
  const second = ordered[1] || null;
  const firstScore = first ? familyPrincipalScore(first) : null;
  const secondScore = second ? familyPrincipalScore(second) : null;
  const evidenceDifference = firstScore && secondScore
    ? ['endpointSupport', 'patternExtent', 'ordinaryCalendar', 'timetablePopulation', 'activity', 'principalLocationCount']
      .some(field => firstScore[field] !== secondScore[field])
    : Boolean(first);
  return Object.freeze({
    principal: first,
    clear: evidenceDifference,
    principalRouteNumber: firstScore?.routeNumber || null,
    evidence: Object.freeze(ordered.map(row => Object.freeze(familyPrincipalScore(row))))
  });
}

function rowEndpointValues(row) {
  return unique(familyRowsServices(row).flatMap(service => endpointValues(service)));
}

function rowOperatorCompatible(left, right) {
  return familyRowsServices(left).some(first => familyRowsServices(right).some(second => operatorFamilyCompatible(first, second)));
}

function rowSharedStops(left, right) {
  const rightIds = new Set(unique([...(right?.stopIds ?? []), ...(right?.servedStopEvidence ?? []).map(stop => stop.id), ...(right?.rawServiceSummaries ?? []).flatMap(service => [...(service.stopIds ?? []), ...(service.assessedStops ?? [])])]));
  return unique([...(left?.stopIds ?? []), ...(left?.servedStopEvidence ?? []).map(stop => stop.id), ...(left?.rawServiceSummaries ?? []).flatMap(service => [...(service.stopIds ?? []), ...(service.assessedStops ?? [])])]).filter(id => rightIds.has(id));
}

function rowSharedCorridor(left, right) {
  const rightNames = new Set(unique([...(right?.principalLocations ?? []), ...(right?.rawServiceSummaries ?? []).flatMap(service => service.principalLocations ?? [])].map(normal)));
  return unique([...(left?.principalLocations ?? []), ...(left?.rawServiceSummaries ?? []).flatMap(service => service.principalLocations ?? [])].map(normal)).filter(value => rightNames.has(value));
}

function rowPatternOverlap(left, right) {
  const rightValues = new Set(familyRowsServices(right).flatMap(service => explicitPattern(service)));
  return unique(familyRowsServices(left).flatMap(service => explicitPattern(service)).filter(value => rightValues.has(value)));
}

function rowLineageOverlap(left, right) {
  const rightValues = new Set(familyRowsServices(right).flatMap(service => serviceLineageIds(service).map(normal)));
  return unique(familyRowsServices(left).flatMap(service => serviceLineageIds(service).filter(value => rightValues.has(normal(value)))));
}

function publicRouteFamilyPairEvidence(left, right) {
  const sharedStops = rowSharedStops(left, right);
  const sharedCorridor = rowSharedCorridor(left, right);
  const patternOverlap = rowPatternOverlap(left, right);
  const lineageOverlap = rowLineageOverlap(left, right);
  const endpointOverlap = rowEndpointValues(left).filter(value => rowEndpointValues(right).includes(value));
  const sameDirection = familyDirectionMarker(left) === familyDirectionMarker(right)
    && familyDirectionMarker(left) !== 'direction-not-supplied';
  const reverseDirection = familyRowsServices(left).some(first => familyRowsServices(right).some(second => reverseEndpointRelationship(first, second)));
  const hardSeparation = familyRowsServices(left).some(first => familyRowsServices(right).some(second => hardCorridorSeparation(first, second)));
  const operatorCompatible = rowOperatorCompatible(left, right);
  const commonTrunk = sharedStops.length >= 2 || patternOverlap.length >= 2 || sharedCorridor.length >= 2;
  const endpointRelationshipEvidence = endpointOverlap.length > 0 || lineageOverlap.length > 0;
  const proven = !hardSeparation
    && !reverseDirection
    && operatorCompatible
    && sameDirection
    && commonTrunk
    && endpointRelationshipEvidence;
  return Object.freeze({
    leftRouteNumber: text(left?.routeNumber) || null,
    rightRouteNumber: text(right?.routeNumber) || null,
    sharedStopPointIds: Object.freeze(sharedStops),
    sharedCorridorPlaces: Object.freeze(sharedCorridor),
    sharedPatternStopIds: Object.freeze(patternOverlap),
    sharedLineageIds: Object.freeze(lineageOverlap),
    sharedEndpointPlaces: Object.freeze(endpointOverlap),
    operatorCompatible,
    sameDirection,
    reverseDirection,
    hardCorridorSeparation: hardSeparation,
    commonTrunk,
    endpointRelationship: endpointRelationshipEvidence,
    relationship: endpointOverlap.length ? 'shared-endpoint-or-terminal' : lineageOverlap.length ? 'shared-lineage' : commonTrunk ? 'shared-trunk' : 'none',
    proven
  });
}

function familyMemberRelationship(left, right, evidence) {
  const leftEndpoints = rowEndpointValues(left);
  const rightEndpoints = rowEndpointValues(right);
  const shared = evidence.sharedEndpointPlaces;
  return Object.freeze({
    from: text(left?.routeNumber) || null,
    to: text(right?.routeNumber) || null,
    relationship: shared.length
      ? (leftEndpoints.includes(shared[0]) && rightEndpoints.includes(shared[0]) ? 'shared corridor endpoint' : 'shared corridor')
      : evidence.sharedLineageIds.length ? 'lineage-related member' : 'common assessed trunk',
    sharedEndpointPlaces: shared,
    differingEndpointPlaces: Object.freeze(unique([...leftEndpoints, ...rightEndpoints].filter(value => !shared.includes(value))))
  });
}

/**
 * Presentation-family decision.  This deliberately runs after public-service
 * grouping: a family row is a compact view over separate child services, not
 * a new public-service identity and not a reason to weaken endpoint exactness.
 */
export function buildPublicRouteFamilyDecisions(rows = []) {
  const buckets = new Map();
  for (const row of rows ?? []) {
    const stem = familyStem(row);
    if (!stem || /^n/i.test(text(row?.routeNumber))) continue;
    const key = `${stem}|${familyDirectionMarker(row)}`;
    const members = buckets.get(key) ?? [];
    members.push(row);
    buckets.set(key, members);
  }
  return [...buckets.entries()].map(([key, members]) => {
    const memberRouteNumbers = unique(members.map(row => row.routeNumber)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const pairEvidence = [];
    const memberRelationships = [];
    for (let left = 0; left < members.length; left += 1) for (let right = left + 1; right < members.length; right += 1) {
      const evidence = publicRouteFamilyPairEvidence(members[left], members[right]);
      pairEvidence.push(evidence);
      memberRelationships.push(familyMemberRelationship(members[left], members[right], evidence));
    }
    const hardSeparation = pairEvidence.some(evidence => evidence.hardCorridorSeparation || evidence.reverseDirection);
    const unresolved = members.some(row => row.unresolvedPublicIdentity)
      || pairEvidence.some(evidence => !evidence.sameDirection || !evidence.operatorCompatible);
    const principalSelection = selectFamilyPrincipal(members);
    const proven = memberRouteNumbers.length > 1
      && members.length > 1
      && pairEvidence.length > 0
      && pairEvidence.every(evidence => evidence.proven)
      && !members.some(row => row.circular)
      && !hardSeparation
      && principalSelection.clear;
    const state = proven
      ? 'proven-family'
      : hardSeparation
        ? 'materially-divergent-member'
        : unresolved
          ? 'unresolved-review'
          : 'separate-service';
    const reasons = proven
      ? ['The route-number stem is supported by compatible operator evidence, a common assessed trunk/corridor, a shared direction and a related terminal or lineage relationship.', 'Child route numbers remain separate structured members; frequency, calendar and destination evidence is not combined.']
      : hardSeparation
        ? ['The route-number stem is not sufficient: endpoint orientation or corridor evidence materially diverges.']
      : unresolved
        ? ['Family evidence is incomplete or ambiguous; no presentation consolidation was made.']
        : !principalSelection.clear
          ? ['The family relationship is evidenced, but no principal member was deterministically supported; no presentation consolidation was made.']
        : ['The route-number stem did not meet the minimum semantic-family evidence required for one presentation family.'];
    return Object.freeze({
      type: 'PublicRouteFamilyDecision',
      state,
      candidateStem: key.split('|')[0],
      familyKey: `family:${key}`,
      memberRouteNumbers: Object.freeze(memberRouteNumbers),
      memberPlannerServiceGroupIds: Object.freeze(members.map(row => text(row?.plannerServiceGroup?.serviceIdentity) || text(row?.id)).filter(Boolean)),
      memberRowIds: Object.freeze(members.map(row => text(row?.id)).filter(Boolean)),
      supportingSemanticEvidence: Object.freeze(pairEvidence),
      sharedCorridor: Object.freeze(unique(pairEvidence.flatMap(evidence => evidence.sharedCorridorPlaces))),
      operatorCompatibility: pairEvidence.length ? pairEvidence.every(evidence => evidence.operatorCompatible) : true,
      endpointTerminusEvidence: Object.freeze(pairEvidence.map(evidence => Object.freeze({ sharedEndpointPlaces: evidence.sharedEndpointPlaces, relationship: evidence.relationship }))),
      branchMemberRelationships: Object.freeze(memberRelationships),
      principalRouteNumber: principalSelection.principalRouteNumber,
      principalMemberRowId: text(principalSelection.principal?.id) || null,
      principalSelectionEvidence: principalSelection.evidence,
      calendars: Object.freeze(unique(members.flatMap(row => row.calendarProfileIds ?? []))),
      reasons: Object.freeze(reasons),
      unresolved: state === 'unresolved-review'
    });
  });
}

function familyMemberForPresentation(row) {
  return Object.freeze({
    routeNumber: text(row?.routeNumber) || null,
    operator: text(row?.operator) || null,
    origin: text(row?.origin) || null,
    destination: text(row?.destination) || null,
    principalLocations: Object.freeze([...(row?.principalLocations ?? [])]),
    principalLocationsText: text(row?.principalLocationsText) || null,
    destinationEndpointDecision: row?.destinationDecision ?? row?.destinationEndpointDecision ?? null,
    originEndpointDecision: row?.originEndpointDecision ?? null,
    destinationLocality: text(row?.destinationLocality || row?.destinationLocalityName) || null,
    routePatternExtent: Number(row?.routePatternExtent) || 0,
    recordActivity: Number(row?.recordActivity) || 0,
    directionPatternText: text(row?.directionPatternText) || null,
    calendarProfileIds: Object.freeze([...(row?.calendarProfileIds ?? [])]),
    calendarProfileLabels: Object.freeze([...(row?.calendarProfileLabels ?? [])]),
    frequencyLines: Object.freeze([...(row?.typicalFrequencyLines ?? [])]),
    operatingPeriodLines: Object.freeze([...(row?.operatingPeriodLines ?? [])]),
    serviceNote: text(row?.serviceNote) || null,
    routeVariantNote: text(row?.routeVariantNote) || null,
    sourceRecordIds: Object.freeze([...(row?.sourceRecordIds ?? [])]),
    alternateDestinationNames: Object.freeze([...(row?.alternateDestinationNames ?? [])]),
    materialAlternateDestinations: Object.freeze([...(row?.materialAlternateDestinations ?? [])]),
    materialDestinationEvidence: Object.freeze([...(row?.publicServiceGroupingDecision?.materialDestinationEvidence ?? [])]),
    variantDestinationEvidence: Object.freeze((row?.publicServiceGroupingDecision?.variantDestinationEvidence ?? []).map(variant => Object.freeze({ ...variant }))),
    publicServiceGroupingDecision: row?.publicServiceGroupingDecision ?? null,
    plannerServiceGroupId: text(row?.plannerServiceGroup?.serviceIdentity) || null
  });
}

function mergePublicRouteFamilyRows(members, decision) {
  const principal = members.find(member => text(member.id) === text(decision.principalMemberRowId)) || members.find(member => text(member.routeNumber) === text(decision.principalRouteNumber));
  const ordered = [principal, ...members
    .filter(member => member !== principal)
    .sort((left, right) => text(left.routeNumber).localeCompare(text(right.routeNumber), undefined, { numeric: true }) || text(left.id).localeCompare(text(right.id)))]
    .filter(Boolean);
  const representative = principal || ordered[0];
  const memberRouteNumbers = decision.memberRouteNumbers;
  const label = memberRouteNumbers.join(' / ');
  const routeFamilyMembers = Object.freeze(ordered.map(familyMemberForPresentation));
  // The family row is a compact principal-service presentation.  The full
  // member matrix remains in `routeFamilyMembers` and the technical decision,
  // but the normal planner row shows only the representative service's
  // frequency and operating period.
  const familyFrequencyLines = Object.freeze(ordered.flatMap(row => (row.typicalFrequencyLines ?? []).map(line => `${row.routeNumber}: ${line}`)));
  const familyOperatingPeriodLines = Object.freeze(ordered.flatMap(row => (row.operatingPeriodLines ?? []).map(line => `${row.routeNumber}: ${line}`)));
  const familyNote = `Route family ${label}: member destinations, calendars, frequencies and operating periods are retained per route number.`;
  const routeVariantNotes = unique(ordered.flatMap(row => [row.routeVariantNote, row.routeGroupNote]));
  const memberServiceNotes = unique(ordered.flatMap(row => [row.serviceNote]));
  const sourceRecordIds = unique(ordered.flatMap(row => row.sourceRecordIds ?? []));
  const rawServiceSummaries = [...new Map(ordered.flatMap(row => row.rawServiceSummaries ?? []).map(service => [text(service.id) || JSON.stringify(service), service])).values()];
  const operatorNames = unique(ordered.map(row => row.operator)).filter(Boolean);
  return Object.freeze({
    ...representative,
    id: `planner:${decision.familyKey}`,
    routeNumber: text(representative.routeNumber) || label,
    routeNumbers: Object.freeze(memberRouteNumbers),
    publicRouteNumbers: Object.freeze(memberRouteNumbers),
    memberRouteNumbers: Object.freeze(memberRouteNumbers),
    // The normal family row is the selected principal public service.  Child
    // operators remain in routeFamilyMembers and source evidence.
    operator: text(representative.operator) || operatorNames.join(' · '),
    typicalFrequencyLines: representative.typicalFrequencyLines,
    typicalFrequencyText: representative.typicalFrequencyText,
    operatingPeriodLines: representative.operatingPeriodLines,
    familyFrequencyAttribution: 'member-attributed; no combined family frequency asserted',
    familyFrequencyLines: familyFrequencyLines,
    familyOperatingPeriodLines: familyOperatingPeriodLines,
    familyCalendarProfilesByRoute: Object.freeze(Object.fromEntries(ordered.map(row => [row.routeNumber, Object.freeze([...(row.calendarProfileIds ?? [])])]))),
    routeFamilyMembers,
    routeFamilyLabel: label,
    routeFamilyNote: familyNote,
    serviceNote: memberServiceNotes.join(' '),
    routeVariantNote: routeVariantNotes.length ? routeVariantNotes.join(' ') : null,
    routeGroupNote: null,
    publicRouteFamilyKey: decision.familyKey,
    publicRouteFamilyDecision: decision,
    sourceRecordIds: Object.freeze(sourceRecordIds),
    rawServiceSummaries: Object.freeze(rawServiceSummaries),
    variantCount: ordered.reduce((total, row) => total + (Number(row.variantCount) || 1), 0),
    variantServiceIds: Object.freeze(unique(ordered.flatMap(row => row.variantServiceIds ?? []))),
    operatorRawNames: Object.freeze(unique(ordered.flatMap(row => row.operatorRawNames ?? []))),
    operatorIdentities: Object.freeze(unique(ordered.flatMap(row => row.operatorIdentities ?? []))),
    sourceWarnings: Object.freeze(unique(ordered.flatMap(row => row.sourceWarnings ?? [])))
  });
}

function collapsePublicRouteFamilies(rows) {
  const decisions = buildPublicRouteFamilyDecisions(rows);
  const byRowId = new Map(decisions.flatMap(decision => decision.memberRowIds.map(id => [id, decision])));
  const consumed = new Set();
  const output = [];
  for (const row of rows) {
    if (consumed.has(row.id)) continue;
    const decision = byRowId.get(row.id);
    const members = decision ? rows.filter(candidate => decision.memberRowIds.includes(candidate.id)) : [row];
    if (decision?.state === 'proven-family' && decision.memberRouteNumbers.length > 1) {
      output.push(mergePublicRouteFamilyRows(members, decision));
      members.forEach(member => consumed.add(member.id));
    } else {
      output.push(Object.freeze({ ...row, publicRouteFamilyDecision: decision ?? null }));
      consumed.add(row.id);
    }
  }
  return output;
}

function endpointLocationKeys(decision = {}) {
  return unique([
    decision.stopArea?.id,
    ...(decision.stopAreas ?? []).map(area => area?.id),
    ...(decision.endpointLogicalGroupIds ?? []),
    decision.endpointLogicalPlaceId,
    decision.nptgLocalityCode,
    decision.nptgLocalityName,
    decision.endpointStopPointId,
    ...(decision.endpointStopPointIds ?? [])
  ]).map(normal).filter(Boolean);
}

function familyLocationItems(member) {
  const destinationDecision = member?.destinationEndpointDecision ?? {};
  const endpointLabels = unique([
    destinationDecision.chosenDisplayName,
    destinationDecision.chosen,
    destinationDecision.rawEndpointText,
    member?.destination
  ]).map(normal).filter(Boolean);
  const endpointKeys = endpointLocationKeys(destinationDecision);
  const variantIdentities = (member?.variantDestinationEvidence ?? []).map(variant => ({
    label: normal(variant.destination),
    keys: unique([...(variant.endpointPlaceKeys ?? []), ...(variant.endpointStopPointIds ?? [])]).map(normal).filter(Boolean)
  }));
  const labels = unique([
    ...(member?.materialDestinationEvidence ?? []),
    ...(member?.materialAlternateDestinations ?? []),
    ...(member?.alternateDestinationNames ?? []),
    ...(member?.variantDestinationEvidence ?? []).map(variant => variant.destination),
    member?.destination,
    ...(member?.principalLocations ?? [])
  ]);
  return labels.map(label => Object.freeze({
    label,
    identityKeys: Object.freeze(endpointLabels.includes(normal(label))
      ? endpointKeys
      : variantIdentities.find(variant => variant.label === normal(label))?.keys ?? []),
    textKey: normal(label)
  }));
}

function sameFamilyLocation(left, right) {
  if (left.identityKeys.length && right.identityKeys.length) return left.identityKeys.some(key => right.identityKeys.includes(key));
  if (left.identityKeys.length || right.identityKeys.length) return false;
  return left.textKey === right.textKey;
}

function sameStructuredPlannerPlace(leftKeys = [], rightKeys = []) {
  const left = new Set(leftKeys.map(normal).filter(Boolean));
  return rightKeys.some(key => left.has(normal(key)));
}

function plannerServiceDestinationKeys(service) {
  const looksLikeDecision = service && (service.endpointStopPointId || service.primaryEndpointStopPointId || service.stopArea || service.chosenDisplayName || service.chosen);
  return endpointLocationKeys(looksLikeDecision ? service : (service?.destinationEndpointDecision ?? service?.destinationDecision ?? {}));
}

function plannerAdditionalSentence(entries = []) {
  const grouped = new Map();
  for (const entry of entries) {
    const route = text(entry?.routeNumber);
    const locations = unique(entry?.locations ?? []);
    if (!route || !locations.length) continue;
    const current = grouped.get(route) ?? [];
    for (const location of locations) if (!current.some(existing => normal(existing) === normal(location))) current.push(location);
    grouped.set(route, current);
  }
  const multipleEntries = grouped.size > 1 || [...grouped.values()].some(locations => locations.length > 1);
  return [...grouped.entries()].map(([route, locations], index) => {
    const placeText = locations.length > 1 ? locations.join(', ') : locations[0];
    if (multipleEntries) return `${route} – ${placeText}`;
    const verb = locations.length > 1 ? 'provides connections to' : 'serves';
    return `Route ${route} – ${verb} ${placeText}`;
  }).join('; ');
}

function plannerShortWorkingSentence(entries = []) {
  const grouped = new Map();
  for (const entry of entries) {
    const route = text(entry?.routeNumber);
    const location = text(entry?.location);
    if (!route || !location) continue;
    const current = grouped.get(route) ?? [];
    if (!current.some(existing => normal(existing) === normal(location))) current.push(location);
    grouped.set(route, current);
  }
  return [...grouped.entries()].map(([route, locations]) => {
    const placeText = locations.length > 1 ? `${locations.slice(0, -1).join(', ')} and ${locations.at(-1)}` : locations[0];
    return `Some route ${route} journeys operate to ${placeText}`;
  }).join('; ');
}

function humanQualification(value) {
  const raw = text(value).replace(/[.]+$/u, '');
  if (!raw) return '';
  if (/operating days could not be fully confirmed|calendar applicability is not confirmed|unresolved calendar/i.test(raw)) return 'Operating days could not be fully confirmed; check the timetable before use';
  const route = raw.match(/^Route\s+([^–-]+?)\s*[–-]\s*(.+)$/i);
  const qualifier = route ? route[2] : raw;
  if (/non[- ]school/i.test(qualifier)) return route ? `Route ${route[1].trim()} operates on non-school days only` : 'Runs on non-school days only';
  if (/\bschool days only\b|\bschool-day\b/i.test(qualifier)) return route ? `Route ${route[1].trim()} operates on school days only` : 'Runs on school days only';
  if (/term[- ]time|term[- ]only/i.test(qualifier)) return route ? `Route ${route[1].trim()} operates during term time only` : 'Operates during term time only';
  if (/holiday/i.test(qualifier)) return route ? `Route ${route[1].trim()} operates on holidays only` : 'Operates on holidays only';
  return raw;
}

function plannerAnnotationTaxonomy(row) {
  const additionalServices = [];
  const shortWorkings = [];
  const qualifications = [];
  const additionalServiceEntries = [];
  const shortWorkingEntries = [];
  const mainDestination = normal(plannerDestination(row));
  const mainOrigin = normal(plannerOrigin(row) || row?.origin);
  const assessedTerminus = normal(row?.terminusDecision?.assessedPlace);
  const addUnique = (target, value) => {
    const clean = text(value);
    if (clean && !target.some(existing => normal(existing) === normal(clean))) target.push(clean);
  };
  const addAdditionalEntry = (route, locations) => {
    const cleanLocations = unique(locations);
    if (!text(route) || !cleanLocations.length) return;
    const exists = additionalServiceEntries.some(entry => entry.routeNumber === text(route)
      && entry.locations.length === cleanLocations.length
      && entry.locations.every((location, index) => normal(location) === normal(cleanLocations[index])));
    if (!exists) additionalServiceEntries.push(Object.freeze({ routeNumber: text(route), locations: Object.freeze(cleanLocations) }));
    addUnique(additionalServices, `${text(route)} – ${cleanLocations.join(', ')}`);
  };
  const services = row?.rawServiceSummaries?.length ? [...row.rawServiceSummaries] : [];
  const duplicateIds = new Set(row?.publicServiceGroupingDecision?.deduplicatedSourceRecordIds ?? []);
  const principalSourceIds = new Set(services[0]?.sourceRecordIds ?? []);
  const samePhysicalJourney = services.length > 1
    && new Set(services.flatMap(service => service.sourceRecordIds ?? [service.id]).map(text).filter(Boolean)).size === 1
    && new Set(services.map(service => `${text(service.origin)}|${text(service.destination)}`)).size > 1;
  const familyRow = row?.publicRouteFamilyDecision?.state === 'proven-family' && (row?.routeNumbers?.length ?? 0) > 1;

  if (familyRow) {
    const members = [...(row.routeFamilyMembers ?? [])];
    const principal = members.find(member => text(member.routeNumber) === text(row.publicRouteFamilyDecision?.principalRouteNumber)) || members[0];
    const principalLocations = familyLocationItems(principal);
    for (const member of members.filter(candidate => candidate !== principal)) {
      const memberRoute = text(member.routeNumber || row.routeNumber);
      const uniqueLocations = familyLocationItems(member)
        .filter(location => location.textKey && location.textKey !== assessedTerminus)
        .filter(location => !principalLocations.some(principalLocation => sameFamilyLocation(location, principalLocation)))
        .map(location => location.label);
      if (uniqueLocations.length) {
        const entry = `${memberRoute} – ${uniqueLocations.join(', ')}`;
        addAdditionalEntry(memberRoute, uniqueLocations);
      }
      const profiles = (member.calendarProfileLabels ?? []).filter(label => label
        && !/^standard days$/i.test(label)
        && !/^calendar not confirmed$/i.test(label)
        && !/^unresolved$/i.test(label));
      for (const profile of profiles) addUnique(qualifications, `${member.routeNumber} – ${profile.toLowerCase()}`);
    }
  }

  const decisionVariants = samePhysicalJourney ? [] : (row?.publicServiceGroupingDecision?.variantDestinationEvidence ?? []);
  const mainDestinationKeys = plannerServiceDestinationKeys(row?.destinationDecision ?? row?.destinationEndpointDecision);
  for (const variant of decisionVariants) {
    const idSet = new Set(variant.sourceRecordIds ?? []);
    if ([...idSet].some(id => principalSourceIds.has(id))) continue;
    if (variant.sourceRecordIds?.length && [...idSet].every(id => duplicateIds.has(id))) continue;
    const service = services.find(candidate => [...idSet].includes(serviceIdForPlanner(candidate)))
      || services.find(candidate => text(candidate.routeNumber) === text(variant.routeNumber) && normal(plannerDestination(candidate)) === normal(variant.destination));
    const destination = text(variant.destination || plannerDestination(service));
    const origin = text(plannerOrigin(service));
    const route = text(variant.routeNumber || service?.routeNumber || row.routeNumber);
    if (!destination && !origin) continue;
    const variantKeys = unique([...(variant.endpointPlaceKeys ?? []), ...(variant.endpointStopPointIds ?? []), ...plannerServiceDestinationKeys(service)]);
    const sameMainPlace = destination && sameStructuredPlannerPlace(mainDestinationKeys, variantKeys);
    if ((variant.kind === 'short-working' && origin && normal(origin) !== mainOrigin)
      || (origin && normal(destination) === mainDestination && normal(origin) !== mainOrigin)) {
      const location = origin || destination;
      shortWorkingEntries.push(Object.freeze({ routeNumber: route, location }));
      addUnique(shortWorkings, `${route} – ${location}`);
    } else if (destination && !sameMainPlace && normal(destination) !== mainDestination && normal(destination) !== assessedTerminus) {
      addAdditionalEntry(route, [destination]);
    }
    const qualification = variantCalendarQualification(service);
    if (qualification) addUnique(qualifications, `${route} – ${qualification}`);
  }

  if (!familyRow && !samePhysicalJourney) {
    for (const service of services) {
      const id = serviceIdForPlanner(service);
      if (!id || duplicateIds.has(id)) continue;
      if ((service.sourceRecordIds ?? []).some(sourceId => principalSourceIds.has(sourceId)) && service !== services[0]) continue;
      const destination = plannerDestination(service);
      const origin = plannerOrigin(service);
      if (!destination && !origin) continue;
      const originDiffers = origin && normal(origin) !== mainOrigin;
      const route = service.routeNumber || row.routeNumber;
      const serviceKeys = plannerServiceDestinationKeys(service);
      const sameMainPlace = destination && sameStructuredPlannerPlace(mainDestinationKeys, serviceKeys);
      if (originDiffers && destination && (normal(destination) === mainDestination || sameMainPlace)) {
        shortWorkingEntries.push(Object.freeze({ routeNumber: route, location: origin }));
        addUnique(shortWorkings, `${route} – ${origin}`);
      }
      else if (destination && !sameMainPlace && normal(destination) !== mainDestination && normal(destination) !== assessedTerminus) {
        addAdditionalEntry(route, [destination]);
      }
      const qualification = variantCalendarQualification(service);
      if (qualification) addUnique(qualifications, `${service.routeNumber || row.routeNumber} – ${qualification}`);
    }
    // Preserve material alternate destinations even when the source-record
    // identity filter above correctly suppresses a duplicate service record.
    // The structured annotation is the single planner-facing display; the
    // legacy routeGroupNote remains only as an audit/backward-compatibility
    // field for older callers.
    for (const destination of unique([
      ...(row.materialAlternateDestinations ?? []),
      ...(row.alternateDestinationNames ?? []),
      ...services.map(service => plannerDestination(service))
    ])) {
      const matchingVariant = decisionVariants.find(variant => normal(variant.destination) === normal(destination));
      const matchingService = services.find(service => normal(plannerDestination(service)) === normal(destination));
      const candidateKeys = matchingVariant
        ? unique([...(matchingVariant.endpointPlaceKeys ?? []), ...(matchingVariant.endpointStopPointIds ?? [])])
        : plannerServiceDestinationKeys(matchingService);
      const sameMainPlace = sameStructuredPlannerPlace(mainDestinationKeys, candidateKeys);
      if (!sameMainPlace && normal(destination) !== mainDestination && normal(destination) !== assessedTerminus) {
        addAdditionalEntry(row.routeNumber, [destination]);
      }
    }
  }

  const rowQualification = materialServiceNote(row?.serviceNote);
  if (rowQualification && /school|term(?:[- ]time|[- ]only)|non-school|circular|holiday|calendar|operating days could not be fully confirmed/i.test(rowQualification)
    && !(row?.circular && /circular service/i.test(rowQualification))
    && !qualifications.some(existing => normal(existing).includes(normal(rowQualification)))) addUnique(qualifications, rowQualification);
  const shortLocation = value => text(value).replace(/^[^–-]+[–-]\s*/u, '');
  const compactShortWorkings = shortWorkings.filter(candidate => !shortWorkings.some(other => other !== candidate
    && normal(shortLocation(other)).includes(normal(shortLocation(candidate)))));
  const notes = Object.freeze({
    terminus: row?.terminusDecision?.proven && row.terminusDecision.terminalSides?.includes('origin')
      ? text(row.terminusDecision.assessedPlace) || null : null,
    additionalServices: additionalServiceEntries.length ? plannerAdditionalSentence(additionalServiceEntries) : (additionalServices.length ? additionalServices.join('; ') : null),
    additionalServiceEntries: Object.freeze(additionalServiceEntries),
    shortWorkings: shortWorkingEntries.length ? plannerShortWorkingSentence(shortWorkingEntries) : (compactShortWorkings.length ? compactShortWorkings.join('; ') : null),
    serviceQualification: qualifications.length ? qualifications.join('; ') : null,
    circularService: row?.circular ? 'Circular service.' : null,
    reviewNote: row?.unresolvedPublicIdentity ? 'Destination requires review before formal use.' : null
  });
  return notes;
}

function formattedPlannerAnnotations(notes = {}) {
  const sentence = value => text(value).replace(/[.]+$/u, '');
  const qualificationText = notes.serviceQualification && /operating days could not be fully confirmed/i.test(notes.serviceQualification)
    ? humanQualification(notes.serviceQualification)
    : notes.serviceQualification?.split(';').map(humanQualification).filter(Boolean).join('; ');
  return [
    notes.terminus ? `Route terminus: ${sentence(notes.terminus)}.` : null,
    notes.additionalServices ? `Additional services: ${sentence(notes.additionalServices)}.` : null,
    notes.shortWorkings ? `Short workings: ${sentence(notes.shortWorkings)}.` : null,
    qualificationText ? `Service qualification: ${sentence(qualificationText)}.` : null,
    notes.circularService ? `Circular service: ${notes.circularService.replace(/\.$/, '')}.` : null,
    notes.reviewNote ? `Review note: ${notes.reviewNote}` : null
  ].filter(Boolean);
}

function legacyVariantDestinations(group) {
  const headlineDestinations = new Set(group.map(({ row }) => normal(plannerDestination(row))));
  const sourceServices = group.flatMap(({ row }) => row.rawServiceSummaries ?? []);
  const alternatives = destinationNames([
    ...sourceServices.map(service => plannerDestination(service)),
    ...group.flatMap(({ row }) => row.alternateDestinationNames ?? [])
  ].filter(destination => !headlineDestinations.has(normal(destination))));
  const terminalVariant = sourceServices.find(service => {
    const destination = plannerDestination(service);
    const patternNames = orderedPatternNames(service);
    return destination && !headlineDestinations.has(normal(destination)) && patternNames.at(-1)
      && normal(destination) === normal(patternNames.at(-1));
  });
  if (terminalVariant) {
    const terminalDestination = plannerDestination(terminalVariant);
    const index = alternatives.findIndex(destination => normal(destination) === normal(terminalDestination));
    if (index > 0) alternatives.unshift(...alternatives.splice(index, 1));
  }
  const hubAlternative = alternatives.find(destination => /\b(?:bus|coach)\s+station\b|\binterchange\b|\bterminal\b/i.test(destination));
  if (hubAlternative) {
    const index = alternatives.indexOf(hubAlternative);
    if (index > 0) alternatives.unshift(...alternatives.splice(index, 1));
  }
  return { alternatives, origins: originVariantNames(sourceServices, group) };
}

function legacyVariantCompatibilityNote(group) {
  const { alternatives, origins } = legacyVariantDestinations(group);
  const originNote = origins.length === 1 ? ` from ${origins[0]}` : origins.length > 1 ? ` from ${origins.slice(0, -1).join(', ')} and ${origins.at(-1)}` : '';
  if (alternatives.length === 1) return `Additional variants and short workings operate, including journeys${originNote} towards ${alternatives[0]}.`;
  if (alternatives.length > 1) return `Additional variants and short workings operate, including journeys${originNote} towards ${alternatives.slice(0, -1).join(', ')} and ${alternatives.at(-1)}.`;
  if (origins.length) return `Additional variants and short workings operate, including journeys from ${origins.join(' and ')}.`;
  return 'Additional short workings and timetable variants operate.';
}

function attachRouteNotes(rows) {
  const prepared = rows.map(row => Object.freeze({ ...row, plannerNotes: plannerAnnotationTaxonomy(row) }));
  const groups = new Map();
  prepared.forEach((row, index) => { const key = row.publicRouteFamilyKey || row.routeGroupKey; if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ row, index }); });
  const notesFor = row => unique(text(row.serviceNote).split(/(?<=[.!?])\s+(?=[A-Z])/u).map(materialServiceNote).filter(Boolean));
  const structuredQualification = note => /school[- ]?days?|term[- ]time|non[- ]school|holiday|operating days could not be fully confirmed/i.test(text(note));
  const sharedTaxonomy = new Set(['School days only.', 'Term-time service.', 'Non-school days only.', 'Circular service.']);
  const updates = new Map();
  for (const group of groups.values()) {
    const rowNotes = group.map(({ row }) => notesFor(row));
    const shared = [...sharedTaxonomy].filter(note => rowNotes.length > 1 && rowNotes.every(notes => notes.includes(note)));
    const familyRow = group.length === 1 && group[0].row.publicRouteFamilyDecision?.state === 'proven-family';
    const samePhysicalGroup = group.some(({ row }) => {
      const sourceIds = (row.rawServiceSummaries ?? []).flatMap(service => service.sourceRecordIds ?? [service.id]).map(text).filter(Boolean);
      return sourceIds.length > 1
        && new Set(sourceIds).size === 1
        && new Set((row.rawServiceSummaries ?? []).map(service => `${text(service.origin)}|${text(service.destination)}`)).size > 1;
    });
    const hasVariant = !samePhysicalGroup && (
      (!familyRow && group.some(({ row }) => row.routeVariantNote))
      || (!familyRow && group.some(({ row }) => (row.rawServiceSummaries ?? []).length > 1))
    );
    const routeNotes = [...shared];
    const taxonomyNotes = unique(group.flatMap(({ row }) => formattedPlannerAnnotations(row.plannerNotes)));
    const detailedAdditional = group.some(({ row }) => Boolean(row.plannerNotes?.additionalServices));
    const hasShortWorkingTaxonomy = group.some(({ row }) => row.plannerNotes?.shortWorkings);
    let legacyAdditionalServices = [];
    if (detailedAdditional && !hasShortWorkingTaxonomy && !familyRow) {
      // The structured planner annotation is now the public wording. Keep
      // the legacy compatibility field available to callers, but do not add
      // raw destination lists or the generic "additional variants" banner.
      routeNotes.push(...taxonomyNotes.filter(note => !shared.some(sharedNote => normal(note).includes(normal(sharedNote)))));
    }
    else if (taxonomyNotes.length) routeNotes.push(...taxonomyNotes.filter(note => !shared.some(sharedNote => normal(note).includes(normal(sharedNote)))));
    else if (hasVariant) {
      const attributedVariantNotes = unique(group.map(({ row }) => row.routeVariantNote));
      if (attributedVariantNotes.length) routeNotes.push(...attributedVariantNotes);
      else routeNotes.push('Additional short workings and timetable variants operate.');
    }
    const mergedAdditionalServiceEntries = [];
    const mergedShortWorkingEntries = [];
    const mergedQualifications = [];
    const mergeEntry = (target, entry) => {
      const route = text(entry?.routeNumber);
      const location = text(entry?.location);
      const locations = unique(entry?.locations ?? []);
      const signature = `${route}|${location}|${locations.join('|')}`;
      if (route && (location || locations.length) && !target.some(existing => existing.__signature === signature)) target.push({ ...entry, __signature: signature });
    };
    group.forEach(({ row }) => {
      (row.plannerNotes?.additionalServiceEntries ?? []).forEach(entry => mergeEntry(mergedAdditionalServiceEntries, entry));
      (row.plannerNotes?.shortWorkingEntries ?? []).forEach(entry => mergeEntry(mergedShortWorkingEntries, entry));
      text(row.plannerNotes?.serviceQualification).split(';').map(text).filter(Boolean).forEach(qualification => {
        if (!mergedQualifications.some(existing => normal(existing) === normal(qualification))) mergedQualifications.push(qualification);
      });
    });
    const mergedPlannerNotes = position => {
      if (position !== group.length - 1) return null;
      const row = group.at(-1).row;
      const additionalEntries = mergedAdditionalServiceEntries.map(({ __signature, ...entry }) => entry);
      const shortEntries = mergedShortWorkingEntries.map(({ __signature, ...entry }) => entry);
      return Object.freeze({
        ...row.plannerNotes,
        additionalServices: additionalEntries.length ? plannerAdditionalSentence(additionalEntries) : row.plannerNotes?.additionalServices || null,
        additionalServiceEntries: Object.freeze(additionalEntries),
        shortWorkings: shortEntries.length ? plannerShortWorkingSentence(shortEntries) : row.plannerNotes?.shortWorkings || null,
        shortWorkingEntries: Object.freeze(shortEntries),
        serviceQualification: mergedQualifications.length ? mergedQualifications.join('; ') : row.plannerNotes?.serviceQualification || null
      });
    };
    group.forEach(({ row, index }, position) => {
      const remainingNotes = notesFor(row).filter(note => !shared.includes(note)
        && !/^Circular service\.$/i.test(note)
        && !(row.plannerNotes?.serviceQualification && structuredQualification(note)
          && /operating days could not be fully confirmed/i.test(note)));
      const plannerNotes = mergedPlannerNotes(position) || (position === group.length - 1 && legacyAdditionalServices.length
        ? Object.freeze({
          ...row.plannerNotes,
          additionalServices: unique([
            ...(text(row.plannerNotes?.additionalServices).split(';').map(text).filter(Boolean)),
            ...legacyAdditionalServices
          ]).join('; ')
        })
        : row.plannerNotes);
      updates.set(index, { serviceNote: remainingNotes.join(' '), plannerNotes, routeGroupNote: position === group.length - 1 ? routeNotes.join(' ') || null : null });
    });
  }
  return prepared.map((row, index) => Object.freeze({ ...row, ...(updates.get(index) ?? { routeGroupNote: null }) }));
}

export function buildPlannerBusServiceSummaries(serviceSummaries = [], stops = []) {
  const sourceRecords = serviceSummaries ?? [];
  // Keep every source summary in the domain grouping input.  Supplementary
  // national copies are suppressed at planner-row level by one public group,
  // but remain available in `publicServiceGroupingDecision.sourceRecordIds`.
  const plannerRecords = sourceRecords;
  const serviceGroups = buildPlannerServiceGroups(plannerRecords, stops);
  const provisionalRows = [];
  const componentIndexes = new Map();
  for (const serviceGroup of serviceGroups) {
    const component = serviceGroup.services;
    const routeKey = serviceGroup.publicRouteFamilyKey || routeGroupKey(component[0]);
    const index = componentIndexes.get(routeKey) ?? 0;
    componentIndexes.set(routeKey, index + 1);
    const routeFamilyServices = serviceGroups.filter(group => group.publicRouteFamilyKey === routeKey).flatMap(group => group.services);
    const row = buildPlannerRow(component, stops, index, routeFamilyServices, routeKey, serviceGroup);
    if (resolvedPlannerDestination(row)) provisionalRows.push(row);
    else {
      const representedByResolvedRow = routeFamilyServices.some(service => service !== component[0] && resolvedPlannerDestination(service));
      if (!representedByResolvedRow) provisionalRows.push(Object.freeze({ ...row, destination: 'Destination requires review', directionPatternText: 'Destination requires review', unresolvedPublicIdentity: true, serviceNote: unique([row.serviceNote, 'Destination requires review before formal use.']).join(' ') }));
    }
  }
  let familyRows = collapsePublicRouteFamilies(provisionalRows);
  const plannerRouteNumbers = row => new Set(row?.publicRouteNumbers ?? row?.routeNumbers ?? [row?.routeNumber]);
  const sharesPlannerRouteNumber = (first, second) => [...plannerRouteNumbers(first)].some(route => plannerRouteNumbers(second).has(route));
  const hasDepartingTerminus = row => familyRows.some(candidate => candidate !== row
    && sharesPlannerRouteNumber(candidate, row)
    && (candidate.publicRouteFamilyKey === row.publicRouteFamilyKey
      || candidate.publicRouteFamilyDecision?.candidateStem === row.publicRouteFamilyDecision?.candidateStem)
    && candidate.terminusDecision?.proven
    && candidate.terminusDecision.terminalSides.includes('origin')
    && candidate.terminusDecision.assessedPlace === row.terminusDecision?.assessedPlace);
  const suppressedArrivals = familyRows.filter(row => row.terminusDecision?.presentation === 'arrival-only-suppress' && hasDepartingTerminus(row));
  let rows = familyRows.filter(row => !suppressedArrivals.includes(row));
  rows = rows.map(row => {
    if (!row.terminusDecision?.proven || !row.terminusDecision.terminalSides.includes('origin')) return row;
    const matchedSuppressed = suppressedArrivals.filter(candidate => candidate.routeNumber === row.routeNumber
      && sharesPlannerRouteNumber(candidate, row)
      && (candidate.publicRouteFamilyKey === row.publicRouteFamilyKey
        || candidate.publicRouteFamilyDecision?.candidateStem === row.publicRouteFamilyDecision?.candidateStem)
      && candidate.terminusDecision?.assessedPlace === row.terminusDecision.assessedPlace);
    if (!matchedSuppressed.length) return row;
    const arrivalIds = [...new Set([...row.terminusDecision.arrivalEvidence, ...matchedSuppressed.flatMap(candidate => candidate.terminusDecision.arrivalEvidence)])];
    const terminusDecision = Object.freeze({
      ...row.terminusDecision,
      arrivalEvidence: Object.freeze(arrivalIds),
      suppressedArrivalSourceRecordIds: Object.freeze(matchedSuppressed.flatMap(candidate => candidate.sourceRecordIds))
    });
    return Object.freeze({ ...row, terminusDecision });
  });
  const sorted = rows.sort((first, second) => text(first.routeNumber).localeCompare(text(second.routeNumber), undefined, { numeric: true })
    || text(first.operator).localeCompare(text(second.operator))
    || (Number(second.variantCount) || 0) - (Number(first.variantCount) || 0)
    || text(first.directionPatternText).localeCompare(text(second.directionPatternText))
    || text(first.id).localeCompare(text(second.id)));
  return attachRouteNotes(sorted);
}

export const buildPlannerBusServiceSummary = buildPlannerBusServiceSummaries;

export function buildPlannerSummaryAudit(rows = [], expectedRowCounts = {}) {
  const routeNumbers = unique([
    ...Object.keys(expectedRowCounts ?? {}),
    ...(rows ?? []).flatMap(row => row?.publicRouteNumbers ?? row?.routeNumbers ?? [row?.routeNumber])
  ]).sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
  const audit = routeNumbers.map(routeNumber => {
    const routeRows = (rows ?? []).filter(row => (row?.publicRouteNumbers ?? row?.routeNumbers ?? [row?.routeNumber]).map(text).includes(routeNumber));
    return Object.freeze({
      routeNumber,
      rowCount: routeRows.length,
      expectedRowCount: Number.isFinite(Number(expectedRowCounts?.[routeNumber])) ? Number(expectedRowCounts[routeNumber]) : null,
      aboveExpected: Number.isFinite(Number(expectedRowCounts?.[routeNumber])) && routeRows.length > Number(expectedRowCounts[routeNumber]),
      rows: Object.freeze(routeRows.map(row => Object.freeze({
        directionIdentity: text(row?.directionFamily || row?.direction || row?.stopDirection) || 'direction-not-supplied',
        corridorIdentity: text(row?.principalLocationsText || row?.directionPatternText) || 'corridor-not-supplied',
        representativeStop: text(row?.servedAtStopId || row?.frequencyBasisStopId) || null,
        operatorFamily: normal(row?.operator) || 'operator-not-supplied',
        headlineDestination: text(row?.destination) || 'destination-not-supplied',
        variantCount: Number(row?.variantCount) || 0,
        servedStopIds: Object.freeze(unique(row?.servedStopEvidence?.map(stop => stop.id) ?? row?.stopIds ?? [])),
        timetableBasisStopId: text(row?.plannerServiceGroup?.timetableBasis?.stopId || row?.frequencyBasisStopId) || null,
        operatorEvidence: Object.freeze(unique(row?.plannerServiceGroup?.rawOperatorNames ?? row?.operatorRawNames ?? [])),
        groupIdentity: text(row?.plannerServiceGroup?.serviceIdentity) || null
      })))
    });
  });
  return Object.freeze({
    routes: Object.freeze(audit),
    aboveExpectedRoutes: Object.freeze(audit.filter(route => route.aboveExpected).map(route => route.routeNumber))
  });
}

export { directionPatternText, servedAtText, formatServiceOriginDestination };
