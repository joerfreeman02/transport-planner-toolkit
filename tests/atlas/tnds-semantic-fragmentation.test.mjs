import assert from 'node:assert/strict';
import { fragmentTndsServiceRecord, TNDS_RUNTIME_SHARD_MAX_BYTES } from '../../tools/atlas-bus-data/prepare_tnds.mjs';
import { reassemblePreparedTndsFragments } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const evidence = Object.fromEntries(days.map(day => [day, []]));
for (let index = 0; index < 76000; index += 1) evidence.monday.push({
  minute: 420 + index % 600,
  stopPointId: '490010000A',
  journeyIdentity: `JP-51-C1-_-y08-1-11-I-7-VJ-${String(index).padStart(6, '0')}`,
  sourceRecordId: '51-C1-_-y08-1',
  provider: 'TNDS',
  patternIdentity: 'JP_51-C1-_-y08-1-11-I-7',
  calendarProfileId: 'school-day',
  evidenceNote: `Vehicle journey ${index} on the principal outbound pattern`
});

function parent(id) {
  return {
    id, routeNumber: '230', operator: 'Fixture Operator', origin: 'Origin', destination: 'Destination', direction: 'outbound',
    principalLocations: ['Town Centre'], routePatternStopIds: ['490010000A', '490010000B'],
    routePatternStops: [{ id: '490010000A', name: 'Town Centre' }, { id: '490010000B', name: 'Terminus' }],
    originStopPointId: '490010000A', destinationStopPointId: '490010000B',
    patternVariants: [{ patternId: 'JP_51-C1-_-y08-1-11-I-7', routePatternStopIds: ['490010000A', '490010000B'] }],
    stopSchedules: { '490010000A': { monday: [420, 421], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } },
    departureEvidenceByDay: evidence, calendarEvidence: [{ calendarProfileId: 'school-day', schoolDayOnly: true, daysOfWeek: ['monday'] }],
    serviceNotes: [], sourceWarnings: [], source: { provider: 'TNDS', region: 'SE', archive: 'fixture.zip', serviceCode: '51-C1', patternVariantId: 'JP_51-C1-_-y08-1-11-I-7' }
  };
}

const ordinary = parent('tnds:ordinary');
ordinary.departureEvidenceByDay = Object.fromEntries(days.map(day => [day, []]));
ordinary.departureEvidenceByDay.monday = [{ ...evidence.monday[0] }];
assert.deepEqual(fragmentTndsServiceRecord(ordinary), [ordinary], 'ordinary logical services remain unfragmented');

const first = parent('tnds:oversized:one');
const second = parent('tnds:oversized:two');
const firstParts = fragmentTndsServiceRecord(first);
const secondParts = fragmentTndsServiceRecord(second);
assert.ok(firstParts.length > 1, 'Run #68 style journey-expanded record is semantically fragmented');
assert.ok(firstParts.every(part => Buffer.byteLength(JSON.stringify(part)) <= TNDS_RUNTIME_SHARD_MAX_BYTES));
assert.ok(firstParts.every(part => part.fragment.parentServiceId === first.id));
assert.deepEqual(firstParts.map(part => part.fragment.ordinal), firstParts.map((_, index) => index + 1));
assert.ok(firstParts.every(part => part.fragment.count === firstParts.length));

function descriptors(parts, prefix) {
  return parts.map((part, index) => ({
    path: `${prefix}-${index + 1}.json.gz`,
    parentServiceId: part.fragment.parentServiceId,
    fragmentId: part.fragment.fragmentId,
    fragmentOrdinal: part.fragment.ordinal,
    fragmentCount: part.fragment.count,
    fragmentDepartureEvidenceCount: part.fragment.fragmentDepartureEvidenceCount,
    parentDepartureEvidenceCount: part.fragment.parentDepartureEvidenceCount,
    parentEvidenceByDayCounts: part.fragment.parentEvidenceByDayCounts
  }));
}
const firstDescriptors = descriptors(firstParts, 'first');
const secondDescriptors = descriptors(secondParts, 'second');
const rows = [
  ...firstParts.map((service, index) => ({ path: firstDescriptors[index].path, service })),
  ...secondParts.map((service, index) => ({ path: secondDescriptors[index].path, service }))
];
const restored = reassemblePreparedTndsFragments(rows, [...firstDescriptors, ...secondDescriptors]);
assert.equal(restored.ok, true);
assert.equal(restored.services.length, 2, 'distinct parent identities remain distinct');
for (const [id, expected] of [[first.id, first], [second.id, second]]) {
  const actual = restored.services.find(service => service.id === id);
  assert.ok(actual);
  assert.deepEqual(actual.departureEvidenceByDay, expected.departureEvidenceByDay, 'complete journey evidence is reconstructed in order');
  for (const key of ['routeNumber', 'operator', 'origin', 'destination', 'direction', 'principalLocations', 'routePatternStopIds', 'routePatternStops', 'patternVariants', 'stopSchedules', 'calendarEvidence', 'source']) {
    assert.deepEqual(actual[key], expected[key], `${key} survives losslessly`);
  }
}
assert.equal(reassemblePreparedTndsFragments(rows.slice(1), [...firstDescriptors, ...secondDescriptors]).ok, false, 'missing fragment fails closed');
assert.equal(reassemblePreparedTndsFragments(rows, [...firstDescriptors.slice(1), ...secondDescriptors]).ok, false, 'missing manifest fragment fails closed');

