import assert from 'node:assert/strict';
import { parseTndsOperatingProfile, parseTndsTransXchangeServices } from '../../src/atlas/adapters/tnds-transxchange-adapter.mjs';
import { buildServiceSummaries } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { createBusAssessment } from '../../src/atlas/application/bus-assessment.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

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
assert.equal(conflictedPreparedSummary.calendarReconciliation[0]?.status, 'conflict-conservatively-restricted', 'calendar reconciliation remains inspectable in evidence metadata');
assert.deepEqual(conflictedPreparedSummary.calendarReconciliation[0]?.originalProfiles.map(item => item.daysOfWeek), [allDays, weekdays], 'the conflicting original profiles remain available for detailed review');
assert.deepEqual(conflictedPreparedSummary.plannerReviewWarnings, ['Route PF operating-day records conflicted. ATLAS retained the supported days; verify the operator timetable before formal use.'], 'a TNDS-only calendar conflict becomes one concise route-level review item');
assert.ok(!/frozen calendar profiles conflict|most specific profiles|calendar profile reconciliation/i.test(`${conflictedPreparedSummary.serviceNote} ${conflictedPreparedSummary.sourceWarnings.join(' ')}`), 'internal calendar reconciliation language is not promoted into planner row text');

const make231 = ({ id, origin, destination, direction, weekdayCount, saturdayCount }) => {
  const schedule = Object.fromEntries([...allDays].map(day => [day, day === 'sunday' ? [] : day === 'saturday'
    ? Array.from({ length: saturdayCount }, (_, index) => 600 + index * 60)
    : Array.from({ length: weekdayCount }, (_, index) => 480 + index * 60)]));
  return {
    id, routeNumber: '231', operator: 'South Beds Dial-a-Ride', origin, destination, direction,
    provider: 'TNDS', timetableSource: 'TNDS', source: { provider: 'TNDS' }, stopSchedules: { 'PROFILE-A': schedule },
    departureEvidenceByDay: Object.fromEntries([...allDays].map(day => [day, schedule[day].map(minute => ({ minute, stopPointId: 'PROFILE-A', provider: 'TNDS' }))])),
    calendarEvidence: [allDays, weekdays, ['saturday']].map(daysOfWeek => ({ daysOfWeek, resolutionStatus: 'partial', qualificationMetadata: { specialFields: ['SpecialDaysOperation'] } })),
    routePatternStopIds: ['PROFILE-A', 'PROFILE-B'], routePatternStops: [{ id: 'PROFILE-A', name: 'Origin' }, { id: 'PROFILE-B', name: 'Destination' }]
  };
};
const route231 = buildServiceSummaries([{ id: 'PROFILE-A', name: 'Origin' }], [
  make231({ id: '231-to-asda', origin: 'Pepperstock', destination: 'Dunstable Asda', direction: 'outbound', weekdayCount: 3, saturdayCount: 2 }),
  make231({ id: '231-to-pepperstock', origin: 'Dunstable Asda', destination: 'Pepperstock', direction: 'inbound', weekdayCount: 4, saturdayCount: 1 })
]);
assert.equal(route231.length, 2, 'Route 231 remains two distinct directional services');
assert.deepEqual(route231.map(row => [row.origin, row.destination, row.departuresByDay.monday.length, row.departuresByDay.saturday.length, row.departuresByDay.sunday.length]).sort((a, b) => a[1].localeCompare(b[1])), [
  ['Dunstable Asda', 'Pepperstock', 4, 1, 0],
  ['Pepperstock', 'Dunstable Asda', 3, 2, 0]
].sort((a, b) => a[1].localeCompare(b[1])), 'conservative reconciliation preserves 3/2 and 4/1 weekday/Saturday populations with no Sunday journeys');
assert.ok(route231.every(row => row.plannerReviewWarnings.length === 1 && row.calendarReconciliation.length === 1), 'each TNDS direction retains inspectable conflict provenance and one route-level review qualification');

