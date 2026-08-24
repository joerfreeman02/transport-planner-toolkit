export const EVIDENCE_SCHEMA_VERSION = '1.0.0';

const VALIDATION_STATES = new Set(['validated', 'unvalidated', 'warning', 'unavailable']);
const CONFIDENCE_STATES = new Set(['authoritative', 'derived', 'provisional', 'unknown']);
const FRESHNESS_STATES = new Set(['live-current', 'cached-current', 'stale', 'unknown']);
const CACHE_STATES = new Set(['not-used', 'miss', 'hit', 'stale', 'write-failed']);

const clean = value => String(value ?? '').trim();
const cleanList = value => (Array.isArray(value) ? value : value ? [value] : []).map(clean).filter(Boolean);

function timestamp(value, label, required = false) {
  const result = clean(value);
  if (!result && required) throw new Error(`${label} is required.`);
  if (result && Number.isNaN(Date.parse(result))) throw new Error(`${label} must be ISO-8601 compatible.`);
  return result || null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createEvidence(input = {}) {
  const subject = input.subject ?? {};
  const subjectId = clean(subject.id ?? input.subjectId);
  const subjectType = clean(subject.entityType ?? subject.type ?? input.subjectType);
  const evidenceType = clean(input.evidenceType ?? input.field);
  const source = input.source ?? {};
  const sourceName = clean(source.name ?? input.authoritativeSource);
  const sourceRecordIdentifier = clean(source.recordIdentifier ?? input.sourceRecordIdentifier);
  const sourceEndpoint = clean(source.endpoint ?? input.sourceEndpoint);
  const validationStatus = clean(input.validationStatus) || 'unvalidated';
  const confidenceStatus = clean(input.confidenceStatus) || 'unknown';
  const freshnessStatus = clean(input.freshness?.status ?? input.freshnessStatus) || 'unknown';
  const cacheStatus = clean(input.cache?.status ?? input.cacheStatus) || 'not-used';

  if (!subjectId || !subjectType) throw new Error('Evidence subject type and identifier are required.');
  if (!evidenceType) throw new Error('Evidence type is required.');
  if (input.value === undefined) throw new Error('Evidence value must be explicit; use null only for a controlled unavailable fact.');
  if (!sourceName || !sourceRecordIdentifier || !sourceEndpoint) throw new Error('Evidence requires an authoritative source name, record identifier and endpoint.');
  if (source.authoritative !== true) throw new Error('Evidence source must be explicitly marked authoritative.');
  if (!VALIDATION_STATES.has(validationStatus)) throw new Error(`Unsupported Evidence validation status: ${validationStatus}.`);
  if (!CONFIDENCE_STATES.has(confidenceStatus)) throw new Error(`Unsupported Evidence confidence status: ${confidenceStatus}.`);
  if (!FRESHNESS_STATES.has(freshnessStatus)) throw new Error(`Unsupported Evidence freshness status: ${freshnessStatus}.`);
  if (!CACHE_STATES.has(cacheStatus)) throw new Error(`Unsupported Evidence cache status: ${cacheStatus}.`);
  if (input.value === null && validationStatus !== 'unavailable') throw new Error('Null Evidence values must use the unavailable validation state.');

  return deepFreeze({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    evidenceId: clean(input.evidenceId) || `${subjectType}:${subjectId}:${evidenceType}`,
    subject: {
      entityType: subjectType,
      id: subjectId,
      name: clean(subject.name ?? input.subjectName) || null
    },
    evidenceType,
    value: input.value,
    units: clean(input.units) || null,
    source: {
      name: sourceName,
      authoritative: true,
      recordIdentifier: sourceRecordIdentifier,
      endpoint: sourceEndpoint,
      datasetTimestamp: timestamp(source.datasetTimestamp ?? input.sourceDatasetTimestamp, 'Source dataset timestamp'),
      datasetVersion: clean(source.datasetVersion ?? input.sourceDatasetVersion) || null,
      attribution: clean(source.attribution) || null
    },
    retrievedAt: timestamp(input.retrievedAt, 'Evidence retrieval timestamp', true),
    calculationMethodology: clean(input.calculationMethodology) || null,
    validationStatus,
    confidenceStatus,
    warnings: cleanList(input.warnings),
    freshness: {
      status: freshnessStatus,
      assessedAt: timestamp(input.freshness?.assessedAt, 'Freshness assessment timestamp') || timestamp(input.retrievedAt, 'Evidence retrieval timestamp', true),
      validUntil: timestamp(input.freshness?.validUntil, 'Freshness expiry timestamp')
    },
    cache: {
      status: cacheStatus,
      key: clean(input.cache?.key) || null,
      storedAt: timestamp(input.cache?.storedAt, 'Cache storage timestamp'),
      liveSourceFailed: Boolean(input.cache?.liveSourceFailed)
    }
  });
}

export function evidenceFromCache(evidence, cache) {
  return createEvidence({
    ...evidence,
    subject: evidence.subject,
    source: evidence.source,
    freshness: {
      ...evidence.freshness,
      status: cache.status === 'hit' ? 'cached-current' : evidence.freshness.status
    },
    cache: {
      ...evidence.cache,
      ...cache
    }
  });
}
