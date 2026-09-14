import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_MINUTES = Object.freeze({ monday: [480], tuesday: [480], wednesday: [480], thursday: [480], friday: [480], saturday: [], sunday: [] });
const stops = [{ id: 'REP', name: 'Representative stop', walking: { status: 'routed', distanceMetres: 80 } }];

function weekWith(minutes) {
  return Object.fromEntries(DAYS.map(day => [day, [...(minutes?.[day] ?? [])]]));
}

function calendarRecord({
  routeNumber = 'QA',
  direction = 'outbound',
  destination = 'Terminus',
  origin = 'Origin',
  pattern = ['ORIGIN', 'REP', 'DEST'],
  departures = WEEKDAY_MINUTES,
  id = `${routeNumber}-${direction}`,
  profile,
  identityPrefix = id,
  serviceNote = '',
  operator = 'TfL',
  ...extra
} = {}) {
  const schedules = weekWith(departures);
  const departureEvidenceByDay = Object.fromEntries(DAYS.map(day => [day, schedules[day].map((minute, index) => ({
    minute,
    stopPointId: 'REP',
    journeyIdentity: `${identityPrefix}-${day}-${index}`,
    provider: 'TfL',
    ...(profile === undefined ? {} : { calendarProfileId: profile })
  }))]));
  return {
    id,
    routeNumber,
    operator,
    origin,
    destination,
    direction,
    directionFamily: direction,
    routePatternStopIds: pattern,
    principalLocations: ['Origin', 'Terminus'],
    frequencyBasisStopId: 'REP',
    stopIds: ['REP'],
    departuresByDay: schedules,
    departureEvidenceByDay,
    frequencyEvidence: [],
    sourceRecordIds: [id],
    serviceNote,
    ...(profile === undefined ? {} : { calendarProfileId: profile }),
    ...extra
  };
}

function planner(records) {
  return buildPlannerBusServiceSummaries(records, stops);
}

function weekdayAt(minute) {
  return Object.fromEntries(DAYS.map(day => [day, day === 'saturday' || day === 'sunday' ? [] : [minute]]));
}

function assertNoUnconditionalCombinedFrequency(row, message) {
  assert.doesNotMatch(row.typicalFrequencyText, /(?:^|\n)Mon-Fri: 2 journeys\/day/, message);
}

// A. Ordinary and school-day departures consolidate into one row with qualified lines.
const ordinarySchool = planner([
  calendarRecord({ routeNumber: 'A', id: 'A-ordinary', profile: 'ordinary', departures: weekdayAt(480) }),
  calendarRecord({ routeNumber: 'A', id: 'A-school', profile: 'school-day', departures: weekdayAt(510) })
]);
assert.equal(ordinarySchool.length, 1, 'A: calendar variation does not create duplicate headline rows');
assert.match(ordinarySchool[0].typicalFrequencyText, /Ordinary service: Mon-Fri: 1 journey\/day/);
assert.match(ordinarySchool[0].typicalFrequencyText, /School days \(additional\): Mon-Fri: 1 journey\/day/);
assertNoUnconditionalCombinedFrequency(ordinarySchool[0], 'A: ordinary and school-day service are not flattened');

const profileFrequencyBands = planner([
  calendarRecord({ routeNumber: 'A-BANDS', id: 'A-BANDS-ordinary', profile: 'ordinary', departures: weekdayAt(480), frequencyEvidence: [{ periodType: 'FrequencyMinutes', day: 'monday', lowestFrequency: 10, highestFrequency: 10, calendarProfileId: 'ordinary' }] }),
  calendarRecord({ routeNumber: 'A-BANDS', id: 'A-BANDS-school', profile: 'school-day', departures: weekdayAt(510), frequencyEvidence: [{ periodType: 'FrequencyMinutes', day: 'monday', lowestFrequency: 5, highestFrequency: 5, calendarProfileId: 'school-day' }] })
])[0];
assert.equal(profileFrequencyBands.calendarFrequencyByProfile.ordinary.monday.intervalMinutes, 10, 'A: ordinary frequency evidence stays in its profile');
assert.equal(profileFrequencyBands.calendarFrequencyByProfile['school-day'].monday.intervalMinutes, 5, 'A: school-day frequency evidence stays in its profile');

