import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGES_DATASET_LIMIT_BYTES = 1_000_000_000;
export const PUBLICATION_SAFETY_MARGIN_BYTES = 100_000_000;
export const SAFE_PUBLICATION_LIMIT_BYTES = PAGES_DATASET_LIMIT_BYTES - PUBLICATION_SAFETY_MARGIN_BYTES;
export const PUBLICATION_METADATA_BUDGET_BYTES = 1_000_000;
export const TNDS_REGIONS = Object.freeze(['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']);
export const PUBLICATION_SLOTS = Object.freeze(['slot-a', 'slot-b']);

async function filesUnder(root, current = root) {
  const entries = [];
  for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git') continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) entries.push(...await filesUnder(root, absolute));
    else if (entry.isFile()) entries.push({ path: path.relative(root, absolute).replaceAll(path.sep, '/'), absolute });
  }
  return entries;
}

async function digestFile(absolute) {
  return crypto.createHash('sha256').update(await fs.readFile(absolute)).digest('hex');
}

export async function measurePublicationTree(root) {
  const files = [];
  for (const item of await filesUnder(root)) {
    const stat = await fs.stat(item.absolute);
    files.push({ path: item.path, bytes: stat.size, sha256: await digestFile(item.absolute) });
  }
  const ordered = files.sort((a, b) => a.path.localeCompare(b.path));
  const aggregate = crypto.createHash('sha256');
  for (const item of ordered) aggregate.update(`${item.path}:${item.sha256}\n`);
  return { root, files: ordered, fileCount: ordered.length, bytes: ordered.reduce((sum, item) => sum + item.bytes, 0), sha256: aggregate.digest('hex'), largest: [...ordered].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 10) };
}

export function assertPublicationFits(measurement, label, limit = SAFE_PUBLICATION_LIMIT_BYTES) {
  if (measurement.bytes > limit) throw new Error(`${label} publication is ${measurement.bytes} bytes across ${measurement.fileCount} files; the safe bounded-publication limit is ${limit} bytes (GitHub Pages limit ${PAGES_DATASET_LIMIT_BYTES} bytes, leaving ${PUBLICATION_SAFETY_MARGIN_BYTES} bytes safety margin).`);
  return measurement;
}

function capacitySummary(bytes) {
  return { bytes, safeLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, fitsSafeLimit: bytes <= SAFE_PUBLICATION_LIMIT_BYTES, overSafeLimitBytes: Math.max(0, bytes - SAFE_PUBLICATION_LIMIT_BYTES), safetyMarginRemainingBytes: Math.max(0, SAFE_PUBLICATION_LIMIT_BYTES - bytes) };
}

