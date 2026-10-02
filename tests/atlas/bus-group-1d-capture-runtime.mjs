import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createAtlasReferenceData } from '../../src/atlas/reference-data/atlas-reference-data.mjs';
import { createBusStopDiscovery } from '../../src/atlas/application/bus-stop-discovery.mjs';
import { groupStopsForPresentation, buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { resolvePlannerEndpointDecisions } from '../../src/atlas/domain/planner-endpoint-decision.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const baseUrl = process.argv.includes('--base-url') ? process.argv[process.argv.indexOf('--base-url') + 1] : 'http://127.0.0.1:8769/__atlas-review/v2-data/';
const output = process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output') + 1] : path.join(root, 'tests/atlas/fixtures/bus-group-1d-waltham-runtime.json');
const prepared = createPreparedBusDataAdapter({
  fetchImpl: globalThis.fetch,
  baseUrl: new URL('bus/', baseUrl).toString(),
  tndsBaseUrl: null,
  busFileUrl: relative => new URL(`bus/${relative}`, baseUrl).toString(),
  tndsFileUrl: relative => new URL(`tnds/${relative}`, baseUrl).toString()
});
const referenceData = createAtlasReferenceData({ adapter: prepared });
const unavailableTfl = { nearbyStops: async () => ({ ok: false, data: [], warnings: ['TfL deliberately not consulted by this frozen V2 capture.'], provenance: { unavailable: true } }) };
const discovery = createBusStopDiscovery({ tflAdapter: unavailableTfl, naptanAdapter: prepared, referenceData, crossBoundaryTfL: false });
const site = confirmSite(createSite({ suppliedAddress: 'Waltham Cross BUS-GROUP-1D frozen runtime control', displayAddress: 'Waltham Cross BUS-GROUP-1D frozen runtime control', latitude: 51.6857829, longitude: -0.0330001, locationMethod: 'coordinates_entered' }), { confirmedAt: '2026-10-01T13:14:02Z' });
const discovered = await discovery.nearbyStops(site, { radius: 700, forceRefresh: false });
if (!discovered.ok) throw new Error(`Frozen V2 stop discovery failed: ${discovered.message || discovered.code}`);
const stops = groupStopsForPresentation(discovered.data);
const servicesResult = await prepared.servicesForStops(stops, { forceRefresh: false });
if (!servicesResult.ok) throw new Error(`Frozen V2 service load failed: ${servicesResult.message || servicesResult.code}`);
const serviceSummaries = buildServiceSummaries(stops, servicesResult.data);
const endpointResolution = await resolvePlannerEndpointDecisions(serviceSummaries, referenceData, { forceRefresh: false });
const resolved = endpointResolution.services;
const compactEndpointDecision = decision => {
  if (!decision || typeof decision !== 'object') return null;
  return {
    rawEndpointText: decision.rawEndpointText,
    raw: decision.raw,
    endpointStopPointId: decision.endpointStopPointId,
    endpointStopPointIds: decision.endpointStopPointIds,
    primaryEndpointStopPointId: decision.primaryEndpointStopPointId,
    endpointStopName: decision.endpointStopName,
    endpointLogicalGroupIds: decision.endpointLogicalGroupIds,
    endpointLogicalPlaceName: decision.endpointLogicalPlaceName,
    nptgLocalityCode: decision.nptgLocalityCode,
    nptgLocalityName: decision.nptgLocalityName,
    stopArea: decision.stopArea,
    stopAreas: decision.stopAreas,
    stopAreaEvidence: decision.stopAreaEvidence,
    chosenPlaceName: decision.chosenPlaceName,
    chosenDisplayName: decision.chosenDisplayName,
    chosen: decision.chosen,
    decisionType: decision.decisionType,
    conflict: decision.conflict,
    unresolved: decision.unresolved,
    partialExactCoverage: decision.partialExactCoverage,
    exactEvidence: decision.exactEvidence,
    evidenceSource: decision.evidenceSource
  };
};
const compactStop = stop => ({
  id: stop.id,
  sourceId: stop.sourceId,
  name: stop.name,
  commonName: stop.commonName,
  indicator: stop.indicator,
  direction: stop.direction,
  latitude: stop.latitude,
  longitude: stop.longitude,
  distanceMetres: stop.distanceMetres,
  routes: stop.routes,
  routeAuthorities: stop.routeAuthorities,
  sourceAuthorities: stop.sourceAuthorities,
  timetableAuthorities: stop.timetableAuthorities,
  timetableAuthority: stop.timetableAuthority,
  stopAreaId: stop.stopAreaId,
  stopAreaName: stop.stopAreaName,
  logicalGroupId: stop.logicalGroupId,
  logicalGroupName: stop.logicalGroupName,
  logicalGroupRefs: stop.logicalGroupRefs,
  logicalGroupMemberStopPointIds: stop.logicalGroupMemberStopPointIds,
  locality: stop.locality,
  parentLocality: stop.parentLocality,
  nptgLocalityCode: stop.nptgLocalityCode,
  nptgLocalityName: stop.nptgLocalityName,
  walking: stop.walking,
  cycling: stop.cycling,
  core: stop.core,
  groupCompleted: stop.groupCompleted,
  stopAreaCompletionStatus: stop.stopAreaCompletionStatus
});
const compactService = service => {
  const basis = String(service.frequencyBasisStopId || '');
  const compactDepartures = Object.fromEntries(Object.entries(service.departureEvidenceByDay || {}).map(([day, entries]) => [day, (entries || [])
    .filter(entry => !basis || !entry?.stopPointId || String(entry.stopPointId) === basis)
    .map(entry => ({ minute: entry.minute, stopPointId: entry.stopPointId, journeyIdentity: entry.journeyIdentity, journeyId: entry.journeyId, provider: entry.provider, sourceRecordId: entry.sourceRecordId, calendarProfileId: entry.calendarProfileId }))]));
  return {
    id: service.id,
    sourceRecordIds: service.sourceRecordIds,
    routeNumber: service.routeNumber,
    operator: service.operator,
    provider: service.provider,
    timetableSource: service.timetableSource,
    sourceAuthorities: service.sourceAuthorities,
    sourceProviders: service.sourceProviders,
    source: service.source && { provider: service.source.provider, routeId: service.source.routeId, directionId: service.source.directionId, patternId: service.source.patternId },
    origin: service.origin,
    destination: service.destination,
    direction: service.direction,
    directionFamily: service.directionFamily,
    stopDirection: service.stopDirection,
    circular: service.circular,
    originStopPointId: service.originStopPointId,
    destinationStopPointId: service.destinationStopPointId,
    originStopPointIds: service.originStopPointIds,
    destinationStopPointIds: service.destinationStopPointIds,
    stopIds: service.stopIds,
    assessedStops: service.assessedStops,
    routePatternStopIds: service.routePatternStopIds,
    routePatternStops: (service.routePatternStops || []).map(stop => ({ id: stop.id, name: stop.name, commonName: stop.commonName, locality: stop.locality, localityName: stop.localityName, nptgLocalityName: stop.nptgLocalityName, stopArea: stop.stopArea, logicalGroupRefs: stop.logicalGroupRefs })),
    routePatternExtent: service.routePatternExtent,
    orderedPatternEndpoints: service.orderedPatternEndpoints,
    sourceRouteIds: service.sourceRouteIds,
    serviceLineageId: service.serviceLineageId,
    routeId: service.routeId,
    originEndpointDecision: compactEndpointDecision(service.originEndpointDecision),
    destinationEndpointDecision: compactEndpointDecision(service.destinationEndpointDecision),
    endpointEvidence: service.endpointEvidence,
    calendarProfileId: service.calendarProfileId,
    calendarProfileLabel: service.calendarProfileLabel,
    calendarProfileIds: service.calendarProfileIds,
    calendarEvidence: service.calendarEvidence,
    serviceNote: service.serviceNote,
    serviceNotes: service.serviceNotes,
    qualifications: service.qualifications,
    departuresByDay: service.departuresByDay,
    departureEvidenceByDay: compactDepartures,
    frequencyByDay: service.frequencyByDay,
    frequencyEvidence: service.frequencyEvidence,
    frequencyBasisStopId: service.frequencyBasisStopId,
    frequencyBasisStopName: service.frequencyBasisStopName,
    recordActivity: service.recordActivity,
    operatingPeriods: service.operatingPeriods,
    operatingPeriodLines: service.operatingPeriodLines,
    typicalFrequencyLines: service.typicalFrequencyLines,
    typicalFrequencyText: service.typicalFrequencyText,
    principalLocations: service.principalLocations,
    destinationLocality: service.destinationLocality,
    destinationLocalityName: service.destinationLocalityName,
    sourceWarnings: service.sourceWarnings,
    endpointResolutionWarnings: service.endpointResolutionWarnings,
    validity: service.validity
  };
};
const routeCounts = Object.fromEntries([...new Set(resolved.map(service => String(service.routeNumber || '')))].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(route => [route, resolved.filter(service => String(service.routeNumber) === route).length]));
const fixture = {
  metadata: {
    fixture: 'bus-group-1d-waltham-runtime',
    captureMethod: 'frozen V2 prepared runtime: discovery -> groupStopsForPresentation -> servicesForStops -> buildServiceSummaries -> resolvePlannerEndpointDecisions',
    runId: '36125621080',
    snapshotSha256: '8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9',
    reviewUrl: 'http://127.0.0.1:8769/atlas/?review=v2&build=0d18656',
    controlCoordinates: { latitude: site.latitude, longitude: site.longitude },
    radiusMetres: 700,
    frozenCacheOnly: true,
    tflConsulted: false,
    tndsConsulted: false,
    counts: { physicalStops: stops.length, routeNumbers: new Set(stops.flatMap(stop => stop.routes ?? [])).size, routeStopPairs: stops.reduce((count, stop) => count + (stop.routes?.length ?? 0), 0), rawServices: servicesResult.data.length, serviceSummaries: resolved.length, routeCounts }
  },
  stops: stops.map(compactStop),
  serviceSummaries: resolved.map(compactService)
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(fixture));
console.log(JSON.stringify(fixture.metadata, null, 2));
