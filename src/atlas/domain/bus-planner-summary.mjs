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

export const PLANNER_SERVED_AT_CORE_NOTE = "Table note — Served at: The 'Served at' column identifies route stops within the selected search radius only and does not represent the full route stop list. Typical frequency and operating period are derived from the closest of these stops with timetable evidence, identified as the '(timetable basis)' stop.";
export const PLANNER_METHODOLOGY_NOTE = `${PLANNER_SERVED_AT_CORE_NOTE} Other source evidence is available under Show detailed evidence.`;
export const PLANNER_WORD_METHODOLOGY_NOTE = PLANNER_SERVED_AT_CORE_NOTE;

const UNKNOWN_CALENDAR_PROFILE = 'unresolved';
const CALENDAR_PROFILE_ORDER = Object.freeze(['ordinary', 'school-day', 'term-time', 'non-school-day', 'holiday', 'other-resolved', UNKNOWN_CALENDAR_PROFILE]);
const CALENDAR_PROFILE_LABELS = Object.freeze({
  ordinary: 'Ordinary service',
  'school-day': 'School days',
  'term-time': 'Term time',
  'non-school-day': 'Non-school days',
  holiday: 'Holidays',
  'other-resolved': 'Calendar-specific days',
  unresolved: 'Calendar applicability unresolved'
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
    const itemProfile = text(item?.calendarProfileId).toLowerCase();
    if (itemProfile) return itemProfile;
    return deriveCalendarProfileId({
      resolved: Boolean(item?.resolved ?? item?.calendarResolved ?? item?.daysOfWeek?.length ?? item?.days?.length),
      schoolDayOnly: Boolean(item?.schoolDayOnly),
      termTimeOnly: Boolean(item?.termTimeOnly),
      nonSchoolDayOnly: Boolean(item?.nonSchoolDayOnly),
      holidayOnly: Boolean(item?.holidayOnly)
    });
  }));
  return profiles.length === 1 ? profiles[0] : UNKNOWN_CALENDAR_PROFILE;
}

function calendarProfileFromEntry(service, item) {
  return text(item?.calendarProfileId).toLowerCase() || calendarProfileFromService(service);
}

function hasCalendarMetadata(service) {
  const explicit = text(service?.calendarProfileId || service?.source?.calendarProfileId);
  if (explicit) return true;
  const evidence = service?.calendarEvidence ?? service?.operatingCalendarEvidence ?? [];
  if ((Array.isArray(evidence) ? evidence : [evidence]).length > 0) return true;
  return DAY_ORDER.some(day => (service?.departureEvidenceByDay?.[day] ?? []).some(item => text(item?.calendarProfileId)));
}

