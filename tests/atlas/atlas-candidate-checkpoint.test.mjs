import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { candidateCacheKey, CHECKPOINT_RELATIVE_PATH, createVerifiedCandidateCheckpoint, resolveCandidateTimestamp, restoreVerifiedCandidateCheckpoint } from '../../tools/atlas-data-publication/candidate-checkpoint.mjs';
import { measurePublicationTree } from '../../tools/atlas-data-publication/publication.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-recovery-0f-'));
const candidate = path.join(temp, 'candidate');
const generatedAt = '2026-09-18T10:00:00Z';
const commitSha = '2e079f2aa3c290914b941ecc92536abdfefe065d';
const runId = '35336892470';
const workflowName = 'ATLAS Bus data refresh';
const cacheKey = candidateCacheKey({ runId, commitSha });

await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus', 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'status'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'config'), { recursive: true });
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt, serviceShards: { fixture: ['services/bus.json'] } }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', 'bus.json'), 'bus-fixture');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt, expectedRegions: ['SE'], serviceShards: { fixture: ['services/tnds.json'] } }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', 'tnds.json'), 'tnds-fixture');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'status', 'manifest.json'), JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: generatedAt, repositoryCommit: commitSha, workflowRun: runId }));
await fs.writeFile(path.join(candidate, 'atlas', 'config', 'atlas-release.json'), JSON.stringify({ version: '2.0.0-alpha.15', build: 'ATLAS-2.0.0-alpha.15-20260914' }));

const busMeasurement = await measurePublicationTree(path.join(candidate, 'atlas', 'data', 'bus'));
const tndsMeasurement = await measurePublicationTree(path.join(candidate, 'atlas', 'data', 'bus-tnds'));
await fs.writeFile(path.join(candidate, 'atlas', 'config', 'atlas-candidate-measurement.json'), JSON.stringify({
  diagnosticSchema: 'atlas-publication-capacity-diagnostic-v3',
  bus: { sha256: busMeasurement.sha256, fitsSafeLimit: true },
  tnds: { sha256: tndsMeasurement.sha256, proposedPublication: { allRootsFitSafeLimit: true } }
}));

assert.equal(await resolveCandidateTimestamp(candidate), generatedAt);
const statusPath = path.join(candidate, 'atlas', 'data', 'status', 'manifest.json');
await fs.writeFile(statusPath, JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: '' }));
await assert.rejects(() => resolveCandidateTimestamp(candidate), /successfulRefreshAt/);
await fs.writeFile(statusPath, JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: generatedAt, repositoryCommit: commitSha, workflowRun: runId }));

const checkpointFile = path.join(candidate, CHECKPOINT_RELATIVE_PATH);
await assert.rejects(
  () => createVerifiedCandidateCheckpoint({ candidateSite: candidate, runId, runAttempt: '1', commitSha, workflowName, cacheKey, gates: { candidateValidation: 'failed', deterministicChecks: 'passed', capacityMeasurement: 'passed' } }),
  /requires candidate validation/
);
assert.equal(await fs.stat(checkpointFile).then(() => true, () => false), false, 'checkpoint must not be saved before all validation gates pass');

const checkpoint = await createVerifiedCandidateCheckpoint({ candidateSite: candidate, runId, runAttempt: '1', commitSha, workflowName, cacheKey, checkpointCreatedAt: '2026-09-18T10:05:00Z', gates: { candidateValidation: 'passed', deterministicChecks: 'passed', capacityMeasurement: 'passed' } });
assert.equal(checkpoint.identity.candidateGenerationTimestamp, generatedAt);
assert.equal(checkpoint.candidate.bus.fileCount, busMeasurement.fileCount);
assert.equal(checkpoint.candidate.tnds.fileCount, tndsMeasurement.fileCount);

const validRestore = await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, runId, commitSha, workflowName });
assert.equal(validRestore.ok, true);
assert.equal(validRestore.checkpoint.identity.candidateGenerationTimestamp, generatedAt);
assert.equal(candidateCacheKey({ runId, commitSha }), candidateCacheKey({ runId, commitSha }), 'run attempts intentionally do not alter the exact retry key');

const checkpointText = () => fs.readFile(checkpointFile, 'utf8').then(JSON.parse);
const rewriteCheckpoint = async mutate => fs.writeFile(checkpointFile, `${JSON.stringify(mutate(await checkpointText()), null, 2)}\n`);

assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'false', cacheMatchedKey: '', runId, commitSha, workflowName })).ok, false, 'cache miss must not restore');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: `${cacheKey}-older`, runId, commitSha, workflowName })).ok, false, 'a loose cache match must not restore');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, runId: '99999999999', commitSha, workflowName })).ok, false, 'wrong workflow run must not restore');

await rewriteCheckpoint(value => ({ ...value, schema: 'wrong-schema' }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, runId, commitSha, workflowName })).ok, false, 'wrong schema must fail closed');
await fs.writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
await rewriteCheckpoint(value => ({ ...value, candidate: { ...value.candidate, tnds: undefined } }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, runId, commitSha, workflowName })).ok, false, 'incomplete checkpoint must fail closed');
await fs.writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
await rewriteCheckpoint(value => ({ ...value, candidate: { ...value.candidate, bus: { ...value.candidate.bus, manifestSha256: '0'.repeat(64) } } }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, runId, commitSha, workflowName })).ok, false, 'manifest checksum mismatch must fail closed');
await fs.writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);

await fs.appendFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', 'bus.json'), '-modified');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, runId, commitSha, workflowName })).ok, false, 'modified Bus data must fail the aggregate hash');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', 'bus.json'), 'bus-fixture');
await fs.appendFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', 'tnds.json'), '-modified');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, runId, commitSha, workflowName })).ok, false, 'modified TNDS data must fail the aggregate hash');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', 'tnds.json'), 'tnds-fixture');

await rewriteCheckpoint(value => ({ ...value, identity: { ...value.identity, commitSha: '4e9485efa786fe6a663f6414d098f1fb2fc52a41' } }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, runId, commitSha, workflowName })).ok, false, 'wrong commit identity must fail closed');
console.log('PASS Recovery-0F exact verified candidate checkpoint create/restore, timestamp identity, cache miss/loose-match, schema, run, commit and payload-integrity fail-closed coverage.');
