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
  for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
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
  const ordered = files.sort((left, right) => left.path.localeCompare(right.path));
  const aggregate = crypto.createHash('sha256');
  for (const item of ordered) aggregate.update(`${item.path}:${item.sha256}\n`);
  return { root, files: ordered, fileCount: ordered.length, bytes: ordered.reduce((sum, item) => sum + item.bytes, 0), sha256: aggregate.digest('hex'), largest: [...ordered].sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path)).slice(0, 10) };
}

export function assertPublicationFits(measurement, label, limit = SAFE_PUBLICATION_LIMIT_BYTES) {
  if (measurement.bytes > limit) throw new Error(`${label} publication is ${measurement.bytes} bytes across ${measurement.fileCount} files; the safe bounded-publication limit is ${limit} bytes (GitHub Pages limit ${PAGES_DATASET_LIMIT_BYTES} bytes, leaving ${PUBLICATION_SAFETY_MARGIN_BYTES} bytes safety margin). Partitioning is required before publication.`);
  return measurement;
}

function capacitySummary(bytes) {
  return { bytes, safeLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, fitsSafeLimit: bytes <= SAFE_PUBLICATION_LIMIT_BYTES, overSafeLimitBytes: Math.max(0, bytes - SAFE_PUBLICATION_LIMIT_BYTES), safetyMarginRemainingBytes: Math.max(0, SAFE_PUBLICATION_LIMIT_BYTES - bytes) };
}

function normaliseBaseUrl(value) {
  const url = new URL(String(value));
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

function slotUrl(siteUrl, slot) { return `${normaliseBaseUrl(siteUrl)}${slot}/`; }

export function buildAtlasDataSources({ publicationVersion, generatedAt, busSiteUrl, tndsSiteUrl, busBaseUrl, tndsBaseUrl, busSlot, tndsSlot, tndsPathRoots = [], tndsPathMap = {}, tndsPublicationRoots = [] }) {
  const resolvedBusUrl = busBaseUrl ?? slotUrl(busSiteUrl, busSlot);
  const resolvedTndsUrl = tndsBaseUrl ?? slotUrl(tndsSiteUrl, tndsSlot);
  const roots = tndsPublicationRoots.map(root => ({ id: root.id, baseUrl: normaliseBaseUrl(root.baseUrl), slot: root.slot ?? null, regions: root.regions ?? [], fileCount: root.fileCount ?? null, bytes: root.bytes ?? null, sha256: root.sha256 ?? null }));
  return {
    schema: 'atlas-data-sources-v1', publicationVersion, generatedAt,
    datasets: {
      bus: { baseUrl: normaliseBaseUrl(resolvedBusUrl), slot: busSlot ?? null, manifest: 'manifest.json', publicationManifest: 'publication-manifest.json', pathRoots: [], pathMap: {} },
      tnds: { baseUrl: normaliseBaseUrl(resolvedTndsUrl), slot: tndsSlot ?? null, slots: Object.fromEntries(roots.map(root => [root.id, root.slot])), manifest: 'manifest.json', publicationManifest: 'publication-manifest.json', pathRoots: tndsPathRoots, pathMap: tndsPathMap, roots },
      nptg: null
    }
  };
}

export function renderAtlasDataSourcesModule(config) { return `// Generated after every reference-data publication passes validation.\nexport const atlasDataSources = Object.freeze(${JSON.stringify(config, null, 2)});\n`; }

export function regionFromTndsPath(relativePath) {
  const matches = [...String(relativePath).toUpperCase().matchAll(/(?:^|[\\/_.-])(EA|EM|NE|NW|SE|SW|WM|Y)(?=[\\/_.-]|$)/g)].map(match => match[1]);
  const regions = [...new Set(matches)];
  if (regions.length !== 1) throw new Error(`TNDS service shard ${relativePath} does not map to exactly one authoritative region (${TNDS_REGIONS.join(', ')}).`);
  return regions[0];
}

export function allocateTndsRegions(measurement, expectedRegions = [], { allowMissing = false } = {}) {
  const regions = Object.fromEntries(TNDS_REGIONS.map(region => [region, { region, files: [], fileCount: 0, bytes: 0, largest: [] }]));
  for (const item of measurement.files.filter(file => file.path.toLowerCase().startsWith('services/'))) {
    const region = regionFromTndsPath(item.path);
    regions[region].files.push({ path: item.path, bytes: item.bytes, sha256: item.sha256 });
    regions[region].fileCount += 1;
    regions[region].bytes += item.bytes;
  }
  for (const allocation of Object.values(regions)) allocation.largest = [...allocation.files].sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path)).slice(0, 3);
  const expected = [...new Set(expectedRegions.map(region => String(region).toUpperCase()))];
  const invalid = expected.filter(region => !TNDS_REGIONS.includes(region));
  if (invalid.length) throw new Error(`TNDS publication contains unsupported expected region identities: ${invalid.join(', ')}.`);
  const missing = expected.filter(region => regions[region].fileCount === 0);
  if (missing.length && !allowMissing) throw new Error(`TNDS publication is missing expected national region shard groups: ${missing.join(', ')}.`);
  return { expectedRegions: expected, regions };
}