// B. School and non-school calendars remain distinct within one route-direction row.
const schoolNonSchool = planner([
  calendarRecord({ routeNumber: 'B', id: 'B-school', profile: 'school-day', departures: weekdayAt(480) }),
  calendarRecord({ routeNumber: 'B', id: 'B-non-school', profile: 'non-school-day', departures: weekdayAt(540) })
]);
assert.equal(schoolNonSchool.length, 1);
assert.match(schoolNonSchool[0].typicalFrequencyText, /School days: Mon-Fri: 1 journey\/day/);
assert.match(schoolNonSchool[0].typicalFrequencyText, /Non-school days: Mon-Fri: 1 journey\/day/);
assertNoUnconditionalCombinedFrequency(schoolNonSchool[0], 'B: school and non-school service are not summed');

// C–F. Other resolved profiles follow the same safe row and line model.
for (const [label, firstProfile, secondProfile] of [
  ['C', 'ordinary', 'term-time'],
  ['D', 'ordinary', 'holiday'],
  ['E', 'ordinary', 'other-resolved'],
  ['F', 'school-day', 'term-time']
]) {
  const rows = planner([
    calendarRecord({ routeNumber: label, id: `${label}-first`, profile: firstProfile, departures: weekdayAt(480) }),
    calendarRecord({ routeNumber: label, id: `${label}-second`, profile: secondProfile, departures: weekdayAt(510) })
  ]);
  assert.equal(rows.length, 1, `${label}: profile variation remains one row`);
  assert.ok(rows[0].typicalFrequencyText.includes('Mon-Fri: 1 journey/day'), `${label}: each profile keeps its own frequency`);
  assertNoUnconditionalCombinedFrequency(rows[0], `${label}: profiles are not flattened`);
  assert.equal(rows[0].calendarProfileIds.length, 2);
}

// G–H. Missing/unresolved calendar applicability is visible and never promoted to ordinary service.
for (const label of ['G', 'H']) {
  const rows = planner([
    calendarRecord({ routeNumber: label, id: `${label}-ordinary`, profile: 'ordinary', departures: weekdayAt(480) }),
    calendarRecord({ routeNumber: label, id: `${label}-unresolved`, profile: label === 'G' ? 'unresolved' : undefined, departures: weekdayAt(510) })
  ]);
  assert.equal(rows.length, 1, `${label}: unresolved calendar record remains in the route row`);
  assert.match(rows[0].typicalFrequencyText, /Review required: calendar applicability could not be safely established/);
  assert.match(rows[0].operatingPeriodLines.join('\n'), /Review required/);
  assert.equal(rows[0].reviewRequired, true);
  assert.equal(rows[0].calendarConfidence, 'unresolved');
  assert.equal(rows[0].canonicalDeparturePopulation.monday.length, 1, `${label}: unresolved evidence cannot inflate resolved service`);
}

// I. A physical journey repeated in two calendar records is deduplicated but retains both profiles.
const duplicateAcrossProfiles = planner([
  calendarRecord({ routeNumber: 'I', id: 'I-ordinary', profile: 'ordinary', identityPrefix: 'I-shared', departures: weekdayAt(480) }),
  calendarRecord({ routeNumber: 'I', id: 'I-school', profile: 'school-day', identityPrefix: 'I-shared', departures: weekdayAt(480) })
])[0];
assert.equal(duplicateAcrossProfiles.departuresByDay.monday.length, 1, 'I: repeated physical journey is counted once');
assert.deepEqual(duplicateAcrossProfiles.canonicalDeparturePopulationAll.monday[0].calendarProfileIds, ['ordinary', 'school-day']);
assert.equal(duplicateAcrossProfiles.calendarDeparturePopulationByProfile.ordinary.filter(entry => entry.day === 'monday').length, 1);
assert.equal(duplicateAcrossProfiles.calendarDeparturePopulationByProfile['school-day'].length, 0);

