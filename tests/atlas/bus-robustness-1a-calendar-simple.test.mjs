import assert from 'node:assert/strict';
import { buildBusTimetablePresentationNote, buildPlannerBusServiceSummaries, plannerRouteDisplayNumber } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const stops = [{ id: 'REP', name: 'Representative stop', walking: { status: 'routed', distanceMetres: 80 } }];

function week({ weekday = [], saturday = [], sunday = [] } = {}) {
  return Object.fromEntries(DAYS.map(day => [day,
    day === 'saturday' ? [...saturday] : day === 'sunday' ? [...sunday] : [...weekday]]));
}

function record({ routeNumber = 'QA', profile, departures, serviceNote = '', id = `${routeNumber}-${profile}`, direction = 'outbound', destination = 'Terminus', frequencyEvidence = [] } = {}) {
  const schedule = departures ?? week({ weekday: [480] });
  const departureEvidenceByDay = Object.fromEntries(DAYS.map(day => [day, schedule[day].map((minute, index) => ({
    minute,
    stopPointId: 'REP',
    journeyIdentity: `${id}-${day}-${index}`,
    provider: 'TfL',
    calendarProfileId: profile
  }))]));
  return {
    id,
    routeNumber,
    operator: 'TfL',
    origin: 'Origin',
    destination,
    direction,
    directionFamily: direction,
    routePatternStopIds: ['ORIGIN', 'REP', 'DEST'],
    principalLocations: ['Origin', 'Terminus'],
    frequencyBasisStopId: 'REP',
    stopIds: ['REP'],
    departuresByDay: schedule,
    departureEvidenceByDay,
    frequencyEvidence,
    sourceRecordIds: [id],
    serviceNote,
    calendarProfileId: profile
  };
}

function planner(records) {
  return buildPlannerBusServiceSummaries(records, stops);
}

const schoolDepartures = week({ weekday: [480, 510], saturday: [], sunday: [] });
const nonSchoolDepartures = week({ weekday: [540], saturday: [], sunday: [] });
const ordinaryDepartures = week({ weekday: [], saturday: [600], sunday: [630] });
const schoolFrequencyEvidence = DAYS.filter(day => !['saturday', 'sunday'].includes(day)).map(day => ({ periodType: 'FrequencyMinutes', day, lowestFrequency: 15, highestFrequency: 15, calendarProfileId: 'school-day' }));
const ordinaryWithVariants = planner([
  record({ routeNumber: 'CONTROL', profile: 'ordinary', departures: ordinaryDepartures }),
  record({ routeNumber: 'CONTROL', profile: 'school-day', departures: schoolDepartures, frequencyEvidence: schoolFrequencyEvidence }),
  record({ routeNumber: 'CONTROL', profile: 'non-school-day', departures: nonSchoolDepartures })
])[0];

