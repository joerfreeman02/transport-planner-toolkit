import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measurePublicationTree } from './publication.mjs';
import { computeCandidateGenerationCompatibilityFingerprint } from './candidate-compatibility.mjs';

export const CHECKPOINT_SCHEMA = 'atlas-verified-candidate-checkpoint-v2';
export const CHECKPOINT_RELATIVE_PATH = '.atlas-recovery/verified-candidate.json';
export const CANDIDATE_MEASUREMENT_RELATIVE_PATH = 'atlas/config/atlas-candidate-measurement.json';
export const DEFAULT_MAX_CANDIDATE_AGE_DAYS = 8;

const BUS_MANIFEST_RELATIVE_PATH = 'atlas/data/bus/manifest.json';
const TNDS_MANIFEST_RELATIVE_PATH = 'atlas/data/bus-tnds/manifest.json';
const STATUS_MANIFEST_RELATIVE_PATH = 'atlas/data/status/manifest.json';
const RELEASE_RELATIVE_PATH = 'atlas/config/atlas-release.json';
const SHA256 = /^[a-f0-9]{64}$/i;
const COMMIT_SHA = /^[a-f0-9]{40}$/i;

function candidatePath(candidateSite, relativePath) {
  return path.join(candidateSite, ...relativePath.split('/'));
}

async function readJson(candidateSite, relativePath) {
  return JSON.parse(await fs.readFile(candidatePath(candidateSite, relativePath), 'utf8'));
}

async function sha256File(candidateSite, relativePath) {
  const bytes = await fs.readFile(candidatePath(candidateSite, relativePath));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value;
}

function runIdText(value) {
  const id = requireString(String(value ?? ''), 'workflow run ID');
  if (!/^\d+$/.test(id)) throw new Error('workflow run ID must be numeric.');
  return id;
}

function shaText(value, label = 'application commit SHA') {
  const sha = requireString(String(value ?? ''), label);
  if (!COMMIT_SHA.test(sha)) throw new Error(`${label} must be a 40-character hexadecimal SHA.`);
  return sha.toLowerCase();
}

export function normaliseCandidateTimestamp(value, label = 'candidate timestamp') {
  const text = requireString(value, label);
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime()) || !/T\d{2}:\d{2}:\d{2}/.test(text) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new Error(`${label} must be a complete ISO-8601 timestamp with an explicit UTC offset.`);
  }
  return parsed.toISOString().replace(/\.000Z$/, 'Z');
}

export function candidateCacheKey({ runId, schema = CHECKPOINT_SCHEMA }) {
  return `${schema}-${runIdText(runId)}`;
}

function measurementIdentity(measurement, label) {
  if (!measurement || typeof measurement !== 'object') throw new Error(`${label} measurement is missing.`);
  if (!Number.isInteger(measurement.fileCount) || measurement.fileCount < 1) throw new Error(`${label} measurement file count is invalid.`);
  if (!Number.isInteger(measurement.bytes) || measurement.bytes < 1) throw new Error(`${label} measurement byte count is invalid.`);
  if (!SHA256.test(measurement.sha256)) throw new Error(`${label} measurement SHA-256 is invalid.`);
  return { fileCount: measurement.fileCount, bytes: measurement.bytes, sha256: measurement.sha256.toLowerCase() };
}

function measurementManifestSha(measurement, label) {
  const manifest = measurement.files?.find(file => file.path === 'manifest.json');
  if (!manifest || !SHA256.test(manifest.sha256)) throw new Error(`${label} measurement does not contain a manifest checksum.`);
  return manifest.sha256.toLowerCase();
}

function tndsCapacityPasses(measurement) {
  if (measurement?.tnds?.proposedPublication?.allRootsFitSafeLimit === true) return true;
  const roots = measurement?.proposedPublication?.roots;
  return Array.isArray(roots) && roots.length > 0 && roots.every(root => root?.fit === true);
}

