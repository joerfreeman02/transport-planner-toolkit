import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const validCommit = value => /^[0-9a-f]{40}$/i.test(String(value ?? ''));
const normaliseJson = value => `${JSON.stringify(value, null, 2)}\n`;

export async function artifactTreeSha256(root) {
  const files = [];
  async function walk(directory, relative = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
      else if (name !== 'atlas/config/atlas-release-identity.json') files.push(`${name}\0${sha256(await fs.readFile(path.join(root, name)))}\n`);
    }
  }
  await walk(root);
  files.sort();
  return sha256(files.join(''));
}

export function createReleaseIdentity({ applicationSha, version, build, dataSources, dataStatus, busManifest, tndsManifests, nptgManifest = null, ibusManifest, ibusIndex }) {
  if (!validCommit(applicationSha)) throw new Error('Application commit SHA must be a full 40-character Git SHA.');
  const supportedBuild = (version === '2.0.0-beta.2' && /^ATLAS-2\.0\.0-beta\.2-[0-9]{8}$/.test(String(build)))
    || (version === '2.0.0-beta.1' && build === 'ATLAS-2.0.0-beta.1-20261025');
  if (!supportedBuild) throw new Error('Version/build is outside the known Beta.1 rollback and proposed Beta.2 identities.');
  if (dataSources?.schema !== 'atlas-data-sources-v2') throw new Error('A published atlas-data-sources-v2 configuration is required.');
  if (!dataSources.publicationVersion || !dataStatus || !dataSources.datasets?.bus?.baseUrl || !(dataSources.datasets?.tnds?.activeRoots?.length || dataSources.datasets?.tnds?.roots?.length)) throw new Error('Published Bus, TNDS and data-status identities are incomplete.');
  if (!busManifest || !tndsManifests?.length || !ibusManifest || !ibusIndex) throw new Error('Bus, TNDS, iBus manifest and iBus index evidence are all required.');
  if (dataSources.datasets?.nptg && !nptgManifest) throw new Error('Configured NPTG dataset is missing its manifest evidence.');
  return {
    schema: 'atlas-release-identity-v1',
    application: { version, build, commitSha: applicationSha.toLowerCase() },
    data: {
      publicationVersion: dataSources.publicationVersion,
      currentness: dataStatus?.generatedAt ?? dataStatus?.snapshotDate ?? dataStatus?.candidateGeneratedAt ?? null,
      dataStatusSha256: sha256(normaliseJson(dataStatus)),
      dataSourcesSha256: sha256(normaliseJson(dataSources)),
      busManifestSha256: sha256(normaliseJson(busManifest)),
      tndsManifestSha256: tndsManifests.map(manifest => sha256(normaliseJson(manifest))).sort(),
      nptgManifestSha256: nptgManifest ? sha256(normaliseJson(nptgManifest)) : null,
      ibusManifestSha256: sha256(normaliseJson(ibusManifest)),
      ibusIndexSha256: sha256(normaliseJson(ibusIndex))
    }
  };
}

export function assertApplicationPinned(previous, next) {
  if (previous?.schema !== 'atlas-release-identity-v1' || next?.schema !== 'atlas-release-identity-v1') throw new Error('Release identity schema mismatch.');
  for (const key of ['version', 'build', 'commitSha']) {
    if (previous.application?.[key] !== next.application?.[key]) throw new Error(`Data-refresh would replace approved application ${key}.`);
  }
  if (!Object.hasOwn(next.data ?? {}, 'nptgManifestSha256')) throw new Error('Data-refresh publication identity omits its NPTG manifest field.');
  if (!next.data?.publicationVersion || !next.data?.dataStatusSha256 || !next.data?.dataSourcesSha256 || !next.data?.busManifestSha256 || !next.data?.tndsManifestSha256?.length || !next.data?.ibusManifestSha256 || !next.data?.ibusIndexSha256) throw new Error('Data-refresh publication identity is incomplete.');
  return true;
}

