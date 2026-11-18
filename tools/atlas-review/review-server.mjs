import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = 'eas-atlas-review-v1';
const APP_VERSION = '2.0.0-beta.1';
const UPDATE_BUS_DATA_PATH = path.join('tools', 'atlas-bus-data', 'UPDATE ATLAS BUS DATA.bat');
const STATUS_PATH = '/__atlas-review/status';
const IDENTITY_PATH = '/__atlas-review/identity';
const STOP_PATH = '/__atlas-review/stop';
const V2_DATA_PATH = '/__atlas-review/v2-data/';
const DEFAULT_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const ALLOWED_ROOTS = Object.freeze(['assets', 'atlas', 'config', 'data', 'modules', 'src']);
const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.gz': 'application/gzip',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
});

function rootIdentifier(rootDir) {
  return createHash('sha256').update(path.resolve(rootDir).toLowerCase()).digest('hex').slice(0, 16);
}

function gitRevisionState(rootDir) {
  try {
    const status = execFileSync('git', ['-C', rootDir, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const revision = execFileSync('git', ['-C', rootDir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { revision: /^[0-9a-f]{40}$/i.test(revision) ? revision : null, dirty: Boolean(status.trim()) };
  } catch {
    return { revision: null, dirty: null };
  }
}

async function applicationCodeDigest(rootDir) {
  const roots = ['atlas', 'src', 'assets', 'modules', 'config'];
  const extensions = new Set(['.html', '.mjs', '.js', '.css']);
  const files = [];
  const visit = async (directory, relative) => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const childRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (childRelative.split(path.sep).some(part => part.toLowerCase() === 'data')) continue;
        await visit(path.join(directory, entry.name), childRelative);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(childRelative);
      }
    }
  };
  for (const relative of roots) await visit(path.join(rootDir, relative), relative);
  files.sort((left, right) => left.localeCompare(right));
  const digest = createHash('sha256');
  for (const relative of files) {
    digest.update(relative.split(path.sep).join('/')).update('\0');
    digest.update(await readFile(path.join(rootDir, relative))).update('\0');
  }
  return { sha256: digest.digest('hex'), fileCount: files.length };
}

async function fileSha256(file) {
  try { return createHash('sha256').update(await readFile(file)).digest('hex'); }
  catch { return null; }
}

async function preparedSourceIdentity(rootDir, v2DataRoot, tflIbusDataRoot) {
  const dataRoot = v2DataRoot || path.join(rootDir, 'atlas', 'data');
  const bus = path.join(dataRoot, 'bus');
  const tnds = path.join(dataRoot, 'bus-tnds');
  const ibus = tflIbusDataRoot ? path.resolve(tflIbusDataRoot) : path.join(dataRoot, 'tfl-ibus');
  const indexFiles = [];
  const findIndexes = async (directory, relative = '') => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) await findIndexes(path.join(directory, entry.name), path.join(relative, entry.name));
      else if (entry.isFile() && /^operator-index\.json$/i.test(entry.name)) {
        indexFiles.push({ path: path.join(relative, entry.name).split(path.sep).join('/'), sha256: await fileSha256(path.join(directory, entry.name)) });
      }
    }
  };
  await findIndexes(ibus);
  indexFiles.sort((left, right) => left.path.localeCompare(right.path));
  let ibusManifest = null;
  try { ibusManifest = JSON.parse(await readFile(path.join(ibus, 'manifest.json'), 'utf8')); } catch {}
  const declaredIndex = ibusManifest?.indexPath && indexFiles.find(index => index.path === String(ibusManifest.indexPath).split(path.sep).join('/'));
  return {
    bus: { manifestSha256: await fileSha256(path.join(bus, 'manifest.json')) },
    tnds: { manifestSha256: await fileSha256(path.join(tnds, 'manifest.json')) },
    tflIbus: {
      manifestSha256: await fileSha256(path.join(ibus, 'manifest.json')),
      declaredIndexPath: ibusManifest?.indexPath ?? null,
      declaredIndexSha256: ibusManifest?.indexSha256 ?? null,
      declaredIndexMatchesManifest: ibusManifest?.indexPath && ibusManifest?.indexSha256 && declaredIndex
        ? declaredIndex.sha256 === ibusManifest.indexSha256
        : null,
      operatorIndexes: indexFiles
    }
  };
}

