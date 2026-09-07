import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createPreparedBusDataAdapter, nearbyGridCellKeys, normalisePreparedService } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const tests = [];

const test = (name, fn) => tests.push([name, fn]);
test('sparse BODS/TNDS service records are normalised before presentation', () => {
  const service = normalisePreparedService({ id: 'tnds:231', stopSchedules: { STOP: { monday: [480] } } });
  assert.deepEqual(service.principalLocations, []);
  assert.deepEqual(service.qualifications, []);
  assert.deepEqual(service.stopSchedules.STOP, { monday: [480], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });
});
const site = confirmSite(createSite({ suppliedAddress: 'Fixture', displayAddress: 'Fixture', latitude: 51.6858, longitude: -0.033, assessmentPoint: { method: 'coordinates_entered' } }), { confirmedAt: '2026-09-04T09:00:00Z' });
const manifest = {
  schema: 'atlas-prepared-bus-data-v1', generatedAt: '2026-09-04T08:00:00Z', refreshAfterDays: 8, gridSize: 0.1, serviceShardKeyLength: 5,
  stopFields: ['id', 'naptanCode', 'name', 'indicator', 'direction', 'latitude', 'longitude', 'stopType', 'busStopType', 'locality', 'parentLocality', 'areaCode', 'modifiedAt', 'routes'],
  sources: {
    naptan: { url: 'https://official.example/naptan', sha256: 'naptan-v1' },
    bods: { url: 'https://official.example/bods', sha256: 'bods-v1', regions: ['south-east'] }
  },
  stopShards: { g516_m1: 'stops/g516_m1.json.gz' },
  serviceShards: { '2100A': ['services/2100A-south-east.json.gz'] },
  representativeDates: { monday: '2026-09-07' }
};
const stop = { id: '2100A', naptanCode: 'hrtfixture', name: 'High Street', indicator: 'Stop A', direction: 'N', latitude: 51.6859, longitude: -0.0331, areaCode: '210', modifiedAt: '2026-08-30T12:00:00Z', routes: ['10'] };
const packedStop = manifest.stopFields.map(field => stop[field] ?? null);
const service = { id: 'south-east:10:0:one', routeNumber: '10', operator: 'Example Buses', origin: 'Town', destination: 'City', direction: 'City', principalLocations: ['Hospital'], stopSchedules: { '2100A': { monday: [360, 390] } } };

function fetchFixture(url) {
  const path = new URL(url).pathname;
  const value = path.endsWith('/manifest.json') ? manifest
    : path.endsWith('/stops/g516_m1.json.gz') ? { schema: 'atlas-prepared-bus-data-v1', stops: [packedStop] }
      : path.endsWith('/services/2100A-south-east.json.gz') ? { schema: 'atlas-prepared-bus-data-v1', services: [service] }
        : null;
  return Promise.resolve(value ? new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('', { status: 404 }));
}

test('grid selection includes a boundary neighbour for radius filtering', () => {
  assert.ok(nearbyGridCellKeys({ latitude: 51.7, longitude: -0.0001 }, 700).length >= 2);
});

test('prepared NaPTAN lookup returns authoritative nearby records with the source-record modification time', async () => {
  const adapter = createPreparedBusDataAdapter({ fetchImpl: fetchFixture, baseUrl: 'https://atlas.example/data/', clock: () => new Date('2026-09-04T10:00:00Z') });
  const result = await adapter.nearbyStops(site, { radius: 700 });
  assert.equal(result.ok, true);
  assert.equal(result.data[0].id, '2100A');
  assert.equal(result.evidence[0].source.name, 'Department for Transport NaPTAN');
  assert.equal(result.evidence[0].source.datasetTimestamp, stop.modifiedAt);
  assert.match(result.evidence[0].calculationMethodology, /Straight-line discovery distance/);
});


test('invalid NaPTAN modification timestamps are not promoted into Evidence metadata', async () => {
  const fields = manifest.stopFields;
  const invalidStop = { ...stop, modifiedAt: 'not-a-date' };
  const invalidPacked = fields.map(field => invalidStop[field] ?? null);
  const invalidFetch = async url => {
    const pathname = new URL(url).pathname;
    const value = pathname.endsWith('/manifest.json') ? manifest
      : pathname.endsWith('/stops/g516_m1.json.gz') ? { schema: 'atlas-prepared-bus-data-v1', stops: [invalidPacked] }
        : null;
    return value ? new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('', { status: 404 });
  };
  const adapter = createPreparedBusDataAdapter({ fetchImpl: invalidFetch, baseUrl: 'https://atlas.example/data/' });
  const result = await adapter.nearbyStops(site, { radius: 700 });
  assert.equal(result.ok, true);
  assert.equal(result.evidence[0].source.datasetTimestamp, null);
});

