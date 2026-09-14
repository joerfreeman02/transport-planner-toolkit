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

export const PLANNER_METHODOLOGY_NOTE = 'Frequency and operating periods are derived from scheduled departures at the closest timetable-evidenced served stop (the representative stop), marked “(timetable basis)”. Other served stops remain listed for completeness. Additional source evidence remains available in the ATLAS assessment workspace.';

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

function connectedServiceComponents(services) {
  const compatiblePairs = new Set();
  for (let left = 0; left < services.length; left += 1) {
    for (let right = left + 1; right < services.length; right += 1) {
      if (!compatibleDirection(services[left], services[right])) continue;
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
  const components = [];
  const visited = new Set();
  for (let start = 0; start < services.length; start += 1) {
    if (visited.has(start)) continue;
    const queue = [start];
    const component = [];
    visited.add(start);
    while (queue.length) {
      const current = queue.shift();
      component.push(services[current]);
      for (let candidate = 0; candidate < services.length; candidate += 1) {
        if (visited.has(candidate) || candidate === current) continue;
        const pair = current < candidate ? `${current}:${candidate}` : `${candidate}:${current}`;
        if (!compatiblePairs.has(pair)) continue;
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
    components.push(component);
  }
  return components;
}

function compatibleDirection(first, second) {
  // Operator and feed identity are evidence fields, not public direction
  // identity.  The same route-direction can therefore be represented by
  // more than one current operator or prepared feed.
  if (reverseEndpointRelationship(first, second)) return false;
  const leftEndpoints = endpointPair(first), rightEndpoints = endpointPair(second);
  if (leftEndpoints.origin && leftEndpoints.destination && rightEndpoints.origin && rightEndpoints.destination) {
    if (leftEndpoints.origin === rightEndpoints.origin || leftEndpoints.destination === rightEndpoints.destination) {
      const leftMarker = explicitDirectionMarker(first);
      const rightMarker = explicitDirectionMarker(second);
      // A feed's direction marker is useful within one operator/lineage, but
      // it is not globally stable: the deployed 242 evidence reverses the
      // marker convention between Uno and Central Connect.  Do not let a
      // same-operator marker conflict bridge the two public directions.
      if (leftMarker && rightMarker && leftMarker !== rightMarker && operatorFamilyCompatible(first, second)) return false;
      const exactEndpointPair = leftEndpoints.origin === rightEndpoints.origin && leftEndpoints.destination === rightEndpoints.destination;
      const corridorEvidence = exactEndpointPair
        || sameServiceLineage(first, second)
        || provenPatternRelationship(first, second)
        || sharedPatternValues(first, second).size > 0
        || (sameServiceLineage(first, second) && sharedCorridorNames(first, second).size > 0)
        || sharedStopIds(first, second).size >= 2;
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
  if (text(service?.frequencyBasisStopId) === stop && DAY_ORDER.some(day => (service?.departuresByDay?.[day] ?? []).length || (service?.departureEvidenceByDay?.[day] ?? []).length)) return true;
  return DAY_ORDER.some(day => (service?.departureEvidenceByDay?.[day] ?? []).some(item => !text(item?.stopPointId) || text(item.stopPointId) === stop));
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
  return (service?.stopIds ?? []).map(text).includes(representativeId);
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
  return component.flatMap(service => (service.frequencyEvidence ?? [])
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
  return component.flatMap(service => (service.frequencyEvidence ?? []).filter(item => !item.stopPointId || text(item.stopPointId) === representativeId));
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
  const destination = text(service?.destination);
  return destination && !/^(?:destination not supplied|destination not resolved)$/i.test(destination) && !sourceDirectionMarker(destination)
    ? destination
    : '';
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

function variantNote(component, main) {
  const endpoints = unique(component.map(service => text(service.origin) + ' → ' + text(service.destination)));
  const patterns = unique(component.map(service => explicitPattern(service).map(text).join('>')).filter(Boolean));
  const journeyIdentitySets = component.map(service => new Set(DAY_ORDER.flatMap(day => (service.departureEvidenceByDay?.[day] ?? []).map(item => departureIdentity(item)).filter(Boolean))));
  const sharedJourneyIdentity = journeyIdentitySets.length > 1 && journeyIdentitySets.every(set => set.size) && [...journeyIdentitySets[0]].some(identity => journeyIdentitySets.every(set => set.has(identity)));
  const alternatives = alternateDestinations(component, main);
  const hasVariant = component.length > 1 && ((endpoints.length > 1 && !sharedJourneyIdentity) || patterns.length > 1 || component.some(service => Number(service.patternVariantCount) > 1));
  if (!hasVariant) return null;
  if (alternatives.length === 1) return `Additional variants and short workings operate, including journeys towards ${alternatives[0]}.`;
  if (alternatives.length > 1) return `Additional variants and short workings operate, including journeys towards ${alternatives.slice(0, -1).join(', ')} and ${alternatives.at(-1)}.`;
  return 'Additional short workings and timetable variants operate.';
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
  if (!resolvedPlannerDestination(service)) warnings.push(`Route ${route} — one timetable pattern could not be assigned a complete route identity. The scheduled evidence is retained under Detailed Evidence and is not presented as a separate planner service.`);
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
  return `${name}${indicator ? ` — ${indicator}` : ''}${suffix}${basis ? ' (timetable basis)' : ''}`;
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
function buildPlannerServiceGroup(component, stops, main, representative) {
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
    serviceIdentity: `${routeGroupKey(main)}|${publicDirectionIdentity(component, main)}|${endpointIdentity}`,
    routeNumber: text(main?.routeNumber) || 'Not supplied',
    publicDirection: publicDirectionIdentity(component, main),
    principalDestination: plannerDestination(main) || null,
    principalOrigin: text(main?.origin) || null,
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
    services: Object.freeze(component),
    sourceServiceCount: component.length,
    alternateDestinations: Object.freeze(alternateDestinations(component, main)),
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
  const grouped = new Map();
  for (const service of serviceSummaries ?? []) {
    const key = routeGroupKey(service);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(service);
  }
  return [...grouped.entries()].flatMap(([routeKey, services]) => connectedServiceComponents(services).map(component => {
    const representative = selectRepresentativeStop(component, stops);
    const main = [...component].sort((first, second) => compareMain(first, second, representative.id, component))[0];
    return buildPlannerServiceGroup(component, stops, main, representative);
  }));
}

function profileLines(lines, profileLabel) {
  if (!profileLabel) return lines;
  return lines.map(line => line.replace(/^([^:]+):\s*/, `$1 (${profileLabel}): `));
}

function buildPlannerRow(component, stops, componentIndex, routeFamilyServices = component) {
  const representative = selectRepresentativeStop(component, stops);
  const main = [...component].sort((first, second) => compareMain(first, second, representative.id, component))[0];
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
  const displayProfileId = effectiveProfileIds.includes('ordinary') ? 'ordinary' : effectiveProfileIds[0] ?? profileIds[0] ?? UNKNOWN_CALENDAR_PROFILE;
  const displayResult = profileResults.get(displayProfileId) ?? calculateProfileResult(component, representative.id, displayProfileId, { entries: [], schedules: emptySchedule() });
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
    frequencyLines = profileLines(displayFrequencyLines, calendarProfileLabel(displayProfileId));
    operatingLines = profileLines(displayOperatingLines, calendarProfileLabel(displayProfileId));
  }
  const calendarProfileId = profileIds.length === 1 ? profileIds[0] : null;
  const calendarProfile = calendarProfileLabel(calendarProfileId);
  const profileNotes = [];
  if (mixedProfileOutput) profileNotes.push('Calendar profile variation is shown as profile-qualified frequency and operating-period lines within this route-direction row.');
  if (unresolvedNeedsQualification) profileNotes.push('Some timetable evidence has unresolved calendar applicability; it is retained for review and is not combined with resolved service levels.');
  const notes = unique(component.flatMap(service => text(service.serviceNote).split(/(?<=[.!?])\s+(?=[A-Z])/u).map(materialServiceNote).filter(Boolean)))
    .filter(note => noteAppliesToCanonicalPopulation(note, displayResult.schedules))
    .filter(note => !(mixedProfileOutput && hasCalendarTaxonomyNote(note)));
  notes.push(...profileNotes);
  const ids = unique(component.flatMap(service => service.sourceRecordIds ?? []));
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
    operator: plannerServiceGroup.operatorNames.join(' · ') || 'Operator not supplied in the timetable',
    origin: text(main.origin) || 'Origin not supplied',
    destination: text(main.destination) || 'Destination not supplied',
    direction: text(main.direction),
    stopDirection: text(main.stopDirection) || null,
    circular: rowCircular,
    calendarProfileId,
    calendarProfileLabel: calendarProfile,
    calendarProfileIds: Object.freeze(profileIds),
    calendarProfileLabels: Object.freeze(profileIds.map(calendarProfileDisplayLabel)),
    directionFamily: directionKey(main),
    directionPatternText: directionPatternText({ ...main, circular: rowCircular }),
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
    stopIds: Object.freeze(servedStopIds.length ? servedStopIds : (representative.id ? [representative.id] : unique(component.flatMap(service => service.stopIds ?? [])))),
    sourceRecordIds: Object.freeze(ids),
    variantCount: component.length,
    variantServiceIds: Object.freeze(unique(component.map(service => service.id))),
    routePatternExtent: Math.max(0, ...component.map(service => Number(service.routePatternExtent) || explicitPattern(service).length)),
    routePatternStops: Object.freeze([...(main.routePatternStops ?? [])]),
    recordActivity: Math.max(0, ...component.map(service => Number(service.recordActivity) || 0)),
    presentation: Object.freeze({ principalLocationsText: principalText(main), rank: 0 }),
    rawServiceSummaries: Object.freeze(component),
    plannerServiceGroup,
    operatorRawNames: plannerServiceGroup.rawOperatorNames,
    operatorIdentities: plannerServiceGroup.operatorIdentities,
    sourceSelection: canonical.eligible.length ? 'representative-stop scheduled evidence' : 'representative-stop summary fallback',
    routeVariantNote: variantNote(component, main),
    alternateDestinationNames: Object.freeze(alternateDestinations(component, main)),
    sourceWarnings: Object.freeze(unique(component.flatMap(service => service.sourceWarnings ?? [])))
  };
  return Object.freeze(row);
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
    if (hasVariant) {
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
    const routeKey = routeGroupKey(component[0]);
    const index = componentIndexes.get(routeKey) ?? 0;
    componentIndexes.set(routeKey, index + 1);
    const routeFamilyServices = plannerRecords.filter(service => routeGroupKey(service) === routeKey);
    const row = buildPlannerRow(component, stops, index, routeFamilyServices);
    if (resolvedPlannerDestination(row)) rows.push(row);
  }
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
