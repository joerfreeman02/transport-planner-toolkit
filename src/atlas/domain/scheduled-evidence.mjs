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
