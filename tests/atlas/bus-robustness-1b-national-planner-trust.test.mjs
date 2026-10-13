import assert from 'node:assert/strict';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { partialTimetableQualification, stopRoutesPresentation } from '../../src/atlas/domain/bus-source-presentation.mjs';
import { plannerStopWarning, recommendedBusStop } from '../../src/atlas/domain/bus-planner-trust.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const serviceFor = (id, route, stopId) => ({
  id, routeNumber: route, operator: 'Fixture Buses', origin: 'Origin', destination: 'Destination', direction: 'Destination',
  stopSchedules: { [stopId]: { monday: [360], tuesday: [360], wednesday: [360], thursday: [360], friday: [360], saturday: [360], sunday: [360] } }
});

const baseManifest = {
  schema: 'atlas-prepared-bus-data-v2', generatedAt: '2026-10-09T00:00:00Z', refreshAfterDays: 8, gridSize: 0.1, serviceShardKeyLength: 5,
  stopFields: ['id', 'naptanCode', 'name', 'indicator', 'direction', 'latitude', 'longitude', 'stopType', 'busStopType', 'locality', 'parentLocality', 'areaCode', 'modifiedAt', 'routes'],
  sources: { naptan: { url: 'https://fixture/naptan', sha256: 'naptan' }, bods: { url: 'https://fixture/bods', sha256: 'bods', regions: ['east-midlands'] } },
  serviceShards: { AAAAA: ['services/AAAAA.json.gz'], BBBBB: ['services/BBBBB.json.gz'] },
  representativeDates: { monday: '2026-10-12' }
};

const stopA = { id: 'AAAAA', areaCode: 'AAA', routes: ['10'], routeAuthorities: { '10': ['BODS'] }, name: 'Alpha Stop' };
const stopB = { id: 'BBBBB', areaCode: 'BBB', routes: ['20'], routeAuthorities: { '20': ['BODS'] }, name: 'Beta Stop' };

function adapterFor({ manifest = baseManifest, shardPayloads = {}, missing = [], fetchErrors = [] } = {}) {
  const fetchImpl = async url => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/manifest.json')) return new Response(JSON.stringify(manifest), { status: 200 });
    const entry = Object.entries(shardPayloads).find(([path]) => pathname.endsWith(path));
    if (entry && !missing.includes(entry[0])) return new Response(JSON.stringify(entry[1]), { status: 200 });
    if (fetchErrors.some(path => pathname.endsWith(path))) return new Response('', { status: 503 });
    return new Response('', { status: 404 });
  };
  return createPreparedBusDataAdapter({ fetchImpl, baseUrl: 'https://fixture/data/' });
}

function assessmentFor(stops, servicesResult) {
  const route = { status: 'routed', distanceMetres: 100, durationSeconds: 60 };
  return createBusAssessment({
    stopDiscovery: { nearbyStops: async () => ({ ok: true, data: stops, evidence: [], warnings: [], provenance: { source: 'NaPTAN' } }) },
    timetableData: { servicesForStops: async () => servicesResult },
    accessRouting: { matrix: async (_site, selected) => ({ ok: true, routes: selected.map(() => route), warnings: [], provenance: { source: 'OSRM' } }) }
  });
}

test('all selected national service shards succeed and remain complete', async () => {
  const adapter = adapterFor({ shardPayloads: {
    'services/AAAAA.json.gz': { schema: 'atlas-prepared-bus-data-v2', services: [serviceFor('a', '10', 'AAAAA')] },
    'services/BBBBB.json.gz': { schema: 'atlas-prepared-bus-data-v2', services: [serviceFor('b', '20', 'BBBBB')] }
  } });
  const result = await adapter.servicesForStops([stopA, stopB]);
  assert.equal(result.ok, true);
  assert.equal(result.provenance.sourceCompleteness, 'COMPLETE');
  assert.equal(result.data.length, 2);
  assert.equal(result.provenance.failedShardCount, 0);
});

test('one missing shard retains successful evidence and records unresolved scope', async () => {
  const adapter = adapterFor({ manifest: { ...baseManifest, serviceShards: { AAAAA: ['services/AAAAA.json.gz'] } }, shardPayloads: { 'services/AAAAA.json.gz': { schema: 'atlas-prepared-bus-data-v2', services: [serviceFor('a', '10', 'AAAAA')] } } });
  const result = await adapter.servicesForStops([stopA, stopB]);
  assert.equal(result.ok, true);
  assert.equal(result.provenance.sourceCompleteness, 'PARTIAL');
  assert.equal(result.provenance.timetableConclusion, 'MATCHED');
  assert.deepEqual(result.provenance.unresolvedStopIds, ['BBBBB']);
  assert.equal(result.data[0].routeNumber, '10');
  assert.equal(result.provenance.failedShardDiagnostics[0].status, 'missing');
});

