import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveTflIbusOperatorEvidence, validateTflIbusOperatorIndex, createTflIbusOperatorAdapter } from '../../src/atlas/adapters/tfl-ibus-operator-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { operatorProvenanceLabel } from '../../src/atlas/domain/bus-service-assessment.mjs';

const baseVersion = '20261009';
const assessmentDate = '2026-10-09';
const currentIndex = JSON.parse(fs.readFileSync(new URL('../../atlas/data/tfl-ibus/20261009/operator-index.json', import.meta.url), 'utf8'));
const makeIndex = () => ({
  schema: 'tfl-ibus-operator-index-v1',
  baseVersion,
  validFrom: '2026-10-08T00:00:00',
  validTo: '2026-11-05T00:00:00',
  assessmentDate,
  serviceLines: [{ serviceLineNo: 'X1', contractLineNo: 'C42', logicalLineNo: '42', baseVersion }],
  patterns: [{
    patternIdx: 'p1', serviceLineNo: 'X1', contractLineNo: 'C42', direction: '1', patternType: 1,
    orderedStopPointIds: ['A', 'B', 'C'], baseVersion,
    journeys: [{
      journeyIdx: 'j1', journeyType: 1, blockIdx: 'b1', operatorCode: 'OP1', operatorName: 'Operator One',
      startTimeSeconds: '25200', baseVersion, scheduleObjectKey: 'schedule_OP1_20261009.zip',
      calendarEvidence: [{ calendarDay: assessmentDate, blockRunsOnDay: true, baseVersion }]
    }]
  }],
  source: { provider: 'TfL iBus Static Data', retrievedAt: '2026-10-09T13:18:28Z', objects: { 'Base_Version.xml': {} } }
});
const makeService = (updates = {}) => ({
  id: 'tfl:X1:outbound:p1', routeNumber: 'X1', operator: '', origin: 'Alpha', destination: 'Charlie', direction: 'outbound',
  originStopPointId: 'A', destinationStopPointId: 'C', routePatternStopIds: ['A', 'B', 'C'],
  stopSchedules: { B: { monday: [420], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } },
  frequencyEvidence: [{ periodType: 'FrequencyMinutes', day: 'monday', fromMinute: 420, toMinute: 480, lowestFrequency: 10, highestFrequency: 10 }],
  operatingPeriodEvidence: [{ periodType: 'Daytime', day: 'monday', fromMinute: 360, toMinute: 1200 }],
  calendarEvidence: [{ daysOfWeek: ['monday'], calendarProfileId: 'weekday' }],
  source: { provider: 'TfL', lineId: 'X1', routePatternStartIsAssessedStop: false },
  ...updates
});

// 1. One Base_Version is present through every index lineage record.
validateTflIbusOperatorIndex(currentIndex);
assert.equal(currentIndex.baseVersion, baseVersion);

// 2. Mixed Base_Version records fail closed.
const mixed = makeIndex();
mixed.patterns[0].journeys[0].baseVersion = '20260101';
assert.throws(() => validateTflIbusOperatorIndex(mixed), /Mixed TfL iBus Base_Version/);
const mixedCalendarVersion = makeIndex();
mixedCalendarVersion.patterns[0].journeys[0].calendarEvidence[0].baseVersion = '20260101';
assert.throws(() => validateTflIbusOperatorIndex(mixedCalendarVersion), /Mixed TfL iBus Base_Version in Block_CalendarDay/);

