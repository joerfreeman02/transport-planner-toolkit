import { isGreaterLondonPoint } from '../domain/geography.mjs';

export function createBusStopDiscovery({ tflAdapter, naptanAdapter, londonCoverage = isGreaterLondonPoint } = {}) {
  if (!tflAdapter?.nearbyStops || !naptanAdapter?.nearbyStops) throw new Error('TfL and NaPTAN bus-stop adapters are required.');

  async function nearbyStops(site, options = {}) {
    const provider = londonCoverage(site) ? tflAdapter : naptanAdapter;
    const result = await provider.nearbyStops(site, options);
    if (!result?.provenance) return result;
    return Object.freeze({
      ...result,
      provenance: Object.freeze({
        ...result.provenance,
        providerSelectedBy: 'Confirmed assessment point checked against the official Greater London boundary',
        providerAdapter: provider.id
      })
    });
  }

  return Object.freeze({ id: 'authoritative-bus-stop-discovery-v1', nearbyStops });
}
