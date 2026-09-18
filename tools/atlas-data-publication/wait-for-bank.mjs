import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5 * 1000;

function normaliseUrl(value) { return String(value).endsWith('/') ? String(value) : `${value}/`; }

export function publicationTargetsFromConfig(config) {
  const version = config?.publicationVersion;
  if (!version) throw new Error('Candidate configuration has no publicationVersion for the publication wait barrier.');
  const bus = config.datasets?.bus;
  const tnds = config.datasets?.tnds;
  if (!bus?.baseUrl || !tnds?.activeBank || !Array.isArray(tnds.activeRoots) || !tnds.activeRoots.length) throw new Error('Candidate configuration does not contain complete Bus and TNDS publication targets.');
  return [
    { name: `Bus ${bus.slot ?? 'candidate slot'}`, dataset: 'bus', baseUrl: bus.baseUrl, publicationManifest: bus.publicationManifest ?? 'publication-manifest.json', manifest: bus.manifest ?? 'manifest.json', expectedVersion: version, expectedDataset: 'bus', expectedSlot: bus.slot ?? null },
    ...tnds.activeRoots.map(root => ({ name: `TNDS ${tnds.activeBank}/${root.id}`, dataset: 'tnds', baseUrl: root.baseUrl, publicationManifest: root.publicationManifest ?? 'publication-manifest.json', manifest: root.manifest ?? 'manifest.json', expectedVersion: version, expectedDataset: 'tnds', expectedBankId: tnds.activeBank, expectedRootId: root.id }))
  ];
}

async function responseText(response) { return typeof response.text === 'function' ? response.text() : ''; }

export async function checkPublicationTarget(target, fetchImpl = globalThis.fetch) {
  const root = normaliseUrl(target.baseUrl);
  const publicationUrl = new URL(target.publicationManifest ?? 'publication-manifest.json', root).href;
  const manifestUrl = new URL(target.manifest ?? 'manifest.json', root).href;
  try {
    const [manifestResponse, publicationResponse] = await Promise.all([
      fetchImpl(manifestUrl, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } }),
      fetchImpl(publicationUrl, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } })
    ]);
    if (!manifestResponse.ok) return { ok: false, target: target.name ?? root, reason: `${manifestUrl} returned HTTP ${manifestResponse.status}` };
    if (!publicationResponse.ok) return { ok: false, target: target.name ?? root, reason: `${publicationUrl} returned HTTP ${publicationResponse.status}` };
    let publication;
    try { publication = JSON.parse(await responseText(publicationResponse)); } catch { return { ok: false, target: target.name ?? root, reason: `${publicationUrl} did not return valid JSON` }; }
    const mismatches = [];
    if (publication.publicationVersion !== target.expectedVersion) mismatches.push(`publicationVersion=${publication.publicationVersion ?? '<missing>'}, expected ${target.expectedVersion}`);
    if (target.expectedDataset !== undefined && publication.dataset !== target.expectedDataset) mismatches.push(`dataset=${publication.dataset ?? '<missing>'}, expected ${target.expectedDataset}`);
    if (target.expectedBankId !== undefined && publication.bankId !== target.expectedBankId) mismatches.push(`bankId=${publication.bankId ?? '<missing>'}, expected ${target.expectedBankId}`);
    if (target.expectedRootId !== undefined && publication.rootId !== target.expectedRootId) mismatches.push(`rootId=${publication.rootId ?? '<missing>'}, expected ${target.expectedRootId}`);
    if (target.expectedSlot !== undefined && publication.slot !== target.expectedSlot) mismatches.push(`slot=${publication.slot ?? '<missing>'}, expected ${target.expectedSlot}`);
    if (mismatches.length) return { ok: false, target: target.name ?? root, reason: mismatches.join('; ') };
    return { ok: true, target: target.name ?? root, publicationVersion: publication.publicationVersion, bankId: publication.bankId ?? null, rootId: publication.rootId ?? null, slot: publication.slot ?? null };
  } catch (error) {
    return { ok: false, target: target.name ?? root, reason: error.message };
  }
}

export async function waitForPublicationIdentity({ targets, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = DEFAULT_INTERVAL_MS, now = () => Date.now(), sleep = delay => new Promise(resolve => setTimeout(resolve, delay)) }) {
  if (!Array.isArray(targets) || !targets.length) throw new Error('At least one publication identity target is required.');
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastResults = [];
  while (now() <= deadline) {
    attempts += 1;
    lastResults = await Promise.all(targets.map(target => checkPublicationTarget(target, fetchImpl)));
    if (lastResults.every(result => result.ok)) return { ok: true, attempts, elapsedMs: now() - startedAt, targets: lastResults };
    if (now() >= deadline) break;
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
  const detail = lastResults.map(result => `${result.target}: ${result.reason}`).join(' | ');
  throw new Error(`Candidate publication identity did not become visible within ${timeoutMs}ms; stale or unavailable content remains: ${detail}`);
}

export const waitForBank = waitForPublicationIdentity;

async function main() {
  const option = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
  const configPath = option('--config');
  if (!configPath) throw new Error('Usage: node wait-for-bank.mjs --config <atlas-data-sources.json> [--timeout-ms <ms>] [--interval-ms <ms>]');
  const config = JSON.parse(await fs.readFile(path.resolve(configPath), 'utf8'));
  const result = await waitForPublicationIdentity({ targets: publicationTargetsFromConfig(config), timeoutMs: Number(option('--timeout-ms') ?? DEFAULT_TIMEOUT_MS), intervalMs: Number(option('--interval-ms') ?? DEFAULT_INTERVAL_MS) });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`Reference-data publication wait failed: ${error.message}`); process.exitCode = 1; });