const crossPrefixDescriptors = firstDescriptors.map((descriptor, index) => ({ ...descriptor, path: `cross-prefix-${index + 1}.json.gz` }));
const crossPrefixRows = [...rows.filter(row => row.path.startsWith('first-')),
  ...firstParts.map((service, index) => {
    const scopedCopy = structuredClone(service);
    scopedCopy.stopSchedules = { '490020000B': { monday: [600], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } };
    scopedCopy.tndsQuarantine = { serviceQuarantined: false, affectedStopIds: ['490020000B'], patterns: [{ patternId: 'JP-uncertain', reasonCode: 'missing_timing_links', affectedStopIds: ['490020000B'] }] };
    return { path: crossPrefixDescriptors[index].path, service: scopedCopy };
  })];
const crossPrefix = reassemblePreparedTndsFragments(crossPrefixRows, [...firstDescriptors, ...crossPrefixDescriptors]);
assert.equal(crossPrefix.ok, true, 'same evidence fragments with different prefix-scoped stop schedules reassemble');
assert.deepEqual(crossPrefix.services[0].departureEvidenceByDay, first.departureEvidenceByDay);
assert.deepEqual(Object.keys(crossPrefix.services[0].stopSchedules).sort(), ['490010000A', '490020000B'], 'stop schedules from each prefix copy are merged');
assert.deepEqual(crossPrefix.services[0].tndsQuarantine.affectedStopIds, ['490020000B'], 'prefix-scoped quarantine evidence is retained');
const conflictingCopyRows = crossPrefixRows.map(row => ({ ...row, service: structuredClone(row.service) }));
conflictingCopyRows.at(-1).service.departureEvidenceByDay.monday[0].evidenceNote = 'conflicting prefix copy';
assert.equal(reassemblePreparedTndsFragments(conflictingCopyRows, [...firstDescriptors, ...crossPrefixDescriptors]).ok, false, 'conflicting stop-prefix copies fail closed');

const interleaved = parent('tnds:interleaved-order');
interleaved.departureEvidenceByDay = Object.fromEntries(days.map(day => [day, []]));
interleaved.departureEvidenceByDay.monday = [
  { journeyIdentity: 'z-first', payload: 'z'.repeat(600) },
  { journeyIdentity: 'a-second', payload: 'a'.repeat(600) },
  { journeyIdentity: 'y-third', payload: 'y'.repeat(600) },
  { journeyIdentity: 'b-fourth', payload: 'b'.repeat(600) }
];
const interleavedParts = fragmentTndsServiceRecord(interleaved, 3000);
assert.ok(interleavedParts.length > 1, 'fixture groups interleaved rows at semantic journey boundaries');
const interleavedDescriptors = descriptors(interleavedParts, 'interleaved');
const interleavedRestored = reassemblePreparedTndsFragments(interleavedParts.map((service, index) => ({ path: interleavedDescriptors[index].path, service })), interleavedDescriptors);
assert.equal(interleavedRestored.ok, true);
assert.deepEqual(interleavedRestored.services[0].departureEvidenceByDay, interleaved.departureEvidenceByDay, 'interleaved input row order is restored exactly');

const indivisible = parent('tnds:indivisible');
indivisible.departureEvidenceByDay = Object.fromEntries(days.map(day => [day, []]));
indivisible.departureEvidenceByDay.monday = [{ journeyIdentity: 'one-journey', payload: 'x'.repeat(TNDS_RUNTIME_SHARD_MAX_BYTES) }];
assert.throws(() => fragmentTndsServiceRecord(indivisible), /one journey identity requiring|fragment .* measures/);

console.log(`PASS TNDS journey-boundary fragmentation, exact reassembly and fail-closed parent identity checks (${firstParts.length + secondParts.length} fragments).`);