export async function createRuntimeIdentity(rootDir, v2DataRoot = null, tflIbusDataRoot = null) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedV2DataRoot = v2DataRoot ? path.resolve(v2DataRoot) : null;
  const resolvedTflIbusDataRoot = tflIbusDataRoot ? path.resolve(tflIbusDataRoot) : null;
  const rootId = rootIdentifier(resolvedRoot);
  const v2RootId = resolvedV2DataRoot ? rootIdentifier(resolvedV2DataRoot) : null;
  const tflIbusRootId = resolvedTflIbusDataRoot ? rootIdentifier(resolvedTflIbusDataRoot) : null;
  const git = gitRevisionState(resolvedRoot);
  const code = await applicationCodeDigest(resolvedRoot);
  const marker = `ATLAS review ${APP_VERSION} · ${git.revision ? `git ${git.revision.slice(0, 7)}` : 'git unknown'} · code ${code.sha256.slice(0, 12)} · worktree ${git.dirty === null ? 'unknown' : git.dirty ? 'dirty' : 'clean'}`;
  return {
    appId: APP_ID,
    version: APP_VERSION,
    buildMarker: marker,
    worktreeRoot: resolvedRoot,
    rootId,
    gitRevision: git.revision,
    worktreeDirty: git.dirty,
    applicationCodeSha256: code.sha256,
    applicationCodeFileCount: code.fileCount,
    v2DataRoot: resolvedV2DataRoot,
    v2RootId,
    tflIbusDataRoot: resolvedTflIbusDataRoot,
    tflIbusRootId,
    preparedSources: await preparedSourceIdentity(resolvedRoot, resolvedV2DataRoot, resolvedTflIbusDataRoot)
  };
}

export function reviewStateDirectory() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'EAS ATLAS', 'Review');
}

export function reviewStateFile(rootDir = DEFAULT_ROOT, stateDir = reviewStateDirectory()) {
  return path.join(stateDir, `review-${rootIdentifier(rootDir)}.json`);
}

