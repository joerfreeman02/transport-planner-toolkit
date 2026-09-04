import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startReviewServer } from '../../tools/atlas-review/review-server.mjs';

const rootDir = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atlas-bus-browser-gates-'));
const review = await startReviewServer({
  rootDir,
  preferredPort: 0,
  maximumPort: 0,
  stateFile: path.join(temporary, 'review-state.json'),
  openBrowser: false
});
const root = `http://127.0.0.1:${review.port}/`;

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: rootDir,
      env: { ...process.env, ATLAS_REVIEW_ROOT: root },
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

try {
  for (const script of [
    'tests/atlas/atlas-browser-smoke.mjs',
    'tests/atlas/planner-ux-browser.mjs',
    'tests/atlas/live/browser-cors-smoke.mjs'
  ]) {
    console.log(`\nBROWSER GATE: ${script}`);
    await run(script);
  }
  console.log('\nPASS: ATLAS BUS browser gates completed.');
} finally {
  await review.close();
  await review.closed;
  await rm(temporary, { recursive: true, force: true });
}
