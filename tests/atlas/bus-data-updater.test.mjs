import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { selectChangedRegions, transactionalUpdate } from '../../tools/atlas-bus-data/update-atlas-bus-data.mjs';

const remote = [
  { region: 'EA', name: 'TNDS-EA-v2.5.zip', size: 10, modifiedAt: '2026-09-04' },
  { region: 'SE', name: 'TNDS-SE-v2.5.zip', size: 20, modifiedAt: '2026-09-04' }
];
const unchanged = selectChangedRegions(remote, { EA: remote[0] });
assert.deepEqual(unchanged.map(item => item.region), ['SE']);
assert.deepEqual(selectChangedRegions([{ region: 'NW', name: 'nw.zip', size: 1 }], {}).map(item => item.region), ['NW']);

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-updater-test-'));
const calls = [];
try {
  await fs.writeFile(path.join(root, 'active-marker'), 'known-good');
  const result = await transactionalUpdate({
    root,
    remoteRegions: remote,
    downloadRegion: async (region, staging) => { calls.push(`download:${region.region}`); await fs.writeFile(path.join(staging, region.name), 'fixture'); },
    buildCandidate: async staging => { calls.push('build'); return staging; },
    validateCandidate: async candidate => { calls.push('validate'); assert.equal((await fs.readdir(candidate)).length, 2); },
    promoteCandidate: async candidate => { calls.push('promote'); const destination = path.join(root, 'active'); await fs.rename(candidate, destination); return null; }
  });
  assert.equal(result.changed, true);
  assert.deepEqual(calls, ['download:EA', 'download:SE', 'build', 'validate', 'promote']);
  await assert.rejects(() => transactionalUpdate({
    root,
    remoteRegions: [{ region: 'NW', name: 'nw.zip', size: 1 }],
    downloadRegion: async (_region, staging) => fs.writeFile(path.join(staging, 'nw.zip'), 'bad'),
    buildCandidate: async staging => staging,
    validateCandidate: async () => { throw new Error('invalid candidate'); },
    promoteCandidate: async () => { throw new Error('must not promote'); }
  }), /invalid candidate/);
  assert.equal(await fs.readFile(path.join(root, 'active-marker'), 'utf8'), 'known-good');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log('PASS Bus data updater - change detection, staging, validation and promotion are transactional.');