/** Allocate whole TNDS regions to roots, with a two-slot lifecycle budget. */
export function allocateTndsPublicationRoots(measurement, { expectedRegions = TNDS_REGIONS, rootIds = [], allowAdditionalRoots = true, metadataBudgetBytes = PUBLICATION_METADATA_BUDGET_BYTES } = {}) {
  const regional = allocateTndsRegions(measurement, expectedRegions);
  const commonFiles = measurement.files.filter(file => !file.path.toLowerCase().startsWith('services/')).map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 }));
  const commonBytes = commonFiles.reduce((sum, file) => sum + file.bytes, 0);
  const ids = rootIds.length ? [...new Set(rootIds.map(String))] : ['root-1'];
  const roots = ids.map(id => ({ id, regions: [], files: [...commonFiles], fileCount: commonFiles.length, candidateBytes: commonBytes, projectedCurrentFootprintBytes: commonBytes, projectedCandidateRollbackOverheadBytes: commonBytes + metadataBudgetBytes, projectedTotalPublicationFootprintBytes: commonBytes + metadataBudgetBytes, safetyMarginRemainingBytes: Math.max(0, SAFE_PUBLICATION_LIMIT_BYTES - commonBytes - metadataBudgetBytes) }));
  const serviceRoot = {};
  const orderedRegions = regional.expectedRegions.map(region => regional.regions[region]).sort((left, right) => right.bytes - left.bytes || left.region.localeCompare(right.region));
  for (const region of orderedRegions) {
    const required = commonBytes + region.bytes;
    if (2 * required + metadataBudgetBytes > SAFE_PUBLICATION_LIMIT_BYTES) throw new Error(`TNDS authoritative region ${region.region} requires ${2 * required + metadataBudgetBytes} bytes for current/candidate rollback, above the safe publication budget ${SAFE_PUBLICATION_LIMIT_BYTES}; stop and obtain a larger publication root.`);
    const candidates = roots.filter(root => root.projectedTotalPublicationFootprintBytes + 2 * region.bytes <= SAFE_PUBLICATION_LIMIT_BYTES);
    let root = candidates.sort((left, right) => left.projectedTotalPublicationFootprintBytes - right.projectedTotalPublicationFootprintBytes || left.id.localeCompare(right.id))[0];
    if (!root && allowAdditionalRoots) {
      root = { id: `root-${roots.length + 1}`, regions: [], files: [...commonFiles], fileCount: commonFiles.length, candidateBytes: commonBytes, projectedCurrentFootprintBytes: commonBytes, projectedCandidateRollbackOverheadBytes: commonBytes + metadataBudgetBytes, projectedTotalPublicationFootprintBytes: commonBytes + metadataBudgetBytes, safetyMarginRemainingBytes: Math.max(0, SAFE_PUBLICATION_LIMIT_BYTES - commonBytes - metadataBudgetBytes) };
      roots.push(root);
    }
    if (!root) throw new Error(`Configured TNDS publication roots cannot contain region ${region.region} within the safe current/candidate rollback budget.`);
    root.regions.push(region.region); root.files.push(...region.files); root.fileCount += region.fileCount; root.candidateBytes += region.bytes;
    root.projectedCurrentFootprintBytes = root.candidateBytes;
    root.projectedCandidateRollbackOverheadBytes = root.candidateBytes + metadataBudgetBytes;
    root.projectedTotalPublicationFootprintBytes = 2 * root.candidateBytes + metadataBudgetBytes;
    root.safetyMarginRemainingBytes = Math.max(0, SAFE_PUBLICATION_LIMIT_BYTES - root.projectedTotalPublicationFootprintBytes);
    for (const file of region.files) {
      if (serviceRoot[file.path]) throw new Error(`TNDS shard ${file.path} was allocated more than once.`);
      serviceRoot[file.path] = root.id;
    }
  }
  const requiredFiles = regional.expectedRegions.flatMap(region => regional.regions[region].files).map(file => file.path).sort();
  const allocatedFiles = Object.keys(serviceRoot).sort();
  if (requiredFiles.length !== allocatedFiles.length || requiredFiles.some((file, index) => file !== allocatedFiles[index])) throw new Error('TNDS shard allocation is incomplete or duplicated.');
  for (const root of roots) {
    root.regions.sort((left, right) => left.localeCompare(right)); root.files.sort((left, right) => left.path.localeCompare(right.path));
    root.largest = [...root.files].sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path)).slice(0, 10); root.fit = root.projectedTotalPublicationFootprintBytes <= SAFE_PUBLICATION_LIMIT_BYTES;
  }
  return { expectedRegions: regional.expectedRegions, commonFiles, commonBytes, roots: roots.filter(root => root.regions.length), shardToRoot: serviceRoot, regionAllocation: regional };
}

