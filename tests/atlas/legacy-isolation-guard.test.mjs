import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertLegacyIsolation } from './legacy-isolation-guard.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-legacy-guard-'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (name, content) => {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const protectedPath = 'legacy.txt';
const outsidePath = 'atlas-only.txt';

try {
  git('init', '--quiet');
  git('config', 'user.email', 'atlas-tests@example.invalid');
  git('config', 'user.name', 'ATLAS tests');
  git('config', 'core.autocrlf', 'true');
  write(protectedPath, 'one\ntwo\n');
  write(outsidePath, 'ATLAS\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'baseline');
  const protectedObject = git('rev-parse', `HEAD:${protectedPath}`);
  const protectedObjects = { [protectedPath]: { type: 'blob', object: protectedObject } };

  assert.doesNotThrow(() => assertLegacyIsolation({ cwd: root, protectedObjects, baseline: 'fixture-baseline' }));

  write(protectedPath, 'committed change\n');
  git('add', protectedPath);
  git('commit', '--quiet', '-m', 'intentional protected change');
  assert.throws(
    () => assertLegacyIsolation({ cwd: root, protectedObjects, baseline: 'fixture-baseline' }),
    /differs from protected baseline/
  );
  git('reset', '--hard', '--quiet', 'HEAD~1');

  write(protectedPath, 'changed\n');
  assert.throws(
    () => assertLegacyIsolation({ cwd: root, protectedObjects, baseline: 'fixture-baseline' }),
    /working-tree paths have uncommitted changes/
  );
  write(protectedPath, 'one\ntwo\n');

  write(protectedPath, 'staged\n');
  git('add', protectedPath);
  assert.throws(
    () => assertLegacyIsolation({ cwd: root, protectedObjects, baseline: 'fixture-baseline' }),
    /working-tree paths have uncommitted changes/
  );
  git('restore', '--staged', protectedPath);
  write(protectedPath, 'one\ntwo\n');

  write(outsidePath, 'ATLAS-only change\n');
  assert.doesNotThrow(() => assertLegacyIsolation({ cwd: root, protectedObjects, baseline: 'fixture-baseline' }));

  // Canonical identity remains independent of line endings; a manually
  // changed CRLF working representation is still correctly detected.
  fs.writeFileSync(path.join(root, protectedPath), 'one\r\ntwo\r\n');
  assert.throws(
    () => assertLegacyIsolation({ cwd: root, protectedObjects, baseline: 'fixture-baseline' }),
    /working-tree paths have uncommitted changes/
  );

  console.log('PASS Legacy isolation guard — canonical identity, staged/unstaged protection, ATLAS-only change, and CRLF change detection.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
