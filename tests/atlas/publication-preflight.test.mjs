import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { checkRemoteStorageHealth, parsePublicationBanks, preflightPublication, readDeployedConfiguration } from '../../tools/atlas-data-publication/preflight-publication.mjs';

const banks = [
  { id: 'A', roots: ['A1', 'A2', 'A3'].map(id => ({ id, repository: `owner/${id.toLowerCase()}`, siteUrl: `https://owner.github.io/${id.toLowerCase()}/` })) },
  { id: 'B', roots: ['B1', 'B2', 'B3'].map(id => ({ id, repository: `owner/${id.toLowerCase()}`, siteUrl: `https://owner.github.io/${id.toLowerCase()}/` })) }
];
const valid = { busRepository: 'owner/bus-data', busSiteUrl: 'https://owner.github.io/bus-data/', banksJson: JSON.stringify(banks), activeConfig: { datasets: { tnds: { activeBank: 'A', activeRoots: [{ id: 'A1', baseUrl: 'https://owner.github.io/a1/' }] } } }, token: 'INJECTED_TEST_TOKEN', branch: 'pages-publish', toolkitRepository: 'owner/transport-planner-toolkit' };
const healthyProbe = async () => ({ branchPresent: true });
const healthy = async ({ remote }) => ({ status: 'measured', remote, sizeBytes: 1024, sizeLimitBytes: 3_000_000_000, warning: null });
const writable = async () => ({ push: true, metadata: { size: 1 } });
const marked = async ({ siteUrl }) => ({ ok: true, markerUrl: `${siteUrl}atlas-publication-site.json` });
const dependencies = { probe: healthyProbe, permissionProbe: writable, siteHealthProbe: marked, healthCheck: healthy };
const execFileAsync = promisify(execFile);

assert.throws(() => parsePublicationBanks('{bad'), /not valid JSON/);
assert.throws(() => parsePublicationBanks(JSON.stringify({})), /exactly two banks/);

const duplicateBanks = structuredClone(banks);
duplicateBanks[1].id = 'A';
await assert.rejects(() => preflightPublication({ ...valid, banksJson: JSON.stringify(duplicateBanks), ...dependencies }), /bank IDs must be unique/);

const duplicateRoots = structuredClone(banks);
duplicateRoots[1].roots[0].id = 'A1';
await assert.rejects(() => preflightPublication({ ...valid, banksJson: JSON.stringify(duplicateRoots), ...dependencies }), /root IDs must be unique/);

const duplicateRepositories = structuredClone(banks);
duplicateRepositories[1].roots[0].repository = 'owner/a1';
await assert.rejects(() => preflightPublication({ ...valid, banksJson: JSON.stringify(duplicateRepositories), ...dependencies }), /repository identities must be unique/);

const duplicateSites = structuredClone(banks);
duplicateSites[0].roots[0].siteUrl = 'https://shared.example.test/';
duplicateSites[1].roots[0].siteUrl = 'https://shared.example.test/';
await assert.rejects(() => preflightPublication({ ...valid, banksJson: JSON.stringify(duplicateSites), ...dependencies }), /site URLs must be unique/);

let probeCalls = 0;
await assert.rejects(() => preflightPublication({ ...valid, token: '', ...dependencies, probe: async () => { probeCalls += 1; return { branchPresent: true }; } }), /ATLAS_REFERENCE_DATA_TOKEN/);
assert.equal(probeCalls, 0);

await assert.rejects(() => preflightPublication({ ...valid, ...dependencies, probe: async () => { throw new Error('remote denied'); } }), /preflight failed/);
const bootstrap = await preflightPublication({ ...valid, activeConfig: null, ...dependencies });
assert.equal(bootstrap.ok, true);
assert.equal(bootstrap.bootstrap, true);
assert.equal(bootstrap.repositories.every(item => item.branchPresent && item.writePermission && item.siteHealth.ok), true);