const bodsPrimaryWithSupplementaryConflict = buildServiceSummaries([{ id: 'PROFILE-A', name: 'Origin' }], [{
  id: 'bods-primary-calendar', routeNumber: 'PF', operator: 'Profile Fixture', origin: 'Origin', destination: 'Destination', direction: 'outbound',
  provider: 'BODS', timetableSource: 'BODS', source: { provider: 'BODS' }, stopSchedules: { 'PROFILE-A': allWeek },
  departureEvidenceByDay: Object.fromEntries([...allDays].map(day => [day, [480, 500].map(minute => ({ minute, stopPointId: 'PROFILE-A', provider: 'BODS' }))])),
  routePatternStopIds: ['PROFILE-A', 'PROFILE-B'], routePatternStops: [{ id: 'PROFILE-A', name: 'Origin' }, { id: 'PROFILE-B', name: 'Destination' }]
}, {
  id: 'tnds-supplementary-calendar', routeNumber: 'PF', operator: 'Profile Fixture', origin: 'Origin', destination: 'Destination', direction: 'outbound',
  provider: 'TNDS', timetableSource: 'TNDS', source: { provider: 'TNDS' }, stopSchedules: { 'PROFILE-A': allWeek },
  departureEvidenceByDay: Object.fromEntries([...allDays].map(day => [day, [480, 500].map(minute => ({ minute, stopPointId: 'PROFILE-A', provider: 'TNDS' }))])),
  calendarEvidence: [
    { daysOfWeek: allDays, resolutionStatus: 'partial', qualificationMetadata: { specialFields: ['SpecialDaysOperation'] } },
    { daysOfWeek: weekdays, resolutionStatus: 'partial', qualificationMetadata: { specialFields: ['SpecialDaysOperation'] } }
  ],
  routePatternStopIds: ['PROFILE-A', 'PROFILE-B'], routePatternStops: [{ id: 'PROFILE-A', name: 'Origin' }, { id: 'PROFILE-B', name: 'Destination' }]
}])[0];
assert.equal(bodsPrimaryWithSupplementaryConflict.provider, 'BODS + TNDS');
assert.ok(!bodsPrimaryWithSupplementaryConflict.serviceNote.includes('operator timetable'), 'a supplementary TNDS conflict does not become an inline BODS-primary qualification');
assert.deepEqual(bodsPrimaryWithSupplementaryConflict.plannerReviewWarnings, [], 'a safe BODS-primary row does not receive an irrelevant TNDS calendar review item');
assert.ok(!/frozen calendar profiles conflict|most specific profiles|calendar profile reconciliation/i.test(`${bodsPrimaryWithSupplementaryConflict.serviceNote} ${bodsPrimaryWithSupplementaryConflict.sourceWarnings.join(' ')}`), 'BODS-primary planner text stays free of internal calendar language');

const reviewAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [{ id: 'PROFILE-A', name: 'Origin', routes: ['PF'], timetableAuthority: 'NaPTAN', routeAuthorities: { PF: ['NaPTAN'] } }], warnings: [], provenance: { stopCoverageComplete: true } }) },
  timetableData: { servicesForStops: async () => ({ ok: true, data: [{
    id: 'prepared-conflicting-profile', routeNumber: 'PF', operator: 'Profile Fixture', origin: 'Origin', destination: 'Destination', direction: 'outbound',
    provider: 'TNDS', timetableSource: 'TNDS', source: { provider: 'TNDS' }, stopSchedules: { 'PROFILE-A': allWeek },
    departureEvidenceByDay: Object.fromEntries([...allDays].map(day => [day, [480, 500].map(minute => ({ minute, stopPointId: 'PROFILE-A', provider: 'TNDS' }))])),
    calendarEvidence: [
      { daysOfWeek: allDays, resolutionStatus: 'partial', qualificationMetadata: { specialFields: ['SpecialDaysOperation'] } },
      { daysOfWeek: weekdays, resolutionStatus: 'partial', qualificationMetadata: { specialFields: ['SpecialDaysOperation'] } }
    ], routePatternStopIds: ['PROFILE-A', 'PROFILE-B'], routePatternStops: [{ id: 'PROFILE-A', name: 'Origin' }, { id: 'PROFILE-B', name: 'Destination' }]
  }], warnings: [], provenance: { source: 'TNDS', nationalSourceAvailable: true } }) },
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: {} }) }
});
const reviewed = await reviewAssessment.assess({ latitude: 51.8, longitude: -0.4 });
const calendarReviewItems = reviewed.reviewItems.filter(item => item.route === 'PF' && /operating-day records conflicted/i.test(item.message));
assert.equal(calendarReviewItems.length, 1, 'the TNDS conflict is emitted once in Sources & Checks for the route despite grouped row processing');
assert.equal(reviewed.plannerServiceSummaries[0].frequencyByDay.sunday.departureCount, 0, 'the planner-facing row does not reintroduce Sunday service');
const wordTables = buildBusWordTables(reviewed);
const professionalOutput = JSON.stringify({ browserRows: reviewed.plannerServiceSummaries, wordTables, checks: reviewed.reviewItems });
assert.ok(!/frozen calendar profiles conflict|most specific profiles|calendar profile reconciliation|conflicting partially resolved operating-day profiles/i.test(professionalOutput), 'final Browser, Word and Sources & Checks output contains no internal calendar wording');
const route231ReviewAssessment = createBusAssessment({
  stopDiscovery: { nearbyStops: async () => ({ ok: true, data: [{ id: 'PROFILE-A', name: 'Origin', routes: ['231'], timetableAuthority: 'NaPTAN', routeAuthorities: { 231: ['NaPTAN'] } }], warnings: [], provenance: { stopCoverageComplete: true } }) },
  timetableData: { servicesForStops: async () => ({ ok: true, data: [
    make231({ id: '231-to-asda', origin: 'Pepperstock', destination: 'Dunstable Asda', direction: 'outbound', weekdayCount: 3, saturdayCount: 2 }),
    make231({ id: '231-to-pepperstock', origin: 'Dunstable Asda', destination: 'Pepperstock', direction: 'inbound', weekdayCount: 4, saturdayCount: 1 })
  ], warnings: [], provenance: { source: 'TNDS', nationalSourceAvailable: true } }) },
  accessRouting: { matrix: async (_site, stops) => ({ ok: true, routes: stops.map(() => ({ status: 'routed', distanceMetres: 100, durationSeconds: 60 })), warnings: [], provenance: {} }) }
});
const reviewed231 = await route231ReviewAssessment.assess({ latitude: 51.8, longitude: -0.4 });
const route231Checks = reviewed231.reviewItems.filter(item => item.route === '231' && /operating-day records conflicted/i.test(item.message));
assert.equal(route231Checks.length, 1, 'the two distinct Route 231 directions share one concise Sources & Checks item');
assert.deepEqual(reviewed231.plannerServiceSummaries.map(row => [row.destination, row.frequencyByDay.monday.departureCount, row.frequencyByDay.saturday.departureCount, row.frequencyByDay.sunday.departureCount]).sort((a, b) => a[0].localeCompare(b[0])), [
  ['Dunstable Asda', 3, 2, 0], ['Pepperstock', 4, 1, 0]
].sort((a, b) => a[0].localeCompare(b[0])), 'final Route 231 Browser row data retains the two accepted weekday/Saturday/no-Sunday counts');
const word231Text = JSON.stringify(buildBusWordTables(reviewed231));
assert.ok(!/frozen calendar profiles conflict|most specific profiles|calendar profile reconciliation|conflicting partially resolved operating-day profiles/i.test(word231Text), 'Word table rows omit internal calendar conflict language for both Route 231 directions');
console.log('PASS TNDS standard EmptyType operating profiles, precedence and calendar safety.');
