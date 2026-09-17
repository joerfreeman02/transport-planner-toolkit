import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { regionFromTndsPath } from './publication.mjs';

function resolveUrl(dataset, relativePath) {
  const pathValue = String(relativePath).replace(/^\/+/, '');
  const exact = dataset.pathMap?.[pathValue];
  if (exact) return new URL(pathValue, String(exact).endsWith('/') ? exact : `${exact}/`).toString();
  const root = [...(dataset.pathRoots ?? [])].filter(item => item?.prefix && item?.baseUrl && pathValue.startsWith(item.prefix)).sort((left, right) => right.prefix.length - left.prefix.length)[0];
  return new URL(pathValue, root?.baseUrl ?? dataset.baseUrl).toString();
}

async function jsonAt(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  try { return JSON.parse(await response.text()); } catch { throw new Error(`${url} did not return valid JSON.`); }
}

function aggregate(files) {
  const ordered = [...files].sort((left, right) => left.path.localeCompare(right.path));
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

export async function validatePublishedRoot({ dataset, baseUrl, expectedVersion, expectedRootId = null, fetchImpl = globalThis.fetch }) {
  const root = String(baseUrl).endsWith('/') ? String(baseUrl) : `${baseUrl}/`;
  const manifest = await jsonAt(new URL('manifest.json', root), fetchImpl);
  const publicationManifest = await jsonAt(new URL('publication-manifest.json', root), fetchImpl);
  if (publicationManifest.schema !== 'atlas-reference-data-publication-v3') throw new Error(`${dataset} publication manifest has an unsupported schema.`);
  if (publicationManifest.dataset !== dataset || publicationManifest.publicationVersion !== expectedVersion) throw new Error(`${dataset} publication identity does not match the candidate configuration.`);
  if (expectedRootId !== null && publicationManifest.rootId !== expectedRootId) throw new Error(`${dataset} publication root identity does not match configuration.`);
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
  const indexedPaths = new Set(files.map(file => file.path));
  return { dataset, rootId: publicationManifest.rootId ?? null, publicationVersion: publicationManifest.publicationVersion, manifest, publicationManifest, indexedPaths, measured };
}

export async function validatePublishedConfiguration({ config, fetchImpl = globalThis.fetch }) {
  if (!config?.publicationVersion) throw new Error('Candidate data-source configuration has no publication version.');
  const bus = await validatePublishedRoot({ dataset: 'bus', baseUrl: config.datasets.bus.baseUrl, expectedVersion: config.publicationVersion, fetchImpl });
  for (const file of referencedPayloadPaths(bus.manifest)) if (!bus.indexedPaths.has(file)) throw new Error(`Bus required shard ${file} is not present in the validated publication root.`);
  const configuredRoots = config.datasets.tnds.roots?.length ? config.datasets.tnds.roots : [{ id: 'root-1', baseUrl: config.datasets.tnds.baseUrl }];
  const tndsRoots = await Promise.all(configuredRoots.map(root => validatePublishedRoot({ dataset: 'tnds', baseUrl: root.baseUrl, expectedVersion: config.publicationVersion, expectedRootId: root.id, fetchImpl })));
  const tndsManifest = tndsRoots[0].manifest;
  const expectedPaths = referencedPayloadPaths(tndsManifest);
  const actualPaths = new Set(tndsRoots.flatMap(root => [...root.indexedPaths].filter(file => file.startsWith('services/'))));
  const rootPathCounts = new Map();
  for (const root of tndsRoots) for (const file of root.indexedPaths) if (file.startsWith('services/')) rootPathCounts.set(file, (rootPathCounts.get(file) ?? 0) + 1);
  for (const [file, count] of rootPathCounts) if (count !== 1) throw new Error(`TNDS shard ${file} is present in ${count} publication roots; each shard must map to exactly one root.`);
  for (const file of expectedPaths) if (file.startsWith('services/') && !actualPaths.has(file)) throw new Error(`TNDS required shard ${file} is not present in any validated publication root.`);
  const allocation = Object.fromEntries(tndsRoots.flatMap(root => (root.publicationManifest.regionAllocation?.files ?? []).filter(file => file.path?.startsWith('services/')).map(file => [file.path, root.rootId])));
  for (const file of actualPaths) {
    if (!allocation[file]) {
      const root = tndsRoots.find(candidate => candidate.indexedPaths.has(file));
      if (!root) throw new Error(`TNDS shard ${file} has no validated publication root.`);
      regionFromTndsPath(file);
    }
  }
  const versions = new Set(tndsRoots.map(root => root.publicationVersion));
  if (versions.size !== 1 || !versions.has(config.publicationVersion)) throw new Error('TNDS publication roots do not share one validated candidate version.');
  return { ok: true, publicationVersion: config.publicationVersion, bus, tnds: tndsRoots, validatedTndsShardCount: actualPaths.size };
}

async function main() {
  const configIndex = process.argv.indexOf('--config');
  if (configIndex < 0 || !process.argv[configIndex + 1]) throw new Error('Usage: node validate-publication.mjs --config <atlas-data-sources.json>');
  const config = JSON.parse(await fs.readFile(path.resolve(process.argv[configIndex + 1]), 'utf8'));
  console.log(JSON.stringify(await validatePublishedConfiguration({ config }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`Reference-data publication validation failed: ${error.message}`); process.exitCode = 1; });