// J. Opposite directions remain separate even when each has calendar variation.
const oppositeDirectionProfiles = planner([
  calendarRecord({ routeNumber: 'J', id: 'J-out-ordinary', profile: 'ordinary', departures: weekdayAt(480), direction: 'outbound', pattern: ['ORIGIN', 'REP', 'DEST'] }),
  calendarRecord({ routeNumber: 'J', id: 'J-out-school', profile: 'school-day', departures: weekdayAt(510), direction: 'outbound', pattern: ['ORIGIN', 'REP', 'DEST'] }),
  calendarRecord({ routeNumber: 'J', id: 'J-in-ordinary', profile: 'ordinary', departures: weekdayAt(520), direction: 'inbound', pattern: ['DEST', 'REP', 'ORIGIN'], origin: 'Terminus', destination: 'Origin' }),
  calendarRecord({ routeNumber: 'J', id: 'J-in-school', profile: 'school-day', departures: weekdayAt(550), direction: 'inbound', pattern: ['DEST', 'REP', 'ORIGIN'], origin: 'Terminus', destination: 'Origin' })
]);
assert.equal(oppositeDirectionProfiles.length, 2, 'J: calendar variation does not bridge opposite direction rows');
assert.ok(oppositeDirectionProfiles.every(row => row.typicalFrequencyText.includes('School days (additional)')));

// K. Distinct corridors remain separate; calendar profile is not used as the corridor boundary.
const distinctCorridors = planner([
  calendarRecord({ routeNumber: 'K', id: 'K-one', profile: 'ordinary', pattern: ['ORIGIN', 'REP', 'DEST-ONE'], destination: 'One' }),
  calendarRecord({ routeNumber: 'K', id: 'K-two', profile: 'school-day', pattern: ['OTHER-ORIGIN', 'REP', 'DEST-TWO'], origin: 'Other origin', destination: 'Two' })
]);
assert.equal(distinctCorridors.length, 2, 'K: genuinely distinct corridors remain separate');

// L. Browser-facing row data and Word Table 3.3 consume the same grouped meaning.
const wordTable = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: [ordinarySchool[0]], serviceSummaries: [] })[1];
assert.equal(wordTable.rows[0][5], ordinarySchool[0].typicalFrequencyText, 'L: Word uses the same profile-qualified frequency text as Browser');
assert.equal(wordTable.rows[0][6], ordinarySchool[0].operatingPeriodLines.join('\n'), 'L: Word uses the same profile-qualified operating-period text as Browser');

// Full pairwise calendar-profile matrix, including missing metadata.
const profiles = ['ordinary', 'school-day', 'term-time', 'non-school-day', 'holiday', 'other-resolved', 'unresolved', undefined];
let matrixCases = 0;
for (let first = 0; first < profiles.length; first += 1) {
  for (let second = first + 1; second < profiles.length; second += 1) {
    const rows = planner([
      calendarRecord({ routeNumber: `M${first}${second}`, id: `M${first}${second}-first`, profile: profiles[first], departures: weekdayAt(480) }),
      calendarRecord({ routeNumber: `M${first}${second}`, id: `M${first}${second}-second`, profile: profiles[second], departures: weekdayAt(510) })
    ]);
    assert.equal(rows.length, 1, `matrix ${first}/${second}: one route-direction row`);
    assert.equal(rows[0].rawServiceSummaries.length, 2, `matrix ${first}/${second}: both source records retained`);
    assertNoUnconditionalCombinedFrequency(rows[0], `matrix ${first}/${second}: no unconditional combined frequency`);
    const expectedProfileCount = new Set([profiles[first] ?? 'unresolved', profiles[second] ?? 'unresolved']).size;
    assert.equal(rows[0].calendarProfileIds.length, expectedProfileCount, `matrix ${first}/${second}: profile taxonomy retained`);
    matrixCases += 1;
  }
}
assert.equal(matrixCases, 28, 'full calendar profile matrix covers every distinct profile pair');

console.log('PASS Alpha.13 calendar-safe planner consolidation: adversarial A–L and full profile matrix.');
