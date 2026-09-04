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
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atlas-alpha5-browser-'));
const review = await startReviewServer({ rootDir, preferredPort: 0, maximumPort: 0, stateFile: path.join(temporary, 'review-state.json'), openBrowser: false });
const browser = await launchAtlasBrowser(chromium, { headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
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
  assert.match(await page.locator('.build').innerText(), /2\.0\.0-alpha\.5/);
  assert.equal(await page.getByText('Created by Joe Freeman · EAS FORGE', { exact: true }).isVisible(), true);

  await page.getByLabel('Site address or name').fill('33 Westow Street, Crystal Palace');
  await page.getByRole('button', { name: 'Find site' }).click();
  await chooseFirstCandidateAndConfirm(page);

  assert.equal(await page.getByRole('button', { name: 'Find nearest bus stop(s)' }).isDisabled(), false);
  await page.getByRole('button', { name: 'Find nearest bus stop(s)' }).click();
  await page.locator('#evidenceRows tr').first().waitFor({ timeout: 20000 });
  assert.equal(await page.locator('#evidenceRows tr').count(), 1, 'Nearest mode should retain only the nearest logical CommonName group in this fixture.');
  assert.match(await page.locator('#evidenceSummary').innerText(), /Nearest stop group:/);

  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.getByRole('button', { name: 'Export Word (.docx)' }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.docx$/i);

  await page.getByRole('button', { name: 'Build full Bus assessment' }).click();
  await page.locator('#evidenceRows tr').nth(1).waitFor({ timeout: 20000 });
  assert.equal(await page.locator('#evidenceRows tr').count(), 2);
  assert.equal(errors.length, 0, `Page errors: ${errors.join('; ')}`);

  console.log(JSON.stringify({
    alpha5Visible: true,
    creatorCreditVisible: true,
    nearestModeStopRows: 1,
    fullModeStopRows: 2,
    wordExportDownload: download.suggestedFilename(),
    browserLaunch: 'supported Chromium browser',
    pageErrors: errors
  }, null, 2));
} finally {
  await browser.close();
  await review.close();
  await review.closed;
  await rm(temporary, { recursive: true, force: true });
}