function safeTokenMatch(expected, actual) {
  const left = Buffer.from(String(expected || ''));
  const right = Buffer.from(String(actual || ''));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function readState(stateFile) {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

async function removeState(stateFile) {
  try { await unlink(stateFile); } catch {}
}

async function writeState(stateFile, value) {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeReview(state, expectedRootId, expectedCodeSha256 = null) {
  if (!state?.port) return false;
  try {
    const response = await fetchWithTimeout(`http://127.0.0.1:${state.port}${STATUS_PATH}`);
    if (!response.ok) return false;
    const payload = await response.json();
    return payload.appId === APP_ID
      && payload.rootId === expectedRootId
      && (!expectedCodeSha256 || payload.applicationCodeSha256 === expectedCodeSha256);
  } catch {
    return false;
  }
}

function openDefaultBrowser(url) {
  const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

export function approvedBusUpdaterPath(rootDir = DEFAULT_ROOT) { return path.join(path.resolve(rootDir), UPDATE_BUS_DATA_PATH); }

export function launchBusUpdater(rootDir = DEFAULT_ROOT) {
  const updater = approvedBusUpdaterPath(rootDir);
  if (process.platform !== 'win32' || !existsSync(updater)) throw new Error('The local Bus data updater is not available.');
  const child = spawn('cmd.exe', ['/d', '/c', updater], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return updater;
}

function plainResponse(response, statusCode, message) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(message);
}

function allowedStaticPath(pathname) {
  if (pathname === '/index.html') return true;
  const first = pathname.split('/').filter(Boolean)[0];
  return ALLOWED_ROOTS.includes(first) && !pathname.split('/').some(part => part.startsWith('.'));
}

async function resolveStaticFile(rootDir, pathname) {
  let requested = pathname;
  if (requested === '/') requested = '/index.html';
  if (requested === '/atlas') return { redirect: '/atlas/' };
  if (requested === '/atlas/') requested = '/atlas/index.html';
  if (!allowedStaticPath(requested)) return null;
  const candidate = path.resolve(rootDir, `.${requested}`);
  const rootReal = await realpath(rootDir);
  let candidateReal;
  try { candidateReal = await realpath(candidate); } catch { return null; }
  if (candidateReal !== rootReal && !candidateReal.startsWith(`${rootReal}${path.sep}`)) return null;
  const details = await stat(candidateReal);
  return details.isFile() ? { file: candidateReal, size: details.size } : null;
}

async function resolveExternalDataFile(dataRoot, pathname) {
  if (!dataRoot || !pathname.startsWith(V2_DATA_PATH)) return null;
  const relative = pathname.slice(V2_DATA_PATH.length);
  if (!relative || relative.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) return null;
  const resolvedRoot = await realpath(dataRoot);
  const candidate = path.resolve(resolvedRoot, ...relative.split('/'));
  let candidateReal;
  try { candidateReal = await realpath(candidate); } catch { return null; }
  if (candidateReal !== resolvedRoot && !candidateReal.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  const details = await stat(candidateReal);
  return details.isFile() ? { file: candidateReal, size: details.size } : null;
}

function createRequestHandler({ rootDir, rootId, v2DataRoot = null, v2RootId = null, identity, stopToken, closeServer, updaterLauncher = launchBusUpdater }) {
  return async (request, response) => {
    const method = request.method || 'GET';
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname); }
    catch { return plainResponse(response, 400, 'ATLAS could not understand this review address.'); }

    if (pathname === STATUS_PATH && method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return response.end(JSON.stringify({ appId: APP_ID, version: APP_VERSION, rootId, v2RootId, applicationCodeSha256: identity.applicationCodeSha256, buildMarker: identity.buildMarker }));
    }
    if (pathname === IDENTITY_PATH && method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return response.end(JSON.stringify(identity));
    }
    if (pathname === STOP_PATH && method === 'POST') {
      if (!safeTokenMatch(stopToken, request.headers['x-atlas-review-token'])) return plainResponse(response, 403, 'ATLAS review stop request was not recognised.');
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ stopped: true }));
      setTimeout(closeServer, 25);
      return;
    }
    if (pathname === '/__atlas-review/update-bus-data' && method === 'POST') {
      try {
        updaterLauncher(rootDir);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return response.end(JSON.stringify({ opened: true }));
      } catch {
        return plainResponse(response, 503, 'The local ATLAS maintenance environment is not available.');
      }
    }
    if (!['GET', 'HEAD'].includes(method)) return plainResponse(response, 405, 'This ATLAS review action is not available.');

    let resolved;
    try { resolved = await resolveExternalDataFile(v2DataRoot, pathname) || await resolveStaticFile(rootDir, pathname); }
    catch { return plainResponse(response, 500, 'ATLAS could not open this review file. Please try again.'); }
    if (!resolved) return plainResponse(response, 404, 'ATLAS review page not found.');
    if (resolved.redirect) {
      response.writeHead(302, { Location: resolved.redirect, 'Cache-Control': 'no-store' });
      return response.end();
    }

    const contentType = MIME_TYPES[path.extname(resolved.file).toLowerCase()] || 'application/octet-stream';
    const testBuildMarker = pathname === '/atlas/' || pathname === '/atlas/index.html' ? identity.buildMarker : null;
    const injectedHtml = testBuildMarker
      ? (await readFile(resolved.file, 'utf8')).replace(
          /<body\b[^>]*>/i,
          tag => `${tag.slice(0, -1)} data-atlas-test-build="${testBuildMarker}">`,
        )
      : null;
    const contentLength = injectedHtml === null ? resolved.size : Buffer.byteLength(injectedHtml);
    response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': contentLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (method === 'HEAD') return response.end();
    if (injectedHtml !== null) return response.end(injectedHtml);
    const stream = createReadStream(resolved.file);
    stream.on('error', () => { if (!response.headersSent) plainResponse(response, 500, 'ATLAS could not open this review file. Please try again.'); else response.destroy(); });
    stream.pipe(response);
  };
}

