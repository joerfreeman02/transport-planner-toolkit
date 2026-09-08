import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = 'eas-atlas-review-v1';
const APP_VERSION = '2.0.0-alpha.9';
const UPDATE_BUS_DATA_PATH = path.join('tools', 'atlas-bus-data', 'UPDATE ATLAS BUS DATA.bat');
const STATUS_PATH = '/__atlas-review/status';
const STOP_PATH = '/__atlas-review/stop';
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

async function probeReview(state, expectedRootId) {
  if (!state?.port) return false;
  try {
    const response = await fetchWithTimeout(`http://127.0.0.1:${state.port}${STATUS_PATH}`);
    if (!response.ok) return false;
    const payload = await response.json();
    return payload.appId === APP_ID && payload.rootId === expectedRootId;
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

function createRequestHandler({ rootDir, rootId, stopToken, closeServer, updaterLauncher = launchBusUpdater }) {
  return async (request, response) => {
    const method = request.method || 'GET';
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname); }
    catch { return plainResponse(response, 400, 'ATLAS could not understand this review address.'); }

    if (pathname === STATUS_PATH && method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return response.end(JSON.stringify({ appId: APP_ID, version: APP_VERSION, rootId }));
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
    try { resolved = await resolveStaticFile(rootDir, pathname); }
    catch { return plainResponse(response, 500, 'ATLAS could not open this review file. Please try again.'); }
    if (!resolved) return plainResponse(response, 404, 'ATLAS review page not found.');
    if (resolved.redirect) {
      response.writeHead(302, { Location: resolved.redirect, 'Cache-Control': 'no-store' });
      return response.end();
    }

    const contentType = MIME_TYPES[path.extname(resolved.file).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': resolved.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (method === 'HEAD') return response.end();
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
  openBrowser = true,
  updaterLauncher = launchBusUpdater
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  if (!existsSync(path.join(resolvedRoot, 'atlas', 'index.html'))) throw new Error('ATLAS application files were not found.');
  const rootId = rootIdentifier(resolvedRoot);
  const existing = await readState(stateFile);
  if (await probeReview(existing, rootId)) {
    const url = `http://127.0.0.1:${existing.port}/atlas/#modules`;
    if (openBrowser) openDefaultBrowser(url);
    return { reused: true, port: existing.port, url, stateFile, closed: Promise.resolve() };
  }
  if (existing) await removeState(stateFile);

  const stopToken = randomUUID();
  let server;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const closeServer = () => { if (server?.listening) server.close(); else resolveClosed(); };
  server = createServer(createRequestHandler({ rootDir: resolvedRoot, rootId, stopToken, closeServer, updaterLauncher }));
  const port = await listen(server, preferredPort, maximumPort);
  const url = `http://127.0.0.1:${port}/atlas/#modules`;
  await writeState(stateFile, { appId: APP_ID, version: APP_VERSION, rootId, port, processId: process.pid, stopToken, startedAt: new Date().toISOString() });

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
