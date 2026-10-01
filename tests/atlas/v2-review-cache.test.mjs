import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildPreparedCacheMarker, preparedCacheMarkerMatches } from '../../tools/atlas-review/v2-review-cache.mjs';
import { computeCandidateGenerationCompatibilityFingerprint } from '../../tools/atlas-data-publication/candidate-compatibility.mjs';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const unchanged = await computeCandidateGenerationCompatibilityFingerprint({ rootDir });
const changed = await computeCandidateGenerationCompatibilityFingerprint({
  rootDir,
  fileOverrides: { 'tools/atlas-bus-data/build_static_index.py': Buffer.from('changed generator') }
});
assert.notEqual(changed.sha256, unchanged.sha256, 'a generator change must change the compatibility fingerprint');

const marker = buildPreparedCacheMarker({
  runId: '36125621080',
  snapshotId: 'frozen-snapshot',
  snapshotReport: { reuseMode: 'FROZEN_DIAGNOSTIC_EXPLICIT' },
  manifest: { schema: 'atlas-prepared-bus-data-v2', version: '2.1.0', counts: {}, generatedAt: '2026-10-01T00:00:00Z' },
  generatorFingerprint: unchanged
});
const expected = { sourceRunId: '36125621080', sourceSnapshotId: 'frozen-snapshot', preparedSchema: 'atlas-prepared-bus-data-v2', preparedDataVersion: '2.1.0', generatorFingerprint: unchanged };
assert.equal(preparedCacheMarkerMatches(marker, expected), true, 'matching source and generator identity must reuse the cache');
assert.equal(preparedCacheMarkerMatches(marker, { ...expected, generatorFingerprint: changed }), false, 'changed generator identity must rebuild the cache');
assert.equal(preparedCacheMarkerMatches({ ...marker, preparedDataVersion: '2.0.0' }, expected), false, 'prepared-data version mismatch must rebuild the cache');
assert.equal(preparedCacheMarkerMatches({ runId: marker.runId, snapshotId: marker.snapshotId }, expected), false, 'legacy markers without the new identity must be stale');

console.log('PASS V2 review cache identity - source, schema, prepared version and generator fingerprint are fail-closed.');