// A shared Base_Version does not allow one date's active operator to leak into another.
const twoDateIndex = makeIndex();
const dayA = '2026-10-09';
const dayB = '2026-10-10';
const noServiceDay = '2026-10-11';
const journeyA = twoDateIndex.patterns[0].journeys[0];
journeyA.calendarEvidence = [
  { calendarDay: dayA, blockRunsOnDay: true, baseVersion },
  { calendarDay: dayB, blockRunsOnDay: false, baseVersion },
  { calendarDay: noServiceDay, blockRunsOnDay: false, baseVersion }
];
twoDateIndex.patterns[0].journeys.push({
  ...journeyA,
  journeyIdx: 'j2',
  blockIdx: 'b2',
  operatorCode: 'OP2',
  operatorName: 'Operator Two',
  calendarEvidence: [
    { calendarDay: dayA, blockRunsOnDay: false, baseVersion },
    { calendarDay: dayB, blockRunsOnDay: true, baseVersion },
    { calendarDay: noServiceDay, blockRunsOnDay: false, baseVersion }
  ]
});
validateTflIbusOperatorIndex(twoDateIndex);
const resolvedDayA = resolveTflIbusOperatorEvidence(makeService(), twoDateIndex, dayA);
const resolvedDayB = resolveTflIbusOperatorEvidence(makeService(), twoDateIndex, dayB);
assert.equal(resolvedDayA.operator.code, 'OP1');
assert.deepEqual(resolvedDayA.patterns.flatMap(pattern => pattern.journeys.map(item => item.journeyIdx)), ['j1'], 'inactive block on day A is excluded');
assert.ok(resolvedDayA.patterns.flatMap(pattern => pattern.journeys).every(item => item.calendarEvidence.every(calendar => calendar.calendarDay === dayA && calendar.blockRunsOnDay)));
assert.equal(resolvedDayB.operator.code, 'OP2', 'day B resolves from its own active block, not day A evidence');
assert.deepEqual(resolvedDayB.patterns.flatMap(pattern => pattern.journeys.map(item => item.journeyIdx)), ['j2']);
assert.equal(resolveTflIbusOperatorEvidence(makeService(), twoDateIndex, noServiceDay).status, 'no-active-journey-on-date', 'an inactive valid day does not borrow another day’s operator');

// 3-4. Passenger-facing Service_Line_No maps to a different internal contract; Logical_Line_No is not substituted.
assert.equal(currentIndex.serviceLines[0].serviceLineNo, '313');
assert.equal(currentIndex.serviceLines[0].contractLineNo, '313');
assert.equal(currentIndex.serviceLines[0].logicalLineNo, '518');
const similarLogicalLine = makeIndex();
similarLogicalLine.serviceLines.push({ serviceLineNo: 'X2', contractLineNo: 'C43', logicalLineNo: 'X1', baseVersion });
assert.equal(resolveTflIbusOperatorEvidence(makeService(), similarLogicalLine, assessmentDate).status, 'resolved', 'only Service_Line_No is used for the passenger route key');

// 5-6. Only productive Patterns and productive Journeys may resolve.
const nonProductivePattern = makeIndex();
nonProductivePattern.patterns[0].patternType = 2;
assert.throws(() => validateTflIbusOperatorIndex(nonProductivePattern), /productive Pattern/);
const nonProductiveJourney = makeIndex();
nonProductiveJourney.patterns[0].journeys[0].journeyType = 2;
assert.throws(() => validateTflIbusOperatorIndex(nonProductiveJourney), /productive Journey/);

// 7-8. Ordered Stop_In_Pattern NaPTAN sequence and assessment-stop mapping are required.
const chingfordPattern = currentIndex.patterns.find(pattern => pattern.patternIdx === '815');
assert.equal(chingfordPattern.orderedStopPointIds[0], '490001063D');
assert.equal(chingfordPattern.orderedStopPointIds.at(-1), '210021000020');
assert.equal(resolveTflIbusOperatorEvidence(makeService(), makeIndex(), assessmentDate).status, 'resolved');
const wrongOrder = makeService({ routePatternStopIds: ['A', 'C', 'B'] });
assert.equal(resolveTflIbusOperatorEvidence(wrongOrder, makeIndex(), assessmentDate).status, 'no-structured-pattern-match');
const missingAssessedStop = makeService({ stopSchedules: { Z: { monday: [420] } } });
assert.equal(resolveTflIbusOperatorEvidence(missingAssessedStop, makeIndex(), assessmentDate).status, 'no-structured-pattern-match');