assert.deepEqual(ordinaryWithVariants.calendarProfileIds, ['ordinary', 'school-day', 'non-school-day']);
assert.equal(ordinaryWithVariants.hasSeparateTimetablePair, true);
assert.equal(plannerRouteDisplayNumber(ordinaryWithVariants), 'CONTROL†');
assert.equal(ordinaryWithVariants.typicalFrequencyText, 'Mon-Fri: Every ~15 mins\nSat-Sun: 1 journey/day', 'representative week uses school-day weekdays and ordinary weekend evidence');
assert.deepEqual(ordinaryWithVariants.departuresByDay, {
  ...ordinaryWithVariants.calendarSchedulesByProfile['school-day'],
  saturday: ordinaryWithVariants.calendarSchedulesByProfile.ordinary.saturday,
  sunday: ordinaryWithVariants.calendarSchedulesByProfile.ordinary.sunday
}, 'principal departure population is composed by representative week day');
assert.deepEqual(ordinaryWithVariants.frequencyByDay, {
  ...ordinaryWithVariants.calendarFrequencyByProfile['school-day'],
  saturday: ordinaryWithVariants.calendarFrequencyByProfile.ordinary.saturday,
  sunday: ordinaryWithVariants.calendarFrequencyByProfile.ordinary.sunday
}, 'principal frequency is composed by representative week day');
assert.deepEqual(ordinaryWithVariants.operatingPeriods, {
  ...ordinaryWithVariants.calendarOperatingPeriodsByProfile['school-day'],
  saturday: ordinaryWithVariants.calendarOperatingPeriodsByProfile.ordinary.saturday,
  sunday: ordinaryWithVariants.calendarOperatingPeriodsByProfile.ordinary.sunday
}, 'principal operating period is composed by representative week day');
assert.equal(ordinaryWithVariants.operatingPeriodLines.length, 3, 'representative weekdays and ordinary weekend periods are emitted');
assert.equal(ordinaryWithVariants.typicalFrequencyLines.length, 2, 'representative weekdays and ordinary weekend frequencies are emitted');
assert.doesNotMatch(ordinaryWithVariants.typicalFrequencyText, /Standard days|School days \(additional\)|Non-school days \(additional\)/);
assert.doesNotMatch(ordinaryWithVariants.operatingPeriodLines.join('\n'), /Standard days|School days \(additional\)|Non-school days \(additional\)/);
assert.equal(ordinaryWithVariants.serviceNote, '');
assert.equal(ordinaryWithVariants.plannerNotes.serviceQualification, null, 'calendar variation is not a service qualification');
assert.doesNotMatch(JSON.stringify(ordinaryWithVariants.plannerNotes), /School-day journeys only|Non-school days only/);
assert.equal(ordinaryWithVariants.calendarDeparturePopulationByProfile['school-day'].length, 10, 'school-day departure evidence remains profile-scoped');
assert.ok(ordinaryWithVariants.calendarDeparturePopulationByProfile['non-school-day'].length, 'non-school timetable remains retained for detailed evidence');
assert.ok(ordinaryWithVariants.calendarSchedulesByProfile['non-school-day'].monday.length, 'non-school schedule remains retained for audit');
assert.equal(ordinaryWithVariants.canonicalDeparturePopulation.saturday.length, 1, 'ordinary Saturday evidence is present in the normal planner population');
assert.equal(ordinaryWithVariants.canonicalDeparturePopulation.sunday.length, 1, 'ordinary Sunday evidence is present in the normal planner population');

const splitMonThu = Object.fromEntries(DAYS.map(day => [day, ['monday', 'tuesday', 'wednesday', 'thursday'].includes(day) ? [480] : []]));
const splitFriday = Object.fromEntries(DAYS.map(day => [day, day === 'friday' ? [510] : []]));
const splitOrdinaryWeekend = week({ weekday: [], saturday: [600], sunday: [630] });
const splitTermTime = planner([
  record({ routeNumber: 'SPLIT', profile: 'ordinary', departures: splitOrdinaryWeekend }),
  record({ routeNumber: 'SPLIT', id: 'SPLIT-MON-THU', profile: 'school-day', departures: splitMonThu }),
  record({ routeNumber: 'SPLIT', id: 'SPLIT-FRI', profile: 'school-day', departures: splitFriday }),
  record({ routeNumber: 'SPLIT', id: 'SPLIT-NON-SCHOOL', profile: 'non-school-day', departures: week({ weekday: [540] }) })
])[0];
assert.deepEqual(Object.fromEntries(DAYS.map(day => [day, splitTermTime.departuresByDay[day].length])), {
  monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1
}, 'split term-time evidence composes each weekday from its applicable source population');
assert.deepEqual(splitTermTime.departuresByDay.monday, [480]);
assert.deepEqual(splitTermTime.departuresByDay.friday, [510]);
assert.deepEqual(splitTermTime.departuresByDay.saturday, [600]);
assert.deepEqual(splitTermTime.departuresByDay.sunday, [630]);
assert.ok(splitTermTime.calendarDeparturePopulationByProfile['non-school-day'].length, 'split non-school timetable remains retained for audit');
assert.equal(splitTermTime.serviceNote, '');
assert.equal(plannerRouteDisplayNumber(splitTermTime), 'SPLIT†');

