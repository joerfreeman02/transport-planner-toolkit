import { isOtherNearbyStopRecord } from '../domain/bus-source-presentation.mjs';

function stopId(stop) { return String(stop?.id || stop?.sourceId || ''); }

/**
 * Assign deterministic numeric references to a presentation copy only.
 * The canonical assessment result and its accepted service composition remain untouched.
 */
export function withNumericMapReferences(result, { referenceStops = result?.stops ?? [] } = {}) {
  if (!result) return result;
  const orderedAll = referenceStops ?? [];
  const ordered = [...orderedAll.filter(stop => !isOtherNearbyStopRecord(stop)), ...orderedAll.filter(isOtherNearbyStopRecord)];
  const byStopId = new Map();
  const byPreviousReference = new Map();
  ordered.forEach((stop, index) => {
    const reference = String(index + 1);
    const id = stopId(stop);
    if (id) byStopId.set(id, reference);
    if (stop?.mapReference) byPreviousReference.set(String(stop.mapReference), reference);
  });
  const remapLabel = value => String(value ?? '').replace(/\s*\[([A-Z]+|\d+)\]/gu, (match, oldReference) => {
    const reference = byPreviousReference.get(oldReference);
    return reference ? ` [${reference}]` : '';
  });
  const stops = (result.stops ?? []).map(stop => {
    const reference = byStopId.get(stopId(stop));
    return reference ? { ...stop, originalMapReference: stop.originalMapReference ?? stop.mapReference ?? null, mapReference: reference, displayMapReference: reference } : { ...stop };
  });
  const serviceRows = result.plannerServiceSummaries?.map(service => ({
    ...service,
    servedAtText: remapLabel(service.servedAtText),
    servedAtStops: service.servedAtStops?.map(remapLabel),
    timetableBasisStopLabel: remapLabel(service.timetableBasisStopLabel),
    servedStopEvidence: service.servedStopEvidence?.map(stop => {
      const reference = byStopId.get(String(stop.id ?? ''));
      if (!reference) return { ...stop, mapReference: null, label: remapLabel(stop.label) };
      return { ...stop, mapReference: reference, label: remapLabel(stop.label).replace(/\[[^\]]+\]/u, `[${reference}]`) };
    })
  }));
  return { ...result, stops, ...(serviceRows ? { plannerServiceSummaries: serviceRows } : {}) };
}