// 9-11. Journey -> Block -> Operator_Code -> Operator_Name lineage is retained.
const journey = currentIndex.patterns.flatMap(pattern => pattern.journeys).find(item => item.journeyIdx === '438364');
assert.equal(journey.blockIdx, '19158');
assert.equal(journey.operatorCode, 'MN');
assert.equal(journey.operatorName, 'Arriva London North');
assert.equal(journey.journeyType, 1);

// The committed 313 index retains real calendar rows across the full Base_Version window.
const realCalendarDays = new Set(currentIndex.patterns.flatMap(pattern => pattern.journeys.flatMap(item => item.calendarEvidence.map(calendar => calendar.calendarDay))));
assert.ok(realCalendarDays.size > 1, 'real production index contains multiple Block_CalendarDay dates');
assert.ok([...realCalendarDays].every(day => day >= currentIndex.validFrom.slice(0, 10) && day < currentIndex.validTo.slice(0, 10)), 'real index excludes calendar dates outside Base_Version validity');
const realPatternForDayB = currentIndex.patterns.find(pattern => pattern.serviceLineNo === '313'
  && pattern.journeys.some(item => item.calendarEvidence.some(calendar => calendar.calendarDay === '2026-10-10' && calendar.blockRunsOnDay)));
assert.ok(realPatternForDayB, 'real iBus evidence has an active 313 block on the second valid date');
const real313Service = makeService({
  routeNumber: '313',
  source: { provider: 'TfL', lineId: '313', routePatternStartIsAssessedStop: false },
  routePatternStopIds: realPatternForDayB.orderedStopPointIds,
  originStopPointId: realPatternForDayB.orderedStopPointIds[0],
  destinationStopPointId: realPatternForDayB.orderedStopPointIds.at(-1),
  stopSchedules: { [realPatternForDayB.orderedStopPointIds[1]]: { monday: [420] } }
});
for (const day of ['2026-10-09', '2026-10-10']) {
  const realEvidence = resolveTflIbusOperatorEvidence(real313Service, currentIndex, day);
  assert.equal(realEvidence.status, 'resolved', `real 313 evidence resolves on ${day}`);
  assert.deepEqual(realEvidence.operator, { code: 'MN', name: 'Arriva London North' });
  assert.ok(realEvidence.patterns.flatMap(pattern => pattern.journeys).every(item => item.calendarEvidence.every(calendar => calendar.calendarDay === day && calendar.blockRunsOnDay)), `only active ${day} calendar rows are returned`);
}
assert.equal(resolveTflIbusOperatorEvidence(real313Service, currentIndex, '2026-11-05').status, 'outside-base-version-validity');

// 12-13. The assessment date's active Block_CalendarDay is accepted; inactive blocks are not operator candidates.
const activeEvidence = resolveTflIbusOperatorEvidence(makeService(), makeIndex(), assessmentDate);
assert.equal(activeEvidence.status, 'resolved');
const inactive = makeIndex();
inactive.patterns[0].journeys[0].calendarEvidence[0].blockRunsOnDay = false;
assert.equal(resolveTflIbusOperatorEvidence(makeService(), inactive, assessmentDate).status, 'no-active-journey-on-date');
const outsideValidity = resolveTflIbusOperatorEvidence(makeService(), makeIndex(), '2026-11-05');
assert.equal(outsideValidity.status, 'outside-base-version-validity');

// 14. One exact operator resolves.
assert.equal(activeEvidence.operator.name, 'Operator One');
assert.equal(activeEvidence.operator.code, 'OP1');

// 15. Multiple relevant productive journeys with the same operator resolve.
const sameOperator = makeIndex();
sameOperator.patterns[0].journeys.push({ ...sameOperator.patterns[0].journeys[0], journeyIdx: 'j2', blockIdx: 'b2' });
assert.equal(resolveTflIbusOperatorEvidence(makeService(), sameOperator, assessmentDate).status, 'resolved');