export function assertPublicationCapacity(measurement) {
  if (measurement?.bus?.fitsSafeLimit !== true) throw new Error('Bus candidate does not fit the safe bounded-publication limit.');
  if (!tndsCapacityPasses(measurement)) throw new Error('TNDS candidate does not fit the safe bounded publication-root limits.');
  return measurement;
}

export function candidateFreshness({ candidateGenerationTimestamp, maxAgeDays = DEFAULT_MAX_CANDIDATE_AGE_DAYS, now = new Date() }) {
  const candidateAt = new Date(normaliseCandidateTimestamp(candidateGenerationTimestamp));
  const nowAt = new Date(normaliseCandidateTimestamp(now instanceof Date ? now.toISOString() : now, 'current time'));
  if (candidateAt.getTime() > nowAt.getTime()) throw new Error('Candidate-generation timestamp is in the future.');
  const ageDays = (nowAt.getTime() - candidateAt.getTime()) / 86400000;
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) throw new Error('Candidate freshness maximum age is invalid.');
  if (ageDays > maxAgeDays) throw new Error(`Candidate is stale: ${ageDays.toFixed(3)} days old exceeds the ${maxAgeDays}-day limit.`);
  return { candidateGenerationTimestamp: candidateAt.toISOString().replace(/\.000Z$/, 'Z'), checkedAt: nowAt.toISOString().replace(/\.000Z$/, 'Z'), maxAgeDays, ageDays };
}

export async function resolveCandidateTimestamp(candidateSite) {
  const [bus, tnds, status] = await Promise.all([
    readJson(candidateSite, BUS_MANIFEST_RELATIVE_PATH),
    readJson(candidateSite, TNDS_MANIFEST_RELATIVE_PATH),
    readJson(candidateSite, STATUS_MANIFEST_RELATIVE_PATH)
  ]);
  if (!['atlas-prepared-bus-data-v1', 'atlas-prepared-bus-data-v2'].includes(bus.schema)) throw new Error('Bus candidate manifest schema is invalid.');
  if (tnds.schema !== 'atlas-prepared-bus-tnds-v1') throw new Error('TNDS candidate manifest schema is invalid.');
  if (status.schema !== 'atlas-bus-refresh-status-v1' || status.status !== 'validated' || status.validation !== 'passed') throw new Error('Candidate status manifest does not prove successful validation.');
  const busAt = normaliseCandidateTimestamp(bus.generatedAt, 'Bus candidate generatedAt');
  const tndsAt = normaliseCandidateTimestamp(tnds.generatedAt, 'TNDS candidate generatedAt');
  const refreshedAt = normaliseCandidateTimestamp(status.successfulRefreshAt, 'candidate successfulRefreshAt');
  if (busAt !== tndsAt || busAt !== refreshedAt) throw new Error('Candidate manifests do not share one stable candidate-generation timestamp.');
  return busAt;
}

async function readCandidateState(candidateSite) {
  const [bus, tnds, status, release, measurement] = await Promise.all([
    readJson(candidateSite, BUS_MANIFEST_RELATIVE_PATH),
    readJson(candidateSite, TNDS_MANIFEST_RELATIVE_PATH),
    readJson(candidateSite, STATUS_MANIFEST_RELATIVE_PATH),
    readJson(candidateSite, RELEASE_RELATIVE_PATH),
    readJson(candidateSite, CANDIDATE_MEASUREMENT_RELATIVE_PATH)
  ]);
  const candidateGenerationTimestamp = await resolveCandidateTimestamp(candidateSite);
  const [busMeasurement, tndsMeasurement] = await Promise.all([
    measurePublicationTree(candidatePath(candidateSite, 'atlas/data/bus')),
    measurePublicationTree(candidatePath(candidateSite, 'atlas/data/bus-tnds'))
  ]);
  const statusManifestSha256 = await sha256File(candidateSite, STATUS_MANIFEST_RELATIVE_PATH);
  return { bus, tnds, status, release, measurement, candidateGenerationTimestamp, statusManifestSha256, busMeasurement, tndsMeasurement };
}

