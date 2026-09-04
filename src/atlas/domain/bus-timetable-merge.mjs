function norm(value) { return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function stops(service) { return Object.keys(service?.stopSchedules ?? {}).sort().join(','); }
export function servicePatternFingerprint(service = {}) {
  return [norm(service.routeNumber), norm(service.operator), norm(service.direction || service.destination || service.origin), stops(service), norm(service.origin), norm(service.destination)].join('|');
}
export function mergeBusTimetableSources({ bods = [], tnds = [] } = {}) {
  const result = [...bods].map(service => ({ ...service, timetableSource: 'BODS' }));
  const seen = new Set(result.map(servicePatternFingerprint));
  for (const service of tnds) {
    const fingerprint = servicePatternFingerprint(service);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push({ ...service, timetableSource: 'TNDS' });
  }
  return Object.freeze(result);
}
