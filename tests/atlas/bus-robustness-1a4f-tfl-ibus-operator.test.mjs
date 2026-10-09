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
  routeNumber: 'X1', operator: resolvedService.operator, source: resolvedService.source,
  directionPatternText: 'Alpha → Charlie', servedAtText: 'Stop B', principalLocationsText: 'Alpha, Charlie',
  typicalFrequencyText: 'Every 10 minutes', operatingPeriodLines: ['Weekdays 06:00–20:00'],
  stopIds: ['B'], rawServiceSummaries: [resolvedService]
};
const word = buildBusWordTables({ ok: true, plannerServiceSummaries: [summary], serviceSummaries: [], stops: [], reviewItems: [] })[1];
assert.equal(word.rows[0][1], resolvedService.operator, 'Word receives the same resolved operator value as the Browser service object');
assert.equal(word.rows[0][2], operatorProvenanceLabel(summary));
assert.match(word.headers[2], /provenance/i);

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
