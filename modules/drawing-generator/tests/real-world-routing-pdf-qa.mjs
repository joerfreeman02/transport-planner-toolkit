import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

assert.equal(process.env.DG0_ALLOW_LIVE_ROUTING_QA, '1', 'Set DG0_ALLOW_LIVE_ROUTING_QA=1 only for the authorised Milton Keynes live routing QA run.');

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.TPT_REVIEW_ROOT || 'http://127.0.0.1:8768/';
const output = path.resolve(process.env.DG0_PDF_OUTPUT || 'output/pdf');
const pdfPath = path.join(output, 'drawing-generator-regional-routing-DG0C3.2-real-world-Milton-Keynes-QA.pdf');
fs.mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ headless: true, ...(process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const routeRequests = [];
const tileRequests = [];
const errors = [];
const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !/favicon|tile/i.test(message.text())) errors.push(message.text()); });
page.on('request', request => {
  if (/routing\.openstreetmap\.de\/routed-car\/route\/v1\/driving/.test(request.url())) routeRequests.push(request.url());
});
await page.route(/https:\/\/tile\.openstreetmap\.org\/(\d+)\/\d+\/\d+\.png/, route => {
  const zoom = Number(new URL(route.request().url()).pathname.split('/')[1]);
  if (zoom === 13) { tileRequests.push(route.request().url()); return route.continue(); }
  return route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
});
await page.addInitScript(() => localStorage.clear());

const site = { type: 'Polygon', coordinates: [[[-0.7608, 52.0401], [-0.7592, 52.0401], [-0.7592, 52.0411], [-0.7608, 52.0411], [-0.7608, 52.0401]]] };
const routeToGuidance = { type: 'LineString', coordinates: [[-0.8190, 52.0348], [-0.7922, 52.0355], [-0.7763, 52.0390], [-0.7600, 52.0406]] };
const routeFromGuidanceReversed = { type: 'LineString', coordinates: [[-0.7045, 52.0400], [-0.7265, 52.0394], [-0.7440, 52.0402], [-0.7600, 52.0406]] };

try {
  await page.goto(new URL('modules/drawing-generator/', root).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__DG0_ACCEPTANCE__));
  await page.locator('#advancedTools > summary').click();
  await page.evaluate(({ site, routeToGuidance }) => {
    const api = window.__DG0_ACCEPTANCE__;
    api.setMode('regional-routing'); api.setLocation(52.0406, -0.76, 'Milton Keynes, UK'); api.setSite(site);
    api.setSource([], { provider: 'No thematic source required in routing mode', retrievedAt: new Date().toISOString() });
    return api.addRoughRoute(routeToGuidance, 'route-to-site');
  }, { site, routeToGuidance });
  await new Promise(resolve => setTimeout(resolve, 1200));
  await page.evaluate(routeFromGuidance => window.__DG0_ACCEPTANCE__.addRoughRoute(routeFromGuidance, 'route-from-site'), routeFromGuidanceReversed);
  const beforeApproval = await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot().overlays.filter(item => item.properties.class.startsWith('route-')));
  assert.equal(beforeApproval.length, 2);
  assert.ok(beforeApproval.every(item => item.properties.route.status === 'snapped-review'), JSON.stringify(beforeApproval.map(item => item.properties.route), null, 2));
  assert.ok(beforeApproval.every(item => item.properties.route.directionStatus === 'confirmed'));
  assert.equal(beforeApproval.find(item => item.properties.class === 'route-from-site').properties.route.reversedByNormalization, true);
  await page.locator('#approveSnappedRoutes').click();
  await page.evaluate(() => window.__DG0_ACCEPTANCE__.requestBasemap());
  await page.waitForFunction(() => window.__DG0_ACCEPTANCE__.snapshot().basemap.status === 'success', null, { timeout: 120000 });
  const snapshot = await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot());
  const routes = snapshot.overlays.filter(item => item.properties.class.startsWith('route-'));
  assert.ok(routes.every(item => item.properties.route.status === 'approved'));
  assert.equal(routeRequests.length, 2, 'Expected exactly two deliberate public routing requests.');
  assert.ok(new Set(tileRequests).size > 0 && new Set(tileRequests).size <= 80);
  assert.equal(await page.locator('#drawingSvg .route-direction-arrow').count() >= 4, true);
  assert.equal(await page.locator('#drawingSvg [class*="layer-main-road"], #drawingSvg [class*="layer-motorway"], #drawingSvg [class*="layer-cycle"], #drawingSvg [class*="layer-waterway"], #drawingSvg [class*="layer-railway"], #drawingSvg [class*="layer-station-"]').count(), 0);
  assert.equal(await page.locator('#drawingSheet .identity img').count(), 1);
  assert.match(await page.locator('#drawingSvg .osm-attribution').textContent(), /OpenStreetMap contributors/);
  assert.match(await page.locator('#sheetAttribution').innerText(), /OpenStreetMap road geometry via OSRM.*geometry assistance only/i);
  assert.equal(await page.locator('#printDrawing').isEnabled(), true);
  const metadata = {
    client: 'EAS INTERNAL QA', project: 'MILTON KEYNES LIVE ROUTING QA', projectNumber: 'DG0C3.2-ROUTE-QA',
    designedBy: 'QA', drawnBy: 'QA', revision: 'C3.2', revisionDescription: 'Real OSM and road-snapped route QA', drawingStatus: 'WORK IN PROGRESS'
  };
  for (const [name, value] of Object.entries(metadata)) await page.locator(`[data-meta="${name}"]`).fill(value);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: pdfPath, format: 'A3', landscape: true, printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ pdfPath, location: 'Milton Keynes, UK', publicRouteRequests: routeRequests.length, uniqueLiveOsmTiles: new Set(tileRequests).size, routeStates: routes.map(item => item.properties.route.status), reversedRouteFromSite: true }, null, 2));
} finally {
  await browser.close();
}
