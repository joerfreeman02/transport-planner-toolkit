import { isOtherNearbyStopRecord } from '../domain/bus-source-presentation.mjs';

function stableStopIdentity(stop) {
  return [stop?.id, stop?.sourceId, stop?.name, stop?.displayDirection, stop?.indicator, stop?.latitude, stop?.longitude]
    .map(value => String(value ?? '').trim())
    .join('|');
}

export function numberedStopsForPresentation(stops) {
  const ordered = [...(stops ?? [])].sort((left, right) => {
    const leftOther = isOtherNearbyStopRecord(left);
    const rightOther = isOtherNearbyStopRecord(right);
    if (leftOther !== rightOther) return leftOther ? 1 : -1;
    return stableStopIdentity(left).localeCompare(stableStopIdentity(right), 'en-GB', { numeric: true, sensitivity: 'base' });
  });
  return ordered.map((stop, index) => ({ ...stop, mapReference: String(index + 1), mapReferenceIndex: index }));
}

export function numberedServicesForPresentation(services, sourceStops, numberedStops = numberedStopsForPresentation(sourceStops)) {
  const references = new Map();
  for (const stop of sourceStops ?? []) {
    const numbered = numberedStops.find(candidate => String(candidate.id ?? candidate.sourceId ?? '') === String(stop.id ?? stop.sourceId ?? ''));
    if (stop.mapReference && numbered) references.set(String(stop.mapReference), numbered.mapReference);
  }
  const escapedReferences = [...references.keys()].sort((left, right) => right.length - left.length).map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escapedReferences.length) return [...(services ?? [])];
  const pattern = new RegExp(`\\[(${escapedReferences.join('|')})\\]`, 'gu');
  return (services ?? []).map(service => ({
    ...service,
    servedAtText: String(service.servedAtText ?? '').replace(pattern, (_match, reference) => `[${references.get(reference)}]`)
  }));
}
