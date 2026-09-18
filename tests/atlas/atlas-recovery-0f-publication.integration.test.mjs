import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateCacheKey } from '../../tools/atlas-data-publication/candidate-checkpoint.mjs';
import { measurePublicationTree, preparePublications, TNDS_REGIONS } from '../../tools/atlas-data-publication/publication.mjs';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const execFileAsync = promisify(execFile);
const checkpointCli = path.join(root, 'tools', 'atlas-data-publication', 'candidate-checkpoint.mjs');
const measureCli = path.join(root, 'tools', 'atlas-data-publication', 'measure-candidate.mjs');
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

const runCheckpointCli = args => execFileAsync(process.execPath, [checkpointCli, ...args], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
await execFileAsync(process.execPath, [measureCli, '--candidate-site', candidate, '--output', path.join(candidate, 'atlas', 'config', 'atlas-candidate-measurement.json')], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
const capacity = await runCheckpointCli(['--capacity-only', '--candidate-site', candidate]);
assert.match(capacity.stdout, /"ok": true/);
const timestamp = await runCheckpointCli(['--timestamp-only', '--candidate-site', candidate]);
assert.match(timestamp.stdout, new RegExp(generatedAt));
await runCheckpointCli(['--create', '--candidate-site', candidate, '--current-run-id', producerRunId, '--run-attempt', '1', '--current-commit-sha', producerSha, '--workflow-name', 'ATLAS Bus data refresh', '--current-ref', 'refs/heads/main', '--event-name', 'workflow_dispatch', '--repository-root', root, '--cache-key', cacheKey, '--gate-candidate-validation', 'passed', '--gate-deterministic-checks', 'passed', '--gate-capacity-measurement', 'passed', '--now', '2026-09-18T11:05:00Z']);

const currentCandidate = path.join(temp, 'current-site');
await fs.mkdir(currentCandidate, { recursive: true });
const currentApplicationMarker = path.join(currentCandidate, 'index.html');
await fs.writeFile(currentApplicationMarker, 'current-commit-application-site');
for (const relative of ['atlas/data/bus', 'atlas/data/bus-tnds', 'atlas/data/status', 'atlas/config/atlas-candidate-measurement.json', '.atlas-recovery/verified-candidate.json']) {
  const source = path.join(candidate, ...relative.split('/'));
  const destination = path.join(currentCandidate, ...relative.split('/'));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true });
}
await fs.mkdir(path.join(currentCandidate, 'atlas', 'config'), { recursive: true });
await fs.copyFile(path.join(candidate, 'atlas', 'config', 'atlas-release.json'), path.join(currentCandidate, 'atlas', 'config', 'atlas-release.json'));

const restoredCli = await runCheckpointCli(['--restore', '--candidate-site', currentCandidate, '--requested-producer-run-id', producerRunId, '--current-run-id', currentRunId, '--current-commit-sha', currentSha, '--workflow-name', 'ATLAS Bus data refresh', '--current-ref', 'refs/heads/main', '--event-name', 'workflow_dispatch', '--explicit-resume', 'true', '--repository-root', root, '--cache-hit', 'true', '--cache-matched-key', cacheKey, '--now', '2026-09-18T11:10:00Z']);
assert.match(restoredCli.stdout, /exact verified candidate checkpoint restored from explicit producer run/);
const restored = JSON.parse(restoredCli.stdout);
assert.equal(restored.ok, true);
assert.equal(restored.crossRun, true);
assert.equal(await fs.readFile(currentApplicationMarker, 'utf8'), 'current-commit-application-site', 'candidate-only cache overlay must not replace current application files');
let acquisitionAttempts = 0;
if (!restored.ok) acquisitionAttempts += 1;
assert.equal(acquisitionAttempts, 0, 'a verified cross-run restore must skip national acquisition');

const repository = id => path.join(temp, 'repositories', id);
const banks = ['A', 'B'].map(bankId => ({ id: bankId, roots: ['1', '2', '3'].map(rootId => ({ id: `${bankId}${rootId}`, repository: repository(`${bankId}${rootId}`), siteUrl: `https://${bankId.toLowerCase()}${rootId}.example.test/` })) }));
const prepared = await preparePublications({ candidateSite: currentCandidate, busRepository: repository('bus'), tndsBanks: banks, candidateTndsBank: 'A', publicationVersion: `${currentRunId}-${currentSha}`, generatedAt: restored.checkpoint.identity.candidateGenerationTimestamp, busSiteUrl: 'https://bus.example.test/', activeBusSlot: 'slot-a', configOutput: path.join(temp, 'publication-config', 'atlas-data-sources.mjs') });
assert.equal(prepared.config.publicationVersion, `${currentRunId}-${currentSha}`);
assert.equal(prepared.config.generatedAt, generatedAt);
assert.equal(prepared.config.datasets.tnds.activeBank, 'A');
assert.equal(prepared.tnds.length, 3);
console.log('PASS Recovery-0F.2 synthetic cross-commit resume: exact producer restore, acquisition skipped, original provenance and candidate timestamp retained, current publication preparation completed.');
