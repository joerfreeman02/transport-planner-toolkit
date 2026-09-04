import assert from 'node:assert/strict';
import { createPreparedBusDataAdapter, nearbyGridCellKeys } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createSite, confirmSite } from '../../src/atlas/domain/site.mjs';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
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
