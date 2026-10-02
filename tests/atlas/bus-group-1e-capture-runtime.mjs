import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createTflBusStopAdapter } from '../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createTflBusTimetableAdapter } from '../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createTflRequestScheduler } from '../../src/atlas/adapters/tfl-request-scheduler.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createOsrmAccessRoutingAdapter } from '../../src/atlas/adapters/osrm-access-routing-adapter.mjs';
import { createAtlasReferenceData } from '../../src/atlas/reference-data/atlas-reference-data.mjs';
import { createBusStopDiscovery } from '../../src/atlas/application/bus-stop-discovery.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const baseUrl = process.argv.includes('--base-url') ? process.argv[process.argv.indexOf('--base-url') + 1] : 'http://127.0.0.1:8769/__atlas-review/v2-data/';
const output = process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output') + 1] : path.join(root, 'tests/atlas/fixtures/bus-group-1e-waltham-mixed-runtime.json');
const identifiedFetch = (url, options = {}) => fetch(url, { ...options, headers: { ...(options.headers || {}), 'User-Agent': 'ATLAS/2.0.0-alpha.15 BUS-GROUP-1E bounded mixed-source capture' } });
const cache = createJsonCache({ storage: createMemoryStorage(), namespace: 'atlas-bus-group-1e-capture' });
const scheduler = createTflRequestScheduler();
const prepared = createPreparedBusDataAdapter({
  fetchImpl: identifiedFetch,
  baseUrl: new URL('bus/', baseUrl).toString(),
  tndsBaseUrl: null,
  busFileUrl: relative => new URL(`bus/${relative}`, baseUrl).toString(),
  tndsFileUrl: relative => new URL(`tnds/${relative}`, baseUrl).toString()
});
const tflStops = createTflBusStopAdapter({ fetchImpl: identifiedFetch, cache, requestScheduler: scheduler });
const tflTimetable = createTflBusTimetableAdapter({ fetchImpl: identifiedFetch, cache, requestScheduler: scheduler });
const referenceData = createAtlasReferenceData({ adapter: prepared });
const discovery = createBusStopDiscovery({ tflAdapter: tflStops, naptanAdapter: prepared, referenceData, crossBoundaryTfL: true });
const timetableData = createAuthoritativeBusTimetableAdapter({ tflAdapter: tflTimetable, nationalAdapter: prepared, londonSupplementAdapter: prepared });
const assessment = createBusAssessment({
  stopDiscovery: discovery,
  timetableData,
  accessRouting: createOsrmAccessRoutingAdapter({ fetchImpl: identifiedFetch }),
  referenceData
});
const site = confirmSite(createSite({
  suppliedAddress: 'Waltham Cross BUS-GROUP-1E mixed-source runtime control',
  displayAddress: 'Waltham Cross BUS-GROUP-1E mixed-source runtime control',
  latitude: 51.6857829,
  longitude: -0.0330001,
  locationMethod: 'coordinates_entered'
}), { confirmedAt: '2026-10-01T13:14:02Z' });

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
  id: stop.id, sourceId: stop.sourceId, name: stop.name, commonName: stop.commonName, indicator: stop.indicator,
  direction: stop.direction, latitude: stop.latitude, longitude: stop.longitude, distanceMetres: stop.distanceMetres,
  routes: stop.routes, routeAuthorities: stop.routeAuthorities, sourceAuthorities: stop.sourceAuthorities,
  timetableAuthorities: stop.timetableAuthorities, timetableAuthority: stop.timetableAuthority, stopAreaId: stop.stopAreaId,
  stopAreaName: stop.stopAreaName, logicalGroupId: stop.logicalGroupId, logicalGroupName: stop.logicalGroupName,
  logicalGroupRefs: stop.logicalGroupRefs, logicalGroupMemberStopPointIds: stop.logicalGroupMemberStopPointIds,
  locality: stop.locality, parentLocality: stop.parentLocality, nptgLocalityCode: stop.nptgLocalityCode,
  nptgLocalityName: stop.nptgLocalityName, walking: stop.walking, cycling: stop.cycling, core: stop.core,
  groupCompleted: stop.groupCompleted, stopAreaCompletionStatus: stop.stopAreaCompletionStatus
});
const compactService = service => ({
  id: service.id, sourceRecordIds: service.sourceRecordIds, routeNumber: service.routeNumber, operator: service.operator,
  provider: service.provider, timetableSource: service.timetableSource, sourceAuthorities: service.sourceAuthorities,
  sourceProviders: service.sourceProviders, source: service.source && {
    provider: service.source.provider, supplementaryProvider: service.source.supplementaryProvider,
    routeId: service.source.routeId, directionId: service.source.directionId, patternId: service.source.patternId,
    fallbackFor: service.source.fallbackFor, fallbackSourceId: service.source.fallbackSourceId
  }, origin: service.origin, destination: service.destination, direction: service.direction,
  directionFamily: service.directionFamily, stopDirection: service.stopDirection, circular: service.circular,
  originStopPointId: service.originStopPointId, destinationStopPointId: service.destinationStopPointId,
  originStopPointIds: service.originStopPointIds, destinationStopPointIds: service.destinationStopPointIds,
  stopIds: service.stopIds, assessedStops: service.assessedStops, routePatternStopIds: service.routePatternStopIds,
  routePatternStops: (service.routePatternStops || []).map(stop => ({
    id: stop.id, name: stop.name, commonName: stop.commonName, locality: stop.locality, localityName: stop.localityName,
    nptgLocalityName: stop.nptgLocalityName, stopArea: stop.stopArea, logicalGroupRefs: stop.logicalGroupRefs
  })), routePatternExtent: service.routePatternExtent, orderedPatternEndpoints: service.orderedPatternEndpoints,
  sourceRouteIds: service.sourceRouteIds, serviceLineageId: service.serviceLineageId, routeId: service.routeId,
  originEndpointDecision: compactEndpointDecision(service.originEndpointDecision),
  destinationEndpointDecision: compactEndpointDecision(service.destinationEndpointDecision), endpointEvidence: service.endpointEvidence,
  calendarProfileId: service.calendarProfileId, calendarProfileLabel: service.calendarProfileLabel,
  calendarProfileIds: service.calendarProfileIds, calendarEvidence: service.calendarEvidence, serviceNote: service.serviceNote,
  serviceNotes: service.serviceNotes, qualifications: service.qualifications, departuresByDay: service.departuresByDay,
  frequencyByDay: service.frequencyByDay, frequencyEvidence: service.frequencyEvidence, frequencyBasisStopId: service.frequencyBasisStopId,
  frequencyBasisStopName: service.frequencyBasisStopName, recordActivity: service.recordActivity, operatingPeriods: service.operatingPeriods,
  operatingPeriodLines: service.operatingPeriodLines, typicalFrequencyLines: service.typicalFrequencyLines,
  typicalFrequencyText: service.typicalFrequencyText, principalLocations: service.principalLocations,
  destinationLocality: service.destinationLocality, destinationLocalityName: service.destinationLocalityName,
  sourceWarnings: service.sourceWarnings, endpointResolutionWarnings: service.endpointResolutionWarnings, validity: service.validity
});

