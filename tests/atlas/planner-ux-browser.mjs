import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chooseFirstCandidateAndConfirm, mockMapTiles } from './browser-test-helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.ATLAS_REVIEW_ROOT || 'http://127.0.0.1:8769/';
const geocode = JSON.parse(fs.readFileSync(new URL('./fixtures/nominatim-candidate.json', import.meta.url), 'utf8'));
const stops = JSON.parse(fs.readFileSync(new URL('./fixtures/tfl-nearby-stops.json', import.meta.url), 'utf8'));
const screenshotDir = process.env.ATLAS_UX_SCREENSHOT_DIR || '';
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
let geocodeRequests = 0;
let tflRequests = 0;

page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
await mockMapTiles(page);
await page.route('https://nominatim.openstreetmap.org/**', route => {
  geocodeRequests += 1;
  const query = new URL(route.request().url()).searchParams.get('q');
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(query === '33, Westow Street, UK' ? geocode : []) });
});
await page.route('https://api.tfl.gov.uk/**', route => {
  tflRequests += 1;
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(stops) });
});

try {
  await page.goto(new URL('atlas/', root).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.match(await page.locator('.build').innerText(), /2\.0\.0-alpha\.2/);
  for (const section of ['Report Builder', 'Modules', 'Projects', 'About']) {
    await page.getByRole('button', { name: section }).click();
    assert.equal(await page.getByRole('heading', { name: section === 'About' ? 'About ATLAS' : section, exact: true }).isVisible(), true);
  }
  assert.equal(await page.getByRole('heading', { name: 'Created by Joe Freeman' }).isVisible(), true);

  await page.getByRole('button', { name: 'Modules' }).click();
  const desktopMap = await page.locator('#siteMap').boundingBox();
  assert.ok(desktopMap.width >= 650 && desktopMap.height >= 420, `Desktop map too small: ${JSON.stringify(desktopMap)}`);
  await page.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await page.getByRole('button', { name: 'Find site' }).click();
  await page.getByRole('button', { name: 'Use this result' }).waitFor({ timeout: 10000 });
  assert.match(await page.locator('.candidate p').first().innerText(), /^33, Westow Street/i);
  assert.equal(geocodeRequests, 3);
  assert.equal(await page.getByRole('button', { name: 'Check nearby bus stops' }).isDisabled(), true);
  await chooseFirstCandidateAndConfirm(page);
  assert.match(await page.locator('#confirmedSite').innerText(), /Confirmed from address/);

  await page.getByRole('button', { name: 'Check nearby bus stops' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator('#evidenceRows tr').count(), 2);
  assert.equal(tflRequests, 1);
  assert.equal(await page.locator('#resultSource').innerText(), 'Transport for London');
  assert.match(await page.locator('#resultFreshness').innerText(), /^Up to date — checked/);
  await page.getByText('Sources and checks', { exact: true }).click();
  assert.match(await page.locator('#plannerChecks').innerText(), /Source:\s*Transport for London/);
  assert.match(await page.locator('#plannerChecks').innerText(), /Status:\s*Up to date/);

  const prohibited = /\b(?:HTTP|API|endpoint|TTL|JSON|schema|adapter|cache hit|payload|CORS|geocoder|query relaxation)\b/i;
  assert.doesNotMatch(await page.locator('body').innerText(), prohibited, 'Normal planner view exposed software terminology.');
  assert.equal(await page.locator('.technical-details').last().getByText('View technical details', { exact: true }).isVisible(), true);
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, 'atlas-site-selector-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 1024, height: 768 });
  const laptopMap = await page.locator('#siteMap').boundingBox();
  assert.ok(laptopMap.width >= 500 && laptopMap.height >= 390, `Laptop map too small: ${JSON.stringify(laptopMap)}`);
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, 'atlas-site-selector-laptop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'Mobile page has horizontal document overflow.');
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'Check nearby bus stops' }).click();
  assert.equal(tflRequests, 1, 'A repeated check should use still-current information without another source request.');
  assert.match(await page.locator('#stopStatus').innerText(), /Up to date — checked/);
  assert.doesNotMatch(await page.locator('#stopStatus').innerText(), /cache/i);

  const failurePage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const failurePageErrors = [];
  failurePage.on('pageerror', error => failurePageErrors.push(error.message));
  await mockMapTiles(failurePage);
  await failurePage.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(geocode) }));
  await failurePage.route('https://api.tfl.gov.uk/**', route => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'rate limited' }) }));
  await failurePage.goto(new URL('atlas/', root).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await failurePage.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await failurePage.getByRole('button', { name: 'Find site' }).click();
  await chooseFirstCandidateAndConfirm(failurePage);
  await failurePage.getByRole('button', { name: 'Check nearby bus stops' }).click();
  await failurePage.getByText('Bus information is temporarily unavailable. Please try again shortly.', { exact: true }).waitFor({ timeout: 10000 });
  assert.doesNotMatch(await failurePage.locator('body').innerText(), /HTTP 429/i);
  assert.equal(failurePageErrors.length, 0);
  await failurePage.close();

  const legacyHref = await page.getByRole('link', { name: 'Open legacy Toolkit' }).getAttribute('href');
  assert.equal(new URL(legacyHref, page.url()).href, root);
  await page.goto(root, { waitUntil: 'domcontentloaded' });
  assert.match(await page.title(), /Transport Planner Toolkit/);

  assert.equal(pageErrors.length, 0);
  assert.equal(consoleErrors.length, 0);
  assert.equal(failedRequests.length, 0);
  console.log(JSON.stringify({
    productAndVersionIdentified: true,
    navigation: ['Report Builder', 'Modules', 'Projects', 'About'],
    creatorAttribution: 'Joe Freeman',
    siteSearchObvious: true,
    mapComfortableAtDesktopAndLaptop: true,
    explicitAssessmentPointConfirmation: true,
    evidenceRows: 2,
    sourcesAndChecks: true,
    repeatedCheckPlainEnglish: true,
    plainFailureMessage: true,
    prohibitedVisibleTerms: [],
    legacyToolkitOpened: true,
    pageErrors,
    consoleErrors,
    failedRequests
  }, null, 2));
} finally {
  await browser.close();
}
