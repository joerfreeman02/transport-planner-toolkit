import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chooseFirstCandidateAndConfirm, mockMapTiles } from './browser-test-helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.ATLAS_REVIEW_ROOT || 'http://127.0.0.1:8769/';
const geocode = JSON.parse(fs.readFileSync(new URL('./fixtures/nominatim-candidate.json', import.meta.url), 'utf8'));
const stops = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-nearby-stops.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
let geocodeRequests = 0;
let tflRequests = 0;
page.on('pageerror', error => errors.push(error.message));
await mockMapTiles(page);
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
  assert.match(await page.locator('.build').innerText(), /2\.0\.0-alpha\.2/);
  await page.getByRole('button', { name: 'Report Builder' }).click();
  assert.equal(await page.getByRole('heading', { name: 'Report Builder', exact: true }).isVisible(), true);
  await page.getByRole('button', { name: 'About' }).click();
  assert.equal(await page.getByRole('heading', { name: 'ATLAS — Automated Transport & Location Assessment System' }).isVisible(), true);
  assert.equal(await page.getByRole('heading', { name: 'Joe Freeman', exact: true }).isVisible(), true);
  assert.equal(await page.getByAltText('Portrait of Joe Freeman').isVisible(), true);
  await page.getByRole('button', { name: 'Modules' }).click();
  assert.equal(await page.locator('#siteMap.leaflet-container').isVisible(), true);
  await page.getByRole('button', { name: 'Find site' }).click();
  await page.getByRole('button', { name: 'Use this result' }).waitFor({ timeout: 5000 });
  assert.equal(await page.getByText('Possible match — not yet confirmed', { exact: true }).count(), 0);
  assert.equal(geocodeRequests, 3);
  assert.equal(await page.getByRole('button', { name: 'Check nearby bus stops' }).isDisabled(), true);
  await chooseFirstCandidateAndConfirm(page);
  assert.match(await page.locator('#confirmedSite').innerText(), /Confirmed from address/);
  await page.getByRole('button', { name: 'Check nearby bus stops' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 5000 });
  assert.equal(await page.locator('#evidenceRows tr').count(), 2);
  assert.equal(tflRequests, 1);
  assert.equal(await page.locator('#resultSource').innerText(), 'Transport for London');
  assert.match(await page.locator('#resultFreshness').innerText(), /Up to date — checked/);
  await page.getByRole('button', { name: 'Check nearby bus stops' }).click();
  assert.equal(tflRequests, 1, 'A valid cache hit should not make another TfL request.');
  assert.equal(errors.length, 0);
  console.log(JSON.stringify({ versionVisible: true, navigation: true, aboutAndCreator: true, mapLoaded: true, explicitAssessmentPointConfirmation: true, geocodeRequests, tflRequests, evidenceRows: 2, plainEnglishFreshness: true, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
