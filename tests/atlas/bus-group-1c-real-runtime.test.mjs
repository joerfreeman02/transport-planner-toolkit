import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildControlledBusWording } from '../../src/atlas/domain/bus-service-assessment.mjs';
import { hasPublicServiceCopyEvidence } from '../../src/atlas/domain/bus-grouping.mjs';
import { buildPlannerBusServiceSummaries, plannerSourceWarning } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
const waltham = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-group-1e-waltham-mixed-runtime.json', import.meta.url), 'utf8'));

const rows = buildPlannerBusServiceSummaries(waltham.serviceSummaries, waltham.stops);
const routeRows = route => rows.filter(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route));

for (const route of ['217', '279', '317', '327', '491', 'N279']) {
  assert.equal(waltham.metadata.counts.selectedControls[route], route === '279' ? 6 : 4, `${route} frozen runtime retains the expected mixed source record count`);
  assert.equal(routeRows(route).length, 1, `${route} has one useful planner row after source reconciliation`);
  assert.match(routeRows(route)[0].operator, /Arriva|Metroline/);
  assert.doesNotMatch(routeRows(route)[0].operator, /not supplied/i);
  assert.doesNotMatch(routeRows(route)[0].directionPatternText, /Waltham Cross Bus Station$/i);
}

const family13 = rows.find(row => row.routeNumber === '13');
assert.ok(family13);
assert.equal(family13.typicalFrequencyLines.some(line => /^(?:13A|13B|13C):/.test(line)), false, 'family headline frequency is principal-only');
assert.equal(family13.routeFamilyLabel, '13 / 13A / 13B / 13C');
assert.match(family13.plannerNotes.additionalServices, /Route 13A also serves/);
assert.match(family13.plannerNotes.additionalServices, /route 13B also serves/);
assert.match(family13.plannerNotes.additionalServices, /route 13C operates to/);
assert.doesNotMatch(`${family13.serviceNote} ${family13.routeGroupNote}`, /Route family .*member destinations|member destinations, calendars, frequencies/i);

const row66 = routeRows('66').find(row => row.plannerNotes?.shortWorkings) ?? routeRows('66')[0];
assert.match(row66.plannerNotes.shortWorkings, /Short|Hammond Street \(Smiths Lane\)|Hammond Street/);
assert.match(`${row66.plannerNotes.shortWorkings} ${row66.routeGroupNote ?? ''}`, /Hammond Street \(Smiths Lane\)/);
assert.doesNotMatch(row66.plannerNotes.shortWorkings, /Waltham Cross Bus Station/);
const row242 = routeRows('242').find(row => /Welham Green|Potters Bar/.test(row.plannerNotes?.additionalServices ?? '')) ?? routeRows('242')[0];
assert.match(row242.plannerNotes.additionalServices, /Welham Green Railway Station/);
assert.match(`${row242.destination} ${row242.plannerNotes.additionalServices}`, /Potters Bar Railway Station/);

const authority = makeService({ id: 'authority-217', routeNumber: '217', provider: 'TfL', operator: 'Arriva London North', origin: 'Alpha', destination: 'Gamma', pattern: ['A', 'B', 'C'] });
const supplementary = makeService({ id: 'national-217', routeNumber: '217', provider: 'BODS', operator: 'Operator not supplied in the timetable', origin: 'Alpha', destination: 'Gamma (national)', pattern: ['A', 'B', 'C'] });
assert.equal(hasPublicServiceCopyEvidence(authority, supplementary), true, 'authority and supplementary copies need shared directed corridor evidence');
assert.equal(hasPublicServiceCopyEvidence(makeService({ id: 'national-42', routeNumber: '42', provider: 'BODS', origin: 'Alpha', destination: 'Gamma', pattern: ['A', 'B', 'C'] }), supplementary), false, 'different route numbers never reconcile');

const wording = buildControlledBusWording([{ routeNumber: '13 / 13A / 13B / 13C', publicRouteNumbers: ['13', '13A', '13B', '13C'], principalLocations: ['Waltham Cross'] }]);
assert.match(wording, /13, 13A, 13B, 13C/);
assert.doesNotMatch(wording, /13 \/ 13A/);
assert.match(plannerSourceWarning({ routeNumber: '42', destination: 'Gamma', operator: '' }).join(' '), /operator identity/i);

const word = buildBusWordTables({ ok: true, stops: waltham.stops, plannerServiceSummaries: rows, serviceSummaries: [] });
const wordText = word.flatMap(table => table.rows ?? []).map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? '')).join(' ');
assert.match(wordText, /Additional services: Route 13A also serves/);
assert.match(wordText, /Hammond Street \(Smiths Lane\)/);
assert.doesNotMatch(wordText, /Route family .*member destinations|Service note: Route family/i);

function endpoint(name, id) {
  return { chosen: name, chosenDisplayName: name, decisionType: 'exact-endpoint-resolved', exact: true, exactEvidence: true, primaryEndpointStopPointId: id, endpointStopPointId: id, endpointStopPointIds: [id], stopArea: { id: `area:${name}` }, stopAreas: [{ id: `area:${name}`, name }] };
}

function makeService({ id, routeNumber, operator = 'Example Transit', provider = 'BODS', origin, destination, pattern, directionFamily = 'outbound', recordActivity = 10 }) {
  const schedule = { monday: [420], tuesday: [420], wednesday: [420], thursday: [420], friday: [420], saturday: [], sunday: [] };
  return {
    id, routeNumber, operator, provider, timetableSource: provider, source: { provider }, origin, destination,
    direction: directionFamily, directionFamily, originStopPointId: pattern[0], destinationStopPointId: pattern.at(-1),
    originEndpointDecision: endpoint(origin, pattern[0]), destinationEndpointDecision: endpoint(destination, pattern.at(-1)),
    routePatternStopIds: pattern, routePatternStops: pattern.map(idValue => ({ id: idValue, name: idValue })),
    stopIds: ['A', 'B'], assessedStops: ['A', 'B'], principalLocations: ['Assessed corridor'], calendarProfileId: 'ordinary',
    departuresByDay: schedule, departureEvidenceByDay: Object.fromEntries(Object.entries(schedule).map(([day, minutes]) => [day, minutes.map(minute => ({ minute, journeyIdentity: `${id}-${day}`, stopPointId: 'A', provider }))])),
    frequencyEvidence: [], sourceRecordIds: [id], sourceRouteIds: [`line-${routeNumber}`], recordActivity
  };
}

console.log('PASS BUS-GROUP-1C real-runtime reconciliation, compact taxonomy and route-inventory contracts.');
