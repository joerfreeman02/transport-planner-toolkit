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
const firstTndsBase = activeRoots[0]?.baseUrl ? new URL(activeRoots[0].baseUrl, new URL('config/', root)) : (tnds.baseUrl ? new URL(tnds.baseUrl, new URL('config/', root)) : fallback.tnds);
for (const [key, base] of [['bus', busBase], ['tnds', firstTndsBase]]) {
  const manifest = config?.datasets?.[key]?.manifest || 'manifest.json';
  const text = await fetchText(new URL(manifest, base));
  if (text) {
    const target = path.join(outputRoot, 'atlas', 'data', key === 'bus' ? 'bus' : 'bus-tnds', 'manifest.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text);
  }
}
const status = await fetchText(new URL('data/status/manifest.json', root));
if (status) {
  const target = path.join(outputRoot, 'atlas', 'data', 'status', 'manifest.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, status);
}