function calendarProfileIdsForEntry(entry) {
  const profiles = unique(entry?.calendarProfileIds ?? [entry?.calendarProfileId]).map(value => text(value).toLowerCase()).filter(Boolean);
  return profiles.length ? profiles : [UNKNOWN_CALENDAR_PROFILE];
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

function feedIdentity(service) {
  return normal(service?.timetableSource || service?.frequencyEvidenceSource || service?.source?.provider);
}

function operatorTokens(value) {
  return new Set(normal(value).split(' ').filter(token => token && !['and', 'the', 'bus', 'buses', 'company', 'co', 'ltd', 'limited', 'travel', 'transport', 'in', 'of'].includes(token)));
}

function operatorFamilyCompatible(first, second) {
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
  const candidates = unique(services.map(service => service?.operator));
  const families = [];
  for (const candidate of candidates) {
    const family = families.find(names => names.some(name => operatorFamilyCompatible({ operator: name }, { operator: candidate })));
    if (family) family.push(candidate);
    else families.push([candidate]);
  }
  return families
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
  return { origin: validLocation(service?.origin), destination: validLocation(service?.destination) };
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

function explicitPattern(service) { return (service?.routePatternStopIds ?? []).map(text).filter(Boolean); }
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

function scheduledDepartureKeys(service) {
  const keys = new Set();
  for (const day of DAY_ORDER) {
    const explicit = service?.departureEvidenceByDay?.[day];
    const entries = Array.isArray(explicit) && explicit.length
      ? explicit
      : (service?.departuresByDay?.[day] ?? []);
    for (const item of entries) {
      const minute = Number(item?.minute ?? item?.departureMinute ?? item?.time ?? item);
      if (Number.isFinite(minute)) keys.add(`${day}|${minute}`);
    }
  }
  return keys;
}

function scheduledDepartureOverlap(first, second) {
  const left = scheduledDepartureKeys(first);
  const right = scheduledDepartureKeys(second);
  let overlap = 0;
  for (const key of left) {
    if (right.has(key)) overlap += 1;
  }
  return overlap;
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
        const candidateOrigin = plannerOrigin(services[candidate]);
        const candidateDestination = plannerDestination(services[candidate]);
        const reversePublicConflict = [...componentIndexes, ...queue].some(index => {
          const memberOrigin = plannerOrigin(services[index]);
          const memberDestination = plannerDestination(services[index]);
          return candidateOrigin && candidateDestination && memberOrigin && memberDestination
            && normal(candidateOrigin) === normal(memberDestination)
            && normal(candidateDestination) === normal(memberOrigin)
            && normal(candidateOrigin) !== normal(memberOrigin);
        });
        if (reversePublicConflict) continue;
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
  const firstPublic = { origin: plannerOrigin(first), destination: plannerDestination(first) };
  const secondPublic = { origin: plannerOrigin(second), destination: plannerDestination(second) };
  const firstMarker = explicitDirectionMarker(first), secondMarker = explicitDirectionMarker(second);
  const markerConflict = firstMarker && secondMarker && firstMarker !== secondMarker;
  const samePublicPair = firstPublic.origin && firstPublic.destination && secondPublic.origin && secondPublic.destination
    && normal(firstPublic.origin) === normal(secondPublic.origin)
    && normal(firstPublic.destination) === normal(secondPublic.destination);
  // Some providers expose opposite physical endpoint pairs for a single
  // public direction (for example a long working plus its return-labelled
  // pattern).  Permit that only when public endpoint resolution agrees and
  // ordered pattern evidence confirms the same corridor; otherwise retain
  // the reverse-endpoint separation for genuine opposite directions.
  if (reverseEndpointRelationship(first, second)
    && !(samePublicPair && markerConflict && reversePatternRelationship(first, second))) return false;
  if (markerConflict && ((first?.circular && closedPhysicalShape(first))
    || (second?.circular && closedPhysicalShape(second)))) return false;
  const genericRawEndpoints = service => GENERIC_ENDPOINT_LABEL.test(text(service.origin))
    && GENERIC_ENDPOINT_LABEL.test(text(service.destination));
  const sourceIdentity = service => normal(service?.timetableSource || service?.frequencyEvidenceSource
    || service?.source?.provider || service?.provider);
  const crossProviderPublicAgreement = samePublicPair
    && sourceIdentity(first) && sourceIdentity(second)
    && sourceIdentity(first) !== sourceIdentity(second)
    && routeGroupKey(first) === routeGroupKey(second)
    && operatorFamilyCompatible(first, second);
  if (markerConflict && genericRawEndpoints(first) && genericRawEndpoints(second)
    && !crossProviderPublicAgreement) return false;
  if (markerConflict && (genericRawEndpoints(first) || genericRawEndpoints(second))
    && sharedPatternValues(first, second).size < 2 && !provenPatternRelationship(first, second)
    && !crossProviderPublicAgreement) return false;
  // Prepared GTFS records can share a feed-local direction marker even when
  // their ordered patterns represent opposite public travel.  Once endpoint
  // resolution has established both public pairs, reverse pairs are never
  // one planner direction; short workings can still join the matching side
  // through the one-sided pattern evidence below.
  if (firstPublic.origin && firstPublic.destination && secondPublic.origin && secondPublic.destination
    && firstPublic.origin !== firstPublic.destination
    && secondPublic.origin !== secondPublic.destination
    && normal(firstPublic.origin) === normal(secondPublic.destination)
      && normal(firstPublic.destination) === normal(secondPublic.origin)
      && !(normal(firstPublic.origin) === normal(secondPublic.origin)
      && normal(firstPublic.destination) === normal(secondPublic.destination))) return false;
  if (samePublicPair) {
    let samePublicDirection = !markerConflict;
    if (markerConflict) {
      const familyPair = Array.isArray(first.publicFamilyEndpointPair) && first.publicFamilyEndpointPair.length === 2
        ? first.publicFamilyEndpointPair : [];
      const firstPatternDirection = orderedPatternDirectionEndpoint(first, familyPair);
      const secondPatternDirection = orderedPatternDirectionEndpoint(second, familyPair);
      const orderedAgrees = firstPatternDirection && secondPatternDirection
        && normal(firstPatternDirection.origin) === normal(secondPatternDirection.origin)
        && normal(firstPatternDirection.destination) === normal(secondPatternDirection.destination);
      const downstreamVariant = [first, second].some(service => {
        const values = patternEndpointValues(service);
        return values.length === 2
          && familyPair.some(value => normal(value) === normal(values[1]))
          && [service.origin, service.destination].some(value => {
            const cleaned = cleanPublicEndpoint(value);
            return cleaned && !GENERIC_ENDPOINT_LABEL.test(text(value));
          });
      });
      samePublicDirection = Boolean(
        (orderedAgrees && !reversePatternRelationship(first, second)
          && (sharedPatternValues(first, second).size >= 2 || provenPatternRelationship(first, second)))
        || (downstreamVariant && sameServiceLineage(first, second))
        || (samePublicPair && markerConflict && reverseEndpointRelationship(first, second)
          && reversePatternRelationship(first, second)
          && routeGroupKey(first) === routeGroupKey(second)
          && operatorFamilyCompatible(first, second))
      );
    }
    if (samePublicDirection) return true;
  }
  if ((!firstPublic.origin || !firstPublic.destination || !secondPublic.origin || !secondPublic.destination)
    && firstMarker && secondMarker && firstMarker === secondMarker
    && (sameServiceLineage(first, second)
      || provenPatternRelationship(first, second)
      || sharedCorridorNames(first, second).size >= 1
      || sharedStopIds(first, second).size >= 1)) return true;
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
      const genericEndpointMarkers = GENERIC_ENDPOINT_LABEL.test(text(first.origin))
        && GENERIC_ENDPOINT_LABEL.test(text(first.destination))
        && GENERIC_ENDPOINT_LABEL.test(text(second.origin))
        && GENERIC_ENDPOINT_LABEL.test(text(second.destination));
      const leftMarker = explicitDirectionMarker(first);
      const rightMarker = explicitDirectionMarker(second);
      const bothProviderLocalMarkers = /^gtfs:\s*\d+$/i.test(leftMarker)
        && /^gtfs:\s*\d+$/i.test(rightMarker);
      // Generic infrastructure labels cannot establish orientation.  When
      // prepared feeds attach distinct directional markers to those labels,
      // require overlapping scheduled journeys before treating the records as
      // provider copies.  This keeps 310's opposite directions apart while
      // still joining matching BODS/TNDS representations.
      const overlap = scheduledDepartureOverlap(first, second);
      if (markerConflict && bothProviderLocalMarkers && overlap < 2) return false;
      if (markerConflict && genericEndpointMarkers && overlap < 1) return false;
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
        || (overlap >= 1 && feedIdentity(first) && feedIdentity(second)
          && feedIdentity(first) !== feedIdentity(second)
          && (!bothProviderLocalMarkers || overlap >= 2))
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
  const route = normal(service?.routeNumber).replace(/\s+/g, '');
  // Most public suffixes are numeric roots (25C), but the abstraction also
  // supports alphanumeric public codes used by smaller/community feeds
  // (X/XA).  A single-letter code is kept intact; only a non-empty root with
  // an appended alphabetic suffix is reduced.
  const match = route.match(/^(.+?)[a-z]+$/i);
  return match ? match[1] : route;
}

function routeFamilyCompatible(first, second) {
  if (normal(first?.routeNumber).replace(/\s+/g, '') === normal(second?.routeNumber).replace(/\s+/g, '')) return true;
  if (routeGroupKey(first) !== routeGroupKey(second) || !operatorFamilyCompatible(first, second)) return false;
  const leftPair = familyPublicEndpointPair([first]);
  const rightPair = familyPublicEndpointPair([second]);
  if (leftPair.length === 2 && rightPair.length === 2) {
    const left = new Set(leftPair.map(normal));
    if (rightPair.every(value => left.has(normal(value)))) return true;
  }
  // Suffix removal is only a candidate-family signal.  A suffix route must
  // also share physical selected-stop evidence and a material corridor with
  // the base route; the suffix alone is never allowed to merge services.
  // Prepared feeds may expose the assessment stop as the only shared stop
  // ID while still retaining an ordered named trunk.  Two shared corridor
  // names are sufficient family evidence; the divergent-suffix case is
  // rejected because it has no such shared ordered corridor.
  return (sharedStopIds(first, second).size >= 2 || sharedCorridorNames(first, second).size >= 2)
    && (provenPatternRelationship(first, second) || sharedCorridorNames(first, second).size >= 2);
}

function routeFamilyComponents(services) {
  const components = [];
  for (const service of services) {
    const component = components.find(candidate => candidate.some(member => routeFamilyCompatible(member, service)));
    if (component) component.push(service);
    else components.push([service]);
  }
  return components;
}

function closedPhysicalShape(service) {
  const pattern = explicitPattern(service);
  const names = orderedPatternNames(service).map(normal).filter(Boolean);
  const patternStops = Array.isArray(service?.routePatternStops) ? service.routePatternStops : [];
  const firstLocality = cleanPublicEndpoint(patternStops[0]?.locality || patternStops[0]?.localityQualifier || patternStops[0]?.parentLocality);
  const lastLocality = cleanPublicEndpoint(patternStops.at(-1)?.locality || patternStops.at(-1)?.localityQualifier || patternStops.at(-1)?.parentLocality);
  const hasDistinctOrderedLocalities = firstLocality && lastLocality && normal(firstLocality) !== normal(lastLocality);
  const endpoints = endpointPair(service);
  return (pattern.length > 1 && pattern[0] === pattern.at(-1) && !hasDistinctOrderedLocalities)
    || (names.length > 1 && names[0] === names.at(-1) && !hasDistinctOrderedLocalities)
    || Boolean(endpoints.origin && endpoints.destination && endpoints.origin === endpoints.destination && !hasDistinctOrderedLocalities);
}

function hasTwoWayDirectionEvidence(services) {
  const markers = unique((services ?? []).map(explicitDirectionMarker).filter(Boolean));
  return markers.length > 1;
}

function resolveCircularPresentation(component, routeFamilyServices = component) {
  const familyServices = routeFamilyServices ?? component;
  const hasOpposingFeedDirections = hasTwoWayDirectionEvidence(familyServices);
  const relevantServices = (routeFamilyServices ?? []).filter(service => component.includes(service)
    || component.some(member => operatorFamilyCompatible(member, service)
      && sameServiceLineage(member, service)
      && patternCorridorRelationship(member, service)));
  const hasClosedCircularEvidence = component.some(service => Boolean(service?.circular) && closedPhysicalShape(service));
  const closedFamilyCount = familyServices.filter(service => Boolean(service?.circular) && closedPhysicalShape(service)).length;
  const openServices = relevantServices.filter(service => service?.circular === false && !closedPhysicalShape(service));
  const hasOpenPatternPair = openServices.some(service => patternEndpointValues(service).length === 2);
  const hasOpenDirectedEvidence = openServices.filter(service => directionEndpointCandidate(service)
    && [service?.origin, service?.destination].some(value => cleanPublicEndpoint(value))).length >= 2;
  const hasSameLoopFamilyShortWorking = closedFamilyCount === 1 && openServices.some(open => component.some(closed =>
    Boolean(closed?.circular)
      && sameServiceLineage(closed, open)
      && endpointPair(closed).origin
      && endpointPair(closed).origin === endpointPair(open).origin
      && sharedPatternValues(closed, open).size >= 2));
  const hasOpenPublicEvidence = hasOpenPatternPair || hasOpenDirectedEvidence
    || openServices.some(service => {
      const pair = endpointPair(service);
      return pair.origin && pair.destination
        && !GENERIC_ENDPOINT_LABEL.test(text(service.origin))
      && !GENERIC_ENDPOINT_LABEL.test(text(service.destination));
    });
  // Opposing feed directions on generic terminal labels are not sufficient
  // evidence for a public circular service.  Keep the row linear/uncertain
  // until an ordered closed pattern proves the loop independently.
  if (hasOpposingFeedDirections && familyServices.some(service => GENERIC_ENDPOINT_LABEL.test(text(service.origin)) && GENERIC_ENDPOINT_LABEL.test(text(service.destination)))) return false;
  // A source may label one direction as a loop while the route family also
  // contains an open counterpart.  Once both direction markers and an open
  // pattern are present in the family, the loop label is not a safe public
  // row identity (the deployed 310 evidence is the motivating case).
  if (hasOpenPublicEvidence && !hasSameLoopFamilyShortWorking) return false;
  // A circular flag without a closed ordered physical pattern is insufficient
  // public evidence.  Keep the row linear/uncertain rather than presenting a
  // loop merely because one provider supplied a source label.
  return hasClosedCircularEvidence;
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
  const activity = id => component.reduce((total, service) => total + DAY_ORDER.reduce((dayTotal, day) => {
    const explicit = (service?.departureEvidenceByDay?.[day] ?? []).filter(item => !text(item?.stopPointId) || text(item.stopPointId) === id);
    const scheduled = service?.departuresByDay?.[day] ?? [];
    return dayTotal + (explicit.length || (serviceAtRepresentative(service, id) ? scheduled.length : 0));
  }, 0), 0);
  const evidenceActivity = evidenceIds.map(id => activity(id));
  const maximumActivity = Math.max(0, ...evidenceActivity);
  // Walking distance remains the first choice, except where the nearest
  // timetable-evidenced stop would expose only a materially small subset of
  // the direction's population.  That prevents short calendar/variant feeds
  // from becoming the headline basis for an otherwise regular service.
  const robustEvidenceIds = maximumActivity > 0
    ? evidenceIds.filter(id => activity(id) >= maximumActivity * 0.5)
    : evidenceIds;
  const candidates = (robustEvidenceIds.length ? robustEvidenceIds : (evidenceIds.length ? evidenceIds : ids))
    .map(id => byId.get(id)).filter(Boolean);
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
      return { day, minute, stopPointId: text(item?.stopPointId) || representativeId, journeyIdentity: departureIdentity(item) || null, provider: text(item?.provider || service?.timetableSource || service?.source?.provider) || null, sourceRecordId: text(item?.sourceRecordId || service?.id) || null, routeNumber: text(item?.routeNumber || service?.routeNumber), direction: text(item?.direction || service?.direction || service?.destination || service?.origin), origin: text(item?.origin || service?.origin), destination: text(item?.destination || service?.destination), publicOrigin: text(service?.publicOrigin || service?.origin), publicDestination: text(service?.publicDestination || service?.destination), calendarProfileId, calendarProfileIds: [calendarProfileId] };
    }).filter(Boolean);
  });
}

