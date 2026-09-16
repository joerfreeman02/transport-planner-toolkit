import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/alpha15-waltham-cross-production.json', import.meta.url), 'utf8'));
const records = fixture.serviceRecords.map(({ service }) => service);
const summaries = buildServiceSummaries(fixture.stops, records);
const rows = buildPlannerBusServiceSummaries(summaries, fixture.stops);
const rowsFor = routeNumber => rows.filter(row => row.routeNumber === routeNumber);
const directionsFor = routeNumber => new Set(rowsFor(routeNumber).map(row => row.directionPatternText));
const reportText = row => [
  row.directionPatternText,
  row.operator,
  row.principalLocationsText,
  row.typicalFrequencyText,
  ...(row.operatingPeriodLines ?? []),
  row.serviceNote,
  row.routeGroupNote
].filter(Boolean).join(' ');

assert.deepEqual([...new Set(['13', '25C', '66', '242', '310', 'A1', 'N279'])], ['13', '25C', '66', '242', '310', 'A1', 'N279']);
assert.equal(rowsFor('13').length, 0, '13 has no prepared evidence and must not be fabricated');
assert.equal(rowsFor('N279').length, 0, 'N279 has no prepared evidence and must not be fabricated');

assert.deepEqual(directionsFor('25C'), new Set(['Towards Harlow', 'Towards Waltham Cross']));
assert.ok(rowsFor('25C').every(row => row.operator === 'Central Connect'));
assert.ok(rowsFor('25C').every(row => row.calendarProfileIds.length === 1 && row.calendarProfileIds[0] === 'ordinary'));
assert.ok(rowsFor('25C').every(row => row.canonicalDeparturePopulationAll.monday.length === 1));
assert.ok(rowsFor('25C').every(row => row.canonicalDeparturePopulationAll.saturday.length === 0 && row.canonicalDeparturePopulationAll.sunday.length === 0));

assert.deepEqual(directionsFor('66'), new Set(['Towards Hammond Street', 'Towards Loughton']));
assert.ok(rowsFor('66').every(row => row.publicEndpointEvidence.origin.status === 'resolved'
  && row.publicEndpointEvidence.destination.status === 'resolved'
  && row.publicEndpointEvidence.origin.evidenceClass === 'route-description'));
assert.ok(rowsFor('66').every(row => row.operator === 'Arriva'));
assert.ok(rowsFor('66').every(row => row.frequencyBasisStopId === '210021703430'));
assert.ok(rowsFor('66').every(row => row.rawServiceSummaries.some(service => service.operator === 'Arriva Herts and Essex')));

assert.equal(rowsFor('242').length, 4, '242 keeps two public directions for each current operator');
assert.deepEqual(new Set(rowsFor('242').map(row => row.operator)), new Set(['Central Connect', 'Uno']));
assert.deepEqual(new Set(rowsFor('242').filter(row => row.operator === 'Uno').map(row => row.destination)), new Set(['Potters Bar', 'Waltham Cross']), 'Uno retains its supported public corridor');
assert.ok(rowsFor('242').filter(row => row.operator === 'Central Connect').every(row => row.origin === null && row.destination === null
  && row.publicEndpointEvidence.origin.status === 'unresolved'
  && row.publicEndpointEvidence.destination.status === 'unresolved'
  && !row.publicEndpointEvidence.origin.sourceProviders.length
  && !row.publicEndpointEvidence.destination.sourceProviders.length), 'unsupported Central Connect endpoint labels remain unresolved without fabricated provenance');
assert.ok(rowsFor('242').some(row => row.rawServiceSummaries.some(service => /Welham Green/i.test(`${service.origin} ${service.destination}`))), 'historical Welham Green evidence remains retained below the public headline');

assert.deepEqual(directionsFor('310'), new Set(['Towards Hertford', 'Towards Waltham Cross']));
assert.ok(rowsFor('310').every(row => row.operator === 'Arriva Herts and Essex'));
assert.ok(rowsFor('310').every(row => row.frequencyBasisStopId === '210021703435'));
assert.ok(rowsFor('310').every(row => /15.?20/.test(row.typicalFrequencyText)));

assert.deepEqual(directionsFor('A1'), new Set(['Towards Waltham Abbey', 'Towards Waltham Cross']));
assert.ok(rowsFor('A1').every(row => row.operator === 'Central Connect'));
assert.ok(rowsFor('A1').some(row => row.rawServiceSummaries.some(service => /Quaker Lane|Highbridge/i.test(`${service.origin} ${service.destination}`))), 'A1 alternate terminus evidence remains retained below the public headline');

for (const row of rows.filter(row => ['25C', '66', '242', '310', 'A1'].includes(row.routeNumber))) {
  const unresolved242Endpoints = row.routeNumber === '242' && row.operator === 'Central Connect';
  assert.equal(row.reviewRequired, unresolved242Endpoints, `${row.routeNumber} ${row.operator}: only unsupported unresolved endpoints require review`);
  assert.ok(row.operatorRawNames.length > 0, `${row.routeNumber}: raw operator evidence is retained`);
  assert.match(row.servedAtText, /timetable basis/);
  assert.doesNotMatch(reportText(row), /calendar evidence|source record|diagnostic|prepared feed|GTFS|TNDS|BODS|internal/i, `${row.routeNumber}: internal evidence wording must not leak into the report headline`);
}

const legacyBodsRecord = {
  id: 'legacy-bods-school-calendar',
  routeNumber: 'CASE-LEGACY',
  operator: 'Example Buses',
  origin: 'Origin Town',
  destination: 'Destination Town',
  direction: 'outbound',
  timetableSource: 'BODS',
  qualifications: ['School-day only service'],
  stopSchedules: { A: { monday: [420], tuesday: [420], wednesday: [420], thursday: [420], friday: [420], saturday: [], sunday: [] } },
  stopIds: ['A'],
  frequencyBasisStopId: 'A',
  routePatternStopIds: ['A', 'B'],
  sourceRecordIds: ['legacy-bods-school-calendar']
};
const legacySummary = buildServiceSummaries([{ id: 'A', name: 'Origin Town' }], [legacyBodsRecord])[0];
assert.equal(legacySummary.calendarProfileId, 'school-day', 'legacy BODS qualification blocks ordinary-calendar promotion');
assert.equal(legacySummary.calendarEvidence[0].resolutionStatus, 'derived');

const wordTable = buildBusWordTables({ ok: true, stops: fixture.stops, plannerServiceSummaries: rows, serviceSummaries: [] })[1];
const wordRows = wordTable.rows.filter(row => Array.isArray(row));
for (const row of rows) {
  const wordRow = wordRows.find(candidate => candidate[0] === row.routeNumber && candidate[1] === row.operator && candidate[2] === row.directionPatternText
    && candidate[3] === row.servedAtText && candidate[5] === row.typicalFrequencyText);
  assert.ok(wordRow, `${row.routeNumber} ${row.directionPatternText}: Word row exists`);
  assert.deepEqual(wordRow.slice(0, 7), [
    row.routeNumber,
    row.operator,
    row.directionPatternText,
    row.servedAtText,
    row.principalLocationsText,
    row.typicalFrequencyText,
    row.operatingPeriodLines.join('\n')
  ], `${row.routeNumber} ${row.directionPatternText}: Browser and Word share semantic fields`);
}

console.log('PASS Alpha.16 bus semantic golden acceptance:', JSON.stringify({ rows: rows.length, targetRoutes: ['13', '25C', '66', '242', '310', 'A1', 'N279'] }));
