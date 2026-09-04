import assert from 'node:assert/strict';
import { launchAtlasBrowser } from './playwright-launch.mjs';

const calls = [];
const fakeBrowser = {};
const chromium = {
  async launch(options) {
    calls.push(options);
    if (!options.channel && !options.executablePath) throw new Error('bundled executable missing');
    if (options.channel === 'msedge') return fakeBrowser;
    throw new Error('not available');
  }
};

const result = await launchAtlasBrowser(chromium, { headless: true });
assert.equal(result, fakeBrowser);
assert.equal(calls[0].headless, true);
assert.equal(calls[1].channel, 'msedge');
console.log('PASS Alpha.5 browser launcher falls back from bundled Chromium to installed Edge channel.');