function validateExpectedIdentity(checkpoint, expected) {
  if (checkpoint.schema !== CHECKPOINT_SCHEMA) throw new Error(`Unsupported candidate checkpoint schema ${checkpoint.schema ?? '<missing>'}.`);
  if (checkpoint.cacheKey !== expected.cacheKey) throw new Error('Candidate checkpoint cache identity does not match the requested exact key.');
  if (checkpoint.cacheIdentity?.runId !== expected.producerRunId) throw new Error('Candidate checkpoint cache producer identity does not match.');
  const identity = checkpoint.identity ?? {};
  if (identity.producerRunId !== expected.producerRunId) throw new Error('Candidate checkpoint producer workflow run identity does not match.');
  if (identity.producerRef !== 'refs/heads/main' || identity.productionEligible !== true) throw new Error('Candidate checkpoint producer is outside the trusted production boundary.');
  if (expected.workflowName && identity.producerWorkflowName !== expected.workflowName) throw new Error('Candidate checkpoint workflow name does not match.');
  const expectedCurrentIdentity = expected.crossRun ? expected.producerRunId : expected.currentRunId;
  if (identity.currentRunId !== expectedCurrentIdentity) throw new Error('Candidate checkpoint current workflow run identity does not match.');
  if (expected.crossRun && (!expected.explicitResume || expected.eventName !== 'workflow_dispatch' || expected.currentRef !== 'refs/heads/main')) throw new Error('Cross-run checkpoint restore requires an explicit main-branch workflow dispatch.');
  if (checkpoint.validationState?.candidate !== 'passed' || checkpoint.validationState?.deterministic !== 'passed' || checkpoint.validationState?.capacity !== 'passed') throw new Error('Candidate checkpoint validation state is not fully passed.');
}

function validateMeasurementAgainstCheckpoint(state, checkpoint) {
  const bus = measurementIdentity(state.busMeasurement, 'Bus candidate');
  const tnds = measurementIdentity(state.tndsMeasurement, 'TNDS candidate');
  const checkpointBus = (({ fileCount, bytes, sha256 }) => ({ fileCount, bytes, sha256 }))(checkpoint.candidate.bus ?? {});
  const checkpointTnds = (({ fileCount, bytes, sha256 }) => ({ fileCount, bytes, sha256 }))(checkpoint.candidate.tnds ?? {});
  if (JSON.stringify(bus) !== JSON.stringify(checkpointBus)) throw new Error('Bus candidate measurement does not match the checkpoint.');
  if (JSON.stringify(tnds) !== JSON.stringify(checkpointTnds)) throw new Error('TNDS candidate measurement does not match the checkpoint.');
  if (checkpoint.candidate.bus.manifestSha256 !== measurementManifestSha(state.busMeasurement, 'Bus candidate')) throw new Error('Bus candidate manifest checksum does not match the checkpoint.');
  if (checkpoint.candidate.tnds.manifestSha256 !== measurementManifestSha(state.tndsMeasurement, 'TNDS candidate')) throw new Error('TNDS candidate manifest checksum does not match the checkpoint.');
  if (state.measurement.bus?.sha256 !== state.busMeasurement.sha256 || state.measurement.tnds?.sha256 !== state.tndsMeasurement.sha256) throw new Error('Candidate capacity measurement does not match the restored candidate.');
  assertPublicationCapacity(state.measurement);
}