export function normaliseBaseUrl(value) {
  const url = new URL(String(value));
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

function snapshotUrl(siteUrl) { return normaliseBaseUrl(siteUrl); }
function slotUrl(siteUrl, slot) { return `${normaliseBaseUrl(siteUrl)}${slot}/`; }

function normaliseRoot(root, index = 0) {
  return { id: String(root.id ?? `root-${index + 1}`), repository: root.repository, siteUrl: root.siteUrl ?? root.baseUrl, activeSlot: root.activeSlot ?? null };
}

function publicRoot(root) {
  return { id: root.id, baseUrl: normaliseBaseUrl(root.baseUrl ?? root.siteUrl), regions: [...(root.regions ?? [])].sort((a, b) => a.localeCompare(b)), fileCount: root.fileCount ?? null, bytes: root.bytes ?? null, sha256: root.sha256 ?? null, manifest: root.manifest ?? 'manifest.json', publicationManifest: root.publicationManifest ?? 'publication-manifest.json' };
}

export function buildAtlasDataSources({ publicationVersion, generatedAt, busSiteUrl, tndsSiteUrl, busBaseUrl, tndsBaseUrl, busSlot, tndsSlot, tndsPathRoots = [], tndsPathMap = {}, tndsPublicationRoots = [], activeTndsBank = null, rollbackTndsBank = null, tndsBanks = [] }) {
  const roots = tndsPublicationRoots.map(publicRoot);
  const activeBankId = typeof activeTndsBank === 'string' ? activeTndsBank : activeTndsBank?.id ?? null;
  const rollbackBank = rollbackTndsBank ? { id: rollbackTndsBank.id, roots: (rollbackTndsBank.roots ?? []).map(publicRoot) } : null;
  const resolvedBusUrl = busBaseUrl ?? (busSiteUrl ? slotUrl(busSiteUrl, busSlot) : null);
  const resolvedTndsUrl = tndsBaseUrl ?? roots[0]?.baseUrl ?? (tndsSiteUrl ? snapshotUrl(tndsSiteUrl) : null);
  const bus = { baseUrl: resolvedBusUrl ? normaliseBaseUrl(resolvedBusUrl) : null, slot: busSlot ?? null, manifest: 'manifest.json', publicationManifest: 'publication-manifest.json', pathRoots: [], pathMap: {} };
  const tnds = { baseUrl: resolvedTndsUrl ? normaliseBaseUrl(resolvedTndsUrl) : null, slot: tndsSlot ?? null, activeBank: activeBankId, activeRoots: roots, rollbackBank, banks: tndsBanks, manifest: 'manifest.json', publicationManifest: 'publication-manifest.json', pathRoots: tndsPathRoots, pathMap: tndsPathMap, roots };
  return { schema: 'atlas-data-sources-v2', publicationVersion, generatedAt, datasets: { bus, tnds, nptg: null } };
}

export function renderAtlasDataSourcesModule(config) { return `// Generated after every reference-data publication passes validation.\nexport const atlasDataSources = Object.freeze(${JSON.stringify(config, null, 2)});\n`; }

export function regionFromTndsPath(relativePath) {
  const matches = [...String(relativePath).toUpperCase().matchAll(/(?:^|[\\/_.-])(EA|EM|NE|NW|SE|SW|WM|Y)(?=[\\/_.-]|$)/g)].map(match => match[1]);
  const regions = [...new Set(matches)];
  if (regions.length !== 1) throw new Error(`TNDS service shard ${relativePath} does not map to exactly one authoritative region (${TNDS_REGIONS.join(', ')}).`);
  return regions[0];
}

export function allocateTndsRegions(measurement, expectedRegions = TNDS_REGIONS, { allowMissing = false } = {}) {
  const regions = Object.fromEntries(TNDS_REGIONS.map(region => [region, { region, files: [], fileCount: 0, bytes: 0, largest: [] }]));
  for (const item of measurement.files.filter(file => file.path.toLowerCase().startsWith('services/'))) {
    const region = regionFromTndsPath(item.path);
    regions[region].files.push({ path: item.path, bytes: item.bytes, sha256: item.sha256 });
    regions[region].fileCount += 1;
    regions[region].bytes += item.bytes;
  }
  for (const allocation of Object.values(regions)) allocation.largest = [...allocation.files].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 3);
  const expected = [...new Set(expectedRegions.map(region => String(region).toUpperCase()))];
  const invalid = expected.filter(region => !TNDS_REGIONS.includes(region));
  if (invalid.length) throw new Error(`TNDS publication contains unsupported expected region identities: ${invalid.join(', ')}.`);
  const missing = expected.filter(region => regions[region].fileCount === 0);
  if (missing.length && !allowMissing) throw new Error(`TNDS publication is missing expected national region shard groups: ${missing.join(', ')}.`);
  return { expectedRegions: expected, regions };
}

function compareNumberArrays(left, right) { for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return left[index] - right[index]; return 0; }
function compareAssignments(left, right) { for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return left[index] - right[index]; return 0; }

