import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.TPT_REVIEW_ROOT;
assert.ok(root, 'TPT_REVIEW_ROOT must identify the deployed toolkit root.');

const browser = await chromium.launch({ headless: true, ...(process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.TPT_PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const failures = [];
const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
page.on('pageerror', error => failures.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/tile|ERR_ABORTED|favicon/i.test(message.text())) failures.push(message.text());
});
await page.route(/https:\/\/[^/]*openstreetmap\.org\/.*\.png/, route => route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng }));

const surfaces = [
  ['Dashboard', ''],
  ['Accessibility', 'modules/accessibility/'],
  ['Railway', 'modules/railway/'],
  ['Bus', 'modules/bus/'],
  ['STATS19', 'modules/stats19/'],
  ['Library Manager', 'modules/library-manager/'],
  ['Site Research', 'modules/site-research/']
];

try {
  const generatorUrl = new URL('modules/drawing-generator/', root).href;
  const response = await page.goto(generatorUrl, { waitUntil: 'domcontentloaded' });
  assert.ok(response?.ok(), `Drawing Generator returned ${response?.status()}.`);
  assert.match(await page.locator('.candidate-banner').innerText(), /WORK IN PROGRESS \/ LIVE REVIEW - NOT ACCEPTED BASELINE/);
  assert.equal(await page.locator('#modeSelect option').count(), 4);
  assert.equal(await page.locator('#editingMap.leaflet-container').count(), 1);
  for (const mode of ['regional-plan', 'regional-routing', 'local-context', 'local-routing']) {
    await page.locator('#modeSelect').selectOption(mode);
    assert.equal(await page.locator('#drawingSvg').getAttribute('data-mode'), mode);
  }

  const checked = [];
  for (const [name, path] of surfaces) {
    const result = await page.goto(new URL(path, root).href, { waitUntil: 'domcontentloaded' });
    assert.ok(result?.ok(), `${name} returned ${result?.status()}.`);
    assert.ok((await page.locator('body').innerText()).trim().length > 100, `${name} rendered no usable content.`);
    checked.push(name);
  }
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ drawingGenerator: 'loaded', modes: 4, existingSurfaces: checked, pageErrors: failures }, null, 2));
} finally {
  await browser.close();
}