function semanticDepartureKey(entry) {
  return [entry.routeNumber, entry.publicOrigin || entry.origin, entry.publicDestination || entry.destination, entry.variantOrigin, entry.variantDestination, entry.stopPointId, entry.day, entry.minute, entry.calendarProfileId].map(normal).join('|');
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
    const crossProviderSemanticDuplicate = existing.find(candidate =>
      (normal(candidate.provider) || 'provider-unspecified') !== provider);
    if (crossProviderSemanticDuplicate) {
      crossProviderSemanticDuplicate.calendarProfileIds = unique([
        ...calendarProfileIdsForEntry(crossProviderSemanticDuplicate),
        ...calendarProfileIdsForEntry(entry)
      ]);
      crossProviderSemanticDuplicate.calendarProfileId = crossProviderSemanticDuplicate.calendarProfileIds.length === 1
        ? crossProviderSemanticDuplicate.calendarProfileIds[0]
        : null;
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
  const publicDirection = componentPublicDirection(component);
  const entries = deduplicateDepartureEntries(records.flatMap(service => serviceDepartureEntries(service, representativeId).map(entry => ({
    ...entry,
    publicOrigin: publicDirection.publicOrigin || entry.publicOrigin,
    publicDestination: publicDirection.publicDestination || entry.publicDestination,
    variantOrigin: entry.origin && publicDirection.publicOrigin && normal(entry.origin) !== normal(publicDirection.publicOrigin) && !endpointLooksPhysical(entry.origin) ? entry.origin : '',
    variantDestination: entry.destination && publicDirection.publicDestination && normal(entry.destination) !== normal(publicDirection.publicDestination) && !endpointLooksPhysical(entry.destination) ? entry.destination : ''
  }))));
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
  const candidates = entries.filter(entry => calendarProfileIdsForEntry(entry).includes(profileId));
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
    && serviceDepartureEntries(service, representativeId).some(entry => calendarProfileIdsForEntry(entry).includes(profileId)));
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

const GENERIC_ENDPOINT_LABEL = /^(?:temporary\s+|temp\s+)?bus\s+station(?:\b|,)/i;
const STOP_DESCRIPTOR = /\b(?:station|railway|road|lane|street|close|roundabout|rdbt|parade|school|college|hospital|garage|retail|centre|center|ph|gardens?|drive|avenue|crescent)\b/i;
const STREET_ENDPOINT_DESCRIPTOR = /\b(?:road|lane|street|close|roundabout|rdbt|drive|avenue|crescent)\b/i;
const PHYSICAL_ENDPOINT_DESCRIPTOR = /\b(?:road|lane|street|close|roundabout|rdbt|drive|avenue|crescent|school|college|hospital|garage|retail)\b/i;

function cleanPublicEndpoint(value, preserveQualifier = false) {
  const candidate = text(value).replace(/\s+/g, ' ').trim();
  const withoutQualifier = preserveQualifier ? candidate : candidate.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!withoutQualifier || GENERIC_ENDPOINT_LABEL.test(withoutQualifier)) return '';
  return withoutQualifier
    .replace(/\s+Railway\s+Station$/i, '')
    .replace(/\s+Bus\s+Station$/i, '')
    .replace(/\s+Station$/i, '')
    .trim();
}

function endpointLooksPhysical(value) {
  const candidate = text(value);
  return !candidate || GENERIC_ENDPOINT_LABEL.test(candidate) || PHYSICAL_ENDPOINT_DESCRIPTOR.test(candidate);
}

function patternEndpointValue(service, side) {
  const stops = Array.isArray(service?.routePatternStops) ? service.routePatternStops : [];
  if (stops.length < 2) return '';
  const stop = side === 'origin' ? stops[0] : stops.at(-1);
  const name = cleanPublicEndpoint(stop?.name || stop?.commonName);
  const locality = cleanPublicEndpoint(stop?.locality || stop?.localityQualifier || stop?.parentLocality
    || service?.[`${side}Locality`] || service?.[`${side}LocalityName`] || service?.[`${side}ParentLocality`]);
  const raw = cleanPublicEndpoint(side === 'origin' ? service?.origin : service?.destination);
  const headsign = directionEndpointCandidate(service);
  // A non-generic terminal name is promoted only when the current service
  // itself identifies it as the public endpoint.  This keeps a hospital or
  // road stop from displacing its locality on unrelated short workings while
  // preserving authoritative terminal names such as a named hospital.
  if (name && !GENERIC_ENDPOINT_LABEL.test(name)
    && (headsign && normal(headsign) === normal(name)
      || (raw && normal(raw) === normal(name)
        && (!endpointLooksPhysical(name) || /\b(?:airport|college|hospital|university)\b/i.test(name))))) return name;
  if (locality) return locality;
  if (raw && !endpointLooksPhysical(raw)) return raw;
  return name && !GENERIC_ENDPOINT_LABEL.test(name) && !STREET_ENDPOINT_DESCRIPTOR.test(name) ? name : '';
}

function descriptionEndpoints(values) {
  const output = [];
  for (const value of unique(values)) {
    const parts = value.replace(/&amp;/gi, '&').replace(/\r?\n/g, '|')
      .split(/\s*(?:\||↔|<->|\s[-–—]\s|\s+to\s+)\s*/i)
      .map(item => cleanPublicEndpoint(item))
      .filter(Boolean);
    if (parts.length >= 2) output.push(parts.slice(0, 2));
  }
  return output;
}

function routeDescriptionValues(service) {
  return unique([
    service?.description,
    service?.routeDescription,
    service?.source?.routeDescription,
    service?.source?.routeLongName,
    service?.source?.description
  ]);
}

function patternEndpointValues(service) {
  const first = patternEndpointValue(service, 'origin');
  const last = patternEndpointValue(service, 'destination');
  return first && last && normal(first) !== normal(last) ? [first, last] : [];
}

function explicitPublicEndpointPair(service) {
  const origin = cleanPublicEndpoint(service?.publicRouteOrigin || service?.routeOrigin || service?.source?.routeOrigin, true);
  const destination = cleanPublicEndpoint(service?.publicRouteDestination || service?.routeDestination || service?.source?.routeDestination, true);
  return origin && destination && normal(origin) !== normal(destination) ? [origin, destination] : [];
}

function directionEndpointCandidate(service) {
  const value = text(service?.direction || service?.stopDirection);
  if (!value || sourceDirectionMarker(value)) return '';
  const candidate = cleanPublicEndpoint(value.replace(/^towards?\s+/i, '').split(/[,;|]/)[0], true);
  return candidate && !endpointLooksPhysical(candidate) ? candidate : '';
}

function endpointEvidencePairs(services) {
  const pairs = [];
  for (const service of services) {
    const described = descriptionEndpoints(routeDescriptionValues(service));
    const explicit = explicitPublicEndpointPair(service);
    const patterned = patternEndpointValues(service);
    for (const pair of [explicit, ...described, patterned]) {
      if (pair.length === 2) pairs.push(pair);
    }
  }
  return pairs;
}

function rawLocalityEndpointPairs(services, selectedLocalities = []) {
  const selected = unique(selectedLocalities).filter(Boolean);
  if (!selected.length) return [];
  const maximumActivity = Math.max(0, ...services.map(service => Number(service?.recordActivity) || 0));
  const candidates = new Map();
  for (const service of services) {
    const named = [service?.origin, service?.destination]
      .map(cleanPublicEndpoint)
      .filter(value => value && !endpointLooksPhysical(value));
    if (!named.length) continue;
    const activity = Number(service?.recordActivity) || 0;
    // A raw terminal plus an authoritative selected-stop locality can orient
    // a family when the feed uses infrastructure labels for the other end.
    // Low-activity named terminals are deliberately withheld here: they are
    // commonly short workings and must not displace a stronger full pattern.
    if (maximumActivity > 0 && activity < maximumActivity * 0.2) continue;
    for (const endpoint of named) for (const locality of selected) {
      if (normal(endpoint) === normal(locality)) continue;
      const key = [endpoint, locality].map(normal).sort().join('|');
      const current = candidates.get(key) ?? { pair: [endpoint, locality], activity: 0, support: 0 };
      current.activity = Math.max(current.activity, activity);
      current.support += 1;
      candidates.set(key, current);
    }
  }
  return [...candidates.values()]
    .sort((left, right) => right.activity - left.activity || right.support - left.support || left.pair.join('|').localeCompare(right.pair.join('|')))
    .map(candidate => candidate.pair);
}

function orderedLoopLocalities(service) {
  const patternStops = Array.isArray(service?.routePatternStops) ? service.routePatternStops : [];
  const patternLocalities = unique(patternStops.map(stop => cleanPublicEndpoint(stop?.locality || stop?.parentLocality)).filter(Boolean));
  if (patternLocalities.length > 2) return patternLocalities;
  return unique((service?.principalLocations ?? []).map(cleanPublicEndpoint).filter(Boolean));
}

function loopDerivedEndpointPairs(services, selectedLocalities = []) {
  const selected = new Set(selectedLocalities.map(normal));
  const pairs = [];
  const closedServices = services.filter(service => Boolean(service?.circular) && closedPhysicalShape(service));
  const hasOpenEvidence = services.some(service => service?.circular === false && !closedPhysicalShape(service));
  if (closedServices.length < 2 || !hasOpenEvidence) return pairs;
const orderedServices = closedServices
    .map(service => ({ service, localities: orderedLoopLocalities(service) }))
    .filter(item => item.localities.length > 1)
    .sort((left, right) => right.localities.length - left.localities.length);
  const baseline = new Set(orderedServices.at(-1)?.localities.map(normal) ?? []);
  for (const { service, localities } of orderedServices) {
    const originLocality = localities[0];
    const base = selectedLocalities.find(value => value && normal(value) === normal(originLocality)) || originLocality;
    if (!base || (selected.size > 0 && !selected.has(normal(base)))) continue;
    const candidates = localities.slice(1, -1)
      .filter(locality => !selected.has(normal(locality)) && !baseline.has(normal(locality)))
      .map(locality => ({ locality }));
    const candidate = candidates[0];
    if (candidate) pairs.push([base, candidate.locality]);
  }
  return pairs;
}

function contextualLocalityForEndpoint(services, value, selectedLocalities = []) {
  if (!STREET_ENDPOINT_DESCRIPTOR.test(value)) return value;
  const selected = new Set(selectedLocalities.map(normal));
  const counts = new Map();
  for (const service of services) for (const candidate of service?.principalLocations ?? []) {
    const cleaned = cleanPublicEndpoint(candidate);
    if (!cleaned || endpointLooksPhysical(cleaned) || selected.has(normal(cleaned))) continue;
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => {
    const leftWords = normal(left[0]).split(' ').length, rightWords = normal(right[0]).split(' ').length;
    return leftWords - rightWords || right[1] - left[1] || left[0].localeCompare(right[0]);
  })[0]?.[0] || value;
}