/** Allocate complete regions across one TNDS bank using an exact minimax search. */
export function allocateTndsPublicationRoots(measurement, { expectedRegions = TNDS_REGIONS, rootIds = ['root-1', 'root-2', 'root-3'], allowAdditionalRoots = false, metadataBudgetBytes = PUBLICATION_METADATA_BUDGET_BYTES } = {}) {
  const regional = allocateTndsRegions(measurement, expectedRegions);
  const commonFiles = measurement.files.filter(file => !file.path.toLowerCase().startsWith('services/')).map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 }));
  const commonBytes = commonFiles.reduce((sum, file) => sum + file.bytes, 0);
  let ids = [...new Set(rootIds.map(String))];
  if (!ids.length) ids = ['root-1', 'root-2', 'root-3'];
  if (ids.length > regional.expectedRegions.length && !allowAdditionalRoots) throw new Error(`Configured TNDS publication roots (${ids.length}) exceed the number of authoritative regions (${regional.expectedRegions.length}).`);
  const orderedRegions = regional.expectedRegions.map(region => regional.regions[region]).sort((a, b) => b.bytes - a.bytes || a.region.localeCompare(b.region));
  if (!orderedRegions.length) throw new Error('TNDS publication contains no authoritative service shards.');
  const loads = Array(ids.length).fill(0);
  const assignments = Array(orderedRegions.length).fill(-1);
  let best = null;
  function score() { const totals = loads.map(load => commonBytes + load + metadataBudgetBytes); return { max: Math.max(...totals), sortedTotals: [...totals].sort((a, b) => b - a), assignments: [...assignments], totals }; }
  function better(candidate, current) { if (!current) return true; if (candidate.max !== current.max) return candidate.max < current.max; const loadOrder = compareNumberArrays(candidate.sortedTotals, current.sortedTotals); if (loadOrder !== 0) return loadOrder < 0; return compareAssignments(candidate.assignments, current.assignments) < 0; }
  function search(index) {
    if (index === orderedRegions.length) { if (ids.length <= orderedRegions.length && loads.some(load => load === 0)) return; const candidate = score(); if (candidate.max <= SAFE_PUBLICATION_LIMIT_BYTES && better(candidate, best)) best = candidate; return; }
    const region = orderedRegions[index];
    const seenLoads = new Set();
    for (let rootIndex = 0; rootIndex < ids.length; rootIndex += 1) {
      if (seenLoads.has(loads[rootIndex])) continue;
      seenLoads.add(loads[rootIndex]);
      if (commonBytes + loads[rootIndex] + region.bytes + metadataBudgetBytes > SAFE_PUBLICATION_LIMIT_BYTES) continue;
      loads[rootIndex] += region.bytes; assignments[index] = rootIndex; search(index + 1); loads[rootIndex] -= region.bytes; assignments[index] = -1;
    }
  }
  search(0);
  if (!best) { const largest = Math.max(...orderedRegions.map(region => commonBytes + region.bytes + metadataBudgetBytes)); throw new Error(`Configured TNDS publication roots cannot contain the complete candidate below the safe ${SAFE_PUBLICATION_LIMIT_BYTES}-byte root ceiling; largest indivisible requirement is ${largest} bytes. Stop and report the capacity blocker.`); }
  const roots = ids.map(id => ({ id, regions: [], files: [...commonFiles], fileCount: commonFiles.length, candidateBytes: commonBytes, projectedCurrentFootprintBytes: commonBytes + metadataBudgetBytes, projectedCandidateRollbackOverheadBytes: commonBytes + metadataBudgetBytes, projectedTotalPublicationFootprintBytes: commonBytes + metadataBudgetBytes, safetyMarginRemainingBytes: SAFE_PUBLICATION_LIMIT_BYTES - commonBytes - metadataBudgetBytes }));
  const shardToRoot = {};
  orderedRegions.forEach((region, index) => { const root = roots[best.assignments[index]]; root.regions.push(region.region); root.files.push(...region.files); root.fileCount += region.fileCount; root.candidateBytes += region.bytes; for (const file of region.files) { if (shardToRoot[file.path]) throw new Error(`TNDS shard ${file.path} was allocated more than once.`); shardToRoot[file.path] = root.id; } });
  const requiredFiles = regional.expectedRegions.flatMap(region => regional.regions[region].files).map(file => file.path).sort();
  const allocatedFiles = Object.keys(shardToRoot).sort();
  if (requiredFiles.length !== allocatedFiles.length || requiredFiles.some((file, index) => file !== allocatedFiles[index])) throw new Error('TNDS shard allocation is incomplete or duplicated.');
  for (const root of roots) { root.regions.sort((a, b) => a.localeCompare(b)); root.files.sort((a, b) => a.path.localeCompare(b.path)); root.projectedCurrentFootprintBytes = root.candidateBytes + metadataBudgetBytes; root.projectedCandidateRollbackOverheadBytes = root.projectedCurrentFootprintBytes; root.projectedTotalPublicationFootprintBytes = root.projectedCurrentFootprintBytes; root.safetyMarginRemainingBytes = SAFE_PUBLICATION_LIMIT_BYTES - root.projectedTotalPublicationFootprintBytes; root.largest = [...root.files].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 10); root.fit = root.projectedTotalPublicationFootprintBytes <= SAFE_PUBLICATION_LIMIT_BYTES; }
  return { expectedRegions: regional.expectedRegions, commonFiles, commonBytes, metadataBudgetBytes, roots: roots.filter(root => root.regions.length), shardToRoot, regionAllocation: regional, projectedTotalAcrossRootsBytes: roots.reduce((sum, root) => sum + root.projectedTotalPublicationFootprintBytes, 0), objective: { type: 'exact-minimax', largestRootBytes: best.max, tieBreak: 'descending-footprint-then-root-order' } };
}

async function readManifest(root) { return JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8')); }
function publicFiles(measurement) { return measurement.files.map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })); }
const exists = target => fs.stat(target).then(() => true).catch(() => false);

