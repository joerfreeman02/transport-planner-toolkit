import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGES_DATASET_LIMIT_BYTES = 1_000_000_000;

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

export function assertPublicationFits(measurement, label) {
  if (measurement.bytes > PAGES_DATASET_LIMIT_BYTES) {
    throw new Error(`${label} publication is ${measurement.bytes} bytes across ${measurement.fileCount} files; GitHub Pages permits at most ${PAGES_DATASET_LIMIT_BYTES} bytes per published site. Deterministic partitioning is required before publication.`);
  }
  return measurement;
}

function normaliseBaseUrl(value) {
  const url = new URL(String(value));
  if (!url.href.endsWith('/')) return `${url.href}/`;
  return url.href;
}

export function buildAtlasDataSources({ publicationVersion, generatedAt, busBaseUrl, tndsBaseUrl }) {
  return {
    schema: 'atlas-data-sources-v1',
    publicationVersion,
    generatedAt,
    datasets: {
      bus: { baseUrl: normaliseBaseUrl(busBaseUrl), manifest: 'manifest.json', publicationManifest: 'publication-manifest.json', pathRoots: [] },
      tnds: { baseUrl: normaliseBaseUrl(tndsBaseUrl), manifest: 'manifest.json', publicationManifest: 'publication-manifest.json', pathRoots: [] },
      nptg: null
    }
  };
}

export function renderAtlasDataSourcesModule(config) {
  return `// Generated after both reference-data publications pass validation.\nexport const atlasDataSources = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
}

async function writePublicationManifest(destination, dataset, publicationVersion, sourceMeasurement, generatedAt) {
  const sourceManifest = JSON.parse(await fs.readFile(path.join(destination, 'manifest.json'), 'utf8'));
  const publication = {
    schema: 'atlas-reference-data-publication-v1',
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
      sourceSha256: sourceMeasurement.sha256
    },
    payload: { fileCount: sourceMeasurement.fileCount, bytes: sourceMeasurement.bytes, sha256: sourceMeasurement.sha256, files: sourceMeasurement.files }
  };
  await fs.writeFile(path.join(destination, 'publication-manifest.json'), `${JSON.stringify(publication, null, 2)}\n`);
}

export async function preparePublications({ candidateSite, busDestination, tndsDestination, publicationVersion, generatedAt, busBaseUrl, tndsBaseUrl, configOutput }) {
  const candidateData = path.join(candidateSite, 'atlas', 'data');
  const sourceBus = path.join(candidateData, 'bus');
  const sourceTnds = path.join(candidateData, 'bus-tnds');
  const sourceBusMeasurement = assertPublicationFits(await measurePublicationTree(sourceBus), 'Bus');
  const sourceTndsMeasurement = assertPublicationFits(await measurePublicationTree(sourceTnds), 'TNDS');
  await fs.rm(busDestination, { recursive: true, force: true });
  await fs.rm(tndsDestination, { recursive: true, force: true });
  await fs.cp(sourceBus, busDestination, { recursive: true });
  await fs.cp(sourceTnds, tndsDestination, { recursive: true });
  await writePublicationManifest(busDestination, 'bus', publicationVersion, sourceBusMeasurement, generatedAt);
  await writePublicationManifest(tndsDestination, 'tnds', publicationVersion, sourceTndsMeasurement, generatedAt);
  const busMeasurement = assertPublicationFits(await measurePublicationTree(busDestination), 'Bus');
  const tndsMeasurement = assertPublicationFits(await measurePublicationTree(tndsDestination), 'TNDS');
  const config = buildAtlasDataSources({ publicationVersion, generatedAt, busBaseUrl, tndsBaseUrl });
  await fs.mkdir(path.dirname(configOutput), { recursive: true });
  await fs.writeFile(configOutput, renderAtlasDataSourcesModule(config));
  await fs.writeFile(configOutput.replace(/\.mjs$/i, '.json'), `${JSON.stringify(config, null, 2)}\n`);
  return { config, bus: busMeasurement, tnds: tndsMeasurement };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (!value.startsWith('--')) return pairs;
    pairs.push([value.slice(2), values[index + 1]]);
    return pairs;
  }, []));
  const required = ['candidate-site', 'bus-destination', 'tnds-destination', 'version', 'generated-at', 'bus-base-url', 'tnds-base-url', 'config-output'];
  for (const key of required) if (!args[key]) throw new Error(`Missing --${key}`);
  const result = await preparePublications({
    candidateSite: path.resolve(args['candidate-site']),
    busDestination: path.resolve(args['bus-destination']),
    tndsDestination: path.resolve(args['tnds-destination']),
    publicationVersion: args.version,
    generatedAt: args['generated-at'],
    busBaseUrl: args['bus-base-url'],
    tndsBaseUrl: args['tnds-base-url'],
    configOutput: path.resolve(args['config-output'])
  });
  console.log(JSON.stringify({ bus: { files: result.bus.fileCount, bytes: result.bus.bytes, sha256: result.bus.sha256 }, tnds: { files: result.tnds.fileCount, bytes: result.tnds.bytes, sha256: result.tnds.sha256 }, config: result.config }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Reference-data publication preparation failed: ${error.message}`); process.exitCode = 1; });
}