function familyPublicEndpointPair(services, selectedLocalities = []) {
  const pairs = [...endpointEvidencePairs(services), ...rawLocalityEndpointPairs(services, selectedLocalities)];
  const principalRoute = services.filter(service => normal(service?.routeNumber).replace(/\s+/g, '') === routeGroupKey(service));
  const samePair = (first, second) => first.length === 2 && second.length === 2
    && new Set(first.map(normal)).size === 2
    && first.every(value => second.some(candidate => normal(candidate) === normal(value)));
  const loopPairs = loopDerivedEndpointPairs(services, selectedLocalities);
  if (pairs.length || loopPairs.length) {
    const counts = new Map();
    for (const pair of pairs) {
      const contextualPair = pair.map(value => contextualLocalityForEndpoint(services, value, selectedLocalities));
      const key = contextualPair.map(normal).sort().join('|');
      const loopSupport = loopPairs.some(candidate => samePair(candidate.map(value => contextualLocalityForEndpoint(services, value, selectedLocalities)), contextualPair)) ? 1 : 0;
      const principalSupport = principalRoute.filter(service => endpointEvidencePairs([service])
        .some(candidate => samePair(candidate.map(value => contextualLocalityForEndpoint(services, value, selectedLocalities)), contextualPair))).length;
      const patternExtent = services
        .filter(service => endpointEvidencePairs([service]).some(candidate => samePair(candidate.map(value => contextualLocalityForEndpoint(services, value, selectedLocalities)), contextualPair)))
        .reduce((maximum, service) => Math.max(maximum, Number(service.routePatternExtent) || explicitPattern(service).length), 0);
      const current = counts.get(key) ?? { pair: contextualPair, count: 0, support: 0, principalSupport: 0, patternExtent: 0, loopSupport: 0 };
      current.count += 1;
      current.principalSupport += principalSupport;
      current.patternExtent = Math.max(current.patternExtent, patternExtent);
      current.loopSupport = Math.max(current.loopSupport, loopSupport);
      current.support += services.filter(service => {
        const rawValues = [service?.origin, service?.destination, directionEndpointCandidate(service)]
          .map(cleanPublicEndpoint).filter(value => value && !endpointLooksPhysical(value)).map(normal);
        return rawValues.some(value => contextualPair.some(endpoint => normal(endpoint) === value));
      }).length;
      counts.set(key, current);
    }
    for (const pair of loopPairs) {
      const contextualPair = pair.map(value => contextualLocalityForEndpoint(services, value, selectedLocalities));
      const key = contextualPair.map(normal).sort().join('|');
      const current = counts.get(key) ?? { pair: contextualPair, count: 0, support: 0, principalSupport: 0, patternExtent: 0, loopSupport: 0 };
      current.loopSupport = 1;
      current.patternExtent = Math.max(current.patternExtent, ...services.filter(service => Boolean(service?.circular) && closedPhysicalShape(service)).map(service => explicitPattern(service).length));
      counts.set(key, current);
    }
    return [...counts.values()].sort((left, right) => right.loopSupport - left.loopSupport
      || right.principalSupport - left.principalSupport
      || right.patternExtent - left.patternExtent
      || right.count - left.count
      || right.support - left.support
      || left.pair.join('|').localeCompare(right.pair.join('|')))[0].pair;
  }
  const principalHeadsigns = new Map();
  for (const service of principalRoute) {
    const candidate = directionEndpointCandidate(service);
    if (candidate) principalHeadsigns.set(normal(candidate), candidate);
  }
  if (principalHeadsigns.size === 2) return [...principalHeadsigns.values()];
  // A repeated pair of non-generic headsign termini is weaker than a route
  // description or complete pattern, but is still auditable evidence.  It
  // deliberately does not inspect principalLocations or selected localities.
  const candidates = new Map();
  for (const service of services) {
    const candidate = directionEndpointCandidate(service);
    if (candidate) {
      const current = candidates.get(normal(candidate)) ?? { value: candidate, count: 0 };
      current.count += 1;
      candidates.set(normal(candidate), current);
    }
  }
  if (candidates.size < 2) return [];
  return [...candidates.values()].sort((left, right) => right.count - left.count || left.value.localeCompare(right.value)).slice(0, 2).map(item => item.value);
}

function publicEndpointQualifier(value, services, selectedLocalities = []) {
  const target = normal(value);
  for (const pair of endpointEvidencePairs(services)) for (const endpoint of pair) {
    const contextual = contextualLocalityForEndpoint(services, endpoint, selectedLocalities);
    if (normal(contextual) === target && normal(endpoint) !== target && STREET_ENDPOINT_DESCRIPTOR.test(endpoint)) return endpoint;
  }
  return '';
}

function currentRouteDescriptions(services) {
  return [...services]
    .filter(service => text(service?.description))
    .sort((first, second) => text(second.validFrom || second.validity?.from).localeCompare(text(first.validFrom || first.validity?.from)) || text(first.id).localeCompare(text(second.id)))
    .map(service => text(service.description));
}

function selectedStopLocality(service, side, stops) {
  const id = text(side === 'origin' ? service?.originStopPointId : service?.destinationStopPointId);
  const stop = (stops ?? []).find(candidate => stopId(candidate) === id);
  return cleanPublicEndpoint(stop?.locality || stop?.localityQualifier || stop?.parentLocality);
}

function resolvePublicEndpoint(service, side, context) {
  const raw = text(side === 'origin' ? service?.origin : service?.destination);
  const stopLocality = selectedStopLocality(service, side, context.stops);
  const descriptions = context.endpointPair;
  const rawPublic = cleanPublicEndpoint(raw);
  const headsign = directionEndpointCandidate(service);
  const patternValues = patternEndpointValues(service);
  const patternEndpoint = side === 'origin' ? patternValues[0] : patternValues.at(-1);
  if (descriptions.length === 2) {
    const matches = value => descriptions.findIndex(item => normal(item) === normal(value));
    const rawIndex = matches(rawPublic);
    const headsignIndex = matches(headsign);
    if (rawIndex >= 0) return { value: descriptions[rawIndex], qualifier: '' };
    if (headsignIndex >= 0) return { value: descriptions[side === 'destination' ? headsignIndex : 1 - headsignIndex], qualifier: '' };
    const patternIndex = matches(patternEndpoint);
    if (patternIndex >= 0
      && GENERIC_ENDPOINT_LABEL.test(text(service.origin))
      && GENERIC_ENDPOINT_LABEL.test(text(service.destination))) {
      return { value: descriptions[patternIndex], qualifier: '' };
    }
    // Selected locality is used only to orient an already evidenced pair;
    // it is never returned as a remote endpoint candidate.
    const selectedIndex = matches(stopLocality);
    if (selectedIndex >= 0 && (GENERIC_ENDPOINT_LABEL.test(raw) || endpointLooksPhysical(raw))) {
      return { value: descriptions[side === 'destination' ? selectedIndex : 1 - selectedIndex], qualifier: '' };
    }
    if (rawPublic && !endpointLooksPhysical(raw)) return { value: rawPublic, qualifier: '' };
    return { value: '', qualifier: '' };
  }
  if (patternEndpoint && (GENERIC_ENDPOINT_LABEL.test(raw) || endpointLooksPhysical(raw))) {
    return { value: patternEndpoint, qualifier: '' };
  }
  if (stopLocality && (GENERIC_ENDPOINT_LABEL.test(raw) || endpointLooksPhysical(raw))) {
    return { value: stopLocality, qualifier: '' };
  }
  if (rawPublic && endpointLooksPhysical(raw)) {
    const contextual = contextualLocalityForEndpoint(context.services ?? [service], rawPublic, context.selectedLocalities);
    if (contextual && normal(contextual) !== normal(rawPublic) && !context.selectedLocalities.some(value => normal(value) === normal(contextual))) {
      return { value: contextual, qualifier: rawPublic };
    }
  }
  if (rawPublic && !endpointLooksPhysical(raw)) return { value: rawPublic, qualifier: '' };
  return { value: '', qualifier: '' };
}

function publicDirectionForService(service, stops, familyServices) {
  const selectedLocalities = unique((stops ?? []).map(stop => stop?.locality || stop?.localityQualifier || stop?.parentLocality).map(cleanPublicEndpoint));
  const endpointPair = familyPublicEndpointPair(familyServices, selectedLocalities);
  const context = {
    stops,
    endpointPair,
    selectedLocalities,
    services: familyServices
  };
  const origin = resolvePublicEndpoint(service, 'origin', context);
  const destination = resolvePublicEndpoint(service, 'destination', context);
  if (endpointPair.length === 2) {
    const originIndex = endpointPair.findIndex(value => normal(value) === normal(origin.value));
    const destinationIndex = endpointPair.findIndex(value => normal(value) === normal(destination.value));
    if (origin.value && !destination.value && originIndex >= 0) destination.value = endpointPair[1 - originIndex];
    if (destination.value && !origin.value && destinationIndex >= 0) origin.value = endpointPair[1 - destinationIndex];
  }
  const destinationQualifier = destination.value
    ? publicEndpointQualifier(destination.value, familyServices, selectedLocalities)
    : '';
  return {
    publicOrigin: origin.value || null,
    publicDestination: destination.value || null,
    publicDestinationQualifier: destination.qualifier || destinationQualifier || null,
    publicDirectionConfidence: origin.value && destination.value ? 'resolved' : 'review-required'
  };
}

function decoratePublicDirections(services, stops) {
  const selectedLocalities = unique((stops ?? []).map(stop => stop?.locality || stop?.localityQualifier || stop?.parentLocality).map(cleanPublicEndpoint));
  const familyPair = familyPublicEndpointPair(services, selectedLocalities);
  return services.map(service => {
    const patternDirection = endpointDirectionFromSelectedStop(service, familyPair, stops)
      || orderedPatternDirectionEndpoint(service, familyPair);
    return {
      ...service,
      ...publicDirectionForService(service, stops, services),
      ...(patternDirection ? {
        publicOrigin: patternDirection.origin,
        publicDestination: patternDirection.destination,
        publicDirectionConfidence: 'resolved'
      } : {}),
      publicFamilyEndpointPair: familyPair
    };
  });
}

function endpointDirectionFromSelectedStop(service, familyPair, stops) {
  if (!Array.isArray(familyPair) || familyPair.length !== 2 || !Array.isArray(stops)) return null;
  const byId = new Map(stops.map(stop => [text(stopId(stop)), stop]).filter(([id]) => id));
  const endpointLocality = stopId => cleanPublicEndpoint(byId.get(text(stopId))?.locality
    || byId.get(text(stopId))?.localityQualifier
    || byId.get(text(stopId))?.parentLocality);
  const origin = endpointLocality(service?.originStopPointId);
  const destination = endpointLocality(service?.destinationStopPointId);
  const originIndex = familyPair.findIndex(value => normal(value) === normal(origin));
  const destinationIndex = familyPair.findIndex(value => normal(value) === normal(destination));
  if (originIndex >= 0 && destinationIndex < 0) return { origin: familyPair[originIndex], destination: familyPair[1 - originIndex] };
  if (destinationIndex >= 0 && originIndex < 0) return { origin: familyPair[1 - destinationIndex], destination: familyPair[destinationIndex] };
  return null;
}

