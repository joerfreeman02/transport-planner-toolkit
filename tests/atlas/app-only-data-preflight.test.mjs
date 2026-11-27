import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateAppOnlyDataSnapshot } from '../../tools/atlas-release/app-only-data-preflight.mjs';
import { dataPublicationIdentity } from '../../tools/atlas-release/release-boundary.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => hash(Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
const now = new Date('2026-11-24T12:00:00Z');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-app-data-preflight-'));
const root = path.join(temp, 'snapshot');
const write = async (relative, value) => {
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
};
const payload = (file, bytes = 10) => ({ path: file, bytes, sha256: hash(file) });
const publication = (dataset, extras = [], { identity = {} } = {}) => {
  const files = [payload('manifest.json'), ...extras.map(file => payload(file))].sort((a, b) => a.path.localeCompare(b.path));
  const digest = hash(files.map(file => `${file.path}:${file.sha256}\n`).join(''));
  return { schema: 'atlas-reference-data-publication-v4', dataset, publicationVersion: 'fixture-1', ...identity, payload: { fileCount: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), sha256: digest, files } };
};

try {
  const sources = {
    schema: 'atlas-data-sources-v2', publicationVersion: 'fixture-1',
    datasets: {
      bus: { baseUrl: 'https://data.example/bus/', slot: 'blue' },
      tnds: { baseUrl: 'https://data.example/tnds/', activeBank: 'B', activeRoots: [{ id: 'B1', baseUrl: 'https://data.example/tnds/B1/' }], pathMap: { 'services/one.json': 'https://data.example/tnds/B1/' } },
      nptg: { baseUrl: 'https://data.example/nptg/' }
    }
  };
  const status = { schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', diagnosticOnly: false, productionEligible: true, publicationEligible: true, plannerEligible: true, generatedAt: now.toISOString() };
  const busManifest = { schema: 'atlas-prepared-bus-data-v2', services: ['services/bus.json'] };
  const tndsManifest = { schema: 'atlas-prepared-bus-tnds-v2', services: ['services/one.json'] };
  const nptgLocality = { schema: 'atlas-prepared-nptg-localities-v1', localities: [{ id: 'nptg:E001', code: 'E001', name: 'Fixture locality' }] };
  const nptgLocalityText = `${JSON.stringify(nptgLocality, null, 2)}\n`;
  const nptgManifest = { schema: 'atlas-prepared-nptg-v1', baseVersion: '20261124', source: { sha256: hash('fixture-nptg-source') }, localityShardKeyLength: 3, localityShards: { E00: 'localities/E00.json' }, shards: { E00: { path: 'localities/E00.json', bytes: Buffer.byteLength(nptgLocalityText), sha256: hash(nptgLocalityText) } } };
  const ibusIndex = { baseVersion: '20261124', validFrom: '2026-11-24', validTo: '2026-12-01', operators: [] };
  const ibusIndexText = `${JSON.stringify(ibusIndex, null, 2)}\n`;
  const ibusManifest = { baseVersion: ibusIndex.baseVersion, validFrom: ibusIndex.validFrom, validTo: ibusIndex.validTo, indexPath: 'operator-index.json', indexSha256: hash(ibusIndexText) };
  await write('atlas/config/atlas-data-sources.json', sources);
  await write('atlas/config/atlas-data-sources.mjs', `export const atlasDataSources = Object.freeze(${JSON.stringify(sources, null, 2)});\n`);
  await write('atlas/data/status/manifest.json', status);
  await write('atlas/data/bus/manifest.json', busManifest);
  await write('atlas/data/bus/publication-manifest.json', { ...publication('bus', ['services/bus.json']), slot: 'blue' });
  await write('atlas/data/bus-tnds/manifest.json', tndsManifest);
  await write('atlas/data/bus-tnds/publication-manifest.json', publication('tnds', ['services/one.json'], { identity: { bankId: 'B', rootId: 'B1' } }));
  await write('atlas/data/nptg/manifest.json', nptgManifest);
  await write('atlas/data/nptg/localities/E00.json', nptgLocalityText);
  await write('atlas/data/tfl-ibus/manifest.json', ibusManifest);
  await write('atlas/data/tfl-ibus/operator-index.json', ibusIndexText);
  const identity = dataPublicationIdentity({ dataSources: sources, dataStatus: status, busManifestSha256: jsonHash(busManifest), tndsManifestSha256: [jsonHash(tndsManifest)], nptgManifestSha256: jsonHash(nptgManifest), ibusManifestSha256: jsonHash(ibusManifest), ibusIndexSha256: jsonHash(ibusIndex) });
  const approved = jsonHash(identity);
  const args = { snapshotRoot: root, applicationSha: 'd1a478d584dc402df4d6d225a2fa797959f657d5', approvedDataIdentitySha256: approved, now, fetchImpl: async url => ({ ok: url.startsWith('https://data.example/'), status: 200 }) };
  const result = await validateAppOnlyDataSnapshot(args);
  assert.equal(result.ok, true);
  assert.equal(result.activeTndsBank, 'B');
  assert.equal(result.activeTndsRootCount, 1);
  assert.equal(result.availableReferences, 4);
  await assert.rejects(validateAppOnlyDataSnapshot({ ...args, approvedDataIdentitySha256: '0'.repeat(64) }), /does not match the explicitly approved identity/);
  await assert.rejects(validateAppOnlyDataSnapshot({ ...args, fetchImpl: async () => ({ ok: false, status: 404 }) }), /unavailable/);
  await write('atlas/data/status/manifest.json', { ...status, diagnosticOnly: true });
  await assert.rejects(validateAppOnlyDataSnapshot(args), /rejects diagnostic-only/);
  await write('atlas/data/status/manifest.json', { ...status, generatedAt: '2026-11-01T00:00:00Z' });
  await assert.rejects(validateAppOnlyDataSnapshot(args), /stale or future-dated/);
  await write('atlas/data/status/manifest.json', status);
  await write('atlas/config/atlas-data-sources.mjs', `export const atlasDataSources = Object.freeze({ schema: 'mismatch' });\n`);
  await assert.rejects(validateAppOnlyDataSnapshot(args), /configurations disagree/);
  await write('atlas/config/atlas-data-sources.mjs', `export const atlasDataSources = Object.freeze(${JSON.stringify(sources, null, 2)});\n`);
  await fs.rm(path.join(root, 'atlas/data/bus/publication-manifest.json'));
  await assert.rejects(validateAppOnlyDataSnapshot(args), /Required approved data file atlas\/data\/bus\/publication-manifest\.json is missing/);
  console.log('Read-only app/data preflight contract passed: eligible exact identity, stale/ineligible refusal, configuration parity, and referenced-object availability.');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
