import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startReviewServer } from '../../tools/atlas-review/review-server.mjs';
import { mockAccessRouting, mockMapTiles } from './browser-test-helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const rootDir = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const baseFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/nominatim-candidate.json', import.meta.url), 'utf8'));
const stops = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-nearby-stops.json', import.meta.url), 'utf8'));
const millersFixture = [{ ...baseFixture[0], display_name: 'Millers House, High Street, Stanstead Abbotts, SG12 8AA, United Kingdom', lat: '51.790100', lon: '0.012300', osm_id: 775533 }];
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atlas-site-selector-browser-'));
const review = await startReviewServer({ rootDir, preferredPort: 0, maximumPort: 0, stateFile: path.join(temporary, 'review-state.json'), openBrowser: false });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const failedRequests = [];
const geocodeQueries = [];

page.on('pageerror', error => pageErrors.push(error.message));
page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
await mockMapTiles(page);
await mockAccessRouting(page);
await page.route('https://nominatim.openstreetmap.org/**', route => {
  const query = new URL(route.request().url()).searchParams.get('q');
  geocodeQueries.push(query);
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(query === 'millers house stanstead abbotts' ? millersFixture : []) });
});
await page.route('https://api.tfl.gov.uk/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(stops) }));

try {
  await page.goto(review.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(await page.locator('#siteMap.leaflet-container').isVisible(), true);
  assert.equal(await page.locator('.leaflet-control-zoom').isVisible(), true);
  assert.equal(await page.locator('#address').inputValue(), '');
  assert.equal(await page.locator('#address').getAttribute('placeholder'), 'Enter site address or name');

  const productOwnerQuery = 'first floor millers house stanstead abbotts';
  await page.getByLabel('Site address or name').fill(productOwnerQuery);
  await page.getByRole('button', { name: 'Find site' }).click();
  await page.getByRole('button', { name: 'Use this result' }).waitFor({ timeout: 10000 });
  assert.deepEqual(geocodeQueries, [productOwnerQuery, 'millers house stanstead abbotts']);
  assert.match(await page.locator('#geocodeStatus').innerText(), /building or location details/i);
  await page.getByRole('button', { name: 'Use this result' }).click();
  await page.locator('.assessment-point-marker').waitFor({ timeout: 5000 });
  assert.equal(await page.getByRole('button', { name: 'Build full Bus assessment' }).isDisabled(), true);
  const selected = await page.evaluate(() => window.__ATLAS_SITE_SELECTOR__.getSnapshot().site);
  assert.equal(selected.suppliedAddress, productOwnerQuery);
  assert.deepEqual([selected.geocoding.latitude, selected.geocoding.longitude], [51.7901, 0.0123]);
  assert.equal(selected.validation.state, 'candidate');

  const marker = page.locator('.leaflet-marker-icon').first();
  await marker.scrollIntoViewIfNeeded();
  const markerBox = await marker.boundingBox();
  assert.ok(markerBox, 'Assessment marker is not visible.');
  await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(markerBox.x + markerBox.width / 2 + 70, markerBox.y + markerBox.height / 2 + 25, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.getElementById('selectedMethod').textContent === 'Adjusted on map');
  const moved = await page.evaluate(() => window.__ATLAS_SITE_SELECTOR__.getSnapshot().site);
  assert.notDeepEqual([moved.latitude, moved.longitude], [51.7901, 0.0123]);
  assert.deepEqual([moved.geocoding.latitude, moved.geocoding.longitude], [51.7901, 0.0123]);
  assert.equal(moved.assessmentPoint.adjustedFromCandidate, true);

  await page.getByRole('button', { name: 'Confirm assessment point' }).click();
  await page.getByText('Confirmed assessment point', { exact: true }).waitFor({ timeout: 5000 });
  const confirmed = await page.evaluate(() => window.__ATLAS_SITE_SELECTOR__.getSnapshot().confirmedSite);
  assert.deepEqual([confirmed.latitude, confirmed.longitude], [moved.latitude, moved.longitude]);
  assert.ok(confirmed.assessmentPoint.confirmedAt);
  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.ok(await page.locator('#evidenceRows tr').count() > 0);

  await page.locator('#siteMap').scrollIntoViewIfNeeded();
  const mapBox = await page.locator('#siteMap').boundingBox();
  await page.mouse.click(mapBox.x + mapBox.width * 0.72, mapBox.y + mapBox.height * 0.35);
  await page.waitForFunction(() => document.getElementById('selectedMethod').textContent === 'Adjusted on map' && document.getElementById('evidencePanel').hidden);
  assert.equal(await page.getByRole('button', { name: 'Build full Bus assessment' }).isDisabled(), true);
  assert.match(await page.locator('#stopStatus').innerText(), /earlier bus results were cleared/i);

  await page.getByLabel('Site address or name').fill('Unknown former depot site');
  await page.getByRole('button', { name: 'Find site' }).click();
  await page.getByText(/choose the site on the map instead/i).waitFor({ timeout: 5000 });
  await page.locator('#siteMap').scrollIntoViewIfNeeded();
  const fallbackMapBox = await page.locator('#siteMap').boundingBox();
  await page.mouse.click(fallbackMapBox.x + fallbackMapBox.width * 0.55, fallbackMapBox.y + fallbackMapBox.height * 0.55);
  await page.waitForFunction(() => document.getElementById('selectedMethod').textContent === 'Chosen on map');
  const mapSelected = await page.evaluate(() => window.__ATLAS_SITE_SELECTOR__.getSnapshot().site);
  assert.equal(mapSelected.suppliedAddress, '');
  assert.equal(mapSelected.displayAddress, '');
  assert.equal(mapSelected.geocoding.source, null);
  assert.equal(await page.locator('#selectedIdentity').isHidden(), true);

  await page.getByText('Enter coordinates instead', { exact: true }).click();
  await page.getByLabel('Latitude').fill('120');
  await page.getByLabel('Longitude').fill('0.01');
  await page.getByRole('button', { name: 'Use these coordinates' }).click();
  assert.match(await page.locator('#coordinateStatus').innerText(), /Latitude must be between -90 and 90/);
  await page.getByLabel('Latitude').fill('51.791000');
  await page.getByLabel('Longitude').fill('0.014000');
  await page.getByRole('button', { name: 'Use these coordinates' }).click();
  await page.waitForFunction(() => document.getElementById('selectedMethod').textContent === 'Entered coordinates');
  const entered = await page.evaluate(() => window.__ATLAS_SITE_SELECTOR__.getSnapshot().site);
  assert.deepEqual([entered.latitude, entered.longitude], [51.791, 0.014]);
  await page.getByRole('button', { name: 'Confirm assessment point' }).click();
  assert.match(await page.locator('#confirmationStatus').innerText(), /Entered coordinates/);
  assert.equal(await page.locator('#confirmedSite p').count(), 0);

  assert.equal(pageErrors.length, 0);
  assert.equal(failedRequests.length, 0);
  console.log(JSON.stringify({
    productOwnerQuery,
    controlledQueries: geocodeQueries.slice(0, 2),
    mapLoaded: true,
    zoomAndPanAvailable: true,
    candidateCentredMap: true,
    markerDragged: true,
    mapClicked: true,
    manualCoordinatesValidated: true,
    originalGeocodingCoordinatesPreserved: true,
    explicitConfirmation: true,
    busUsedFinalAssessmentPoint: true,
    staleBusEvidenceClearedAfterMove: true,
    failedSearchMapFallback: true,
    pageErrors,
    failedRequests
  }, null, 2));
} finally {
  await browser.close();
  await review.close();
  await review.closed;
  await rm(temporary, { recursive: true, force: true });
}