function orderedPatternDirectionEndpoint(service, familyPair) {
  if (!Array.isArray(familyPair) || familyPair.length !== 2) return null;
  const values = patternEndpointValues(service);
  if (values.length !== 2) return null;
  const firstIndex = familyPair.findIndex(value => normal(value) === normal(values[0]));
  const lastIndex = familyPair.findIndex(value => normal(value) === normal(values[1]));
  if (lastIndex >= 0) return { origin: familyPair[1 - lastIndex], destination: familyPair[lastIndex] };
  const rawDestination = cleanPublicEndpoint(service?.destination);
  if (rawDestination && !endpointLooksPhysical(rawDestination)
    && !familyPair.some(value => normal(value) === normal(rawDestination))) return null;
  // A short working may terminate before the principal endpoint.  Its
  // ordered starting endpoint still identifies which principal endpoint is
  // downstream; retain the short terminus as variant evidence below.
  if (firstIndex >= 0) return { origin: familyPair[firstIndex], destination: familyPair[1 - firstIndex] };
  return null;
}

function componentPublicDirection(component, stops = []) {
  const familyPair = component.find(service => Array.isArray(service.publicFamilyEndpointPair) && service.publicFamilyEndpointPair.length === 2)?.publicFamilyEndpointPair ?? [];
  const directCandidates = component.map(service => ({
    origin: text(service.publicOrigin),
    destination: text(service.publicDestination),
    qualifier: text(service.publicDestinationQualifier)
  })).filter(pair => pair.origin && pair.destination && normal(pair.origin) !== normal(pair.destination));
  const directKeys = unique(directCandidates.map(pair => `${normal(pair.origin)}|${normal(pair.destination)}`));
  // When the family has an evidenced endpoint pair, ordered pattern
  // orientation is stronger than a single decorated record.  The latter can
  // have generic station names or a feed-local headsign that points at the
  // wrong side of the pair.
  if (familyPair.length !== 2 && directKeys.length === 1) {
    const selected = directCandidates[0];
    return { publicOrigin: selected.origin, publicDestination: selected.destination, publicDestinationQualifier: selected.qualifier || null, publicDirectionConfidence: 'resolved' };
  }
  if (familyPair.length === 2) {
    const counts = new Map();
    for (const service of component) {
      const originIndex = familyPair.findIndex(value => normal(value) === normal(plannerOrigin(service)));
      const destinationIndex = familyPair.findIndex(value => normal(value) === normal(plannerDestination(service)));
      if (originIndex < 0 && destinationIndex < 0) continue;
      const origin = originIndex >= 0 ? familyPair[originIndex] : familyPair[1 - destinationIndex];
      const destination = destinationIndex >= 0 ? familyPair[destinationIndex] : familyPair[1 - originIndex];
      const headsign = directionEndpointCandidate(service);
      let orientedOrigin = origin;
      let orientedDestination = destination;
      const patternDirection = endpointDirectionFromSelectedStop(service, familyPair, stops)
        || orderedPatternDirectionEndpoint(service, familyPair);
      if (patternDirection) {
        orientedOrigin = patternDirection.origin;
        orientedDestination = patternDirection.destination;
      }
      const key = `${normal(orientedOrigin)}|${normal(orientedDestination)}`;
      const current = counts.get(key) ?? { origin: orientedOrigin, destination: orientedDestination, count: 0, evidenceScore: 0 };
      current.count += 1;
      if (headsign && normal(headsign) === normal(orientedDestination)) current.evidenceScore += 3;
      if (explicitDirectionMarker(service)) current.evidenceScore += 1;
      if (orientedDestination !== destination) current.evidenceScore += 6;
      counts.set(key, current);
    }
    if (counts.size) {
      const selected = [...counts.values()].sort((first, second) => second.evidenceScore - first.evidenceScore || second.count - first.count || `${first.origin}|${first.destination}`.localeCompare(`${second.origin}|${second.destination}`))[0];
      const qualifier = component.find(service => normal(plannerDestination(service)) === normal(selected.destination) && text(service.publicDestinationQualifier))?.publicDestinationQualifier
        || publicEndpointQualifier(selected.destination, component, []);
      return { publicOrigin: selected.origin, publicDestination: selected.destination, publicDestinationQualifier: qualifier || null, publicDirectionConfidence: 'resolved' };
    }
  }
  const candidates = component.map(service => ({
    origin: plannerOrigin(service),
    destination: plannerDestination(service),
    qualifier: text(service.publicDestinationQualifier),
    confidence: service.publicDirectionConfidence === 'resolved'
  })).filter(pair => pair.confidence && pair.origin && pair.destination && normal(pair.origin) !== normal(pair.destination));
  if (!candidates.length) return {};
  const counts = new Map();
  for (const candidate of candidates) {
    const key = `${normal(candidate.origin)}|${normal(candidate.destination)}`;
    const current = counts.get(key) ?? { ...candidate, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  const selected = [...counts.values()].sort((first, second) => second.count - first.count || `${first.origin}|${first.destination}`.localeCompare(`${second.origin}|${second.destination}`))[0];
  return { publicOrigin: selected.origin, publicDestination: selected.destination, publicDestinationQualifier: selected.qualifier || null, publicDirectionConfidence: 'resolved' };
}

function directionPatternText(service) {
  const destination = text(service?.publicDestination || service?.destination);
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
  const locality = text(service?.publicDestinationQualifier || service?.destinationLocality || service?.destinationLocalityName || service?.destinationQualifier);
  const target = destination && !/^(?:destination not supplied|destination not resolved)$/i.test(destination)
    ? destination
    : direction && !sourceDirectionMarker(direction) ? direction : '';
  if (!target || sourceDirectionMarker(target) || GENERIC_ENDPOINT_LABEL.test(target)) return 'Destination not resolved';
  return locality && normal(locality) !== normal(target) ? `Towards ${target} (${locality})` : `Towards ${target}`;
}

function servedAtText(representative) {
  const stop = representative.stop;
  const name = text(stop?.name) || representative.name || 'Representative stop not resolved';
  const indicator = text(stop?.indicator);
  const distance = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number(stop?.distanceMetres);
  const suffix = Number.isFinite(distance) ? ' · ' + Math.round(distance).toLocaleString('en-GB') + ' m' : '';
  return name + (indicator ? ' — ' + indicator : '') + suffix;
}

function materialServiceNote(note) {
  const value = text(note);
  if (!value) return null;
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

function noteAppliesToCanonicalPopulation(note, schedules) {
  const representedDays = DAY_ORDER.filter(day => (schedules[day] ?? []).length);
  if (/limited service|no more than three scheduled journeys/i.test(note)) return representedDays.length > 0 && representedDays.every(day => (schedules[day] ?? []).length <= 3);
  if (/weekday-only service/i.test(note)) return representedDays.length > 0 && !representedDays.some(day => day === 'saturday' || day === 'sunday');
  if (!/non[- ]school/i.test(note) && /school\s*days?/i.test(note) && representedDays.some(day => day === 'saturday' || day === 'sunday')) return false;
  return true;
}

function plannerDestination(service) {
  const destination = text(service?.publicDestination || service?.destination);
  return destination && !GENERIC_ENDPOINT_LABEL.test(destination)
    && !/^(?:destination not supplied|destination not resolved)$/i.test(destination) && !sourceDirectionMarker(destination)
    ? destination
    : '';
}

function plannerOrigin(service) {
  const origin = text(service?.publicOrigin || service?.origin);
  return origin && !GENERIC_ENDPOINT_LABEL.test(origin)
    && !/^(?:origin not supplied|origin not resolved)$/i.test(origin) && !sourceDirectionMarker(origin) ? origin : '';
}

function destinationNames(values) {
  const names = unique(values).filter(Boolean);
  const normalised = names.map(name => ({ name, key: normal(name), words: normal(name).split(' ').filter(Boolean) }));
  return normalised
    .filter(candidate => !normalised.some(other => other !== candidate && other.words.length > candidate.words.length && other.key.includes(candidate.key)))
    .map(candidate => candidate.name);
}

function alternateDestinations(component, main) {
  const principalEndpoints = new Set([plannerOrigin(main), plannerDestination(main)].map(normal).filter(Boolean));
  const evidence = component.flatMap(service => [
    plannerOrigin(service), plannerDestination(service), ...patternEndpointValues(service),
    ...[service?.origin, service?.destination].map(cleanPublicEndpoint).filter(value => value && !endpointLooksPhysical(value))
  ]).filter(value => value && !principalEndpoints.has(normal(value)));
  return destinationNames(evidence);
}

function variantNote(component, main) {
  const endpoints = unique(component.map(service => text(service.origin) + ' → ' + text(service.destination)));
  const patterns = unique(component.map(service => explicitPattern(service).map(text).join('>')).filter(Boolean));
  const journeyIdentitySets = component.map(service => new Set(DAY_ORDER.flatMap(day => (service.departureEvidenceByDay?.[day] ?? []).map(item => departureIdentity(item)).filter(Boolean))));
  const sharedJourneyIdentity = journeyIdentitySets.length > 1 && journeyIdentitySets.every(set => set.size) && [...journeyIdentitySets[0]].some(identity => journeyIdentitySets.every(set => set.has(identity)));
  const alternatives = alternateDestinations(component, main);
  const hasVariant = component.length > 1 && ((endpoints.length > 1 && !sharedJourneyIdentity) || patterns.length > 1 || component.some(service => Number(service.patternVariantCount) > 1));
  if (!hasVariant) return null;
  const publicOrigin = plannerOrigin(main);
  if (alternatives.length === 1 && normal(alternatives[0]) === normal(publicOrigin)) return `Selected journeys terminate at ${alternatives[0]}.`;
  if (alternatives.length === 1) return `Additional variants and short workings operate, including journeys towards ${alternatives[0]}.`;
  if (alternatives.length > 1) return `Additional variants and short workings operate, including journeys towards ${alternatives.slice(0, -1).join(', ')} and ${alternatives.at(-1)}.`;
  return 'Additional short workings and timetable variants operate.';
}

function resolvedPlannerDestination(service) {
  const destination = text(service?.publicDestination || service?.destination);
  const direction = plannerDirection(service);
  const rawDestination = text(service?.destination);
  const hasNamedPatternEndpoint = [patternEndpointValue(service, 'origin'), patternEndpointValue(service, 'destination')]
    .some(value => value && !GENERIC_ENDPOINT_LABEL.test(value) && !/^(?:origin|destination) not supplied$/i.test(value));
  const unresolvedGeneric = Boolean(service?.reviewRequired && hasNamedPatternEndpoint && (
    GENERIC_ENDPOINT_LABEL.test(destination)
      || GENERIC_ENDPOINT_LABEL.test(rawDestination)
      || GENERIC_ENDPOINT_LABEL.test(direction)
  ));
  if (/^(?:destination not supplied|destination not resolved)$/i.test(destination)
    && !hasNamedPatternEndpoint
    && (!direction || GENERIC_ENDPOINT_LABEL.test(direction) || sourceDirectionMarker(direction))) return false;
  return Boolean(destination && !GENERIC_ENDPOINT_LABEL.test(destination) && !/^(?:destination not supplied|destination not resolved)$/i.test(destination) && !sourceDirectionMarker(destination))
    || Boolean(direction && text(service?.destination) && !GENERIC_ENDPOINT_LABEL.test(direction) && !sourceDirectionMarker(direction))
    || unresolvedGeneric;
}

export function plannerSourceWarning(service) {
  const route = text(service?.routeNumber) || 'Unknown route';
  const warnings = [];
  if (!resolvedPlannerDestination(service)) warnings.push(`Route ${route} — one timetable pattern could not be assigned a complete headline destination. The scheduled evidence remains represented in the planner service row and is retained under Detailed Evidence.`);
  if (!text(service?.operator) || /not supplied/i.test(text(service?.operator))) warnings.push(`Route ${route} — operator identity was not deterministically supplied for one timetable pattern. The source evidence is retained under Detailed Evidence.`);
  return warnings;
}

function principalText(main) {
  const locations = unique(main?.principalLocations ?? []);
  return locations.length ? locations.join(', ') : 'See route origin / destination';
}

function compactPrincipalLocations(component, main, { publicOrigin = '', publicDestination = '' } = {}) {
  const endpoints = new Set([normal(publicOrigin), normal(publicDestination)].filter(Boolean));
  const candidates = unique(component.flatMap(service => service?.principalLocations ?? []));
  const scored = candidates.map((value, index) => {
    const key = normal(value);
    const locality = !STOP_DESCRIPTOR.test(value) && !GENERIC_ENDPOINT_LABEL.test(value);
    const endpoint = endpoints.has(key);
    return { value, index, score: (endpoint ? 3 : 0) + (locality ? 2 : 0) };
  });
  return scored.sort((left, right) => right.score - left.score || left.index - right.index || left.value.localeCompare(right.value))
    .map(item => item.value);
}

function plannerStopLabel(stop, { basis = false } = {}) {
  const name = text(stop?.name) || stopId(stop) || 'Selected stop';
  const indicator = text(stop?.indicator);
  const distance = stop?.walking?.status === 'routed' ? Number(stop.walking.distanceMetres) : Number(stop?.distanceMetres);
  const suffix = Number.isFinite(distance) ? ` · ${Math.round(distance).toLocaleString('en-GB')} m` : '';
  return `${name}${indicator ? ` — ${indicator}` : ''}${suffix}${basis ? ' (timetable basis)' : ''}`;
}

function publicDirectionIdentity(component, main) {
  const pairs = component.map(service => ({ origin: plannerOrigin(service), destination: plannerDestination(service) }))
    .filter(pair => pair.origin || pair.destination);
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
function buildPlannerServiceGroup(component, stops, main, representative) {
  const resolvedPublicDirection = componentPublicDirection(component, stops);
  const publicMain = { ...main, ...resolvedPublicDirection };
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
  return Object.freeze({
    serviceIdentity: `${routeGroupKey(main)}|${publicDirectionIdentity(component, publicMain)}|${endpointIdentity}`,
    routeNumber: text(main?.routeNumber) || 'Not supplied',
    publicDirection: publicDirectionIdentity(component, main),
    principalDestination: plannerDestination(publicMain) || null,
    principalOrigin: plannerOrigin(publicMain) || null,
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
    alternateDestinations: Object.freeze(alternateDestinations(component, publicMain)),
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
  return routeFamilyComponents(serviceSummaries ?? []).flatMap(services => {
    const routeKey = routeGroupKey(services[0]);
    const decorated = decoratePublicDirections(services, stops);
    const connected = connectedServiceComponents(decorated);
    // Alias-like operator names can be separate source components when a
    // feed-local marker is incomplete.  Reconcile them only after public
    // endpoint orientation agrees; operator compatibility alone is not a
    // public-family merge rule.
    for (let left = 0; left < connected.length; left += 1) {
      for (let right = left + 1; right < connected.length; right += 1) {
        const joins = connected[left].some(first => connected[right].some(second => {
          const firstMarker = explicitDirectionMarker(first);
          const secondMarker = explicitDirectionMarker(second);
          const bothProviderLocalMarkers = /^gtfs:\s*\d+$/i.test(firstMarker)
            && /^gtfs:\s*\d+$/i.test(secondMarker);
          const markerJoin = !firstMarker || !secondMarker || firstMarker === secondMarker
            || (feedIdentity(first) && feedIdentity(second)
              && feedIdentity(first) !== feedIdentity(second)
              && scheduledDepartureOverlap(first, second) >= (bothProviderLocalMarkers ? 2 : 1));
          return normal(first?.operator) !== normal(second?.operator)
          && markerJoin
          && operatorFamilyCompatible(first, second)
          && plannerOrigin(first) && plannerOrigin(second)
          && plannerDestination(first) && plannerDestination(second)
          && normal(plannerOrigin(first)) === normal(plannerOrigin(second))
          && normal(plannerDestination(first)) === normal(plannerDestination(second));
        }));
        if (joins) {
          connected[left].push(...connected[right]);
          connected.splice(right, 1);
          right -= 1;
        }
      }
    }
    const operatorSeparated = connected.flatMap(component => {
      const groups = [];
      for (const service of component) {
        const group = groups.find(candidate => candidate.every(member => operatorFamilyCompatible(member, service)));
        if (group) group.push(service);
        else groups.push([service]);
      }
      const ambiguous = component.ambiguousServices ?? [];
      for (const group of groups) Object.defineProperty(group, 'ambiguousServices', {
        value: Object.freeze(ambiguous.filter(service => group.some(member => compatibleDirection(member, service)))),
        enumerable: false
      });
      return groups;
    });
    return operatorSeparated.map(component => {
    const representative = selectRepresentativeStop(component, stops);
    const main = [...component].sort((first, second) => compareMain(first, second, representative.id, component))[0];
    const group = buildPlannerServiceGroup(component, stops, main, representative);
    return Object.freeze({ ...group, routeFamilyServices: Object.freeze(decorated), routeFamilyKey: routeKey });
    });
  });
}

function familyRouteNumber(services, fallback) {
  const root = routeGroupKey(fallback || services[0]);
  const exact = (services ?? []).find(service => normal(service?.routeNumber).replace(/\s+/g, '') === root);
  if (exact) return text(exact.routeNumber);
  return [...new Set((services ?? []).map(service => text(service?.routeNumber)).filter(Boolean))]
    .sort((left, right) => left.length - right.length || left.localeCompare(right, undefined, { numeric: true }))[0] || text(fallback?.routeNumber) || 'Not supplied';
}

function profileLines(lines, profileLabel) {
  if (!profileLabel) return lines;
  return lines.map(line => line.replace(/^([^:]+):\s*/, `$1 (${profileLabel}): `));
}

function buildPlannerRow(component, stops, componentIndex, routeFamilyServices = component) {
  const representative = selectRepresentativeStop(component, stops);
  const main = [...component].sort((first, second) => compareMain(first, second, representative.id, component))[0];
  const resolvedPublicDirection = componentPublicDirection(component, stops);
  const publicMain = { ...main, ...resolvedPublicDirection };
  const plannerServiceGroup = buildPlannerServiceGroup(component, stops, main, representative);
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
  const resolvedEffectiveProfileIds = effectiveProfileIds.filter(profileId => profileId !== UNKNOWN_CALENDAR_PROFILE);
  const displayProfileId = resolvedEffectiveProfileIds.includes('ordinary') ? 'ordinary' : resolvedEffectiveProfileIds[0] ?? effectiveProfileIds[0] ?? profileIds[0] ?? UNKNOWN_CALENDAR_PROFILE;
  const displayResult = profileResults.get(displayProfileId) ?? calculateProfileResult(component, representative.id, displayProfileId, { entries: [], schedules: emptySchedule() });
  const unresolvedPopulation = profileResults.get(UNKNOWN_CALENDAR_PROFILE)?.entries ?? [];
  const unresolvedNeedsReview = unresolvedPopulation.length > 0;
  const mixedProfileOutput = resolvedEffectiveProfileIds.length > 1;
  const outputProfileIds = mixedProfileOutput ? resolvedEffectiveProfileIds : [displayProfileId];
  const displayFrequencyLines = [...displayResult.frequencyLines];
  const displayOperatingLines = [...displayResult.operatingLines];
  let frequencyLines = displayFrequencyLines;
  let operatingLines = displayOperatingLines;
  if (unresolvedNeedsReview) {
    frequencyLines = ['Review required: calendar applicability could not be safely established.'];
    operatingLines = ['Review required: calendar applicability could not be safely established.'];
  } else if (mixedProfileOutput) {
    frequencyLines = outputProfileIds.flatMap(profileId => calendarQualifiedLines(profileResults.get(profileId).frequencyLines, profileId, hasOrdinaryProfile && profileId !== 'ordinary'));
    operatingLines = outputProfileIds.flatMap(profileId => calendarQualifiedLines(profileResults.get(profileId).operatingLines, profileId, hasOrdinaryProfile && profileId !== 'ordinary'));
  } else if (displayProfileId !== 'ordinary' && displayProfileId !== UNKNOWN_CALENDAR_PROFILE) {
    frequencyLines = profileLines(displayFrequencyLines, calendarProfileLabel(displayProfileId));
    operatingLines = profileLines(displayOperatingLines, calendarProfileLabel(displayProfileId));
  }
  const calendarProfileId = profileIds.length === 1 ? profileIds[0] : null;
  const calendarProfile = calendarProfileLabel(calendarProfileId);
  const profileNotes = [];
  if (mixedProfileOutput) profileNotes.push('Calendar profile variation is shown as profile-qualified frequency and operating-period lines within this route-direction row.');
  if (unresolvedNeedsReview) profileNotes.push('Review required before relying on frequency or operating period because calendar applicability is unresolved.');
  const notes = unique(component.flatMap(service => text(service.serviceNote).split(/(?<=[.!?])\s+(?=[A-Z])/u).map(materialServiceNote).filter(Boolean)))
    .filter(note => noteAppliesToCanonicalPopulation(note, displayResult.schedules))
    .filter(note => rowCircular || !/^Circular service\.$/i.test(note))
    .filter(note => !(mixedProfileOutput && hasCalendarTaxonomyNote(note)));
  notes.push(...profileNotes);
  const ids = unique(component.flatMap(service => service.sourceRecordIds ?? []));
  const publicDestination = plannerDestination(publicMain);
  const publicOrigin = plannerOrigin(publicMain);
  const principalLocations = compactPrincipalLocations(component, main, { publicOrigin, publicDestination });
  const profileSchedules = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).schedules])));
  const profilePopulations = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).entries])));
  const profileFrequency = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).frequencyByDay])));
  const profilePeriods = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).periods])));
  const profileEvidence = Object.freeze(Object.fromEntries(profileIds.map(profileId => [profileId, profileResults.get(profileId).frequencyEvidence])));
  const servedAtLines = plannerServiceGroup.servedStops.map(stop => stop.label);
  const servedStopIds = unique(plannerServiceGroup.servedStops.map(stop => stop.id));
  const displayedRouteNumber = familyRouteNumber(routeFamilyServices, main);
  const rawRouteNumbers = unique(routeFamilyServices.map(service => service?.routeNumber));
  const row = {
    id: 'planner:' + plannerServiceGroup.serviceIdentity + '|' + (componentIndex + 1),
    routeNumber: displayedRouteNumber,
    rawRouteNumbers: Object.freeze(rawRouteNumbers),
    variantRouteNumbers: Object.freeze(rawRouteNumbers.filter(route => normal(route).replace(/\s+/g, '') !== normal(displayedRouteNumber).replace(/\s+/g, ''))),
    operator: plannerServiceGroup.operatorNames.join(' · ') || 'Operator identity not resolved',
    origin: publicOrigin || null,
    destination: publicDestination || null,
    direction: text(main.direction),
    stopDirection: text(main.stopDirection) || null,
    circular: rowCircular,
    calendarProfileId,
    calendarProfileLabel: calendarProfile,
    calendarProfileIds: Object.freeze(profileIds),
    calendarProfileLabels: Object.freeze(profileIds.map(calendarProfileDisplayLabel)),
    calendarConfidence: unresolvedNeedsReview ? 'unresolved' : profileIds.some(profileId => profileId !== UNKNOWN_CALENDAR_PROFILE && profileResults.get(profileId)?.entries.length) ? 'resolved' : 'unresolved',
    reviewRequired: unresolvedNeedsReview || publicMain.publicDirectionConfidence === 'review-required',
    reviewReasons: Object.freeze([
      ...(unresolvedNeedsReview ? ['calendar-applicability-unresolved'] : []),
      ...(publicMain.publicDirectionConfidence === 'review-required' ? ['public-direction-unresolved'] : [])
    ]),
    directionFamily: directionKey(main),
    directionPatternText: directionPatternText({ ...publicMain, circular: rowCircular }),
    publicDirectionConfidence: publicMain.publicDirectionConfidence || 'review-required',
    publicDestinationQualifier: publicMain.publicDestinationQualifier || null,
    servedAtStopId: representative.id,
    servedAtText: servedAtLines.join('\n') || servedAtText(representative),
    servedAtStops: Object.freeze(servedAtLines),
    servedStopEvidence: plannerServiceGroup.servedStops,
    timetableBasisStopLabel: plannerServiceGroup.timetableBasis.label,
    frequencyBasisStopId: representative.id,
    frequencyBasisStopName: representative.name,
    principalLocations: Object.freeze(principalLocations),
    principalLocationsText: principalText({ principalLocations }),
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
    stopIds: Object.freeze(servedStopIds.length ? servedStopIds : (representative.id ? [representative.id] : unique(component.flatMap(service => service.stopIds ?? [])))),
    sourceRecordIds: Object.freeze(ids),
    variantCount: component.length,
    variantServiceIds: Object.freeze(unique(component.map(service => service.id))),
    routePatternExtent: Math.max(0, ...component.map(service => Number(service.routePatternExtent) || explicitPattern(service).length)),
    routePatternStops: Object.freeze([...(main.routePatternStops ?? [])]),
    recordActivity: Math.max(0, ...component.map(service => Number(service.recordActivity) || 0)),
    presentation: Object.freeze({ principalLocationsText: principalText({ principalLocations }), rank: 0 }),
    rawServiceSummaries: Object.freeze(component),
    consolidatedSourceRecordIds: Object.freeze([]),
    ambiguousServiceSummaries: Object.freeze([...(component.ambiguousServices ?? [])]),
    plannerServiceGroup,
    operatorRawNames: plannerServiceGroup.rawOperatorNames,
    operatorIdentities: plannerServiceGroup.operatorIdentities,
    sourceSelection: canonical.eligible.length ? 'representative-stop scheduled evidence' : 'representative-stop summary fallback',
    routeVariantNote: variantNote(component, publicMain),
    alternateDestinationNames: Object.freeze(alternateDestinations(component, main)),
    sourceWarnings: Object.freeze(unique(component.flatMap(service => service.sourceWarnings ?? [])))
  };
  return Object.freeze(row);
}

