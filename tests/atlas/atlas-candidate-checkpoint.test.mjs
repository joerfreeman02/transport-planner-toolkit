import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateCacheKey, CHECKPOINT_RELATIVE_PATH, createVerifiedCandidateCheckpoint, resolveCandidateTimestamp, restoreVerifiedCandidateCheckpoint } from '../../tools/atlas-data-publication/candidate-checkpoint.mjs';
import { computeCandidateGenerationCompatibilityFingerprint } from '../../tools/atlas-data-publication/candidate-compatibility.mjs';
import { measurePublicationTree } from '../../tools/atlas-data-publication/publication.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-recovery-0f-'));
const candidate = path.join(temp, 'candidate');
const generatedAt = '2026-09-18T10:00:00Z';
const producerSha = '2e079f2aa3c290914b941ecc92536abdfefe065d';
const currentSha = '4e9485efa786fe6a663f6414d098f1fb2fc52a41';
const producerRunId = '35336892470';
const currentRunId = '35336892471';
const workflowName = 'ATLAS Bus data refresh';
const producerCacheKey = candidateCacheKey({ runId: producerRunId });

await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus', 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'status'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'config'), { recursive: true });
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt, refreshAfterDays: 8, serviceShards: { fixture: ['services/bus.json'] } }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', 'bus.json'), 'bus-fixture');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt, expectedRegions: ['SE'], serviceShards: { fixture: ['services/tnds.json'] } }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', 'tnds.json'), 'tnds-fixture');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'status', 'manifest.json'), JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: generatedAt, repositoryCommit: producerSha, workflowRun: producerRunId }));
await fs.writeFile(path.join(candidate, 'atlas', 'config', 'atlas-release.json'), JSON.stringify({ version: '2.0.0-alpha.15', build: 'ATLAS-2.0.0-alpha.15-20260914' }));

const busMeasurement = await measurePublicationTree(path.join(candidate, 'atlas', 'data', 'bus'));
const tndsMeasurement = await measurePublicationTree(path.join(candidate, 'atlas', 'data', 'bus-tnds'));
await fs.writeFile(path.join(candidate, 'atlas', 'config', 'atlas-candidate-measurement.json'), JSON.stringify({ diagnosticSchema: 'atlas-publication-capacity-diagnostic-v3', bus: { sha256: busMeasurement.sha256, fitsSafeLimit: true }, tnds: { sha256: tndsMeasurement.sha256, proposedPublication: { allRootsFitSafeLimit: true } } }));

assert.equal(await resolveCandidateTimestamp(candidate), generatedAt);
const statusPath = path.join(candidate, 'atlas', 'data', 'status', 'manifest.json');
await fs.writeFile(statusPath, JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: '' }));
await assert.rejects(() => resolveCandidateTimestamp(candidate), /successfulRefreshAt/);
await fs.writeFile(statusPath, JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: generatedAt, repositoryCommit: producerSha, workflowRun: producerRunId }));

const checkpointFile = path.join(candidate, CHECKPOINT_RELATIVE_PATH);
await assert.rejects(() => createVerifiedCandidateCheckpoint({ candidateSite: candidate, runId: producerRunId, runAttempt: '1', commitSha: producerSha, workflowName, cacheKey: producerCacheKey, repositoryRoot: root, gates: { candidateValidation: 'failed', deterministicChecks: 'passed', capacityMeasurement: 'passed' } }), /requires candidate validation/);
assert.equal(await fs.stat(checkpointFile).then(() => true, () => false), false, 'checkpoint must not be saved before all validation gates pass');

const checkpoint = await createVerifiedCandidateCheckpoint({ candidateSite: candidate, runId: producerRunId, runAttempt: '1', commitSha: producerSha, workflowName, cacheKey: producerCacheKey, repositoryRoot: root, checkpointCreatedAt: '2026-09-18T10:05:00Z', now: '2026-09-18T10:05:00Z', gates: { candidateValidation: 'passed', deterministicChecks: 'passed', capacityMeasurement: 'passed' } });
assert.equal(checkpoint.schema, 'atlas-verified-candidate-checkpoint-v2');
assert.equal(checkpoint.identity.candidateGenerationTimestamp, generatedAt);
assert.equal(checkpoint.identity.producerRunId, producerRunId);
assert.equal(checkpoint.identity.producerCommitSha, producerSha);
assert.equal(checkpoint.candidate.bus.fileCount, busMeasurement.fileCount);
assert.equal(checkpoint.candidate.tnds.fileCount, tndsMeasurement.fileCount);

const sameRunRetry = await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' });
assert.equal(sameRunRetry.ok, true, 'same-run retry must restore the exact producer checkpoint');
assert.equal(sameRunRetry.crossRun, false);
assert.equal(candidateCacheKey({ runId: producerRunId }), candidateCacheKey({ runId: producerRunId }), 'run attempts intentionally do not alter the exact retry key');