async function readManifest(root) { return JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8')); }
function publicFiles(measurement) { return measurement.files.map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })); }

async function writePublicationManifest(destination, dataset, publicationVersion, payloadMeasurement, generatedAt, regionAllocation = null, rootId = null, sourceSha256 = payloadMeasurement.sha256) {
  const sourceManifest = await readManifest(destination);
  const publication = {
    schema: 'atlas-reference-data-publication-v3', dataset, rootId, publicationVersion, generatedAt, datasetManifest: 'manifest.json',
    sourceManifest: { schema: sourceManifest.schema, generatedAt: sourceManifest.generatedAt ?? null, snapshotDate: sourceManifest.snapshotDate ?? null, source: sourceManifest.source ?? null, regions: sourceManifest.regions ?? sourceManifest.sources?.bods?.regions?.map(region => region.region) ?? null, expectedRegions: sourceManifest.expectedRegions ?? null, sourceSha256 },
    regionAllocation,
    payload: { fileCount: payloadMeasurement.fileCount, bytes: payloadMeasurement.bytes, sha256: payloadMeasurement.sha256, files: publicFiles(payloadMeasurement) }
  };
  await fs.writeFile(path.join(destination, 'publication-manifest.json'), `${JSON.stringify(publication, null, 2)}\n`);
}

function otherSlot(activeSlot) {
  if (!activeSlot) return PUBLICATION_SLOTS[0];
  if (!PUBLICATION_SLOTS.includes(activeSlot)) throw new Error(`Active publication slot must be slot-a or slot-b, received ${activeSlot}.`);
  return PUBLICATION_SLOTS.find(slot => slot !== activeSlot);
}
const exists = target => fs.stat(target).then(() => true).catch(() => false);

async function replaceRepositoryContents(repository, staging) {
  await fs.mkdir(repository, { recursive: true });
  for (const entry of await fs.readdir(repository)) if (entry !== '.git') await fs.rm(path.join(repository, entry), { recursive: true, force: true });
  for (const entry of await fs.readdir(staging)) await fs.cp(path.join(staging, entry), path.join(repository, entry), { recursive: true });
}