test('malformed and validation-failed shards are isolated independently', async () => {
  const malformed = adapterFor({ shardPayloads: {
    'services/AAAAA.json.gz': { schema: 'atlas-prepared-bus-data-v2', services: [serviceFor('a', '10', 'AAAAA')] },
    'services/BBBBB.json.gz': { schema: 'wrong-schema', services: [] }
  } });
  const malformedResult = await malformed.servicesForStops([stopA, stopB]);
  assert.equal(malformedResult.ok, true);
  assert.equal(malformedResult.provenance.failedShardDiagnostics[0].status, 'malformed');

  const invalid = adapterFor({ shardPayloads: {
    'services/AAAAA.json.gz': { schema: 'atlas-prepared-bus-data-v2', services: [serviceFor('a', '10', 'AAAAA')] },
    'services/BBBBB.json.gz': { schema: 'atlas-prepared-bus-data-v2', services: [{ id: 'invalid', stopSchedules: null }] }
  } });
  const invalidResult = await invalid.servicesForStops([stopA, stopB]);
  assert.equal(invalidResult.ok, true);
  assert.equal(invalidResult.provenance.failedShardDiagnostics[0].status, 'validation-failed');
});

test('complete national shard failure is source unavailable, never zero service', async () => {
  const adapter = adapterFor({});
  const result = await adapter.servicesForStops([stopA]);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unavailable_source');
  assert.equal(result.provenance.sourceCompleteness, 'SOURCE_UNAVAILABLE');
  assert.equal(result.provenance.timetableConclusion, 'UNRESOLVED');
  assert.match(result.warnings.join(' '), /No zero-service conclusion/);
});

test('route metadata survives partial timetable evidence and is presented as qualified', async () => {
  const partial = { ok: true, data: [serviceFor('a', '10', 'AAAAA')], warnings: ['Prepared timetable evidence was incomplete.'], provenance: {
    source: 'Department for Transport Bus Open Data Service', sourceCompleteness: 'PARTIAL', failedRequests: 1, unresolvedRequestIdentities: ['20|BBBBB'], nationalUnresolvedRequestIdentities: ['20|BBBBB'], nationalUnresolvedRoutes: ['20'],
    failedShardCount: 1, failedShardDiagnostics: [{ status: 'missing', key: 'BBBBB', stopIds: ['BBBBB'] }], unresolvedStopIds: ['BBBBB'], timetableConclusion: 'MATCHED'
  } };
  const assessment = await assessmentFor([stopA, stopB], partial).assess({});
  assert.equal(assessment.status, 'partial');
  assert.deepEqual(assessment.stops.map(stop => stop.routes), [['10'], ['20']]);
  assert.equal(assessment.stops[0].timetableEvidenceStatus, 'MATCHED');
  assert.equal(assessment.stops[1].timetableEvidenceStatus, 'SOURCE_UNAVAILABLE');
  assert.match(assessment.wording, /not been treated as absent/);
  assert.ok(assessment.reviewItems.some(item => item.code === 'timetable-shard-failure'));
  assert.match(stopRoutesPresentation(assessment.stops[1]), /not treated as absent/);
  assert.match(partialTimetableQualification(assessment.stops), /routes 20/);
});

test('genuine no-route and no-current-match conclusions remain distinct', async () => {
  const noRoutesStop = { id: 'NOROUTE', name: 'No Route Stop', routes: [] };
  const noRoutes = await assessmentFor([noRoutesStop], { ok: true, data: [], warnings: [], provenance: { source: 'Department for Transport Bus Open Data Service', sourceCompleteness: 'COMPLETE', timetableConclusion: 'MATCHED' } }).assess({});
  assert.equal(noRoutes.stops[0].timetableEvidenceStatus, 'NO_ROUTES');
  assert.match(stopRoutesPresentation(noRoutes.stops[0]), /authoritative stop source recorded no routes/);

  const noMatchStop = { id: 'NOMATCH', name: 'No Match Stop', routes: ['30'], routeAuthorities: { '30': ['BODS'] } };
  const noMatch = await assessmentFor([noMatchStop], { ok: true, data: [], warnings: [], provenance: { source: 'Department for Transport Bus Open Data Service', sourceCompleteness: 'COMPLETE', timetableConclusion: 'NO_CURRENT_MATCH' } }).assess({});
  assert.equal(noMatch.stops[0].timetableEvidenceStatus, 'NO_CURRENT_MATCH');
  assert.match(stopRoutesPresentation(noMatch.stops[0]), /no current timetable match/);
});

