import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvedBusUpdaterPath, startReviewServer, stopReviewServer } from '../../tools/atlas-review/review-server.mjs';

const rootDir = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const pinnedBusDataRoot = process.env.ATLAS_TEST_BUS_DATA_ROOT ? path.resolve(process.env.ATLAS_TEST_BUS_DATA_ROOT) : null;
const reviewV2DataRoot = pinnedBusDataRoot ? path.resolve(pinnedBusDataRoot, '..') : null;
let passed = 0;
const pass = name => { passed += 1; console.log(`PASS Review environment — ${name}`); };
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atlas-review-test-'));
const stateFile = path.join(temporary, 'review-state.json');
let review;
let updaterOpened = null;

try {
  review = await startReviewServer({ rootDir, preferredPort: 0, maximumPort: 0, stateFile, v2DataRoot: reviewV2DataRoot, openBrowser: false, updaterLauncher: root => { updaterOpened = root; } });
  assert.equal(review.reused, false);
  assert.match(review.url, reviewV2DataRoot
    ? /^http:\/\/127\.0\.0\.1:\d+\/atlas\/\?review=v2#modules$/
    : /^http:\/\/127\.0\.0\.1:\d+\/atlas\/#modules$/);
  assert.equal(existsSync(stateFile), true);
  assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).version, '2.0.0-beta.1');
  pass('starts on an available loopback address');

  const atlas = await fetch(review.url);
  assert.equal(atlas.status, 200);
  assert.match(atlas.headers.get('content-type'), /^text\/html/);
  const atlasHtml = await atlas.text();
  assert.match(atlasHtml, /ATLAS — Transport and Location Assessment/);
  assert.match(atlasHtml, /2\.0\.0-beta\.1/);
  assert.match(atlasHtml, /ATLAS-2\.0\.0-beta\.1-20261025/);
  const headerStart = atlasHtml.indexOf('<header');
  const headerEnd = atlasHtml.indexOf('</header>', headerStart);
  assert.notEqual(headerStart, -1);
  assert.notEqual(headerEnd, -1);
  assert.doesNotMatch(atlasHtml.slice(headerStart, headerEnd + '</header>'.length), /data-atlas-test-build|Development\/Test build/, 'developer build metadata stays out of the application header');
  const updateResponse = await fetch(new URL('/__atlas-review/update-bus-data', review.url), { method: 'POST' });
  assert.equal(updateResponse.status, 200);
  assert.equal(updaterOpened, rootDir);
  assert.equal(approvedBusUpdaterPath(rootDir), path.join(rootDir, 'tools', 'atlas-bus-data', 'UPDATE ATLAS BUS DATA.bat'));
  const legacy = await fetch(new URL('/', review.url));
  assert.equal(legacy.status, 200);
  assert.match(await legacy.text(), /Transport Planner Toolkit/);
  pass('serves the ATLAS route directly and keeps the legacy dashboard recoverable');

  const assets = [
    ['/atlas/assets/css/atlas-shell.css', /^text\/css/],
    ['/atlas/assets/js/app.mjs', /^application\/javascript/],
    [reviewV2DataRoot ? '/__atlas-review/v2-data/bus/manifest.json' : '/atlas/data/bus/manifest.json', /^application\/json/],
    ['/src/atlas/domain/site.mjs', /^application\/javascript/],
    ['/src/atlas/application/site-selector.mjs', /^application\/javascript/],
    ['/assets/vendor/leaflet/leaflet.css', /^text\/css/],
    ['/assets/vendor/leaflet/leaflet.js', /^application\/javascript/],
    ['/assets/css/eas-theme.css', /^text\/css/],
    ['/assets/images/eas-white.png', /^image\/png/]
  ];
  for (const [assetPath, type] of assets) {
    const response = await fetch(new URL(assetPath, review.url));
    assert.equal(response.status, 200, assetPath);
    assert.match(response.headers.get('content-type'), type, assetPath);
  }
  if (reviewV2DataRoot) {
    const pinnedManifestResponse = await fetch(new URL('/__atlas-review/v2-data/bus/manifest.json', review.url));
    assert.deepEqual(await pinnedManifestResponse.json(), JSON.parse(await readFile(path.join(pinnedBusDataRoot, 'manifest.json'), 'utf8')));
  }
  pass('serves required CSS, JavaScript modules and branding assets with correct types');

  const v2DataRoot = path.join(temporary, 'run75-data-root');
  await mkdir(path.join(v2DataRoot, 'bus'), { recursive: true });
  await mkdir(path.join(v2DataRoot, 'bus-tnds'), { recursive: true });
  await writeFile(path.join(v2DataRoot, 'bus', 'manifest.json'), '{"dataset":"Run75-Bus"}');
  await writeFile(path.join(v2DataRoot, 'bus-tnds', 'manifest.json'), '{"dataset":"Run75-TNDS"}');
  const v2State = path.join(temporary, 'v2-review-state.json');
  const v2Review = await startReviewServer({ rootDir, preferredPort: 0, maximumPort: 0, stateFile: v2State, v2DataRoot, openBrowser: false });
  const v2BusManifest = await fetch(new URL('/__atlas-review/v2-data/bus/manifest.json', v2Review.url));
  const v2TndsManifest = await fetch(new URL('/__atlas-review/v2-data/bus-tnds/manifest.json', v2Review.url));
  assert.equal(v2BusManifest.status, 200);
  assert.deepEqual(await v2BusManifest.json(), { dataset: 'Run75-Bus' });
  assert.equal(v2TndsManifest.status, 200);
  assert.deepEqual(await v2TndsManifest.json(), { dataset: 'Run75-TNDS' });
  assert.equal((await fetch(new URL('/__atlas-review/v2-data/atlas/data/bus/manifest.json', v2Review.url))).status, 404, 'Review-v2 mounts the data directory itself; it does not infer a checkout-relative atlas/data prefix.');
  await v2Review.close();
  await v2Review.closed;
  pass('mounts the v2 data directory at /bus and /bus-tnds exactly');

  assert.equal((await fetch(new URL('/unknown-review-page', review.url))).status, 404);
  assert.equal((await fetch(new URL('/.git/config', review.url))).status, 404);
  assert.equal((await fetch(new URL('/tests/atlas/run-all.mjs', review.url))).status, 404);
  pass('returns a controlled not-found response and does not expose repository internals');

  const repeated = await startReviewServer({ rootDir, preferredPort: 0, maximumPort: 0, stateFile, openBrowser: false });
  assert.equal(repeated.reused, true);
  assert.equal(repeated.port, review.port);
  pass('reuses an already-running review server without creating another process');

  const collision = createNetServer();
  await new Promise((resolve, reject) => { collision.once('error', reject); collision.listen(0, '127.0.0.1', resolve); });
  const occupiedPort = collision.address().port;
  const collisionState = path.join(temporary, 'collision-state.json');
  const secondReview = await startReviewServer({ rootDir, preferredPort: occupiedPort, maximumPort: occupiedPort + 10, stateFile: collisionState, openBrowser: false });
  assert.notEqual(secondReview.port, occupiedPort);
  assert.equal(collision.listening, true);
  await secondReview.close();
  await secondReview.closed;
  assert.equal(collision.listening, true, 'The unrelated listener must not be stopped.');
  await new Promise(resolve => collision.close(resolve));
  pass('selects another address when occupied and leaves the unrelated process untouched');

  const stopped = await stopReviewServer({ rootDir, stateFile });
  assert.equal(stopped.stopped, true);
  await review.closed;
  assert.equal(existsSync(stateFile), false);
  await assert.rejects(fetch(review.url));
  review = null;
  pass('stops cleanly and removes its review state');
} finally {
  if (review) { await review.close(); await review.closed; }
  await rm(temporary, { recursive: true, force: true });
}

console.log(`${passed} review-environment tests passed.`);

