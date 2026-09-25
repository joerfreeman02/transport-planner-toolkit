import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewStateDirectory, startReviewServer, stopReviewServer } from './review-server.mjs';

const REVIEW_RUN_ID = '36125621080';
const SNAPSHOT_ARTIFACT = 'atlas-reference-source-snapshot-36125621080';
const SNAPSHOT_ID = '8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9';
const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const cacheRoot = path.join(reviewStateDirectory(), 'v2', `run-${REVIEW_RUN_ID}`);
const sourceRoot = path.join(cacheRoot, 'source-snapshot');
const preparedRoot = path.join(cacheRoot, 'prepared');
const stateFile = path.join(reviewStateDirectory(), `review-v2-${REVIEW_RUN_ID}.json`);
const pythonCandidates = [
  process.env.ATLAS_PYTHON,
  path.join(process.env.USERPROFILE || os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
  'python.exe'
].filter(Boolean);

function command(commandName) {
  if (commandName === 'gh' && process.platform === 'win32' && existsSync(path.join(process.env.ProgramFiles || '', 'GitHub CLI', 'gh.exe'))) return path.join(process.env.ProgramFiles, 'GitHub CLI', 'gh.exe');
  return commandName;
}

function run(commandName, args, options = {}) {
  return execFileSync(command(commandName), args, { cwd: repoRoot, encoding: 'utf8', stdio: options.stdio || ['ignore', 'pipe', 'pipe'] });
}

function pythonPath() {
  for (const candidate of pythonCandidates) {
    try { execFileSync(candidate, ['--version'], { stdio: 'ignore' }); return candidate; } catch {}
  }
  throw new Error('The bundled ATLAS Python runtime is not available.');
}

async function findManifest(root) {
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.some(entry => entry.isFile() && entry.name === 'manifest.json')) return root;
  for (const entry of entries.filter(entry => entry.isDirectory())) {
    const found = await findManifest(path.join(root, entry.name));
    if (found) return found;
  }
  return null;
}

function verifySnapshot(root) {
  const output = run(pythonPath(), ['tools/atlas-bus-data/source_snapshot.py', '--verify', root]);
  let report;
  try { report = JSON.parse(output); } catch { throw new Error('The frozen source snapshot verification report was not valid JSON.'); }
  if (report.snapshotId !== SNAPSHOT_ID || report.reuseMode !== 'FROZEN_DIAGNOSTIC_EXPLICIT' || report.productionEligible !== false || report.currentSourceFreshnessClaimed !== false) throw new Error('The supplied frozen source snapshot did not pass the NPTG review controls.');
  return report;
}

async function ensureSnapshot() {
  if (existsSync(path.join(sourceRoot, 'manifest.json'))) return verifySnapshot(sourceRoot);
  await mkdir(cacheRoot, { recursive: true });
  const staging = path.join(cacheRoot, `snapshot-staging-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    run('gh', ['run', 'download', REVIEW_RUN_ID, '--name', SNAPSHOT_ARTIFACT, '--dir', staging], { stdio: 'inherit' });
    const found = await findManifest(staging);
    if (!found) throw new Error('The supplied snapshot artifact did not contain manifest.json.');
    await rm(sourceRoot, { recursive: true, force: true });
    await cp(found, sourceRoot, { recursive: true });
  } finally { await rm(staging, { recursive: true, force: true }); }
  return verifySnapshot(sourceRoot);
}

async function ensurePrepared(snapshotReport) {
  const markerPath = path.join(preparedRoot, 'nptg1-review.json');
  const statusPath = path.join(preparedRoot, 'atlas', 'data', 'status', 'manifest.json');
  const busManifestPath = path.join(preparedRoot, 'atlas', 'data', 'bus', 'manifest.json');
  if (existsSync(busManifestPath) && existsSync(statusPath) && existsSync(markerPath)) {
    try {
      const marker = JSON.parse(await readFile(markerPath, 'utf8'));
      if (marker.snapshotId === SNAPSHOT_ID && marker.runId === REVIEW_RUN_ID) return marker;
    } catch {}
  }
  const staging = path.join(cacheRoot, `prepared-staging-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(path.join(staging, 'atlas', 'config'), { recursive: true });
  await cp(path.join(repoRoot, 'atlas', 'config', 'atlas-release.json'), path.join(staging, 'atlas', 'config', 'atlas-release.json'));
  const py = pythonPath();
  run(py, ['tools/atlas-bus-data/refresh_bus_data.py', '--site-root', staging, '--previous-root', repoRoot, '--prepared-schema', 'v2', '--bus-only-diagnostic', '--source-snapshot', sourceRoot, '--acquisition-disabled'], { stdio: 'inherit' });
  run(py, ['tools/atlas-bus-data/validate_candidate.py', '--site-root', staging, '--bus-only'], { stdio: 'inherit' });
  if (!existsSync(path.join(staging, 'atlas', 'data', 'status', 'manifest.json'))) throw new Error('The prepared V2 review data did not contain a status manifest.');
  const manifest = JSON.parse(await readFile(path.join(staging, 'atlas', 'data', 'bus', 'manifest.json'), 'utf8'));
  const marker = { runId: REVIEW_RUN_ID, snapshotId: SNAPSHOT_ID, snapshotReport, preparedSchema: manifest.schema, counts: manifest.counts || null, generatedAt: manifest.generatedAt };
  await writeFile(path.join(staging, 'nptg1-review.json'), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  await rm(preparedRoot, { recursive: true, force: true });
  await rename(staging, preparedRoot);
  return marker;
}

async function main() {
  if (process.argv.includes('--stop')) {
    const result = await stopReviewServer({ rootDir: repoRoot, stateFile });
    console.log(result.stopped ? 'ATLAS V2 review is stopped.' : 'ATLAS V2 review is already stopped.');
    return;
  }
  const snapshotReport = await ensureSnapshot();
  await ensurePrepared(snapshotReport);
  const review = await startReviewServer({ rootDir: repoRoot, v2DataRoot: path.join(preparedRoot, 'atlas', 'data'), stateFile, openBrowser: !process.argv.includes('--no-open') });
  console.log(review.reused ? 'ATLAS V2 review is already ready.' : 'ATLAS V2 review is ready.');
  const shutdown = () => review.close?.();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await review.closed;
}

main().catch(error => { console.error(`ATLAS V2 review could not start: ${error.message}`); process.exitCode = 1; });
