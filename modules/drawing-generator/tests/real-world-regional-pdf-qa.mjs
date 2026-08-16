import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

assert.equal(process.env.DG0_ALLOW_LIVE_OSM_QA, '1', 'Set DG0_ALLOW_LIVE_OSM_QA=1 only for the single authorised live OSM viewport QA run.');

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.TPT_REVIEW_ROOT || 'http://127.0.0.1:8768/';
const output = path.resolve(process.env.DG0_PDF_OUTPUT || 'output/pdf');
const pdfPath = path.join(output, 'drawing-generator-regional-plan-DG0C3.1-real-world-Milton-Keynes-QA.pdf');
fs.mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ headless: true, ...(process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await context.newPage();
const liveTileUrls = [];
const sourceRequests = [];
const errors = [];
const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !/favicon|tile/i.test(message.text())) errors.push(message.text()); });
page.on('request', request => { if (/overpass.*\/api\/interpreter/.test(request.url())) sourceRequests.push(request.url()); });
await page.route(/https:\/\/tile\.openstreetmap\.org\/(\d+)\/\d+\/\d+\.png/, route => {
  const zoom = Number(new URL(route.request().url()).pathname.split('/')[1]);
  if (zoom === 13) {
    liveTileUrls.push(route.request().url());
    return route.continue();
  }
  return route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
});
await page.addInitScript(() => localStorage.clear());

try {
  await page.goto(new URL('modules/drawing-generator/', root).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__DG0_ACCEPTANCE__));
  const syntheticSite = { type: 'Polygon', coordinates: [[[-0.7608, 52.0401], [-0.7592, 52.0401], [-0.7592, 52.0411], [-0.7608, 52.0411], [-0.7608, 52.0401]]] };
  await page.evaluate(site => { window.__DG0_ACCEPTANCE__.setLocation(52.0406, -0.76, 'Milton Keynes, UK'); window.__DG0_ACCEPTANCE__.setSite(site); }, syntheticSite);
  await page.locator('#advancedTools > summary').click();
  const metadata = {
    client: 'EAS INTERNAL QA',
    architect: 'N/A',
    project: 'MILTON KEYNES LIVE OSM QA',
    projectNumber: 'DG0C3.1-LIVE-QA',
    designedBy: 'QA',
    drawnBy: 'QA',
    revision: 'C3.1',
    revisionDescription: 'Real OSM and synthetic-site alignment QA',
    drawingStatus: 'WORK IN PROGRESS'
  };
  for (const [name, value] of Object.entries(metadata)) await page.locator(`[data-meta="${name}"]`).fill(value);
  await page.locator('#generateDrawing').click();
  await page.waitForFunction(() => ['success', 'zero', 'failed'].includes(window.__DG0_ACCEPTANCE__.snapshot().source.status), null, { timeout: 120000 });
  await page.waitForFunction(() => ['success', 'failed'].includes(window.__DG0_ACCEPTANCE__.snapshot().basemap.status), null, { timeout: 120000 });
  const snapshot = await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot());
  assert.equal(snapshot.source.status, 'success', snapshot.source.error || 'Live Overpass source did not return classified real-world evidence.');
  assert.ok(snapshot.source.features.length > 0, 'Live Overpass source returned no classified real-world evidence.');
  assert.equal(snapshot.basemap.status, 'success', snapshot.basemap.error);
  assert.equal(snapshot.basemap.providerId, 'osm-standard');
  assert.deepEqual(snapshot.site, syntheticSite);
  assert.equal(snapshot.basemap.zoom, 13);
  assert.ok(snapshot.basemap.tileCount > 0 && snapshot.basemap.tileCount <= 80);
  assert.ok(liveTileUrls.length > 0 && new Set(liveTileUrls).size <= 80, `Live tile viewport issued ${new Set(liveTileUrls).size} unique tile URLs.`);
  assert.ok(sourceRequests.length >= 1, 'Expected one live source retrieval workflow.');
  assert.match(await page.locator('#sheetAttribution').innerText(), /OpenStreetMap contributors/);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: pdfPath, format: 'A3', landscape: true, printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pdfPath, location: 'Milton Keynes, UK', realSourceFeatures: snapshot.source.features.length, sourceProvider: snapshot.source.snapshot.provider, uniqueLiveOsmTiles: new Set(liveTileUrls).size, composedTileCount: snapshot.basemap.tileCount, zoom: snapshot.basemap.zoom }, null, 2));
} finally {
  await browser.close();
}