const presentationResult = { provenance: { stops: { retrievedAt: '2026-10-07T12:34:56Z' } } };
assert.equal(buildBusTimetablePresentationNote(presentationResult, [ordinaryWithVariants]), 'Where separate term-time and school-holiday timetables are published, the term-time timetable is shown. Routes marked † have separate timetables. Timetable information reflects the data available to ATLAS on 2026-10-07 and services may vary during school holidays.');
const word = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: [ordinaryWithVariants], serviceSummaries: [], ...presentationResult });
const wordTableRow = word[1].rows.find(row => Array.isArray(row));
assert.equal(wordTableRow[0], 'CONTROL†', 'Word adds the presentation-only dagger without changing routeNumber');
assert.equal(wordTableRow[5], ordinaryWithVariants.typicalFrequencyText, 'Word frequency matches Browser planner output');
assert.equal(wordTableRow[6], ordinaryWithVariants.operatingPeriodLines.join('\n'), 'Word operating period matches Browser planner output');
const wordNotes = word[1].rows.filter(row => !Array.isArray(row)).map(row => row.text).join(' ');
assert.equal(word[1].rows.filter(row => !Array.isArray(row) && row.text.startsWith('Timetable note:')).length, 1, 'Word emits one table-wide timetable note');
assert.match(wordNotes, /Timetable information reflects the data available to ATLAS on 2026-10-07/);
assert.doesNotMatch(wordNotes, /Service note: Timetable may vary during school holidays\./);
assert.doesNotMatch(wordNotes, /School-day journeys only|Non-school days only|Standard days|additional/);

const schoolOnly = planner([record({
  routeNumber: '657',
  profile: 'school-day',
  departures: week({ weekday: [982] }),
  serviceNote: 'School-day-only service.'
})])[0];
assert.equal(schoolOnly.typicalFrequencyText, 'Mon-Fri (School days): 1 journey/day\nSat-Sun (School days): No scheduled service');
assert.equal(schoolOnly.serviceNote, 'School-day journeys only.');
assert.equal(schoolOnly.hasSeparateTimetablePair, false);
assert.equal(plannerRouteDisplayNumber(schoolOnly), '657');
assert.match(schoolOnly.plannerNotes.serviceQualification, /School-day journeys only/);
assert.doesNotMatch(schoolOnly.serviceNote, /Timetable may vary during school holidays/);
assert.equal(schoolOnly.canonicalDeparturePopulation.monday.length, 1, 'school-only one-journey/day behaviour is unchanged');

const schoolOnly629 = planner([record({
  routeNumber: '629',
  profile: 'school-day',
  departures: week({ weekday: [450, 900] }),
  serviceNote: 'School-day-only service.'
})])[0];
assert.equal(schoolOnly629.hasSeparateTimetablePair, false);
assert.equal(plannerRouteDisplayNumber(schoolOnly629), '629');
assert.equal(schoolOnly629.canonicalDeparturePopulation.monday.length, 2, '629-style school-only journey count is unchanged');
assert.match(schoolOnly629.plannerNotes.serviceQualification, /School-day journeys only/);

const nonSchoolOnly = planner([record({ routeNumber: 'HOL', profile: 'non-school-day', departures: week({ weekday: [600] }), serviceNote: 'Non-school days only.' })])[0];
assert.equal(nonSchoolOnly.serviceNote, 'Non-school days only.');
assert.match(nonSchoolOnly.plannerNotes.serviceQualification, /non-school days only/i);
assert.doesNotMatch(nonSchoolOnly.serviceNote, /Timetable may vary during school holidays/);

const mixedWithoutWeekend = planner([
  record({ routeNumber: 'NOWKND', profile: 'school-day', departures: week({ weekday: [480] }) }),
  record({ routeNumber: 'NOWKND', profile: 'non-school-day', departures: week({ weekday: [540] }) })
])[0];
assert.equal(mixedWithoutWeekend.typicalFrequencyText, 'Mon-Fri: 1 journey/day\nSat-Sun: No scheduled service');
assert.deepEqual(mixedWithoutWeekend.departuresByDay.saturday, [], 'mixed school calendars do not invent weekend service');
assert.equal(mixedWithoutWeekend.serviceNote, '');
assert.equal(plannerRouteDisplayNumber(mixedWithoutWeekend), 'NOWKND†');

const ordinarySingle = planner([record({ routeNumber: 'ORD', profile: 'ordinary', departures: week({ weekday: [720] }) })])[0];
assert.equal(ordinarySingle.typicalFrequencyText, 'Mon-Fri: 1 journey/day\nSat-Sun: No scheduled service');
assert.equal(ordinarySingle.serviceNote, '');
assert.equal(ordinarySingle.hasSeparateTimetablePair, false);
assert.equal(plannerRouteDisplayNumber(ordinarySingle), 'ORD');
assert.equal(ordinarySingle.plannerNotes.serviceQualification, null);

console.log('PASS BUS-ROBUSTNESS-1A simple calendar presentation and Browser/Word parity.');