function validateStatusAgainstCheckpoint(state, checkpoint) {
  const identity = checkpoint.identity ?? {};
  if (state.status.schema !== 'atlas-bus-refresh-status-v1' || state.status.status !== 'validated' || state.status.validation !== 'passed') throw new Error('Candidate status manifest is not validated.');
  if (state.status.repositoryCommit !== identity.producerCommitSha) throw new Error('Candidate status repositoryCommit does not match producer provenance.');
  if (state.status.workflowRun !== identity.producerRunId) throw new Error('Candidate status workflowRun does not match producer provenance.');
  if (state.status.successfulRefreshAt !== identity.candidateGenerationTimestamp) throw new Error('Candidate status timestamp does not match producer provenance.');
  if (checkpoint.statusManifestSha256 !== state.statusManifestSha256) throw new Error('Candidate status manifest checksum does not match the checkpoint.');
}

function checkpointIdentity({ producerRunId, producerRunAttempt, producerCommitSha, currentRunId, currentCommitSha, workflowName, ref, eventName, state, fingerprint }) {
  return {
    producerRunId,
    producerRunAttempt: String(producerRunAttempt ?? ''),
    producerCommitSha,
    producerWorkflowName: workflowName ?? null,
    producerRef: ref ?? null,
    producerEventName: eventName ?? null,
    productionEligible: ref === 'refs/heads/main',
    currentRunId,
    currentCommitSha,
    candidateGenerationTimestamp: state.candidateGenerationTimestamp,
    release: { version: state.release.version, build: state.release.build },
    candidateGenerationCompatibilityFingerprint: fingerprint,
    freshness: { maxAgeDays: Number(state.bus.refreshAfterDays ?? DEFAULT_MAX_CANDIDATE_AGE_DAYS), refreshAfterDays: Number(state.bus.refreshAfterDays ?? DEFAULT_MAX_CANDIDATE_AGE_DAYS) }
  };
}