// 16. Relevant active records with different operators fail closed.
const differentOperators = makeIndex();
differentOperators.patterns.push({
  ...differentOperators.patterns[0], patternIdx: 'p2', direction: '2',
  journeys: [{ ...differentOperators.patterns[0].journeys[0], journeyIdx: 'j2', blockIdx: 'b2', operatorCode: 'OP2', operatorName: 'Operator Two' }]
});
const ambiguous = resolveTflIbusOperatorEvidence(makeService(), differentOperators, assessmentDate);
assert.equal(ambiguous.status, 'ambiguous');
assert.equal(ambiguous.operator, null);

// 17. Direction follows ordered stops and exact endpoints; no numeric or inbound/outbound mapping is used.
const reversedService = makeService({
  direction: 'inbound', origin: 'Charlie', destination: 'Alpha', originStopPointId: 'C', destinationStopPointId: 'A',
  routePatternStopIds: ['C', 'B', 'A']
});
assert.equal(resolveTflIbusOperatorEvidence(reversedService, makeIndex(), assessmentDate).status, 'no-structured-pattern-match');
assert.equal(activeEvidence.iBusDirection, null);
assert.equal(activeEvidence.timetableDirectionMappedMechanically, false);

// 18. A wrong ordered stop sequence is not accepted.
assert.equal(resolveTflIbusOperatorEvidence(makeService({ routePatternStopIds: ['A', 'C', 'B'] }), makeIndex(), assessmentDate).status, 'no-structured-pattern-match');

// 19. A wrong contract line does not match, even when route number text is the same.
const wrongContract = makeIndex();
wrongContract.patterns[0].contractLineNo = 'C99';
assert.equal(resolveTflIbusOperatorEvidence(makeService(), wrongContract, assessmentDate).status, 'no-structured-pattern-match');

// 20-25. Authority precedence, audit-only BODS disagreement, ambiguity, identical Browser/Word value, and timetable invariance.
async function compose({ directOperator = '', bodsOperator = 'Supplementary Operator', operatorIndex = makeIndex() } = {}) {
  const service = makeService({ operator: directOperator });
  const tfl = {
    servicesForStop: async () => ({ ok: true, data: [service], warnings: [], provenance: { source: 'TfL', timetableConclusion: 'MATCHED' } }),
    routeSequencesForLineDirections: async requests => ({ ok: true, data: requests.map(request => ({ ...request, sequences: [] })), warnings: [], provenance: {} })
  };
  const bods = {
    servicesForStops: async () => ({ ok: true, data: [{
      id: 'bods:X1:B', routeNumber: 'X1', operator: bodsOperator, direction: 'outbound',
      stopSchedules: { B: { monday: [425] } }
    }], warnings: [], provenance: { source: 'BODS' } })
  };
  const ibus = createTflIbusOperatorAdapter({ index: operatorIndex, clock: () => new Date(`${assessmentDate}T12:00:00`) });
  const authority = createAuthoritativeBusTimetableAdapter({ tflAdapter: tfl, nationalAdapter: bods, londonSupplementAdapter: bods, tflIbusOperatorAdapter: ibus, londonCoverage: () => true });
  return authority.servicesForStops([{ id: 'B', routes: ['X1'], timetableAuthority: 'tfl' }], { assessmentDate });
}

