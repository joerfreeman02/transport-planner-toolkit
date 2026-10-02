import fs from 'node:fs';

const baseline = JSON.parse(fs.readFileSync(new URL('./alpha15-waltham-cross-production.json', import.meta.url), 'utf8'));
const DAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const ordinaryWeek = Object.freeze(Object.fromEntries(DAYS.map(day => [day, day === 'sunday' ? [] : [420]])));

function endpoint(place, stopPointId, stopAreaId, exact = true) {
  return {
    chosen: place,
    chosenDisplayName: place,
    decisionType: exact ? 'exact-endpoint-resolved' : 'unresolved-review',
    exact,
    exactEvidence: exact,
    ...(exact ? {
      primaryEndpointStopPointId: stopPointId,
      endpointStopPointId: stopPointId,
      endpointStopPointIds: [stopPointId],
      stopArea: { id: stopAreaId, name: place },
      stopAreas: [{ id: stopAreaId, name: place }],
      evidence: { endpointEvidenceSet: [{ endpointStopPointId: stopPointId }] }
    } : {})
  };
}

function service({
  id,
  routeNumber,
  operator,
  provider = 'BODS',
  origin,
  destination,
  direction = destination,
  directionFamily = 'outbound',
  originStopPointId = '210021703430',
  destinationStopPointId = '1500IM358',
  stopIds = [originStopPointId],
  pattern = stopIds,
  departures = ordinaryWeek,
  calendarProfileId = 'ordinary',
  circular = false,
  sourceRouteIds = [`line-${routeNumber}`],
  exactEndpoints = true,
  principalLocations = ['Waltham Cross'],
  serviceNote = ''
} = {}) {
  const departureEvidenceByDay = Object.fromEntries(DAYS.map(day => [day, (departures[day] ?? []).map((minute, index) => ({
    minute,
    journeyIdentity: `${id}-${day}-${index}`,
    stopPointId: stopIds[0],
    provider
  }))]));
  return {
    id,
    routeNumber,
    operator,
    provider,
    source: { provider },
    timetableSource: provider,
    origin,
    destination,
    direction,
    directionFamily,
    originStopPointId,
    destinationStopPointId,
    originStopPointIds: [originStopPointId],
    destinationStopPointIds: [destinationStopPointId],
    originEndpointDecision: endpoint(origin, originStopPointId, `area:${origin.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`, exactEndpoints),
    destinationEndpointDecision: endpoint(destination, destinationStopPointId, `area:${destination.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`, exactEndpoints),
    routePatternStopIds: pattern,
    routePatternStops: pattern.map(value => ({ id: value, name: value })),
    routePatternExtent: pattern.length,
    sourceRouteIds,
    principalLocations,
    calendarProfileId,
    circular,
    departuresByDay: departures,
    departureEvidenceByDay,
    recordActivity: 10,
    frequencyBasisStopId: stopIds[0],
    frequencyEvidence: [],
    sourceRecordIds: [id],
    serviceNote,
    sourceWarnings: []
  };
}

const W = '210021703430';
const W2 = '210021703460';
const N = '210021703425';
const E = '1500IM358';

