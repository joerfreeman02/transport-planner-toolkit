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

function compatibleVariants(first, second) {
  const a = first?.patternVariants ?? [];
  const b = second?.patternVariants ?? [];
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (!a.length && !b.length) return true;
  return JSON.stringify(a) === JSON.stringify(b);
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
  if (!firstStops.length || firstStops.length !== secondStops.length
    || firstStops.some((stopId, index) => stopId !== secondStops[index])) return false;

  if (typeof first?.circular === 'boolean' && typeof second?.circular === 'boolean'
    && first.circular !== second.circular) return false;
  if (!compatibleVariants(first, second)) return false;

  const a = orderedPhysicalPattern(first);
  const b = orderedPhysicalPattern(second);
  if (!a.length || a.length !== b.length || a.some((stopId, index) => stopId !== b[index])) return false;

  const firstDirection = explicitDirectionMarker(first);
  const secondDirection = explicitDirectionMarker(second);
  return !(firstDirection && secondDirection && firstDirection !== secondDirection);
}

export function mergeBusTimetableSources({ bods = [], tnds = [] } = {}) {
  const result = [...bods].map(service => ({ ...service, timetableSource: 'BODS' }));
  const retainedTnds = [];
  for (const service of tnds) {
    if (result.some(candidate => equivalentLocalServiceFamily(candidate, service))) continue;
    if (retainedTnds.some(candidate => equivalentLocalServiceFamily(candidate, service))) continue;
    retainedTnds.push({ ...service, timetableSource: 'TNDS' });
  }
  return Object.freeze([...result, ...retainedTnds]);
}
