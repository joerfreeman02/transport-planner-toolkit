import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { prepareBankRepositories } from '../../tools/atlas-data-publication/checkout-bank.mjs';
import { preparePublications } from '../../tools/atlas-data-publication/publication.mjs';
import { publishSnapshot } from '../../tools/atlas-data-publication/publish-snapshot.mjs';
import { validatePublishedConfiguration as validateConfig } from '../../tools/atlas-data-publication/validate-publication.mjs';
import { publicationTargetsFromConfig, waitForPublicationIdentity } from '../../tools/atlas-data-publication/wait-for-bank.mjs';

const execFileAsync = promisify(execFile);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-publication-lifecycle-'));
const candidate = path.join(temp, 'candidate');
const busRepository = path.join(temp, 'bus');
const busRemote = path.join(temp, 'bus.git');
const configOutput = path.join(temp, 'publication-config', 'atlas-data-sources.mjs');
const run = async (cwd, args) => (await execFileAsync('git', ['-C', cwd, ...args], { maxBuffer: 10 * 1024 * 1024 })).stdout.trim();

await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus', 'services'), { recursive: true });
await fs.mkdir(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services'), { recursive: true });
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt: '2026-09-18T00:00:00Z' }));
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', '100-se.json.gz'), 'bus-v1');
await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-09-18T00:00:00Z', expectedRegions: ['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y'] }));
for (const region of ['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']) await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus-tnds', 'services', `100-${region.toLowerCase()}.json`), `tnds-${region}-v1`);

await run(temp, ['init', '--bare', 'bus.git']);
await run(temp, ['init', '--quiet', 'bus']);
await run(busRepository, ['remote', 'add', 'origin', busRemote]);

const bankDefinitions = ['A', 'B'].flatMap(bank => [1, 2, 3].map(index => ({ id: `${bank}${index}`, repository: path.join(temp, `${bank}${index}`), siteUrl: `https://${bank.toLowerCase()}${index}.example.test/` })));
for (const root of bankDefinitions) {
  const remote = path.join(temp, `${root.id}.git`);
  await run(temp, ['init', '--bare', `${root.id}.git`]);
  await run(temp, ['init', '--quiet', root.id]);
  await run(path.join(temp, root.id), ['remote', 'add', 'origin', remote]);
}
const banks = ['A', 'B'].map(id => ({ id, roots: bankDefinitions.filter(root => root.id.startsWith(id)) }));
const plan = { candidateBankId: 'A', banks: banks.map(bank => ({ ...bank, roots: bank.roots.map(root => ({ ...root, remoteRepository: 'owner/' + root.id.toLowerCase() })) })) };
await fs.mkdir(path.join(temp, 'A1', 'services'), { recursive: true });
await fs.writeFile(path.join(temp, 'A1', 'services', 'old-service.json'), 'old payload must not be staged');
const preparation = await prepareBankRepositories({ plan, token: 'INJECTED_TEST_TOKEN' });
assert.equal(preparation.roots.every(root => root.preparedWithoutFetch), true);
assert.doesNotMatch(JSON.stringify(preparation), /INJECTED_TEST_TOKEN/);
assert.equal(await fs.access(path.join(temp, 'A1', 'services', 'old-service.json')).then(() => true).catch(() => false), false);
for (const root of bankDefinitions.filter(item => item.id.startsWith('A'))) await run(root.repository, ['remote', 'set-url', 'origin', path.join(temp, `${root.id}.git`)]);

async function publishResult(result) {
  await publishSnapshot({ repository: busRepository, branch: 'pages-publish', message: `Bus ${result.config.publicationVersion}` });
  for (const root of result.candidateBank.roots) await publishSnapshot({ repository: root.repository, branch: 'pages-publish', message: `${result.config.publicationVersion} ${root.id}` });
}