test('prepared BODS lookup joins schedules by authoritative stop ID', async () => {
  const adapter = createPreparedBusDataAdapter({ fetchImpl: fetchFixture, baseUrl: 'https://atlas.example/data/' });
  const result = await adapter.servicesForStops([stop]);
  assert.equal(result.ok, true);
  assert.equal(result.data[0].routeNumber, '10');
  assert.equal(result.provenance.apiKeyEmbedded, false);
});

test('TNDS quarantine warns only when an affected selected stop is assessed', async () => {
  const tndsManifest = { schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-09-07T00:00:00Z', regions: ['SE'], services: ['services/quarantined.json', 'services/quarantined-2.json'] };
  const quarantined = { id: 'tnds:SE:fixture:Q', routeNumber: 'Q', operator: 'Example', stopSchedules: {}, tndsQuarantine: { serviceQuarantined: true, affectedStopIds: ['2100A'], patterns: [{ patternId: 'JP-Q', reasonCode: 'incomplete_runtime_sequence', affectedStopIds: ['2100A'] }] } };
  const quarantined2 = { ...quarantined, id: 'tnds:SE:fixture:Q2', tndsQuarantine: { ...quarantined.tndsQuarantine, patterns: [{ patternId: 'JP-Q2', reasonCode: 'missing_timing_links', affectedStopIds: ['2100A'] }] } };
  const fetchWithTnds = async url => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/manifest.json') && pathname.includes('/tnds/')) return new Response(JSON.stringify(tndsManifest), { status: 200 });
    if (pathname.endsWith('/services/quarantined.json')) return new Response(JSON.stringify(quarantined), { status: 200 });
    if (pathname.endsWith('/services/quarantined-2.json')) return new Response(JSON.stringify(quarantined2), { status: 200 });
    return fetchFixture(url);
  };
  const adapter = createPreparedBusDataAdapter({ fetchImpl: fetchWithTnds, baseUrl: 'https://atlas.example/data/', tndsBaseUrl: 'https://atlas.example/tnds/' });
  const affected = await adapter.servicesForStops([stop]);
  assert.equal(affected.ok, true);
  assert.equal(affected.data.some(service => service.id === quarantined.id), false);
  assert.equal(affected.warnings.filter(warning => /Supplementary timetable evidence is incomplete/.test(warning)).length, 1);
  assert.match(affected.warnings.join(' '), /one or more services/);
  assert.equal(affected.provenance.tndsServing, 'bounded-legacy-manifest');
  assert.doesNotMatch(affected.warnings.join(' '), /JP-Q|quarantined\.json/);
  const unrelated = await adapter.servicesForStops([{ ...stop, id: '9990A' }]);
  assert.equal(unrelated.ok, false);
});

