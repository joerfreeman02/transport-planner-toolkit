function norm(value) { return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function localCallStopIds(service) {
  return Object.entries(service?.stopSchedules ?? {})
    .filter(([, schedule]) => Object.values(schedule ?? {}).some(values => Array.isArray(values) && values.length))
    .map(([stopId]) => String(stopId))
    .sort();
}

function localDirectionEvidence(service) {
  const origin = norm(service?.origin);
  const destination = norm(service?.destination);
  const direction = norm(service?.directionFamily || service?.direction || service?.stopDirection);
  return { origin, destination, direction };
}

/**
 * Conservative site-scoped equivalence for BODS/TNDS arbitration.
 * A public route number is only a candidate bucket: the local called StopPoints,
 * operator and positive direction/corridor evidence must also agree.
 */
export function equivalentLocalServiceFamily(first, second) {
  const route = norm(first?.routeNumber);
  if (!route || route !== norm(second?.routeNumber)) return false;
  const operator = norm(first?.operator);
  if (!operator || operator !== norm(second?.operator)) return false;

  const firstStops = localCallStopIds(first);
  const secondStops = localCallStopIds(second);
  if (!firstStops.length || firstStops.length !== secondStops.length
    || firstStops.some((stopId, index) => stopId !== secondStops[index])) return false;

  if (typeof first?.circular === 'boolean' && typeof second?.circular === 'boolean'
    && first.circular !== second.circular) return false;

  const a = localDirectionEvidence(first);
  const b = localDirectionEvidence(second);
  if (a.origin && a.destination && b.origin && b.destination) {
    if (a.origin !== b.origin || a.destination !== b.destination) return false;
    if (a.direction && b.direction && a.direction !== b.direction) return false;
    return true;
  }
  return Boolean(a.direction && b.direction && a.direction === b.direction);
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
