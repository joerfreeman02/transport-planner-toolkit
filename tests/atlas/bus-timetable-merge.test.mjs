import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { mergeBusTimetableSources } from '../../src/atlas/domain/bus-timetable-merge.mjs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { normalisePreparedService } from '../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { scopedScheduledService } from '../../src/atlas/domain/scheduled-evidence.mjs';

const schedule = times => ({ monday: times, tuesday: times, wednesday: times, thursday: times, friday: times, saturday: [], sunday: [] });
const pipersPattern = [
  '021024595', '021013509', '021013508', '021013510', '021013512', '021013513', '021013515', '021013516',
  '021028151', '021013517', '021013518', '021013534', '021013537', '021013540', '021013541', '210021400211',
  '021012009', '021012007', '02900202', '02901244', '02901616', '02903800', '02903622', '02900043',
  '02903722', '02903032', '02903034', '02903037', '02903006', '02903038', '02903040', '02903047',
  '021028168', '021024595'
];
const localSchedule = stopSchedules => Object.fromEntries(Object.entries(stopSchedules).map(([id, values]) => [id, schedule(values)]));
const service = (id, overrides = {}) => ({
  id, routeNumber: '230', operator: 'Example Buses', origin: 'Pipers Lane', destination: 'Town Centre', direction: 'outbound',
  circular: false, routePatternStopIds: ['START', 'LOCAL', 'END'], stopSchedules: { LOCAL: schedule([420, 480]) },
  timetableSource: id.startsWith('tnds:') ? 'TNDS' : 'BODS', ...overrides
});

// Governed Pipers shape: builder-prepared BODS loop/pattern and the preserved
// R46-I1 TNDS account that differs only by omitting the loop-closing StopPoint.
const preparedPipersBods = JSON.parse(fs.readFileSync(new URL('./fixtures/pipers-bods-prepared-service.json', import.meta.url), 'utf8'));
assert.equal(preparedPipersBods.routeNumber, '230');
assert.equal(preparedPipersBods.operator, 'Centrebus');
assert.deepEqual(preparedPipersBods.circularPatternStopIds, pipersPattern, 'the BODS pattern comes from the production preparation fixture');
assert.equal(Object.hasOwn(preparedPipersBods, 'routePatternStopIds'), false, 'the BODS preparation contract supplies its existing ordered-pattern field');
const normalizedPipersBods = normalisePreparedService(preparedPipersBods);
const pipersBods = scopedScheduledService(normalizedPipersBods, ['021013518']);
assert.deepEqual(pipersBods.circularPatternStopIds, preparedPipersBods.circularPatternStopIds, 'prepared adapter normalization carries the ordered BODS pattern into runtime');
const pipersTnds = service('tnds:230-pipers-r46-shape', {
  operator: 'Centrebus South', origin: 'Lyons Community Centre', destination: 'Caddington Woods',
  direction: 'outbound', circular: undefined, routePatternStopIds: pipersPattern.slice(0, -1),
  stopSchedules: localSchedule({ '021013518': [371, 431, 491] })
});
const pipers230 = mergeBusTimetableSources({ bods: [pipersBods], tnds: [pipersTnds] });
assert.equal(pipers230.length, 1, 'Pipers 230 BODS/TNDS loop forms one local service family');
assert.equal(pipers230[0].id, pipersBods.id);
assert.equal(pipers230[0].timetableSource, 'BODS', 'BODS remains the timetable authority and browser provenance');
assert.deepEqual(pipers230[0].stopSchedules['021013518'].monday, pipersBods.stopSchedules['021013518'].monday, 'TNDS copy cannot inflate prepared BODS departures/frequency');
const pipersPlanner = buildPlannerBusServiceSummaries([{
  id: pipers230[0].id, routeNumber: '230', operator: pipers230[0].operator, origin: pipers230[0].origin,
  destination: pipers230[0].destination, direction: pipers230[0].direction, timetableSource: pipers230[0].timetableSource,
  stopIds: ['021013518'], frequencyBasisStopId: '021013518', departuresByDay: { monday: [371, 431, 491] },
  departureEvidenceByDay: { monday: [371, 431, 491].map(minute => ({ minute, stopPointId: '021013518', provider: 'BODS' })) },
  calendarProfileId: 'ordinary', circular: true, principalLocations: [], sourceRecordIds: [pipers230[0].id]
}], [{ id: '021013518', name: 'Pipers Lane', distanceMetres: 10 }]);
assert.equal(pipersPlanner[0].timetableSource, 'BODS', 'browser planner row exposes BODS provenance');
const pipersWord = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: pipersPlanner, serviceSummaries: [] });
assert.doesNotMatch(JSON.stringify(pipersWord), /BODS|TNDS/, 'Word output remains source-neutral');

