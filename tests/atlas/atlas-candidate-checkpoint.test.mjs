import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { candidateCacheKey, CHECKPOINT_RELATIVE_PATH, createVerifiedCandidateCheckpoint, resolveCandidateTimestamp, restoreVerifiedCandidateCheckpoint } from '../../tools/atlas-data-publication/candidate-checkpoint.mjs';
import { CANDIDATE_COMPATIBILITY_FILES, computeCandidateGenerationCompatibilityFingerprint } from '../../tools/atlas-data-publication/candidate-compatibility.mjs';
import { measurePublicationTree } from '../../tools/atlas-data-publication/publication.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const execFileAsync = promisify(execFile);
const checkpointCli = path.join(root, 'tools', 'atlas-data-publication', 'candidate-checkpoint.mjs');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-recovery-0f-'));
const candidate = path.join(temp, 'candidate');
const generatedAt = '2026-09-18T10:00:00Z';
const producerSha = '2e079f2aa3c290914b941ecc92536abdfefe065d';
const currentSha = '4e9485efa786fe6a663f6414d098f1fb2fc52a41';
const producerRunId = '35336892470';
const currentRunId = '35336892471';
const workflowName = 'ATLAS Bus data refresh';
const producerCacheKey = candidateCacheKey({ runId: producerRunId });

async function localEsmDependencyClosure(relativeEntry) {
  const closure = new Set();
  const importPattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  async function visit(relative) {
    const normalised = relative.replaceAll('\\', '/');
    if (closure.has(normalised)) return;
    closure.add(normalised);
    const source = await fs.readFile(path.join(root, ...normalised.split('/')), 'utf8');
    for (const match of source.matchAll(importPattern)) {
      if (!match[1].startsWith('.')) continue;
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(normalised), match[1]));
      await visit(dependency);
    }
  }
  await visit(relativeEntry);
  return [...closure].sort();
}

const expectedTndsGeneratorClosure = [
  'src/atlas/adapters/tnds-transxchange-adapter.mjs',
  'src/atlas/domain/bus-service-assessment.mjs',
  'src/atlas/domain/scheduled-evidence.mjs',
  'src/atlas/domain/service-calendar.mjs',
  'tools/atlas-bus-data/prepare_tnds.mjs'
].sort();
const actualTndsGeneratorClosure = await localEsmDependencyClosure('tools/atlas-bus-data/prepare_tnds.mjs');
assert.deepEqual(actualTndsGeneratorClosure, expectedTndsGeneratorClosure, 'TNDS generator local dependency closure must remain explicit and bounded');
for (const dependency of actualTndsGeneratorClosure) assert.ok(CANDIDATE_COMPATIBILITY_FILES.includes(dependency), `${dependency} must be covered by the candidate-generation compatibility contract`);

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
const runCli = args => execFileAsync(process.execPath, [checkpointCli, ...args], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
await assert.rejects(() => createVerifiedCandidateCheckpoint({ candidateSite: candidate, runId: producerRunId, runAttempt: '1', commitSha: producerSha, workflowName, cacheKey: producerCacheKey, repositoryRoot: root, gates: { candidateValidation: 'failed', deterministicChecks: 'passed', capacityMeasurement: 'passed' } }), /requires candidate validation/);
assert.equal(await fs.stat(checkpointFile).then(() => true, () => false), false, 'checkpoint must not be saved before all validation gates pass');

const cliArgs = ['--create', '--candidate-site', candidate, '--current-run-id', producerRunId, '--run-attempt', '1', '--current-commit-sha', producerSha, '--workflow-name', workflowName, '--current-ref', 'refs/heads/main', '--event-name', 'workflow_dispatch', '--repository-root', root, '--cache-key', producerCacheKey, '--gate-candidate-validation', 'passed', '--gate-deterministic-checks', 'passed', '--gate-capacity-measurement', 'passed', '--now', '2026-09-18T10:05:00Z'];
const cliCreate = await runCli(cliArgs);
assert.match(cliCreate.stdout, /atlas-verified-candidate-checkpoint-v2/);
const checkpoint = await fs.readFile(checkpointFile, 'utf8').then(JSON.parse);
assert.equal(checkpoint.schema, 'atlas-verified-candidate-checkpoint-v2');
assert.equal(checkpoint.identity.candidateGenerationTimestamp, generatedAt);
assert.equal(checkpoint.identity.producerRunId, producerRunId);
assert.equal(checkpoint.identity.producerCommitSha, producerSha);
assert.equal(checkpoint.candidate.bus.fileCount, busMeasurement.fileCount);
assert.equal(checkpoint.candidate.tnds.fileCount, tndsMeasurement.fileCount);
assert.match(checkpoint.statusManifestSha256, /^[a-f0-9]{64}$/);

await fs.rm(checkpointFile);
const missingGateArgs = [...cliArgs];
for (const gate of ['--gate-candidate-validation', '--gate-deterministic-checks', '--gate-capacity-measurement']) { const index = missingGateArgs.indexOf(gate); missingGateArgs.splice(index, 2); }
await assert.rejects(() => runCli(missingGateArgs), /Candidate checkpoint operation failed/);
assert.equal(await fs.stat(checkpointFile).then(() => true, () => false), false, 'actual CLI must fail closed when workflow gate plumbing is missing');
await runCli(cliArgs);

const cliRestore = await runCli(['--restore', '--candidate-site', candidate, '--requested-producer-run-id', producerRunId, '--current-run-id', producerRunId, '--current-commit-sha', producerSha, '--workflow-name', workflowName, '--current-ref', 'refs/heads/main', '--event-name', 'workflow_dispatch', '--explicit-resume', 'false', '--repository-root', root, '--cache-hit', 'true', '--cache-matched-key', producerCacheKey, '--now', '2026-09-18T10:10:00Z']);
assert.match(cliRestore.stdout, /exact verified candidate checkpoint restored/);

const sameRunRetry = await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' });
assert.equal(sameRunRetry.ok, true, 'same-run retry must restore the exact producer checkpoint');
assert.equal(sameRunRetry.crossRun, false);
assert.equal(candidateCacheKey({ runId: producerRunId }), candidateCacheKey({ runId: producerRunId }), 'run attempts intentionally do not alter the exact retry key');

const crossRun = await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId, currentCommitSha: currentSha, workflowName, currentRef: 'refs/heads/main', eventName: 'workflow_dispatch', explicitResume: true, repositoryRoot: root, now: '2026-09-18T10:15:00Z' });
assert.equal(crossRun.ok, true, 'explicit cross-commit resume must restore a compatible producer checkpoint');
assert.equal(crossRun.crossRun, true);
assert.equal(crossRun.checkpoint.identity.producerCommitSha, producerSha, 'producer provenance must remain original');
assert.equal(crossRun.checkpoint.identity.currentCommitSha, producerSha, 'cross-run restore must not rewrite producer provenance');

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

