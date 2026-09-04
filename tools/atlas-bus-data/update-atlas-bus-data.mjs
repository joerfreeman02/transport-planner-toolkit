import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const execFileAsync = promisify(execFile);
export const TNDS_REGIONS = Object.freeze(['EA', 'EM', 'NE', 'NW', 'SE', 'SW', 'WM', 'Y']);
export const TNDS_URL = 'ftp://ftp.tnds.basemap.co.uk/TNDSV2.5/';
const localRoot = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Local'), 'EAS ATLAS', 'BusData');
const sourceRoot = path.join(localRoot, 'tnds-raw');
const manifestPath = path.join(localRoot, 'source-manifest.json');

function regionCode(value) {
  const code = String(value?.region ?? value ?? '').toUpperCase();
  return TNDS_REGIONS.includes(code) ? code : null;
}

export function selectChangedRegions(remoteRegions = [], localRegions = {}) {
  return remoteRegions.map(item => ({
    ...item,
    region: regionCode(item),
    name: String(item?.name ?? item?.file ?? '').trim(),
    size: Number(item?.size ?? 0),
    modifiedAt: item?.modifiedAt ?? null
  })).filter(item => item.region && item.name).filter(item => {
    const previous = localRegions[item.region];
    return !previous || previous.name !== item.name || Number(previous.size) !== item.size || previous.modifiedAt !== item.modifiedAt;
  });
}

export async function transactionalUpdate({ remoteRegions, localManifest = {}, downloadRegion, buildCandidate, validateCandidate, promoteCandidate, retainRollback, root = localRoot, existingRoot = null }) {
  const selected = selectChangedRegions(remoteRegions, localManifest.regions ?? {});
  if (!selected.length) return { changed: false, selected: [], manifest: localManifest };
  const staging = await fs.mkdtemp(path.join(root, 'tnds-staging-'));
  try {
    if (existingRoot) await fs.cp(existingRoot, staging, { recursive: true, force: false, errorOnExist: false }).catch(() => {});
    for (const region of selected) await downloadRegion(region, staging);
    const candidate = await buildCandidate(staging, selected);
    await validateCandidate(candidate);
    const previous = await promoteCandidate(candidate);
    if (previous && retainRollback) await retainRollback(previous);
    const manifest = { schema: 'atlas-tnds-source-manifest-v1', updatedAt: new Date().toISOString(), regions: Object.fromEntries(selected.map(item => [item.region, item])) };
    return { changed: true, selected, previous, manifest };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function ftpListing(username, password) {
  const { stdout } = await execFileAsync('curl.exe', ['--silent', '--show-error', '--fail', '--list-only', '--user', `${username}:${password}`, TNDS_URL], { windowsHide: true });
  return stdout.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
}

async function downloadRegion(region, staging, username, password) {
  const destination = path.join(staging, region.name);
  await execFileAsync('curl.exe', ['--silent', '--show-error', '--fail', '--user', `${username}:${password}`, '--output', destination, new URL(region.name, TNDS_URL).toString()], { windowsHide: true });
}

async function validateCandidate(candidate) {
  const files = await fs.readdir(candidate);
  if (!files.length) throw new Error('The staged TNDS candidate is empty.');
  for (const file of files) {
    if (!/\.zip$/i.test(file)) throw new Error(`Unexpected staged TNDS file: ${file}`);
    await execFileAsync('tar.exe', ['-tf', path.join(candidate, file)], { windowsHide: true });
  }
}

async function promoteCandidate(candidate) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const previous = await fs.access(sourceRoot).then(() => `${sourceRoot}.previous-${timestamp}`).catch(() => null);
  if (previous) await fs.rename(sourceRoot, previous);
  try { await fs.rename(candidate, sourceRoot); } catch (error) {
    if (previous) await fs.rename(previous, sourceRoot).catch(() => {});
    throw error;
  }
  return previous;
}

async function promptCredentials() {
  const rl = readline.createInterface({ input, output });
  const username = await rl.question('Traveline username: ');
  const password = await rl.question('Traveline password (not stored): ');
  rl.close();
  return { username, password };
}

async function main() {
  const credentials = await promptCredentials();
  try {
    const names = await ftpListing(credentials.username, credentials.password);
    const remoteRegions = names.map(name => ({ name, region: TNDS_REGIONS.find(code => new RegExp(`(?:^|[-_])${code}(?:[-_.]|$)`, 'i').test(name)) }));
    const previous = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => ({}));
    if (!remoteRegions.length) throw new Error('The TNDS FTP listing was empty.');
    await fs.mkdir(localRoot, { recursive: true });
    const result = await transactionalUpdate({
      remoteRegions, localManifest: previous,
      root: localRoot, existingRoot: sourceRoot,
      downloadRegion: (region, staging) => downloadRegion(region, staging, credentials.username, credentials.password),
      buildCandidate: async staging => staging,
      validateCandidate,
      promoteCandidate,
      retainRollback: async previousPath => console.log(`Previous dataset retained at ${previousPath}.`)
    });
    const regions = { ...(previous.regions ?? {}), ...Object.fromEntries(result.selected.map(item => [item.region, item])) };
    await fs.mkdir(localRoot, { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify({ schema: 'atlas-tnds-source-manifest-v1', checkedAt: new Date().toISOString(), regions }, null, 2));
    console.log(result.changed ? 'Bus data updated successfully. The previous dataset has been retained as a rollback copy.' : 'Bus data is already current. The verified dataset remains in use.');
  } catch (error) {
    console.error('Bus data could not be updated. The previous verified dataset remains in use.');
    if (process.env.ATLAS_BUS_DIAGNOSTIC_LOG) await fs.appendFile(process.env.ATLAS_BUS_DIAGNOSTIC_LOG, `${new Date().toISOString()} ${error.message}\n`).catch(() => {});
    process.exitCode = 1;
  } finally {
    credentials.password = '';
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
