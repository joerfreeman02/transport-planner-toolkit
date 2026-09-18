import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measurePublicationTree } from './publication.mjs';

export const CHECKPOINT_SCHEMA = 'atlas-verified-candidate-checkpoint-v1';
export const CHECKPOINT_RELATIVE_PATH = '.atlas-recovery/verified-candidate.json';
export const CANDIDATE_MEASUREMENT_RELATIVE_PATH = 'atlas/config/atlas-candidate-measurement.json';

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

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value;
}

export function normaliseCandidateTimestamp(value, label = 'candidate timestamp') {
  const text = requireString(value, label);
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime()) || !/T\d{2}:\d{2}:\d{2}/.test(text) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new Error(`${label} must be a complete ISO-8601 timestamp with an explicit UTC offset.`);
  }
  return parsed.toISOString().replace(/\.000Z$/, 'Z');
}

export function candidateCacheKey({ runId, commitSha, schema = CHECKPOINT_SCHEMA }) {
  const id = requireString(String(runId ?? ''), 'workflow run ID');
  const sha = requireString(String(commitSha ?? ''), 'application commit SHA');
  if (!/^\d+$/.test(id)) throw new Error('workflow run ID must be numeric.');
  if (!COMMIT_SHA.test(sha)) throw new Error('application commit SHA must be a 40-character hexadecimal SHA.');
  return `${schema}-${id}-${sha.toLowerCase()}`;
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

export function assertPublicationCapacity(measurement) {
  if (measurement?.bus?.fitsSafeLimit !== true) throw new Error('Bus candidate does not fit the safe bounded-publication limit.');
  if (measurement?.tnds?.proposedPublication?.allRootsFitSafeLimit !== true) throw new Error('TNDS candidate does not fit the safe bounded publication-root limits.');
  return measurement;
}

export async function resolveCandidateTimestamp(candidateSite) {
  const [bus, tnds, status] = await Promise.all([
    readJson(candidateSite, BUS_MANIFEST_RELATIVE_PATH),
    readJson(candidateSite, TNDS_MANIFEST_RELATIVE_PATH),
    readJson(candidateSite, STATUS_MANIFEST_RELATIVE_PATH)
  ]);
  if (bus.schema !== 'atlas-prepared-bus-data-v1') throw new Error('Bus candidate manifest schema is invalid.');
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
  return { bus, tnds, status, release, measurement, candidateGenerationTimestamp, busMeasurement, tndsMeasurement };
}

function validateExpectedIdentity(checkpoint, expected) {
  if (checkpoint.schema !== CHECKPOINT_SCHEMA) throw new Error(`Unsupported candidate checkpoint schema ${checkpoint.schema ?? '<missing>'}.`);
  if (checkpoint.cacheKey !== expected.cacheKey) throw new Error('Candidate checkpoint cache identity does not match the requested exact key.');
  if (checkpoint.identity.workflowRunId !== String(expected.runId)) throw new Error('Candidate checkpoint workflow run identity does not match.');
  if (checkpoint.identity.commitSha !== String(expected.commitSha).toLowerCase()) throw new Error('Candidate checkpoint commit identity does not match.');
  if (expected.workflowName && checkpoint.identity.workflowName !== expected.workflowName) throw new Error('Candidate checkpoint workflow name does not match.');
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

export async function createVerifiedCandidateCheckpoint({ candidateSite, runId, runAttempt, commitSha, workflowName, cacheKey, gates, checkpointCreatedAt = new Date().toISOString() }) {
  if (gates?.candidateValidation !== 'passed' || gates?.deterministicChecks !== 'passed' || gates?.capacityMeasurement !== 'passed') throw new Error('Verified candidate checkpoint requires candidate validation, deterministic checks and capacity measurement to pass.');
  const expectedKey = candidateCacheKey({ runId, commitSha });
  if (cacheKey !== expectedKey) throw new Error('Checkpoint cache key is not the exact key for this workflow run and commit.');
  const state = await readCandidateState(candidateSite);
  if (state.status.repositoryCommit !== String(commitSha)) throw new Error('Candidate status repositoryCommit does not match the workflow commit.');
  if (state.status.workflowRun !== String(runId)) throw new Error('Candidate status workflowRun does not match the workflow run.');
  if (!state.release.version || !state.release.build) throw new Error('ATLAS release/build identity is missing.');
  assertPublicationCapacity(state.measurement);
  const bus = measurementIdentity(state.busMeasurement, 'Bus candidate');
  const tnds = measurementIdentity(state.tndsMeasurement, 'TNDS candidate');
  const checkpoint = {
    schema: CHECKPOINT_SCHEMA,
    cacheKey: expectedKey,
    createdAt: normaliseCandidateTimestamp(checkpointCreatedAt, 'checkpoint createdAt'),
    identity: {
      workflowName: workflowName ?? null,
      workflowRunId: String(runId),
      createdRunAttempt: String(runAttempt ?? ''),
      commitSha: String(commitSha).toLowerCase(),
      candidateGenerationTimestamp: state.candidateGenerationTimestamp,
      release: { version: state.release.version, build: state.release.build }
    },
    validationState: { candidate: 'passed', deterministic: 'passed', capacity: 'passed' },
    candidate: {
      bus: { ...bus, manifestSha256: measurementManifestSha(state.busMeasurement, 'Bus candidate'), manifestSchema: state.bus.schema, generatedAt: state.bus.generatedAt },
      tnds: { ...tnds, manifestSha256: measurementManifestSha(state.tndsMeasurement, 'TNDS candidate'), manifestSchema: state.tnds.schema, generatedAt: state.tnds.generatedAt }
    },
    capacity: {
      busFitsSafeLimit: state.measurement.bus.fitsSafeLimit,
      tndsRootsFitSafeLimit: state.measurement.tnds.proposedPublication.allRootsFitSafeLimit,
      measurementSchema: state.measurement.diagnosticSchema ?? null
    },
    files: {
      candidateMeasurement: CANDIDATE_MEASUREMENT_RELATIVE_PATH,
      busManifest: BUS_MANIFEST_RELATIVE_PATH,
      tndsManifest: TNDS_MANIFEST_RELATIVE_PATH,
      statusManifest: STATUS_MANIFEST_RELATIVE_PATH,
      releaseMetadata: RELEASE_RELATIVE_PATH
    }
  };
  const target = candidatePath(candidateSite, CHECKPOINT_RELATIVE_PATH);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await fs.writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`);
  await fs.rename(temporary, target);
  return checkpoint;
}

export async function restoreVerifiedCandidateCheckpoint({ candidateSite, cacheExactHit, cacheMatchedKey, runId, commitSha, workflowName }) {
  const cacheKey = candidateCacheKey({ runId, commitSha });
  if (cacheExactHit !== true && cacheExactHit !== 'true') return { ok: false, reason: 'exact checkpoint cache miss' };
  if (cacheMatchedKey !== cacheKey) return { ok: false, reason: 'cache action did not restore the exact requested key' };
  try {
    const checkpoint = await readJson(candidateSite, CHECKPOINT_RELATIVE_PATH);
    validateExpectedIdentity(checkpoint, { cacheKey, runId, commitSha, workflowName });
    const state = await readCandidateState(candidateSite);
    if (state.candidateGenerationTimestamp !== checkpoint.identity.candidateGenerationTimestamp) throw new Error('Candidate-generation timestamp does not match the checkpoint.');
    if (state.release.version !== checkpoint.identity.release.version || state.release.build !== checkpoint.identity.release.build) throw new Error('ATLAS release/build identity does not match the checkpoint.');
    validateMeasurementAgainstCheckpoint(state, checkpoint);
    return { ok: true, reason: 'exact verified candidate checkpoint restored', checkpoint };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function cli() {
  const candidateSite = option('--candidate-site');
  if (!candidateSite) throw new Error('Missing --candidate-site');
  if (process.argv.includes('--timestamp-only')) {
    console.log(await resolveCandidateTimestamp(path.resolve(candidateSite)));
    return;
  }
  const runId = option('--run-id');
  const commitSha = option('--commit-sha');
  if (process.argv.includes('--restore')) {
    const result = await restoreVerifiedCandidateCheckpoint({ candidateSite: path.resolve(candidateSite), cacheExactHit: option('--cache-hit'), cacheMatchedKey: option('--cache-matched-key'), runId, commitSha, workflowName: option('--workflow-name') });
    const output = process.env.GITHUB_OUTPUT;
    if (output) await fs.appendFile(output, `valid=${result.ok ? 'true' : 'false'}\nreason=${String(result.reason).replace(/[\r\n]/g, ' ')}\n`);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (process.argv.includes('--capacity-only')) {
    const state = await readCandidateState(path.resolve(candidateSite));
    assertPublicationCapacity(state.measurement);
    console.log(JSON.stringify({ ok: true, bus: state.measurement.bus, tnds: state.measurement.tnds.proposedPublication }, null, 2));
    return;
  }
  if (process.argv.includes('--create')) {
    const checkpoint = await createVerifiedCandidateCheckpoint({ candidateSite: path.resolve(candidateSite), runId, runAttempt: option('--run-attempt'), commitSha, workflowName: option('--workflow-name'), cacheKey: option('--cache-key'), gates: { candidateValidation: 'passed', deterministicChecks: 'passed', capacityMeasurement: 'passed' } });
    console.log(JSON.stringify({ schema: checkpoint.schema, cacheKey: checkpoint.cacheKey, candidateGenerationTimestamp: checkpoint.identity.candidateGenerationTimestamp }, null, 2));
    return;
  }
  throw new Error('Expected --timestamp-only, --restore, --capacity-only or --create.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch(error => { console.error(`Candidate checkpoint operation failed: ${error.message}`); process.exitCode = 1; });