async function listen(server, preferredPort, maximumPort) {
  const ports = preferredPort === 0 ? [0] : Array.from({ length: maximumPort - preferredPort + 1 }, (_, index) => preferredPort + index);
  for (const port of ports) {
    try {
      await new Promise((resolve, reject) => {
        const onError = error => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
      });
      return server.address().port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  const error = new Error('No review address is available.');
  error.code = 'NO_AVAILABLE_PORT';
  throw error;
}

export async function startReviewServer({
  rootDir = DEFAULT_ROOT,
  preferredPort = 8769,
  maximumPort = 8789,
  stateFile = reviewStateFile(rootDir),
  v2DataRoot = null,
  tflIbusDataRoot = null,
  openBrowser = true,
  updaterLauncher = launchBusUpdater
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedV2DataRoot = v2DataRoot ? path.resolve(v2DataRoot) : null;
  if (!existsSync(path.join(resolvedRoot, 'atlas', 'index.html'))) throw new Error('ATLAS application files were not found.');
  const rootId = rootIdentifier(resolvedRoot);
  const v2RootId = resolvedV2DataRoot ? rootIdentifier(resolvedV2DataRoot) : null;
  const resolvedTflIbusDataRoot = tflIbusDataRoot ? path.resolve(tflIbusDataRoot) : null;
  const tflIbusRootId = resolvedTflIbusDataRoot ? rootIdentifier(resolvedTflIbusDataRoot) : null;
  const identity = await createRuntimeIdentity(resolvedRoot, resolvedV2DataRoot, resolvedTflIbusDataRoot);
  const existing = await readState(stateFile);
  if (await probeReview(existing, rootId, identity.applicationCodeSha256)
    && (!resolvedV2DataRoot || existing.v2RootId === v2RootId)
    && (!resolvedTflIbusDataRoot || existing.tflIbusRootId === tflIbusRootId)) {
    const url = `http://127.0.0.1:${existing.port}/atlas/${resolvedV2DataRoot ? '?review=v2' : ''}#modules`;
    if (openBrowser) openDefaultBrowser(url);
    return { reused: true, port: existing.port, url, stateFile, closed: Promise.resolve() };
  }
  if (existing) await removeState(stateFile);

  const stopToken = randomUUID();
  let server;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const closeServer = () => { if (server?.listening) server.close(); else resolveClosed(); };
  server = createServer(createRequestHandler({ rootDir: resolvedRoot, rootId, v2DataRoot: resolvedV2DataRoot, v2RootId, identity, stopToken, closeServer, updaterLauncher }));
  const port = await listen(server, preferredPort, maximumPort);
  const url = `http://127.0.0.1:${port}/atlas/${resolvedV2DataRoot ? '?review=v2' : ''}#modules`;
  await writeState(stateFile, { appId: APP_ID, version: APP_VERSION, rootId, v2RootId, tflIbusRootId, applicationCodeSha256: identity.applicationCodeSha256, port, processId: process.pid, stopToken, startedAt: new Date().toISOString() });

  server.on('close', async () => {
    const current = await readState(stateFile);
    if (current?.stopToken === stopToken) await removeState(stateFile);
    resolveClosed();
  });
  if (openBrowser) openDefaultBrowser(url);
  return {
    reused: false,
    port,
    url,
    stateFile,
    closed,
    close: () => new Promise(resolve => { if (!server.listening) return resolve(); server.close(resolve); })
  };
}

export async function stopReviewServer({ rootDir = DEFAULT_ROOT, stateFile = reviewStateFile(rootDir) } = {}) {
  const state = await readState(stateFile);
  if (!state) return { stopped: false, reason: 'not-running' };
  if (!(await probeReview(state, rootIdentifier(rootDir)))) {
    await removeState(stateFile);
    return { stopped: false, reason: 'not-running' };
  }
  try {
    const response = await fetchWithTimeout(`http://127.0.0.1:${state.port}${STOP_PATH}`, { method: 'POST', headers: { 'X-ATLAS-Review-Token': state.stopToken } }, 2000);
    if (!response.ok) return { stopped: false, reason: 'not-recognised' };
    return { stopped: true, port: state.port };
  } catch {
    return { stopped: false, reason: 'not-running' };
  }
}

function technicalLogPath() {
  return path.join(reviewStateDirectory(), 'atlas-review.log');
}

async function recordTechnicalError(error) {
  try {
    await mkdir(reviewStateDirectory(), { recursive: true });
    await appendFile(technicalLogPath(), `[${new Date().toISOString()}] ${error?.stack || error}\n`, 'utf8');
  } catch {}
}

async function runCommandLine() {
  if (process.argv.includes('--stop')) {
    const result = await stopReviewServer();
    console.log(result.stopped ? 'ATLAS review is stopped.' : 'ATLAS review is already stopped.');
    return;
  }

  console.log('Starting ATLAS review...');
  const review = await startReviewServer({ openBrowser: !process.argv.includes('--no-open') });
  if (review.reused) {
    console.log('ATLAS is already ready. Your browser should open automatically.');
    return;
  }
  console.log('ATLAS is ready. Your browser should open automatically.');
  console.log('You can now test ATLAS.');
  console.log('Close this window or double-click STOP ATLAS REVIEW to stop.');
  const shutdown = () => review.close();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await review.closed;
}

const isCommandLine = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCommandLine) {
  runCommandLine().catch(async error => {
    await recordTechnicalError(error);
    console.error('ATLAS could not start. Please close other applications and try again.');
    console.error('If this continues, ask Codex or a developer for help. A technical log has been saved for support.');
    process.exitCode = 1;
  });
}
