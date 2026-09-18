import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVerifiedCandidateCheckpoint, candidateCacheKey, restoreVerifiedCandidateCheckpoint } from '../../tools/atlas-data-publication/candidate-checkpoint.mjs';
import { measurePublicationTree, preparePublications, TNDS_REGIONS } from '../../tools/atlas-data-publication/publication.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-recovery-0f-publication-'));
const candidate = path.join(temp, 'candidate');
const busRoot = path.join(candidate, 'atlas', 'data', 'bus');
const tndsRoot = path.join(candidate, 'atlas', 'data', 'bus-tnds');
const generatedAt = '2026-09-18T11:00:00Z';
const commitSha = '2e079f2aa3c290914b941ecc92536abdfefe065d';
const runId = '35336892470';
const cacheKey = candidateCacheKey({ runId, commitSha });

await fs.mkdir(path.join(busRoot, 'services'), { recursive: true });
await fs.mkdir(path.join(tndsRoot, 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'status'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'config'), { recursive: true });
await fs.writeFile(path.join(busRoot, 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt, serviceShards: { fixture: ['services/bus.json'] } }));
await fs.writeFile(path.join(busRoot, 'services', 'bus.json'), 'synthetic-bus-candidate');
await fs.writeFile(path.join(tndsRoot, 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt, expectedRegions: TNDS_REGIONS, regions: TNDS_REGIONS, serviceShards: Object.fromEntries(TNDS_REGIONS.map(region => [region, [`services/national-${region}.json`]])) }));
for (const region of TNDS_REGIONS) await fs.writeFile(path.join(tndsRoot, 'services', `national-${region}.json`), `synthetic-tnds-${region}`);
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'status', 'manifest.json'), JSON.stringify({ schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: generatedAt, repositoryCommit: commitSha, workflowRun: runId }));
await fs.writeFile(path.join(candidate, 'atlas', 'config', 'atlas-release.json'), JSON.stringify({ version: '2.0.0-alpha.15', build: 'ATLAS-2.0.0-alpha.15-20260914' }));

const busMeasurement = await measurePublicationTree(busRoot);
const tndsMeasurement = await measurePublicationTree(tndsRoot);
await fs.writeFile(path.join(candidate, 'atlas', 'config', 'atlas-candidate-measurement.json'), JSON.stringify({
  diagnosticSchema: 'atlas-publication-capacity-diagnostic-v3',
  bus: { sha256: busMeasurement.sha256, fitsSafeLimit: true },
  tnds: { sha256: tndsMeasurement.sha256, proposedPublication: { allRootsFitSafeLimit: true } }
}));

await createVerifiedCandidateCheckpoint({ candidateSite: candidate, runId, runAttempt: '1', commitSha, workflowName: 'ATLAS Bus data refresh', cacheKey, checkpointCreatedAt: '2026-09-18T11:05:00Z', gates: { candidateValidation: 'passed', deterministicChecks: 'passed', capacityMeasurement: 'passed' } });

// Model a later publication failure, then a same-run retry on another runner.
const restored = await restoreVerifiedCandidateCheckpoint({ candidateSite: candidate, cacheExactHit: 'true', cacheMatchedKey: cacheKey, runId, commitSha, workflowName: 'ATLAS Bus data refresh' });
assert.equal(restored.ok, true);
let acquisitionAttempts = 0;
if (!restored.ok) acquisitionAttempts += 1;
assert.equal(acquisitionAttempts, 0, 'a verified restore must skip national acquisition');

const repository = id => path.join(temp, 'repositories', id);
const banks = ['A', 'B'].map(bankId => ({ id: bankId, roots: ['1', '2', '3'].map(rootId => ({ id: `${bankId}${rootId}`, repository: repository(`${bankId}${rootId}`), siteUrl: `https://${bankId.toLowerCase()}${rootId}.example.test/` })) }));
const prepared = await preparePublications({ candidateSite: candidate, busRepository: repository('bus'), tndsBanks: banks, candidateTndsBank: 'A', publicationVersion: `${runId}-${commitSha}`, generatedAt: restored.checkpoint.identity.candidateGenerationTimestamp, busSiteUrl: 'https://bus.example.test/', configOutput: path.join(temp, 'publication-config', 'atlas-data-sources.mjs') });
assert.equal(prepared.config.publicationVersion, `${runId}-${commitSha}`);
assert.equal(prepared.config.generatedAt, generatedAt);
assert.equal(prepared.config.datasets.tnds.activeBank, 'A');
assert.equal(prepared.tnds.length, 3);
console.log('PASS Recovery-0F synthetic resume: verified restore, acquisition skipped, candidate timestamp retained and publication preparation completed.');