async function writePublicationManifest(destination, dataset, publicationVersion, payloadMeasurement, generatedAt, { bankId = null, rootId = null, regionAllocation = null, sourceSha256 = payloadMeasurement.sha256, sourceManifest = null } = {}) {
  const manifest = sourceManifest ?? await readManifest(destination);
  const publication = { schema: 'atlas-reference-data-publication-v4', dataset, bankId, rootId, publicationVersion, generatedAt, datasetManifest: 'manifest.json', sourceManifest: { schema: manifest.schema, generatedAt: manifest.generatedAt ?? null, snapshotDate: manifest.snapshotDate ?? null, source: manifest.source ?? null, regions: manifest.regions ?? manifest.sources?.bods?.regions?.map(region => region.region) ?? null, expectedRegions: manifest.expectedRegions ?? null, serviceShardPaths: Object.values(manifest.serviceShards ?? {}).flat().filter(Boolean).sort(), sourceSha256 }, regionAllocation, payload: { fileCount: payloadMeasurement.fileCount, bytes: payloadMeasurement.bytes, sha256: payloadMeasurement.sha256, files: publicFiles(payloadMeasurement) } };
  await fs.writeFile(path.join(destination, 'publication-manifest.json'), `${JSON.stringify(publication, null, 2)}\n`);
}

function otherSlot(activeSlot) { if (!activeSlot) return PUBLICATION_SLOTS[0]; if (!PUBLICATION_SLOTS.includes(activeSlot)) throw new Error(`Active publication slot must be slot-a or slot-b, received ${activeSlot}.`); return PUBLICATION_SLOTS.find(slot => slot !== activeSlot); }

async function replaceRepositoryContents(repository, staging) {
  await fs.mkdir(repository, { recursive: true });
  for (const entry of await fs.readdir(repository)) if (entry !== '.git') await fs.rm(path.join(repository, entry), { recursive: true, force: true });
  for (const entry of await fs.readdir(staging)) await fs.cp(path.join(staging, entry), path.join(repository, entry), { recursive: true });
}

