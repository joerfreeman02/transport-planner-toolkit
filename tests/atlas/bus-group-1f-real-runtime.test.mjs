import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-group-1e-waltham-mixed-runtime.json', import.meta.url), 'utf8'));
const rows = buildPlannerBusServiceSummaries(fixture.serviceSummaries, fixture.stops);
const rowFor = route => rows.find(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route));
const rowsFor = route => rows.filter(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route));

for (const route of ['217', '279', '317', '327', '491', 'N279']) {
  const source = fixture.serviceSummaries.filter(service => service.routeNumber === route);
  assert.ok(source.some(service => service.provider === 'TfL' && service.calendarProfileId === 'ordinary'
    && (service.calendarEvidence ?? []).some(evidence => evidence.calendarResolved === true && evidence.resolved === true)), `${route} retains resolved TfL ordinary evidence`);
  assert.ok(source.filter(service => service.provider === 'BODS').every(service => !service.calendarProfileId && !(service.calendarEvidence ?? []).length), `${route} BODS copy has no asserted calendar`);
  const row = rowFor(route);
  assert.deepEqual(row.calendarProfileIds, ['ordinary'], `${route} public calendar uses authoritative ordinary profile only`);
  assert.doesNotMatch(`${row.calendarProfileLabels} ${row.serviceNote} ${JSON.stringify(row.plannerNotes)}`, /Calendar not confirmed|calendar applicability is not confirmed/i);
  assert.doesNotMatch(`${row.serviceNote} ${row.plannerNotes.serviceQualification ?? ''}`, /Operating days could not be fully confirmed/i);
}

