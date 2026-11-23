import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assembleAppOnlyArtifact, artifactTreeSha256, assertApplicationPinned, assertAppOnlyPreservesData, createReleaseIdentity } from '../../tools/atlas-release/release-identity.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-release-contract-'));
try {
  const app = path.join(temp, 'app'), snapshot = path.join(temp, 'snapshot'), output = path.join(temp, 'out');
  const write = async (root, relative, value) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, value); };
  const sources = { schema: 'atlas-data-sources-v2', publicationVersion: 'run75-frozen', datasets: { bus: { baseUrl: 'https://data.example/bus/' }, tnds: { activeRoots: [{ id: 'root-a', baseUrl: 'https://data.example/tnds/' }] } } };
  const status = { generatedAt: '2026-10-25T00:00:00Z' }, busManifest = { snapshotId: 'bus-75' }, tndsManifests = [{ snapshotId: 'tnds-75' }], ibusManifest = { baseVersion: '20261025', indexPath: 'operator-index.json' }, ibusIndex = { operators: [] };
  await write(app, 'index.html', 'app root');
  await write(app, 'atlas/index.html', '<dd>2.0.0-beta.1</dd><link href="assets/css/atlas-shell.css?build=ATLAS-2.0.0-beta.1-20261025">');
  await write(app, 'atlas/config/atlas-release.json', JSON.stringify({ version: '2.0.0-beta.1', build: 'ATLAS-2.0.0-beta.1-20261025' }));
  await write(app, 'atlas/config/atlas-data-sources.json', '{"app":"must-not-win"}');
  await write(app, 'atlas/assets/js/app.mjs', 'candidate app');
  await write(app, 'atlas/data/bus/manifest.json', 'candidate must not replace data');
  await write(app, 'src/atlas/domain/example.mjs', 'module');
  await write(snapshot, 'index.html', 'preserved root');
  await write(snapshot, 'atlas/config/atlas-data-sources.json', `${JSON.stringify(sources, null, 2)}\n`);
  await write(snapshot, 'atlas/config/atlas-data-sources.mjs', `export const atlasDataSources = Object.freeze(${JSON.stringify(sources, null, 2)});`);
  await write(snapshot, 'atlas/data/status/manifest.json', `${JSON.stringify(status, null, 2)}\n`);
  await write(snapshot, 'atlas/data/tfl-ibus/manifest.json', JSON.stringify(ibusManifest));
  await write(snapshot, 'atlas/data/tfl-ibus/operator-index.json', JSON.stringify(ibusIndex));
  await write(snapshot, 'atlas/data/bus/manifest.json', JSON.stringify(busManifest));
  const args = { appRoot: app, snapshotRoot: snapshot, outputRoot: output, expectedApplicationSha: 'd1a478d584dc402df4d6d225a2fa797959f657d5', version: '2.0.0-beta.2', build: 'ATLAS-2.0.0-beta.2-20261123', dataSources: sources, dataStatus: status, busManifest, tndsManifests, ibusManifest, ibusIndex };
  const identity = await assembleAppOnlyArtifact(args);
  assert.equal(await fs.readFile(path.join(output, 'index.html'), 'utf8'), 'app root');
  assert.equal(await fs.readFile(path.join(output, 'atlas/assets/js/app.mjs'), 'utf8'), 'candidate app');
  await assert.rejects(fs.access(path.join(output, 'atlas/data/bus/manifest.json')));
  await assert.rejects(fs.access(path.join(output, 'atlas/data/bus-tnds')));
  assert.equal(JSON.parse(await fs.readFile(path.join(output, 'atlas/config/atlas-release.json'), 'utf8')).version, '2.0.0-beta.2');
  assert.match(await fs.readFile(path.join(output, 'atlas/index.html'), 'utf8'), /2\.0\.0-beta\.2/);
  assert.equal(JSON.parse(await fs.readFile(path.join(output, 'atlas/config/atlas-release-identity.json'), 'utf8')).application.commitSha, args.expectedApplicationSha);
  assert.equal(JSON.parse(await fs.readFile(path.join(output, 'atlas/config/atlas-release-identity.json'), 'utf8')).artifactTreeSha256, await artifactTreeSha256(output));
  assertAppOnlyPreservesData(identity, structuredClone(identity));
  assert.throws(() => assertAppOnlyPreservesData(identity, { ...structuredClone(identity), data: { ...identity.data, publicationVersion: 'changed' } }), /would change approved data/);
  assertApplicationPinned(identity, { ...structuredClone(identity), data: { ...identity.data, publicationVersion: 'next-data-refresh', currentness: 'next-date' } });
  assert.throws(() => assertApplicationPinned(identity, { ...structuredClone(identity), application: { ...identity.application, commitSha: '8f1d8ae50405ec4acf38dd66d6c8f60896a5649e' } }), /replace approved application commitSha/);
  assert.throws(() => createReleaseIdentity({ ...args, applicationSha: 'not-a-sha' }), /full 40-character/);
  assert.throws(() => createReleaseIdentity({ ...args, applicationSha: args.expectedApplicationSha, dataSources: { ...sources, publicationVersion: null } }), /identities are incomplete/);
  console.log('Application/data release artifact contract passed (isolated fixture dry run).');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