async function copyCandidateSubset(candidateRoot, destination, selectedPaths = null) {
  const selected = selectedPaths ? new Set(selectedPaths) : null;
  for (const item of await filesUnder(candidateRoot)) { if (selected && item.path.toLowerCase().startsWith('services/') && !selected.has(item.path)) continue; const target = path.join(destination, item.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(item.absolute, target); }
}

async function stageBusPublication({ candidateSite, repository, activeSlot, publicationVersion, generatedAt }) {
  const candidateRoot = path.join(candidateSite, 'atlas', 'data', 'bus');
  const source = await measurePublicationTree(candidateRoot);
  const candidateSlot = otherSlot(activeSlot);
  const staging = path.join(path.dirname(repository), `.atlas-bus-staging-${process.pid}`);
  await fs.rm(staging, { recursive: true, force: true });
  try {
    await fs.mkdir(staging, { recursive: true }); await fs.writeFile(path.join(staging, '.nojekyll'), '');
    if (activeSlot && await exists(path.join(repository, activeSlot))) await fs.cp(path.join(repository, activeSlot), path.join(staging, activeSlot), { recursive: true });
    await copyCandidateSubset(candidateRoot, path.join(staging, candidateSlot));
    const payload = await measurePublicationTree(path.join(staging, candidateSlot));
    await writePublicationManifest(path.join(staging, candidateSlot), 'bus', publicationVersion, payload, generatedAt, { sourceSha256: source.sha256 });
    const candidateMeasurement = assertPublicationFits(await measurePublicationTree(path.join(staging, candidateSlot)), 'BUS candidate slot');
    const totalSite = assertPublicationFits(await measurePublicationTree(staging), 'BUS total site including rollback slot');
    const auditDirectory = path.join(staging, 'audit'); await fs.mkdir(auditDirectory, { recursive: true });
    if (await exists(path.join(repository, 'audit', 'current.json'))) await fs.copyFile(path.join(repository, 'audit', 'current.json'), path.join(auditDirectory, 'previous.json'));
    const audit = { schema: 'atlas-reference-data-publication-audit-v3', publicationVersion, generatedAt, dataset: 'bus', sourceSha256: source.sha256, candidateSha256: candidateMeasurement.sha256, candidateBytes: candidateMeasurement.bytes, candidateFiles: candidateMeasurement.fileCount, activeSlot: activeSlot ?? null, candidateSlot };
    await fs.writeFile(path.join(auditDirectory, 'current.json'), `${JSON.stringify(audit, null, 2)}\n`);
    await fs.writeFile(path.join(staging, 'publication-state.json'), `${JSON.stringify({ schema: 'atlas-reference-data-publication-state-v4', dataset: 'bus', publicationVersion, generatedAt, lifecycle: 'candidate-ready', activeSlot: activeSlot ?? null, candidateSlot, previousSlot: activeSlot ?? null, safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, candidate: { fileCount: candidateMeasurement.fileCount, bytes: candidateMeasurement.bytes, sha256: candidateMeasurement.sha256 }, totalSite: { fileCount: totalSite.fileCount, bytes: totalSite.bytes, sha256: totalSite.sha256 }, audit: { current: 'audit/current.json', previous: 'audit/previous.json' } }, null, 2)}\n`);
    const finalMeasurement = assertPublicationFits(await measurePublicationTree(staging), 'BUS total site including lifecycle metadata');
    await replaceRepositoryContents(repository, staging);
    return { dataset: 'bus', source, candidate: candidateMeasurement, totalSite: finalMeasurement, activeSlot: activeSlot ?? null, candidateSlot, previousSlot: activeSlot ?? null };
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}

// Compatibility entry point for the Bus snapshot integration harness. TNDS
// callers use preparePublications so the complete inactive bank is staged as
// one guarded operation.
export async function stageBoundedPublication(options) {
  if (options.dataset === 'bus') return stageBusPublication(options);
  if (options.dataset === 'tnds') {
    const allocation = options.tndsRootAllocation ?? allocateTndsPublicationRoots(await measurePublicationTree(path.join(options.candidateSite, 'atlas', 'data', 'bus-tnds')), { rootIds: [options.tndsRoot?.id ?? 'root-1'] });
    return stageTndsBankRoot({ candidateSite: options.candidateSite, repository: options.repository, bankId: options.tndsRoot?.bankId ?? 'legacy', rootDefinition: options.tndsRoot ?? { id: 'root-1' }, allocation, publicationVersion: options.publicationVersion, generatedAt: options.generatedAt });
  }
  throw new Error(`Unsupported bounded publication dataset: ${options.dataset}`);
}

async function stageTndsBankRoot({ candidateSite, repository, bankId, rootDefinition, allocation, publicationVersion, generatedAt }) {
  const candidateRoot = path.join(candidateSite, 'atlas', 'data', 'bus-tnds');
  const source = await measurePublicationTree(candidateRoot);
  const rootAllocation = allocation.roots.find(root => root.id === rootDefinition.id);
  if (!rootAllocation) throw new Error(`No deterministic TNDS allocation exists for configured root ${rootDefinition.id}.`);
  const staging = path.join(path.dirname(repository), `.atlas-tnds-${bankId}-${rootDefinition.id}-staging-${process.pid}`);
  await fs.rm(staging, { recursive: true, force: true });
  try {
    await fs.mkdir(staging, { recursive: true }); await fs.writeFile(path.join(staging, '.nojekyll'), '');
    await copyCandidateSubset(candidateRoot, staging, rootAllocation.files.map(file => file.path));
    const payload = await measurePublicationTree(staging);
    await writePublicationManifest(staging, 'tnds', publicationVersion, payload, generatedAt, { bankId, rootId: rootDefinition.id, sourceSha256: source.sha256, sourceManifest: await readManifest(candidateRoot), regionAllocation: { bankId, rootId: rootDefinition.id, regions: rootAllocation.regions, files: rootAllocation.files.map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })) } });
    const candidateMeasurement = assertPublicationFits(await measurePublicationTree(staging), `TNDS bank ${bankId} root ${rootDefinition.id}`);
    const auditDirectory = path.join(staging, 'audit'); await fs.mkdir(auditDirectory, { recursive: true });
    if (await exists(path.join(repository, 'audit', 'current.json'))) await fs.copyFile(path.join(repository, 'audit', 'current.json'), path.join(auditDirectory, 'previous.json'));
    const audit = { schema: 'atlas-reference-data-publication-audit-v3', publicationVersion, generatedAt, dataset: 'tnds', bankId, rootId: rootDefinition.id, sourceSha256: source.sha256, candidateSha256: candidateMeasurement.sha256, candidateBytes: candidateMeasurement.bytes, candidateFiles: candidateMeasurement.fileCount, regions: rootAllocation.regions, allocation: { bytes: rootAllocation.candidateBytes, fileCount: rootAllocation.fileCount } };
    await fs.writeFile(path.join(auditDirectory, 'current.json'), `${JSON.stringify(audit, null, 2)}\n`);
    await fs.writeFile(path.join(staging, 'publication-state.json'), `${JSON.stringify({ schema: 'atlas-reference-data-publication-state-v4', dataset: 'tnds', bankId, rootId: rootDefinition.id, publicationVersion, generatedAt, lifecycle: 'candidate-ready', regions: rootAllocation.regions, candidate: { fileCount: candidateMeasurement.fileCount, bytes: candidateMeasurement.bytes, sha256: candidateMeasurement.sha256 }, safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, audit: { current: 'audit/current.json', previous: 'audit/previous.json' } }, null, 2)}\n`);
    const finalMeasurement = assertPublicationFits(await measurePublicationTree(staging), `TNDS bank ${bankId} root ${rootDefinition.id} including lifecycle metadata`);
    await replaceRepositoryContents(repository, staging);
    return { dataset: 'tnds', bankId, root: rootDefinition.id, source, payload, candidate: candidateMeasurement, totalSite: finalMeasurement, regions: rootAllocation.regions };
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}

