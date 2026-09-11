import fs from 'node:fs';

const STATUS_SCHEMA = 'atlas-bus-refresh-status-v1';
const BUS_SCHEMA = 'atlas-prepared-bus-data-v1';
const TNDS_SCHEMA = 'atlas-prepared-bus-tnds-v1';

function asDate(value) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function asBoolean(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

export function fridayWindowStart(now = new Date()) {
  const current = asDate(now);
  if (!current) return null;
  const day = current.getUTCDay();
  const daysSinceFriday = (day + 7 - 5) % 7;
  return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - daysSinceFriday));
}

function metadataIsComplete({ status, busManifest, tndsManifest }) {
  return status?.schema === STATUS_SCHEMA
    && status?.status === 'validated'
    && status?.validation === 'passed'
    && busManifest?.schema === BUS_SCHEMA
    && tndsManifest?.schema === TNDS_SCHEMA;
}

export function decideBusRefresh({ status, busManifest, tndsManifest, forceRefresh = false, now = new Date() } = {}) {
  const current = asDate(now);
  if (forceRefresh) return Object.freeze({
    refreshRequired: true,
    reason: 'forced',
    message: 'Manual force-refresh requested — full validated Bus refresh required.',
    successfulRefreshAt: null,
    windowStart: fridayWindowStart(current)?.toISOString() ?? null
  });
  if (!current || !metadataIsComplete({ status, busManifest, tndsManifest })) return Object.freeze({
    refreshRequired: true,
    reason: 'metadata-unavailable',
    message: 'Authoritative deployed Bus refresh metadata is unavailable or invalid — fail open to refresh.',
    successfulRefreshAt: null,
    windowStart: fridayWindowStart(current)?.toISOString() ?? null
  });
  const successfulRefresh = asDate(status.successfulRefreshAt);
  const windowStart = fridayWindowStart(current);
  if (!successfulRefresh || !windowStart) return Object.freeze({
    refreshRequired: true,
    reason: 'metadata-unavailable',
    message: 'Authoritative deployed Bus refresh timestamp is unavailable or invalid — fail open to refresh.',
    successfulRefreshAt: status.successfulRefreshAt ?? null,
    windowStart: windowStart?.toISOString() ?? null
  });
  const alreadyFresh = successfulRefresh >= windowStart && successfulRefresh <= current;
  return Object.freeze({
    refreshRequired: !alreadyFresh,
    reason: alreadyFresh ? 'already-fresh' : 'stale',
    message: alreadyFresh
      ? 'Bus data already refreshed for this weekly window — no refresh required.'
      : 'The deployed Bus refresh is stale for this weekly window — full refresh required.',
    successfulRefreshAt: successfulRefresh.toISOString(),
    windowStart: windowStart.toISOString()
  });
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] && process.argv[1].endsWith('refresh-freshness.mjs')) {
  const decision = decideBusRefresh({
    status: readJson(option('--status')),
    busManifest: readJson(option('--bus')),
    tndsManifest: readJson(option('--tnds')),
    forceRefresh: asBoolean(option('--force-refresh')),
    now: option('--now') || new Date()
  });
  console.log(`refresh_required=${decision.refreshRequired}`);
  console.log(`reason=${decision.reason}`);
  console.log(`message=${decision.message}`);
  console.log(`successful_refresh_at=${decision.successfulRefreshAt ?? ''}`);
  console.log(`window_start=${decision.windowStart ?? ''}`);
}
