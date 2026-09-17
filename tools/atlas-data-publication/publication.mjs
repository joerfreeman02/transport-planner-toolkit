import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGES_DATASET_LIMIT_BYTES = 1_000_000_000;
export const PUBLICATION_SAFETY_MARGIN_BYTES = 100_000_000;
export const SAFE_PUBLICATION_LIMIT_BYTES = PAGES_DATASET_LIMIT_BYTES - PUBLICATION_SAFETY_MARGIN_BYTES;
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
  return {
    root,
    files: ordered,
    fileCount: ordered.length,
    bytes: ordered.reduce((sum, item) => sum + item.bytes, 0),
    sha256: aggregate.digest('hex'),
    largest: [...ordered].sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path)).slice(0, 10)
  };
}

export function assertPublicationFits(measurement, label, limit = SAFE_PUBLICATION_LIMIT_BYTES) {
  if (measurement.bytes > limit) {
    throw new Error(`${label} publication is ${measurement.bytes} bytes across ${measurement.fileCount} files; the safe bounded-publication limit is ${limit} bytes (GitHub Pages limit ${PAGES_DATASET_LIMIT_BYTES} bytes, leaving ${PUBLICATION_SAFETY_MARGIN_BYTES} bytes safety margin). Partitioning is required before publication.`);
  }
  return measurement;
}

function capacitySummary(bytes) {
  return {
    bytes,
    safeLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES,
    fitsSafeLimit: bytes <= SAFE_PUBLICATION_LIMIT_BYTES,
    overSafeLimitBytes: Math.max(0, bytes - SAFE_PUBLICATION_LIMIT_BYTES)
  };
}

function normaliseBaseUrl(value) {
  const url = new URL(String(value));
  if (!url.href.endsWith('/')) return `${url.href}/`;
  return url.href;
}

function slotUrl(siteUrl, slot) {
  return `${normaliseBaseUrl(siteUrl)}${slot}/`;
}

export function buildAtlasDataSources({ publicationVersion, generatedAt, busSiteUrl, tndsSiteUrl, busBaseUrl, tndsBaseUrl, busSlot, tndsSlot, tndsPathRoots = [] }) {
  const resolvedBusUrl = busBaseUrl ?? slotUrl(busSiteUrl, busSlot);
  const resolvedTndsUrl = tndsBaseUrl ?? slotUrl(tndsSiteUrl, tndsSlot);
  return {
    schema: 'atlas-data-sources-v1',
    publicationVersion,
    generatedAt,
    datasets: {
      bus: { baseUrl: normaliseBaseUrl(resolvedBusUrl), slot: busSlot ?? null, manifest: 'manifest.json', publicationManifest: 'publication-manifest.json', pathRoots: [] },
      tnds: { baseUrl: normaliseBaseUrl(resolvedTndsUrl), slot: tndsSlot ?? null, manifest: 'manifest.json', publicationManifest: 'publication-manifest.json', pathRoots: tndsPathRoots },
      nptg: null
    }
  };
}