async function copyCandidateSubset(candidateRoot, destination, selectedPaths = null) {
  const selected = selectedPaths ? new Set(selectedPaths) : null;
  for (const item of await filesUnder(candidateRoot)) {
    if (selected && !selected.has(item.path) && item.path.toLowerCase().startsWith('services/')) continue;
    const target = path.join(destination, item.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(item.absolute, target);
  }
}

export async function stageBoundedPublication({ candidateSite, repository, dataset, activeSlot, publicationVersion, generatedAt, siteUrl, expectedRegions = TNDS_REGIONS, tndsRoot = null, tndsRootAllocation = null }) {
  const candidateRoot = path.join(candidateSite, 'atlas', 'data', dataset === 'bus' ? 'bus' : 'bus-tnds');
  const fullMeasurement = await measurePublicationTree(candidateRoot);
  const sourceManifest = await readManifest(candidateRoot);
  const allocation = dataset === 'tnds' ? (tndsRootAllocation ?? allocateTndsPublicationRoots(fullMeasurement, { expectedRegions, rootIds: tndsRoot ? [tndsRoot.id] : [], allowAdditionalRoots: !tndsRoot })) : null;
  const selectedPaths = dataset === 'tnds' && tndsRoot ? allocation.roots.find(root => root.id === tndsRoot.id)?.files.map(file => file.path) ?? [] : null;
  if (dataset === 'tnds' && tndsRoot && !selectedPaths.length) throw new Error(`TNDS publication root ${tndsRoot.id} has no assigned regions.`);
  const candidateSlot = otherSlot(activeSlot);
  const staging = path.join(path.dirname(repository), `.atlas-${dataset}-${tndsRoot?.id ?? 'publication'}-staging-${process.pid}`);
  await fs.rm(staging, { recursive: true, force: true });
  try {
    await fs.mkdir(staging, { recursive: true }); await fs.writeFile(path.join(staging, '.nojekyll'), '');
    if (activeSlot && await exists(path.join(repository, activeSlot))) await fs.cp(path.join(repository, activeSlot), path.join(staging, activeSlot), { recursive: true });
    await copyCandidateSubset(candidateRoot, path.join(staging, candidateSlot), selectedPaths);
    const payloadBeforeManifest = await measurePublicationTree(path.join(staging, candidateSlot));
    const rootAllocation = dataset === 'tnds' ? tndsRootAllocation?.roots.find(root => root.id === tndsRoot?.id) ?? allocation : null;
    await writePublicationManifest(path.join(staging, candidateSlot), dataset, publicationVersion, payloadBeforeManifest, generatedAt, rootAllocation, tndsRoot?.id ?? null, fullMeasurement.sha256);
    const candidateMeasurement = assertPublicationFits(await measurePublicationTree(path.join(staging, candidateSlot)), `${dataset.toUpperCase()} candidate slot`);
    const totalMeasurement = assertPublicationFits(await measurePublicationTree(staging), `${dataset.toUpperCase()} total site including rollback slot`);
    const auditDirectory = path.join(staging, 'audit'); await fs.mkdir(auditDirectory, { recursive: true });
    const currentAudit = path.join(repository, 'audit', 'current.json'); if (await exists(currentAudit)) await fs.copyFile(currentAudit, path.join(auditDirectory, 'previous.json'));
    const audit = { schema: 'atlas-reference-data-publication-audit-v2', publicationVersion, generatedAt, dataset, rootId: tndsRoot?.id ?? null, sourceSha256: fullMeasurement.sha256, candidateSha256: candidateMeasurement.sha256, candidateBytes: candidateMeasurement.bytes, candidateFiles: candidateMeasurement.fileCount, activeSlot: activeSlot ?? null, candidateSlot, regions: rootAllocation?.regions ?? [], allocation: tndsRootAllocation ? { roots: tndsRootAllocation.roots.map(root => ({ id: root.id, regions: root.regions, bytes: root.candidateBytes, fileCount: root.fileCount })) } : null };
    await fs.writeFile(path.join(auditDirectory, 'current.json'), `${JSON.stringify(audit, null, 2)}\n`);
    const state = { schema: 'atlas-reference-data-publication-state-v3', dataset, rootId: tndsRoot?.id ?? null, publicationVersion, generatedAt, lifecycle: 'candidate-ready', currentSlot: activeSlot ?? null, activeSlot: activeSlot ?? null, candidateSlot, previousSlot: activeSlot ?? null, applicationConfigVersion: null, safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, pagesLimitBytes: PAGES_DATASET_LIMIT_BYTES, safetyMarginBytes: PUBLICATION_SAFETY_MARGIN_BYTES, candidate: { fileCount: candidateMeasurement.fileCount, bytes: candidateMeasurement.bytes, sha256: candidateMeasurement.sha256 }, totalSite: { fileCount: totalMeasurement.fileCount, bytes: totalMeasurement.bytes, sha256: totalMeasurement.sha256 }, regions: rootAllocation?.regions ?? [], audit: { current: 'audit/current.json', previous: 'audit/previous.json' } };
    await fs.writeFile(path.join(staging, 'publication-state.json'), `${JSON.stringify(state, null, 2)}\n`);
    const finalMeasurement = assertPublicationFits(await measurePublicationTree(staging), `${dataset.toUpperCase()} total site including lifecycle metadata`);
    await replaceRepositoryContents(repository, staging);
    return { dataset, source: fullMeasurement, candidate: candidateMeasurement, totalSite: finalMeasurement, activeSlot: activeSlot ?? null, candidateSlot, previousSlot: activeSlot ?? null, root: tndsRoot?.id ?? null, regions: rootAllocation?.regions ?? [] };
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}

function normaliseTndsRoots({ tndsRepository, tndsSiteUrl, activeTndsSlot, tndsPublicationRoots = [] }) {
  if (tndsPublicationRoots.length) return tndsPublicationRoots.map((root, index) => ({ id: String(root.id ?? `root-${index + 1}`), repository: root.repository, siteUrl: root.siteUrl, activeSlot: root.activeSlot ?? activeTndsSlot ?? null }));
  return [{ id: 'root-1', repository: tndsRepository, siteUrl: tndsSiteUrl, activeSlot: activeTndsSlot ?? null }];
}

export async function preparePublications({ candidateSite, busRepository, tndsRepository, publicationVersion, generatedAt, busSiteUrl, tndsSiteUrl, activeBusSlot = null, activeTndsSlot = null, configOutput, tndsPathRoots = [], tndsPublicationRoots = [] }) {
  const roots = normaliseTndsRoots({ tndsRepository, tndsSiteUrl, activeTndsSlot, tndsPublicationRoots });
  const tndsRootPath = path.join(candidateSite, 'atlas', 'data', 'bus-tnds'); const tndsFullMeasurement = await measurePublicationTree(tndsRootPath); const tndsManifest = await readManifest(tndsRootPath);
  const allocation = allocateTndsPublicationRoots(tndsFullMeasurement, { expectedRegions: TNDS_REGIONS, rootIds: roots.map(root => root.id), allowAdditionalRoots: false });
  const bus = await stageBoundedPublication({ candidateSite, repository: busRepository, dataset: 'bus', activeSlot: activeBusSlot, publicationVersion, generatedAt, siteUrl: busSiteUrl });
  const tnds = [];
  for (const root of roots) {
    if (!allocation.roots.some(item => item.id === root.id)) continue;
    tnds.push(await stageBoundedPublication({ candidateSite, repository: root.repository, dataset: 'tnds', activeSlot: root.activeSlot, publicationVersion, generatedAt, siteUrl: root.siteUrl, tndsRoot: root, tndsRootAllocation: allocation }));
  }
  if (tnds.length !== allocation.roots.length) throw new Error('Every allocated TNDS publication root must be staged exactly once.');
  const tndsPathMap = {};
  for (const root of allocation.roots) {
    const staged = tnds.find(item => item.root === root.id); const source = roots.find(item => item.id === root.id);
    for (const file of root.files.filter(file => file.path.toLowerCase().startsWith('services/'))) tndsPathMap[file.path] = slotUrl(source.siteUrl, staged.candidateSlot);
  }
  const configRoots = allocation.roots.map(root => { const source = roots.find(item => item.id === root.id); const staged = tnds.find(item => item.root === root.id); return { id: root.id, baseUrl: slotUrl(source.siteUrl, staged.candidateSlot), slot: staged.candidateSlot, regions: root.regions, fileCount: root.fileCount, bytes: root.candidateBytes, sha256: staged.candidate.sha256 }; });
  const config = buildAtlasDataSources({ publicationVersion, generatedAt, busSiteUrl, tndsSiteUrl, busSlot: bus.candidateSlot, tndsSlot: tnds[0].candidateSlot, tndsBaseUrl: slotUrl(roots[0].siteUrl, tnds[0].candidateSlot), tndsPathRoots, tndsPathMap, tndsPublicationRoots: configRoots });
  await fs.mkdir(path.dirname(configOutput), { recursive: true }); await fs.writeFile(configOutput, renderAtlasDataSourcesModule(config)); await fs.writeFile(configOutput.replace(/\.mjs$/i, '.json'), `${JSON.stringify(config, null, 2)}\n`);
  return { config, bus, tnds, tndsAllocation: allocation, safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, pagesLimitBytes: PAGES_DATASET_LIMIT_BYTES, safetyMarginBytes: PUBLICATION_SAFETY_MARGIN_BYTES };
}

export async function measureCandidateDatasets(candidateSite, { measureTree = measurePublicationTree } = {}) {
  const candidateData = path.join(candidateSite, 'atlas', 'data'); const bus = await measureTree(path.join(candidateData, 'bus')); const tndsRoot = path.join(candidateData, 'bus-tnds'); const tnds = await measureTree(tndsRoot); const busManifest = await readManifest(path.join(candidateData, 'bus')); const manifest = await readManifest(tndsRoot); const expectedRegions = TNDS_REGIONS; const regions = allocateTndsRegions(tnds, expectedRegions, { allowMissing: true }); const rootPlan = regions.expectedRegions.every(region => regions.regions[region].fileCount > 0) ? allocateTndsPublicationRoots(tnds, { expectedRegions }) : { roots: [], shardToRoot: {} };
  const tndsComplete = regions.expectedRegions.length === TNDS_REGIONS.length && regions.expectedRegions.every(region => regions.regions[region].fileCount > 0);
  const proposedGroups = { bus: [{ group: 'national-bus', ...capacitySummary(bus.bytes), files: bus.fileCount }], tnds: [{ group: 'national-tnds', ...capacitySummary(tnds.bytes), files: tnds.fileCount }, ...expectedRegions.map(region => ({ group: `tnds-${region}`, ...capacitySummary(regions.regions[region].bytes), files: regions.regions[region].fileCount, region }))] };
  return {
    diagnosticSchema: 'atlas-publication-capacity-diagnostic-v2', safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, pagesLimitBytes: PAGES_DATASET_LIMIT_BYTES, safetyMarginBytes: PUBLICATION_SAFETY_MARGIN_BYTES,
    bus: { source: 'prepared-candidate', coverage: 'national-bus-candidate', fixtureOrIncomplete: false, generatedAt: busManifest.generatedAt ?? null, candidateBytes: bus.bytes, candidateFiles: bus.fileCount, ...capacitySummary(bus.bytes), projectedCurrentFootprintBytes: bus.bytes, projectedCandidateRollbackOverheadBytes: bus.bytes + PUBLICATION_METADATA_BUDGET_BYTES, projectedTotalPublicationFootprintBytes: 2 * bus.bytes + PUBLICATION_METADATA_BUDGET_BYTES, projectedBlueGreenBytes: bus.bytes * 2, projectedBlueGreenFitsSafeLimit: 2 * bus.bytes + PUBLICATION_METADATA_BUDGET_BYTES <= SAFE_PUBLICATION_LIMIT_BYTES, sha256: bus.sha256, largest: bus.largest, largestShards: bus.largest },
    tnds: { source: manifest.source ?? 'unknown', coverage: tndsComplete ? 'complete-national-region-set' : 'fixture-or-incomplete-region-set', fixtureOrIncomplete: !tndsComplete, generatedAt: manifest.generatedAt ?? null, freshAcquisitionEvidence: 'This measures the supplied candidate; freshness is established by the acquisition run and is not inferred from bytes.', candidateBytes: tnds.bytes, candidateFiles: tnds.fileCount, ...capacitySummary(tnds.bytes), projectedBlueGreenBytes: tnds.bytes * 2, projectedBlueGreenFitsSafeLimit: 2 * tnds.bytes + PUBLICATION_METADATA_BUDGET_BYTES <= SAFE_PUBLICATION_LIMIT_BYTES, sha256: tnds.sha256, largest: tnds.largest, largestShards: tnds.largest, regions },
    proposedPublication: { roots: rootPlan.roots, projectedTotalAcrossRootsBytes: rootPlan.roots.reduce((sum, root) => sum + root.projectedTotalPublicationFootprintBytes, 0), allRootsFitSafeLimit: rootPlan.roots.length > 0 && rootPlan.roots.every(root => root.fit), safetyMarginRemainingBytes: rootPlan.roots.reduce((sum, root) => sum + root.safetyMarginRemainingBytes, 0), shardToRoot: rootPlan.shardToRoot }, proposedPublicationGroups: proposedGroups
  };
}

export async function promoteBoundedPublication({ repository, candidateSlot, publicationVersion }) {
  const statePath = path.join(repository, 'publication-state.json'); const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  if (state.lifecycle !== 'candidate-ready' || state.candidateSlot !== candidateSlot || state.publicationVersion !== publicationVersion) throw new Error('Only the validated candidate can be promoted.');
  const promoted = { ...state, lifecycle: 'current', currentSlot: candidateSlot, activeSlot: candidateSlot, previousSlot: state.currentSlot ?? state.activeSlot ?? null, candidateSlot: null, applicationConfigVersion: publicationVersion };
  await fs.writeFile(statePath, `${JSON.stringify(promoted, null, 2)}\n`); return promoted;
}

export async function rollbackBoundedPublication({ repository }) {
  const statePath = path.join(repository, 'publication-state.json'); const state = JSON.parse(await fs.readFile(statePath, 'utf8')); const previousSlot = state.previousSlot;
  if (!previousSlot || !PUBLICATION_SLOTS.includes(previousSlot) || !(await exists(path.join(repository, previousSlot)))) throw new Error('No recoverable previous publication slot is available.');
  const rolledBack = { ...state, lifecycle: 'rolled-back', currentSlot: previousSlot, activeSlot: previousSlot, candidateSlot: state.currentSlot ?? state.activeSlot ?? null, previousSlot: null, applicationConfigVersion: null };
  await fs.writeFile(statePath, `${JSON.stringify(rolledBack, null, 2)}\n`); return rolledBack;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => { if (value.startsWith('--')) pairs.push([value.slice(2), values[index + 1]]); return pairs; }, []));
  const required = ['candidate-site', 'bus-repository', 'version', 'generated-at', 'bus-site-url', 'tnds-site-url', 'config-output']; for (const key of required) if (!args[key]) throw new Error(`Missing --${key}`);
  const tndsRoots = args['tnds-roots-json'] ? JSON.parse(args['tnds-roots-json']) : [];
  const result = await preparePublications({ candidateSite: path.resolve(args['candidate-site']), busRepository: path.resolve(args['bus-repository']), tndsRepository: path.resolve(args['tnds-repository'] || tndsRoots[0]?.repository || ''), tndsPublicationRoots: tndsRoots.map(root => ({ ...root, repository: path.resolve(root.repository) })), publicationVersion: args.version, generatedAt: args['generated-at'], busSiteUrl: args['bus-site-url'], tndsSiteUrl: args['tnds-site-url'], activeBusSlot: args['active-bus-slot'] || null, activeTndsSlot: args['active-tnds-slot'] || null, configOutput: path.resolve(args['config-output']) });
  console.log(JSON.stringify({ safetyLimitBytes: result.safetyLimitBytes, pagesLimitBytes: result.pagesLimitBytes, safetyMarginBytes: result.safetyMarginBytes, bus: { candidateBytes: result.bus.candidate.bytes, candidateFiles: result.bus.candidate.fileCount, totalSiteBytes: result.bus.totalSite.bytes, totalSiteFiles: result.bus.totalSite.fileCount, activeSlot: result.bus.activeSlot, candidateSlot: result.bus.candidateSlot, largest: result.bus.candidate.largest }, tnds: { roots: result.tnds.map(root => ({ root: root.root, candidateBytes: root.candidate.bytes, candidateFiles: root.candidate.fileCount, totalSiteBytes: root.totalSite.bytes, totalSiteFiles: root.totalSite.fileCount, activeSlot: root.activeSlot, candidateSlot: root.candidateSlot, regions: root.regions })), allocation: result.tndsAllocation }, config: result.config }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`Reference-data publication preparation failed: ${error.message}`); process.exitCode = 1; });
