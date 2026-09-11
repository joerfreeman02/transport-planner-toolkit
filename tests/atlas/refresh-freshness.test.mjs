import assert from 'node:assert/strict';
import { decideBusRefresh, fridayWindowStart } from '../../tools/atlas-bus-data/refresh-freshness.mjs';

const manifests = {
  status: { schema: 'atlas-bus-refresh-status-v1', status: 'validated', validation: 'passed', successfulRefreshAt: '2026-09-11T06:17:00Z' },
  busManifest: { schema: 'atlas-prepared-bus-data-v1' },
  tndsManifest: { schema: 'atlas-prepared-bus-tnds-v1' }
};

const friday = '2026-09-11T13:00:00Z';
assert.equal(fridayWindowStart(friday).toISOString(), '2026-09-11T00:00:00.000Z');
const alreadyFresh = decideBusRefresh({ ...manifests, now: friday });
assert.equal(alreadyFresh.refreshRequired, false);
assert.equal(alreadyFresh.reason, 'already-fresh');
assert.equal(alreadyFresh.message, 'Bus data already refreshed for this weekly window — no refresh required.');

const saturday = decideBusRefresh({ ...manifests, now: '2026-09-12T10:00:00Z' });
assert.equal(saturday.refreshRequired, false, 'the Friday window remains current on Saturday');

const stale = decideBusRefresh({ ...manifests, now: friday, status: { ...manifests.status, successfulRefreshAt: '2026-09-04T12:23:00Z' } });
assert.equal(stale.refreshRequired, true);
assert.equal(stale.reason, 'stale');

const malformed = decideBusRefresh({ ...manifests, now: friday, status: { ...manifests.status, successfulRefreshAt: 'not-a-date' } });
assert.equal(malformed.refreshRequired, true);
assert.equal(malformed.reason, 'metadata-unavailable');

const missingManifest = decideBusRefresh({ status: manifests.status, busManifest: null, tndsManifest: manifests.tndsManifest, now: friday });
assert.equal(missingManifest.refreshRequired, true, 'missing authoritative manifest metadata fails open to refresh');
assert.equal(missingManifest.reason, 'metadata-unavailable');

const forced = decideBusRefresh({ status: null, busManifest: null, tndsManifest: null, forceRefresh: true, now: friday });
assert.equal(forced.refreshRequired, true);
assert.equal(forced.reason, 'forced');
assert.match(forced.message, /force-refresh/);

console.log('PASS Bus refresh freshness guard — Friday window, stale/malformed metadata fail-open, no-op and force-refresh decisions.');