const result = await assessment.assess(site, { radius: 700, forceRefresh: false, mode: 'full' });
if (!result.ok) throw new Error(`Mixed-source assessment failed: ${result.message || result.code}`);
const routes = ['217', '279', '317', '327', '491', 'N279'];
const selected = result.serviceSummaries.filter(service => routes.includes(String(service.routeNumber)));
const sourceLabels = [...new Set(selected.map(service => service.provider || service.timetableSource || service.source?.provider).filter(Boolean))].sort();
const fixture = {
  metadata: {
    fixture: 'bus-group-1e-waltham-mixed-runtime',
    captureMethod: 'actual V2 browser-equivalent runtime: cross-boundary TfL StopPoint discovery + prepared national discovery -> normal authoritative TfL/national timetable overlay -> buildServiceSummaries -> resolvePlannerEndpointDecisions',
    capturePoint: 'createBusAssessment.assess(...).serviceSummaries, after source overlay and BUS-DEST endpoint resolution and before BUS-GROUP presentation',
    runId: '36125621080', snapshotSha256: '8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9',
    reviewUrl: baseUrl.replace('/__atlas-review/v2-data/', '/atlas/?review=v2'),
    controlCoordinates: { latitude: site.latitude, longitude: site.longitude }, radiusMetres: 700,
    frozenNationalCacheOnly: true, tflConsulted: true, tndsConsulted: false,
    counts: { physicalStops: result.scope.stopCount, routeNumbers: result.scope.routeCount, routeStopPairs: result.scope.pairCount,
      rawServices: result.services.length, serviceSummaries: result.serviceSummaries.length,
      selectedControls: Object.fromEntries(routes.map(route => [route, selected.filter(service => String(service.routeNumber) === route).length])),
      mixedTimetableSources: sourceLabels },
    provenance: result.provenance.timetables
  },
  stops: result.stops.map(compactStop),
  serviceSummaries: result.serviceSummaries.map(compactService)
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(fixture));
console.log(JSON.stringify(fixture.metadata, null, 2));
