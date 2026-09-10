function numericDeparture(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || !value.trim()) return false;
  return Number.isFinite(Number(value));
}

/**
 * A schedule key is evidence only when at least one day contains a real
 * departure value. The presence of a StopPoint key or an empty day map is
 * deliberately insufficient.
 */
export function hasScheduledEvidence(schedule = {}) {
  return Object.values(schedule ?? {}).some(day => Array.isArray(day) && day.some(numericDeparture));
}

export function hasScheduledEvidenceAt(service = {}, stopPointId) {
  return hasScheduledEvidence(service.stopSchedules?.[String(stopPointId ?? '')]);
}

export function scheduledStopIds(service = {}) {
  return Object.entries(service.stopSchedules ?? {})
    .filter(([, schedule]) => hasScheduledEvidence(schedule))
    .map(([stopPointId]) => stopPointId);
}

export function scopedScheduledService(service = {}, stopPointIds = []) {
  const allowed = new Set([...stopPointIds].map(value => String(value ?? '')).filter(Boolean));
  const stopSchedules = Object.fromEntries(Object.entries(service.stopSchedules ?? {})
    .filter(([stopPointId, schedule]) => allowed.has(stopPointId) && hasScheduledEvidence(schedule)));
  return { ...service, stopSchedules };
}

/**
 * Derive the only defensible conclusion for a selected timetable scope.
 * Actual evidence wins; without it, any completeness blocker prevents a
 * zero-service conclusion. Callers may assert NO_CURRENT_MATCH only after
 * every relevant evidence path has explicitly and successfully done so.
 */
export function deriveTimetableConclusion({
  hasScheduledService = false,
  explicitNoCurrentMatch = false,
  unresolvedRequestIdentities = [],
  unprocessedRequestIdentities = [],
  unprocessedRequests = 0,
  nationalSourceAvailable = true,
  nationalUnresolvedRoutes = [],
  failedRequests = 0,
  unavailable = false,
  semanticUnresolved = false,
  quarantine = false
} = {}) {
  if (hasScheduledService) return 'MATCHED';
  const unresolved = Array.isArray(unresolvedRequestIdentities) ? unresolvedRequestIdentities : [];
  const unprocessed = Array.isArray(unprocessedRequestIdentities) ? unprocessedRequestIdentities : [];
  const unresolvedRoutes = Array.isArray(nationalUnresolvedRoutes) ? nationalUnresolvedRoutes : [];
  const blocked = unavailable
    || semanticUnresolved
    || quarantine
    || Number(failedRequests) > 0
    || Number(unprocessedRequests) > 0
    || nationalSourceAvailable === false
    || unresolved.length > 0
    || unprocessed.length > 0
    || unresolvedRoutes.length > 0;
  if (blocked) return 'UNRESOLVED';
  return explicitNoCurrentMatch ? 'NO_CURRENT_MATCH' : 'UNRESOLVED';
}
