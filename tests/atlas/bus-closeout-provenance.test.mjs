import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const harness = path.join(root, 'tools', 'atlas-review', 'bus-closeout-production-controls.mjs');
const temp = mkdtempSync(path.join(os.tmpdir(), 'atlas-bus-closeout-provenance-'));
try {
  const git = (...args) => execFileSync('git', ['-C', temp, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('config', 'user.email', 'atlas-tests@example.invalid');
  git('config', 'user.name', 'ATLAS tests');
  writeFileSync(path.join(temp, 'fixture.txt'), 'clean\n');
  git('add', 'fixture.txt');
  git('commit', '-q', '-m', 'fixture');
  const sha = git('rev-parse', 'HEAD').trim();
  const run = (extra = []) => {
    try { return execFileSync(process.execPath, [harness, '--code-root', temp, '--only', 'not-a-control', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { return `${error.stdout ?? ''}\n${error.stderr ?? ''}`; }
  };
  assert.match(run(['--expected-code-sha', sha]), /Unknown control/);
  writeFileSync(path.join(temp, 'dirty.txt'), 'dirty\n');
  assert.match(run(['--expected-code-sha', sha]), /clean Git worktree/);
  rmSync(path.join(temp, 'dirty.txt'));
  assert.match(run(['--expected-code-sha', '0'.repeat(40)]), /code SHA mismatch/);
  console.log('PASS BUS-CLOSEOUT clean-worktree provenance and expected-SHA fail-closed controls.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
