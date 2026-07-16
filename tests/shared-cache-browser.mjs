import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.TPT_REVIEW_ROOT || 'http://127.0.0.1:8768/';
const browser = await chromium.launch({ headless: true });
const evidence = { cacheFallback: false, schemaRejected: false };
try {
  const cached = await browser.newContext();
  const page = await cached.newPage();
  await page.goto(new URL('modules/railway/index.html', root).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /LoadstateLoaded/i.test((document.querySelector('#sharedRailStatus')?.innerText || '').replace(/\s+/g, '')), null, { timeout: 20000 });
  await page.route('**/data/knowledge/*.json*', route => route.abort());
  await page.locator('#refreshShared').evaluate(button => button.click());
  await page.waitForFunction(() => /Cached master in use/i.test(document.querySelector('#sharedRailStatus')?.innerText || ''), null, { timeout: 20000 });
  evidence.cacheFallback = true;
  await cached.close();

  const rejected = await browser.newContext();
  const bad = await rejected.newPage();
  await bad.route('**/data/knowledge/*.json*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schema":"wrong","records":[]}' }));
  await bad.goto(new URL('modules/railway/index.html', root).href, { waitUntil: 'domcontentloaded' });
  await bad.waitForFunction(() => /LoadstateFailed/i.test((document.querySelector('#sharedRailStatus')?.innerText || '').replace(/\s+/g, '')), null, { timeout: 20000 });
  evidence.rejectionMessage = await bad.locator('#sharedPublishMessage').innerText();
  evidence.schemaRejected = /schema rejected|master failed to load/i.test(evidence.rejectionMessage);
  await rejected.close();
  assert.ok(evidence.cacheFallback);
  assert.ok(evidence.schemaRejected);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
