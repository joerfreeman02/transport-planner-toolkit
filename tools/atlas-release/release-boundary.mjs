import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const BASE_SHA = '8f1d8ae50405ec4acf38dd66d6c8f60896a5649e';

export async function verifyIbusFixture(root, expected = {}) {
  const fixtureRoot = root instanceof URL ? fileURLToPath(root) : root;
  const manifestBytes = await fs.readFile(path.join(fixtureRoot, 'manifest.json'));
  const manifestSha256 = sha256(manifestBytes);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (expected.manifestSha256 && manifestSha256 !== expected.manifestSha256) throw new Error('iBus fixture manifest raw-byte SHA-256 mismatch.');
  if (!manifest.indexPath || path.isAbsolute(manifest.indexPath) || manifest.indexPath.split(/[\\/]/).includes('..')) throw new Error('iBus fixture manifest index path is unsafe.');
  const indexBytes = await fs.readFile(path.join(fixtureRoot, manifest.indexPath));
  const indexSha256 = sha256(indexBytes);
  const index = JSON.parse(indexBytes.toString('utf8'));
  if (manifest.indexSha256 !== indexSha256) throw new Error('iBus fixture manifest/index raw-byte identity mismatch.');
  if (expected.indexSha256 && indexSha256 !== expected.indexSha256) throw new Error('iBus fixture index raw-byte SHA-256 mismatch.');
  for (const key of ['baseVersion', 'validFrom', 'validTo']) {
    if (manifest[key] !== index[key]) throw new Error(`iBus fixture manifest/index ${key} mismatch.`);
  }
  return { manifest, index, manifestSha256, indexSha256 };
}

export function assertReviewedFileScope(files, manifest, expectedBaseSha = BASE_SHA) {
  if (manifest?.schema !== 'atlas-reviewed-application-files-v1' || manifest.acceptedBaseSha !== expectedBaseSha) throw new Error('Reviewed application-file manifest identity mismatch.');
  const reviewed = manifest.reviewedPaths;
  if (!Array.isArray(reviewed) || !reviewed.length || new Set(reviewed).size !== reviewed.length) throw new Error('Reviewed application-file manifest must contain unique exact paths.');
  for (const required of ['.github/workflows/atlas-app-only-release.yml', '.github/workflows/atlas-beta2-release-validation.yml', 'tools/atlas-release/release-identity.mjs', 'docs/adr/ADR-017-atlas-app-and-data-release-boundary.md']) {
    if (!reviewed.includes(required)) throw new Error(`Reviewed application-file manifest omits required path ${required}.`);
  }
  const unreviewed = [...new Set(files)].filter(file => !reviewed.includes(file));
  if (unreviewed.length) throw new Error(`Application candidate changes unreviewed files: ${unreviewed.join(', ')}`);
  return true;
}

export function dataPublicationIdentity({ dataSources, dataStatus, busManifestSha256, tndsManifestSha256, ibusManifestSha256, ibusIndexSha256 }) {
  const jsonHash = value => sha256(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
  if (!dataSources?.publicationVersion || !dataStatus || !busManifestSha256 || !tndsManifestSha256?.length || !ibusManifestSha256 || !ibusIndexSha256) throw new Error('Approved live-data identity is incomplete.');
  return {
    publicationVersion: dataSources.publicationVersion,
    currentness: dataStatus.generatedAt ?? dataStatus.snapshotDate ?? dataStatus.candidateGeneratedAt ?? null,
    dataStatusSha256: jsonHash(dataStatus),
    dataSourcesSha256: jsonHash(dataSources),
    busManifestSha256,
    tndsManifestSha256: [...tndsManifestSha256].sort(),
    ibusManifestSha256,
    ibusIndexSha256
  };
}

export function assertApprovedLiveDataIdentity(actual, approvedSha256) {
  if (!/^[0-9a-f]{64}$/i.test(String(approvedSha256 ?? ''))) throw new Error('An explicit approved live-data identity SHA-256 is required.');
  const actualSha256 = sha256(Buffer.from(`${JSON.stringify(actual, null, 2)}\n`, 'utf8'));
  if (actualSha256 !== approvedSha256.toLowerCase()) throw new Error('Published live-data identity does not match the explicitly approved identity.');
  return actualSha256;
}
