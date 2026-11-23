import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const schedule = minutes => Object.fromEntries(days.map(day => [day, day === 'saturday' || day === 'sunday' ? [] : minutes]));
const evidence = (id, minutes) => Object.fromEntries(days.map(day => [day,
  (day === 'saturday' || day === 'sunday' ? [] : minutes).map((minute, index) => ({
    minute, stopPointId: 'LONG-LANE', journeyIdentity: `${id}-${day}-${index}`, provider: 'BODS', calendarProfileId: 'ordinary'
  }))
]));
const base = {
  operator: 'White Bus Services', provider: 'BODS', timetableSource: 'BODS', source: { provider: 'BODS' },
  direction: 'outbound', directionFamily: 'outbound', origin: 'Hepworth Way', routeNumber: '555',
  frequencyBasisStopId: 'LONG-LANE', stopIds: ['LONG-LANE'], assessedStops: ['LONG-LANE'],
  departuresByDay: schedule([]), calendarProfileId: 'ordinary', calendarEvidence: [], frequencyEvidence: [],
  operatingPeriods: {}, principalLocations: []
};
const principalMinutes = Array.from({ length: 12 }, (_value, index) => 300 + index * 90);
const shortMinutes = Array.from({ length: 30 }, (_value, index) => 330 + index * 30);
const endpoint = name => ({ chosen: name, chosenDisplayName: name, decisionType: 'exact-endpoint-resolved', exact: true, exactEvidence: true });
const containedPattern = ['HEPWORTH', 'LONG-LANE', ...Array.from({ length: 28 }, (_value, index) => `TRUNK-${index + 1}`), 'HATTON-CROSS'];
const mainPattern = [...containedPattern, ...Array.from({ length: 8 }, (_value, index) => `HEATHROW-${index + 1}`)];
const principal = {
  ...base, id: '555-heathrow-central', sourceRecordIds: ['555-heathrow-central'], destination: 'Heathrow Central',
  routePatternStopIds: mainPattern, routePatternExtent: mainPattern.length, recordActivity: 7, originStopPointId: 'HEPWORTH', destinationStopPointId: 'HEATHROW-CENTRAL', originStopPointIds: ['HEPWORTH'], destinationStopPointIds: ['HEATHROW-CENTRAL'],
  originEndpointDecision: endpoint('Hepworth Way'), destinationEndpointDecision: endpoint('Heathrow Central'), stopSchedules: { 'LONG-LANE': schedule(principalMinutes) }, departureEvidenceByDay: evidence('central', principalMinutes)
};
const hattonCross = {
  ...base, id: '555-hatton-cross', sourceRecordIds: ['555-hatton-cross'], destination: 'Hatton Cross',
  routePatternStopIds: containedPattern, routePatternExtent: containedPattern.length, recordActivity: 30, originStopPointId: 'HEPWORTH', destinationStopPointId: 'HATTON-CROSS', originStopPointIds: ['HEPWORTH'], destinationStopPointIds: ['HATTON-CROSS'],
  originEndpointDecision: endpoint('Hepworth Way'), destinationEndpointDecision: endpoint('Hatton Cross'), stopSchedules: { 'LONG-LANE': schedule(shortMinutes) }, departureEvidenceByDay: evidence('hatton', shortMinutes)
};
const setdownOnly = {
  ...hattonCross, id: '555-setdown-only', sourceRecordIds: ['555-setdown-only'],
  departureEvidenceByDay: Object.fromEntries(days.map(day => [day,
    (day === 'saturday' || day === 'sunday' ? [] : shortMinutes).map((minute, index) => ({
      minute, stopPointId: 'LONG-LANE', journeyIdentity: `setdown-${day}-${index}`, provider: 'BODS', calendarProfileId: 'ordinary', occurrenceRole: 'arrival'
    }))
  ]))
};
const stop = { id: 'LONG-LANE', name: 'Long Lane', distanceMetres: 25, walking: { status: 'routed', distanceMetres: 25 } };
const rows = buildPlannerBusServiceSummaries([principal, hattonCross, setdownOnly], [stop]);
const route555 = rows.find(row => row.routeNumber === '555');
assert.ok(route555, 'the Route 555 public service remains visible');
assert.ok(route555.plannerServiceGroup?.publicServiceGroupingDecision?.shortWorkingRecordIds?.includes('555-hatton-cross'), 'the strictly contained Hatton Cross pattern is identified as a short working');
assert.equal(route555.canonicalDeparturePopulation.monday.length, new Set([...principalMinutes, ...shortMinutes]).size, 'boardable same-direction recurring contained short-workings contribute to the assessed-stop frequency without duplicating a principal departure at the same minute or counting set-down-only calls');
assert.match(route555.typicalFrequencyText, /journeys\/day|Every ~\d+ mins/i, 'frequency is presented from the combined eligible population');

console.log('PASS Beta.2 cross-site regression: contained same-direction Route 555 short-working departures contribute to the stop-scoped population.');
