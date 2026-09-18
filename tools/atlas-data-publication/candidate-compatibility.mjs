import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const CANDIDATE_COMPATIBILITY_SCHEMA = 'atlas-candidate-generation-compatibility-v1';

// These files can materially change the bytes, schemas, validation result or
// capacity eligibility of an acquired candidate. Publication transport and
// deployment files are deliberately excluded so a downstream-only correction
// can resume the same validated candidate.
export const CANDIDATE_COMPATIBILITY_FILES = Object.freeze([
  'tools/atlas-bus-data/build_static_index.py',
  'tools/atlas-bus-data/refresh_bus_data.py',
  'tools/atlas-bus-data/prepare_tnds.mjs',
  'tools/atlas-bus-data/validate_candidate.py',
  'tools/atlas-data-publication/measure-candidate.mjs',
  'tools/atlas-data-publication/publication.mjs',
  'tools/atlas-data-publication/candidate-compatibility.mjs',
  'atlas/config/atlas-release.json'
]);

export const PUBLICATION_ONLY_FILES = Object.freeze([
  '.github/workflows/atlas-bus-data-refresh.yml',
  'tools/atlas-data-publication/publish-bank.mjs',
  'tools/atlas-data-publication/publish-snapshot.mjs',
  'tools/atlas-data-publication/wait-for-bank.mjs',
  'tools/atlas-data-publication/validate-publication.mjs',
  'tools/atlas-data-publication/candidate-checkpoint.mjs'
]);

function relativeFile(rootDir, relative) {
  return path.join(rootDir, ...relative.split('/'));
}

export async function computeCandidateGenerationCompatibilityFingerprint({ rootDir = process.cwd(), fileOverrides = {} } = {}) {
  const files = [];
  for (const relative of CANDIDATE_COMPATIBILITY_FILES) {
    const bytes = fileOverrides[relative] ?? await fs.readFile(relativeFile(rootDir, relative));
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    files.push({ path: relative, sha256 });
  }
  const aggregate = crypto.createHash('sha256');
  for (const file of files) aggregate.update(`${file.path}:${file.sha256}\n`);
  return { schema: CANDIDATE_COMPATIBILITY_SCHEMA, sha256: aggregate.digest('hex'), files };
}