function repositoryForUrl(url) {
  const value = String(url);
  if (value.startsWith('https://bus.example.test/')) return { base: 'https://bus.example.test/', repository: busRepository };
  const root = bankDefinitions.find(item => value.startsWith(item.siteUrl));
  if (!root) throw new Error(`No synthetic publication root for ${value}`);
  return { base: root.siteUrl, repository: root.repository };
}

async function fetchPublished(url) {
  const request = String(url);
  const mapping = repositoryForUrl(request);
  const relative = request.slice(mapping.base.length).split(/[?#]/)[0];
  const target = path.join(mapping.repository, ...relative.split('/').filter(Boolean));
  try {
    const bytes = await fs.readFile(target);
    return { ok: true, status: 200, text: async () => bytes.toString('utf8'), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } catch { return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }; }
}

async function waitFor(config, staleConfig = null) {
  const targets = publicationTargetsFromConfig(config);
  let publicationCalls = 0;
  let clock = 0;
  return waitForPublicationIdentity({ targets, fetchImpl: async (url, options) => {
    if (String(url).endsWith('publication-manifest.json') && staleConfig && Math.floor(publicationCalls++ / targets.length) < 2) {
      const target = targets.find(item => String(url).startsWith(item.baseUrl));
      const oldRoot = target.dataset === 'bus' ? staleConfig.datasets.bus : staleConfig.datasets.tnds.activeRoots.find(root => root.id === target.expectedRootId);
      return { ok: true, status: 200, text: async () => JSON.stringify({ dataset: target.dataset, publicationVersion: staleConfig.publicationVersion, bankId: target.dataset === 'tnds' ? staleConfig.datasets.tnds.activeBank : null, rootId: target.dataset === 'tnds' ? target.expectedRootId : null, slot: target.dataset === 'bus' ? staleConfig.datasets.bus.slot : null, payload: { files: [] } }) };
    }
    return fetchPublished(url, options);
  }, timeoutMs: 20, intervalMs: 1, now: () => clock, sleep: async () => { clock += 1; } });
}

const first = await preparePublications({ candidateSite: candidate, busRepository, tndsBanks: banks, candidateTndsBank: 'A', publicationVersion: 'v1', generatedAt: '2026-09-18T00:00:00Z', busSiteUrl: 'https://bus.example.test/', configOutput });
await publishResult(first);
await waitFor(first.config);
assert.equal((await validateConfig({ config: first.config, fetchImpl: fetchPublished })).activeTndsBank, 'A');

await fs.writeFile(path.join(candidate, 'atlas', 'data', 'bus', 'services', '100-se.json.gz'), 'bus-v2');
const second = await preparePublications({ candidateSite: candidate, busRepository, tndsBanks: banks, activeTndsBank: 'A', candidateTndsBank: 'B', previousConfig: first.config, activeBusSlot: 'slot-a', publicationVersion: 'v2', generatedAt: '2026-09-18T01:00:00Z', busSiteUrl: 'https://bus.example.test/', configOutput });
await publishResult(second);
await waitFor(second.config, first.config);
await validateConfig({ config: second.config, fetchImpl: fetchPublished });

const third = await preparePublications({ candidateSite: candidate, busRepository, tndsBanks: banks, activeTndsBank: 'B', candidateTndsBank: 'A', previousConfig: second.config, activeBusSlot: 'slot-b', publicationVersion: 'v3', generatedAt: '2026-09-18T02:00:00Z', busSiteUrl: 'https://bus.example.test/', configOutput });
await publishResult(third);
await waitFor(third.config, second.config);
await validateConfig({ config: third.config, fetchImpl: fetchPublished });

const activeConfig = third.config;
await assert.rejects(() => waitFor({ ...third.config, publicationVersion: 'v4' }, third.config), /did not become visible/);
assert.equal(activeConfig.publicationVersion, 'v3');
assert.equal(activeConfig.datasets.tnds.activeBank, 'A');
console.log('PASS synthetic publication lifecycle: bootstrap A, stale-aware B, overwrite A without inactive clone, and failed candidate leaves active A unchanged.');