const accepted = await compose({ bodsOperator: 'Different BODS Operator' });
const resolvedService = accepted.data[0];
assert.equal(resolvedService.operator, 'Operator One', 'date-valid iBus outranks BODS operator consensus');
assert.equal(resolvedService.source.operatorProvenance.tier, 'tfl-ibus');
assert.ok(resolvedService.sourceAuthorityDiagnostics.some(item => item.classification === 'audit-only-authoritative-iBus-retained'));
assert.equal(accepted.warnings.some(warning => /operator/i.test(warning)), false, 'BODS disagreement is audit-only when iBus resolves');
assert.deepEqual(resolvedService.stopSchedules, makeService().stopSchedules);
assert.deepEqual(resolvedService.routePatternStopIds, makeService().routePatternStopIds);
assert.deepEqual(resolvedService.frequencyEvidence, makeService().frequencyEvidence);
assert.deepEqual(resolvedService.operatingPeriodEvidence, makeService().operatingPeriodEvidence);
assert.deepEqual(resolvedService.calendarEvidence, makeService().calendarEvidence);

const direct = await compose({ directOperator: 'TfL Direct Operator', bodsOperator: 'Different BODS Operator' });
assert.equal(direct.data[0].operator, 'TfL Direct Operator', 'explicit TfL timetable operator is never overwritten');
assert.equal(direct.data[0].source.operatorProvenance.tier, 'tfl-timetable');
assert.ok(direct.data[0].sourceAuthorityDiagnostics.some(item => item.provider === 'TfL iBus Static Data' && item.classification === 'audit-only-authoritative-TfL-timetable-retained'));

const unresolved = await compose({ operatorIndex: differentOperators });
assert.equal(unresolved.data[0].operator, 'Operator unresolved (TfL iBus ambiguity)');
assert.equal(unresolved.data[0].source.operatorProvenance.tier, 'ambiguous');
assert.ok(unresolved.data[0].sourceWarnings.some(note => /materially ambiguous/.test(note)));

const summary = {
  routeNumber: 'X1', operator: resolvedService.operator,
  directionPatternText: 'Alpha → Charlie', servedAtText: 'Stop B', principalLocationsText: 'Alpha, Charlie',
  typicalFrequencyText: 'Every 10 minutes', operatingPeriodLines: ['Weekdays 06:00–20:00'],
  stopIds: ['B'], rawServiceSummaries: [resolvedService]
};
const word = buildBusWordTables({ ok: true, plannerServiceSummaries: [summary], serviceSummaries: [], stops: [], reviewItems: [] })[1];
assert.equal(word.rows[0][1], resolvedService.operator, 'Word receives the same resolved operator value as the Browser service object');
assert.equal(word.rows[0].length, 7, 'Word retains the seven-column planner-facing contract');
assert.deepEqual(word.headers, ['Route', 'Operator', 'Direction / main service pattern', 'Served at', 'Principal locations', 'Typical frequency', 'Operating period at stop']);
assert.equal(operatorProvenanceLabel(summary), `TfL iBus Static Data · Base_Version ${currentIndex.baseVersion}`, 'Planner-row projection retains provenance in the engineering model and audit evidence');
assert.equal(resolvedService.source.operatorProvenance.tier, 'tfl-ibus', 'removing the report column does not remove operator provenance');

const manifest = JSON.parse(fs.readFileSync(new URL('../../atlas/data/tfl-ibus/manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.baseVersion, currentIndex.baseVersion);
assert.equal(manifest.validFrom, currentIndex.validFrom);
assert.equal(manifest.validTo, currentIndex.validTo);
assert.equal(manifest.indexPath, '20261009/operator-index.json');
const tamperedManifestAdapter = createTflIbusOperatorAdapter({
  manifestUrl: 'https://atlas.invalid/manifest.json',
  fetchImpl: async url => url.endsWith('manifest.json')
    ? { ok: true, json: async () => ({ ...manifest, indexSha256: '0'.repeat(64) }) }
    : { ok: true, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(makeIndex())).buffer },
  clock: () => new Date(`${assessmentDate}T12:00:00`)
});
const tamperedManifestResult = await tamperedManifestAdapter.resolveOperator(makeService(), { assessmentDate });
assert.equal(tamperedManifestResult.status, 'unavailable');
assert.match(tamperedManifestResult.detail, /SHA-256 does not match/);

console.log('BUS-ROBUSTNESS-1A4F TfL iBus operator evidence tests passed.');
