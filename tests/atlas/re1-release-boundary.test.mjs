import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertApprovedLiveDataIdentity, assertReviewedFileScope, dataPublicationIdentity, verifyIbusFixture } from '../../tools/atlas-release/release-boundary.mjs';

const fixture = new URL('./fixtures/run75-ibus-20261009/', import.meta.url);
const reviewed = JSON.parse(await fs.readFile(new URL('../../tools/atlas-release/reviewed-beta2-files.json', import.meta.url), 'utf8'));
const pair = await verifyIbusFixture(fixture, {
  manifestSha256: '3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53',
  indexSha256: '39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de'
});
assert.equal(pair.manifest.baseVersion, '20261009');
assert.equal(pair.index.serviceLines[0].serviceLineNo, '313');

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-ibus-mixed-'));
try {
  await fs.writeFile(path.join(temp, 'manifest.json'), JSON.stringify({ schema: 'tfl-ibus-operator-index-manifest-v1', baseVersion: '20261009', indexPath: 'index.json', indexSha256: '39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de', validFrom: '2026-10-08T00:00:00', validTo: '2026-11-05T00:00:00' }));
  await fs.writeFile(path.join(temp, 'index.json'), JSON.stringify({ baseVersion: '20261009', validFrom: '2026-10-08T00:00:00', validTo: '2026-11-05T00:00:00' }));
  await assert.rejects(verifyIbusFixture(temp), /manifest\/index raw-byte identity mismatch/);
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}

assertReviewedFileScope(['.github/workflows/atlas-app-only-release.yml', 'tools/atlas-release/release-identity.mjs'], reviewed);
assert.throws(() => assertReviewedFileScope(['README.md'], reviewed), /unreviewed files/);
assert.throws(() => assertReviewedFileScope(['.github/workflows/unrelated.yml'], { ...reviewed, acceptedBaseSha: 'wrong' }), /manifest identity mismatch/);

const makeData = version => dataPublicationIdentity({
  dataSources: { schema: 'atlas-data-sources-v2', publicationVersion: version, datasets: { bus: { baseUrl: `https://example.test/${version}/bus/` } } },
  dataStatus: { generatedAt: version }, busManifestSha256: `bus-${version}`, tndsManifestSha256: [`tnds-${version}`], ibusManifestSha256: `ibus-manifest-${version}`, ibusIndexSha256: `ibus-index-${version}`
});
const oldLive = makeData('approved-2026-10');
const laterApproved = makeData('approved-2026-11');
const canonicalHash = value => createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');
assert.notDeepEqual(oldLive, laterApproved, 'a legitimate later data publication has a distinct identity');
assert.equal(assertApprovedLiveDataIdentity(laterApproved, canonicalHash(laterApproved)), canonicalHash(laterApproved));
assert.throws(() => assertApprovedLiveDataIdentity(laterApproved, canonicalHash(oldLive)), /does not match/);
assert.throws(() => assertApprovedLiveDataIdentity(laterApproved, ''), /explicit approved/);

console.log('RE-1 release boundary tests passed: coherent frozen iBus, exact path scope, and independent approved live-data identities.');
