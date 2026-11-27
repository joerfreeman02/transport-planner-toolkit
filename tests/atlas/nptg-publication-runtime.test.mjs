import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createPreparedBusDataAdapter } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createAtlasDataSourceResolver } from '../../src/atlas/infrastructure/atlas-data-sources.mjs';
import { preparePublications, rollbackToOppositeBank, TNDS_REGIONS } from '../../tools/atlas-data-publication/publication.mjs';

const root = await fs.mkdtemp(path.join(process.cwd(), `.tmp-au2-nptg-${process.pid}-`));
try {
  const candidate = path.join(root, 'candidate');
  const bus = path.join(candidate, 'atlas', 'data', 'bus');
  const tnds = path.join(candidate, 'atlas', 'data', 'bus-tnds');
  const localityShard = Buffer.from(JSON.stringify({ schema: 'atlas-prepared-nptg-localities-v1', localities: [{ id: 'nptg:E001', code: 'E001', name: 'Abbotts Rise', parentLocalityId: 'nptg:E000', districtId: 'nptg:D1' }, { id: 'nptg:E000', code: 'E000', name: 'Stanstead Abbotts', districtId: 'nptg:D1' }] }));
  const nptgHash = crypto.createHash('sha256').update('authoritative-nptg-source-v1').digest('hex');
  const writeCandidate = async (version, bytes) => {
    await fs.mkdir(path.join(bus, 'localities'), { recursive: true });
    await fs.mkdir(path.join(bus, 'services'), { recursive: true });
    await fs.mkdir(path.join(tnds, 'services'), { recursive: true });
    await fs.writeFile(path.join(bus, 'localities', 'E00.json'), bytes);
    await fs.writeFile(path.join(bus, 'manifest.json'), JSON.stringify({
      schema: 'atlas-prepared-bus-data-v2', version: '2', generatedAt: '2026-11-27T00:00:00Z',
      localityShardKeyLength: 3, localityShards: { E00: 'localities/E00.json' },
      sources: { nptg: { url: 'https://naptan.api.dft.gov.uk/v1/nptg', sourceHash: nptgHash, schemaVersion: '2.1' } },
      counts: { localityCount: 2, districtCount: 1 }
    }));
    await fs.writeFile(path.join(bus, 'services', 'routes.json'), `bus-${version}`);
    await fs.writeFile(path.join(tnds, 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-tnds-v1', generatedAt: '2026-11-27T00:00:00Z', expectedRegions: TNDS_REGIONS, regions: TNDS_REGIONS, serviceShards: Object.fromEntries(TNDS_REGIONS.map(region => [region, [`services/${region}_route.json`]])) }));
    for (const region of TNDS_REGIONS) await fs.writeFile(path.join(tnds, 'services', `${region}_route.json`), `tnds-${region}`);
  };
  await writeCandidate('v1', localityShard);
  const repository = path.join(root, 'repository');
  const bankRoots = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].map(id => ({ id, repository: path.join(root, 'repos', id), siteUrl: `https://${id.toLowerCase()}.example.test/` }));
  const banks = [{ id: 'A', roots: bankRoots.slice(0, 3) }, { id: 'B', roots: bankRoots.slice(3) }];
  const output = path.join(root, 'output', 'atlas-data-sources.mjs');
  const first = await preparePublications({ candidateSite: candidate, busRepository: repository, tndsBanks: banks, candidateTndsBank: 'A', publicationVersion: 'fixture-v1', generatedAt: '2026-11-27T00:00:00Z', busSiteUrl: 'https://data.example.test/atlas/data/bus/', configOutput: output });
  assert.equal(first.config.datasets.nptg.schema, 'atlas-prepared-nptg-v1');
  assert.equal(first.config.datasets.nptg.slot, 'slot-a');
  assert.equal(first.config.datasets.nptg.baseUrl, 'https://data.example.test/atlas/data/bus/nptg/slot-a/');
  const firstNptgSlot = path.join(repository, 'nptg', 'slot-a');
  const firstManifest = JSON.parse(await fs.readFile(path.join(firstNptgSlot, 'manifest.json'), 'utf8'));
  assert.equal(firstManifest.source.sha256, nptgHash);
  assert.equal(firstManifest.localityShards.E00, 'localities/E00.json');
  assert.deepEqual(Object.keys(firstManifest.shards), ['E00']);
  assert.equal((await fs.readFile(path.join(firstNptgSlot, 'localities', 'E00.json'))).byteLength, localityShard.byteLength);

  const resolver = createAtlasDataSourceResolver(first.config);
  assert.equal(resolver.fileUrl('nptg', 'manifest.json'), first.config.datasets.nptg.baseUrl + 'manifest.json');
  const adapter = createPreparedBusDataAdapter({
    fetchImpl: async url => {
      const file = String(url).endsWith('/manifest.json') ? path.join(firstNptgSlot, 'manifest.json') : path.join(firstNptgSlot, 'localities', 'E00.json');
      const data = await fs.readFile(file);
      const parsed = JSON.parse(data.toString('utf8'));
      return { ok: true, status: 200, json: async () => parsed, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), headers: { get: () => null } };
    },
    baseUrl: 'https://data.example.test/atlas/data/bus/slot-a/',
    nptgBaseUrl: first.config.datasets.nptg.baseUrl
  });
  const localities = await adapter.localitiesForStops([{ nptgLocalityCode: 'E001' }]);
  assert.equal(localities.ok, true);
  assert.deepEqual(localities.data.map(item => item.name), ['Abbotts Rise']);
  assert.equal(localities.data[0].parentLocality.name, 'Stanstead Abbotts');

  await writeCandidate('v2', localityShard);
  const second = await preparePublications({ candidateSite: candidate, busRepository: repository, tndsBanks: banks, activeTndsBank: 'A', candidateTndsBank: 'B', previousConfig: first.config, activeBusSlot: first.bus.candidateSlot, publicationVersion: 'fixture-v2', generatedAt: '2026-11-28T00:00:00Z', busSiteUrl: 'https://data.example.test/atlas/data/bus/', configOutput: output });
  assert.equal(second.config.datasets.nptg.slot, 'slot-b');
  assert.ok(await fs.stat(path.join(repository, 'nptg', 'slot-a', 'manifest.json')), 'the old NPTG slot remains available for rollback');
  const rollback = rollbackToOppositeBank(second.config);
  assert.equal(rollback.datasets.nptg.slot, 'slot-a');
  assert.equal(rollback.datasets.nptg.baseUrl, first.config.datasets.nptg.baseUrl);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log('AU-2 NPTG publication, runtime resolution and last-known-good slot tests passed.');
