import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chooseFirstCandidateAndConfirm, mockAccessRouting, mockMapTiles, mockPreparedBusTimetables } from './browser-test-helpers.mjs';
import { launchAtlasBrowser } from './playwright-launch.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.ATLAS_REVIEW_ROOT || 'http://127.0.0.1:8769/';
const geocode = JSON.parse(fs.readFileSync(new URL('./fixtures/nominatim-candidate.json', import.meta.url), 'utf8'));
const stops = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-nearby-stops.json', import.meta.url), 'utf8'));
const browser = await launchAtlasBrowser(chromium, { headless: true });
const page = await browser.newPage();
const errors = [];
let geocodeRequests = 0;
let tflRequests = 0;
page.on('pageerror', error => errors.push(error.message));
await mockMapTiles(page);
await mockAccessRouting(page);
await mockPreparedBusTimetables(page);
await page.route('https://nominatim.openstreetmap.org/**', route => {
  geocodeRequests += 1;
  const query = new URL(route.request().url()).searchParams.get('q');
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(query === '33, Westow Street, London' ? geocode : []) });
});
await page.route('https://api.tfl.gov.uk/**', route => {
  tflRequests += 1;
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(stops) });
});

try {
  await page.goto(new URL('atlas/', root).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.match(await page.locator('.build').innerText(), /2\.0\.0-alpha\.12/);
  await page.getByRole('button', { name: 'Report Builder' }).click();
  assert.equal(await page.getByRole('heading', { name: 'Report Builder', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: 'About' }).click();
  assert.equal(await page.getByRole('heading', { name: 'ATLAS — Automated Transport & Location Assessment System' }).isVisible(), true);
  assert.equal(await page.getByRole('heading', { name: 'Joe Freeman', exact: true }).isVisible(), true);
  assert.equal(await page.getByAltText('Portrait of Joe Freeman').isVisible(), true);
  await page.getByRole('button', { name: 'Modules' }).click();
  assert.equal(await page.locator('#siteMap.leaflet-container').isVisible(), true);
  await page.getByLabel('Site address or name').fill('33, Westow Street, London');
  await page.getByRole('button', { name: 'Find site' }).click();
  await page.getByRole('button', { name: 'Use this result' }).waitFor({ timeout: 5000 });
  assert.equal(await page.getByText('Possible match — not yet confirmed', { exact: true }).count(), 0);
  assert.equal(geocodeRequests, 1);
  assert.equal(await page.getByRole('button', { name: 'Build full Bus assessment' }).isDisabled(), true);
  await chooseFirstCandidateAndConfirm(page);
  assert.match(await page.locator('#confirmedSite').innerText(), /Confirmed from address/);
  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.equal(await page.locator('#evidenceRows tr').count(), 2);
  assert.equal(await page.locator('#siteMap .bus-stop-marker').count(), 2);
  assert.equal(await page.locator('#evidenceRows a[href*="google.com/maps/search"]').count(), 2);
  assert.match(await page.locator('#evidenceRows tr').first().innerText(), /322, 450/);
  assert.ok(await page.locator('#serviceRows tr:not(.service-note)').count() > 0);
  assert.match(await page.locator('#evidenceRows tr').first().innerText(), /m · \d+ mins?/);
  assert.ok(tflRequests > 0);
  const requestsAfterFirstAssessment = tflRequests;
  assert.match(await page.locator('#resultSource').innerText(), /Transport for London.*OpenStreetMap routing/);
  assert.match(await page.locator('#resultFreshness').innerText(), /Assessment complete/);
  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  assert.equal(tflRequests, requestsAfterFirstAssessment, 'A valid cache hit should not make another TfL request.');
  assert.equal(errors.length, 0);
  console.log(JSON.stringify({ versionVisible: true, navigation: true, aboutAndCreator: true, mapLoaded: true, explicitAssessmentPointConfirmation: true, geocodeRequests, tflRequests, evidenceRows: 2, busMarkers: 2, googleMapsLinks: 2, serviceSummary: true, routedWalkingAndCycling: true, plainEnglishStatus: true, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
