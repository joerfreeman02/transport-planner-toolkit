import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const SHA256 = /^[a-f0-9]{64}$/i;
const COMMIT = /^[a-f0-9]{40}$/i;

async function json(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function filesBelow(root) {
  const found = [];
  async function visit(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Candidate contains a symbolic link: ${path.relative(root, target)}`);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) {
        const bytes = await fs.readFile(target);
        found.push({ path: path.relative(root, target).split(path.sep).join('/'), bytes: bytes.length,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  await visit(root);
  if (!found.length) throw new Error('Candidate tree is empty.');
  return found;
}
async function containsJsonField(root, field) {
  let matched = false;
  for (const item of await filesBelow(root)) {
    if (!item.path.endsWith('.json') && !item.path.endsWith('.json.gz')) continue;
    const bytes = await fs.readFile(path.join(root, ...item.path.split('/')));
    const value = item.path.endsWith('.json.gz')
      ? JSON.parse(gunzipSync(bytes).toString('utf8'))
      : JSON.parse(bytes.toString('utf8'));
    const stack = [value];
    while (stack.length) {
      const current = stack.pop();
      if (!current || typeof current !== 'object') continue;
      if (Object.hasOwn(current, field)) { matched = true; break; }
      stack.push(...Object.values(current));
    }
    if (matched) break;
  }
  return matched;
}
function required(value, label) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`); return value; }

export async function createReviewCheckpoint({ candidateRoot, checkpointRoot, provenancePath, commitSha, runId, createdAt = new Date().toISOString() }) {
  if (!COMMIT.test(commitSha ?? '')) throw new Error('Current commit SHA is invalid.');
  required(runId, 'Producer run ID');
  const [status, bus, tnds, release, provenance] = await Promise.all([
    json(path.join(candidateRoot, 'atlas/data/status/manifest.json')),
    json(path.join(candidateRoot, 'atlas/data/bus/manifest.json')),
    json(path.join(candidateRoot, 'atlas/data/bus-tnds/manifest.json')),
    json(path.join(candidateRoot, 'atlas/config/atlas-release.json')),
    json(provenancePath)
  ]);
  if (status.schema !== 'atlas-bus-refresh-status-v1' || status.reviewOnly !== true || status.productionEligible !== false || status.publicationEligible !== false || status.plannerEligible !== false)
    throw new Error('Candidate status does not prove review-only ineligibility.');
  if (bus.schema !== 'atlas-prepared-bus-data-v2' || tnds.schema !== 'atlas-prepared-bus-tnds-v1') throw new Error('Prepared Bus or TNDS manifest schema is invalid.');
  if (bus.sources?.bods?.regions?.length !== 9 || !await containsJsonField(path.join(candidateRoot, 'atlas/data/bus'), 'circularPatternStopIds'))
    throw new Error('BODS prepared candidate is missing one or more regional sources or circularPatternStopIds evidence.');
  if (!await containsJsonField(path.join(candidateRoot, 'atlas/data/bus-tnds'), 'routePatternStopIds'))
    throw new Error('TNDS prepared candidate is missing routePatternStopIds evidence.');
  const primary = status.sources?.sourceSnapshot;
  const tndsSource = status.sources?.tnds?.sourceSnapshot;
  const primaryId = required(primary?.snapshotId, 'Primary snapshot ID');
  const tndsId = required(tndsSource?.snapshotId, 'TNDS snapshot ID');
  if (!SHA256.test(primaryId) || !SHA256.test(tndsId)) throw new Error('Raw snapshot identity must be a SHA-256 digest.');
  const primaryRun = required(String(primary?.producer?.runId ?? ''), 'Primary producer run ID');
  const tndsRun = required(String(tndsSource?.producer?.runId ?? ''), 'TNDS producer run ID');
  if (!primary?.producer?.workflow || !tndsSource?.producer?.workflow) throw new Error('Raw snapshot producer workflow identity is missing.');
  if (provenance.primary?.snapshotId !== primaryId || String(provenance.primary?.producerRunId) !== primaryRun || provenance.primary?.producerWorkflow !== primary.producer.workflow ||
      provenance.tnds?.snapshotId !== tndsId || String(provenance.tnds?.producerRunId) !== tndsRun || provenance.tnds?.producerWorkflow !== tndsSource.producer.workflow)
    throw new Error('Candidate source binding does not match the supplied raw artifact provenance.');
  for (const [label, value] of [['Primary', provenance.primary], ['TNDS', provenance.tnds]]) {
    if (!/^\d+$/.test(String(value?.artifactId ?? ''))) throw new Error(`${label} raw artifact ID is invalid.`);
    if (!/^sha256:[a-f0-9]{64}$/i.test(String(value?.artifactDigest ?? ''))) throw new Error(`${label} raw artifact digest is invalid.`);
  }
  if (release.version !== '2.0.0-alpha.15' || release.build !== 'ATLAS-2.0.0-alpha.15-20260914') throw new Error('Candidate release identity changed from Alpha.15.');
  const files = await filesBelow(candidateRoot);
  const sourceBinding = { primarySnapshotId: primaryId, primaryProducerRunId: primaryRun, tndsSnapshotId: tndsId, tndsProducerRunId: tndsRun };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ commitSha, sourceBinding, files })).digest('hex');
  const checkpoint = {
    schema: 'atlas-review-candidate-checkpoint-v1', state: 'BUILT_STRUCTURALLY_VERIFIED_REVIEW_ONLY',
    plannerEligible: false, productionEligible: false, publicationEligible: false,
    createdAt, producer: { repository: provenance.repository, workflow: provenance.workflow, runId: String(runId), commitSha },
    release: { version: release.version, build: release.build }, sourceBinding,
    sourceArtifacts: { primary: provenance.primary, tnds: provenance.tnds },
    candidateFingerprint: fingerprint, candidateRoot: 'candidate-site', fileCount: files.length,
    candidateBytes: files.reduce((sum, item) => sum + item.bytes, 0), files
  };
  await fs.mkdir(checkpointRoot, { recursive: true });
  await fs.writeFile(path.join(checkpointRoot, 'manifest.json'), `${JSON.stringify(checkpoint, null, 2)}\n`);
  return checkpoint;
}

