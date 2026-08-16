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
const interceptedTileRequests = [];
const interceptedRouteRequests = [];
let expectedTileFailure = false;
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !/tile|ERR_ABORTED/i.test(message.text()) && !(expectedTileFailure && /status of 503/i.test(message.text()))) errors.push(message.text()); });
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
const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
await page.route(/https:\/\/(?:tile\.openstreetmap\.org|tiles\.test)\/\d+\/\d+\/\d+\.png/, route => {
  interceptedTileRequests.push(route.request().url());
  return route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
});
await page.route(/https:\/\/tiles-fail\.test\/\d+\/\d+\/\d+\.png/, route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'mock tile failure' }));
await page.route(/https:\/\/routing\.test\/route\/v1\/driving\/.+/, route => {
  interceptedRouteRequests.push(route.request().url());
  const coordinatePart = new URL(route.request().url()).pathname.split('/driving/')[1];
  const guidance = coordinatePart.split(';').map(value => value.split(',').map(Number));
  const coordinates = guidance.flatMap((coordinate, index) => index === guidance.length - 1 ? [coordinate] : [coordinate, [(coordinate[0] + guidance[index + 1][0]) / 2, (coordinate[1] + guidance[index + 1][1]) / 2]]);
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ distance: 900, duration: 120, geometry: { type: 'LineString', coordinates } }] }) });
});
await page.route(/https:\/\/routing-fail\.test\/route\/v1\/driving\/.+/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'NoRoute', message: 'mock route failure' }) }));
await page.addInitScript(() => localStorage.clear());

