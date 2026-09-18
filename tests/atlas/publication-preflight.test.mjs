import assert from 'node:assert/strict';
import { checkRemoteStorageHealth, parsePublicationBanks, preflightPublication } from '../../tools/atlas-data-publication/preflight-publication.mjs';

const banks = [
  { id: 'A', roots: ['A1', 'A2', 'A3'].map(id => ({ id, repository: `owner/${id.toLowerCase()}`, siteUrl: `https://owner.github.io/${id.toLowerCase()}/` })) },
  { id: 'B', roots: ['B1', 'B2', 'B3'].map(id => ({ id, repository: `owner/${id.toLowerCase()}`, siteUrl: `https://owner.github.io/${id.toLowerCase()}/` })) }
];
const valid = { busRepository: 'owner/bus-data', busSiteUrl: 'https://owner.github.io/bus-data/', banksJson: JSON.stringify(banks), activeConfig: { datasets: { tnds: { activeBank: 'A', activeRoots: [{ id: 'A1', baseUrl: 'https://owner.github.io/a1/' }] } } }, token: 'INJECTED_TEST_TOKEN', branch: 'pages-publish', toolkitRepository: 'owner/transport-planner-toolkit' };
const healthyProbe = async () => ({ branchPresent: true });
const healthy = async ({ remote }) => ({ status: 'measured', remote, sizeBytes: 1024, sizeLimitBytes: 3_000_000_000, warning: null });

assert.throws(() => parsePublicationBanks('{bad'), /not valid JSON/);
assert.throws(() => parsePublicationBanks(JSON.stringify({})), /exactly two banks/);

const duplicateBanks = structuredClone(banks);
duplicateBanks[1].id = 'A';
await assert.rejects(() => preflightPublication({ ...valid, banksJson: JSON.stringify(duplicateBanks), probe: healthyProbe, healthCheck: healthy }), /bank IDs must be unique/);

const duplicateRoots = structuredClone(banks);
duplicateRoots[1].roots[0].id = 'A1';
await assert.rejects(() => preflightPublication({ ...valid, banksJson: JSON.stringify(duplicateRoots), probe: healthyProbe, healthCheck: healthy }), /root IDs must be unique/);

const duplicateRepositories = structuredClone(banks);
duplicateRepositories[1].roots[0].repository = 'owner/a1';
await assert.rejects(() => preflightPublication({ ...valid, banksJson: JSON.stringify(duplicateRepositories), probe: healthyProbe, healthCheck: healthy }), /repository identities must be unique/);

const duplicateSites = structuredClone(banks);
duplicateSites[0].roots[0].siteUrl = 'https://shared.example.test/';
duplicateSites[1].roots[0].siteUrl = 'https://shared.example.test/';
await assert.rejects(() => preflightPublication({ ...valid, banksJson: JSON.stringify(duplicateSites), probe: healthyProbe, healthCheck: healthy }), /site URLs must be unique/);

let probeCalls = 0;
await assert.rejects(() => preflightPublication({ ...valid, token: '', probe: async () => { probeCalls += 1; return { branchPresent: true }; }, healthCheck: healthy }), /ATLAS_REFERENCE_DATA_TOKEN/);
assert.equal(probeCalls, 0);

await assert.rejects(() => preflightPublication({ ...valid, probe: async () => { throw new Error('remote denied'); }, healthCheck: healthy }), /authenticated git ls-remote/);
const bootstrap = await preflightPublication({ ...valid, activeConfig: null, probe: async () => ({ branchPresent: false }), healthCheck: healthy });
assert.equal(bootstrap.ok, true);
assert.equal(bootstrap.bootstrap, true);
assert.equal(bootstrap.repositories.every(item => item.bootstrapAllowed), true);

await assert.rejects(() => preflightPublication({ ...valid, activeConfig: { datasets: { tnds: { activeBank: 'Z' } } }, probe: healthyProbe, healthCheck: healthy }), /active TNDS bank Z is absent/);
await assert.rejects(() => preflightPublication({ ...valid, busRepository: 'owner/transport-planner-toolkit', probe: healthyProbe, healthCheck: healthy }), /must not point to transport-planner-toolkit/);
await assert.rejects(() => preflightPublication({ ...valid, busSiteUrl: 'http://owner.github.io/bus-data/', probe: healthyProbe, healthCheck: healthy }), /must be HTTPS/);

const measured = await checkRemoteStorageHealth({ remote: 'C:/tmp/publication-remote.git', sizeLimitBytes: 10 * 1024, exec: async () => ({ stdout: 'count: 1\nsize: 2\nsize-pack: 3\n' }) });
assert.equal(measured.status, 'measured');
assert.equal(measured.sizeBytes, 5 * 1024);
await assert.rejects(() => checkRemoteStorageHealth({ remote: 'C:/tmp/publication-remote.git', sizeLimitBytes: 4 * 1024, exec: async () => ({ stdout: 'count: 1\nsize: 2\nsize-pack: 3\n' }) }), /health threshold/);
console.log('PASS production publication preflight: contract duplicates, token, branch bootstrap, active-bank safety and repository-health threshold checks.');
