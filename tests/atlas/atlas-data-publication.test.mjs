import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { allocateTndsPublicationRoots, allocateTndsRegions, assertPublicationFits, measurePublicationTree, preparePublications, rollbackToOppositeBank, SAFE_PUBLICATION_LIMIT_BYTES, TNDS_REGIONS } from '../../tools/atlas-data-publication/publication.mjs';
import { validatePublishedConfiguration } from '../../tools/atlas-data-publication/validate-publication.mjs';

const run22 = { EA: 60_883_253, EM: 275_641_976, NE: 110_188_604, NW: 414_171_929, SE: 519_315_700, SW: 359_859_025, WM: 307_380_041, Y: 273_746_344 };
const run22Measurement = { files: [{ path: 'manifest.json', bytes: 24_599, sha256: 'common' }, ...TNDS_REGIONS.map(region => ({ path: `services/national-${region}.json.gz`, bytes: run22[region], sha256: region }))] };
const allocation = allocateTndsPublicationRoots(run22Measurement, { rootIds: ['A1', 'A2', 'A3'] });
assert.equal(allocation.roots.length, 3, 'Run #22 must fit the approved three-root candidate bank.');
assert.ok(allocation.roots.every(root => root.projectedTotalPublicationFootprintBytes < SAFE_PUBLICATION_LIMIT_BYTES));
assert.deepEqual(allocation.roots.flatMap(root => root.regions).sort(), [...TNDS_REGIONS].sort());
assert.equal(Object.keys(allocation.shardToRoot).length, 8);
assert.equal(new Set(Object.keys(allocation.shardToRoot)).size, 8);
assert.deepEqual(allocateTndsPublicationRoots(run22Measurement, { rootIds: ['A1', 'A2', 'A3'] }), allocation, 'Run #22 allocation must be deterministic.');
assert.equal(Object.keys(allocateTndsRegions(run22Measurement, TNDS_REGIONS).regions).length, 8);
assert.throws(() => allocateTndsPublicationRoots({ files: [{ path: 'manifest.json', bytes: 1, sha256: 'x' }, ...['EA', 'EM', 'NE', 'NW'].map(region => ({ path: `services/${region}.json`, bytes: 450_000_000, sha256: region }))] }, { expectedRegions: ['EA', 'EM', 'NE', 'NW'], rootIds: ['A1', 'A2', 'A3'] }), /cannot contain the complete candidate/);
assert.throws(() => assertPublicationFits({ bytes: SAFE_PUBLICATION_LIMIT_BYTES + 1, fileCount: 1 }, 'total site'), /safe bounded-publication limit/);

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-dual-bank-'));
const candidate = path.join(temp, 'candidate');
const busRoot = path.join(candidate, 'atlas', 'data', 'bus');
const tndsRoot = path.join(candidate, 'atlas', 'data', 'bus-tnds');
await fs.mkdir(path.join(busRoot, 'services'), { recursive: true });
await fs.mkdir(path.join(tndsRoot, 'services'), { recursive: true });
await fs.writeFile(path.join(busRoot, 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v1', generatedAt: '2026-09-17T00:00:00Z', serviceShards: { all: ['services/bus.json'] } }));
await fs.writeFile(path.join(busRoot, 'services', 'bus.json'), 'bus');
await fs.writeFile(path.join(tndsRoot, 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-09-17T00:00:00Z', expectedRegions: TNDS_REGIONS, regions: TNDS_REGIONS, serviceShards: Object.fromEntries(TNDS_REGIONS.map(region => [region, [`services/national-${region}.json`]])) }));
for (const region of TNDS_REGIONS) await fs.writeFile(path.join(tndsRoot, 'services', `national-${region}.json`), `tnds-${region}`);

const repo = id => path.join(temp, 'repos', id);
const site = id => `https://${id.toLowerCase()}.example.test/`;
const bankDefinitions = ['A', 'B'].map(bankId => ({ id: bankId, roots: ['1', '2', '3'].map(rootId => ({ id: `${bankId}${rootId}`, repository: repo(`${bankId}${rootId}`), siteUrl: site(`${bankId}${rootId}`) })) }));
const configOutput = path.join(temp, 'app', 'atlas', 'config', 'atlas-data-sources.mjs');
const first = await preparePublications({ candidateSite: candidate, busRepository: repo('bus'), tndsBanks: bankDefinitions, candidateTndsBank: 'A', publicationVersion: 'v1', generatedAt: '2026-09-17T00:00:00Z', busSiteUrl: 'https://bus.example.test/', configOutput });
assert.equal(first.config.datasets.tnds.activeBank, 'A');
assert.equal(first.tnds.length, 3);
assert.ok(first.tnds.every(root => !root.totalSite.files.some(file => file.path.startsWith('slot-'))));
assert.equal(first.config.datasets.nptg, null);
const firstActiveHashes = await Promise.all(first.tnds.map(async root => [root.root, (await measurePublicationTree(repo(root.root))).sha256]));

const fetchPublished = async url => {
  const parsed = new URL(url);
  const match = [...bankDefinitions.flatMap(bank => bank.roots), { id: 'bus', repository: repo('bus'), siteUrl: 'https://bus.example.test/' }].find(root => new URL(root.siteUrl).hostname === parsed.hostname);
  if (!match) return new Response('', { status: 404 });
  try { return new Response(await fs.readFile(path.join(match.repository, parsed.pathname.replace(/^\//, ''))), { status: 200 }); } catch { return new Response('', { status: 404 }); }
};
const validFirst = await validatePublishedConfiguration({ config: first.config, fetchImpl: fetchPublished });
assert.equal(validFirst.ok, true);
assert.equal(validFirst.validatedTndsShardCount, 8);

const second = await preparePublications({ candidateSite: candidate, busRepository: repo('bus'), tndsBanks: bankDefinitions, activeTndsBank: 'A', candidateTndsBank: 'B', previousConfig: first.config, activeBusSlot: 'slot-a', publicationVersion: 'v2', generatedAt: '2026-09-18T00:00:00Z', busSiteUrl: 'https://bus.example.test/', configOutput });
assert.equal(second.config.datasets.tnds.activeBank, 'B');
assert.equal(second.config.datasets.tnds.rollbackBank.id, 'A');
assert.equal(second.config.datasets.bus.slot, 'slot-b');
const secondActiveHashes = await Promise.all(first.tnds.map(async root => [root.root, (await measurePublicationTree(repo(root.root))).sha256]));
assert.deepEqual(secondActiveHashes, firstActiveHashes, 'Active Bank A must remain untouched while Bank B is prepared.');
assert.equal((await fs.readdir(repo('B1'))).includes('slot-a'), false);
const validSecond = await validatePublishedConfiguration({ config: second.config, fetchImpl: fetchPublished });
assert.equal(validSecond.activeTndsBank, 'B');

const third = await preparePublications({ candidateSite: candidate, busRepository: repo('bus'), tndsBanks: bankDefinitions, activeTndsBank: 'B', candidateTndsBank: 'A', previousConfig: second.config, activeBusSlot: 'slot-b', publicationVersion: 'v3', generatedAt: '2026-09-19T00:00:00Z', busSiteUrl: 'https://bus.example.test/', configOutput });
assert.equal(third.config.datasets.tnds.activeBank, 'A');
assert.equal(third.config.datasets.tnds.rollbackBank.id, 'B');
assert.equal((await validatePublishedConfiguration({ config: third.config, fetchImpl: fetchPublished })).activeTndsBank, 'A');
assert.equal(rollbackToOppositeBank(third.config).datasets.tnds.activeBank, 'B');
assert.ok((await fs.readdir(repo('A1'))).every(name => name !== 'slot-a' && name !== 'slot-b'));

const seRootHost = new URL(second.config.datasets.tnds.activeRoots.find(root => root.regions.includes('SE')).baseUrl).hostname;
const tamperedFetch = async url => {
  const response = await fetchPublished(url);
  if (new URL(url).hostname === seRootHost && new URL(url).pathname.endsWith('/services/national-SE.json')) return new Response('tampered', { status: 200 });
  return response;
};
await assert.rejects(() => validatePublishedConfiguration({ config: second.config, fetchImpl: tamperedFetch }), /checksum|byte-count/);
assert.equal(first.config.datasets.tnds.activeBank, 'A', 'A remains the application known-good configuration after candidate validation failure.');
assert.equal(crypto.createHash('sha256').update(JSON.stringify(first.config)).digest('hex').length, 64);
console.log('PASS BUS-RECOVERY-0D.3 dual-bank allocation, exact shard coverage, A-to-B-to-A cycles, rollback, failure isolation and Bus bounded-slot lifecycle.');
