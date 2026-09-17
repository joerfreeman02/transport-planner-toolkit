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
const configText = await fetchText(new URL('config/atlas-data-sources.json', root));
const configPath = path.join(outputRoot, 'atlas', 'config', 'atlas-data-sources.json');
await fs.mkdir(path.dirname(configPath), { recursive: true });
if (configText) await fs.writeFile(configPath, configText);
const config = configText ? JSON.parse(configText) : null;
await fs.writeFile(path.join(outputRoot, 'active-slots.json'), `${JSON.stringify({
  bus: config?.datasets?.bus?.slot ?? null,
  tnds: config?.datasets?.tnds?.slot ?? null,
  tndsRoots: Object.fromEntries((config?.datasets?.tnds?.roots ?? []).map(root => [root.id, root.slot ?? null]))
}, null, 2)}\n`);
const fallback = {
  bus: new URL('data/bus/', root),
  tnds: new URL('data/bus-tnds/', root)
};
for (const [key, relative] of [['bus', 'bus'], ['tnds', 'tnds']]) {
  const base = config?.datasets?.[key]?.baseUrl ? new URL(config.datasets[key].baseUrl, new URL('config/', root)) : fallback[key];
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
