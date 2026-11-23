import assert from 'node:assert/strict';
import { mergeBusTimetableSources } from '../../src/atlas/domain/bus-timetable-merge.mjs';

const schedule = values => ({ monday: [...values], tuesday: [...values], wednesday: [...values], thursday: [...values], friday: [...values], saturday: [], sunday: [] });
const service = (id, overrides = {}) => ({
  id, routeNumber: '46', operator: 'Centrebus', origin: 'Park Square', destination: 'Hemel Hempstead', direction: 'towards-hemel',
  routePatternStopIds: ['START', 'LOCAL', 'HEMEL'], stopSchedules: { LOCAL: schedule([420, 480]) },
  timetableSource: id.startsWith('tnds:') ? 'TNDS' : 'BODS', source: { provider: id.startsWith('tnds:') ? 'TNDS' : 'BODS' }, ...overrides
});

const equivalent46 = mergeBusTimetableSources({
  bods: [service('bods:46')],
  tnds: [service('tnds:46', { operator: 'Centrebus South' })]
});
assert.equal(equivalent46.length, 1, 'provider copies with identical route, operator family, local stops, ordered corridor and direction share one public service');
assert.equal(equivalent46[0].timetableSource, 'BODS', 'BODS remains primary');
assert.deepEqual(equivalent46[0].stopSchedules.LOCAL.monday, [420, 480], 'TNDS does not double-count scheduled departures');
assert.deepEqual(equivalent46[0].sourceProviders, ['BODS', 'TNDS']);
assert.deepEqual(equivalent46[0].supplementarySourceRecords.map(record => record.id), ['tnds:46']);

const independent242 = mergeBusTimetableSources({
  bods: [service('bods:242', { routeNumber: '242', operator: 'Central Connect' })],
  tnds: [service('tnds:242', { routeNumber: '242', operator: 'Uno' })]
});
assert.equal(independent242.length, 2, 'Central Connect and Uno remain independent route-242 services');

const different65Corridors = mergeBusTimetableSources({
  bods: [service('bods:65-main', { routeNumber: '65', operator: 'Stagecoach West', routePatternStopIds: ['A', 'LOCAL', 'C'] })],
  tnds: [service('tnds:65-branch', { routeNumber: '65', operator: 'Stagecoach West', routePatternStopIds: ['A', 'LOCAL', 'B', 'C'], calendarProfileId: 'weekend-variant' })]
});
assert.equal(different65Corridors.length, 2, 'overlapping Route-65 calendar profiles with different ordered corridors stay distinct');

const differentOperator = mergeBusTimetableSources({
  bods: [service('bods:9', { routeNumber: '9', operator: 'Centrebus' })],
  tnds: [service('tnds:9', { routeNumber: '9', operator: 'Community Transport' })]
});
assert.equal(differentOperator.length, 2, 'similar route metadata cannot merge unrelated operators');

const localPattern = Array.from({ length: 48 }, (_, index) => `PHYSICAL-${index}`);
const route46BodsPattern = [...localPattern.slice(0, 9), 'gtfs:agency:PHYSICAL-ALIAS', ...localPattern.slice(9), 'HEMEL-STOP-A'];
const route46TndsPattern = [...localPattern, 'HEMEL-STOP-B'];
const route46Bods = service('bods:46-outbound', {
  routeNumber: '46', operator: 'Centrebus', origin: 'Park Square', destination: 'Bridge Street',
  direction: 'Hemel Hempstead, Bridge Street (Stop A)', routePatternStopIds: route46BodsPattern,
  stopSchedules: { 'PHYSICAL-20': schedule([420, 480]), 'PHYSICAL-21': schedule([421, 481]) }, calendarProfileId: null
});
const route46Tnds = service('tnds:46-outbound', {
  routeNumber: '46', operator: 'Centrebus South', origin: 'Park Square', destination: 'Hemel Hempstead',
  direction: 'outbound', routePatternStopIds: route46TndsPattern,
  stopSchedules: { 'PHYSICAL-20': schedule([420]) }, calendarProfileId: 'ordinary'
});
const reconciled46 = mergeBusTimetableSources({ bods: [route46Bods], tnds: [route46Tnds] });
assert.equal(reconciled46.length, 1, 'a near-identical ordered cross-provider corridor with common exact local stops, matching endpoint context and compatible operator family is one public service');
assert.equal(reconciled46[0].timetableSource, 'BODS');
assert.deepEqual(reconciled46[0].stopSchedules['PHYSICAL-20'].monday, [420, 480], 'the TNDS overlap is not added to BODS departures');
assert.ok(reconciled46[0].sourceProviders.includes('TNDS'));
assert.ok(reconciled46[0].serviceNotes.some(note => /variants are retained in source provenance/.test(note)), 'schedule differences remain visible as a source variation note');

const repeatedTndsPatterns = Array.from({ length: 8 }, (_, index) => ({
  patternId: `provider-pattern-${index + 1}`,
  routePatternStopIds: route46TndsPattern,
  operatingProfile: { calendarProfileId: 'ordinary' }
}));
const repeatedPattern46 = mergeBusTimetableSources({
  bods: [route46Bods],
  tnds: [route46Tnds, service('tnds:46-outbound-copy', {
    operator: 'Centrebus South',
    routePatternStopIds: route46TndsPattern,
    stopSchedules: route46Tnds.stopSchedules,
    patternVariants: repeatedTndsPatterns,
    source: { provider: 'TNDS', patternId: 'provider-pattern-set' }
  })]
});
assert.equal(repeatedPattern46.length, 1, 'provider-specific pattern identifiers do not split multiple same-corridor variants');

const materialVariant46 = mergeBusTimetableSources({
  bods: [route46Bods],
  tnds: [service('tnds:46-outbound-branch', {
    operator: 'Centrebus South',
    routePatternStopIds: route46TndsPattern,
    stopSchedules: route46Tnds.stopSchedules,
    patternVariants: [
      ...repeatedTndsPatterns,
      { patternId: 'branch', routePatternStopIds: [...localPattern.slice(0, 30), ...Array.from({ length: 12 }, (_, index) => `BRANCH-${index}`)] }
    ]
  })]
});
assert.equal(materialVariant46.length, 2, 'a materially different TNDS pattern variant prevents cross-provider grouping');

const differentRoute46Branch = mergeBusTimetableSources({
  bods: [route46Bods],
  tnds: [service('tnds:46-branch', { routeNumber: '46', operator: 'Centrebus South', origin: 'Park Square', destination: 'Different Valley', direction: 'outbound', routePatternStopIds: [...localPattern.slice(0, 38), ...Array.from({ length: 10 }, (_, index) => `OTHER-${index}`)], stopSchedules: { 'PHYSICAL-20': schedule([420]) } })]
});
assert.equal(differentRoute46Branch.length, 2, 'different terminals and a materially different branch remain independent');

const incompatibleCalendar = mergeBusTimetableSources({
  bods: [service('bods:calendar', { calendarProfileId: 'school-term', routePatternStopIds: route46TndsPattern })],
  tnds: [service('tnds:calendar', { calendarProfileId: 'school-holiday', routePatternStopIds: route46TndsPattern })]
});
assert.equal(incompatibleCalendar.length, 2, 'equal route geometry cannot erase incompatible calendar populations');

console.log('PASS semantic BODS/TNDS reconciliation keeps provider provenance, suppresses duplicate departures and preserves independent operators and corridors.');