function routeNumbersForRows(rows) {
  return unique(rows.flatMap(row => row.rawRouteNumbers ?? []))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function routeNumberForRoot(rows) {
  const root = normal(rows[0]?.routeGroupKey);
  const routeNumbers = routeNumbersForRows(rows);
  return routeNumbers.find(route => normal(route).replace(/\s+/g, '') === root)
    || (routeNumbers.length === 1 ? routeNumbers[0] : null);
}

function principalCorridorForRows(rows, principalRoute) {
  const principalRows = rows.filter(row => (row.rawRouteNumbers ?? []).some(route => normal(route).replace(/\s+/g, '') === normal(principalRoute)));
  const candidates = new Map();
  for (const row of principalRows) {
    const origin = plannerOrigin(row), destination = plannerDestination(row);
    if (!origin || !destination || normal(origin) === normal(destination)) continue;
    const key = `${normal(origin)}|${normal(destination)}`;
    const current = candidates.get(key) ?? { origin, destination, count: 0, extent: 0, activity: 0 };
    current.count += 1;
    current.extent = Math.max(current.extent, Number(row.routePatternExtent) || 0);
    current.activity = Math.max(current.activity, Number(row.recordActivity) || 0);
    candidates.set(key, current);
  }
  const pairs = [...candidates.values()];
  const hasTwoWayEvidence = pairs.some(pair => pairs.some(other =>
    normal(pair.origin) === normal(other.destination) && normal(pair.destination) === normal(other.origin)));
  if (!pairs.length || (rows.length > 1 && !hasTwoWayEvidence)) return null;
  return pairs.sort((left, right) => right.extent - left.extent || right.activity - left.activity
    || right.count - left.count || `${left.origin}|${left.destination}`.localeCompare(`${right.origin}|${right.destination}`))[0];
}

function plannerFamilyNote(rows) {
  const routeNumbers = routeNumbersForRows(rows);
  if (!routeNumbers.length) return null;
  const principalRoute = routeNumberForRoot(rows);
  const corridor = principalRoute ? principalCorridorForRows(rows, principalRoute) : null;
  const sentences = [];
  if (principalRoute && corridor) {
    sentences.push(`The principal Route ${principalRoute} service operates between ${corridor.origin} and ${corridor.destination}.`);
    const included = routeNumbers.filter(route => normal(route).replace(/\s+/g, '') !== normal(principalRoute));
    if (included.length) sentences.push(`The service family also includes ${included.length === 1 ? 'Route' : 'Routes'} ${included.join(included.length === 2 ? ' and ' : ', ').replace(/, ([^,]*)$/, ', and $1')}.`);
  } else if (routeNumbers.length > 1) {
    sentences.push(`The service family includes Routes ${routeNumbers.slice(0, -1).join(', ')} and ${routeNumbers.at(-1)}.`);
  } else if (!principalRoute && rows.some(row => row.routeVariantNote || row.variantCount > 1)) {
    sentences.push(`The service family includes Route ${routeNumbers[0]}.`);
  }
  const principalEndpoints = new Set(rows.flatMap(row => [row.origin, row.destination]).map(normal).filter(Boolean));
  const variantRows = rows.filter(row => row.routeVariantNote);
  const familyPrincipalLocations = routeNumbers.length > 1
    ? rows.flatMap(row => row.principalLocations ?? [])
    : [];
  const alternatives = destinationNames([
    ...variantRows.flatMap(row => row.alternateDestinationNames ?? []),
    ...familyPrincipalLocations
  ].filter(destination => !principalEndpoints.has(normal(destination))));
  if (alternatives.length === 1) sentences.push(`Some journeys operate shorter workings to ${alternatives[0]}.`);
  else if (alternatives.length > 1) sentences.push(`Additional journeys and shorter workings serve ${alternatives.slice(0, -1).join(', ')} and ${alternatives.at(-1)}.`);
  else {
    const variantNotes = unique(variantRows.map(row => row.routeVariantNote)).filter(note => !sentences.includes(note));
    sentences.push(...variantNotes);
  }
  return sentences.join(' ') || null;
}

function consolidateOneSidedVariantRows(rows) {
  const mergeRawServiceSummaries = (left = [], right = []) => {
    const merged = [];
    const seen = new Set();
    for (const service of [...left, ...right]) {
      const key = text(service?.id)
        || `${text(service?.routeNumber)}|${text(service?.origin)}|${text(service?.destination)}|${text(service?.direction)}|${(service?.sourceRecordIds ?? []).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(service);
    }
    return Object.freeze(merged);
  };
  const retained = rows.slice();
  const folded = new Map();
  for (const row of retained) folded.set(row, row);
  for (const row of retained) {
    if (plannerOrigin(row) || !plannerDestination(row)) continue;
    const parent = retained
      .filter(candidate => candidate !== row
        && candidate.routeGroupKey === row.routeGroupKey
        && normal(candidate.operator) === normal(row.operator)
        && text(candidate.directionFamily) === text(row.directionFamily)
        && plannerOrigin(candidate)
        && plannerDestination(candidate))
      .sort((left, right) => Number(right.recordActivity || 0) - Number(left.recordActivity || 0)
        || text(left.destination).localeCompare(text(right.destination)))[0];
    if (!parent) continue;
    const current = folded.get(parent);
    const foldedEvidence = unique([
      ...(current.consolidatedSourceRecordIds ?? []),
      text(row.id),
      ...(row.sourceRecordIds ?? []),
      ...(row.variantServiceIds ?? []),
      ...(row.consolidatedSourceRecordIds ?? [])
    ].filter(Boolean));
    folded.set(parent, Object.freeze({
      ...current,
      routeVariantNote: current.routeVariantNote || 'Additional short workings and timetable variants operate.',
      alternateDestinationNames: Object.freeze(unique([...(current.alternateDestinationNames ?? []), plannerDestination(row)])),
      sourceRecordIds: Object.freeze(unique([...(current.sourceRecordIds ?? []), ...(row.sourceRecordIds ?? [])])),
      variantCount: (Number(current.variantCount) || 0) + (Number(row.variantCount) || 0),
      variantServiceIds: Object.freeze(unique([...(current.variantServiceIds ?? []), ...(row.variantServiceIds ?? [])])),
      rawServiceSummaries: mergeRawServiceSummaries(current.rawServiceSummaries, row.rawServiceSummaries),
      consolidatedSourceRecordIds: Object.freeze(foldedEvidence)
    }));
    folded.delete(row);
  }
  return retained.filter(row => folded.has(row)).map(row => folded.get(row));
}

function attachRouteNotes(rows) {
  const groups = new Map();
  rows.forEach((row, index) => { if (!groups.has(row.routeGroupKey)) groups.set(row.routeGroupKey, []); groups.get(row.routeGroupKey).push({ row, index }); });
  const notesFor = row => unique(text(row.serviceNote).split(/(?<=[.!?])\s+(?=[A-Z])/u).map(materialServiceNote).filter(Boolean));
  const sharedTaxonomy = new Set(['School days only.', 'Term-time service.', 'Non-school days only.', 'Circular service.']);
  const updates = new Map();
  for (const group of groups.values()) {
    const rowNotes = group.map(({ row }) => notesFor(row));
    const shared = [...sharedTaxonomy].filter(note => rowNotes.length > 1 && rowNotes.every(notes => notes.includes(note)));
    const hasVariant = group.some(({ row }) => row.routeVariantNote);
    const routeNotes = [...shared];
    const plannerNote = plannerFamilyNote(group.map(({ row }) => row));
    if (plannerNote) routeNotes.push(plannerNote);
    else if (hasVariant) {
      const headlineDestinations = new Set(group.map(({ row }) => normal(plannerDestination(row))));
      const alternatives = destinationNames(group.flatMap(({ row }) => row.alternateDestinationNames ?? [])
        .filter(destination => !headlineDestinations.has(normal(destination))));
      if (alternatives.length === 1) routeNotes.push(`Additional variants and short workings operate, including journeys towards ${alternatives[0]}.`);
      else if (alternatives.length > 1) routeNotes.push(`Additional variants and short workings operate, including journeys towards ${alternatives.slice(0, -1).join(', ')} and ${alternatives.at(-1)}.`);
      else routeNotes.push('Additional short workings and timetable variants operate.');
    }
    group.forEach(({ row, index }, position) => {
      const remainingNotes = notesFor(row).filter(note => !shared.includes(note));
      updates.set(index, { serviceNote: remainingNotes.join(' '), routeGroupNote: position === group.length - 1 ? routeNotes.join(' ') || null : null });
    });
  }
  return rows.map((row, index) => Object.freeze({ ...row, ...(updates.get(index) ?? { routeGroupNote: null }) }));
}

export function buildPlannerBusServiceSummaries(serviceSummaries = [], stops = []) {
  const sourceRecords = serviceSummaries ?? [];
  const plannerRecords = sourceRecords.filter(service => {
    const duplicateOperatorRecord = (!text(service.operator) || /not supplied/i.test(text(service.operator)))
      && sourceRecords.some(candidate => candidate !== service && text(candidate.routeNumber) === text(service.routeNumber) && text(candidate.operator) && !/not supplied/i.test(text(candidate.operator)) && compatibleDirection(candidate, service));
    return !duplicateOperatorRecord;
  });
  const serviceGroups = buildPlannerServiceGroups(plannerRecords, stops);
  const rows = [];
  const componentIndexes = new Map();
  for (const serviceGroup of serviceGroups) {
    const component = serviceGroup.services;
    const routeKey = serviceGroup.routeFamilyKey || routeGroupKey(component[0]);
    const index = componentIndexes.get(routeKey) ?? 0;
    componentIndexes.set(routeKey, index + 1);
    const routeFamilyServices = serviceGroup.routeFamilyServices || plannerRecords.filter(service => routeGroupKey(service) === routeKey);
    const row = buildPlannerRow(component, stops, index, routeFamilyServices);
    // A scheduled component is a planner disposition even when its public
    // endpoint remains unresolved.  Reconciliation is a QA backstop, not a
    // presentation filter: destination uncertainty must be visible as a
    // restrained row rather than silently removing the service.
    rows.push(row);
  }
  const sorted = consolidateOneSidedVariantRows(rows.sort((first, second) => text(first.routeNumber).localeCompare(text(second.routeNumber), undefined, { numeric: true })
    || text(first.operator).localeCompare(text(second.operator))
    || (Number(second.variantCount) || 0) - (Number(first.variantCount) || 0)
    || text(first.directionPatternText).localeCompare(text(second.directionPatternText))
    || text(first.id).localeCompare(text(second.id))));
  return attachRouteNotes(sorted);
}

export const buildPlannerBusServiceSummary = buildPlannerBusServiceSummaries;

function serviceEvidenceKeys(service) {
  return unique([
    text(service?.id),
    ...(service?.sourceRecordIds ?? []),
    ...(service?.sourceRecords ?? []).map(record => record?.id)
  ].filter(Boolean));
}

function rowEvidenceKeys(row) {
  return unique([
    text(row?.id),
    ...(row?.sourceRecordIds ?? []),
    ...(row?.variantServiceIds ?? []),
    ...(row?.consolidatedSourceRecordIds ?? []),
    ...(row?.rawServiceSummaries ?? []).flatMap(serviceEvidenceKeys),
    ...(row?.plannerServiceGroup?.sourceRecordIds ?? [])
  ].filter(Boolean));
}

export function buildPlannerServiceReconciliation(serviceSummaries = [], plannerRows = []) {
  const rows = plannerRows ?? [];
  const entries = (serviceSummaries ?? []).map(service => {
    const sourceKeys = serviceEvidenceKeys(service);
    const row = rows.find(candidate => rowEvidenceKeys(candidate).some(key => sourceKeys.includes(key)));
    if (!row) {
      const destinationResolved = resolvedPlannerDestination(service);
      return Object.freeze({
        status: 'excluded',
        reason: destinationResolved ? 'planner-row-not-built' : 'planner-identity-unresolved',
        sourceSummaryId: text(service?.id) || null,
        sourceRecordIds: Object.freeze(unique(service?.sourceRecordIds ?? [])),
        routeNumber: text(service?.routeNumber) || null,
        destinationResolved,
        plannerRowId: null,
        plannerRouteNumber: null,
        retainedDestinations: Object.freeze([])
      });
    }
    const consolidated = new Set(row.consolidatedSourceRecordIds ?? []);
    const isConsolidated = sourceKeys.some(key => consolidated.has(key));
    return Object.freeze({
      status: isConsolidated ? 'consolidated' : resolvedPlannerDestination(row) ? 'represented' : 'represented-unresolved',
      reason: null,
      sourceSummaryId: text(service?.id) || null,
      sourceRecordIds: Object.freeze(unique(service?.sourceRecordIds ?? [])),
      routeNumber: text(service?.routeNumber) || null,
      destinationResolved: resolvedPlannerDestination(row),
      plannerRowId: text(row?.id) || null,
      plannerRouteNumber: text(row?.routeNumber) || null,
      retainedDestinations: Object.freeze(unique([
        plannerDestination(row),
        ...(row?.alternateDestinationNames ?? [])
      ].filter(Boolean)))
    });
  });
  const sourceRecordIds = unique(entries.flatMap(entry => entry.sourceRecordIds ?? []));
  const excludedSourceRecordIds = new Set(entries.filter(entry => entry.status === 'excluded').flatMap(entry => entry.sourceRecordIds ?? []));
  return Object.freeze({
    sourceServiceCount: entries.length,
    sourceRecordCount: sourceRecordIds.length,
    representedCount: entries.filter(entry => entry.status === 'represented').length,
    consolidatedCount: entries.filter(entry => entry.status === 'consolidated').length,
    excludedCount: entries.filter(entry => entry.status === 'excluded').length,
    representedSourceRecordCount: sourceRecordIds.filter(id => !excludedSourceRecordIds.has(id)).length,
    excludedSourceRecordCount: excludedSourceRecordIds.size,
    // Any source summary that reaches reconciliation without a row is an
    // acceptance failure.  A missing row cannot be excused merely because
    // the destination resolver was the reason it disappeared.
    unexpectedExclusionCount: entries.filter(entry => entry.status === 'excluded').length,
    entries: Object.freeze(entries)
  });
}

export function buildPlannerSummaryAudit(rows = [], expectedRowCounts = {}) {
  const routeNumbers = unique([
    ...Object.keys(expectedRowCounts ?? {}),
    ...(rows ?? []).map(row => row?.routeNumber)
  ]).sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
  const audit = routeNumbers.map(routeNumber => {
    const routeRows = (rows ?? []).filter(row => text(row?.routeNumber) === routeNumber);
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
