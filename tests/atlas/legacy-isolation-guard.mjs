import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export const LEGACY_BASELINE = '551b7cbf6646e72f21842bf77b93633373a9cac2';

// Canonical Git blob/tree identities obtained from LEGACY_BASELINE.
export const PROTECTED_LEGACY_OBJECTS = Object.freeze({
  'index.html': Object.freeze({ type: 'blob', object: 'd28c4226cac8db0de5fac0fb3992a8fe4ace275f' }),
  config: Object.freeze({ type: 'tree', object: 'f46e46855d1246be6d4b1f56a0af1d7cf5017f5c' }),
  'assets/js': Object.freeze({ type: 'tree', object: 'eda3713dff1513238f3387f17aabce55c3f6049e' }),
  'assets/css': Object.freeze({ type: 'tree', object: '9636cb4ef119262b905a9a6281c2a8b70a05890e' }),
  'data/knowledge': Object.freeze({ type: 'tree', object: '190302161e8f03a2ac9c6632741c17590435787e' }),
  'modules/accessibility': Object.freeze({ type: 'tree', object: 'ed282526e1558e49d5fc89985643a5fd1a73ff52' }),
  'modules/bus': Object.freeze({ type: 'tree', object: '1c2083e41ec96a0a6ed183fabb78ae0915dd6043' }),
  'modules/railway': Object.freeze({ type: 'tree', object: 'b59b7ebd0c5846ed2b695c4bd537bf9f6519903a' }),
  'modules/stats19': Object.freeze({ type: 'tree', object: 'c22ce50d549759934c78d23cde148a53322ac4ca' }),
  'modules/site-research': Object.freeze({ type: 'tree', object: 'a62812de4312c9e0aa1eb5649600523e0270e119' }),
  'modules/library-manager': Object.freeze({ type: 'tree', object: '6609907275d625591e806a1f16957ff2fc236cb1' }),
  'modules/drawing-generator': Object.freeze({ type: 'tree', object: 'b0ec7f0dce9bd3ec771c1e47a9c3ff7b49c4b221' })
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function assertLegacyIsolation({
  cwd = process.cwd(),
  currentRevision = 'HEAD',
  protectedObjects = PROTECTED_LEGACY_OBJECTS,
  baseline = LEGACY_BASELINE
} = {}) {
  for (const [target, expected] of Object.entries(protectedObjects)) {
    const spec = `${currentRevision}:${target}`;
    let actual;
    let actualType;
    try {
      actual = git(['rev-parse', '--verify', spec], cwd);
      actualType = git(['cat-file', '-t', spec], cwd);
    } catch (error) {
      throw new Error(`protected legacy path is missing from ${currentRevision}: ${target}`, { cause: error });
    }
    assert.equal(actualType, expected.type, `${target} changed Git object type from ${expected.type}.`);
    assert.equal(actual, expected.object, `${target} differs from protected baseline ${baseline}.`);
  }

  const status = git([
    'status', '--porcelain=v1', '--untracked-files=all', '--', ...Object.keys(protectedObjects)
  ], cwd);
  assert.equal(status, '', `protected legacy working-tree paths have uncommitted changes:\n${status}`);
  return true;
}
