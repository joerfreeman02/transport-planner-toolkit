import assert from 'node:assert/strict';
import { parseTndsOperatingProfile, parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const allDays = [...weekdays, 'saturday', 'sunday'];
const profile = marker => `<OperatingProfile><RegularDayType><DaysOfWeek>${marker}</DaysOfWeek></RegularDayType></OperatingProfile>`;

assert.deepEqual(parseTndsOperatingProfile(profile('<MondayToFriday/>')).daysOfWeek, weekdays);
assert.deepEqual(parseTndsOperatingProfile(profile('<MondayToSaturday />')).daysOfWeek, [...weekdays, 'saturday']);
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

function tndsXml({ serviceProfile = '', patternProfile = '', journeyProfile = '' } = {}) {
  return `<TransXChange SchemaVersion="2.5"><Operators><Operator><TradingName>Profile Fixture</TradingName></Operator></Operators><Services><Service><ServiceCode>PROFILE</ServiceCode><LineName>PF</LineName>${serviceProfile}<StandardService><Origin>Origin</Origin><Destination>Destination</Destination></StandardService></Service></Services><StopPoints><AnnotatedStopPointRef><StopPointRef>PROFILE-A</StopPointRef><CommonName>Origin</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>PROFILE-B</StopPointRef><CommonName>Destination</CommonName></AnnotatedStopPointRef></StopPoints><JourneyPatternSections><JourneyPatternSection id="PROFILE-SECTION"><JourneyPatternTimingLink><From><StopPointRef>PROFILE-A</StopPointRef></From><To><StopPointRef>PROFILE-B</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink></JourneyPatternSection></JourneyPatternSections><JourneyPatterns><JourneyPattern id="PROFILE-PATTERN">${patternProfile}<Direction>outbound</Direction><DestinationDisplay>Destination</DestinationDisplay><JourneyPatternSectionRefs>PROFILE-SECTION</JourneyPatternSectionRefs></JourneyPattern></JourneyPatterns><VehicleJourneys><VehicleJourney><JourneyPatternRef>PROFILE-PATTERN</JourneyPatternRef><DepartureTime>08:00:00</DepartureTime>${journeyProfile}</VehicleJourney></VehicleJourneys></TransXChange>`;
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
assert.match(special.warnings.join(' '), /special-day operating metadata/);
console.log('PASS TNDS standard EmptyType operating profiles, precedence and calendar safety.');
