import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.ATLAS_REVIEW_ROOT || 'http://127.0.0.1:8769/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'ATLAS/2.0.0-alpha.13 browser live verification',
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
const pageErrors = [];
const failedRequests = [];
const sourceResponses = [];

page.on('pageerror', error => pageErrors.push(error.message));
page.on('requestfailed', request => {
  if (/nominatim\.openstreetmap\.org|api\.tfl\.gov\.uk|routing\.openstreetmap\.de/.test(request.url())) {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' });
  }
});
page.on('response', response => {
  if (/nominatim\.openstreetmap\.org|api\.tfl\.gov\.uk|routing\.openstreetmap\.de/.test(response.url())) {
    sourceResponses.push({ url: response.url(), status: response.status() });
  }
});

try {
  await page.goto(new URL('atlas/', root).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await page.getByRole('button', { name: 'Find site' }).click();
  await page.getByRole('button', { name: 'Use this result' }).waitFor({ timeout: 30000 });
  const candidate = await page.locator('.candidate p').first().innerText();
  assert.match(candidate, /^33, Westow Street/i, 'The exact property candidate was not returned.');
  await page.getByRole('button', { name: 'Use this result' }).click();
  await page.getByRole('button', { name: 'Confirm assessment point' }).click();
  await page.locator('#radius').fill('100');
  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 120000 });
  const evidenceRows = await page.locator('#evidenceRows tr').count();
  assert.ok(evidenceRows > 0, 'Live browser workflow returned no stop evidence.');
  assert.equal(await page.locator('#siteMap .bus-stop-marker').count(), evidenceRows);
  assert.equal(await page.locator('#evidenceRows a[href*="google.com/maps/search"]').count(), evidenceRows);
  assert.match(await page.locator('#resultSource').innerText(), /Transport for London.*(?:Department for Transport bus timetables|TfL scheduled timetable authority).*OpenStreetMap routing/);
  assert.match(await page.locator('#resultFreshness').innerText(), /^Assessment complete/);
  assert.ok(await page.locator('#serviceRows tr:not(.service-note)').count() > 0, 'No BODS service summary was produced.');
  assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join('; ')}`);
  assert.equal(failedRequests.length, 0, `Failed source requests: ${JSON.stringify(failedRequests)}`);
  assert.ok(sourceResponses.some(response => response.url.includes('nominatim.openstreetmap.org') && response.status === 200));
  assert.ok(sourceResponses.some(response => response.url.includes('api.tfl.gov.uk') && response.status === 200));
  if (process.env.ATLAS_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.ATLAS_SCREENSHOT_PATH, fullPage: true });
  }
  console.log(JSON.stringify({
    exactPropertyCandidate: candidate,
    evidenceRows,
    busStopMarkers: evidenceRows,
    googleMapsLinks: evidenceRows,
    firstRoutes: await page.locator('#evidenceRows tr').first().locator('td').nth(4).innerText(),
    serviceSummaries: await page.locator('#serviceRows tr:not(.service-note)').count(),
    sourceResponses: sourceResponses.map(response => ({ source: response.url.includes('nominatim') ? 'Nominatim' : response.url.includes('tfl') ? 'TfL' : 'OSRM', status: response.status })),
    failedRequests,
    pageErrors
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
