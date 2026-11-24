import fs from 'node:fs/promises';
import path from 'node:path';

const [appBase, output] = process.argv.slice(2);
if (!appBase || !output) throw new Error('Usage: node fetch-last-known-good.mjs <atlas-app-base-url> <output-root>');

const root = new URL(appBase.endsWith('/') ? appBase : `${appBase}/`);
const outputRoot = path.resolve(output);
const fetchText = async url => {
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) return null;
  return response.text();
};
const writeJson = async (relative, value) => {
  const target = path.join(outputRoot, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
};

const configText = await fetchText(new URL('config/atlas-data-sources.json', root));
const configPath = path.join(outputRoot, 'atlas', 'config', 'atlas-data-sources.json');
await fs.mkdir(path.dirname(configPath), { recursive: true });
if (configText) await fs.writeFile(configPath, configText);
const configModuleText = await fetchText(new URL('config/atlas-data-sources.mjs', root));
if (configModuleText) await fs.writeFile(path.join(outputRoot, 'atlas', 'config', 'atlas-data-sources.mjs'), configModuleText);
const config = configText ? JSON.parse(configText) : null;
const tnds = config?.datasets?.tnds ?? {};
const activeRoots = tnds.activeRoots ?? tnds.roots ?? [];
await writeJson('active-publication.json', {
  schema: 'atlas-last-known-good-publication-v2',
  publicationVersion: config?.publicationVersion ?? null,
  bus: { activeSlot: config?.datasets?.bus?.slot ?? null },
  tnds: { activeBank: tnds.activeBank ?? null, activeRoots, rollbackBank: tnds.rollbackBank ?? null }
});
// Keep the small legacy file for operators and older diagnostic tooling.
await writeJson('active-slots.json', {
  bus: config?.datasets?.bus?.slot ?? null,
  tnds: tnds.activeBank ?? tnds.slot ?? null,
  tndsBank: tnds.activeBank ?? null,
  tndsRoots: Object.fromEntries(activeRoots.map(item => [item.id, item.baseUrl ?? null]))
});

const fallback = { bus: new URL('data/bus/', root), tnds: new URL('data/bus-tnds/', root) };
const busBase = config?.datasets?.bus?.baseUrl ? new URL(config.datasets.bus.baseUrl, new URL('config/', root)) : fallback.bus;
const busManifest = config?.datasets?.bus?.manifest || 'manifest.json';
const busText = await fetchText(new URL(busManifest, busBase));
const busPublicationManifest = config?.datasets?.bus?.publicationManifest || 'publication-manifest.json';
const busPublicationText = await fetchText(new URL(busPublicationManifest, busBase));
if (busText) {
  const target = path.join(outputRoot, 'atlas', 'data', 'bus', 'manifest.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, busText);
}
if (busPublicationText) {
  const directory = path.join(outputRoot, 'atlas', 'data', 'bus');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'publication-manifest.json'), busPublicationText);
}
const tndsRoots = activeRoots.length ? activeRoots : [{ id: 'default', baseUrl: tnds.baseUrl || fallback.tnds.toString() }];
for (const [index, item] of tndsRoots.entries()) {
  if (!item?.baseUrl) continue;
  const base = new URL(item.baseUrl, new URL('config/', root));
  const text = await fetchText(new URL(tnds.manifest || 'manifest.json', base));
  const relative = index === 0 ? 'atlas/data/bus-tnds/manifest.json' : `atlas/data/bus-tnds/${item.id || `root-${index + 1}`}/manifest.json`;
  const target = path.join(outputRoot, relative);
  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true });
  if (text) await fs.writeFile(target, text);
  const publicationText = await fetchText(new URL(tnds.publicationManifest || 'publication-manifest.json', base));
  if (publicationText) await fs.writeFile(path.join(directory, 'publication-manifest.json'), publicationText);
}
const nptg = config?.datasets?.nptg;
if (nptg?.baseUrl) {
  const nptgBase = new URL(nptg.baseUrl, new URL('config/', root));
  const nptgManifest = await fetchText(new URL(nptg.manifest || 'manifest.json', nptgBase));
  if (nptgManifest) {
    const directory = path.join(outputRoot, 'atlas', 'data', 'nptg');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'manifest.json'), nptgManifest);
  }
}
const status = await fetchText(new URL('data/status/manifest.json', root));
if (status) {
  const target = path.join(outputRoot, 'atlas', 'data', 'status', 'manifest.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, status);
}
const releaseIdentity = await fetchText(new URL('config/atlas-release-identity.json', root));
if (releaseIdentity) {
  JSON.parse(releaseIdentity);
  const target = path.join(outputRoot, 'atlas', 'config', 'atlas-release-identity.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, releaseIdentity);
}
const releaseMetadata = await fetchText(new URL('config/atlas-release.json', root));
if (releaseMetadata) {
  JSON.parse(releaseMetadata);
  const target = path.join(outputRoot, 'atlas', 'config', 'atlas-release.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, releaseMetadata);
}
const ibusManifestText = await fetchText(new URL('data/tfl-ibus/manifest.json', root));
if (ibusManifestText) {
  const manifest = JSON.parse(ibusManifestText);
  const indexText = manifest.indexPath ? await fetchText(new URL(`data/tfl-ibus/${manifest.indexPath}`, root)) : null;
  const manifestTarget = path.join(outputRoot, 'atlas', 'data', 'tfl-ibus', 'manifest.json');
  await fs.mkdir(path.dirname(manifestTarget), { recursive: true });
  await fs.writeFile(manifestTarget, ibusManifestText);
  if (indexText) {
    const indexTarget = path.join(outputRoot, 'atlas', 'data', 'tfl-ibus', manifest.indexPath);
    await fs.mkdir(path.dirname(indexTarget), { recursive: true });
    await fs.writeFile(indexTarget, indexText);
  }
}