await assert.rejects(() => preflightPublication({ ...valid, ...dependencies, probe: async () => ({ branchPresent: false }) }), /required pages-publish branch is absent/);
await assert.rejects(() => preflightPublication({ ...valid, ...dependencies, permissionProbe: async () => ({ push: false }) }), /push permission/);
await assert.rejects(() => preflightPublication({ ...valid, ...dependencies, siteHealthProbe: async () => { throw new Error('marker missing'); } }), /marker missing/);
await assert.rejects(() => preflightPublication({ ...valid, ...dependencies, healthCheck: async () => { throw new Error('health threshold'); } }), /health threshold/);

await assert.rejects(() => preflightPublication({ ...valid, ...dependencies, activeConfig: { datasets: { tnds: { activeBank: 'Z' } } } }), /active TNDS bank Z is absent/);
await assert.rejects(() => preflightPublication({ ...valid, ...dependencies, busRepository: 'owner/transport-planner-toolkit' }), /must not point to transport-planner-toolkit/);
await assert.rejects(() => preflightPublication({ ...valid, ...dependencies, busSiteUrl: 'http://owner.github.io/bus-data/' }), /must be HTTPS/);

const measured = await checkRemoteStorageHealth({ remote: 'C:/tmp/publication-remote.git', sizeLimitBytes: 10 * 1024, exec: async () => ({ stdout: 'count: 1\nsize: 2\nsize-pack: 3\n' }) });
assert.equal(measured.status, 'measured');
assert.equal(measured.sizeBytes, 5 * 1024);
await assert.rejects(() => checkRemoteStorageHealth({ remote: 'C:/tmp/publication-remote.git', sizeLimitBytes: 4 * 1024, exec: async () => ({ stdout: 'count: 1\nsize: 2\nsize-pack: 3\n' }) }), /health threshold/);
const githubMeasured = await checkRemoteStorageHealth({ remote: 'https://github.com/owner/repo.git', metadata: { size: 1 }, sizeLimitBytes: 2 * 1024 });
assert.equal(githubMeasured.status, 'measured');
assert.equal(githubMeasured.source, 'github-repository-metadata');
await assert.rejects(() => checkRemoteStorageHealth({ remote: 'https://github.com/owner/repo.git', metadata: { size: 4 }, sizeLimitBytes: 3 * 1024 }), /health threshold/);

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-preflight-cli-'));
const missingConfig = path.join(temp, 'missing', 'atlas-data-sources.json');
const malformedConfig = path.join(temp, 'malformed', 'atlas-data-sources.json');
await fs.mkdir(path.dirname(malformedConfig), { recursive: true });
await fs.writeFile(malformedConfig, '{not-json');
await assert.rejects(() => readDeployedConfiguration(malformedConfig), /malformed or unreadable/);
const fixturePath = path.join(temp, 'fixture.json');
await fs.writeFile(fixturePath, JSON.stringify({ branchPresent: true, push: true, marker: true, sizeKilobytes: 1 }));
const cli = await execFileAsync(process.execPath, ['tools/atlas-data-publication/preflight-publication.mjs', '--config', missingConfig, '--fixture', fixturePath], { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), env: { ...process.env, ATLAS_BUS_DATA_REPOSITORY: 'owner/bus-data', ATLAS_BUS_DATA_SITE_URL: 'https://owner.github.io/bus-data/', ATLAS_TNDS_BANKS_JSON: JSON.stringify(banks), ATLAS_REFERENCE_DATA_TOKEN: 'INJECTED_TEST_TOKEN', GITHUB_REPOSITORY: 'owner/transport-planner-toolkit' }, maxBuffer: 10 * 1024 * 1024 });
const cliResult = JSON.parse(cli.stdout);
assert.equal(cliResult.bootstrap, true);
console.log('PASS production publication preflight: legacy-config CLI bootstrap, seeded branch/marker, write permission, contract safety and repository-health threshold checks.');