test('TNDS stop-prefix shards bound requests and preserve quarantine impact', async () => {
  const calls = [];
  const shardedManifest = { ...manifest, serviceShards: { ...manifest.serviceShards, Q0000: ['services/q-bods.json'] } };
  const tndsManifest = { schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-09-07T00:00:00Z', regions: ['SE'], serviceCount: 2, serviceShardKeyLength: 5, serviceShards: { '2100A': ['services/2100A.json.gz'], Q0000: ['services/Q0000.json.gz'] } };
  const validTnds = { id: 'tnds:SE:fixture:valid', routeNumber: '10', operator: 'Example', stopSchedules: { '2100A': { monday: [360] } }, tndsQuarantine: null };
  const qTnds = { id: 'tnds:SE:fixture:q', routeNumber: 'Q', operator: 'Example', stopSchedules: {}, tndsQuarantine: { serviceQuarantined: true, affectedStopIds: ['Q0000'], patterns: [{ patternId: 'JP-Q', reasonCode: 'incomplete_runtime_sequence', affectedStopIds: ['Q0000'] }] } };
  const gzipShard = payload => gzipSync(JSON.stringify(payload));
  const validGzip = gzipShard({ schema: 'atlas-prepared-bus-tnds-v1', stopPrefix: '2100A', services: [validTnds] });
  const quarantineGzip = gzipShard({ schema: 'atlas-prepared-bus-tnds-v1', stopPrefix: 'Q0000', services: [qTnds] });
  assert.equal(validGzip[0], 0x1f);
  assert.equal(validGzip[1], 0x8b);
  const fetchSharded = async url => {
    const pathname = new URL(url).pathname;
    calls.push(pathname);
    if (pathname === '/data/manifest.json') return new Response(JSON.stringify(shardedManifest), { status: 200 });
    if (pathname === '/tnds/manifest.json') return new Response(JSON.stringify(tndsManifest), { status: 200 });
    if (pathname.endsWith('/services/q-bods.json')) return new Response(JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', services: [{ ...service, stopSchedules: { Q0000: { monday: [360] } } }] }), { status: 200 });
    if (pathname.endsWith('/services/2100A.json.gz')) return new Response(validGzip, { status: 200, headers: { 'content-type': 'application/gzip' } });
    if (pathname.endsWith('/services/Q0000.json.gz')) return new Response(quarantineGzip, { status: 200, headers: { 'content-type': 'application/gzip' } });
    return fetchFixture(url);
  };
  const adapter = createPreparedBusDataAdapter({ fetchImpl: fetchSharded, baseUrl: 'https://atlas.example/data/', tndsBaseUrl: 'https://atlas.example/tnds/' });
  const normal = await adapter.servicesForStops([stop]);
  assert.equal(normal.ok, true);
  assert.equal(normal.data.some(row => row.id === validTnds.id), true);
  assert.equal(calls.filter(pathname => pathname.includes('/tnds/services/')).length, 1);
  assert.equal(calls.some(pathname => pathname.endsWith('/services/Q0000.json.gz')), false);
  calls.length = 0;
  const oppositePair = await adapter.servicesForStops([stop, { ...stop, id: '2100A-OP' }]);
  assert.equal(oppositePair.ok, true);
  assert.equal(calls.filter(pathname => pathname.includes('/tnds/services/')).length, 1);
  calls.length = 0;
  const affected = await adapter.servicesForStops([{ ...stop, id: 'Q0000' }]);
  assert.equal(affected.ok, true);
  assert.equal(affected.data.some(row => row.id === qTnds.id), false);
  assert.equal(affected.warnings.filter(warning => /Supplementary timetable evidence is incomplete/.test(warning)).length, 1);
  assert.equal(calls.filter(pathname => pathname.includes('/tnds/services/')).length, 1);
  const malformedManifest = { ...tndsManifest, serviceShards: { '2100A': [] } };
  const malformed = createPreparedBusDataAdapter({ fetchImpl: async url => new Response(JSON.stringify(new URL(url).pathname === '/tnds/manifest.json' ? malformedManifest : shardedManifest), { status: 200 }), baseUrl: 'https://atlas.example/data/', tndsBaseUrl: 'https://atlas.example/tnds/' });
  assert.equal((await malformed.servicesForStops([stop])).ok, false);
});

test('missing prepared timetable area remains an unavailable source, not zero', async () => {
  const adapter = createPreparedBusDataAdapter({ fetchImpl: fetchFixture, baseUrl: 'https://atlas.example/data/' });
  const result = await adapter.servicesForStops([{ id: '9990A', areaCode: '999' }]);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unavailable_source');
});

test('partial timetable coverage is unavailable instead of silently treating uncovered selected stops as complete', async () => {
  const adapter = createPreparedBusDataAdapter({ fetchImpl: fetchFixture, baseUrl: 'https://atlas.example/data/' });
  const result = await adapter.servicesForStops([stop, { id: '9990A', areaCode: '999' }]);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unavailable_source');
  assert.match(result.warnings.join(' '), /No zero-service conclusion has been assumed/);
});

test('malformed prepared stop data is distinguished from a genuine zero', async () => {
  const malformedFetch = async url => new URL(url).pathname.endsWith('/manifest.json')
    ? new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response(JSON.stringify({ schema: 'atlas-prepared-bus-data-v1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  const adapter = createPreparedBusDataAdapter({ fetchImpl: malformedFetch, baseUrl: 'https://atlas.example/data/' });
  const result = await adapter.nearbyStops(site, { radius: 700 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_response');
});

for (const [name, fn] of tests) {
  await fn();
  console.log(`PASS Prepared bus data - ${name}`);
}
console.log(`${tests.length} prepared bus-data tests passed.`);
