import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { hasScheduledEvidence, hasScheduledEvidenceAt } from '../../src/atlas/domain/scheduled-evidence.mjs';
import { parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';
import { prepareTnds } from '../../tools/atlas-bus-data/prepare_tnds.mjs';

const days = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const schedule = departures => Object.fromEntries(days.map(day => [day, day === 'monday' ? departures : []]));
const emptySchedule = () => schedule([]);
const sourceSuccess = (source, data = [], provenance = {}) => ({ ok: true, data, evidence: [], warnings: [], provenance: { source, ...provenance } });
const sourceFailure = (source = 'TfL') => ({ ok: false, code: 'offline', data: null, evidence: [], warnings: [`${source} unavailable`], provenance: { source, unavailable: true } });
const stop = (id, route, authority = 'TfL', extra = {}) => ({ id, name: id, routes: [route], timetableAuthority: authority, routeAuthorities: { [route]: [authority] }, ...extra });
const national = ({ id = 'bods-Q', routeNumber = 'Q', timetableSource = 'BODS', stops = { A: [450] }, operator = 'Shared operator' } = {}) => ({ id, routeNumber, operator, origin: 'Origin', destination: 'Terminus', direction: 'Terminus', timetableSource, stopSchedules: Object.fromEntries(Object.entries(stops).map(([id, departures]) => [id, schedule(departures)])) });
const tfl = ({ id = 'tfl-Q', routeNumber = 'Q', stopId = 'A', departures = [420], operator = 'Shared operator' } = {}) => ({ id, routeNumber, operator, origin: 'Origin', destination: 'Terminus', direction: 'Terminus', timetableSource: 'TfL', stopSchedules: { [stopId]: schedule(departures) } });

function createAuthority({ results = {}, nationalServices = [], nationalProvenance = { source: 'BODS' }, london = true }) {
  const nationalResult = () => sourceSuccess('BODS', nationalServices, nationalProvenance);
  return createAuthoritativeBusTimetableAdapter({
    tflAdapter: {
      servicesForStop: async ({ lineId, stopPointId }) => results[`${lineId}|${stopPointId}`] ?? sourceSuccess('TfL', [], { timetableConclusion: 'NO_CURRENT_MATCH' })
    },
    nationalAdapter: { servicesForStops: async () => nationalResult() },
    londonSupplementAdapter: { servicesForStops: async () => nationalResult() },
    londonCoverage: () => london
  });
}

async function assessWith(stops, timetableData) {
  const routed = async (_site, selected) => ({ ok: true, routes: selected.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: {} });
  return createBusAssessment({
    stopDiscovery: { nearbyStops: async () => sourceSuccess('NaPTAN', stops, { stopCoverageComplete: true }) },
    timetableData,
    accessRouting: { matrix: routed }
  }).assess({ latitude: 51.7, longitude: -0.1 });
}

assert.equal(hasScheduledEvidence(emptySchedule()), false);
assert.equal(hasScheduledEvidenceAt({ stopSchedules: { A: emptySchedule() } }, 'A'), false);
assert.equal(hasScheduledEvidence(schedule([450])), true);

const tndsFixture = `<TransXChange SchemaVersion="2.5"><Operators><Operator><TradingName>Fixture National</TradingName></Operator></Operators><Services><Service><ServiceCode>S10</ServiceCode><LineName>10</LineName><StandardService><Origin>A</Origin><Destination>B</Destination></StandardService></Service></Services><StopPoints><AnnotatedStopPointRef><StopPointRef>A-STOP</StopPointRef><CommonName>A</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>B-STOP</StopPointRef><CommonName>B</CommonName></AnnotatedStopPointRef></StopPoints><JourneyPatternSections><JourneyPatternSection id="JPS"><JourneyPatternTimingLink><From><StopPointRef>A-STOP</StopPointRef></From><To><StopPointRef>B-STOP</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink></JourneyPatternSection></JourneyPatternSections><JourneyPatterns><JourneyPattern id="JP"><Direction>outbound</Direction><JourneyPatternSectionRefs>JPS</JourneyPatternSectionRefs></JourneyPattern></JourneyPatterns><VehicleJourneys><VehicleJourney><JourneyPatternRef>JP</JourneyPatternRef><DepartureTime>08:00:00</DepartureTime><OperatingProfile><MondayToFriday>true</MondayToFriday></OperatingProfile></VehicleJourney></VehicleJourneys></TransXChange>`;
const emptyTndsFixture = tndsFixture.replace(/<VehicleJourneys>[\s\S]*?<\/VehicleJourneys>/, '<VehicleJourneys></VehicleJourneys>');
assert.equal(parseTndsTransXchangeServices(tndsFixture, { region: 'SE' }).length, 1);
assert.equal(parseTndsTransXchangeServices(emptyTndsFixture, { region: 'SE' }).length, 0, 'a non-quarantined TNDS record with no journeys is not a prepared service');
const tndsTempRoot = await mkdtemp(path.join(os.tmpdir(), 'atlas-alpha12-evidence-'));
try {
  const tndsInput = path.join(tndsTempRoot, 'input');
  const tndsOutput = path.join(tndsTempRoot, 'output');
  await mkdir(tndsInput, { recursive: true });
  await writeFile(path.join(tndsInput, 'SE-valid.xml'), tndsFixture);
  await writeFile(path.join(tndsInput, 'SE-empty.xml'), emptyTndsFixture);
  const preparedResult = await prepareTnds({ input: tndsInput, output: tndsOutput, preparedAt: '2026-09-09T00:00:00.000Z' });
  assert.equal(preparedResult.services, 1);
  const preparedManifest = JSON.parse(await readFile(path.join(tndsOutput, 'manifest.json'), 'utf8'));
  assert.equal(preparedManifest.serviceCount, 1, 'TNDS preparation excludes an entirely empty non-quarantined service');
} finally {
  await rm(tndsTempRoot, { recursive: true, force: true });
}

const unresolved = sourceSuccess('TfL', [], { timetableConclusion: 'UNRESOLVED' });
const fallbackAuthority = createAuthority({
  results: { 'Q|A': unresolved },
  nationalServices: [national({ id: 'bods-empty', stops: { A: [] } }), national({ id: 'tnds-valid', timetableSource: 'TNDS', stops: { A: [450] } })]
});
const fallbackResult = await fallbackAuthority.servicesForStops([stop('A', 'Q')], { site: { latitude: 51.7, longitude: -0.1 } });
assert.equal(fallbackResult.ok, true);
assert.equal(fallbackResult.data.length, 1, 'empty BODS cannot block a valid TNDS fallback');
assert.equal(fallbackResult.data[0].timetableSource, 'TNDS fallback after TfL unresolved');
assert.deepEqual(Object.keys(fallbackResult.data[0].stopSchedules), ['A']);

const emptyFallback = await createAuthority({ results: { 'Q|A': unresolved }, nationalServices: [national({ id: 'bods-empty', stops: { A: [] } })] }).servicesForStops([stop('A', 'Q')], { site: { latitude: 51.7, longitude: -0.1 } });
assert.equal(emptyFallback.ok, false, 'an empty national candidate cannot resolve an unresolved TfL request');
assert.deepEqual(emptyFallback.provenance.unresolvedRequestIdentities, ['Q|A']);

const emptyTndsFallback = await createAuthority({ results: { 'Q|A': unresolved }, nationalServices: [national({ id: 'tnds-empty', timetableSource: 'TNDS', stops: { A: [] } })] }).servicesForStops([stop('A', 'Q')], { site: { latitude: 51.7, longitude: -0.1 } });
assert.equal(emptyTndsFallback.ok, false, 'an empty TNDS candidate cannot resolve an unresolved TfL request');
assert.deepEqual(emptyTndsFallback.provenance.unresolvedRequestIdentities, ['Q|A']);

const wrongStopFallback = await createAuthority({ results: { 'Q|A': unresolved }, nationalServices: [national({ stops: { B: [450] } })] }).servicesForStops([stop('A', 'Q')], { site: { latitude: 51.7, longitude: -0.1 } });
assert.equal(wrongStopFallback.ok, false, 'scheduled evidence at another StopPoint cannot resolve this request');
assert.deepEqual(wrongStopFallback.provenance.unresolvedRequestIdentities, ['Q|A']);

const scopedFallback = await createAuthority({ results: { 'Q|A': unresolved }, nationalServices: [national({ stops: { A: [450], B: [460], C: [470] } })] }).servicesForStops([stop('A', 'Q')], { site: { latitude: 51.7, longitude: -0.1 } });
assert.deepEqual(Object.keys(scopedFallback.data[0].stopSchedules), ['A'], 'fallback schedules are scoped to the request and cannot leak an unselected stop');

const crossStopAuthority = createAuthority({
  results: {
    'Q|A': unresolved,
    'Q|B': sourceSuccess('TfL', [tfl({ id: 'tfl-Q-B', stopId: 'B', departures: [420] })], { timetableConclusion: 'MATCHED' })
  },
  nationalServices: [national({ stops: { A: [450], B: [460] } })]
});
const crossStopAssessment = await assessWith([stop('A', 'Q'), stop('B', 'Q')], crossStopAuthority);
assert.equal(crossStopAssessment.stops.find(item => item.id === 'A').timetableEvidenceStatus, 'FALLBACK');
assert.equal(crossStopAssessment.stops.find(item => item.id === 'B').timetableEvidenceStatus, 'MATCHED');
assert.deepEqual(crossStopAssessment.serviceSummaries[0].departuresByDay.monday, [450], 'frequency uses the representative fallback stop and does not sum another physical stop');

const mixedNationalAuthority = createAuthority({
  london: false,
  results: { 'Q|A': unresolved },
  nationalServices: [national({ stops: { A: [450], B: [460] } })]
});
const mixedNational = await assessWith([
  stop('A', 'Q', 'TfL'),
  stop('B', 'Q', 'NaPTAN')
], mixedNationalAuthority);
assert.equal(mixedNational.stops.find(item => item.id === 'A').timetableEvidenceStatus, 'FALLBACK');
assert.equal(mixedNational.stops.find(item => item.id === 'B').timetableEvidenceStatus, 'MATCHED');
assert.deepEqual([...mixedNational.serviceSummaries[0].assessedStops].sort(), ['A', 'B']);
assert.deepEqual(mixedNational.serviceSummaries[0].departuresByDay.monday, [450]);

const emptyNationalService = { id: 'empty-national', routeNumber: '10', stopSchedules: { A: emptySchedule() } };
assert.deepEqual(buildServiceSummaries([{ id: 'A' }], [emptyNationalService]), [], 'empty national records cannot become planner rows');
const emptyNationalAssessment = await assessWith([stop('A', '10', 'NaPTAN')], { servicesForStops: async () => sourceSuccess('BODS', [emptyNationalService], { timetableConclusion: 'NO_CURRENT_MATCH' }) });
assert.equal(emptyNationalAssessment.status, 'partial');
assert.equal(emptyNationalAssessment.serviceSummaries.length, 0);
assert.equal(emptyNationalAssessment.stops[0].timetableEvidenceStatus, 'NO_CURRENT_MATCH');
const validNationalAssessment = await assessWith([stop('A', '10', 'NaPTAN')], { servicesForStops: async () => sourceSuccess('BODS', [national({ id: 'bods-valid', routeNumber: '10', stops: { A: [450] } })], { timetableConclusion: 'MATCHED' }) });
assert.equal(validNationalAssessment.status, 'complete');
assert.equal(validNationalAssessment.serviceSummaries.length, 1);

const quarantined = { id: 'tnds-Q', routeNumber: 'Q', operator: 'National', stopSchedules: {}, tndsQuarantine: { serviceQuarantined: true, affectedStopIds: ['QSTOP'], patterns: [{ patternId: 'JP-Q', reasonCode: 'incomplete_runtime_sequence', affectedStopIds: ['QSTOP'] }] } };
const validBodsQ = { ...national({ id: 'bods-Q-valid', routeNumber: 'Q', stops: { QSTOP: [450] } }), timetableSource: 'BODS' };
const preparedManifest = { schema: 'atlas-prepared-bus-data-v1', generatedAt: '2026-09-09T00:00:00Z', refreshAfterDays: 8, gridSize: 0.1, serviceShardKeyLength: 5, sources: { bods: { url: 'https://official.example/bods', sha256: 'bods' } }, serviceShards: { QSTOP: ['services/QSTOP.json'] } };
const preparedStop = { id: 'QSTOP' };
function preparedFetchFactory({ bodsServices = [], tndsServices = [quarantined] } = {}) {
  const tndsManifest = { schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-09-09T00:00:00Z', serviceShardKeyLength: 5, serviceShards: { QSTOP: ['services/QSTOP.json'] } };
  return async url => {
    const pathname = new URL(url).pathname;
    if (pathname === '/data/manifest.json') return new Response(JSON.stringify({ ...preparedManifest, serviceShards: { QSTOP: ['services/QSTOP.json'] } }), { status: 200 });
    if (pathname === '/tnds/manifest.json') return new Response(JSON.stringify(tndsManifest), { status: 200 });
    if (pathname === '/data/services/QSTOP.json') return new Response(JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', services: bodsServices }), { status: 200 });
    if (pathname === '/tnds/services/QSTOP.json') return new Response(JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', stopPrefix: 'QSTOP', services: tndsServices }), { status: 200 });
    return new Response('', { status: 404 });
  };
}
const preparedQ = createPreparedBusDataAdapter({ fetchImpl: preparedFetchFactory(), baseUrl: 'https://fixture.test/data/', tndsBaseUrl: 'https://fixture.test/tnds/' });
const quarantinedResult = await preparedQ.servicesForStops([preparedStop]);
assert.deepEqual(quarantinedResult.provenance.unresolvedRequestIdentities, ['Q|QSTOP']);
assert.equal(quarantinedResult.provenance.timetableConclusion, 'UNRESOLVED');
assert.equal(quarantinedResult.data.length, 0);
const quarantinedAssessment = await assessWith([stop('QSTOP', 'Q', 'NaPTAN')], quarantinedResultAdapter(preparedQ));
assert.equal(quarantinedAssessment.status, 'partial');
assert.equal(quarantinedAssessment.stops[0].timetableEvidenceStatus, 'SOURCE_UNAVAILABLE');
const resolvedQ = createPreparedBusDataAdapter({ fetchImpl: preparedFetchFactory({ bodsServices: [validBodsQ] }), baseUrl: 'https://fixture.test/data/', tndsBaseUrl: 'https://fixture.test/tnds/' });
const resolvedQResult = await resolvedQ.servicesForStops([preparedStop]);
assert.deepEqual(resolvedQResult.provenance.unresolvedRequestIdentities, [], 'valid BODS evidence resolves a supplementary quarantine identity at the same route and stop');
assert.equal(resolvedQResult.provenance.timetableConclusion, 'MATCHED');

function quarantinedResultAdapter(adapter) {
  return { servicesForStops: async selected => adapter.servicesForStops(selected) };
}

const mixedQuarantineAuthority = createAuthority({
  london: false,
  results: { '279|TFL': sourceSuccess('TfL', [tfl({ id: 'tfl-279', routeNumber: '279', stopId: 'TFL', departures: [420] })], { timetableConclusion: 'MATCHED' }) },
  nationalServices: [],
  nationalProvenance: { source: 'BODS; TNDS', unresolvedRequestIdentities: ['Q|NATIONAL'] }
});
const mixedQuarantine = await assessWith([stop('TFL', '279', 'TfL'), stop('NATIONAL', 'Q', 'NaPTAN')], mixedQuarantineAuthority);
assert.equal(mixedQuarantine.status, 'partial');
assert.equal(mixedQuarantine.stops.find(item => item.id === 'TFL').timetableEvidenceStatus, 'MATCHED');
assert.equal(mixedQuarantine.stops.find(item => item.id === 'NATIONAL').timetableEvidenceStatus, 'SOURCE_UNAVAILABLE');

const twoFallbacks = await createAuthority({ results: { 'Q|A': unresolved, 'Q|B': unresolved }, nationalServices: [national({ stops: { A: [450], B: [460] } })] }).servicesForStops([stop('A', 'Q'), stop('B', 'Q')], { site: { latitude: 51.7, longitude: -0.1 } });
assert.equal(twoFallbacks.data.length, 2);
assert.deepEqual(twoFallbacks.data.map(service => Object.keys(service.stopSchedules)), [['A'], ['B']]);
const twoFallbackSummary = buildServiceSummaries([{ id: 'A', walking: { status: 'routed', distanceMetres: 10 } }, { id: 'B', walking: { status: 'routed', distanceMetres: 20 } }], twoFallbacks.data)[0];
assert.deepEqual(twoFallbackSummary.departuresByDay.monday, [450], 'two fallback StopPoints do not inflate representative-stop frequency');

const hardFailure = await createAuthority({ results: { 'Q|A': sourceFailure() }, nationalServices: [] }).servicesForStops([stop('A', 'Q')], { site: { latitude: 51.7, longitude: -0.1 } });
assert.equal(hardFailure.ok, false);
assert.notEqual(hardFailure.provenance.timetableConclusion, 'NO_CURRENT_MATCH');
const noCurrent = await createAuthority({ results: { 'Q|A': sourceSuccess('TfL', [], { timetableConclusion: 'NO_CURRENT_MATCH' }) }, nationalServices: [] }).servicesForStops([stop('A', 'Q')], { site: { latitude: 51.7, longitude: -0.1 } });
assert.equal(noCurrent.ok, true);
assert.equal(noCurrent.provenance.timetableConclusion, 'NO_CURRENT_MATCH');
assert.deepEqual(noCurrent.provenance.unresolvedRequestIdentities, []);

const perRequestNoCurrent = await assessWith([stop('A', 'Q'), stop('B', 'R')], {
  servicesForStops: async () => sourceSuccess('TfL', [tfl({ id: 'tfl-R-B', routeNumber: 'R', stopId: 'B', departures: [480] })], {
    timetableConclusion: 'MATCHED',
    noCurrentRequestIdentities: ['Q|A']
  })
});
assert.equal(perRequestNoCurrent.stops.find(item => item.id === 'A').timetableEvidenceStatus, 'NO_CURRENT_MATCH');
assert.equal(perRequestNoCurrent.stops.find(item => item.id === 'B').timetableEvidenceStatus, 'MATCHED');

const emptySuccessfulResult = await assessWith([stop('A', 'Q')], {
  servicesForStops: async () => sourceSuccess('TfL', [], { timetableConclusion: 'MATCHED' })
});
assert.equal(emptySuccessfulResult.status, 'partial');
assert.equal(emptySuccessfulResult.stops[0].timetableEvidenceStatus, 'SOURCE_UNAVAILABLE', 'source success without scheduled evidence is unresolved, not no-current');

console.log('PASS Alpha.12 consolidated scheduled-evidence invariant, empty-service, quarantine, fallback-scope, and cross-stop matrix.');
