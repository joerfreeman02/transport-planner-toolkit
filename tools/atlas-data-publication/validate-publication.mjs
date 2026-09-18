import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { regionFromTndsPath } from './publication.mjs';

function normaliseUrl(value) { return String(value).endsWith('/') ? String(value) : `${value}/`; }

async function jsonAt(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  try { return JSON.parse(await response.text()); } catch { throw new Error(`${url} did not return valid JSON.`); }
}

function aggregate(files) {
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const hash = crypto.createHash('sha256');
  for (const file of ordered) hash.update(`${file.path}:${file.sha256}\n`);
  return { fileCount: ordered.length, bytes: ordered.reduce((sum, file) => sum + file.bytes, 0), sha256: hash.digest('hex') };
}

function referencedPayloadPaths(manifest) {
  const paths = new Set(['manifest.json']);
  const visit = value => {
    if (typeof value === 'string' && /^(?:stops|services)\//.test(value)) paths.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(manifest);
  return paths;
}

export async function validatePublishedRoot({ dataset, baseUrl, expectedVersion, expectedBankId = null, expectedRootId = null, expectedSlot = null, fetchImpl = globalThis.fetch }) {
  const root = normaliseUrl(baseUrl);
  const manifest = await jsonAt(new URL('manifest.json', root), fetchImpl);
  const publicationManifest = await jsonAt(new URL('publication-manifest.json', root), fetchImpl);
  if (!['atlas-reference-data-publication-v3', 'atlas-reference-data-publication-v4'].includes(publicationManifest.schema)) throw new Error(`${dataset} publication manifest has an unsupported schema.`);
  if (publicationManifest.dataset !== dataset || publicationManifest.publicationVersion !== expectedVersion) throw new Error(`${dataset} publication identity does not match the candidate configuration.`);
  if (expectedBankId !== null && publicationManifest.bankId !== expectedBankId) throw new Error(`${dataset} publication bank identity does not match configuration.`);
  if (expectedRootId !== null && publicationManifest.rootId !== expectedRootId) throw new Error(`${dataset} publication root identity does not match configuration.`);
  if (expectedSlot !== null && publicationManifest.slot !== expectedSlot) throw new Error(`${dataset} publication slot identity does not match configuration.`);
  if (!Array.isArray(publicationManifest.payload?.files) || !publicationManifest.payload.files.length) throw new Error(`${dataset} publication manifest has no content index.`);
  const files = [];
  for (const expected of publicationManifest.payload.files) {
    if (!expected?.path || expected.path.includes('..') || expected.path === 'publication-manifest.json') throw new Error(`${dataset} publication contains an invalid indexed path.`);
    const response = await fetchImpl(new URL(expected.path, root), { headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) throw new Error(`${dataset} required publication file ${expected.path} returned HTTP ${response.status}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== expected.bytes || sha256 !== expected.sha256) throw new Error(`${dataset} required publication file ${expected.path} failed its checksum or byte-count validation.`);
    files.push({ path: expected.path, bytes: bytes.byteLength, sha256 });
  }
  const measured = aggregate(files);
  const payload = publicationManifest.payload;
  if (measured.fileCount !== payload.fileCount || measured.bytes !== payload.bytes || measured.sha256 !== payload.sha256) throw new Error(`${dataset} publication aggregate checksum does not match its publication manifest.`);
  return { dataset, bankId: publicationManifest.bankId ?? null, rootId: publicationManifest.rootId ?? null, publicationVersion: publicationManifest.publicationVersion, manifest, publicationManifest, indexedPaths: new Set(files.map(file => file.path)), measured };
}

function configuredTndsRoots(config) { return config?.datasets?.tnds?.activeRoots?.length ? config.datasets.tnds.activeRoots : config?.datasets?.tnds?.roots?.length ? config.datasets.tnds.roots : [{ id: 'root-1', baseUrl: config.datasets.tnds.baseUrl }]; }

export async function validatePublishedConfiguration({ config, fetchImpl = globalThis.fetch }) {
  if (!config?.publicationVersion) throw new Error('Candidate data-source configuration has no publication version.');
  const bus = await validatePublishedRoot({ dataset: 'bus', baseUrl: config.datasets.bus.baseUrl, expectedVersion: config.publicationVersion, expectedSlot: config.datasets.bus.slot ?? null, fetchImpl });
  for (const file of referencedPayloadPaths(bus.manifest)) if (!bus.indexedPaths.has(file)) throw new Error(`Bus required shard ${file} is not present in the validated publication root.`);
  const tndsConfig = config.datasets.tnds;
  if (!tndsConfig?.activeBank) throw new Error('Candidate TNDS configuration has no active bank identity.');
  const configuredRoots = configuredTndsRoots(config);
  const tndsRoots = await Promise.all(configuredRoots.map(root => validatePublishedRoot({ dataset: 'tnds', baseUrl: root.baseUrl, expectedVersion: config.publicationVersion, expectedBankId: tndsConfig.activeBank, expectedRootId: root.id, fetchImpl })));
  if (tndsRoots.length !== configuredRoots.length || new Set(tndsRoots.map(root => root.rootId)).size !== tndsRoots.length) throw new Error('Candidate TNDS configuration does not contain one unique validated publication root per configured root.');
  const expectedPaths = new Set();
  const expectedRegions = new Set();
  for (const root of tndsRoots) {
    for (const file of referencedPayloadPaths(root.manifest)) if (file.startsWith('services/')) expectedPaths.add(file);
    for (const region of root.manifest.expectedRegions ?? root.publicationManifest.sourceManifest.expectedRegions ?? []) expectedRegions.add(String(region).toUpperCase());
    const declared = root.publicationManifest.regionAllocation?.files ?? [];
    for (const file of declared) if (file.path?.startsWith('services/')) {
      const region = regionFromTndsPath(file.path);
      if (!(root.publicationManifest.regionAllocation.regions ?? []).includes(region)) throw new Error(`TNDS shard ${file.path} is declared under the wrong root region.`);
    }
  }
  const actualPaths = new Set(tndsRoots.flatMap(root => [...root.indexedPaths].filter(file => file.startsWith('services/'))));
  const rootPathCounts = new Map();
  for (const root of tndsRoots) for (const file of root.indexedPaths) if (file.startsWith('services/')) rootPathCounts.set(file, (rootPathCounts.get(file) ?? 0) + 1);
  for (const [file, count] of rootPathCounts) if (count !== 1) throw new Error(`TNDS shard ${file} is present in ${count} publication roots; each shard must map to exactly one root.`);
  for (const file of expectedPaths) if (!actualPaths.has(file)) throw new Error(`TNDS required shard ${file} is not present in any validated publication root.`);
  const declaredPaths = new Set(tndsRoots.flatMap(root => (root.publicationManifest.regionAllocation?.files ?? []).filter(file => file.path?.startsWith('services/')).map(file => file.path)));
  for (const file of actualPaths) if (!declaredPaths.has(file)) throw new Error(`TNDS shard ${file} is published but not present in the exact candidate allocation.`);
  if (actualPaths.size !== declaredPaths.size) throw new Error('TNDS candidate allocation has a missing or duplicated service shard.');
  const pathMap = tndsConfig.pathMap ?? {};
  for (const file of actualPaths) {
    const mappedBase = pathMap[file];
    if (!mappedBase) throw new Error(`TNDS shard ${file} has no exact configuration path mapping.`);
    const mappedRoot = configuredRoots.find(root => normaliseUrl(root.baseUrl) === normaliseUrl(mappedBase));
    if (!mappedRoot) throw new Error(`TNDS shard ${file} maps to an unconfigured publication root.`);
    const publishedRoot = tndsRoots.find(root => root.rootId === mappedRoot.id);
    if (!publishedRoot?.indexedPaths.has(file)) throw new Error(`TNDS shard ${file} maps to root ${mappedRoot.id}, but that root does not publish it.`);
  }
  const actualRegions = new Set([...actualPaths].map(regionFromTndsPath));
  if (expectedRegions.size && (actualRegions.size !== expectedRegions.size || [...expectedRegions].some(region => !actualRegions.has(region)))) throw new Error('TNDS candidate bank does not represent all authoritative regions exactly once.');
  for (const configured of configuredRoots) {
    const published = tndsRoots.find(root => root.rootId === configured.id);
    if (configured.fileCount !== null && configured.fileCount !== undefined && configured.fileCount !== published.measured.fileCount) throw new Error(`TNDS root ${configured.id} file count does not match its publication manifest.`);
    if (configured.bytes !== null && configured.bytes !== undefined && configured.bytes !== published.measured.bytes) throw new Error(`TNDS root ${configured.id} byte count does not match its publication manifest.`);
    if (configured.sha256 && configured.sha256 !== published.measured.sha256) throw new Error(`TNDS root ${configured.id} aggregate checksum does not match its publication manifest.`);
  }
  const versions = new Set(tndsRoots.map(root => root.publicationVersion));
  if (versions.size !== 1 || !versions.has(config.publicationVersion)) throw new Error('TNDS publication roots do not share one validated candidate version.');
  return { ok: true, publicationVersion: config.publicationVersion, activeTndsBank: tndsConfig.activeBank, bus, tnds: tndsRoots, validatedTndsShardCount: actualPaths.size };
}

async function main() {
  const configIndex = process.argv.indexOf('--config');
  if (configIndex < 0 || !process.argv[configIndex + 1]) throw new Error('Usage: node validate-publication.mjs --config <atlas-data-sources.json>');
  const config = JSON.parse(await fs.readFile(path.resolve(process.argv[configIndex + 1]), 'utf8'));
  console.log(JSON.stringify(await validatePublishedConfiguration({ config }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`Reference-data publication validation failed: ${error.message}`); process.exitCode = 1; });
