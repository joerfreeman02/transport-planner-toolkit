import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startReviewServer } from '../../tools/atlas-review/review-server.mjs';
import { chooseFirstCandidateAndConfirm, mockAccessRouting, mockMapTiles, mockPreparedBusTimetables } from './browser-test-helpers.mjs';
import { launchAtlasBrowser } from './playwright-launch.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const rootDir = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const geocode = JSON.parse(fs.readFileSync(new URL('./fixtures/nominatim-candidate.json', import.meta.url), 'utf8'));
const stops = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-nearby-stops.json', import.meta.url), 'utf8'));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atlas-review-browser-'));
const review = await startReviewServer({ rootDir, preferredPort: 0, maximumPort: 0, stateFile: path.join(temporary, 'review-state.json'), openBrowser: false });
const browser = await launchAtlasBrowser(chromium, { headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
const failedLocalRequests = [];
const localResponses = [];
const screenshotDirectory = process.env.ATLAS_UI_QA_DIR || null;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
if (process.env.ATLAS_VISUAL_QA_DIR) await mkdir(process.env.ATLAS_VISUAL_QA_DIR, { recursive: true });
const capture = async (targetPage, name, fullPage = false) => {
  if (screenshotDirectory) await targetPage.screenshot({ path: path.join(screenshotDirectory, name), fullPage });
};

page.on('pageerror', error => pageErrors.push(error.message));
page.on('requestfailed', request => {
  if (request.url().startsWith(`http://127.0.0.1:${review.port}/`)) failedLocalRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' });
});
page.on('response', response => {
  if (response.url().startsWith(`http://127.0.0.1:${review.port}/`)) localResponses.push({ url: response.url(), status: response.status() });
});
await mockMapTiles(page);
await mockAccessRouting(page);
await mockPreparedBusTimetables(page);
await page.route('https://nominatim.openstreetmap.org/**', route => {
  const query = new URL(route.request().url()).searchParams.get('q');
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(query === '33, Westow Street, UK' ? geocode : []) });
});
await page.route('https://api.tfl.gov.uk/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(stops) }));

try {
  await page.goto(review.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(page.url(), review.url);
  assert.match(await page.locator('.build').innerText(), /ATLAS · Bus Beta/);
  assert.match(await page.locator('.build').innerText(), /Version details in About/);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--atlas-blue').trim()), '#002060');
  const shellColors = await page.evaluate(() => ({ header: getComputedStyle(document.querySelector('.app-header')).backgroundColor, footer: getComputedStyle(document.querySelector('footer')).backgroundColor }));
  assert.deepEqual(shellColors, { header: 'rgb(6, 29, 55)', footer: 'rgb(6, 29, 55)' }, 'application header and footer share exact #061D37 navy');
  for (const section of ['Modules', 'About']) {
    await page.getByRole('button', { name: section }).click();
    const heading = section === 'About' ? 'ATLAS — Automated Transport & Location Assessment System' : 'Choose an assessment tool';
    assert.equal(await page.getByRole('heading', { name: heading, exact: true }).isVisible(), true);
  }
  await page.getByRole('button', { name: 'Modules' }).click();
  await capture(page, 'home-modules.png', true);
  await page.getByRole('link', { name: /Start Bus Assessment/ }).click();
  await page.getByRole('heading', { name: 'Assess nearby bus access', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('heading', { name: 'Assess nearby bus access', exact: true }).isVisible(), true);
  assert.equal(await page.locator('#siteMap.leaflet-container').isVisible(), true);
  await capture(page, 'step1-find-location.png');
  await page.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await page.getByRole('button', { name: 'Find site' }).click();
  await page.getByRole('button', { name: 'Use this result' }).waitFor({ timeout: 10000 });
  await capture(page, 'step1-site-result.png');
  await page.getByRole('button', { name: 'Use this result' }).first().click();
  await page.locator('.assessment-point-marker').waitFor({ timeout: 5000 });
  const pointColor = await page.locator('.assessment-point-marker').evaluate(element => getComputedStyle(element, '::before').backgroundColor);
  assert.equal(pointColor, 'rgb(252, 115, 21)', 'the assessment point uses transport orange');
  const selectedLocationBounds = await page.locator('#selectedLocation').boundingBox();
  const locationContentBounds = await page.locator('#location-step-card .step-content').boundingBox();
  assert.ok(selectedLocationBounds && locationContentBounds && selectedLocationBounds.x + selectedLocationBounds.width <= locationContentBounds.x + locationContentBounds.width + 1, 'selected-site card remains within the content column');
  await capture(page, 'step2-confirm-point.png');
  await page.getByRole('button', { name: 'Confirm assessment point' }).click();
  assert.equal(await page.locator('#radius').inputValue(), '400');
  assert.equal(await page.locator('#siteMap svg').count(), 1);
  await page.locator('#assessmentSettingsPanel').waitFor({ state: 'visible' });
  await capture(page, 'step3-assessment-settings.png');
  const radiusView = await page.evaluate(() => {
    const map = window.__ATLAS_SITE_SELECTOR__?.getMap();
    const layer = Object.values(map?._layers ?? {}).find(candidate => typeof candidate?.setRadius === 'function' && typeof candidate.getBounds === 'function');
    if (!layer || !map) return null;
    const bounds = layer.getBounds();
    const northWest = map.latLngToContainerPoint(bounds.getNorthWest());
    const southEast = map.latLngToContainerPoint(bounds.getSouthEast());
    const size = map.getSize();
    return { exists: window.__ATLAS_BUS_UI__?.hasRadiusCircle(), color: layer.options.color, fillColor: layer.options.fillColor, fillOpacity: layer.options.fillOpacity, withinMap: northWest.x >= 0 && northWest.y >= 0 && southEast.x <= size.x && southEast.y <= size.y };
  });
  assert.equal(radiusView?.exists, true, 'the radius overlay is created when the confirmed point is set');
  assert.equal(radiusView?.color, '#154A8B', 'the selected map radius uses supporting blue before assessment');
  assert.equal(radiusView?.fillColor, '#154A8B');
  assert.equal(radiusView?.withinMap, true, 'the complete radius is framed within the map before assessment');
  await page.getByRole('button', { name: /Continue to Run assessment/ }).click();
  await capture(page, 'step4-run-assessment.png');
  const step4DesktopStageOverflow = await page.locator('#taskStatusStages li').evaluateAll(items => items.map(item => item.scrollWidth > item.clientWidth + 1));
  assert.equal(step4DesktopStageOverflow.some(Boolean), false, 'Step 4 progress labels fit the constrained desktop workflow column');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const step4NarrowStageOverflow = await page.locator('#taskStatusStages li').evaluateAll(items => items.map(item => item.scrollWidth > item.clientWidth + 1));
  assert.equal(step4NarrowStageOverflow.some(Boolean), false, 'Step 4 progress labels fit on a supported narrow screen');
  await capture(page, 'step4-run-assessment-narrow.png');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.equal(await page.locator('#evidenceRows tr').count(), 2);
  await page.waitForFunction(() => document.getElementById('taskStatus')?.getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#plannerReviewAcknowledgement').isChecked(), false, 'formal export acknowledgement belongs to Step 6');
  assert.equal(await page.locator('#siteStageSummary').isVisible(), true);
  assert.equal(await page.locator('.workflow-layout').isVisible(), true, 'Step 5 remains in the guided assessment workspace');
  assert.equal(await page.locator('#persistentMapPanel').isHidden(), true, 'the persistent map is carried into the Results workspace');
  assert.equal(await page.locator('#siteMapFrame').evaluate(element => element.parentElement.id), 'resultsMapHost');
  assert.match(await page.locator('#assessmentModeSummary').innerText(), /^Full Bus assessment · 400 m$/);
  assert.equal(await page.locator('#locationStageSummary').isVisible(), true);
  assert.equal(await page.locator('#assessmentStageSummary').isVisible(), true);
  assert.equal(await page.locator('[data-workflow-step="5"]').getAttribute('aria-current'), 'step');
  await capture(page, 'results-desktop.png');
  await page.locator('#sourceChecksDetails > summary').click();
  await capture(page, 'sources-checks-desktop.png', true);
  await page.locator('#sourceChecksDetails > summary').click();
  const desktopStageOverflow = await page.locator('#taskStatusStages li').evaluateAll(items => items.map(item => ({ label: item.textContent.trim(), overflow: item.scrollWidth > item.clientWidth + 1 })));
  assert.equal(desktopStageOverflow.some(item => item.overflow), false, 'desktop assessment stages stay within equal-width columns');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const narrowStageOverflow = await page.locator('#taskStatusStages li').evaluateAll(items => items.map(item => ({ label: item.textContent.trim(), overflow: item.scrollWidth > item.clientWidth + 1 })));
  assert.equal(narrowStageOverflow.some(item => item.overflow), false, 'narrow assessment stages stay on one row without overflow');
  await capture(page, 'results-narrow.png');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  await page.locator('#goToExport').click();
  assert.equal(await page.locator('#exportWorkspace').isVisible(), true, 'Step 6 remains a dedicated export state');
  assert.equal(await page.locator('#evidencePanel').isHidden(), true);
  assert.equal(await page.locator('#exportStatus').isHidden(), true, 'Step 6 does not show a stale pre-assessment warning after results are complete');
  await capture(page, 'step6-export.png');
  if (await page.locator('#plannerReviewGate').isVisible()) {
    await page.getByRole('button', { name: 'Back to Results' }).click();
    await page.locator('#sourceChecksDetails > summary').click();
    assert.notEqual((await page.locator('#plannerChecks').innerText()).trim(), '', 'review evidence remains available before formal export');
    await page.locator('#goToExport').click();
    await page.locator('#plannerReviewAcknowledgement').check();
  }
  await page.waitForFunction(() => !document.getElementById('exportBusWord')?.disabled);
  assert.equal(await page.locator('#exportBusWord').isDisabled(), false);
  const wordDownloadPromise = page.waitForEvent('download');
  await page.locator('#exportBusWord').click();
  const wordDownload = await wordDownloadPromise;
  assert.match(wordDownload.suggestedFilename(), /\.docx$/u, 'the formal Word export produces a DOCX download');
  const wordPath = await wordDownload.path();
  assert.ok(wordPath && fs.statSync(wordPath).size > 0, 'the Word export is non-empty');
  if (process.env.ATLAS_VISUAL_QA_DIR) await wordDownload.saveAs(path.join(process.env.ATLAS_VISUAL_QA_DIR, 'full-assessment.docx'));
  const normalMapDownloadPromise = page.waitForEvent('download');
  await page.locator('#exportAssessmentMap').click();
  const normalMapDownload = await normalMapDownloadPromise;
  assert.match(normalMapDownload.suggestedFilename(), /\.pdf$/u, 'a normal full assessment exports a standalone map');
  const normalMapPath = await normalMapDownload.path();
  assert.ok(normalMapPath, 'the full-assessment PDF download is available for rendering');
  if (process.env.ATLAS_VISUAL_QA_DIR) await normalMapDownload.saveAs(path.join(process.env.ATLAS_VISUAL_QA_DIR, 'normal-assessment-map.pdf'));
  await page.getByRole('button', { name: 'Back to Results' }).click();
  assert.equal(await page.locator('#evidencePanel').isVisible(), true);

  await page.getByRole('button', { name: 'Change assessment settings' }).click();
  assert.equal(await page.locator('#assessment-step-card').isVisible(), true);
  await page.locator('#radius').fill('500');
  await page.getByRole('button', { name: /Continue to Run assessment/ }).click();
  await page.locator('#stopStatus').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('#stopStatus').innerText(), 'The assessment radius changed. Build the Bus assessment again to update the evidence.');
  assert.equal(await page.locator('#evidencePanel').isHidden(), true);
  assert.equal(await page.locator('#evidenceRows tr').count(), 0);
  assert.equal(await page.locator('#exportBusWord').isDisabled(), true);
  assert.equal(await page.locator('#siteStageSummary').isVisible(), true, 'radius edits retain the confirmed assessment point');

  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.equal(await page.locator('#evidenceRows tr').count(), 2, 'a rebuilt assessment restores evidence after radius invalidation');
  assert.match(await page.locator('#assessmentModeSummary').innerText(), /^Full Bus assessment · 500 m$/);

  const expansionPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let expansionStopRequests = 0;
  expansionPage.on('pageerror', error => pageErrors.push(`expansion: ${error.message}`));
  expansionPage.on('requestfailed', request => {
    if (request.url().startsWith(`http://127.0.0.1:${review.port}/`)) failedLocalRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' });
  });
  await mockMapTiles(expansionPage);
  await mockAccessRouting(expansionPage);
  await mockPreparedBusTimetables(expansionPage);
  await expansionPage.route('https://nominatim.openstreetmap.org/**', route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(query === '33, Westow Street, UK' ? geocode : []) });
  });
  await expansionPage.route('https://api.tfl.gov.uk/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/StopPoint') {
      expansionStopRequests += 1;
      const radius = Number(url.searchParams.get('radius'));
      const body = radius >= 2000 ? stops : { ...stops, stopPoints: [{ ...stops.stopPoints[0], id: 'NO-SERVICE', naptanId: 'NO-SERVICE', lines: [{ id: '999', name: '999' }] }] };
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(stops) });
  });
  await expansionPage.goto(review.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await expansionPage.getByRole('button', { name: 'Modules' }).click();
  await expansionPage.getByRole('link', { name: /Start Bus Assessment/ }).click();
  await expansionPage.getByRole('heading', { name: 'Assess nearby bus access', exact: true }).waitFor({ state: 'visible' });
  await expansionPage.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await expansionPage.getByRole('button', { name: 'Find site' }).click();
  await chooseFirstCandidateAndConfirm(expansionPage);
  await expansionPage.getByRole('button', { name: /Continue to Run assessment/ }).click();
  await expansionPage.getByRole('button', { name: 'Find nearest bus stop(s)' }).click();
  await expansionPage.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.equal(expansionStopRequests, 1, 'nearest assessment retains the nearest group after unresolved timetable evidence instead of expanding to a farther group');
  assert.doesNotMatch(await expansionPage.locator('#diagnostics').textContent(), /2000/);
  assert.match(await expansionPage.locator('#assessmentModeSummary').innerText(), /^Nearest stop group ·/);
  await expansionPage.locator('#goToExport').click();
  assert.equal(await expansionPage.locator('#exportWorkspace').isVisible(), true, 'nearest assessments keep the dedicated export state');
  if (await expansionPage.locator('#plannerReviewGate').isVisible()) await expansionPage.locator('#plannerReviewAcknowledgement').check();
  const nearestMapDownloadPromise = expansionPage.waitForEvent('download');
  await expansionPage.locator('#exportAssessmentMap').click();
  const nearestMapDownload = await nearestMapDownloadPromise;
  assert.match(nearestMapDownload.suggestedFilename(), /\.pdf$/u, 'nearest assessment can export its standalone map PDF');
  const nearestMapPath = await nearestMapDownload.path();
  assert.ok(nearestMapPath, 'nearest PDF download is available for rendering');
  if (process.env.ATLAS_VISUAL_QA_DIR) {
    await nearestMapDownload.saveAs(path.join(process.env.ATLAS_VISUAL_QA_DIR, 'nearest-stop-group-map.pdf'));
  }
  await expansionPage.getByRole('button', { name: 'Back to Results' }).click();
  const initialView = await expansionPage.evaluate(() => window.__ATLAS_BUS_UI__?.getMapView?.());
  await expansionPage.locator('#siteMap .leaflet-control-zoom-in').click();
  const mapViewUpdate = await expansionPage.evaluate(() => {
    const view = window.__ATLAS_BUS_UI__?.getMapView?.();
    if (!view) return { view, updateType: typeof window.__ATLAS_BUS_UI__?.setMapViewForQa };
    const update = window.__ATLAS_BUS_UI__?.setMapViewForQa?.(view.center.latitude + 0.006, view.center.longitude + 0.006, view.zoom + 1);
    return { before: view, after: window.__ATLAS_BUS_UI__?.getMapView?.(), updateType: typeof window.__ATLAS_BUS_UI__?.setMapViewForQa, update: Boolean(update) };
  });
  const changedView = mapViewUpdate.after;
  assert.equal(mapViewUpdate.updateType, 'function', 'the browser exposes the QA map-view setter');
  assert.equal(mapViewUpdate.update, true, 'the map view changes through Leaflet');
  assert.ok(initialView && changedView && changedView.zoom > initialView.zoom, 'interactive zoom changes the visible map view');
  assert.notDeepEqual(changedView.center, initialView.center, 'interactive pan changes the visible map center');
  await expansionPage.locator('#goToExport').click();
  const repeatedMapPromise = expansionPage.waitForEvent('download');
  await expansionPage.locator('#exportAssessmentMap').click();
  const repeatedMapDownload = await repeatedMapPromise;
  const repeatedMapPath = await repeatedMapDownload.path();
  assert.ok(repeatedMapPath, 'the same selection can be exported after changing the interactive map view');
  const firstMapBytes = fs.readFileSync(nearestMapPath);
  const repeatedMapBytes = fs.readFileSync(repeatedMapPath);
  assert.ok(firstMapBytes.equals(repeatedMapBytes), 'the same selected assessment produces byte-identical map exports after pan and zoom');
  if (process.env.ATLAS_VISUAL_QA_DIR) await repeatedMapDownload.saveAs(path.join(process.env.ATLAS_VISUAL_QA_DIR, 'nearest-stop-group-map-after-pan-zoom.pdf'));
  await expansionPage.getByRole('button', { name: 'Back to Results' }).click();
  await expansionPage.getByRole('button', { name: 'Change assessment settings' }).click();
  await expansionPage.locator('#radius').fill('550');
  await expansionPage.getByRole('button', { name: /Continue to Run assessment/ }).click();
  assert.equal(await expansionPage.locator('#stopStatus').innerText(), 'The assessment radius changed. Build the Bus assessment again to update the evidence.');
  assert.equal(await expansionPage.locator('#evidencePanel').isHidden(), true);
  assert.equal(await expansionPage.locator('#exportBusWord').isDisabled(), true);
  await expansionPage.close();

  const densePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const denseStops = {
    ...stops,
    stopPoints: Array.from({ length: 22 }, (_value, index) => ({
      ...stops.stopPoints[0],
      id: `DENSE-${String(index).padStart(2, '0')}`,
      naptanId: `DENSE-${String(index).padStart(2, '0')}`,
      commonName: `Dense stop ${index + 1}`,
      lat: 51.41784 + Math.sin(index / 22 * Math.PI * 2) * 0.014,
      lon: -0.08217 + Math.cos(index / 22 * Math.PI * 2) * 0.014 / Math.cos(51.41784 * Math.PI / 180),
      lines: [{ id: '322', name: '322' }]
    }))
  };
  const denseStopIds = denseStops.stopPoints.map(stop => stop.id);
  const denseWeek = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, [360, 420, 480]]));
  let denseStopRequests = 0;
  densePage.on('pageerror', error => pageErrors.push(`dense: ${error.message}`));
  densePage.on('requestfailed', request => {
    if (request.url().startsWith(`http://127.0.0.1:${review.port}/`)) failedLocalRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' });
  });
  await densePage.addInitScript(() => localStorage.clear());
  await mockMapTiles(densePage);
  await mockAccessRouting(densePage);
  await mockPreparedBusTimetables(densePage, { serviceResolver: (_request, fixture) => ({
    ...fixture,
    services: fixture.services.map(service => ({
      ...service,
      stopSchedules: Object.fromEntries(denseStopIds.map(id => [id, denseWeek]))
    }))
  }) });
  await densePage.route('https://nominatim.openstreetmap.org/**', route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(query === '33, Westow Street, UK' ? geocode : []) });
  });
  await densePage.route('https://api.tfl.gov.uk/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/StopPoint') {
      denseStopRequests += 1;
      if (denseStopRequests > 2) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unexpected-second-discovery' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(denseStops) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(denseStops) });
  });
  await densePage.goto(review.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await densePage.getByRole('button', { name: 'Modules' }).click();
  await densePage.getByRole('link', { name: /Start Bus Assessment/ }).click();
  await densePage.getByRole('heading', { name: 'Assess nearby bus access', exact: true }).waitFor({ state: 'visible' });
  await densePage.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await densePage.getByRole('button', { name: 'Find site' }).click();
  await chooseFirstCandidateAndConfirm(densePage);
  await densePage.locator('#radius').fill('2000');
  await densePage.getByRole('button', { name: /Continue to Run assessment/ }).click();
  await densePage.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await densePage.waitForFunction(() => document.getElementById('taskStatus')?.getAttribute('aria-busy') === 'false', { timeout: 60000 });
  await densePage.locator('#assessmentModeSummary').waitFor({ state: 'visible', timeout: 20000 });
  assert.equal(denseStopRequests, 1, 'the geographically spread case reuses its single scoped stop discovery');
  await densePage.locator('#goToExport').click();
  if (await densePage.locator('#plannerReviewGate').isVisible()) await densePage.locator('#plannerReviewAcknowledgement').check();
  const spreadMapPromise = densePage.waitForEvent('download');
  await densePage.locator('#exportAssessmentMap').click();
  const spreadMapDownload = await spreadMapPromise;
  assert.match(spreadMapDownload.suggestedFilename(), /\.pdf$/u, 'a geographically spread full assessment exports its standalone map');
  if (process.env.ATLAS_VISUAL_QA_DIR) await spreadMapDownload.saveAs(path.join(process.env.ATLAS_VISUAL_QA_DIR, 'spread-stop-map.pdf'));
  await densePage.close();

  const requiredAssets = ['/atlas/', '/atlas/assets/css/atlas-shell.css', '/atlas/assets/js/app.mjs', '/atlas/data/bus/manifest.json', '/assets/vendor/leaflet/leaflet.css', '/assets/vendor/leaflet/leaflet.js', '/src/atlas/domain/site.mjs', '/src/atlas/application/site-selector.mjs'];
  for (const asset of requiredAssets) assert.ok(localResponses.some(response => new URL(response.url).pathname === asset && response.status === 200), asset);
  assert.equal(pageErrors.length, 0);
  assert.equal(failedLocalRequests.length, 0);
  console.log(JSON.stringify({
    reviewServerStarted: true,
    directAtlasRoute: new URL(review.url).pathname,
    cssAndLeafletLoaded: true,
    javascriptModulesLoaded: true,
    navigation: ['Modules', 'About'],
    siteSelectorAccessible: true,
    fixtureEvidenceRows: 2,
    wordExport: wordDownload.suggestedFilename(),
    mapExports: ['normal-assessment-map.pdf', 'nearest-stop-group-map.pdf', 'nearest-stop-group-map-after-pan-zoom.pdf', 'spread-stop-map.pdf'],
    pageErrors,
    failedLocalRequests
  }, null, 2));
} finally {
  await browser.close();
  await review.close();
  await review.closed;
  await rm(temporary, { recursive: true, force: true });
}