export function renderAtlasDataSourcesModule(config) {
  return `// Generated after both reference-data publications pass validation.\nexport const atlasDataSources = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
}

export function regionFromTndsPath(relativePath) {
  const matches = [...String(relativePath).toUpperCase().matchAll(/(?:^|[\\/_.-])(EA|EM|NE|NW|SE|SW|WM|Y)(?=[\\/_.-]|$)/g)].map(match => match[1]);
  const regions = [...new Set(matches)];
  if (regions.length !== 1) throw new Error(`TNDS service shard ${relativePath} does not map to exactly one authoritative region (${TNDS_REGIONS.join(', ')}).`);
  return regions[0];
}

export function allocateTndsRegions(measurement, expectedRegions = []) {
  const regions = Object.fromEntries(TNDS_REGIONS.map(region => [region, { region, files: [], fileCount: 0, bytes: 0, largest: [] }]));
  for (const item of measurement.files.filter(file => file.path.toLowerCase().startsWith('services/'))) {
    const region = regionFromTndsPath(item.path);
    const allocation = regions[region];
    allocation.files.push(item);
    allocation.fileCount += 1;
    allocation.bytes += item.bytes;
  }
  for (const allocation of Object.values(regions)) {
    allocation.largest = [...allocation.files].sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path)).slice(0, 3);
  }
  const expected = [...new Set(expectedRegions.map(region => String(region).toUpperCase()))];
  const missing = expected.filter(region => !regions[region] || regions[region].fileCount === 0);
  if (missing.length) throw new Error(`TNDS publication is missing expected national region shard groups: ${missing.join(', ')}.`);
  return { expectedRegions: expected, regions };
}

async function readManifest(root) {
  return JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
}

async function writePublicationManifest(destination, dataset, publicationVersion, sourceMeasurement, generatedAt, regionAllocation = null) {
  const sourceManifest = await readManifest(destination);
  const publication = {
    schema: 'atlas-reference-data-publication-v2',
    dataset,
    publicationVersion,
    generatedAt,
    datasetManifest: 'manifest.json',
    sourceManifest: {
      schema: sourceManifest.schema,
      generatedAt: sourceManifest.generatedAt ?? null,
      snapshotDate: sourceManifest.snapshotDate ?? null,
      source: sourceManifest.source ?? null,
      regions: sourceManifest.regions ?? sourceManifest.sources?.bods?.regions?.map(region => region.region) ?? null,
      expectedRegions: sourceManifest.expectedRegions ?? null,
      sourceSha256: sourceMeasurement.sha256
    },
    regionAllocation,
    payload: { fileCount: sourceMeasurement.fileCount, bytes: sourceMeasurement.bytes, sha256: sourceMeasurement.sha256, files: sourceMeasurement.files }
  };
  await fs.writeFile(path.join(destination, 'publication-manifest.json'), `${JSON.stringify(publication, null, 2)}\n`);
}

function otherSlot(activeSlot) {
  if (!activeSlot) return PUBLICATION_SLOTS[0];
  if (!PUBLICATION_SLOTS.includes(activeSlot)) throw new Error(`Active publication slot must be slot-a or slot-b, received ${activeSlot}.`);
  return PUBLICATION_SLOTS.find(slot => slot !== activeSlot);
}

async function replaceRepositoryContents(repository, staging) {
  await fs.mkdir(repository, { recursive: true });
  for (const entry of await fs.readdir(repository)) if (entry !== '.git') await fs.rm(path.join(repository, entry), { recursive: true, force: true });
  for (const entry of await fs.readdir(staging)) await fs.cp(path.join(staging, entry), path.join(repository, entry), { recursive: true });
}

export async function stageBoundedPublication({ candidateSite, repository, dataset, activeSlot, publicationVersion, generatedAt, siteUrl, expectedRegions = TNDS_REGIONS }) {
  const candidateRoot = path.join(candidateSite, 'atlas', 'data', dataset === 'bus' ? 'bus' : 'bus-tnds');
  const sourceMeasurement = assertPublicationFits(await measurePublicationTree(candidateRoot), `${dataset.toUpperCase()} candidate`);
  const sourceManifest = await readManifest(candidateRoot);
  const requestedRegions = dataset === 'tnds' ? (sourceManifest.expectedRegions ?? sourceManifest.regions ?? expectedRegions) : [];
  const regionAllocation = dataset === 'tnds' ? allocateTndsRegions(sourceMeasurement, requestedRegions) : null;
  const candidateSlot = otherSlot(activeSlot);
  const staging = path.join(path.dirname(repository), `.atlas-${dataset}-publication-staging-${process.pid}`);
  await fs.rm(staging, { recursive: true, force: true });
  try {
    await fs.mkdir(staging, { recursive: true });
    await fs.writeFile(path.join(staging, '.nojekyll'), '');
    if (activeSlot && await fs.stat(path.join(repository, activeSlot)).then(() => true).catch(() => false)) {
      await fs.cp(path.join(repository, activeSlot), path.join(staging, activeSlot), { recursive: true });
    }
    await fs.cp(candidateRoot, path.join(staging, candidateSlot), { recursive: true });
    await writePublicationManifest(path.join(staging, candidateSlot), dataset, publicationVersion, sourceMeasurement, generatedAt, regionAllocation);
    const candidateMeasurement = assertPublicationFits(await measurePublicationTree(path.join(staging, candidateSlot)), `${dataset.toUpperCase()} candidate slot`);
    const totalMeasurement = assertPublicationFits(await measurePublicationTree(staging), `${dataset.toUpperCase()} total site including rollback slot`);
    const auditDirectory = path.join(staging, 'audit');
    await fs.mkdir(auditDirectory, { recursive: true });
    const currentAudit = path.join(repository, 'audit', 'current.json');
    if (await fs.stat(currentAudit).then(() => true).catch(() => false)) await fs.copyFile(currentAudit, path.join(auditDirectory, 'previous.json'));
    const audit = {
      schema: 'atlas-reference-data-publication-audit-v1',
      publicationVersion,
      applicationConfigVersion: publicationVersion,
      generatedAt,
      dataset,
      sourceSha256: sourceMeasurement.sha256,
      candidateSha256: candidateMeasurement.sha256,
      candidateBytes: candidateMeasurement.bytes,
      candidateFiles: candidateMeasurement.fileCount,
      activeSlot: activeSlot ?? null,
      candidateSlot,
      regionAllocation
    };
    await fs.writeFile(path.join(auditDirectory, 'current.json'), `${JSON.stringify(audit, null, 2)}\n`);
    const state = {
      schema: 'atlas-reference-data-publication-state-v2',
      dataset,
      publicationVersion,
      generatedAt,
      lifecycle: 'candidate-ready',
      activeSlot: activeSlot ?? null,
      candidateSlot,
      previousSlot: activeSlot ?? null,
      applicationConfigVersion: publicationVersion,
      safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES,
      pagesLimitBytes: PAGES_DATASET_LIMIT_BYTES,
      safetyMarginBytes: PUBLICATION_SAFETY_MARGIN_BYTES,
      candidate: { fileCount: candidateMeasurement.fileCount, bytes: candidateMeasurement.bytes, sha256: candidateMeasurement.sha256 },
      totalSite: { fileCount: totalMeasurement.fileCount, bytes: totalMeasurement.bytes, sha256: totalMeasurement.sha256 },
      regionAllocation,
      audit: { current: 'audit/current.json', previous: 'audit/previous.json' }
    };
    await fs.writeFile(path.join(staging, 'publication-state.json'), `${JSON.stringify(state, null, 2)}\n`);
    const finalMeasurement = assertPublicationFits(await measurePublicationTree(staging), `${dataset.toUpperCase()} total site including lifecycle metadata`);
    await replaceRepositoryContents(repository, staging);
    return { dataset, source: sourceMeasurement, candidate: candidateMeasurement, totalSite: finalMeasurement, activeSlot: activeSlot ?? null, candidateSlot, previousSlot: activeSlot ?? null, regions: regionAllocation };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

export async function preparePublications({ candidateSite, busRepository, tndsRepository, publicationVersion, generatedAt, busSiteUrl, tndsSiteUrl, activeBusSlot = null, activeTndsSlot = null, configOutput, tndsPathRoots = [] }) {
  const bus = await stageBoundedPublication({ candidateSite, repository: busRepository, dataset: 'bus', activeSlot: activeBusSlot, publicationVersion, generatedAt, siteUrl: busSiteUrl });
  const tnds = await stageBoundedPublication({ candidateSite, repository: tndsRepository, dataset: 'tnds', activeSlot: activeTndsSlot, publicationVersion, generatedAt, siteUrl: tndsSiteUrl });
  const config = buildAtlasDataSources({ publicationVersion, generatedAt, busSiteUrl, tndsSiteUrl, busSlot: bus.candidateSlot, tndsSlot: tnds.candidateSlot, tndsPathRoots });
  await fs.mkdir(path.dirname(configOutput), { recursive: true });
  await fs.writeFile(configOutput, renderAtlasDataSourcesModule(config));
  await fs.writeFile(configOutput.replace(/\.mjs$/i, '.json'), `${JSON.stringify(config, null, 2)}\n`);
  return { config, bus, tnds, safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES, pagesLimitBytes: PAGES_DATASET_LIMIT_BYTES, safetyMarginBytes: PUBLICATION_SAFETY_MARGIN_BYTES };
}

export async function measureCandidateDatasets(candidateSite, { measureTree = measurePublicationTree } = {}) {
  const candidateData = path.join(candidateSite, 'atlas', 'data');
  const bus = await measureTree(path.join(candidateData, 'bus'));
  const tndsRoot = path.join(candidateData, 'bus-tnds');
  const tnds = await measureTree(tndsRoot);
  const manifest = await readManifest(tndsRoot);
  const expectedRegions = manifest.expectedRegions ?? manifest.regions ?? TNDS_REGIONS;
  const regions = allocateTndsRegions(tnds, expectedRegions);
  const proposedBus = [{ group: 'national-bus', ...capacitySummary(bus.bytes), files: bus.fileCount }];
  const proposedTnds = [
    { group: 'national-tnds', ...capacitySummary(tnds.bytes), files: tnds.fileCount },
    ...expectedRegions.map(region => ({ group: `tnds-${region}`, ...capacitySummary(regions.regions[region].bytes), files: regions.regions[region].fileCount, region }))
  ];
  return {
    safetyLimitBytes: SAFE_PUBLICATION_LIMIT_BYTES,
    pagesLimitBytes: PAGES_DATASET_LIMIT_BYTES,
    safetyMarginBytes: PUBLICATION_SAFETY_MARGIN_BYTES,
    bus: { candidateBytes: bus.bytes, candidateFiles: bus.fileCount, ...capacitySummary(bus.bytes), projectedBlueGreenBytes: bus.bytes * 2, projectedBlueGreenFitsSafeLimit: bus.bytes * 2 <= SAFE_PUBLICATION_LIMIT_BYTES, sha256: bus.sha256, largest: bus.largest },
    tnds: { candidateBytes: tnds.bytes, candidateFiles: tnds.fileCount, ...capacitySummary(tnds.bytes), projectedBlueGreenBytes: tnds.bytes * 2, projectedBlueGreenFitsSafeLimit: tnds.bytes * 2 <= SAFE_PUBLICATION_LIMIT_BYTES, sha256: tnds.sha256, largest: tnds.largest, regions },
    proposedPublicationGroups: { bus: proposedBus, tnds: proposedTnds }
  };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (!value.startsWith('--')) return pairs;
    pairs.push([value.slice(2), values[index + 1]]);
    return pairs;
  }, []));
  const required = ['candidate-site', 'bus-repository', 'tnds-repository', 'version', 'generated-at', 'bus-site-url', 'tnds-site-url', 'config-output'];
  for (const key of required) if (!args[key]) throw new Error(`Missing --${key}`);
  const result = await preparePublications({
    candidateSite: path.resolve(args['candidate-site']),
    busRepository: path.resolve(args['bus-repository']),
    tndsRepository: path.resolve(args['tnds-repository']),
    publicationVersion: args.version,
    generatedAt: args['generated-at'],
    busSiteUrl: args['bus-site-url'],
    tndsSiteUrl: args['tnds-site-url'],
    activeBusSlot: args['active-bus-slot'] || null,
    activeTndsSlot: args['active-tnds-slot'] || null,
    configOutput: path.resolve(args['config-output'])
  });
  console.log(JSON.stringify({
    safetyLimitBytes: result.safetyLimitBytes,
    pagesLimitBytes: result.pagesLimitBytes,
    safetyMarginBytes: result.safetyMarginBytes,
    bus: { candidateBytes: result.bus.candidate.bytes, candidateFiles: result.bus.candidate.fileCount, totalSiteBytes: result.bus.totalSite.bytes, totalSiteFiles: result.bus.totalSite.fileCount, activeSlot: result.bus.activeSlot, candidateSlot: result.bus.candidateSlot, largest: result.bus.candidate.largest },
    tnds: { candidateBytes: result.tnds.candidate.bytes, candidateFiles: result.tnds.candidate.fileCount, totalSiteBytes: result.tnds.totalSite.bytes, totalSiteFiles: result.tnds.totalSite.fileCount, activeSlot: result.tnds.activeSlot, candidateSlot: result.tnds.candidateSlot, regions: result.tnds.regions },
    config: result.config
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Reference-data publication preparation failed: ${error.message}`); process.exitCode = 1; });
}