function normaliseTndsBanks({ tndsBanks = [], tndsRepository, tndsSiteUrl, tndsPublicationRoots = [], candidateTndsBank = null }) {
  if (tndsBanks.length) return tndsBanks.map(bank => ({ id: String(bank.id), roots: (bank.roots ?? []).map(normaliseRoot) }));
  const roots = tndsPublicationRoots.length ? tndsPublicationRoots : [{ id: 'root-1', repository: tndsRepository, siteUrl: tndsSiteUrl }];
  return [{ id: String(candidateTndsBank ?? 'A'), roots: roots.map(normaliseRoot) }];
}

function oppositeBankId(activeBankId, banks) { if (!activeBankId) return banks[0]?.id ?? null; const candidates = banks.filter(bank => bank.id !== activeBankId); if (!candidates.length) throw new Error(`TNDS dual-bank configuration has no opposite bank to overwrite; active bank is ${activeBankId}.`); return candidates[0].id; }
export function selectOppositeTndsBank(activeBankId, banks) { const normalised = banks.map(bank => ({ ...bank, id: String(bank.id) })); const id = oppositeBankId(activeBankId, normalised); return normalised.find(bank => bank.id === id); }

export async function preparePublications({ candidateSite, busRepository, tndsRepository, publicationVersion, generatedAt, busSiteUrl, tndsSiteUrl, activeBusSlot = null, activeTndsSlot = null, activeTndsBank = null, candidateTndsBank = null, tndsBanks = [], tndsPublicationRoots = [], previousConfig = null, configOutput }) {
  const banks = normaliseTndsBanks({ tndsBanks, tndsRepository, tndsSiteUrl, tndsPublicationRoots, candidateTndsBank });
  const candidateBank = candidateTndsBank ? banks.find(bank => bank.id === String(candidateTndsBank)) : selectOppositeTndsBank(activeTndsBank, banks);
  if (!candidateBank) throw new Error(`Configured TNDS candidate bank ${candidateTndsBank} is not present in the bank contract.`);
  if (activeTndsBank && candidateBank.id === String(activeTndsBank)) throw new Error(`Refusing to overwrite active TNDS bank ${activeTndsBank}.`);
  if (!candidateBank.roots.length) throw new Error(`TNDS candidate bank ${candidateBank.id} has no configured roots.`);
  const tndsRootPath = path.join(candidateSite, 'atlas', 'data', 'bus-tnds');
  const tndsFullMeasurement = await measurePublicationTree(tndsRootPath);
  const allocation = allocateTndsPublicationRoots(tndsFullMeasurement, { expectedRegions: TNDS_REGIONS, rootIds: candidateBank.roots.map(root => root.id), allowAdditionalRoots: false });
  const bus = await stageBusPublication({ candidateSite, repository: busRepository, activeSlot: activeBusSlot, publicationVersion, generatedAt });
  const tnds = [];
  for (const root of candidateBank.roots) tnds.push(await stageTndsBankRoot({ candidateSite, repository: root.repository, bankId: candidateBank.id, rootDefinition: root, allocation, publicationVersion, generatedAt }));
  const configRoots = allocation.roots.map(root => { const source = candidateBank.roots.find(item => item.id === root.id); const staged = tnds.find(item => item.root === root.id); return { id: root.id, baseUrl: snapshotUrl(source.siteUrl), regions: root.regions, fileCount: staged.payload.fileCount, bytes: staged.payload.bytes, sha256: staged.payload.sha256, manifest: 'manifest.json', publicationManifest: 'publication-manifest.json' }; });
  const tndsPathMap = {};
  for (const root of allocation.roots) { const source = candidateBank.roots.find(item => item.id === root.id); for (const file of root.files.filter(item => item.path.toLowerCase().startsWith('services/'))) tndsPathMap[file.path] = snapshotUrl(source.siteUrl); }
  const rollbackRoots = previousConfig?.datasets?.tnds?.activeRoots ?? previousConfig?.datasets?.tnds?.roots ?? [];
  const config = buildAtlasDataSources({ publicationVersion, generatedAt, busSiteUrl, tndsSiteUrl, busSlot: bus.candidateSlot, tndsBaseUrl: configRoots[0]?.baseUrl, tndsPathMap, tndsPublicationRoots: configRoots, activeTndsBank: candidateBank.id, rollbackTndsBank: activeTndsBank ? { id: String(activeTndsBank), roots: rollbackRoots } : null, tndsBanks: banks.map(bank => ({ id: bank.id, rootIds: bank.roots.map(root => root.id) })) });
  await fs.mkdir(path.dirname(configOutput), { recursive: true }); await fs.writeFile(configOutput, renderAtlasDataSourcesModule(config)); await fs.writeFile(configOutput.replace(/\.mjs$/i, '.json'), `${JSON.stringify(config, null, 2)}\n`);
  return { config, bus, tnds, tndsAllocation: allocation, candidateBank, banks, safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, pagesLimitBytes: PAGES_DATASET_LIMIT_BYTES, safetyMarginBytes: PUBLICATION_SAFETY_MARGIN_BYTES };
}

