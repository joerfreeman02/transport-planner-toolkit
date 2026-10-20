import assert from 'node:assert/strict';
import { measureTndsRecord, summariseTndsRecordMeasurements } from '../../tools/atlas-bus-data/measure_tnds_records.mjs';

const record = {
  id: 'tnds:SE:control.xml:SVC-1:pattern:JP-1',
  routeNumber: '230',
  operator: 'Control Operator',
  routePatternStopIds: ['490000000A', '490000000B'],
  stopSchedules: {
    '490000000A': { monday: [480, 540] },
    '490010000B': { monday: [490] }
  },
  departureEvidenceByDay: { monday: [{ journeyIdentity: 'J1', stopPointId: '490000000A' }] },
  calendarEvidence: [{ calendarProfileId: 'CAL-1' }],
  patternVariants: [{ patternId: 'JP-1' }],
  source: { region: 'SE', archive: 'control.xml' }
};

const measured = measureTndsRecord(record, { region: 'SE', sourceFile: 'SE/control.xml' });
assert.equal(measured.bytes, Buffer.byteLength(JSON.stringify(record)));
assert.equal(measured.region, 'SE');
assert.equal(measured.sourceFile, 'control.xml');
assert.equal(measured.stopCount, 2);
assert.equal(measured.scheduleDepartureCount, 3);
assert.equal(measured.journeyEvidenceCount, 1);
assert.equal(measured.calendarEvidenceCount, 1);
assert.equal(measured.patternVariantCount, 1);
assert.equal(measured.routePatternStopCount, 2);
assert.equal(measured.stopPrefixCopies, 2);
assert.equal(measured.estimatedDuplicatedMetadataBytesAcrossStopPrefixes, measured.bytes);

const sizes = [
  { ...measured, id: 'normal', bytes: 1024, region: 'EA' },
  { ...measured, id: 'over-8', bytes: 8 * 1024 * 1024 + 1, region: 'SE' },
  { ...measured, id: 'over-12', bytes: 12 * 1024 * 1024 + 1, region: 'SW' },
  { ...measured, id: 'over-16', bytes: 16 * 1024 * 1024 + 1, region: 'NW' },
  { ...measured, id: 'over-32', bytes: 32 * 1024 * 1024 + 1, region: 'Y' }
];
const summary = summariseTndsRecordMeasurements(sizes, { xmlFileCount: 5, ignoredRegistrationFileCount: 1 });
assert.equal(summary.recordCount, 5);
assert.equal(summary.distinctRecordIdentityCount, 5);
assert.equal(summary.logicalDepartureEvidenceCount, 5);
assert.equal(typeof summary.perRegionIdentitySha256.SE, 'string');
assert.equal(typeof summary.perRegionIdentitySha256.SW, 'string');
assert.equal(summary.xmlFileCount, 5);
assert.equal(summary.ignoredRegistrationFileCount, 1);
assert.equal(summary.serializedBytes.countOver8MiB, 4);
assert.equal(summary.serializedBytes.countOver12MiB, 3);
assert.equal(summary.serializedBytes.countOver16MiB, 2);
assert.equal(summary.serializedBytes.countOver32MiB, 1);
assert.deepEqual(summary.top25.map(item => item.id), ['over-32', 'over-16', 'over-12', 'over-8', 'normal']);

console.log('ATLAS TNDS logical record measurement contract passed.');
