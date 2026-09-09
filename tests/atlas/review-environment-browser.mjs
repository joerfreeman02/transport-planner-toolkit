import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
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
  assert.match(await page.locator('.build').innerText(), /2\.0\.0-alpha\.12/);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--atlas-blue').trim()), '#002060');
  for (const section of ['Report Builder', 'Modules', 'Projects', 'About']) {
    await page.getByRole('button', { name: section }).click();
    const heading = section === 'About' ? 'ATLAS — Automated Transport & Location Assessment System' : section;
    assert.equal(await page.getByRole('heading', { name: heading, exact: true }).isVisible(), true);
  }
  await page.getByRole('button', { name: 'Modules' }).click();
  assert.equal(await page.getByRole('heading', { name: 'Establish the assessment point', exact: true }).isVisible(), true);
  assert.equal(await page.locator('#siteMap.leaflet-container').isVisible(), true);
  await page.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await page.getByRole('button', { name: 'Find site' }).click();
  await chooseFirstCandidateAndConfirm(page);
  assert.equal(await page.locator('#radius').inputValue(), '400');
  assert.equal(await page.locator('#siteMap svg').count(), 1);
  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.equal(await page.locator('#evidenceRows tr').count(), 2);
  assert.equal(await page.locator('#exportBusWord').isDisabled(), false);
  assert.equal(await page.locator('#confirmedSite').isVisible(), true);

  await page.locator('#radius').fill('500');
  await page.locator('#stopStatus').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('#stopStatus').innerText(), 'The assessment radius changed. Build the Bus assessment again to update the evidence.');
  assert.equal(await page.locator('#evidencePanel').isHidden(), true);
  assert.equal(await page.locator('#evidenceRows tr').count(), 0);
  assert.equal(await page.locator('#exportBusWord').isDisabled(), true);
  assert.equal(await page.locator('#confirmedSite').isVisible(), true, 'radius edits retain the confirmed assessment point');

  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.equal(await page.locator('#evidenceRows tr').count(), 2, 'a rebuilt assessment restores evidence after radius invalidation');
  assert.equal(await page.locator('#exportBusWord').isDisabled(), false);

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
  await expansionPage.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await expansionPage.getByRole('button', { name: 'Find site' }).click();
  await chooseFirstCandidateAndConfirm(expansionPage);
  await expansionPage.getByRole('button', { name: 'Find nearest bus stop(s)' }).click();
  await expansionPage.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.ok(expansionStopRequests >= 2, 'nearest assessment retries stop discovery after automatic radius expansion');
  assert.match(await expansionPage.locator('#diagnostics').textContent(), /2000/);
  await expansionPage.locator('#radius').fill('550');
  assert.equal(await expansionPage.locator('#stopStatus').innerText(), 'The assessment radius changed. Build the Bus assessment again to update the evidence.');
  assert.equal(await expansionPage.locator('#evidencePanel').isHidden(), true);
  assert.equal(await expansionPage.locator('#exportBusWord').isDisabled(), true);
  await expansionPage.close();

  const requiredAssets = ['/atlas/', '/atlas/assets/css/atlas-shell.css', '/atlas/assets/js/app.mjs', '/atlas/data/bus/manifest.json', '/assets/vendor/leaflet/leaflet.css', '/assets/vendor/leaflet/leaflet.js', '/src/atlas/domain/site.mjs', '/src/atlas/application/site-selector.mjs'];
  for (const asset of requiredAssets) assert.ok(localResponses.some(response => new URL(response.url).pathname === asset && response.status === 200), asset);
  assert.equal(pageErrors.length, 0);
  assert.equal(failedLocalRequests.length, 0);
  console.log(JSON.stringify({
    reviewServerStarted: true,
    directAtlasRoute: new URL(review.url).pathname,
    cssAndLeafletLoaded: true,
    javascriptModulesLoaded: true,
    navigation: ['Report Builder', 'Modules', 'Projects', 'About'],
    siteSelectorAccessible: true,
    fixtureEvidenceRows: 2,
    pageErrors,
    failedLocalRequests
  }, null, 2));
} finally {
  await browser.close();
  await review.close();
  await review.closed;
  await rm(temporary, { recursive: true, force: true });
}
