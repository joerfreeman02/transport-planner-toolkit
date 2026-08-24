import assert from 'node:assert/strict';
import { createSite, confirmSite, SITE_LOCATION_METHODS } from '../../src/atlas/domain/site.mjs';
import { createNaptanBusStopAdapter, parseCsv } from '../../src/atlas/adapters/naptan-bus-stop-adapter.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';

const confirmed = confirmSite(createSite({ suppliedAddress: 'Waltham Cross fixture', displayAddress: 'Waltham Cross fixture', latitude: 51.685, longitude: -0.034, locationMethod: SITE_LOCATION_METHODS.COORDINATES_ENTERED }));
const csv = `ATCOCode,NaptanCode,CommonName,Indicator,Bearing,Longitude,Latitude,StopType,Status\n2100001,hrtawpa,High Street,Stop A,N,-0.0342,51.6852,BCT,active\n2100002,hrtawpb,High Street,Stop B,S,-0.0338,51.6848,BCT,active\n2100001,hrtawpa,High Street,Stop A,N,-0.0342,51.6852,BCT,active\n9100001,,Waltham Cross Rail Station,,,-0.026,51.685,RLY,active\n`;
const response = body => ({ ok: true, status: 200, headers: new Headers(), text: async () => body });
const make = (fetchImpl, resolveAtcoAreaCodes = async () => ({ atcoAreaCodes: ['210'], rationale: 'Fixture Hertfordshire resolver' })) => createNaptanBusStopAdapter({ fetchImpl, resolveAtcoAreaCodes, cache: createJsonCache({ storage: createMemoryStorage() }), clock: () => new Date('2026-08-24T14:00:00Z'), timeoutMs: 10 });
let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`PASS NaPTAN — ${name}`); };

await test('quoted CSV parsing preserves commas and escaped quotes', () => assert.deepEqual(parseCsv('a,b\n"x,y","z""q"\n'), [['a', 'b'], ['x,y', 'z"q']]));
await test('opposite-direction same-name stops remain distinct while true duplicates are removed', async () => {
  const result = await make(async () => response(csv)).nearbyStops(confirmed);
  assert.equal(result.ok, true);
  assert.equal(result.data.length, 2);
  assert.deepEqual(result.data.map(stop => stop.id), ['2100001', '2100002']);
  assert.deepEqual(result.data.map(stop => stop.direction).sort(), ['N', 'S']);
  assert.match(result.warnings.join(' '), /duplicate/i);
  assert.equal(result.provenance.atcoAreaCodes[0], '210');
  assert.equal(result.evidence.every(item => item.source.authoritative), true);
});
await test('non-bus NaPTAN records are excluded', async () => assert.equal((await make(async () => response(csv)).nearbyStops(confirmed)).data.some(stop => stop.stopType === 'RLY'), false));
await test('a genuine resolved-area zero remains a successful zero', async () => {
  const empty = csv.split('\n')[0] + '\n';
  const result = await make(async () => response(empty)).nearbyStops(confirmed);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, []);
  assert.match(result.warnings.join(' '), /no bus stops/i);
});
await test('missing geographic gateway is coverage not implemented rather than zero', async () => {
  let called = false;
  const result = await createNaptanBusStopAdapter({ fetchImpl: async () => { called = true; }, cache: createJsonCache({ storage: createMemoryStorage() }) }).nearbyStops(confirmed);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'coverage_not_implemented');
  assert.equal(called, false);
  assert.match(result.warnings.join(' '), /No zero-stop conclusion/i);
});
await test('unresolved ATCO area is explicit coverage not implemented', async () => assert.equal((await make(async () => response(csv), async () => ({ atcoAreaCodes: [] })).nearbyStops(confirmed)).code, 'coverage_not_implemented'));
await test('malformed official CSV is rejected', async () => assert.equal((await make(async () => response('wrong,header\n1,2\n')).nearbyStops(confirmed)).code, 'invalid_response'));
await test('source failure remains distinct from coverage', async () => assert.equal((await make(async () => { throw new Error('offline'); }).nearbyStops(confirmed)).code, 'unavailable_source'));

console.log(`${passed} NaPTAN adapter tests passed.`);