export async function measureCandidateDatasets(candidateSite, { measureTree = measurePublicationTree, rootIds = ['root-1', 'root-2', 'root-3'] } = {}) {
  const candidateData = path.join(candidateSite, 'atlas', 'data'); const bus = await measureTree(path.join(candidateData, 'bus')); const tndsRoot = path.join(candidateData, 'bus-tnds'); const tnds = await measureTree(tndsRoot); const busManifest = await readManifest(path.join(candidateData, 'bus')); const manifest = await readManifest(tndsRoot); const regions = allocateTndsRegions(tnds, TNDS_REGIONS, { allowMissing: true }); const complete = TNDS_REGIONS.every(region => regions.regions[region].fileCount > 0); const rootPlan = complete ? allocateTndsPublicationRoots(tnds, { expectedRegions: TNDS_REGIONS, rootIds }) : { roots: [], shardToRoot: {}, projectedTotalAcrossRootsBytes: 0 }; const proposedGroups = { bus: [{ group: 'national-bus', ...capacitySummary(bus.bytes), files: bus.fileCount }], tnds: [{ group: 'national-tnds', ...capacitySummary(tnds.bytes), files: tnds.fileCount }, ...TNDS_REGIONS.map(region => ({ group: `tnds-${region}`, ...capacitySummary(regions.regions[region].bytes), files: regions.regions[region].fileCount, region }))] };
  return { diagnosticSchema: 'atlas-publication-capacity-diagnostic-v3', correction: 'BUS-RECOVERY-0D.3', safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, pagesLimitBytes: PAGES_DATASET_LIMIT_BYTES, safetyMarginBytes: PUBLICATION_SAFETY_MARGIN_BYTES, bus: { source: 'prepared-candidate', coverage: 'national-bus-candidate', fixtureOrIncomplete: false, generatedAt: busManifest.generatedAt ?? null, candidateBytes: bus.bytes, candidateFiles: bus.fileCount, ...capacitySummary(bus.bytes), projectedCurrentFootprintBytes: bus.bytes, projectedCandidateRollbackOverheadBytes: bus.bytes + PUBLICATION_METADATA_BUDGET_BYTES, projectedTotalPublicationFootprintBytes: 2 * bus.bytes + PUBLICATION_METADATA_BUDGET_BYTES, projectedBlueGreenBytes: bus.bytes * 2, projectedBlueGreenFitsSafeLimit: 2 * bus.bytes + PUBLICATION_METADATA_BUDGET_BYTES <= SAFE_PUBLICATION_LIMIT_BYTES, sha256: bus.sha256, largest: bus.largest, largestShards: bus.largest }, tnds: { source: manifest.source ?? 'unknown', coverage: complete ? 'complete-national-region-set' : 'fixture-or-incomplete-region-set', fixtureOrIncomplete: !complete, freshAcquisitionEvidence: 'This measures the supplied candidate; freshness is established by the acquisition run and is not inferred from bytes.', candidateBytes: tnds.bytes, candidateFiles: tnds.fileCount, ...capacitySummary(tnds.bytes), projectedBlueGreenBytes: 2 * tnds.bytes, projectedBlueGreenFitsSafeLimit: 2 * tnds.bytes + PUBLICATION_METADATA_BUDGET_BYTES <= SAFE_PUBLICATION_LIMIT_BYTES, sha256: tnds.sha256, largest: tnds.largest, largestShards: tnds.largest, regions }, proposedPublication: { bankRootCount: rootIds.length, roots: rootPlan.roots, projectedTotalAcrossRootsBytes: rootPlan.projectedTotalAcrossRootsBytes, allRootsFitSafeLimit: rootPlan.roots.length > 0 && rootPlan.roots.every(root => root.fit), safetyMarginRemainingBytes: rootPlan.roots.reduce((sum, root) => sum + root.safetyMarginRemainingBytes, 0), shardToRoot: rootPlan.shardToRoot }, proposedPublicationGroups: proposedGroups };
}