async function writeCheckpoint(candidateSite, checkpoint) {
  const target = candidatePath(candidateSite, CHECKPOINT_RELATIVE_PATH);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`);
  await fs.rename(temporary, target);
  return checkpoint;
}

export async function createVerifiedCandidateCheckpoint({ candidateSite, runId, runAttempt, commitSha, workflowName, cacheKey, gates, ref = 'refs/heads/main', eventName = 'workflow_dispatch', repositoryRoot = process.cwd(), checkpointCreatedAt = new Date().toISOString(), now = checkpointCreatedAt }) {
  const currentRunId = runIdText(runId);
  const currentCommitSha = shaText(commitSha);
  if (gates?.candidateValidation !== 'passed' || gates?.deterministicChecks !== 'passed' || gates?.capacityMeasurement !== 'passed') throw new Error('Verified candidate checkpoint requires candidate validation, deterministic checks and capacity measurement to pass.');
  const expectedKey = candidateCacheKey({ runId: currentRunId });
  if (cacheKey !== expectedKey) throw new Error('Checkpoint cache key is not the exact key for this workflow run.');
  if (ref !== 'refs/heads/main') throw new Error('Verified candidate checkpoints may only be created on refs/heads/main.');
  const state = await readCandidateState(candidateSite);
  if (state.status.repositoryCommit !== currentCommitSha) throw new Error('Candidate status repositoryCommit does not match the workflow commit.');
  if (state.status.workflowRun !== currentRunId) throw new Error('Candidate status workflowRun does not match the workflow run.');
  if (!state.release.version || !state.release.build) throw new Error('ATLAS release/build identity is missing.');
  assertPublicationCapacity(state.measurement);
  const fingerprint = await computeCandidateGenerationCompatibilityFingerprint({ rootDir: repositoryRoot });
  const freshness = candidateFreshness({ candidateGenerationTimestamp: state.candidateGenerationTimestamp, maxAgeDays: Number(state.bus.refreshAfterDays ?? DEFAULT_MAX_CANDIDATE_AGE_DAYS), now });
  const bus = measurementIdentity(state.busMeasurement, 'Bus candidate');
  const tnds = measurementIdentity(state.tndsMeasurement, 'TNDS candidate');
  const checkpoint = {
    schema: CHECKPOINT_SCHEMA,
    cacheKey: expectedKey,
    cacheIdentity: { schema: CHECKPOINT_SCHEMA, runId: currentRunId },
    createdAt: normaliseCandidateTimestamp(checkpointCreatedAt, 'checkpoint createdAt'),
    identity: checkpointIdentity({ producerRunId: currentRunId, producerRunAttempt: runAttempt, producerCommitSha: currentCommitSha, currentRunId, currentCommitSha, workflowName, ref, eventName, state, fingerprint }),
    validationState: { candidate: 'passed', deterministic: 'passed', capacity: 'passed' },
    statusManifestSha256: state.statusManifestSha256,
    candidate: {
      bus: { ...bus, manifestSha256: measurementManifestSha(state.busMeasurement, 'Bus candidate'), manifestSchema: state.bus.schema, generatedAt: state.bus.generatedAt },
      tnds: { ...tnds, manifestSha256: measurementManifestSha(state.tndsMeasurement, 'TNDS candidate'), manifestSchema: state.tnds.schema, generatedAt: state.tnds.generatedAt }
    },
    capacity: { busFitsSafeLimit: state.measurement.bus.fitsSafeLimit, tndsRootsFitSafeLimit: tndsCapacityPasses(state.measurement), measurementSchema: state.measurement.diagnosticSchema ?? null },
    freshness,
    files: { candidateMeasurement: CANDIDATE_MEASUREMENT_RELATIVE_PATH, busManifest: BUS_MANIFEST_RELATIVE_PATH, tndsManifest: TNDS_MANIFEST_RELATIVE_PATH, statusManifest: STATUS_MANIFEST_RELATIVE_PATH, releaseMetadata: RELEASE_RELATIVE_PATH }
  };
  return writeCheckpoint(candidateSite, checkpoint);
}

export async function restoreVerifiedCandidateCheckpoint({ candidateSite, cacheExactHit, cacheMatchedKey, requestedProducerRunId, currentRunId, currentCommitSha, runId, commitSha, workflowName, currentRef = 'refs/heads/main', eventName = 'workflow_dispatch', explicitResume = false, repositoryRoot = process.cwd(), now = new Date() }) {
  const producerValue = requestedProducerRunId ?? runId;
  const currentValue = currentRunId ?? runId;
  let producerRunId;
  try { producerRunId = runIdText(producerValue); } catch (error) { return { ok: false, reason: error.message }; }
  const currentId = String(currentValue ?? '');
  const crossRun = producerRunId !== currentId;
  const cacheKey = candidateCacheKey({ runId: producerRunId });
  if (cacheExactHit !== true && cacheExactHit !== 'true') return { ok: false, reason: 'exact checkpoint cache miss', crossRun };
  if (cacheMatchedKey !== cacheKey) return { ok: false, reason: 'cache action did not restore the exact requested producer key', crossRun };
  try {
    const currentSha = shaText(currentCommitSha ?? commitSha, 'current application commit SHA');
    const checkpoint = await readJson(candidateSite, CHECKPOINT_RELATIVE_PATH);
    validateExpectedIdentity(checkpoint, { cacheKey, producerRunId, currentRunId: currentId, workflowName, crossRun, explicitResume: explicitResume === true || explicitResume === 'true', eventName, currentRef });
    const fingerprint = await computeCandidateGenerationCompatibilityFingerprint({ rootDir: repositoryRoot });
    if (JSON.stringify(checkpoint.identity.candidateGenerationCompatibilityFingerprint) !== JSON.stringify(fingerprint)) throw new Error('Candidate-generation compatibility fingerprint does not match the current workflow.');
    const state = await readCandidateState(candidateSite);
    if (state.candidateGenerationTimestamp !== checkpoint.identity.candidateGenerationTimestamp) throw new Error('Candidate-generation timestamp does not match the checkpoint.');
    if (state.release.version !== checkpoint.identity.release.version || state.release.build !== checkpoint.identity.release.build) throw new Error('ATLAS release/build identity does not match the checkpoint.');
    candidateFreshness({ candidateGenerationTimestamp: state.candidateGenerationTimestamp, maxAgeDays: Number(checkpoint.identity.freshness?.maxAgeDays ?? DEFAULT_MAX_CANDIDATE_AGE_DAYS), now });
    validateStatusAgainstCheckpoint(state, checkpoint);
    validateMeasurementAgainstCheckpoint(state, checkpoint);
    if (!crossRun && checkpoint.identity.currentCommitSha !== currentSha) throw new Error('Candidate checkpoint current commit identity does not match.');
    return { ok: true, reason: crossRun ? 'exact verified candidate checkpoint restored from explicit producer run' : 'exact verified candidate checkpoint restored', checkpoint, crossRun };
  } catch (error) {
    return { ok: false, reason: error.message, crossRun };
  }
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function cli() {
  const candidateSite = option('--candidate-site');
  if (!candidateSite) throw new Error('Missing --candidate-site');
  if (process.argv.includes('--timestamp-only')) { console.log(await resolveCandidateTimestamp(path.resolve(candidateSite))); return; }
  if (process.argv.includes('--restore')) {
    const result = await restoreVerifiedCandidateCheckpoint({ candidateSite: path.resolve(candidateSite), cacheExactHit: option('--cache-hit'), cacheMatchedKey: option('--cache-matched-key'), requestedProducerRunId: option('--requested-producer-run-id') ?? option('--run-id'), currentRunId: option('--current-run-id') ?? option('--run-id'), currentCommitSha: option('--current-commit-sha') ?? option('--commit-sha'), workflowName: option('--workflow-name'), currentRef: option('--current-ref') ?? 'refs/heads/main', eventName: option('--event-name') ?? 'workflow_dispatch', explicitResume: option('--explicit-resume') === 'true', repositoryRoot: option('--repository-root') ?? process.cwd(), now: option('--now') ?? new Date() });
    const output = process.env.GITHUB_OUTPUT;
    if (output) await fs.appendFile(output, `valid=${result.ok ? 'true' : 'false'}\nreason=${String(result.reason).replace(/[\r\n]/g, ' ')}\ncross_run=${result.crossRun ? 'true' : 'false'}\n`);
    console.log(JSON.stringify(result, null, 2)); return;
  }
  if (process.argv.includes('--capacity-only')) { const state = await readCandidateState(path.resolve(candidateSite)); assertPublicationCapacity(state.measurement); console.log(JSON.stringify({ ok: true, bus: state.measurement.bus, tnds: state.measurement.tnds?.proposedPublication ?? state.measurement.proposedPublication }, null, 2)); return; }
  if (process.argv.includes('--create')) {
    const checkpoint = await createVerifiedCandidateCheckpoint({ candidateSite: path.resolve(candidateSite), runId: option('--current-run-id') ?? option('--run-id'), runAttempt: option('--run-attempt'), commitSha: option('--current-commit-sha') ?? option('--commit-sha'), workflowName: option('--workflow-name'), cacheKey: option('--cache-key'), gates: { candidateValidation: option('--gate-candidate-validation'), deterministicChecks: option('--gate-deterministic-checks'), capacityMeasurement: option('--gate-capacity-measurement') }, ref: option('--current-ref') ?? 'refs/heads/main', eventName: option('--event-name') ?? 'workflow_dispatch', repositoryRoot: option('--repository-root') ?? process.cwd(), now: option('--now') ?? new Date() });
    console.log(JSON.stringify({ schema: checkpoint.schema, cacheKey: checkpoint.cacheKey, candidateGenerationTimestamp: checkpoint.identity.candidateGenerationTimestamp }, null, 2)); return;
  }
  throw new Error('Expected --timestamp-only, --restore, --capacity-only or --create.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch(error => { console.error(`Candidate checkpoint operation failed: ${error.message}`); process.exitCode = 1; });