const syntheticBase = ({ routeNumber = 'X', calendarProfileId, calendarEvidence, serviceNote = '', provider = 'BODS' } = {}) => ({
  id: `${routeNumber}-${provider}`,
  routeNumber,
  operator: 'Example Buses',
  provider,
  source: { provider },
  origin: 'Origin',
  destination: 'Destination',
  direction: 'outbound',
  directionFamily: 'outbound',
  routePatternStopIds: ['A', 'B'],
  originStopPointId: 'A',
  destinationStopPointId: 'B',
  originEndpointDecision: { chosen: 'Origin', chosenDisplayName: 'Origin', exact: true, exactEvidence: true, endpointStopPointId: 'A' },
  destinationEndpointDecision: { chosen: 'Destination', chosenDisplayName: 'Destination', exact: true, exactEvidence: true, endpointStopPointId: 'B' },
  stopIds: ['A'],
  assessedStops: ['A'],
  frequencyBasisStopId: 'A',
  departuresByDay: { monday: [420], tuesday: [420], wednesday: [420], thursday: [420], friday: [420], saturday: [], sunday: [] },
  departureEvidenceByDay: { monday: [{ minute: 420, journeyIdentity: `${routeNumber}-m` }], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
  sourceRecordIds: [`${routeNumber}-${provider}`],
  calendarProfileId,
  calendarEvidence,
  serviceNote
});

const unresolved = buildPlannerBusServiceSummaries([syntheticBase({ routeNumber: 'U1', calendarProfileId: 'unresolved', serviceNote: 'Calendar applicability is not confirmed.' })], [{ id: 'A', name: 'Origin', distanceMetres: 1 }])[0];
assert.equal(unresolved.plannerNotes.serviceQualification, 'Operating days could not be fully confirmed; check the timetable before use.');
assert.equal(unresolved.serviceNote, '');
assert.match(unresolved.routeGroupNote, /Service qualification: Operating days could not be fully confirmed; check the timetable before use\./);

const school = buildPlannerBusServiceSummaries([syntheticBase({ routeNumber: 'S1', calendarProfileId: 'school-day', serviceNote: 'School-day-only service.' })], [{ id: 'A', name: 'Origin', distanceMetres: 1 }])[0];
assert.match(`${school.routeGroupNote} ${school.plannerNotes.serviceQualification}`, /School-day journeys only\./);
const term = buildPlannerBusServiceSummaries([syntheticBase({ routeNumber: 'T1', calendarProfileId: 'term-time', serviceNote: 'Term-time service.' })], [{ id: 'A', name: 'Origin', distanceMetres: 1 }])[0];
assert.match(`${term.routeGroupNote} ${term.plannerNotes.serviceQualification}`, /Operates during term time only\./);
const nationalNoTaxonomy = buildPlannerBusServiceSummaries([syntheticBase({ routeNumber: 'N1' })], [{ id: 'A', name: 'Origin', distanceMetres: 1 }])[0];
assert.deepEqual(nationalNoTaxonomy.calendarProfileIds, []);
assert.equal(nationalNoTaxonomy.serviceNote, '');
assert.doesNotMatch(`${nationalNoTaxonomy.routeGroupNote ?? ''} ${JSON.stringify(nationalNoTaxonomy.plannerNotes)}`, /Calendar not confirmed|Operating days could not be fully confirmed/i);

for (const route of ['66', '251']) {
  assert.equal(rowsFor(route).length, 1, `${route} has one useful planner row`);
  const row = rowFor(route);
  assert.equal(row.terminusDecision.presentation, 'departing-only');
  assert.equal(row.terminusDecision.proven, true);
  assert.ok(row.terminusDecision.arrivalEvidence.length > 0);
  assert.match(row.plannerNotes.shortWorkings, /Some route .* journeys operate to Hammond Street \(Smiths Lane\)/);
  assert.doesNotMatch(`${row.destination} ${row.plannerNotes.additionalServices ?? ''}`, /Waltham Cross Bus Station/);
}

const through = syntheticBase({ routeNumber: 'TH', provider: 'TfL' });
through.stopIds = ['B'];
through.assessedStops = ['B'];
through.originStopPointId = 'A';
through.destinationStopPointId = 'C';
through.routePatternStopIds = ['A', 'B', 'C'];
through.destinationEndpointDecision = { chosen: 'C', chosenDisplayName: 'C', exact: true, exactEvidence: true, endpointStopPointId: 'C' };
const throughRow = buildPlannerBusServiceSummaries([through], [{ id: 'B', name: 'Assessed', distanceMetres: 1 }])[0];
assert.equal(throughRow.terminusDecision.status, 'through-service');
const uncertain = syntheticBase({ routeNumber: 'UN', provider: 'BODS' });
uncertain.originEndpointDecision = { chosen: 'Origin', chosenDisplayName: 'Origin', unresolved: true };
uncertain.destinationEndpointDecision = { chosen: 'Destination', chosenDisplayName: 'Destination', unresolved: true };
uncertain.stopIds = ['B']; uncertain.assessedStops = ['B']; uncertain.routePatternStopIds = ['A', 'B', 'C'];
const uncertainRow = buildPlannerBusServiceSummaries([uncertain], [{ id: 'B', name: 'Assessed', distanceMetres: 1 }])[0];
assert.equal(uncertainRow.terminusDecision.proven, false);
assert.equal(uncertainRow.terminusDecision.presentation, 'none');

const row279 = rowFor('279');
assert.match(row279.plannerNotes.additionalServices, /Manor House Station/);
assert.doesNotMatch(row279.plannerNotes.additionalServices, /Stamford Hill \(Rookwood Road\)/);
assert.equal(row279.publicServiceGroupingDecision.variantDestinationEvidence.find(variant => /Manor House/.test(variant.destination))?.kind, 'branch-variant');
assert.equal(rowFor('N279').plannerNotes.additionalServices, null);
assert.equal(rowFor('317').plannerNotes.additionalServices, null);
assert.match(rowFor('13').plannerNotes.additionalServices, /Route 13A also serves St Margaret's Hospital and Waltham Abbey \(Princesfield Rd\); route 13B also serves Railway Station and Waltham Abbey \(Princesfield Rd\); route 13C operates to Two Brewers/);
assert.equal(rowFor('13').principalLocations.join('|'), rowFor('13').routeFamilyMembers.find(member => member.routeNumber === '13').principalLocations.join('|'));
assert.ok(rowFor('242') && rowFor('310'));
assert.equal(rowsFor('217').length, 1);
assert.equal(rowsFor('279').length, 1);
assert.equal(rowsFor('317').length, 1);
assert.equal(rowsFor('327').length, 1);
assert.equal(rowsFor('491').length, 1);
assert.equal(rowsFor('N279').length, 1);
assert.equal(rows.filter(row => row.routeNumber === '16' || row.routeNumber === '16C').length, 2);
assert.ok(rows.filter(row => row.routeNumber === '16' || row.routeNumber === '16C').every(row => row.circular === false));
assert.ok(rows.filter(row => row.routeNumber === '16' || row.routeNumber === '16C').every(row => row.circularServiceDecision?.classification === 'unresolved-review'));

const word = buildBusWordTables({ ok: true, stops: fixture.stops, plannerServiceSummaries: rows, serviceSummaries: [] });
const wordServiceRows = word.find(table => table.caption.startsWith('Table 3.3')).rows;
const wordText = wordServiceRows.map(row => Array.isArray(row) ? row.join(' ') : row.text).join(' ');
const wordNotes = wordServiceRows.filter(row => !Array.isArray(row)).map(row => row.text);
assert.ok(wordNotes[0].startsWith('Presentation note: Where an assessed stop is the route terminus'));
assert.equal(wordNotes.filter(note => note.startsWith('Presentation note:')).length, 1);
assert.equal(wordNotes.at(-1).startsWith('Presentation note:'), false);
assert.match(wordText, /Short workings: Some route 66 journeys operate to Hammond Street \(Smiths Lane\)\./);
assert.match(wordText, /Additional services: Route 13A also serves St Margaret's Hospital and Waltham Abbey \(Princesfield Rd\)/);
assert.match(wordText, /Route terminus: Waltham Cross Bus Station\./);
assert.doesNotMatch(wordText, /66 – Hammond Street/);
assert.doesNotMatch(wordText, /Calendar not confirmed|calendar applicability is not confirmed/i);

console.log('PASS BUS-GROUP-1F calendar authority, terminus suppression, structured place identity, human annotation parity, and terminus-note positioning controls.');
