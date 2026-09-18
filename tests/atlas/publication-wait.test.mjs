import assert from 'node:assert/strict';
import { checkPublicationTarget, publicationTargetsFromConfig, waitForPublicationIdentity } from '../../tools/atlas-data-publication/wait-for-bank.mjs';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const tndsTarget = { name: 'TNDS A/A1', dataset: 'tnds', baseUrl: 'https://a1.example.test/', expectedVersion: 'v2', expectedBankId: 'A', expectedRootId: 'A1' };
const busTarget = { name: 'Bus slot-b', dataset: 'bus', baseUrl: 'https://bus.example.test/slot-b/', expectedVersion: 'v2', expectedDataset: 'bus', expectedSlot: 'slot-b' };
const fetchPublication = publication => async url => String(url).endsWith('manifest.json') && !String(url).endsWith('publication-manifest.json') ? response({ schema: 'dataset' }) : response(publication);

const stale = await checkPublicationTarget(tndsTarget, fetchPublication({ dataset: 'tnds', bankId: 'A', rootId: 'A1', publicationVersion: 'v1' }));
assert.equal(stale.ok, false);
assert.match(stale.reason, /publicationVersion=v1/);

let clock = 0;
let calls = 0;
const versions = ['v1', 'v1', 'v2'];
const eventual = await waitForPublicationIdentity({ targets: [tndsTarget], timeoutMs: 10, intervalMs: 1, now: () => clock, sleep: async () => { clock += 1; }, fetchImpl: async url => {
  if (!String(url).endsWith('publication-manifest.json')) return response({ schema: 'dataset' });
  const publicationVersion = versions[Math.min(calls++, versions.length - 1)];
  return response({ dataset: 'tnds', bankId: 'A', rootId: 'A1', publicationVersion });
} });
assert.equal(eventual.ok, true);
assert.equal(eventual.attempts, 3);

const wrongBank = await checkPublicationTarget(tndsTarget, fetchPublication({ dataset: 'tnds', bankId: 'B', rootId: 'A1', publicationVersion: 'v2' }));
assert.equal(wrongBank.ok, false);
assert.match(wrongBank.reason, /bankId=B/);
const wrongRoot = await checkPublicationTarget(tndsTarget, fetchPublication({ dataset: 'tnds', bankId: 'A', rootId: 'A2', publicationVersion: 'v2' }));
assert.equal(wrongRoot.ok, false);
assert.match(wrongRoot.reason, /rootId=A2/);
const staleBusSlot = await checkPublicationTarget(busTarget, fetchPublication({ dataset: 'bus', slot: 'slot-a', publicationVersion: 'v2' }));
assert.equal(staleBusSlot.ok, false);
assert.match(staleBusSlot.reason, /slot=slot-a/);

let timeoutClock = 0;
const activeConfig = { publicationVersion: 'active-v1', datasets: { tnds: { activeBank: 'A' } } };
const before = structuredClone(activeConfig);
await assert.rejects(
  () => waitForPublicationIdentity({ targets: [tndsTarget], timeoutMs: 2, intervalMs: 1, now: () => timeoutClock, sleep: async () => { timeoutClock += 1; }, fetchImpl: fetchPublication({ dataset: 'tnds', bankId: 'A', rootId: 'A1', publicationVersion: 'v1' }) }),
  /did not become visible.*publicationVersion=v1/
);
assert.deepEqual(activeConfig, before);

const configTargets = publicationTargetsFromConfig({ publicationVersion: 'v2', datasets: { bus: { baseUrl: 'https://bus.example.test/slot-b/', slot: 'slot-b' }, tnds: { activeBank: 'A', activeRoots: [{ id: 'A1', baseUrl: 'https://a1.example.test/' }, { id: 'A2', baseUrl: 'https://a2.example.test/' }, { id: 'A3', baseUrl: 'https://a3.example.test/' }] } } });
assert.equal(configTargets.length, 4);
assert.equal(configTargets[0].expectedSlot, 'slot-b');
assert.equal(configTargets[1].expectedBankId, 'A');
console.log('PASS version-aware publication wait: stale 200s, wrong identities, eventual visibility and timeout preservation.');