const crossRun = await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId, currentCommitSha: currentSha, workflowName, currentRef: 'refs/heads/main', eventName: 'workflow_dispatch', explicitResume: true, repositoryRoot: root, now: '2026-09-18T10:15:00Z' });
assert.equal(crossRun.ok, true, 'explicit cross-commit resume must restore a compatible producer checkpoint');
assert.equal(crossRun.crossRun, true);
assert.equal(crossRun.checkpoint.identity.producerCommitSha, producerSha, 'producer provenance must remain original');
assert.equal(crossRun.checkpoint.identity.currentCommitSha, producerSha, 'restore must not rewrite provenance before rebase');

assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId, currentCommitSha: currentSha, workflowName, currentRef: 'refs/heads/main', eventName: 'workflow_dispatch', explicitResume: false, repositoryRoot: root, now: '2026-09-18T10:15:00Z' })).ok, false, 'cross-run resume must require the explicit resume input');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId, currentCommitSha: currentSha, workflowName, currentRef: 'refs/heads/main', eventName: 'push', explicitResume: true, repositoryRoot: root, now: '2026-09-18T10:15:00Z' })).ok, false, 'cross-run resume must require workflow_dispatch');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId, currentCommitSha: currentSha, workflowName, currentRef: 'refs/heads/feature', eventName: 'workflow_dispatch', explicitResume: true, repositoryRoot: root, now: '2026-09-18T10:15:00Z' })).ok, false, 'cross-run resume must require main');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: '99999999999', currentRunId, currentCommitSha: currentSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:15:00Z' })).ok, false, 'wrong producer run must not fall back to another cache key');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId, currentCommitSha: currentSha, workflowName, repositoryRoot: root, now: '2026-09-27T10:15:00Z' })).ok, false, 'expired candidate must fail closed');

const checkpointText = () => fs.readFile(checkpointFile, 'utf8').then(JSON.parse);
const rewriteCheckpoint = async mutate => fs.writeFile(checkpointFile, `${JSON.stringify(mutate(await checkpointText()), null, 2)}\n`);
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'false', cacheMatchedKey: '', requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'cache miss must not restore');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: `${producerCacheKey}-older`, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'a loose cache match must not restore');

await rewriteCheckpoint(value => ({ ...value, schema: 'wrong-schema' }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'wrong schema must fail closed');
await fs.writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
await rewriteCheckpoint(value => ({ ...value, candidate: { ...value.candidate, tnds: undefined } }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'incomplete checkpoint must fail closed');
await fs.writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
await rewriteCheckpoint(value => ({ ...value, candidate: { ...value.candidate, bus: { ...value.candidate.bus, manifestSha256: '0'.repeat(64) } } }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'manifest checksum mismatch must fail closed');
await fs.writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);

await rewriteCheckpoint(value => ({ ...value, identity: { ...value.identity, producerRef: 'refs/heads/untrusted', productionEligible: false } }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId, currentCommitSha: currentSha, workflowName, currentRef: 'refs/heads/main', eventName: 'workflow_dispatch', explicitResume: true, repositoryRoot: root, now: '2026-09-18T10:15:00Z' })).ok, false, 'untrusted producer must fail closed');
await fs.writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);

await fs.appendFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', 'bus.json'), '-modified');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'modified Bus data must fail the aggregate hash');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', 'bus.json'), 'bus-fixture');
await fs.appendFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', 'tnds.json'), '-modified');
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'modified TNDS data must fail the aggregate hash');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', 'tnds.json'), 'tnds-fixture');

const fingerprint = await computeCandidateGenerationCompatibilityFingerprint({ rootDir: root });
const publicationOnly = await computeCandidateGenerationCompatibilityFingerprint({ rootDir: root, fileOverrides: { 'tools/atlas-data-publication/publish-snapshot.mjs': Buffer.from('publication-only change') } });
assert.deepEqual(publicationOnly, fingerprint, 'publication-only changes must not invalidate candidate-generation compatibility');
const candidateCodeChange = await computeCandidateGenerationCompatibilityFingerprint({ rootDir: root, fileOverrides: { 'tools/atlas-bus-data/build_static_index.py': Buffer.from('candidate-generation change') } });
assert.notEqual(candidateCodeChange.sha256, fingerprint.sha256, 'candidate-producing changes must invalidate compatibility');

console.log('PASS Recovery-0F.1 v2 checkpoint: same-run retry, explicit cross-commit resume, exact producer key, provenance, freshness, trust boundary, fingerprint compatibility and payload-integrity fail-closed coverage.');
