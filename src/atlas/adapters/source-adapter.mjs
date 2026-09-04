import { evidenceFromCache } from '../domain/evidence.mjs';

export const SOURCE_FAILURE_CODES = Object.freeze(['timeout', 'http_failure', 'invalid_response', 'unavailable_source', 'invalid_request', 'coverage_not_implemented']);

export function sourceSuccess({ data, evidence = [], provenance, warnings = [], cache = { status: 'not-used' } }) {
  return Object.freeze({ ok: true, data, evidence, provenance, warnings, cache });
}

export function sourceFailure({ code, message, provenance, warnings = [], cache = { status: 'not-used' }, status = null }) {
  if (!SOURCE_FAILURE_CODES.includes(code)) throw new Error(`Unsupported source failure code: ${code}.`);
  return Object.freeze({ ok: false, code, message, status, provenance, warnings, cache, data: null, evidence: [] });
}

export async function runCachedSourceQuery({ cache, cacheKey, freshForMs, forceRefresh = false, load }) {
  const cached = cache?.read(cacheKey, { freshForMs }) ?? { status: 'miss', value: null };
  if (!forceRefresh && cached.status === 'hit' && cached.value?.ok) {
    return sourceSuccess({
      ...cached.value,
      evidence: cached.value.evidence.map(item => evidenceFromCache(item, { status: 'hit', key: cached.key, storedAt: cached.storedAt })),
      cache: { status: 'hit', key: cached.key, storedAt: cached.storedAt }
    });
  }

  const live = await load();
  if (!live.ok) {
    return sourceFailure({
      ...live,
      cache: cached.status === 'stale'
        ? { status: 'stale', key: cached.key, storedAt: cached.storedAt, staleAvailable: true, liveSourceFailed: true }
        : { status: cached.status || 'miss', liveSourceFailed: true }
    });
  }

  const write = cache?.write(cacheKey, live) ?? { status: 'not-used' };
  return sourceSuccess({ ...live, cache: write });
}
