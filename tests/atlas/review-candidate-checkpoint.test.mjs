import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createReviewCheckpoint, verifyReviewCheckpoint } from '../../tools/atlas-data-publication/review-candidate-checkpoint.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-review-checkpoint-'));
try {
  const candidate = path.join(root, 'candidate-site');
  const checkpoint = path.join(root, 'checkpoint');
  const writeJson = async (relative, value) => {
    const target = path.join(candidate, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(value)}\n`);
  };
  const writeGzipJson = async (relative, value) => {
    const target = path.join(candidate, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, gzipSync(JSON.stringify(value)));
  };
  await writeJson('atlas/config/atlas-release.json', { version: '2.0.0-alpha.15', build: 'ATLAS-2.0.0-alpha.15-20260914' });
  await writeJson('atlas/data/bus/manifest.json', { schema: 'atlas-prepared-bus-data-v2', sources: { bods: { regions: Array.from({ length: 9 }, (_, i) => ({ region: String(i) })) } } });
  await writeGzipJson('atlas/data/bus/services/route.json.gz', { circularPatternStopIds: ['A', 'B'] });
  await writeJson('atlas/data/bus-tnds/manifest.json', { schema: 'atlas-prepared-bus-tnds-v1', regions: ['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y'] });
  await writeGzipJson('atlas/data/bus-tnds/services/route.json.gz', { routePatternStopIds: ['A', 'B'] });
  await writeJson('atlas/data/status/manifest.json', {
    schema: 'atlas-bus-refresh-status-v1', reviewOnly: true, productionEligible: false, publicationEligible: false, plannerEligible: false,
    sources: {
      sourceSnapshot: { snapshotId: 'a'.repeat(64), producer: { runId: '101', workflow: 'primary-producer' } },
      tnds: { sourceSnapshot: { snapshotId: 'b'.repeat(64), producer: { runId: '202', workflow: 'tnds-producer' } } }
    }
  });
  const provenance = path.join(root, 'provenance.json');
  await fs.writeFile(provenance, JSON.stringify({ repository: 'owner/repo', workflow: 'review',
    primary: { snapshotId: 'a'.repeat(64), producerRunId: '101', producerWorkflow: 'primary-producer', artifactId: '1', artifactDigest: `sha256:${'1'.repeat(64)}` },
    tnds: { snapshotId: 'b'.repeat(64), producerRunId: '202', producerWorkflow: 'tnds-producer', artifactId: '2', artifactDigest: `sha256:${'2'.repeat(64)}` } }));
  const created = await createReviewCheckpoint({ candidateRoot: candidate, checkpointRoot: checkpoint, provenancePath: provenance,
    commitSha: 'c'.repeat(40), runId: '303', createdAt: '2026-10-16T00:00:00Z' });
  assert.equal(created.state, 'BUILT_STRUCTURALLY_VERIFIED_REVIEW_ONLY');
  assert.equal(created.plannerEligible, false);
  const restored = await verifyReviewCheckpoint({ candidateRoot: candidate, checkpointRoot: checkpoint, expectedRunId: '303', expectedCommitSha: 'c'.repeat(40) });
  assert.equal(restored.sourceBinding.primaryProducerRunId, '101');
  await fs.appendFile(path.join(candidate, 'atlas/data/bus/services/route.json.gz'), 'tampered');
  await assert.rejects(verifyReviewCheckpoint({ candidateRoot: candidate, checkpointRoot: checkpoint, expectedRunId: '303', expectedCommitSha: 'c'.repeat(40) }), /file set or hashes/);
  await assert.rejects(verifyReviewCheckpoint({ candidateRoot: candidate, checkpointRoot: checkpoint, expectedRunId: '999', expectedCommitSha: 'c'.repeat(40) }), /producer run/);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
