import fs from 'node:fs/promises';
import path from 'node:path';
import { artifactTreeSha256, assertApplicationPinned, createReleaseIdentity } from './release-identity.mjs';

const [siteRoot, priorIdentityPath, manifestRoot = siteRoot] = process.argv.slice(2);
if (!siteRoot || !priorIdentityPath) throw new Error('Usage: node refresh-identity-cli.mjs <complete-pages-site> <prior-identity.json> [candidate-manifest-root]');
const read = async relative => JSON.parse(await fs.readFile(path.join(siteRoot, relative), 'utf8'));
const readManifest = async relative => JSON.parse(await fs.readFile(path.join(manifestRoot, relative), 'utf8'));
const prior = JSON.parse(await fs.readFile(priorIdentityPath, 'utf8'));
const sources = await read('atlas/config/atlas-data-sources.json');
const bus = await readManifest('atlas/data/bus/manifest.json');
const nptg = sources.datasets?.nptg ? await readManifest('atlas/data/nptg/manifest.json') : null;
const status = await read('atlas/data/status/manifest.json');
const ibus = await read('atlas/data/tfl-ibus/manifest.json');
const index = await read(path.join('atlas/data/tfl-ibus', ibus.indexPath));
const tnds = [];
async function walk(directory) {
  for (const entry of await fs.readdir(path.join(manifestRoot, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(relative);
    else if (entry.name === 'manifest.json') tnds.push(await readManifest(relative));
  }
}
await walk('atlas/data/bus-tnds');
const next = createReleaseIdentity({
  applicationSha: prior.application.commitSha,
  version: prior.application.version,
  build: prior.application.build,
  dataSources: sources,
  dataStatus: status,
  busManifest: bus,
  tndsManifests: tnds,
  nptgManifest: nptg,
  ibusManifest: ibus,
  ibusIndex: index
});
assertApplicationPinned(prior, next);
next.artifactTreeSha256 = await artifactTreeSha256(siteRoot);
await fs.writeFile(path.join(siteRoot, 'atlas/config/atlas-release-identity.json'), `${JSON.stringify(next, null, 2)}\n`);
console.log('Data-refresh release identity retains the approved application and records the new data publication.');