try {
  await page.goto(new URL('modules/drawing-generator/', root).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__DG0_ACCEPTANCE__));
  await page.evaluate(() => window.__DG0_ACCEPTANCE__.setBasemapProvider({ id: 'test-tiles', name: 'Mock OSM tiles', urlTemplate: 'https://tiles.test/{z}/{x}/{y}.png', attribution: 'Map data (c) OpenStreetMap contributors', tileSize: 256, minZoom: 0, maxZoom: 19, maxTilesPerView: 80 }));
  assert.match(await page.locator('.candidate-banner').innerText(), /WORK IN PROGRESS \/ LIVE REVIEW - NOT ACCEPTED BASELINE/);
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
  assert.equal(await page.locator('#printDrawing').isDisabled(), true);
  assert.match(await page.locator('#drawingStatus').innerText(), /Generate the drawing/);
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
  await page.waitForFunction(() => window.__DG0_ACCEPTANCE__.snapshot().basemap.status === 'success', null, { timeout: 45000 });
  assert.ok(interceptedSourceRequests.length >= 1, 'Expected the Overpass request to use the intercepted fixture');
  assert.doesNotMatch(decodeURIComponent(interceptedSourceBodies[0]), /landuse|natural|\["place"/);
  assert.ok(interceptedTileRequests.some(url => url.startsWith('https://tiles.test/')), 'Expected composed drawing tiles to use the mock provider');
  assert.equal(await page.locator('#downloadSnapshot').isEnabled(), true);
  assert.ok((await page.locator('#sheetLegend .legend-row').count()) >= 7);
  assert.equal(await page.locator('#drawingSvg').getAttribute('data-contextual-basemap'), 'rendered-osm-raster-tiles');
  assert.equal(await page.locator('#drawingSvg').getAttribute('data-basemap-provider'), 'test-tiles');
  assert.equal(await page.locator('#drawingSvg').getAttribute('data-basemap-status'), 'success');
  assert.ok(Number(await page.locator('#drawingSvg').getAttribute('data-basemap-tile-count')) > 0);
  assert.equal(await page.locator('#printDrawing').isEnabled(), true);

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
    assert.equal(await page.locator('#routingTools').isVisible(), mode.endsWith('-routing'));
    const overlayClasses = await page.locator('#overlayClass option').evaluateAll(options => options.map(option => option.value));
    if (mode === 'regional-plan') assert.ok(!overlayClasses.includes('route-to-site') && !overlayClasses.includes('community'));
    if (mode === 'regional-routing') assert.ok(overlayClasses.includes('route-to-site') && !overlayClasses.includes('community'));
    if (mode === 'local-context') assert.ok(overlayClasses.includes('community') && overlayClasses.includes('bus-route') && !overlayClasses.includes('route-to-site'));
    if (mode === 'local-routing') assert.ok(overlayClasses.includes('community') && overlayClasses.includes('route-to-site') && !overlayClasses.includes('bus-route'));
    if (mode !== 'regional-plan') {
      await page.locator('#loadSources').click();
      await page.waitForFunction(() => /classified vector features loaded/i.test(document.querySelector('#sourceStatus')?.textContent || ''));
      await page.waitForFunction(() => window.__DG0_ACCEPTANCE__.snapshot().basemap.status === 'success');
    }
    const svg = page.locator('#drawingSvg');
    assert.equal(await svg.getAttribute('data-mode'), mode);
    assert.equal(await svg.getAttribute('data-scale'), details.denominator);
    assert.equal(await svg.locator('.scale-bar').getAttribute('data-paper-mm'), '20');
    assert.equal(await svg.locator('.north-arrow').count(), 1);
    assert.equal(await svg.getAttribute('data-contextual-basemap'), 'rendered-osm-raster-tiles');
    assert.equal(await svg.getAttribute('data-basemap-status'), 'success');
    assert.equal(await svg.getAttribute('data-basemap-zoom'), mode.startsWith('regional-') ? '13' : '17');
    assert.ok(Number(await svg.getAttribute('data-basemap-tile-count')) <= 80);
    assert.equal(await page.locator('#drawingSheet .title-block').count(), 1);
    assert.match(await page.locator('#sheetAttribution').innerText(), /OpenStreetMap/);
    assert.equal(await page.locator('[data-sheet-meta="drawingTitle"]').first().innerText(), details.title);
    assert.equal(await page.locator('[data-sheet-meta="drawingNumber"]').first().innerText(), details.number);
    assert.equal(await page.locator('[data-sheet-meta="scale"]').first().innerText(), details.scale);
    const currentDate = await page.locator('[data-meta="date"]').inputValue();
    assert.match(currentDate, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.equal(await page.locator('[data-sheet-meta="date"]').first().innerText(), currentDate);
    if (mode.endsWith('-routing')) {
      await page.locator('#drawRouteTo').click();
      assert.deepEqual(await page.evaluate(() => { const snapshot = window.__DG0_ACCEPTANCE__.snapshot(); return [snapshot.drawingActive, snapshot.navigationEnabled]; }), [true, false]);
      assert.equal(await page.locator('#cancelRouteDrawing').isVisible(), true);
      await page.locator('#cancelRouteDrawing').click();
      assert.deepEqual(await page.evaluate(() => { const snapshot = window.__DG0_ACCEPTANCE__.snapshot(); return [snapshot.drawingActive, snapshot.navigationEnabled]; }), [false, true]);
    }
  }
  await page.evaluate(async () => {
    const api = window.__DG0_ACCEPTANCE__;
    api.setMode('regional-routing');
    api.clearOverlays();
    api.setRoadRoutingProvider({ id: 'mock-road-routing', name: 'Mock road geometry', endpoint: 'https://routing.test/route/v1/driving', attribution: 'Mock road geometry', reportIssueUrl: 'https://example.test/fix', maximumGuidanceDeviationMetres: 150 });
    await api.addRoughRoute({ type: 'LineString', coordinates: [[-.112, 51.504], [-.106, 51.502], [-.1005, 51.5001]] }, 'route-to-site');
    await api.addRoughRoute({ type: 'LineString', coordinates: [[-.112, 51.496], [-.106, 51.498], [-.1005, 51.5001]] }, 'route-from-site');
  });
  let routeSnapshot = await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot().overlays.filter(item => item.properties.class.startsWith('route-')));
  assert.equal(routeSnapshot.length, 2);
  assert.ok(routeSnapshot.every(item => item.properties.route.status === 'snapped-review' && item.properties.route.directionStatus === 'confirmed'));
  assert.deepEqual(routeSnapshot.find(item => item.properties.class === 'route-to-site').geometry.coordinates.at(-1), [-.1005, 51.5001]);
  assert.deepEqual(routeSnapshot.find(item => item.properties.class === 'route-from-site').geometry.coordinates[0], [-.1005, 51.5001]);
  assert.equal(routeSnapshot.find(item => item.properties.class === 'route-from-site').properties.route.reversedByNormalization, true);
  assert.equal(interceptedRouteRequests.length, 2);
  assert.equal(await page.locator('#drawingSvg .route-direction-arrow').count() > 0, true);
  assert.equal(await page.locator('#drawingSvg [class*="layer-main-road"], #drawingSvg [class*="layer-railway"], #drawingSvg [class*="layer-station-"]').count(), 0);
  await page.locator('#approveSnappedRoutes').click();
  routeSnapshot = await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot().overlays.filter(item => item.properties.class.startsWith('route-')));
  assert.ok(routeSnapshot.every(item => item.properties.route.status === 'approved'));
  const retainedGeometry = JSON.stringify(routeSnapshot.map(item => item.geometry));
  await page.locator('#modeSelect').selectOption('local-routing');
  assert.equal(JSON.stringify(await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot().overlays.filter(item => item.properties.class.startsWith('route-')).map(item => item.geometry))), retainedGeometry);
  await page.locator('#modeSelect').selectOption('regional-routing');
  assert.equal(JSON.stringify(await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot().overlays.filter(item => item.properties.class.startsWith('route-')).map(item => item.geometry))), retainedGeometry);
  await page.evaluate(() => { const api = window.__DG0_ACCEPTANCE__; api.setSite(api.snapshot().site); });
  const revalidatedRoutes = await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot().overlays.filter(item => item.properties.class.startsWith('route-')).map(item => item.properties.route));
  assert.ok(revalidatedRoutes.every(route => route.status === 'snapped-review' && route.directionStatus === 'confirmed'), JSON.stringify(revalidatedRoutes, null, 2));
  await page.locator('#approveSnappedRoutes').click();

  await page.evaluate(async () => {
    const api = window.__DG0_ACCEPTANCE__;
    api.clearOverlays();
    api.setRoadRoutingProvider({ id: 'mock-road-routing-failure', name: 'Mock failed road geometry', endpoint: 'https://routing-fail.test/route/v1/driving' });
    await api.addRoughRoute({ type: 'LineString', coordinates: [[-.112, 51.504], [-.106, 51.502], [-.1005, 51.5001]] }, 'route-to-site');
  });
  assert.match(await page.locator('#routeStatus').innerText(), /ROAD SNAP FAILED — ROUTE REQUIRES MANUAL REVIEW/);
  const failedRoute = await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot().overlays[0]);
  assert.deepEqual(failedRoute.geometry, failedRoute.properties.route.roughGeometry);
  await page.locator('#acceptManualFallback').click();
  assert.equal((await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot().overlays[0].properties.route.status)), 'manual-approved');
  const overlayCountBeforeFailure = (await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot())).overlays.length;
  expectedTileFailure = true;
  await page.evaluate(() => {
    const api = window.__DG0_ACCEPTANCE__;
    api.setBasemapProvider({ id: 'failed-test-tiles', name: 'Failed test tiles', urlTemplate: 'https://tiles-fail.test/{z}/{x}/{y}.png', attribution: 'Map data (c) OpenStreetMap contributors', tileSize: 256, minZoom: 0, maxZoom: 19, maxTilesPerView: 80 });
    api.requestBasemap();
  });
  await page.waitForFunction(() => window.__DG0_ACCEPTANCE__.snapshot().basemap.status === 'failed');
  assert.match(await page.locator('#basemapFailureWarning').textContent(), /BASEMAP FAILED TO LOAD - REVIEW REQUIRED/);
  assert.equal(await page.locator('#basemapFailureWarning').getAttribute('visibility'), 'visible');
  assert.equal(await page.locator('#printDrawing').isDisabled(), true);
  assert.equal((await page.evaluate(() => window.__DG0_ACCEPTANCE__.snapshot())).overlays.length, overlayCountBeforeFailure);
  assert.equal(await page.getByRole('button', { name: 'Print / Save PDF' }).count(), 1);
  assert.deepEqual(badLocalResponses, []);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({ modes: Object.keys(expected), defaultNavigation: true, drawingCancellation: true, routeCancellation: true, roadSnapMocked: interceptedRouteRequests.length, routeDirectionNormalised: true, routeModePersistence: true, manualFallback: true, importRestoresNavigation: true, advancedDefaultCollapsed: true, siteImport: true, renderedBasemap: true, mockedTiles: interceptedTileRequests.length, basemapFailureSafe: true, sourceSnapshot: true, overlayImport: 2, badLocalResponses, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
