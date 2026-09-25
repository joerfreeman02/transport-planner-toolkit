import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startReviewServer } from '../../tools/atlas-review/review-server.mjs';

const rootDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atlas-v2-review-'));
const dataRoot = path.join(temporary, 'data');
await mkdir(path.join(dataRoot, 'bus'), { recursive: true });
await writeFile(path.join(dataRoot, 'bus', 'manifest.json'), JSON.stringify({ schema: 'atlas-prepared-bus-data-v2', review: true }));
const review = await startReviewServer({ rootDir, v2DataRoot: dataRoot, preferredPort: 0, maximumPort: 0, stateFile: path.join(temporary, 'state.json'), openBrowser: false });
try {
  const base = `http://127.0.0.1:${review.port}`;
  const v2 = await fetch(`${base}/__atlas-review/v2-data/bus/manifest.json`);
  assert.equal(v2.status, 200);
  assert.equal((await v2.json()).schema, 'atlas-prepared-bus-data-v2');
  const traversal = await fetch(`${base}/__atlas-review/v2-data/%2e%2e/index.html`);
  assert.equal(traversal.status, 404);
  const defaultConfig = await readFile(new URL('../../atlas/config/atlas-data-sources.json', import.meta.url), 'utf8');
  assert.match(defaultConfig, /"nptg": null/);
  const app = await readFile(new URL('../../atlas/assets/js/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /searchParams\.get\('review'\) === 'v2'/);
  assert.match(review.url, /review=v2/);
} finally {
  await review.close();
  await rm(temporary, { recursive: true, force: true });
}
console.log('PASS V2 review runtime - isolated data route, traversal guard, V1 default and explicit V2 selection are deterministic.');
