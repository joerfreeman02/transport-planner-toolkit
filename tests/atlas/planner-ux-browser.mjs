import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chooseFirstCandidateAndConfirm, mockAccessRouting, mockMapTiles, mockPreparedBusTimetables } from './browser-test-helpers.mjs';

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
await mockAccessRouting(page);
await mockPreparedBusTimetables(page);
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
  assert.match(await page.locator('.build').innerText(), /2\.0\.0-alpha\.12/);
  for (const section of ['Report Builder', 'Modules', 'Projects', 'About']) {
    await page.getByRole('button', { name: section }).click();
    assert.equal(await page.getByRole('heading', { name: section === 'About' ? 'ATLAS — Automated Transport & Location Assessment System' : section, exact: true }).isVisible(), true);
  }
  assert.equal(await page.getByRole('heading', { name: 'Joe Freeman', exact: true }).isVisible(), true);
  assert.equal(await page.getByAltText('Portrait of Joe Freeman').isVisible(), true);

  await page.getByRole('button', { name: 'Modules' }).click();
  const desktopMap = await page.locator('#siteMap').boundingBox();
  assert.ok(desktopMap.width >= 650 && desktopMap.height >= 420, `Desktop map too small: ${JSON.stringify(desktopMap)}`);
  await page.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await page.getByRole('button', { name: 'Find site' }).click();
  await page.getByRole('button', { name: 'Use this result' }).waitFor({ timeout: 10000 });
  assert.match(await page.locator('.candidate p').first().innerText(), /^33, Westow Street/i);
  assert.equal(await page.getByText('Possible match — not yet confirmed', { exact: true }).count(), 0);
  assert.equal(geocodeRequests, 3);
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
  assert.match(await page.locator('#resultFreshness').innerText(), /^Assessment complete/);
  await page.getByText('Sources and checks', { exact: true }).click();
  assert.match(await page.locator('#plannerChecks').innerText(), /Stops:\s*Transport for London/);
  assert.match(await page.locator('#plannerChecks').innerText(), /Result:\s*Complete/);

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
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, 'atlas-site-selector-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await page.waitForFunction(() => /Complete - checked/.test(document.getElementById('stopStatus')?.textContent || ''), null, { timeout: 20000 });
  assert.equal(tflRequests, requestsAfterFirstAssessment, 'A repeated check should use still-current information without another source request.');
  assert.match(await page.locator('#stopStatus').innerText(), /Complete - checked/);
  assert.doesNotMatch(await page.locator('#stopStatus').innerText(), /cache/i);

  const failurePage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const failurePageErrors = [];
  failurePage.on('pageerror', error => failurePageErrors.push(error.message));
  await mockMapTiles(failurePage);
  await mockAccessRouting(failurePage);
  await mockPreparedBusTimetables(failurePage);
  await failurePage.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(geocode) }));
  await failurePage.route('https://api.tfl.gov.uk/**', route => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'rate limited' }) }));
  await failurePage.goto(new URL('atlas/', root).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await failurePage.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await failurePage.getByRole('button', { name: 'Find site' }).click();
  await chooseFirstCandidateAndConfirm(failurePage);
  await failurePage.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await failurePage.getByText('Bus information is temporarily unavailable. Please try again shortly.', { exact: true }).waitFor({ timeout: 10000 });
  assert.doesNotMatch(await failurePage.locator('body').innerText(), /HTTP 429/i);
  assert.equal(failurePageErrors.length, 0);
  await failurePage.close();

  const nonLondonPage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const nonLondonErrors = [];
  nonLondonPage.on('pageerror', error => nonLondonErrors.push(error.message));
  await mockMapTiles(nonLondonPage);
  await mockAccessRouting(nonLondonPage);
  await nonLondonPage.goto(new URL('atlas/', root).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await nonLondonPage.getByText('Enter coordinates instead', { exact: true }).click();
  await nonLondonPage.getByLabel('Latitude').fill('51.686');
  await nonLondonPage.getByLabel('Longitude').fill('-0.034');
  await nonLondonPage.getByRole('button', { name: 'Use these coordinates' }).click();
  await nonLondonPage.getByRole('button', { name: 'Confirm assessment point' }).click();
  await nonLondonPage.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await nonLondonPage.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.ok(await nonLondonPage.locator('#evidenceRows tr').count() > 0);
  assert.match(await nonLondonPage.locator('#resultSource').innerText(), /NaPTAN/);
  assert.ok(await nonLondonPage.locator('#serviceRows tr:not(.service-note)').count() > 0);
  assert.equal(nonLondonErrors.length, 0);
  await nonLondonPage.close();

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
    busStopMarkers: 2,
    googleMapsLinks: 2,
    serviceDiscovery: 'prepared DfT BODS timetables',
    routedWalkingAndCycling: true,
    sourcesAndChecks: true,
    repeatedCheckPlainEnglish: true,
    plainFailureMessage: true,
    nonLondonAssessmentWorks: true,
    prohibitedVisibleTerms: [],
    legacyToolkitOpened: true,
    pageErrors,
    consoleErrors,
    failedRequests
  }, null, 2));
} finally {
  await browser.close();
}