export async function verifyReviewCheckpoint({ candidateRoot, checkpointRoot, expectedRunId, expectedCommitSha }) {
  const checkpoint = await json(path.join(checkpointRoot, 'manifest.json'));
  if (checkpoint.schema !== 'atlas-review-candidate-checkpoint-v1' || checkpoint.state !== 'BUILT_STRUCTURALLY_VERIFIED_REVIEW_ONLY') throw new Error('Review checkpoint state/schema mismatch.');
  if (checkpoint.plannerEligible !== false || checkpoint.productionEligible !== false || checkpoint.publicationEligible !== false) throw new Error('Review checkpoint has unsafe eligibility flags.');
  if (String(checkpoint.producer?.runId) !== String(expectedRunId)) throw new Error('Review checkpoint producer run does not match explicit restore run.');
  if (checkpoint.producer?.commitSha !== expectedCommitSha) throw new Error('Review checkpoint commit does not match the requested commit.');
  const files = await filesBelow(candidateRoot);
  if (JSON.stringify(files) !== JSON.stringify(checkpoint.files)) throw new Error('Review candidate file set or hashes do not match the checkpoint.');
  const binding = checkpoint.sourceBinding;
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ commitSha: expectedCommitSha, sourceBinding: binding, files })).digest('hex');
  if (!SHA256.test(checkpoint.candidateFingerprint ?? '') || fingerprint !== checkpoint.candidateFingerprint) throw new Error('Review candidate fingerprint mismatch.');
  return checkpoint;
}

const value = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const operation = process.argv[2];
  const task = operation === 'create'
    ? createReviewCheckpoint({ candidateRoot: value('--candidate-root'), checkpointRoot: value('--checkpoint-root'), provenancePath: value('--provenance'), commitSha: value('--commit-sha'), runId: value('--run-id') })
    : operation === 'verify'
      ? verifyReviewCheckpoint({ candidateRoot: value('--candidate-root'), checkpointRoot: value('--checkpoint-root'), expectedRunId: value('--expected-run-id'), expectedCommitSha: value('--expected-commit-sha') })
      : Promise.reject(new Error('Expected create or verify.'));
  task.then(result => console.log(JSON.stringify({ schema: result.schema, state: result.state, candidateFingerprint: result.candidateFingerprint }, null, 2)))
    .catch(error => { console.error(`Review candidate checkpoint failed: ${error.message}`); process.exitCode = 1; });
}