const duplicate = mergeBusTimetableSources({ bods: [service('bods:230')], tnds: [service('tnds:230')] });
assert.equal(duplicate.length, 1, 'same family with exact physical pattern yields one planner input');
assert.equal(duplicate[0].timetableSource, 'BODS');
assert.deepEqual(duplicate[0].stopSchedules.LOCAL.monday, [420, 480], 'duplicate provider evidence cannot double-count local departures');

const differentLocalStop = mergeBusTimetableSources({
  bods: [service('bods:12', { routeNumber: '12' })],
  tnds: [service('tnds:12', { routeNumber: '12', stopSchedules: { OTHER: schedule([420]) } })]
});
assert.equal(differentLocalStop.length, 2, 'same-number service without the same local StopPoint remains supplementary');
assert.equal(differentLocalStop[1].timetableSource, 'TNDS');

const unrelatedOperator = mergeBusTimetableSources({
  bods: [service('bods:9', { routeNumber: '9', operator: 'Centrebus' })],
  tnds: [service('tnds:9', { routeNumber: '9', operator: 'Community Transport' })]
});
assert.equal(unrelatedOperator.length, 2, 'a genuinely unrelated operator remains a separate local service');

const differentCorridor = mergeBusTimetableSources({
  bods: [service('bods:15', { routeNumber: '15', operator: 'Centrebus', routePatternStopIds: ['A', 'LOCAL', 'B'] })],
  tnds: [service('tnds:15', { routeNumber: '15', operator: 'Centrebus South', routePatternStopIds: ['A', 'LOCAL', 'C'] })]
});
assert.equal(differentCorridor.length, 2, 'compatible operator-family names do not collapse a materially different corridor');

const reverseDirection = mergeBusTimetableSources({
  bods: [service('bods:8', { routeNumber: '8', direction: 'outbound', routePatternStopIds: ['A', 'LOCAL', 'B'] })],
  tnds: [service('tnds:8', { routeNumber: '8', direction: 'inbound', routePatternStopIds: ['B', 'LOCAL', 'A'] })]
});
assert.equal(reverseDirection.length, 2, 'opposite direction and reversed physical order remain distinct');

const circularConflict = mergeBusTimetableSources({
  bods: [service('bods:19', { routeNumber: '19', circular: true, routePatternStopIds: ['A', 'LOCAL', 'A'] })],
  tnds: [service('tnds:19', { routeNumber: '19', circular: false, routePatternStopIds: ['A', 'LOCAL'] })]
});
assert.equal(circularConflict.length, 2, 'conflicting circular classification remains a hard separation');

const shortWorking = mergeBusTimetableSources({
  bods: [service('bods:22', { routeNumber: '22', routePatternStopIds: ['A', 'LOCAL', 'B', 'C'] })],
  tnds: [service('tnds:22', { routeNumber: '22', routePatternStopIds: ['A', 'LOCAL'] })]
});
assert.equal(shortWorking.length, 2, 'a short working is not removed when its ordered corridor differs');

const variantConflict = mergeBusTimetableSources({
  bods: [service('bods:23', { routeNumber: '23', patternVariants: [{ id: 'full', stopIds: ['A', 'LOCAL', 'B'] }] })],
  tnds: [service('tnds:23', { routeNumber: '23', patternVariants: [{ id: 'short', stopIds: ['A', 'LOCAL'] }] })]
});
assert.equal(variantConflict.length, 2, 'published short-working variants remain distinct');