const services = [
  service({ id: 'w-13', routeNumber: '13', operator: 'Central Connect', origin: 'Bus Station', destination: 'The Talbot', directionFamily: 'gtfs:0', stopIds: [W, W2], pattern: [W, W2, E] }),
  service({ id: 'w-13a', routeNumber: '13A', operator: 'Central Connect', origin: 'Bus Station', destination: "St Margaret's Hospital", directionFamily: 'gtfs:0', stopIds: [W, W2], pattern: [W, W2, '1500IM352'] }),
  service({ id: 'w-13b', routeNumber: '13B', operator: 'Central Connect', origin: 'Bus Station', destination: 'Princesfield Rd', directionFamily: 'gtfs:0', stopIds: [W, W2], pattern: [W, W2, '1500IM397'] }),
  service({ id: 'w-13c', routeNumber: '13C', operator: 'Central Connect', origin: 'Bus Station', destination: 'Two Brewers', directionFamily: 'gtfs:0', stopIds: [W, W2], pattern: [W, W2, '1500IM1037'] }),
  service({ id: 'w-14', routeNumber: '14', operator: 'Central Connect', origin: 'Bus Station', destination: 'Princesfield Rd', directionFamily: 'gtfs:0' }),
  service({ id: 'w-15', routeNumber: '15', operator: 'Central Connect', origin: 'Bus Station', destination: 'Temp Bus Station', directionFamily: 'gtfs:0' }),
  service({ id: 'w-15a', routeNumber: '15A', operator: 'Central Connect', origin: 'Bus Station', destination: 'Temp Bus Station', directionFamily: 'gtfs:0' }),
  service({ id: 'w-16', routeNumber: '16', operator: 'Central Connect', origin: 'Loop', destination: 'Loop', directionFamily: 'clockwise', stopIds: [W, W2], pattern: [W, W2, W], circular: true }),
  service({ id: 'w-16c', routeNumber: '16C', operator: 'Central Connect', origin: 'Loop', destination: 'Loop', directionFamily: 'clockwise', stopIds: [W, W2], pattern: [W, W2, W], circular: true }),
  service({ id: 'w-25c', routeNumber: '25C', operator: 'Central Connect', origin: 'Bus Station', destination: 'Temp Bus Station' }),
  service({ id: 'w-66-main', routeNumber: '66', operator: 'Arriva Herts and Essex', origin: 'Bus Station', destination: 'Loughton Station', directionFamily: 'gtfs:0', stopIds: [W, W2], pattern: [W, W2, E] }),
  service({ id: 'w-66-short', routeNumber: '66', operator: 'Arriva Herts and Essex', origin: 'Smiths Lane', destination: 'Loughton Station', directionFamily: 'gtfs:0', stopIds: [W, W2], pattern: [W, W2], sourceRouteIds: ['line-66'] }),
  service({ id: 'w-66-return', routeNumber: '66', operator: 'Arriva Herts and Essex', origin: 'Smiths Lane', destination: 'Bus Station', directionFamily: 'gtfs:0', stopIds: [W], pattern: [W, W2], sourceRouteIds: ['line-66'] }),
  service({ id: 'w-217', routeNumber: '217', operator: 'Arriva London North', origin: 'Bus Station', destination: 'Turnpike Lane Bus Station', stopIds: [N, W2] }),
  service({ id: 'w-242', routeNumber: '242', operator: 'Central Connect', origin: 'Bus Station', destination: 'Potters Bar Railway Station', destinationStopPointId: 'potters', stopIds: [W, W2] }),
  service({ id: 'w-242-welham', routeNumber: '242', operator: 'Central Connect', origin: 'Bus Station', destination: 'Welham Green Railway Station', destinationStopPointId: 'welham', stopIds: [W, W2], pattern: [W, 'welham'] }),
  service({ id: 'w-242-brookfield', routeNumber: '242', operator: 'Central Connect', origin: 'Bus Station', destination: 'Brookfield Centre', destinationStopPointId: 'brookfield', stopIds: [W, W2], pattern: [W, 'brookfield'] }),
  service({ id: 'w-251', routeNumber: '251', operator: 'Arriva Herts and Essex', origin: 'Bus Station', destination: 'Princesfield Rd' }),
  service({ id: 'w-279', routeNumber: '279', operator: 'Arriva London North', origin: 'Bus Station', destination: 'Rookwood Road', stopIds: [N, W2] }),
  service({ id: 'w-310', routeNumber: '310', operator: 'Arriva Herts and Essex', origin: 'Bus Station', destination: 'Hertford Bus Station', stopIds: [W, W2], pattern: [W, W2, 'HERTFORD'] }),
  service({ id: 'w-317', routeNumber: '317', operator: 'Metroline Travel', origin: 'Bus Station', destination: 'Little Park Gardens', stopIds: [N, W2] }),
  service({ id: 'w-327', routeNumber: '327', operator: 'Metroline Travel', origin: 'Bus Station', destination: 'Elsinge Estate', stopIds: [N, W2] }),
  service({ id: 'w-491', routeNumber: '491', operator: 'Metroline Travel', origin: 'Bus Station', destination: 'North Middlesex Hospital', stopIds: [N, W2] }),
  service({ id: 'w-a1', routeNumber: 'A1', operator: 'Central Connect', origin: 'Bus Station', destination: 'Quaker Lane' }),
  service({ id: 'w-n279', routeNumber: 'N279', operator: 'Arriva London North', origin: 'Bus Station', destination: 'Trafalgar Square', stopIds: [N, W2] })
];

export const busGroup1bWalthamRegressionFixture = Object.freeze({
  schema: 'bus-group-1b-waltham-regression-v1',
  provenance: Object.freeze({
    sourceArtifactName: 'Frozen V2 prepared/runtime Waltham replay, compact public regression projection',
    sourceWorkflowRunId: '36125621080',
    preparedSnapshotSha256: '8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9',
    selectedStopCount: 16,
    routeStopPointPairCount: 86,
    nationalDataAcquisition: 'none; fixture is committed and network-free',
    sourceTrace: 'The values are a minimal deterministic projection of the frozen V2 runtime inputs; no national cache or private coordinates are copied.'
  }),
  stops: Object.freeze(baseline.stops),
  routeInventory: Object.freeze(['13', '13A', '13B', '13C', '14', '15', '15A', '16', '16C', '25C', '66', '217', '242', '251', '279', '310', '317', '327', '491', 'A1', 'N279']),
  serviceSummaries: Object.freeze(services)
});
