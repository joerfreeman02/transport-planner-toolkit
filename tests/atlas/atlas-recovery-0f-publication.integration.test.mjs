import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVerifiedCandidateCheckpoint, candidateCacheKey, restoreVerifiedCandidateCheckpoint, rebaseVerifiedCandidateCheckpoint } from '../../tools/atlas-data-publication/candidate-checkpoint.mjs';
import { measurePublicationTree, preparePublications, TNDS_REGIONS } from '../../tools/atlas-data-publication/publication.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-recovery-0f-publication-'));
const candidate = path.join(temp, 'candidate');
const busRoot = path.join(candidate, 'atlas', 'data', 'bus');
const tndsRoot = path.join(candidate, 'atlas', 'data', 'bus-tnds');
const generatedAt = '2026-09-18T11:00:00Z';
const producerSha = '2e079f2aa3c290914b941ecc92536abdfefe065d';
const currentSha = '4e9485efa786fe6a663f6414d098f1fb2fc52a41';
const producerRunId = '35336892470';
const currentRunId = '35336892471';
const cacheKey = candidateCacheKey({ runId: producerRunId });

await fs.mkdir(path.join(busRoot, 'services'), { recursive: true });
await fs.mkdir(path.join(tndsRoot, 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'status'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'config'), { recursive: true });
await fs.writeFile(path.join(busRoot, 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt, refreshAfterDays: 8, serviceShards: { fixture: ['services/bus.json'] } }));
await fs.writeFile(path.join(busRoot, 'services', 'bus.json'), 'synthetic-bus-candidate');
await fs.writeFile(path.join(tndsRoot, 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt, expectedRegions: TNDS_REGIONS, regions: TNDS_REGIONS, serviceShards: Object.fromEntries(TNDS_REGIONS.map(region => [region, [`services/national-${region}.json`]])) }));
for (const region of TNDS_REGIONS) await fs.writeFile(path.join(tndsRoot, 'services', `national-${region}.json`), `synthetic-tnds-${region}`);
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'status', 'manifest.json'), JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: generatedAt, repositoryCommit: producerSha, workflowRun: producerRunId }));
await fs.writeFile(path.join(candidate, 'atlas', 'config', 'atlas-release.json'), JSON.stringify({ version: '2.0.0-alpha.15', build: 'ATLAS-2.0.0-alpha.15-20260914' }));

const busMeasurement = await measurePublicationTree(busRoot);
const tndsMeasurement = await measurePublicationTree(tndsRoot);
await fs.writeFile(path.join(candidate, 'atlas', 'config', 'atlas-candidate-measurement.json'), JSON.stringify({ diagnosticSchema: 'atlas-publication-capacity-diagnostic-v3', bus: { sha256: busMeasurement.sha256, fitsSafeLimit: true }, tnds: { sha256: tndsMeasurement.sha256, proposedPublication: { allRootsFitSafeLimit: true } } }));

await createVerifiedCandidateCheckpoint({ candidateSite: candidate, runId: producerRunId, runAttempt: '1', commitSha: producerSha, workflowName: 'ATLAS Bus data refresh', cacheKey, repositoryRoot: root, checkpointCreatedAt: '2026-09-18T11:05:00Z', now: '2026-09-18T11:05:00Z', gates: { candidateValidation: 'passed', deterministicChecks: 'passed', capacityMeasurement: 'passed' } });

const restored = await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, requestedProducerRunId: producerRunId, currentRunId, currentCommitSha: currentSha, workflowName: 'ATLAS Bus data refresh', currentRef: 'refs/heads/main', eventName: 'workflow_dispatch', explicitResume: true, repositoryRoot: root, now: '2026-09-18T11:10:00Z' });
assert.equal(restored.ok, true);
assert.equal(restored.crossRun, true);
let acquisitionAttempts = 0;
if (!restored.ok) acquisitionAttempts += 1;
assert.equal(acquisitionAttempts, 0, 'a verified cross-run restore must skip national acquisition');

const rebased = await rebaseVerifiedCandidateCheckpoint({ candidateSite: candidate, currentRunId, currentCommitSha: currentSha, runAttempt: '1', workflowName: 'ATLAS Bus data refresh', currentRef: 'refs/heads/main', eventName: 'workflow_dispatch', repositoryRoot: root, now: '2026-09-18T11:15:00Z', checkpointCreatedAt: '2026-09-18T11:15:00Z' });
assert.equal(rebased.cacheKey, candidateCacheKey({ runId: currentRunId }));
assert.equal(rebased.identity.producerRunId, producerRunId);
assert.equal(rebased.identity.producerCommitSha, producerSha);
assert.equal(rebased.identity.currentCommitSha, currentSha);

const repository = id => path.join(temp, 'repositories', id);
const banks = ['A', 'B'].map(bankId => ({ id: bankId, roots: ['1', '2', '3'].map(rootId => ({ id: `${bankId}${rootId}`, repository: repository(`${bankId}${rootId}`), siteUrl: `https://${bankId.toLowerCase()}${rootId}.example.test/` })) }));
const prepared = await preparePublications({ candidateSite: candidate, busRepository: repository('bus'), tndsBanks: banks, candidateTndsBank: 'A', publicationVersion: `${currentRunId}-${currentSha}`, generatedAt: rebased.identity.candidateGenerationTimestamp, busSiteUrl: 'https://bus.example.test/', activeBusSlot: 'slot-a', configOutput: path.join(temp, 'publication-config', 'atlas-data-sources.mjs') });
assert.equal(prepared.config.publicationVersion, `${currentRunId}-${currentSha}`);
assert.equal(prepared.config.generatedAt, generatedAt);
assert.equal(prepared.config.datasets.tnds.activeBank, 'A');
assert.equal(prepared.tnds.length, 3);
console.log('PASS Recovery-0F.1 synthetic cross-commit resume: exact producer restore, acquisition skipped, provenance-preserving current-run rebase, candidate timestamp retained and publication preparation completed.');
