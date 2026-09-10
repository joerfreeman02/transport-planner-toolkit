import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildServiceSummaries, calculateTypicalServiceFrequency, formatTypicalFrequency } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const schedule = values => Object.fromEntries(days.map(day => [day, values[day] ?? []]));
const summaryFor = (stopSchedule, extra = {}) => buildServiceSummaries([
  { id: 'A', name: 'Assessment stop', indicator: 'S', walking: { status: 'routed', distanceMetres: 100 } }
], [{ id: 'route', routeNumber: '13', operator: 'Fixture Buses', origin: 'Origin', destination: 'Destination', direction: 'outbound', principalLocations: ['Town Centre'], stopSchedules: { A: stopSchedule }, ...extra }])[0];

const weekdayRegular = [420, 435, 450, 465, 480, 495];
const weekdayIrregular = Array.from({ length: 22 }, (_, index) => index < 10 ? index * 10 : index * 10 + 50);

const varied = summaryFor(schedule({ monday: weekdayRegular, tuesday: weekdayRegular, wednesday: weekdayRegular, thursday: weekdayRegular, friday: weekdayRegular, saturday: [420, 440, 460], sunday: [] }));
assert.deepEqual(varied.typicalFrequencyLines, [
  'Mon-Fri: Every ~15 mins',
  'Sat: 3 journeys/day',
  'Sun: No scheduled service'
]);
assert.equal(Object.keys(varied.frequencyByDay).join(','), days.join(','));
assert.equal(varied.frequencyBasisStopId, 'A');

const allSame = Object.fromEntries(days.map(day => [day, weekdayRegular]));
assert.deepEqual(summaryFor(allSame).typicalFrequencyLines, ['Mon-Sun: Every ~15 mins']);

const fridayDifferent = summaryFor(schedule({ monday: weekdayRegular, tuesday: weekdayRegular, wednesday: weekdayRegular, thursday: weekdayRegular, friday: [420, 440, 460], saturday: [420], sunday: [420] }));
assert.deepEqual(fridayDifferent.typicalFrequencyLines, [
  'Mon-Thu: Every ~15 mins',
  'Fri: 3 journeys/day',
  'Sat-Sun: 1 journey/day'
]);

const nonAdjacent = Object.fromEntries(days.map(day => [day, [420]]));
nonAdjacent.tuesday = [420, 600];
nonAdjacent.saturday = [420, 600];
assert.deepEqual(formatTypicalFrequency(Object.fromEntries(days.map(day => [day, calculateTypicalServiceFrequency(nonAdjacent[day], { day })]))), [
  'Mon: 1 journey/day', 'Tue: 2 journeys/day', 'Wed-Fri: 1 journey/day', 'Sat: 2 journeys/day', 'Sun: 1 journey/day'
]);

const route13 = summaryFor(schedule({ monday: weekdayIrregular, tuesday: weekdayIrregular, wednesday: weekdayIrregular, thursday: weekdayIrregular, friday: weekdayIrregular, saturday: [420, 540, 660], sunday: [] }), {
  qualifications: ['Limited service: no more than three scheduled journeys on any represented day.']
});
assert.match(route13.typicalFrequencyLines[0], /Mon-Fri: Approx\. every \d+ mins \(irregular\)/);
assert.equal(route13.typicalFrequencyLines[2], 'Sun: No scheduled service');
assert.doesNotMatch(route13.serviceNote, /no more than three scheduled journeys on any represented day/i);

const route13b = summaryFor(schedule({ monday: [420], tuesday: [420], wednesday: [420], thursday: [420], friday: [420], saturday: [600, 720], sunday: [] }), {
  qualifications: ['Limited service: no more than three scheduled journeys on any represented day.']
});
assert.match(route13b.serviceNote, /no more than three scheduled journeys on any represented day/i);
assert.deepEqual(route13b.typicalFrequencyLines, ['Mon-Fri: 1 journey/day', 'Sat: 2 journeys/day', 'Sun: No scheduled service']);

const regularity = calculateTypicalServiceFrequency(weekdayIrregular, { day: 'wednesday' });
assert.equal(regularity.classification, 'irregular');
assert.match(regularity.wording, /Approx\. every \d+ mins \(irregular\)/);
const regular = calculateTypicalServiceFrequency(weekdayRegular, { day: 'monday' });
assert.equal(regular.classification, 'regular-frequency');
assert.equal(regular.intervalMinutes, 15);
assert.match(regular.wording, /Every ~15 mins/);
assert.equal(calculateTypicalServiceFrequency([0, 10, 20, 30, 40], { day: 'monday' }).valueText, 'Every ~10 mins', 'five regular departures use their central headway rather than a limited-service label');
assert.match(calculateTypicalServiceFrequency([0, 8, 18, 28, 39, 51], { day: 'monday' }).valueText, /Every ~10 mins|Typically every ~10 mins/);
const inactiveGaps = calculateTypicalServiceFrequency([0, 10, 20, 30, 330, 340, 350, 660, 670], { day: 'monday' });
assert.equal(inactiveGaps.valueText, 'Every ~10 mins', 'all inactive gaps above the deterministic threshold are excluded, not only the largest one');
assert.match(calculateTypicalServiceFrequency([360, 370, 380, 390, 690, 700], { day: 'monday' }).valueText, /Every ~10 mins|Typically every ~10 mins/);
assert.equal(calculateTypicalServiceFrequency([], { day: 'sunday' }).wording, 'Sunday: No scheduled service');

