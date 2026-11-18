import { operatorFamilyCompatible } from './operator-family.mjs';
import { isUnspecifiedOperator } from './bus-grouping.mjs';

function norm(value) { return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function localCallStopIds(service) {
  return Object.entries(service?.stopSchedules ?? {})
    .filter(([, schedule]) => Object.values(schedule ?? {}).some(values => Array.isArray(values) && values.length))
    .map(([stopId]) => String(stopId))
    .sort();
}

function orderedPhysicalPattern(service) {
  const hasCircularPattern = Array.isArray(service?.circularPatternStopIds) && service.circularPatternStopIds.length > 0;
  const supplied = hasCircularPattern ? service.circularPatternStopIds : service?.routePatternStopIds;
  if (!Array.isArray(supplied) || !supplied.length) return [];
  const pattern = supplied.map(value => String(value ?? '').trim());
  if (pattern.some(value => !value)) return [];
  const normalized = pattern.map(norm);
  if (normalized.some(value => !value)) return [];
  if ((service?.circular === true || hasCircularPattern)
    && normalized.length > 1 && normalized[0] === normalized.at(-1)) normalized.pop();
  return normalized;
}

function explicitDirectionMarker(service) {
  const marker = norm(service?.directionFamily || service?.direction || service?.stopDirection);
  return /^(inbound|outbound|northbound|southbound|eastbound|westbound|clockwise|anticlockwise|north|south|east|west)$/.test(marker) ? marker : '';
}

function orderedSimilarity(first, second) {
  if (!first.length || !second.length) return 0;
  let previous = Array(second.length + 1).fill(0);
  for (const left of first) {
    const current = Array(second.length + 1).fill(0);
    for (let index = 1; index <= second.length; index++) {
      current[index] = left === second[index - 1]
        ? previous[index - 1] + 1
        : Math.max(previous[index], current[index - 1]);
    }
    previous = current;
  }
  return previous.at(-1) / Math.max(first.length, second.length);
}

function endpointTokens(service) {
  const ignored = new Set(['arrivals', 'arrival', 'outbound', 'inbound', 'towards', 'toward', 'to', 'stop', 'platform']);
  return new Set(norm([
    service?.origin, service?.destination, service?.direction,
    service?.source?.tripHeadsign, service?.source?.routeLongName
  ].join(' ')).split(' ').filter(token => token && !ignored.has(token) && !/^\d+[a-z]?$/i.test(token)));
}

function samePublicEndpointContext(first, second) {
  const a = endpointTokens(first);
  const b = endpointTokens(second);
  const subset = (small, large) => small.size >= 2 && [...small].every(token => large.has(token));
  return subset(a, b) || subset(b, a);
}

function compatibleVariants(first, second) {
  const variantsFor = (owner, other) => {
    const variants = owner?.patternVariants ?? [];
    if (!Array.isArray(variants)) return false;
    if (!variants.length) return true;
    const otherPattern = orderedPhysicalPattern(other);
    if (!otherPattern.length) return false;
    return variants.every(variant => {
      const path = Array.isArray(variant?.routePatternStopIds)
        ? variant.routePatternStopIds.map(value => norm(value)).filter(Boolean)
        : [];
      if (!path.length) return false;
      const exact = path.length === otherPattern.length
        && path.every((stopId, index) => stopId === otherPattern[index]);
      const nearSameCorridor = Math.max(path.length, otherPattern.length) >= 12
        && orderedSimilarity(path, otherPattern) >= 0.92
        && samePublicEndpointContext(owner, other);
      if (!exact && !nearSameCorridor) return false;
      const ownerCalendar = norm(variant?.calendarProfileId || variant?.operatingProfile?.calendarProfileId);
      const otherCalendar = norm(other?.calendarProfileId || other?.source?.calendarProfileId);
      return !(ownerCalendar && otherCalendar && ownerCalendar !== otherCalendar);
    });
  };
  return variantsFor(first, second) && variantsFor(second, first);
}

function schedulesDifferAtSharedStops(first, second) {
  const firstSchedules = first?.stopSchedules ?? {};
  const secondSchedules = second?.stopSchedules ?? {};
  const sharedStopIds = Object.keys(firstSchedules).filter(id => Object.hasOwn(secondSchedules, id));
  return sharedStopIds.some(id => Object.keys(firstSchedules[id] ?? {}).some(day =>
    JSON.stringify([...(firstSchedules[id]?.[day] ?? [])].map(Number).sort((a, b) => a - b))
      !== JSON.stringify([...(secondSchedules[id]?.[day] ?? [])].map(Number).sort((a, b) => a - b))));
}

function sameTndsSourceService(first, second) {
  const firstArchive = norm(first?.source?.archive);
  const secondArchive = norm(second?.source?.archive);
  const firstCode = norm(first?.source?.serviceCode);
  const secondCode = norm(second?.source?.serviceCode);
  return Boolean(firstArchive && firstCode && firstArchive === secondArchive && firstCode === secondCode);
}

function mergeTndsPatternRecord(target, incoming) {
  target.stopSchedules ??= {};
  for (const [stopId, schedule] of Object.entries(incoming.stopSchedules ?? {})) {
    target.stopSchedules[stopId] ??= {};
    for (const [day, values] of Object.entries(schedule ?? {})) {
      const current = target.stopSchedules[stopId][day] ?? [];
      const byValue = new Map([...current, ...(values ?? [])].map(value => [JSON.stringify(value), value]));
      target.stopSchedules[stopId][day] = [...byValue.values()].sort((left, right) => {
        const a = Number(typeof left === 'object' ? left?.minute ?? left?.time : left);
        const b = Number(typeof right === 'object' ? right?.minute ?? right?.time : right);
        return Number.isFinite(a) && Number.isFinite(b) ? a - b : 0;
      });
    }
  }
  target.departureEvidenceByDay ??= {};
  for (const [day, entries] of Object.entries(incoming.departureEvidenceByDay ?? {})) {
    const current = target.departureEvidenceByDay[day] ?? [];
    const identity = item => typeof item === 'object' && item
      ? [item.sourceRecordId, item.journeyIdentity, item.stopPointId, item.minute].map(value => String(value ?? '')).join('|')
      : JSON.stringify(item);
    target.departureEvidenceByDay[day] = [...new Map([...current, ...(entries ?? [])].map(item => [identity(item), item])).values()];
  }
  for (const key of ['calendarEvidence', 'operatingCalendarEvidence', 'frequencyEvidence', 'operatingPeriodEvidence', 'patternVariants', 'serviceNotes', 'qualifications']) {
    const current = target[key] ?? [];
    const incomingValues = incoming[key] ?? [];
    if (current.length || incomingValues.length) target[key] = [...new Map([...current, ...incomingValues].map(value => [JSON.stringify(value), value])).values()];
  }
  target.sourceRecordIds = [...new Set([...(target.sourceRecordIds ?? [target.id]), ...(incoming.sourceRecordIds ?? [incoming.id])].map(String).filter(Boolean))];
  if (target.source && incoming.source) {
    const patternIds = [...new Set([...(target.source.patternIds ?? []), ...(incoming.source.patternIds ?? [])].map(String).filter(Boolean))];
    target.source = { ...target.source, patternIds, patternVariantCount: Math.max(Number(target.source.patternVariantCount) || 0, Number(incoming.source.patternVariantCount) || 0) };
  }
}

/**
 * Conservative site-scoped equivalence for BODS/TNDS arbitration.
 * A public route number is only a candidate bucket: the local called StopPoints,
 * operator family and positive ordered physical corridor evidence must also agree.
 */
export function equivalentLocalServiceFamily(first, second) {
  const route = norm(first?.routeNumber);
  if (!route || route !== norm(second?.routeNumber)) return false;
  if (isUnspecifiedOperator(first?.operator) || isUnspecifiedOperator(second?.operator)
    || !operatorFamilyCompatible(first, second)) return false;

  const firstStops = localCallStopIds(first);
  const secondStops = localCallStopIds(second);
  const a = orderedPhysicalPattern(first);
  const b = orderedPhysicalPattern(second);
  const identicalLocalCoverage = firstStops.length > 0 && firstStops.length === secondStops.length
    && firstStops.every((stopId, index) => stopId === secondStops[index]);
  const sameCorridorStops = firstStops.length > 0 && secondStops.length > 0
    && firstStops.some(stopId => secondStops.includes(stopId))
    && firstStops.every(stopId => b.includes(norm(stopId)))
    && secondStops.every(stopId => a.includes(norm(stopId)));
  if (!identicalLocalCoverage && !sameCorridorStops) return false;

  if (typeof first?.circular === 'boolean' && typeof second?.circular === 'boolean'
    && first.circular !== second.circular) return false;
  if (!compatibleVariants(first, second)) return false;

  if (!a.length || !b.length) return false;
  const exactPattern = a.length === b.length && a.every((stopId, index) => stopId === b[index]);
  if (!exactPattern) {
    const nearSameCorridor = Math.max(a.length, b.length) >= 12
      && orderedSimilarity(a, b) >= 0.92
      && samePublicEndpointContext(first, second);
    if (!nearSameCorridor) return false;
  }

  const firstCalendar = norm(first?.calendarProfileId || first?.source?.calendarProfileId);
  const secondCalendar = norm(second?.calendarProfileId || second?.source?.calendarProfileId);
  if (firstCalendar && secondCalendar && firstCalendar !== secondCalendar) return false;

  const firstDirection = explicitDirectionMarker(first);
  const secondDirection = explicitDirectionMarker(second);
  return !(firstDirection && secondDirection && firstDirection !== secondDirection);
}

export function mergeBusTimetableSources({ bods = [], tnds = [] } = {}) {
  const result = [...bods].map(service => ({ ...service, timetableSource: 'BODS' }));
  const retainedTnds = [];
  for (const service of tnds) {
    const equivalent = result.find(candidate => equivalentLocalServiceFamily(candidate, service));
    if (equivalent) {
      const provider = String(service.timetableSource || service.source?.provider || 'TNDS').trim();
      const sourceRecord = Object.freeze({
        provider,
        id: String(service.id ?? '').trim() || null,
        lineId: String(service.source?.lineId ?? service.lineId ?? '').trim() || null,
        routeId: String(service.source?.routeId ?? service.routeId ?? '').trim() || null,
        directionId: String(service.source?.directionId ?? service.directionId ?? '').trim() || null,
        patternId: String(service.source?.patternId ?? service.patternId ?? '').trim() || null,
        calendarProfileId: String(service.calendarProfileId ?? service.source?.calendarProfileId ?? '').trim() || null,
        operator: String(service.operator ?? '').trim() || null
      });
      const hasScheduleVariation = schedulesDifferAtSharedStops(equivalent, service);
      equivalent.sourceRecordIds = [...new Set([...(equivalent.sourceRecordIds ?? [equivalent.id]), ...(service.sourceRecordIds ?? [service.id])].map(String).filter(Boolean))];
      equivalent.sourceProviders = [...new Set([...(equivalent.sourceProviders ?? ['BODS']), provider])];
      equivalent.sourceAuthorities = [...new Set([...(equivalent.sourceAuthorities ?? ['BODS']), provider])];
      equivalent.supplementarySourceRecords = [...(equivalent.supplementarySourceRecords ?? []), sourceRecord];
      if (hasScheduleVariation) {
        const note = 'Supplementary timetable variants are retained in source provenance; the BODS departure population remains primary and is not double-counted.';
        equivalent.serviceNotes = [...new Set([...(equivalent.serviceNotes ?? []), note])];
      }
      continue;
    }
    const retainedEquivalent = retainedTnds.find(candidate => equivalentLocalServiceFamily(candidate, service));
    const exactPattern = retainedEquivalent
      && JSON.stringify(orderedPhysicalPattern(retainedEquivalent)) === JSON.stringify(orderedPhysicalPattern(service));
    const compatibleCalendar = retainedEquivalent
      && !(norm(retainedEquivalent.calendarProfileId || retainedEquivalent.source?.calendarProfileId)
        && norm(service.calendarProfileId || service.source?.calendarProfileId)
        && norm(retainedEquivalent.calendarProfileId || retainedEquivalent.source?.calendarProfileId) !== norm(service.calendarProfileId || service.source?.calendarProfileId));
    if (retainedEquivalent && sameTndsSourceService(retainedEquivalent, service) && exactPattern && compatibleCalendar) {
      mergeTndsPatternRecord(retainedEquivalent, service);
      continue;
    }
    // Different TNDS records can share a route, operator and corridor while
    // carrying distinct journeys or calendars. Keep those records for the
    // planner to reconcile instead of dropping their departure populations.
    retainedTnds.push({ ...service, timetableSource: 'TNDS', stopSchedules: structuredClone(service.stopSchedules ?? {}), departureEvidenceByDay: structuredClone(service.departureEvidenceByDay ?? {}) });
  }
  return Object.freeze([...result, ...retainedTnds]);
}
