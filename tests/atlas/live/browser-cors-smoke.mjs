import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.ATLAS_REVIEW_ROOT || 'http://127.0.0.1:8769/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'ATLAS/2.0.0-alpha.2 browser live verification',
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
const pageErrors = [];
const failedRequests = [];
const sourceResponses = [];

page.on('pageerror', error => pageErrors.push(error.message));
page.on('requestfailed', request => {
  if (/nominatim\.openstreetmap\.org|api\.tfl\.gov\.uk/.test(request.url())) {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' });
  }
});
page.on('response', response => {
  if (/nominatim\.openstreetmap\.org|api\.tfl\.gov\.uk/.test(response.url())) {
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
  await page.getByRole('button', { name: 'Check nearby bus stops' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 30000 });
  const evidenceRows = await page.locator('#evidenceRows tr').count();
  assert.ok(evidenceRows > 0, 'Live browser workflow returned no stop evidence.');
  assert.equal(await page.locator('#resultSource').innerText(), 'Transport for London');
  assert.match(await page.locator('#resultFreshness').innerText(), /^Up to date — checked/);
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
    sourceResponses: sourceResponses.map(response => ({ source: response.url.includes('nominatim') ? 'Nominatim' : 'TfL', status: response.status })),
    failedRequests,
    pageErrors
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
