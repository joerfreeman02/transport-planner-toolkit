import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const safeBuilder = path.join(root, 'tools', 'atlas-bus-data', 'safe_build_static_index.py');
const manifestPath = path.join(root, 'atlas', 'data', 'bus', 'manifest.json');

function localIsoDate(now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function commandWorks(command, prefix = []) {
  const result = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 && /Python\s+3\./i.test(`${result.stdout || ''}${result.stderr || ''}`);
}

function pythonCandidates() {
  const candidates = [];
  if (process.env.ATLAS_PYTHON) candidates.push({ command: process.env.ATLAS_PYTHON, prefix: [] });
  if (process.platform === 'win32') {
    candidates.push({ command: 'py.exe', prefix: ['-3'] });
    const userProfile = process.env.USERPROFILE || os.homedir();
    const local = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    for (const version of ['313', '312', '311', '310']) {
      candidates.push({ command: path.join(local, 'Programs', 'Python', `Python${version}`, 'python.exe'), prefix: [] });
      candidates.push({ command: path.join(programFiles, `Python${version}`, 'python.exe'), prefix: [] });
    }
    candidates.push({
      command: path.join(userProfile, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
      prefix: []
    });
  }
  candidates.push({ command: 'python3', prefix: [] }, { command: 'python', prefix: [] });
  return candidates;
}

export function discoverPython() {
  for (const candidate of pythonCandidates()) {
    if (path.isAbsolute(candidate.command) && !existsSync(candidate.command)) continue;
    if (commandWorks(candidate.command, candidate.prefix)) return candidate;
  }
  throw new Error('A working Python 3 interpreter could not be located. Set ATLAS_PYTHON to an explicit interpreter path.');
}

export function normaliseManifest(file = manifestPath) {
  if (!existsSync(file)) throw new Error(`Prepared bus manifest was not found: ${file}`);
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  if (manifest.schema !== 'atlas-prepared-bus-data-v1') throw new Error('Prepared bus manifest schema is invalid.');
  if (!manifest.generatedAt || Number.isNaN(Date.parse(manifest.generatedAt))) throw new Error('Prepared bus manifest does not contain a valid preparation time.');
  for (const source of ['naptan', 'bods']) {
    if (manifest.sources?.[source]) delete manifest.sources[source].downloadedAt;
  }
  writeFileSync(file, `${JSON.stringify(manifest)}\n`, 'utf8');
  return manifest;
}

function runBuild() {
  const args = process.argv.slice(2);
  if (args.includes('--normalise-existing')) {
    const manifest = normaliseManifest();
    console.log(JSON.stringify({ normalised: true, generatedAt: manifest.generatedAt, snapshotDate: manifest.snapshotDate }, null, 2));
    return;
  }

  const python = discoverPython();
  if (args.includes('--check-runtime')) {
    console.log(JSON.stringify({ python: python.command, prefix: python.prefix }, null, 2));
    return;
  }

  const snapshotIndex = args.indexOf('--snapshot-date');
  const snapshotDate = snapshotIndex >= 0 ? args[snapshotIndex + 1] : localIsoDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate || '')) throw new Error('--snapshot-date must use YYYY-MM-DD.');

  const command = [
    ...python.prefix,
    safeBuilder,
    '--naptan', path.join(root, 'tmp', 'bus-data', 'naptan.csv'),
    '--gtfs-dir', path.join(root, 'tmp', 'bus-data'),
    '--output', path.join(root, 'atlas', 'data', 'bus'),
    '--snapshot-date', snapshotDate
  ];
  const result = spawnSync(python.command, command, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const manifest = normaliseManifest();
  console.log(JSON.stringify({ buildComplete: true, snapshotDate: manifest.snapshotDate, preparedAt: manifest.generatedAt }, null, 2));
}

try {
  runBuild();
} catch (error) {
  console.error(`ATLAS bus-data build could not complete: ${error.message}`);
  process.exitCode = 1;
}
