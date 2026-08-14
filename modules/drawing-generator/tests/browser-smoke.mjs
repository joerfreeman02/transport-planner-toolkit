import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.TPT_REVIEW_ROOT || 'http://127.0.0.1:8768/';
const browser = await chromium.launch({ headless: true, ...(process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
const errors = [];
const badLocalResponses = [];
const interceptedSourceRequests = [];
const interceptedSourceBodies = [];
const observedSourceRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !/tile|ERR_ABORTED/i.test(message.text())) errors.push(message.text()); });
page.on('request', request => { if (/api\/interpreter/.test(request.url())) observedSourceRequests.push(request.url()); });
page.on('response', response => {
  if (response.url().startsWith(root) && response.status() >= 400) badLocalResponses.push(`${response.status()} ${response.url()}`);
});

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/synthetic-overpass.json', import.meta.url)));
await page.route(/https:\/\/[^/]*overpass[^/]*\/api\/interpreter/, route => {
  interceptedSourceRequests.push(route.request().url());
  interceptedSourceBodies.push(route.request().postData() || '');
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
});
await page.addInitScript(() => localStorage.clear());

try {
  await page.goto(new URL('modules/drawing-generator/', root).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__DG0_ACCEPTANCE__));
  assert.match(await page.locator('.candidate-banner').innerText(), /LIVE REVIEW CANDIDATE - NOT ACCEPTED BASELINE/);
  assert.equal(await page.locator('#editingMap.leaflet-container').count(), 1);
  assert.equal(await page.locator('#advancedTools').evaluate(element => element.open), false);
  assert.deepEqual(await page.evaluate(() => { const snapshot = window.__DG0_ACCEPTANCE__.snapshot(); return [snapshot.drawingActive, snapshot.navigationEnabled, snapshot.advancedOpen]; }), [false, true, false]);
  await page.locator('#drawSite').click();
  assert.deepEqual(await page.evaluate(() => { const snapshot = window.__DG0_ACCEPTANCE__.snapshot(); return [snapshot.drawingActive, snapshot.navigationEnabled]; }), [true, false]);
  assert.equal(await page.locator('#cancelDrawing').isVisible(), true);
  await page.locator('#cancelDrawing').click();
  assert.deepEqual(await page.evaluate(() => { const snapshot = window.__DG0_ACCEPTANCE__.snapshot(); return [snapshot.drawingActive, snapshot.navigationEnabled]; }), [false, true]);
  assert.match(await page.locator('#siteStatus').innerText(), /navigation restored/i);

  await page.locator('#advancedTools > summary').click();
  assert.equal(await page.locator('#advancedTools').evaluate(element => element.open), true);
  assert.equal(await page.locator('[data-meta="scale"]').getAttribute('readonly'), null);
  await page.locator('[data-meta="scale"]').fill('1:4,000');
  assert.equal(await page.locator('#printDrawing').isDisabled(), true);
  assert.match(await page.locator('#drawingStatus').innerText(), /Print blocked/);
  await page.locator('[data-meta="scale"]').fill('1:50,000');
  assert.equal(await page.locator('#printDrawing').isEnabled(), true);
  await page.locator('.coordinate-entry > summary').click();
  await page.locator('#latitudeInput').fill('51.500000');
  await page.locator('#longitudeInput').fill('-0.100000');
  await page.locator('#useCoordinates').click();
  assert.match(await page.locator('#siteStatus').innerText(), /no polygon was inferred/i);
  assert.equal((await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot())).site, null);

  await page.locator('#drawSite').click();
  await page.locator('#siteFile').setInputFiles(fileURLToPath(new URL('./fixtures/synthetic-site.geojson', import.meta.url)));
  await page.waitForFunction(() => /accepted as explicit site geometry/i.test(document.querySelector('#siteStatus')?.textContent || ''));
  assert.deepEqual(await page.evaluate(() => { const snapshot = window.__DG0_ACCEPTANCE__.snapshot(); return [snapshot.drawingActive, snapshot.navigationEnabled]; }), [false, true]);
  await page.locator('[data-meta="client"]').fill('Synthetic Client');
  await page.locator('[data-meta="project"]').fill('Synthetic Review Project');
  await page.locator('[data-meta="projectNumber"]').fill('DG0-QA');
  await page.locator('[data-meta="drawnBy"]').fill('QA');

  await page.locator('#generateDrawing').click();
  try {
    await page.waitForFunction(() => /classified vector features loaded/i.test(document.querySelector('#sourceStatus')?.textContent || ''), null, { timeout: 45000 });
  } catch (error) {
    console.error(JSON.stringify({
      sourceStatus: await page.locator('#sourceStatus').innerText(),
      interceptedSourceRequests,
      observedSourceRequests,
      errors
    }, null, 2));
    throw error;
  }
  assert.ok(interceptedSourceRequests.length >= 1, 'Expected the Overpass request to use the intercepted fixture');
  assert.match(decodeURIComponent(interceptedSourceBodies[0]), /landuse/);
  assert.equal(await page.locator('#downloadSnapshot').isEnabled(), true);
  assert.ok((await page.locator('#sheetLegend .legend-row').count()) >= 7);
  assert.equal(await page.locator('#drawingSvg').getAttribute('data-contextual-basemap'), 'structured-osm-vector');
  assert.ok(Number(await page.locator('#drawingSvg').getAttribute('data-contextual-feature-count')) >= 3);

  await page.locator('#overlayFile').setInputFiles(fileURLToPath(new URL('./fixtures/synthetic-overlays.geojson', import.meta.url)));
  await page.waitForFunction(() => document.querySelectorAll('#overlayRows tr[data-overlay-id]').length === 2);
  const expected = {
    'regional-plan': { denominator: '50000', title: 'REGIONAL PLAN', number: 'EAS-SK-H-101', scale: '1:50,000' },
    'regional-routing': { denominator: '50000', title: 'REGIONAL ROUTING PLAN', number: 'EAS-SK-H-102', scale: '1:50,000' },
    'local-context': { denominator: '2500', title: 'LOCAL CONTEXT PLAN', number: 'EAS-SK-H-105', scale: '1:2,500' },
    'local-routing': { denominator: '2500', title: 'LOCAL ROUTING PLAN', number: 'EAS-SK-H-103', scale: '1:2,500' }
  };
  for (const [mode, details] of Object.entries(expected)) {
    await page.locator('#modeSelect').selectOption(mode);
    const overlayClasses = await page.locator('#overlayClass option').evaluateAll(options => options.map(option => option.value));
    if (mode === 'regional-plan') assert.ok(!overlayClasses.includes('route-to-site') && !overlayClasses.includes('community'));
    if (mode === 'regional-routing') assert.ok(overlayClasses.includes('route-to-site') && !overlayClasses.includes('community'));
    if (mode === 'local-context') assert.ok(overlayClasses.includes('community') && overlayClasses.includes('bus-route') && !overlayClasses.includes('route-to-site'));
    if (mode === 'local-routing') assert.ok(overlayClasses.includes('community') && overlayClasses.includes('route-to-site') && !overlayClasses.includes('bus-route'));
    if (mode !== 'regional-plan') {
      await page.locator('#loadSources').click();
      await page.waitForFunction(() => /classified vector features loaded/i.test(document.querySelector('#sourceStatus')?.textContent || ''));
    }
    const svg = page.locator('#drawingSvg');
    assert.equal(await svg.getAttribute('data-mode'), mode);
    assert.equal(await svg.getAttribute('data-scale'), details.denominator);
    assert.equal(await svg.locator('.scale-bar').getAttribute('data-paper-mm'), '20');
    assert.equal(await svg.locator('.north-arrow').count(), 1);
    assert.equal(await svg.getAttribute('data-contextual-basemap'), 'structured-osm-vector');
    assert.ok(Number(await svg.getAttribute('data-contextual-feature-count')) >= (mode.startsWith('regional-') ? 3 : 4));
    assert.equal(await page.locator('#drawingSheet .title-block').count(), 1);
    assert.match(await page.locator('#sheetAttribution').innerText(), /OpenStreetMap/);
    assert.equal(await page.locator('[data-sheet-meta="drawingTitle"]').first().innerText(), details.title);
    assert.equal(await page.locator('[data-sheet-meta="drawingNumber"]').first().innerText(), details.number);
    assert.equal(await page.locator('[data-sheet-meta="scale"]').first().innerText(), details.scale);
    const currentDate = await page.locator('[data-meta="date"]').inputValue();
    assert.match(currentDate, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.equal(await page.locator('[data-sheet-meta="date"]').first().innerText(), currentDate);
  }
  assert.equal(await page.getByRole('button', { name: 'Print / Save PDF' }).count(), 1);
  assert.deepEqual(badLocalResponses, []);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({ modes: Object.keys(expected), defaultNavigation: true, drawingCancellation: true, importRestoresNavigation: true, advancedDefaultCollapsed: true, siteImport: true, contextualBasemap: true, sourceSnapshot: true, overlayImport: 2, badLocalResponses, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
