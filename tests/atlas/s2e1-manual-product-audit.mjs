import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { launchAtlasBrowser } from './playwright-launch.mjs';

const [candidateArg, reportArg] = process.argv.slice(2);
if (!candidateArg) throw new Error('Usage: node tests/atlas/s2e1-manual-product-audit.mjs <Run-75-candidate-root> [report.json]');
const candidateRoot = path.resolve(candidateArg);
const repositoryRoot = path.resolve(new URL('../../', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const controls = [
  { id: 'pipers-lane', label: 'Pipers Lane', latitude: 51.852700, longitude: -0.454343, radius: 700 },
  { id: 'waltham-cross', label: '47 Berkley Avenue, Waltham Cross', latitude: 51.6857829, longitude: -0.0330001, radius: 700 },
  { id: 'chingford', label: 'Normanshire Drive, Chingford', latitude: 51.616596, longitude: -0.0117893, radius: 250 },
  { id: 'pe1', label: 'PE1 2TL', latitude: 52.577554, longitude: -0.242489, radius: 500 }
];
const report = { schema: 'atlas-bus-s2e1-normal-product-browser-word-audit-v1', candidateRoot, candidateRun: '39430415441', candidateArtifactId: '12275615359', candidateDigest: 'sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471', candidateProducerSha: '151199cc914c235870f444d26b03c2309edbd035', acquisitionAttempted: false, publicationAttempted: false, deploymentAttempted: false, controls: {}, failures: [] };
const errors = [];
const failedRequests = [];
const failedResponses = [];
const externalRequests = [];
const statusManifestFallbacks = [];
let server;
let browser;

function zipEntry(bytes, entryName) {
  const signature = 0x02014b50;
  for (let offset = 0; offset + 46 <= bytes.length;) {
    if (bytes.readUInt32LE(offset) !== signature) { offset += 1; continue; }
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === entryName) {
      const localOffset = bytes.readUInt32LE(offset + 42);
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return data.toString('utf8');
      if (method === 8) return inflateRawSync(data).toString('utf8');
      throw new Error(`Unsupported Word ZIP compression method ${method}.`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Generated Word export did not contain ${entryName}.`);
}

function wordText(xml) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map(match => match[1]
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")).join(' ');
}

function fail(id, reason) { report.failures.push({ id, reason }); }

try {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/atlas/data/status/manifest.json') {
        // The immutable review candidate and code checkout do not carry the
        // separately published freshness-status manifest. Return an empty
        // local response so the normal app handles status as unavailable
        // without turning this unrelated missing file into a 404/browser error.
        statusManifestFallbacks.push(pathname);
        response.writeHead(204);
        response.end();
        return;
      }
      const marker = pathname.startsWith('/atlas/data/bus-tnds/') ? '/atlas/data/bus-tnds/' : pathname.startsWith('/atlas/data/bus/') ? '/atlas/data/bus/' : null;
      const root = marker ? path.join(candidateRoot, pathname.startsWith('/atlas/data/bus-tnds/') ? 'atlas/data/bus-tnds' : 'atlas/data/bus') : repositoryRoot;
      const relative = marker ? pathname.slice(marker.length) : pathname.replace(/^\/+/, '');
      const target = relative.endsWith('/') ? `${relative}index.html` : relative || 'index.html';
      const file = path.resolve(root, target);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe static path.');
      const bytes = await readFile(file);
      const extension = path.extname(file).toLowerCase();
      const type = ({ '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' })[extension] || 'application/octet-stream';
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'content-length': bytes.length });
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  const baseUrl = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/`));
  });
  browser = await launchAtlasBrowser(chromium, { headless: true });
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  page.on('response', response => { if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() }); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost', 'tile.openstreetmap.org', 'routing.openstreetmap.de', 'api.tfl.gov.uk'].includes(url.hostname)) externalRequests.push(request.url());
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av3nGQAAAABJRU5ErkJggg==', 'base64') }));
  await page.route('https://routing.openstreetmap.de/**', route => {
    const url = route.request().url();
    if (url.includes('/table/')) {
      const points = decodeURIComponent(url.split('/').at(-1).split('?')[0]).split(';');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', distances: [points.map((_p, index) => index ? 100 : 0)], durations: [points.map((_p, index) => index ? 60 : 0)] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ distance: 100, duration: 60, geometry: { type: 'LineString', coordinates: [[-0.03, 51.68], [-0.031, 51.681]] } }] }) });
  });
  await page.route('https://api.tfl.gov.uk/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }));
  for (const control of controls) {
    const outcome = { label: control.label };
    try {
      await page.goto(new URL('atlas/', baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('.coordinate-details > summary').click();
      await page.locator('#latitude').fill(String(control.latitude));
      await page.locator('#longitude').fill(String(control.longitude));
      await page.locator('#coordinatesForm button[type="submit"]').click();
      await page.locator('#confirmAssessmentPoint').click();
      assert.equal(await page.locator('#findStops').isEnabled(), true, 'Normal workflow did not enable Bus assessment after confirming the site.');
      await page.locator('#findStops').click();
      await page.locator('#taskStatusMessage').waitFor({ state: 'visible', timeout: 180000 });
      await page.waitForFunction(() => ['Complete', 'Partial', 'Needs review'].includes(document.querySelector('#taskStatusMessage')?.textContent?.trim()), undefined, { timeout: 180000 });
      const serviceTable = page.locator('.bus-service-summary');
      const wrap = serviceTable.locator('xpath=ancestor::div[contains(@class,"table-wrap")]');
      const scroll = await wrap.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
      assert.ok(scroll.scroll <= scroll.client + 1, `Bus Service Summary has horizontal overflow (${scroll.scroll}px > ${scroll.client}px).`);
      const pageWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(pageWidth.scroll <= pageWidth.client + 1, `Normal planner page has horizontal overflow (${pageWidth.scroll}px > ${pageWidth.client}px).`);
      const sourceHeader = serviceTable.locator('thead th').last();
      assert.equal(await sourceHeader.innerText(), 'Source', 'Source must remain the final planner-facing column.');
      const sourceRows = serviceTable.locator('tbody tr:not(.service-note) td[data-label="Source"]');
      const rowCount = await sourceRows.count();
      assert.ok(rowCount > 0, 'Normal rendered Bus assessment has no service rows.');
      const sourceSamples = [];
      for (const index of [...new Set([0, Math.floor((rowCount - 1) / 2), rowCount - 1])]) {
        const cell = sourceRows.nth(index);
        await cell.scrollIntoViewIfNeeded();
        const visible = await cell.evaluate(element => {
          const panel = element.closest('.table-wrap').getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          return { left: bounds.left >= panel.left - 1, right: bounds.right <= panel.right + 1, text: element.innerText.trim() };
        });
        assert.ok(visible.left && visible.right, `Source cell at table row ${index + 1} is not horizontally visible.`);
        sourceSamples.push({ row: index + 1, ...visible });
      }
      const technical = page.locator('#developerDiagnostics');
      assert.equal(await technical.getAttribute('hidden') !== null, true, 'Developer diagnostics must be absent from ordinary planner mode.');
      await page.locator('details > summary').filter({ hasText: 'Sources and checks' }).click();
      const checksText = await page.locator('#plannerChecks').innerText();
      assert.doesNotMatch(checksText, /SpecialDaysOperation|TNDS .*special dates require review/i, 'Sources and checks exposes raw per-service special-day warnings.');
      const rendered = await serviceTable.locator('tbody tr:not(.service-note)').evaluateAll(rows => rows.map(row => Object.fromEntries([...row.querySelectorAll('td[data-label]')].map(cell => [cell.dataset.label, cell.innerText.replace(/\s+/g, ' ').trim()]))));
      const byRoute = new Map();
      for (const row of rendered) {
        const route = row.Route || '';
        byRoute.set(route, [...(byRoute.get(route) ?? []), row]);
      }
      const duplicatePresentations = [...byRoute].flatMap(([route, rows]) => {
        const keys = rows.map(row => [row['Direction / main service pattern'], row['Principal locations'], row['Typical frequency']].join('|').toLowerCase().replace(/\s+/g, ' ').trim());
        return new Set(keys).size !== keys.length ? [route] : [];
      });
      assert.equal(duplicatePresentations.length, 0, `Normal planner shows visually duplicate rows for routes ${duplicatePresentations.join(', ')}.`);
      const unexplainedMultiRows = [...byRoute].filter(([, rows]) => rows.length > 2 && rows.some(row => !row['Direction / main service pattern'] || !row['Principal locations']));
      assert.equal(unexplainedMultiRows.length, 0, `Routes with more than two rows need visible direction and principal-branch labels: ${unexplainedMultiRows.map(([route]) => route).join(', ')}.`);
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('#exportBusWord').click();
      const download = await downloadPromise;
      const wordDirectory = reportArg ? path.join(path.dirname(path.resolve(reportArg)), 'word-exports') : os.tmpdir();
      await mkdir(wordDirectory, { recursive: true });
      const wordPath = path.join(wordDirectory, `atlas-s2e1-${control.id}.docx`);
      await download.saveAs(wordPath);
      const documentXml = zipEntry(await readFile(wordPath), 'word/document.xml');
      const exportedWordText = wordText(documentXml);
      outcome.status = await page.locator('#taskStatusMessage').innerText();
      outcome.renderedRows = rendered;
      outcome.routesWithMoreThanTwoRows = [...byRoute].filter(([, rows]) => rows.length > 2).map(([route, rows]) => ({ route, rows }));
      outcome.sourceColumn = { visibleOnTopMiddleBottom: true, samples: sourceSamples, overflow: scroll };
      outcome.technicalDetailsHidden = true;
      outcome.sourcesAndChecks = checksText;
      outcome.wordFilename = download.suggestedFilename();
      outcome.wordArtifact = wordPath;
      outcome.wordText = exportedWordText;
      if (control.id === 'pipers-lane') {
        const rows230 = rendered.filter(row => /^230$/i.test(row.Route || ''));
        assert.equal(rows230.length, 1, `Pipers normal UI must present one 230 principal row; got ${rows230.length}.`);
        assert.match(rows230[0]['Typical frequency'], /60\s*mins/i, 'Pipers rendered route 230 must match the hourly frozen BODS local-stop truth.');
        assert.doesNotMatch(rows230[0]['Typical frequency'], /5\s*mins/i, 'Pipers rendered route 230 must not show five-minute inflation.');
        assert.match(exportedWordText, /230.*60\s*mins/i, 'Generated Word export does not preserve the hourly route 230 frequency.');
      }
      if (control.id === 'waltham-cross') {
        assert.doesNotMatch(`${checksText} ${exportedWordText}`, /Planner review required for:\s*(?:217|279|317|327|491|N279)|timetable data unavailable\/incomplete for 1 assessed stop/i, 'Waltham output contains a known false review/incomplete warning.');
        assert.match(rendered.find(row => row.Route === '13')?.['Direction / main service pattern'] || '', /13|Two Brewers|Waltham/i, 'Waltham route 13 principal presentation is missing.');
      }
      if (control.id === 'chingford') assert.ok(rendered.some(row => row.Route === '657'), 'Chingford golden control lost route 657.');
      if (control.id === 'pe1') {
        const rows102 = rendered.filter(row => row.Route === '102');
        const keys102 = rows102.map(row => [row['Direction / main service pattern'], row['Principal locations'], row['Typical frequency']].join('|').toLowerCase().replace(/\s+/g, ' ').trim());
        assert.ok(rows102.length <= 2 && new Set(keys102).size === keys102.length, `PE1 route 102 has duplicate planner rows (${rows102.length} total, ${new Set(keys102).size} distinct).`);
        const rowsX4 = rendered.filter(row => row.Route === 'X4');
        assert.ok(rowsX4.length >= 2 && rowsX4.some(row => !/school|term/i.test(row['Operating period at stop'])) && rowsX4.some(row => /school|term/i.test(`${row['Typical frequency']} ${row['Operating period at stop']}`)), 'PE1 X4 does not visibly preserve both regular principal and school/term patterns.');
        assert.ok(rows102.every(row => row['Direction / main service pattern'] && row['Principal locations']), 'Remaining PE1 route 102 rows lack visible distinction labels.');
      }
      report.controls[control.id] = outcome;
    } catch (error) {
      outcome.outcome = 'FAIL';
      outcome.error = error.message;
      report.controls[control.id] = outcome;
      fail(control.id, error.message);
    }
  }
  assert.equal(errors.length, 0, `Browser console errors: ${errors.join('; ')}`);
  assert.equal(failedRequests.length, 0, `Failed browser requests: ${JSON.stringify(failedRequests)}`);
  assert.equal(failedResponses.length, 0, `HTTP failures: ${JSON.stringify(failedResponses)}`);
  assert.equal(externalRequests.length, 0, `Unexpected external requests: ${externalRequests.join(', ')}`);
} catch (error) {
  fail('audit-harness', error.message);
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
}

report.browserErrors = errors;
report.failedRequests = failedRequests;
report.failedResponses = failedResponses;
report.externalRequests = externalRequests;
report.statusManifestFallbacks = statusManifestFallbacks;
report.statusManifestNote = 'The Run #75 candidate and production checkout do not include the separately published status manifest; the localhost audit supplies 204 No Content, and the normal app reports status unavailable. This response is independent of Bus assessment data.';
report.readiness = report.failures.length ? 'NOT_READY_FOR_MANUAL_RE-ACCEPTANCE' : 'READY_FOR_TECHNICAL_DIRECTOR_REVIEW_BEFORE_MANUAL_RE-ACCEPTANCE';
if (reportArg) {
  const destination = path.resolve(reportArg);
  await mkdir(path.dirname(destination), { recursive: true });
  await (await import('node:fs/promises')).writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.failures.length) process.exitCode = 1;
