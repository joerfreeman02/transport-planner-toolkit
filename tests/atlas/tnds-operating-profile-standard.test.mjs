import assert from 'node:assert/strict';
import { parseTndsOperatingProfile, parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const allDays = [...weekdays, 'saturday', 'sunday'];
const profile = marker => `<OperatingProfile><RegularDayType><DaysOfWeek>${marker}</DaysOfWeek></RegularDayType></OperatingProfile>`;

assert.deepEqual(parseTndsOperatingProfile(profile('<MondayToFriday/>')).daysOfWeek, weekdays);
assert.deepEqual(parseTndsOperatingProfile(profile('<MondayToSaturday />')).daysOfWeek, [...weekdays, 'saturday']);
const weekdaySaturday = parseTndsOperatingProfile('<OperatingProfile><MondayToFriday/><Saturday/></OperatingProfile>');
assert.deepEqual(weekdaySaturday.daysOfWeek, [...weekdays, 'saturday']);
assert.equal(weekdaySaturday.daysOfWeek.includes('sunday'), false, 'Monday-Friday plus Saturday can never imply Sunday');
assert.deepEqual(parseTndsOperatingProfile(profile('<MondayToSunday/>')).daysOfWeek, allDays);
assert.deepEqual(parseTndsOperatingProfile(profile('<Weekend></Weekend>')).daysOfWeek, ['saturday', 'sunday']);
assert.deepEqual(parseTndsOperatingProfile(profile('<Wednesday/>')).daysOfWeek, ['wednesday']);
assert.deepEqual(parseTndsOperatingProfile(profile('<Tuesday/><Thursday/>')).daysOfWeek, ['tuesday', 'thursday']);
assert.deepEqual(parseTndsOperatingProfile(profile('<NotMonday/>')).daysOfWeek, allDays.slice(1));
assert.deepEqual(parseTndsOperatingProfile(profile('<NotMonday>false</NotMonday>')).daysOfWeek, []);
assert.deepEqual(parseTndsOperatingProfile('<OperatingProfile><MondayToFriday>true</MondayToFriday></OperatingProfile>').daysOfWeek, weekdays);
assert.deepEqual(parseTndsOperatingProfile('<OperatingProfile><MondayToFriday>false</MondayToFriday></OperatingProfile>').daysOfWeek, []);

const holidayOnly = parseTndsOperatingProfile('<OperatingProfile><HolidaysOnly/></OperatingProfile>');
assert.equal(holidayOnly.holidayOnly, true);
assert.equal(holidayOnly.calendarResolved, false);
assert.equal(holidayOnly.calendarProfileId, 'unresolved');
const holidayFalse = parseTndsOperatingProfile('<OperatingProfile><HolidaysOnly>false</HolidaysOnly><MondayToFriday/></OperatingProfile>');
assert.equal(holidayFalse.holidayOnly, false);
assert.deepEqual(holidayFalse.daysOfWeek, weekdays);

function tndsXml({ serviceProfile = '', patternProfile = '', journeyProfile = '', journeyProfiles = null } = {}) {
  const profiles = journeyProfiles ?? [journeyProfile];
  const vehicleJourneys = profiles.map((profileMarkup, index) => `<VehicleJourney><VehicleJourneyCode>PF-${index + 1}</VehicleJourneyCode><JourneyPatternRef>PROFILE-PATTERN</JourneyPatternRef><DepartureTime>08:${String(index).padStart(2, '0')}:00</DepartureTime>${profileMarkup}</VehicleJourney>`).join('');
  return `<TransXChange SchemaVersion="2.5"><Operators><Operator><TradingName>Profile Fixture</TradingName></Operator></Operators><Services><Service><ServiceCode>PROFILE</ServiceCode><LineName>PF</LineName>${serviceProfile}<StandardService><Origin>Origin</Origin><Destination>Destination</Destination></StandardService></Service></Services><StopPoints><AnnotatedStopPointRef><StopPointRef>PROFILE-A</StopPointRef><CommonName>Origin</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>PROFILE-B</StopPointRef><CommonName>Destination</CommonName></AnnotatedStopPointRef></StopPoints><JourneyPatternSections><JourneyPatternSection id="PROFILE-SECTION"><JourneyPatternTimingLink><From><StopPointRef>PROFILE-A</StopPointRef></From><To><StopPointRef>PROFILE-B</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink></JourneyPatternSection></JourneyPatternSections><JourneyPatterns><JourneyPattern id="PROFILE-PATTERN">${patternProfile}<Direction>outbound</Direction><DestinationDisplay>Destination</DestinationDisplay><JourneyPatternSectionRefs>PROFILE-SECTION</JourneyPatternSectionRefs></JourneyPattern></JourneyPatterns><VehicleJourneys>${vehicleJourneys}</VehicleJourneys></TransXChange>`;
}

const serviceLevel = parseTndsTransXchangeServices(tndsXml({ serviceProfile: profile('<MondayToFriday/>') }), { region: 'SE' })[0];
assert.deepEqual(serviceLevel.calendarEvidence[0].daysOfWeek, weekdays, 'standard Service OperatingProfile survives');
assert.deepEqual(serviceLevel.stopSchedules['PROFILE-A'].monday, [480]);
assert.deepEqual(serviceLevel.stopSchedules['PROFILE-A'].saturday, []);

const patternLevel = parseTndsTransXchangeServices(tndsXml({ serviceProfile: profile('<MondayToSunday/>'), patternProfile: profile('<Weekend/>') }), { region: 'SE' })[0];
assert.deepEqual(patternLevel.calendarEvidence[0].daysOfWeek, ['saturday', 'sunday'], 'JourneyPattern profile overrides Service profile');
assert.deepEqual(patternLevel.stopSchedules['PROFILE-A'].friday, []);
assert.deepEqual(patternLevel.stopSchedules['PROFILE-A'].saturday, [480]);

const vehicleLevel = parseTndsTransXchangeServices(tndsXml({ serviceProfile: profile('<MondayToFriday/>'), patternProfile: profile('<Saturday/>'), journeyProfile: profile('<Sunday/>') }), { region: 'SE' })[0];
assert.deepEqual(vehicleLevel.calendarEvidence[0].daysOfWeek, ['sunday'], 'VehicleJourney profile overrides JourneyPattern and Service profiles');
assert.deepEqual(vehicleLevel.stopSchedules['PROFILE-A'].saturday, []);
assert.deepEqual(vehicleLevel.stopSchedules['PROFILE-A'].sunday, [480]);

const special = parseTndsOperatingProfile('<OperatingProfile><RegularDayType><DaysOfWeek><MondayToFriday/></DaysOfWeek></RegularDayType><SpecialDaysOperation><SpecialDay>Tuesday</SpecialDay></SpecialDaysOperation></OperatingProfile>');
assert.deepEqual(special.daysOfWeek, weekdays, 'regular days remain independently proven when special metadata is present');
assert.equal(special.resolutionStatus, 'partial');
assert.deepEqual(special.dateExceptions, ['Tuesday'], 'special-day records remain available for engineering inspection');
assert.deepEqual(special.qualificationMetadata.specialFields, ['SpecialDaysOperation']);
assert.deepEqual(special.warnings, [], 'nonmaterial special-day metadata does not create a planner-facing per-service warning');
const broadPartial = '<OperatingProfile><RegularDayType><DaysOfWeek><MondayToSunday/></DaysOfWeek></RegularDayType><SpecialDaysOperation><DateException>2026-12-25</DateException></SpecialDaysOperation></OperatingProfile>';
const weekdayPartial = '<OperatingProfile><RegularDayType><DaysOfWeek><MondayToFriday/></DaysOfWeek></RegularDayType><SpecialDaysOperation><DateException>2026-12-25</DateException></SpecialDaysOperation></OperatingProfile>';
const conflictedProfiles = parseTndsTransXchangeServices(tndsXml({ journeyProfiles: [broadPartial, weekdayPartial] }), { region: 'SE' })[0];
assert.deepEqual(conflictedProfiles.stopSchedules['PROFILE-A'].monday, [480, 481]);
assert.deepEqual(conflictedProfiles.stopSchedules['PROFILE-A'].saturday, [], 'conflicting partial profiles do not promote broad weekend evidence');
assert.deepEqual(conflictedProfiles.stopSchedules['PROFILE-A'].sunday, [], 'a partial all-days profile contradicted by a weekday profile cannot fabricate Sunday');
assert.ok(conflictedProfiles.sourceWarnings.some(warning => /conflicting partially resolved operating-day profiles/i.test(warning)), 'partial calendar disagreement remains qualified for review');
const saturdayPartial = '<OperatingProfile><RegularDayType><DaysOfWeek><Saturday/></DaysOfWeek></RegularDayType><SpecialDaysOperation><DateException>2026-12-25</DateException></SpecialDaysOperation></OperatingProfile>';
const weekdaySaturdayConflict = parseTndsTransXchangeServices(tndsXml({ journeyProfiles: [broadPartial, weekdayPartial, saturdayPartial] }), { region: 'SE' })[0];
assert.deepEqual(weekdaySaturdayConflict.stopSchedules['PROFILE-A'].saturday, [480, 482], 'broad and specific journeys remain on a specifically supported Saturday');
assert.deepEqual(weekdaySaturdayConflict.stopSchedules['PROFILE-A'].sunday, [], 'the broader contradicted profile does not invent Sunday');
const allWeek = Object.fromEntries([...allDays].map(day => [day, [480, 500]]));
const conflictedPreparedSummary = buildServiceSummaries([{ id: 'PROFILE-A', name: 'Origin' }], [{
  id: 'prepared-conflicting-profile', routeNumber: 'PF', operator: 'Profile Fixture', origin: 'Origin', destination: 'Destination', direction: 'outbound',
  provider: 'TNDS', timetableSource: 'TNDS', source: { provider: 'TNDS' }, stopSchedules: { 'PROFILE-A': allWeek },
  departureEvidenceByDay: Object.fromEntries([...allDays].map(day => [day, [480, 500].map(minute => ({ minute, stopPointId: 'PROFILE-A', provider: 'TNDS' }))])),
  calendarEvidence: [
    { daysOfWeek: allDays, resolutionStatus: 'partial', qualificationMetadata: { specialFields: ['SpecialDaysOperation'] } },
    { daysOfWeek: weekdays, resolutionStatus: 'partial', qualificationMetadata: { specialFields: ['SpecialDaysOperation'] } }
  ],
  routePatternStopIds: ['PROFILE-A', 'PROFILE-B'], routePatternStops: [{ id: 'PROFILE-A', name: 'Origin' }, { id: 'PROFILE-B', name: 'Destination' }]
}])[0];
assert.deepEqual(conflictedPreparedSummary.departuresByDay.sunday, [], 'prepared Run #75-style schedules are constrained by conflicting partial calendar profiles');
assert.equal(conflictedPreparedSummary.typicalFrequencyLines[0], 'Mon-Fri: 2 journeys/day');
assert.ok(conflictedPreparedSummary.sourceWarnings.some(warning => /frozen calendar profiles conflict/i.test(warning)), 'the planner receives one concise unresolved-calendar qualification');
assert.ok(conflictedPreparedSummary.serviceNote.includes('Confirm weekend service against the operator timetable.'), 'the unresolved calendar qualification is visible with the final planner row');
console.log('PASS TNDS standard EmptyType operating profiles, precedence and calendar safety.');
