import assert from 'node:assert/strict';
import { createEvidence, evidenceFromCache } from '../../src/atlas/domain/evidence.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS Evidence — ${name}`); };
const base = {
  subject: { entityType: 'bus-stop', id: '490TEST001', name: 'Fixture Stop' },
  evidenceType: 'bus.stop.nearby',
  value: { distanceMetres: 72 },
  units: 'metres',
  source: { name: 'Transport for London Unified API', authoritative: true, recordIdentifier: '490TEST001', endpoint: 'https://api.tfl.gov.uk/StopPoint?fixture=1' },
  retrievedAt: '2026-08-24T10:00:00.000Z',
  validationStatus: 'validated',
  confidenceStatus: 'authoritative',
  freshness: { status: 'live-current', assessedAt: '2026-08-24T10:00:00.000Z', validUntil: '2026-08-24T10:05:00.000Z' },
  cache: { status: 'miss', key: 'fixture' }
};

test('valid Evidence creation', () => assert.equal(createEvidence(base).evidenceType, 'bus.stop.nearby'));
test('source provenance is mandatory', () => assert.throws(() => createEvidence({ ...base, source: { name: 'TfL', authoritative: true } }), /record identifier and endpoint/));
test('retrieval timestamps are validated', () => assert.throws(() => createEvidence({ ...base, retrievedAt: 'not-a-date' }), /ISO-8601/));
test('warnings and validation state are retained', () => {
  const evidence = createEvidence({ ...base, warnings: ['Dataset version unavailable'], validationStatus: 'warning' });
  assert.equal(evidence.validationStatus, 'warning');
  assert.deepEqual(evidence.warnings, ['Dataset version unavailable']);
});
test('freshness and cache states are controlled', () => {
  const cached = evidenceFromCache(createEvidence(base), { status: 'hit', key: 'fixture', storedAt: '2026-08-24T10:00:01.000Z' });
  assert.equal(cached.freshness.status, 'cached-current');
  assert.equal(cached.cache.status, 'hit');
});
test('null facts require controlled unavailable state', () => assert.throws(() => createEvidence({ ...base, value: null }), /unavailable/));

console.log(`${passed} Evidence tests passed.`);