test('stop-scoped outcomes survive unrelated national failures and repeated route numbers', async () => {
  const good = { ...stopA, routes: ['20'], routeAuthorities: { '20': ['BODS'] } };
  const failed = { ...stopB, routes: ['20'], routeAuthorities: { '20': ['BODS'] } };
  const matched = await assessmentFor([good, failed], { ok: true, data: [serviceFor('good-20', '20', good.id)], warnings: [], provenance: {
    source: 'Department for Transport Bus Open Data Service', sourceCompleteness: 'PARTIAL', timetableConclusion: 'MATCHED',
    checkedStopIds: [good.id], unresolvedStopIds: [failed.id], failedRequests: 1, nationalUnresolvedRoutes: ['20'],
    failedShardDiagnostics: [{ status: 'missing', key: 'BBBBB', stopIds: [failed.id] }]
  } }).assess({});
  assert.equal(matched.stops.find(stop => stop.id === good.id).timetableEvidenceStatus, 'MATCHED');
  assert.equal(matched.stops.find(stop => stop.id === failed.id).timetableEvidenceStatus, 'SOURCE_UNAVAILABLE');
  assert.equal(matched.status, 'partial');
  assert.ok(matched.serviceSummaries.some(service => service.routeNumber === '20'));
  assert.ok(matched.reviewItems.some(item => item.code === 'timetable-shard-failure' && item.stop === failed.id));

  const noCurrent = await assessmentFor([good, failed], { ok: true, data: [], warnings: [], provenance: {
    source: 'Department for Transport Bus Open Data Service', sourceCompleteness: 'PARTIAL', timetableConclusion: 'UNRESOLVED',
    checkedStopIds: [good.id], noCurrentRequestIdentities: [`20|${good.id}`], unresolvedStopIds: [failed.id], failedRequests: 1
  } }).assess({});
  assert.equal(noCurrent.stops.find(stop => stop.id === good.id).timetableEvidenceStatus, 'NO_CURRENT_MATCH');
  assert.equal(noCurrent.stops.find(stop => stop.id === failed.id).timetableEvidenceStatus, 'SOURCE_UNAVAILABLE');

  const routeLess = { id: 'ROUTELESS', name: 'Nearby only', routes: [], transportMode: 'bus_coach' };
  const noRoutes = await assessmentFor([routeLess, failed], { ok: true, data: [], warnings: [], provenance: {
    source: 'Department for Transport Bus Open Data Service', sourceCompleteness: 'PARTIAL', timetableConclusion: 'UNRESOLVED',
    checkedStopIds: [routeLess.id], unresolvedStopIds: [failed.id], failedRequests: 1
  } }).assess({});
  assert.equal(noRoutes.stops.find(stop => stop.id === routeLess.id).timetableEvidenceStatus, 'NO_ROUTES');
  assert.equal(noRoutes.stops.find(stop => stop.id === failed.id).timetableEvidenceStatus, 'SOURCE_UNAVAILABLE');
  assert.equal(recommendedBusStop(noRoutes.stops.find(stop => stop.id === routeLess.id)), false);
});

test('source-unavailable route-bearing stops remain recommended while Other nearby stays separate', () => {
  assert.equal(recommendedBusStop({ id: 'affected', routes: ['20'], timetableMatch: false, timetableEvidenceStatus: 'SOURCE_UNAVAILABLE' }), true);
  assert.equal(recommendedBusStop({ id: 'other', transportMode: 'bus_coach', routes: [], timetableMatch: false, timetableEvidenceStatus: 'SOURCE_UNAVAILABLE' }), false);
  assert.equal(plannerStopWarning('The prepared dataset reported no bus stops within the selected distance.', { stops: [{ id: 'waltham-1' }] }), '');
  assert.equal(plannerStopWarning('The prepared dataset reported no bus stops within the selected distance.', { stops: [] }), 'No bus stops were found within the selected distance.');
});

test('station access infrastructure is not reported as a missing timetable call point', async () => {
  const entrance = { id: '0590BCE01L', name: 'Queensgate station entrance', routes: [], transportMode: 'bus_coach', timetableCallEligible: false, timetableCallExpectation: 'not_expected' };
  const assessment = await assessmentFor([entrance], { ok: false, code: 'unavailable_source', data: [], warnings: [], provenance: { failedRequests: 1, unresolvedStopIds: [entrance.id] } }).assess({});
  assert.equal(assessment.stops[0].timetableEvidenceStatus, 'NOT_A_TIMETABLE_CALL_POINT');
  assert.equal(assessment.reviewItems.some(item => item.code === 'timetable-shard-failure' && item.stop === entrance.id), false);
});

test('Word export carries the same partial national qualification as the planner wording', () => {
  const result = { ok: true, stops: [{ id: 'BBBBB', name: 'Beta Stop', routes: ['20'], timetableEvidenceStatus: 'SOURCE_UNAVAILABLE', timetableMatch: false, walking: { status: 'routed', distanceMetres: 100, durationSeconds: 60 }, cycling: { status: 'routed', distanceMetres: 200, durationSeconds: 120 } }], plannerServiceSummaries: [], serviceSummaries: [], reviewItems: [] };
  const tables = buildBusWordTables(result);
  const texts = tables.flatMap(table => table.rows).flatMap(row => Array.isArray(row) ? row : [row.text]).filter(Boolean).join(' ');
  assert.match(texts, /not been treated as absent/);
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS BUS-ROBUSTNESS-1B - ${name}`);
}
console.log(`${tests.length} BUS-ROBUSTNESS-1B tests passed.`);