export async function promoteBoundedPublication({ repository, candidateSlot, publicationVersion }) { const statePath = path.join(repository, 'publication-state.json'); const state = JSON.parse(await fs.readFile(statePath, 'utf8')); if (state.lifecycle !== 'candidate-ready' || state.candidateSlot !== candidateSlot || state.publicationVersion !== publicationVersion) throw new Error('Only the validated Bus candidate can be promoted.'); const promoted = { ...state, lifecycle: 'current', currentSlot: candidateSlot, activeSlot: candidateSlot, previousSlot: state.currentSlot ?? state.activeSlot ?? null, candidateSlot: null, applicationConfigVersion: publicationVersion }; await fs.writeFile(statePath, `${JSON.stringify(promoted, null, 2)}\n`); return promoted; }
export async function rollbackBoundedPublication({ repository }) { const statePath = path.join(repository, 'publication-state.json'); const state = JSON.parse(await fs.readFile(statePath, 'utf8')); const previousSlot = state.previousSlot; if (!previousSlot || !PUBLICATION_SLOTS.includes(previousSlot) || !(await exists(path.join(repository, previousSlot)))) throw new Error('No recoverable previous Bus publication slot is available.'); const rolledBack = { ...state, lifecycle: 'rolled-back', currentSlot: previousSlot, activeSlot: previousSlot, candidateSlot: state.currentSlot ?? state.activeSlot ?? null, previousSlot: null, applicationConfigVersion: null }; await fs.writeFile(statePath, `${JSON.stringify(rolledBack, null, 2)}\n`); return rolledBack; }

export function rollbackToOppositeBank(config) { const tnds = config?.datasets?.tnds; if (!tnds?.rollbackBank?.id || !tnds.rollbackBank.roots?.length) throw new Error('No validated opposite TNDS bank is recorded in the deployed configuration.'); const next = structuredClone(config); next.datasets.tnds.activeBank = tnds.rollbackBank.id; next.datasets.tnds.activeRoots = tnds.rollbackBank.roots; next.datasets.tnds.roots = tnds.rollbackBank.roots; next.datasets.tnds.baseUrl = tnds.rollbackBank.roots[0].baseUrl; next.datasets.tnds.pathMap = {}; next.datasets.tnds.rollbackBank = { id: tnds.activeBank, roots: tnds.activeRoots ?? tnds.roots }; return next; }

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => { if (value.startsWith('--')) pairs.push([value.slice(2), values[index + 1]]); return pairs; }, []));
  const required = ['candidate-site', 'bus-repository', 'version', 'generated-at', 'bus-site-url', 'config-output']; for (const key of required) if (!args[key]) throw new Error(`Missing --${key}`);
  const bankPlan = args['tnds-bank-plan'] ? JSON.parse(await fs.readFile(path.resolve(args['tnds-bank-plan']), 'utf8')) : null;
  const banks = bankPlan?.banks ?? (args['tnds-banks-json'] ? JSON.parse(args['tnds-banks-json']) : []);
  const result = await preparePublications({ candidateSite: path.resolve(args['candidate-site']), busRepository: path.resolve(args['bus-repository']), tndsRepository: args['tnds-repository'] ? path.resolve(args['tnds-repository']) : undefined, tndsBanks: banks, candidateTndsBank: bankPlan?.candidateBankId ?? args['candidate-tnds-bank'], activeTndsBank: bankPlan?.activeBankId ?? args['active-tnds-bank'] ?? null, previousConfig: bankPlan?.previousConfig ?? null, publicationVersion: args.version, generatedAt: args['generated-at'], busSiteUrl: args['bus-site-url'], tndsSiteUrl: args['tnds-site-url'], activeBusSlot: args['active-bus-slot'] || null, configOutput: path.resolve(args['config-output']) });
  console.log(JSON.stringify({ correction: 'BUS-RECOVERY-0D.3', safetyLimitBytes: result.safetyLimitBytes, bus: { candidateBytes: result.bus.candidate.bytes, totalSiteBytes: result.bus.totalSite.bytes, activeSlot: result.bus.activeSlot, candidateSlot: result.bus.candidateSlot }, tnds: { activeBank: result.candidateBank.id, roots: result.tnds.map(root => ({ root: root.root, candidateBytes: root.candidate.bytes, payloadBytes: root.payload.bytes, totalSiteBytes: root.totalSite.bytes, regions: root.regions })) }, allocation: result.tndsAllocation, config: result.config }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`Reference-data publication preparation failed: ${error.message}`); process.exitCode = 1; });
