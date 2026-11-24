import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createAtlasDataSourceResolver } from '../../src/atlas/infrastructure/atlas-data-sources.mjs';
import { assertApprovedLiveDataIdentity, dataPublicationIdentity, verifyIbusFixture } from './release-boundary.mjs';

const EXPECTED_REGIONS = new Set(['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']);
const MAX_FRESHNESS_DAYS = 8;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => sha256(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
const safeRelativePath = value => typeof value === 'string' && value.length > 0 && !path.posix.isAbsolute(value) && !value.split(/[\\/]/).includes('..');

function option(name, argv = process.argv) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

async function readJson(root, relative) {
  try { return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8')); }
  catch (error) { throw new Error(`Required approved data file ${relative} is missing or invalid JSON: ${error.message}`); }
}

function referencedPaths(manifest) {
  const paths = new Set(['manifest.json']);
  const visit = value => {
    if (typeof value === 'string' && /^(?:stops|services)\//.test(value)) paths.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(manifest);
  return paths;
}

function publicationIndex(publication, dataset, version, { bankId = null, rootId = null, slot = null } = {}) {
  if (!['atlas-reference-data-publication-v3', 'atlas-reference-data-publication-v4'].includes(publication?.schema)) throw new Error(`${dataset} publication manifest schema is missing or unsupported.`);
  if (publication.dataset !== dataset || publication.publicationVersion !== version) throw new Error(`${dataset} publication manifest identity does not match the approved data-source configuration.`);
  if (bankId !== null && publication.bankId !== bankId) throw new Error(`${dataset} publication bank identity does not match the approved active bank.`);
  if (rootId !== null && publication.rootId !== rootId) throw new Error(`${dataset} publication root identity does not match the configured active root.`);
  if (slot !== null && publication.slot !== slot) throw new Error(`${dataset} publication slot identity does not match the approved Bus slot.`);
  const files = publication.payload?.files;
  if (!Array.isArray(files) || !files.length) throw new Error(`${dataset} publication manifest has no payload index.`);
  const seen = new Set();
  const ordered = [...files].sort((a, b) => String(a.path).localeCompare(String(b.path)));
  const digest = createHash('sha256');
  let bytes = 0;
  for (const file of ordered) {
    if (!safeRelativePath(file?.path) || file.path === 'publication-manifest.json' || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[0-9a-f]{64}$/i.test(String(file.sha256 ?? ''))) throw new Error(`${dataset} publication index contains an invalid payload record.`);
    if (seen.has(file.path)) throw new Error(`${dataset} publication index contains duplicate path ${file.path}.`);
    seen.add(file.path);
    bytes += file.bytes;
    digest.update(`${file.path}:${file.sha256}\n`);
  }
  if (publication.payload.fileCount !== files.length || publication.payload.bytes !== bytes || publication.payload.sha256 !== digest.digest('hex')) throw new Error(`${dataset} publication payload index totals or aggregate checksum are inconsistent.`);
  return seen;
}

function requireProductionEligibility(status, now, maxAgeDays = MAX_FRESHNESS_DAYS) {
  if (status?.schema !== 'atlas-bus-refresh-status-v1' || status.status !== 'validated' || status.validation !== 'passed') throw new Error('Production release requires a validated data-status manifest.');
  if (status.diagnosticOnly !== false || status.productionEligible !== true || status.publicationEligible !== true || status.plannerEligible !== true || status.reviewOnly === true) throw new Error('Production release rejects diagnostic-only, review-only, or explicitly ineligible data.');
  const timestamp = status.successfulRefreshAt ?? status.candidateGeneratedAt ?? status.generatedAt ?? status.snapshotDate;
  const generated = new Date(timestamp);
  if (!timestamp || Number.isNaN(generated.getTime())) throw new Error('Production data freshness timestamp is missing or invalid.');
  const ageMs = now.getTime() - generated.getTime();
  if (ageMs < 0 || ageMs > maxAgeDays * 24 * 60 * 60 * 1000) throw new Error(`Production data is stale or future-dated; maximum allowed age is ${maxAgeDays} days.`);
  return { timestamp: generated.toISOString(), maxAgeDays, ageMs };
}

async function checkUrls(urls, fetchImpl, { concurrency = 12 } = {}) {
  const unique = [...new Set(urls)];
  for (let index = 0; index < unique.length; index += concurrency) {
    await Promise.all(unique.slice(index, index + concurrency).map(async url => {
      let response;
      try { response = await fetchImpl(url, { method: 'HEAD', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20_000) }); }
      catch (error) { throw new Error(`Referenced production data is unavailable at ${url}: ${error.message}`); }
      if (!response?.ok) throw new Error(`Referenced production data is unavailable at ${url} (HTTP ${response?.status ?? 'no response'}).`);
    }));
  }
  return unique.length;
}

export async function validateAppOnlyDataSnapshot({ snapshotRoot, approvedDataIdentitySha256, applicationSha, now = new Date(), maxAgeDays = MAX_FRESHNESS_DAYS, fetchImpl = globalThis.fetch }) {
  if (!/^[0-9a-f]{40}$/i.test(String(applicationSha ?? ''))) throw new Error('App-only preflight requires the exact full approved application SHA.');
  const root = path.resolve(snapshotRoot);
  const sources = await readJson(root, 'atlas/config/atlas-data-sources.json');
  if (sources.schema !== 'atlas-data-sources-v2' || !sources.publicationVersion) throw new Error('Approved data-source configuration schema or publication identity is invalid.');
  const sourcesModulePath = path.join(root, 'atlas/config/atlas-data-sources.mjs');
  const sourcesModuleBytes = await fs.readFile(sourcesModulePath);
  const sourcesModule = await import(`${pathToFileURL(sourcesModulePath).href}?preflight=${sha256(sourcesModuleBytes)}`);
  if (jsonHash(sourcesModule.atlasDataSources) !== jsonHash(sources)) throw new Error('JSON and JavaScript data-source configurations disagree.');
  const status = await readJson(root, 'atlas/data/status/manifest.json');
  const freshness = requireProductionEligibility(status, now, maxAgeDays);
  const bus = await readJson(root, 'atlas/data/bus/manifest.json');
  const busPublication = await readJson(root, 'atlas/data/bus/publication-manifest.json');
  const busConfig = sources.datasets?.bus;
  if (!busConfig?.baseUrl || !['atlas-prepared-bus-data-v1', 'atlas-prepared-bus-data-v2'].includes(bus.schema)) throw new Error('Production Bus dataset configuration or manifest is unsupported.');
  const busIndexed = publicationIndex(busPublication, 'bus', sources.publicationVersion, { slot: busConfig.slot ?? null });
  for (const relative of referencedPaths(bus)) if (!busIndexed.has(relative)) throw new Error(`Bus manifest references missing published data ${relative}.`);

  const tndsConfig = sources.datasets?.tnds;
  const configuredRoots = tndsConfig?.activeRoots ?? tndsConfig?.roots ?? [];
  if (!tndsConfig?.activeBank || !Array.isArray(configuredRoots) || configuredRoots.length === 0) throw new Error('Production TNDS configuration has no explicit active bank and roots.');
  const resolver = createAtlasDataSourceResolver(sources);
  const rootRecords = [];
  const allTndsPaths = new Map();
  const tndsManifests = [];
  for (const [index, rootInfo] of configuredRoots.entries()) {
    if (!rootInfo?.id || !rootInfo?.baseUrl) throw new Error('Production TNDS configuration contains an incomplete active root.');
    const prefix = index === 0 ? 'atlas/data/bus-tnds' : `atlas/data/bus-tnds/${rootInfo.id}`;
    const manifest = await readJson(root, `${prefix}/manifest.json`);
    const publication = await readJson(root, `${prefix}/publication-manifest.json`);
    if (!['atlas-prepared-bus-tnds-v1', 'atlas-prepared-bus-tnds-v2'].includes(manifest.schema)) throw new Error(`TNDS root ${rootInfo.id} has an unsupported dataset manifest.`);
    const indexed = publicationIndex(publication, 'tnds', sources.publicationVersion, { bankId: String(tndsConfig.activeBank), rootId: String(rootInfo.id) });
    for (const relative of referencedPaths(manifest)) {
      if (relative === 'manifest.json') {
        if (!indexed.has(relative)) throw new Error(`TNDS root ${rootInfo.id} publication index omits its manifest.`);
        continue;
      }
      if (!relative.startsWith('services/')) continue;
      if (!indexed.has(relative)) continue; // Each root carries the shared full source manifest; only its allocation is local.
      if (allTndsPaths.has(relative)) throw new Error(`TNDS shard ${relative} is indexed by more than one active root.`);
      allTndsPaths.set(relative, String(rootInfo.id));
    }
    for (const file of indexed) {
      if (file.startsWith('services/')) {
        if (allTndsPaths.has(file) && allTndsPaths.get(file) !== String(rootInfo.id)) throw new Error(`TNDS shard ${file} is indexed by more than one active root.`);
        allTndsPaths.set(file, String(rootInfo.id));
      }
    }
    rootRecords.push({ rootInfo, manifest, publication, indexed, prefix });
    tndsManifests.push(manifest);
  }
  const expectedTndsPaths = new Set(rootRecords.flatMap(record => [...referencedPaths(record.manifest)].filter(file => file.startsWith('services/'))));
  for (const [relative, rootId] of allTndsPaths) {
    if (!expectedTndsPaths.has(relative)) throw new Error(`TNDS publication indexes unexpected shard ${relative}.`);
    const mapping = tndsConfig.pathMap?.[relative];
    const targetRoot = configuredRoots.find(item => String(item.id) === rootId);
    if (!mapping || new URL(mapping).href !== new URL(targetRoot.baseUrl).href) throw new Error(`TNDS shard ${relative} does not map to its indexed publication root.`);
  }
  for (const relative of expectedTndsPaths) if (!allTndsPaths.has(relative)) throw new Error(`TNDS manifest references unpublished shard ${relative}.`);
  if (Object.keys(tndsConfig.pathMap ?? {}).length !== allTndsPaths.size) throw new Error('TNDS path map does not match the complete indexed shard set.');

  const nptgConfig = sources.datasets?.nptg;
  if (!nptgConfig?.baseUrl) throw new Error('Production eligibility requires the intended NPTG dataset to be integrated and configured.');
  const nptg = await readJson(root, 'atlas/data/nptg/manifest.json');
  if (!nptg.schema) throw new Error('Production NPTG manifest schema is missing.');

  const ibusRoot = path.join(root, 'atlas/data/tfl-ibus');
  const ibus = await verifyIbusFixture(ibusRoot);
  const ibusExpiry = new Date(ibus.manifest.validTo);
  const ibusStart = new Date(ibus.manifest.validFrom);
  if (Number.isNaN(ibusStart.getTime()) || Number.isNaN(ibusExpiry.getTime()) || ibusStart > now || ibusExpiry < now) throw new Error('Production release requires a currently valid iBus manifest/index pair.');

  const nptgManifestSha256 = jsonHash(nptg);
  const identity = dataPublicationIdentity({
    dataSources: sources,
    dataStatus: status,
    busManifestSha256: jsonHash(bus),
    tndsManifestSha256: tndsManifests.map(jsonHash),
    nptgManifestSha256,
    ibusManifestSha256: jsonHash(ibus.manifest),
    ibusIndexSha256: jsonHash(ibus.index)
  });
  const identitySha256 = assertApprovedLiveDataIdentity(identity, approvedDataIdentitySha256);
  const availabilityUrls = [];
  for (const relative of busIndexed) if (relative !== 'manifest.json') availabilityUrls.push(resolver.fileUrl('bus', relative));
  for (const [relative] of allTndsPaths) availabilityUrls.push(resolver.fileUrl('tnds', relative));
  const nptgManifestPath = nptgConfig.manifest || 'manifest.json';
  const nptgBase = new URL(nptgConfig.baseUrl);
  if (nptgBase.protocol !== 'https:') throw new Error('Production NPTG data URL must use HTTPS.');
  availabilityUrls.push(new URL(nptgManifestPath, nptgBase).href);
  for (const relative of referencedPaths(nptg)) if (relative !== 'manifest.json') availabilityUrls.push(new URL(relative, nptgBase).href);
  const availableReferences = await checkUrls(availabilityUrls, fetchImpl);
  return { ok: true, applicationSha: String(applicationSha).toLowerCase(), identity, identitySha256, freshness, activeTndsBank: String(tndsConfig.activeBank), activeTndsRootCount: configuredRoots.length, availableReferences };
}

async function main() {
  const root = option('--snapshot-root');
  const applicationSha = option('--application-sha');
  const approvedDataIdentitySha256 = option('--approved-data-identity-sha256');
  if (!root || !applicationSha || !approvedDataIdentitySha256) throw new Error('Usage: node app-only-data-preflight.mjs --snapshot-root <root> --application-sha <sha> --approved-data-identity-sha256 <sha256>');
  const result = await validateAppOnlyDataSnapshot({ snapshotRoot: root, applicationSha, approvedDataIdentitySha256 });
  console.log(`Read-only application/data preflight passed: app=${result.applicationSha}; data=${result.identitySha256}; refs=${result.availableReferences}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main().catch(error => { console.error(`App-only data preflight failed: ${error.message}`); process.exitCode = 1; });
