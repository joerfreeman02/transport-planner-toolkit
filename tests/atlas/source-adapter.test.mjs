import assert from 'node:assert/strict';
import { requestJson } from '../../src/atlas/infrastructure/http-client.mjs';
import { createJsonCache, createMemoryStorage } from '../../src/atlas/infrastructure/cache.mjs';
import { runCachedSourceQuery, sourceFailure, sourceSuccess } from '../../src/atlas/adapters/source-adapter.mjs';

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`PASS Adapter — ${name}`); };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body });

await test('success', async () => assert.equal((await requestJson({ url: 'https://fixture.test', fetchImpl: async () => response({ ok: true }) })).ok, true));
await test('timeout', async () => {
  const fetchImpl = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  assert.equal((await requestJson({ url: 'https://fixture.test', fetchImpl, timeoutMs: 5 })).code, 'timeout');
});
await test('HTTP failure', async () => assert.equal((await requestJson({ url: 'https://fixture.test', fetchImpl: async () => response({}, 503) })).code, 'http_failure'));
await test('invalid payload', async () => {
  const invalid = { ok: true, status: 200, headers: new Headers(), json: async () => { throw new Error('bad JSON'); } };
  assert.equal((await requestJson({ url: 'https://fixture.test', fetchImpl: async () => invalid })).code, 'invalid_response');
});
await test('empty results remain explicit success', async () => assert.deepEqual(sourceSuccess({ data: [], provenance: { source: 'fixture' } }).data, []));
await test('provenance and cached-current state survive cache use', async () => {
  let now = Date.parse('2026-08-24T10:00:00.000Z');
  const cache = createJsonCache({ storage: createMemoryStorage(), clock: () => now, namespace: 'test' });
  const live = sourceSuccess({ data: ['a'], evidence: [], provenance: { source: 'fixture', retrievedAt: new Date(now).toISOString() } });
  await runCachedSourceQuery({ cache, cacheKey: 'one', freshForMs: 1000, load: async () => live });
  now += 500;
  const cached = await runCachedSourceQuery({ cache, cacheKey: 'one', freshForMs: 1000, load: async () => sourceFailure({ code: 'unavailable_source', message: 'should not run', provenance: {} }) });
  assert.equal(cached.ok, true);
  assert.equal(cached.cache.status, 'hit');
  assert.equal(cached.provenance.source, 'fixture');
});
await test('stale data is not silently substituted after source failure', async () => {
  let now = 1000;
  const cache = createJsonCache({ storage: createMemoryStorage(), clock: () => now, namespace: 'stale-test' });
  await runCachedSourceQuery({ cache, cacheKey: 'one', freshForMs: 10, load: async () => sourceSuccess({ data: ['old'], provenance: { source: 'fixture' } }) });
  now = 2000;
  const result = await runCachedSourceQuery({ cache, cacheKey: 'one', freshForMs: 10, load: async () => sourceFailure({ code: 'unavailable_source', message: 'offline', provenance: { source: 'fixture' } }) });
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.equal(result.cache.staleAvailable, true);
});

console.log(`${passed} Adapter contract tests passed.`);