const tflSafe = calculateTypicalServiceFrequency([350, 370, 400, 1400], { day: 'monday', frequencyEvidence: [{ periodType: 'FrequencyMinutes', day: 'monday', lowestFrequency: 10, highestFrequency: 10 }] });
assert.equal(tflSafe.basis, 'frequency-band');
assert.equal(tflSafe.intervalMinutes, 10);
assert.equal(tflSafe.departureCount, 4);
assert.equal(tflSafe.valueText, 'Every ~10 mins');
for (const periodType of ['FrequencyHours', 'Unknown', 'Normal']) {
  const result = calculateTypicalServiceFrequency(weekdayRegular, { day: 'monday', frequencyEvidence: [{ periodType, day: 'monday', lowestFrequency: 2, highestFrequency: 2 }] });
  assert.notEqual(result.basis, 'frequency-band', `${periodType} must not become minute headway evidence`);
}
const distinctBands = calculateTypicalServiceFrequency(weekdayRegular, { day: 'monday', frequencyEvidence: [
  { periodType: 'FrequencyMinutes', day: 'monday', fromMinute: 360, toMinute: 480, lowestFrequency: 10, highestFrequency: 10 },
  { periodType: 'FrequencyMinutes', day: 'monday', fromMinute: 480, toMinute: 600, lowestFrequency: 15, highestFrequency: 15 }
] });
assert.equal(distinctBands.basis, 'frequency-band-range');
assert.equal(distinctBands.valueText, 'Typically every ~10–15 mins');
const rangedBand = calculateTypicalServiceFrequency([420, 435], { day: 'monday', frequencyEvidence: [{ periodType: 'FrequencyMinutes', day: 'monday', lowestFrequency: 3, highestFrequency: 5 }] });
assert.equal(rangedBand.valueText, 'Typically every ~3–5 mins');

const multiStop = buildServiceSummaries([
  { id: 'A', walking: { status: 'routed', distanceMetres: 100 } },
  { id: 'B', walking: { status: 'routed', distanceMetres: 200 } }
], [{ id: 'multi', routeNumber: 'M1', operator: 'Fixture', origin: 'A', destination: 'B', direction: 'outbound', principalLocations: [], frequencyEvidence: [
  { periodType: 'FrequencyMinutes', day: 'monday', lowestFrequency: 10, highestFrequency: 10, stopPointId: 'A' },
  { periodType: 'FrequencyMinutes', day: 'monday', lowestFrequency: 5, highestFrequency: 5, stopPointId: 'B' }
], stopSchedules: { A: schedule({ monday: weekdayRegular, tuesday: weekdayRegular, wednesday: weekdayRegular, thursday: weekdayRegular, friday: weekdayRegular }), B: schedule({ monday: weekdayRegular, tuesday: weekdayRegular, wednesday: weekdayRegular, thursday: weekdayRegular, friday: weekdayRegular }) } }]);
assert.equal(multiStop[0].frequencyBasisStopId, 'A');
assert.equal(multiStop[0].frequencyByDay.monday.intervalMinutes, 10);

const html = fs.readFileSync(new URL('../../atlas/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../atlas/assets/css/atlas-shell.css', import.meta.url), 'utf8');
assert.deepEqual((html.match(/<th>/g) ?? []).slice(-8).length, 8);
for (const [className, width] of [['col-include', '4%'], ['col-route', '6%'], ['col-operator', '13%'], ['col-direction', '21%'], ['col-served-at', '16%'], ['col-principal', '16%'], ['col-frequency', '12%'], ['col-operating-period', '12%']]) assert.ok(css.includes('.' + className + ' { width: ' + width + '; }'), className);
assert.match(css, /input\[type="checkbox"\].*width: 17px/);

const word = buildBusWordTables({ ok: true, stops: [], serviceSummaries: [varied] });
assert.deepEqual(word[1].headers, ['Route', 'Operator', 'Origin / destination', 'Principal locations', 'Typical frequency', 'Operating period']);
assert.equal(word[1].headers.length, 6);
assert.equal(word[1].rows[0][4], varied.typicalFrequencyLines.join('\n'));
assert.deepEqual(word[1].widths, [7, 14, 22, 25, 17, 15]);
assert.match(word[1].rows[0][2], /\(Southbound\)$/);

console.log('PASS BUS-QA-02 full-week frequency grouping, TfL safety, representative-stop authority, presentation contracts and limited-service provenance tests.');