export function assertAppOnlyPreservesData(previous, next) {
  if (previous?.schema !== 'atlas-release-identity-v1' || next?.schema !== 'atlas-release-identity-v1') throw new Error('Release identity schema mismatch.');
  for (const key of ['publicationVersion', 'currentness', 'dataStatusSha256', 'dataSourcesSha256', 'busManifestSha256', 'nptgManifestSha256', 'ibusManifestSha256', 'ibusIndexSha256']) {
    if (previous.data?.[key] !== next.data?.[key]) throw new Error(`Application-only release would change approved data ${key}.`);
  }
  if (JSON.stringify(previous.data?.tndsManifestSha256) !== JSON.stringify(next.data?.tndsManifestSha256)) throw new Error('Application-only release would change approved TNDS manifest identities.');
  return true;
}

const protectedRelative = relative => {
  const normal = relative.replaceAll('\\', '/');
  return normal === 'atlas/config/atlas-data-sources.json' || normal === 'atlas/config/atlas-data-sources.mjs' || normal.startsWith('atlas/data/');
};

async function copyOverlay(source, target, prefix = '') {
  for (const entry of await fs.readdir(path.join(source, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix.replaceAll('\\', '/'), entry.name);
    if (protectedRelative(relative) || relative.split('/').some(part => ['.git', 'node_modules', 'tmp', 'tests', 'docs', '.codex'].includes(part))) continue;
    const from = path.join(source, relative), to = path.join(target, relative);
    if (entry.isDirectory()) {
      await fs.mkdir(to, { recursive: true });
      await copyOverlay(source, target, relative);
    } else {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
  }
}

export async function assembleAppOnlyArtifact({ appRoot, snapshotRoot, outputRoot, expectedApplicationSha, version, build, dataSources, dataStatus, busManifest, tndsManifests, nptgManifest = null, ibusManifest, ibusIndex }) {
  if (!validCommit(expectedApplicationSha)) throw new Error('Expected application SHA is required.');
  const identity = createReleaseIdentity({ applicationSha: expectedApplicationSha, version, build, dataSources, dataStatus, busManifest, tndsManifests, nptgManifest, ibusManifest, ibusIndex });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });
  // Rebuild app code from the exact checkout, while preserving accepted root data/config from the snapshot.
  for (const relative of ['assets', 'atlas', 'modules', 'src']) {
    try { await fs.access(path.join(appRoot, relative)); } catch { if (relative === 'atlas') throw new Error('Application checkout is missing atlas/.'); else continue; }
    await copyOverlay(appRoot, outputRoot, relative);
  }
  for (const relative of ['config', 'data']) {
    try { await fs.access(path.join(snapshotRoot, relative)); } catch { continue; }
    await copyOverlay(snapshotRoot, outputRoot, relative);
  }
  for (const relative of ['index.html', '.nojekyll', 'CNAME', 'robots.txt', '404.html']) {
    try { await fs.copyFile(path.join(appRoot, relative), path.join(outputRoot, relative)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Carry only the accepted live source configuration and iBus/static freshness records from the snapshot.
  for (const relative of ['atlas/config/atlas-data-sources.json', 'atlas/config/atlas-data-sources.mjs', 'atlas/data/status', 'atlas/data/tfl-ibus', ...(nptgManifest ? ['atlas/data/nptg'] : [])]) {
    const from = path.join(snapshotRoot, relative);
    try { await fs.access(from); } catch { throw new Error(`Accepted data snapshot is missing ${relative}.`); }
    const to = path.join(outputRoot, relative);
    await fs.rm(to, { recursive: true, force: true });
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.cp(from, to, { recursive: true, force: true });
  }
  const releaseJson = path.join(outputRoot, 'atlas/config/atlas-release.json');
  let release = {};
  try { release = JSON.parse(await fs.readFile(releaseJson, 'utf8')); } catch { /* generated release metadata is authoritative */ }
  release.version = version;
  release.build = build;
  await fs.mkdir(path.dirname(releaseJson), { recursive: true });
  await fs.writeFile(releaseJson, normaliseJson(release));
  await fs.writeFile(path.join(outputRoot, 'atlas/config/atlas-release-identity.json'), normaliseJson(identity));
  const htmlPath = path.join(outputRoot, 'atlas/index.html');
  let html = await fs.readFile(htmlPath, 'utf8');
  html = html.replaceAll('ATLAS-2.0.0-beta.1-20261025', build).replaceAll('2.0.0-beta.1', version);
  await fs.writeFile(htmlPath, html);
  const actualDataConfig = JSON.parse(await fs.readFile(path.join(outputRoot, 'atlas/config/atlas-data-sources.json'), 'utf8'));
  if (sha256(normaliseJson(actualDataConfig)) !== identity.data.dataSourcesSha256) throw new Error('Assembled artifact data-source configuration differs from the approved snapshot.');
  const configModule = await import(`${pathToFileURL(path.join(outputRoot, 'atlas/config/atlas-data-sources.mjs')).href}?verify=${Date.now()}`);
  if (sha256(normaliseJson(configModule.atlasDataSources)) !== identity.data.dataSourcesSha256) throw new Error('JavaScript and JSON data-source configurations disagree.');
  const actualIbusManifest = JSON.parse(await fs.readFile(path.join(outputRoot, 'atlas/data/tfl-ibus/manifest.json'), 'utf8'));
  const actualIbusIndex = JSON.parse(await fs.readFile(path.join(outputRoot, 'atlas/data/tfl-ibus', actualIbusManifest.indexPath), 'utf8'));
  if (sha256(normaliseJson(actualIbusManifest)) !== identity.data.ibusManifestSha256 || sha256(normaliseJson(actualIbusIndex)) !== identity.data.ibusIndexSha256) throw new Error('Assembled iBus manifest/index differs from the approved snapshot.');
  const actualRelease = JSON.parse(await fs.readFile(path.join(outputRoot, 'atlas/config/atlas-release.json'), 'utf8'));
  if (actualRelease.version !== version || actualRelease.build !== build) throw new Error('Assembled app version/build metadata mismatch.');
  const finalHtml = await fs.readFile(path.join(outputRoot, 'atlas/index.html'), 'utf8');
  if (!finalHtml.includes(version) || !finalHtml.includes(build)) throw new Error('About/version presentation was not updated to the requested application identity.');
  // The complete Pages upload carries application plus references, never a second national data copy.
  await fs.rm(path.join(outputRoot, 'atlas/data/bus'), { recursive: true, force: true });
  await fs.rm(path.join(outputRoot, 'atlas/data/bus-tnds'), { recursive: true, force: true });
  async function audit(root = outputRoot, prefix = '') {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (/(^|\/)(\.git|\.codex|node_modules|tmp|\.atlas-recovery|review-checkpoint)(\/|$)/i.test(relative)
        || /(^|\/)(\.env(?:\..*)?|.*(?:credential|secret|token|private-key).*)$/i.test(relative)) throw new Error(`Release artifact contains a private or diagnostic path: ${relative}`);
      if (entry.isDirectory()) await audit(path.join(root, entry.name), relative);
      else if (/\.(?:html?|mjs?|json|ya?ml|xml|txt|css|svg|py|sh)$/i.test(entry.name)) {
        const content = await fs.readFile(path.join(root, entry.name), 'utf8');
        if (/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(content)) throw new Error(`Release artifact contains a credential-like value: ${relative}`);
      }
    }
  }
  await audit();
  identity.artifactTreeSha256 = await artifactTreeSha256(outputRoot);
  await fs.writeFile(path.join(outputRoot, 'atlas/config/atlas-release-identity.json'), normaliseJson(identity));
  return identity;
}

export { sha256 };