await fs.writeFile(statusPath, JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: generatedAt, repositoryCommit: producerSha, workflowRun: producerRunId, tampered: true }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'status manifest corruption must fail closed');
await fs.writeFile(statusPath, JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: generatedAt, repositoryCommit: currentSha, workflowRun: producerRunId }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'status producer commit substitution must fail closed');
await fs.writeFile(statusPath, JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: generatedAt, repositoryCommit: producerSha, workflowRun: producerRunId }));

await rewriteCheckpoint(value => ({ ...value, statusManifestSha256: '0'.repeat(64) }));
assert.equal((await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' })).ok, false, 'checkpoint status provenance hash corruption must fail closed');
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
assert.ok(CANDIDATE_COMPATIBILITY_FILES.includes('tools/atlas-bus-data/prepared_data_v2.py'), 'v2 parser must be fingerprint-covered');
assert.notEqual(fingerprint.sha256, '093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af223', 'Run #24 v1 fingerprint must not be treated as v2-compatible');
await rewriteCheckpoint(value => ({ ...value, identity: { ...value.identity, candidateGenerationCompatibilityFingerprint: { ...value.identity.candidateGenerationCompatibilityFingerprint, sha256: '093d047c87482aba3d5b90844608046ece18bd673f9228dab504030883af223' } } }));
const oldRun24Checkpoint = await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' });
assert.equal(oldRun24Checkpoint.ok, false, 'Run #24 checkpoint fingerprint must fail closed for this v2 foundation');
await fs.writeFile(checkpointFile, `${JSON.stringify(checkpoint, null, 2)}\n`);
const parserChange = await computeCandidateGenerationCompatibilityFingerprint({ rootDir: root, fileOverrides: { 'tools/atlas-bus-data/prepared_data_v2.py': Buffer.from('synthetic v2 parser change') } });
assert.notEqual(parserChange.sha256, fingerprint.sha256, 'Changing the v2 parser must invalidate candidate compatibility');
for (const relative of ['.github/workflows/atlas-bus-data-refresh.yml', 'tools/atlas-data-publication/publish-bank.mjs', 'tools/atlas-data-publication/publish-snapshot.mjs', 'tools/atlas-data-publication/wait-for-bank.mjs', 'tools/atlas-data-publication/validate-publication.mjs', 'tools/atlas-data-publication/candidate-checkpoint.mjs', 'tools/atlas-data-publication/publication.mjs', 'tools/atlas-data-publication/candidate-compatibility.mjs']) {
  const publicationOnly = await computeCandidateGenerationCompatibilityFingerprint({ rootDir: root, fileOverrides: { [relative]: Buffer.from(`downstream correction ${relative}`) } });
  assert.deepEqual(publicationOnly, fingerprint, `${relative} correction must not invalidate candidate-generation compatibility`);
}
for (const relative of CANDIDATE_COMPATIBILITY_FILES) {
  const generatorChange = await computeCandidateGenerationCompatibilityFingerprint({ rootDir: root, fileOverrides: { [relative]: Buffer.from(`synthetic generator change ${relative}`) } });
  assert.notEqual(generatorChange.sha256, fingerprint.sha256, `${relative} changes must invalidate compatibility`);
}

for (const relative of ['tools/atlas-data-publication/publication.mjs', 'tools/atlas-data-publication/candidate-compatibility.mjs']) {
  const file = path.join(root, ...relative.split('/'));
  const original = await fs.readFile(file);
  try {
    await fs.writeFile(file, Buffer.concat([original, Buffer.from('\n// synthetic downstream correction\n')]));
    const compatibleAfterCorrection = await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: producerCacheKey, requestedProducerRunId: producerRunId, currentRunId: producerRunId, currentCommitSha: producerSha, workflowName, repositoryRoot: root, now: '2026-09-18T10:10:00Z' });
    assert.equal(compatibleAfterCorrection.ok, true, `${relative} correction must leave the candidate eligible`);
  } finally {
    await fs.writeFile(file, original);
  }
}

console.log('PASS Recovery-0F.2 v2 checkpoint: same-run retry, explicit cross-commit resume, exact producer key, provenance, freshness, trust boundary, fingerprint compatibility and payload-integrity fail-closed coverage.');