const routeElsewhere = mergeBusTimetableSources({
  bods: [service('bods:230-elsewhere', { stopSchedules: { ELSEWHERE: schedule([420]) } })],
  tnds: [pipersTnds]
});
assert.equal(routeElsewhere.length, 2, 'same route number elsewhere cannot suppress locally relevant TNDS evidence');

const noPattern = mergeBusTimetableSources({
  bods: [service('bods:7', { routeNumber: '7', routePatternStopIds: [] })],
  tnds: [service('tnds:7', { routeNumber: '7', routePatternStopIds: [] })]
});
assert.equal(noPattern.length, 2, 'route number plus local stop alone is insufficient');

const insufficientIdentity = mergeBusTimetableSources({
  bods: [service('bods:7a', { routeNumber: '7', operator: '', origin: '', destination: '', direction: '' })],
  tnds: [service('tnds:7a', { routeNumber: '7', operator: '', origin: '', destination: '', direction: '' })]
});
assert.equal(insufficientIdentity.length, 2, 'ambiguous evidence is retained instead of guessed equivalent');

const legacyPrepared231Path = new URL('../../atlas/data/bus-tnds/services/231-se.json', import.meta.url);
let prepared231;
if (fs.existsSync(legacyPrepared231Path)) {
  prepared231 = JSON.parse(fs.readFileSync(legacyPrepared231Path, 'utf8'));
} else {
  // Current prepared national data uses bounded StopPoint-prefix shards.
  // Select the Pipers local call from the shard manifest without reading the
  // full national TNDS population or requiring the retired legacy file name.
  const tndsRoot = new URL('../../atlas/data/bus-tnds/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', tndsRoot), 'utf8'));
  const stopId = '021013518';
  const shardKey = stopId.slice(0, manifest.serviceShardKeyLength);
  const shardRefs = (manifest.serviceShards?.[shardKey] ?? []).filter(shard => shard.stopIds?.includes(stopId));
  const localRecords = shardRefs.flatMap(shard => JSON.parse(
    gunzipSync(fs.readFileSync(new URL(shard.path, tndsRoot))).toString('utf8')
  ).services ?? []);
  prepared231 = localRecords.find(record => String(record.routeNumber) === '231' && record.stopSchedules?.[stopId]);
  assert.ok(prepared231, 'the current prepared TNDS shards retain the genuine Pipers route 231 call');
}
const pipers231 = mergeBusTimetableSources({ bods: [], tnds: [prepared231] });
assert.equal(pipers231.length, 1, 'prepared Pipers 231 has no equivalent BODS service and remains available');
assert.equal(pipers231[0].routeNumber, '231');
assert.equal(pipers231[0].operator, 'South Beds Dial-a-Ride');
assert.equal(pipers231[0].timetableSource, 'TNDS', 'TNDS-only 231 provenance is retained');

const plannerRows = buildPlannerBusServiceSummaries([
  { id: 'tfl:7', routeNumber: '7', operator: 'TfL', origin: 'Start', destination: 'End', direction: 'End', directionFamily: 'gtfs:0', source: { provider: 'TfL' }, timetableSource: 'TfL', stopIds: ['LOCAL'], frequencyBasisStopId: 'LOCAL', departuresByDay: Object.fromEntries(Object.keys(schedule([])).map(day => [day, [420]])), departureEvidenceByDay: Object.fromEntries(Object.keys(schedule([])).map(day => [day, [{ minute: 420, stopPointId: 'LOCAL', provider: 'TfL' }]])), calendarProfileId: 'ordinary', circular: false, principalLocations: ['Test'], sourceRecordIds: ['tfl:7'] }
], [{ id: 'LOCAL', name: 'Local Stop', distanceMetres: 10, walking: { status: 'routed', distanceMetres: 10 } }]);
assert.equal(plannerRows[0].timetableSource, 'TfL', 'the browser summary retains primary TfL provenance');

console.log('PASS site-scoped BODS/TNDS arbitration, Pipers 230/231, duplicate-frequency prevention and planner/Word provenance contract.');
