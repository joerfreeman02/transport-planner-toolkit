import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries, buildPlannerServiceGroups } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const week = Object.freeze({ monday: [420], tuesday: [420], wednesday: [420], thursday: [420], friday: [420], saturday: [], sunday: [] });
const stops = [
  { id: 'W-A', name: 'Bus Station', indicator: 'Stop A', stopAreaId: 'area:WALTHAM', stopAreaName: 'Waltham Cross Bus Station', walking: { status: 'routed', distanceMetres: 80 } },
  { id: 'W-C', name: 'Bus Station', indicator: 'Stop C', stopAreaId: 'area:WALTHAM', stopAreaName: 'Waltham Cross Bus Station', walking: { status: 'routed', distanceMetres: 100 } },
  { id: 'H', name: 'Hertford Bus Station', stopAreaId: 'area:HERTFORD', stopAreaName: 'Hertford Bus Station', walking: { status: 'routed', distanceMetres: 250 } },
  { id: 'L', name: 'Loughton Station', stopAreaId: 'area:LOUGHTON', stopAreaName: 'Loughton Station', walking: { status: 'routed', distanceMetres: 250 } },
  { id: 'M', name: 'Midpoint', walking: { status: 'routed', distanceMetres: 150 } }
];

function endpoint(place, stopPointId, stopAreaId, raw = place) {
  return {
    rawEndpointText: raw,
    chosen: place,
    chosenDisplayName: place,
    decisionType: 'exact-endpoint-resolved',
    exactEvidence: true,
    exact: true,
    primaryEndpointStopPointId: stopPointId,
    endpointStopPointId: stopPointId,
    endpointStopPointIds: [stopPointId],
    stopArea: { id: stopAreaId, name: place },
    stopAreas: [{ id: stopAreaId, name: place }],
    evidence: { endpointEvidenceSet: [{ endpointStopPointId: stopPointId }], stopAreas: [{ id: stopAreaId, name: place }] }
  };
}

function record({ id, routeNumber = '310', operator = 'Arriva', provider = 'BODS', origin = 'Hertford Bus Station', destination = 'Waltham Cross Bus Station', originStopPointId = 'H', destinationStopPointId = 'W-A', pattern = ['H', 'M', 'W-A'], direction = destination, sourceRouteIds = ['line-310'], serviceNote = '', calendarProfileId = 'ordinary', departuresByDay = week, departureEvidenceByDay, ...extra } = {}) {
  return {
    id: id || `${routeNumber}-${origin}-${destination}`,
    routeNumber, operator, provider, timetableSource: provider, origin, destination,
    originStopPointId, destinationStopPointId, originStopPointIds: [originStopPointId], destinationStopPointIds: [destinationStopPointId],
    originEndpointDecision: endpoint(origin, originStopPointId, origin === 'Waltham Cross Bus Station' ? 'area:WALTHAM' : origin === 'Hertford Bus Station' ? 'area:HERTFORD' : 'area:OTHER'),
    destinationEndpointDecision: endpoint(destination, destinationStopPointId, destination === 'Waltham Cross Bus Station' ? 'area:WALTHAM' : destination === 'Hertford Bus Station' ? 'area:HERTFORD' : destination === 'Loughton Station' ? 'area:LOUGHTON' : 'area:OTHER'),
    routePatternStopIds: pattern, routePatternStops: pattern.map(id => ({ id, name: id })), routePatternExtent: pattern.length,
    direction, directionFamily: direction, sourceRouteIds, stopIds: [originStopPointId, destinationStopPointId], principalLocations: ['Waltham Cross'],
    departuresByDay, departureEvidenceByDay, calendarProfileId, serviceNote,
    recordActivity: 10, frequencyBasisStopId: 'W-A', frequencyEvidence: [], sourceRecordIds: [id || `${routeNumber}-${origin}-${destination}`],
    ...extra
  };
}

function rows(records, selectedStops = stops) { return buildPlannerBusServiceSummaries(records, selectedStops); }

// Exact endpoint/place evidence reconciles different destination wording and
// keeps the national source underneath a TfL-authoritative public row.
const n279Tfl = record({ id: 'tfl-n279', routeNumber: 'N279', operator: 'Arriva London North', provider: 'TfL', origin: 'Waltham Cross', destination: 'Charing Cross (Trafalgar Square)', originStopPointId: 'W-A', destinationStopPointId: 'CC', pattern: ['W-A', 'M', 'CC'], direction: 'outbound' });
const n279National = record({ id: 'tnds-n279', routeNumber: 'N279', operator: 'Operator not supplied in the timetable', provider: 'TNDS', origin: 'Bus Station', destination: 'Trafalgar Square / Charing Cross Stn', originStopPointId: 'W-C', destinationStopPointId: 'CC', pattern: ['W-C', 'M', 'CC'], direction: 'outbound' });
n279Tfl.originEndpointDecision = endpoint('Waltham Cross Bus Station', 'W-A', 'area:WALTHAM', 'Waltham Cross');
n279Tfl.destinationEndpointDecision = endpoint('Charing Cross (Trafalgar Square)', 'CC', 'area:CHARING-CROSS', 'Charing Cross');
n279National.originEndpointDecision = endpoint('Waltham Cross Bus Station', 'W-C', 'area:WALTHAM', 'Bus Station');
n279National.destinationEndpointDecision = endpoint('Charing Cross (Trafalgar Square)', 'CC', 'area:CHARING-CROSS', 'Trafalgar Square / Charing Cross Stn');
const n279Rows = rows([n279National, n279Tfl]);
assert.equal(n279Rows.length, 1, 'TfL and national copies become one public N279 direction');
assert.equal(n279Rows[0].operator, 'Arriva London North');
assert.deepEqual([...n279Rows[0].publicServiceGroupingDecision.sourceRecordIds].sort(), ['tfl-n279', 'tnds-n279']);
assert.equal(n279Rows[0].publicServiceGroupingDecision.authority, 'TfL');
assert.equal(n279Rows[0].publicServiceGroupingDecision.decision, 'same-public-service');
assert.ok(n279Rows[0].publicServiceGroupingDecision.deduplicatedSourceRecordIds.includes('tnds-n279'));

const numeric279 = record({ id: 'numeric-279', routeNumber: '279', origin: 'Waltham Cross Bus Station', destination: 'Turnpike Lane Station', originStopPointId: 'W-A', destinationStopPointId: 'CC', pattern: ['W-A', 'M', 'CC'], direction: 'outbound' });
assert.equal(rows([n279Tfl, numeric279]).length, 2, '279 and N279 remain separate');
assert.equal(rows([record({ id: 'other-end', routeNumber: '310', destination: 'Ware Railway Station', destinationStopPointId: 'L', pattern: ['H', 'M', 'L'] }), record({ id: 'different-operator', routeNumber: '310', operator: 'Uno', destination: 'Waltham Cross Bus Station', destinationStopPointId: 'W-A', pattern: ['H', 'M', 'W-A'] })]).length, 2, 'different endpoints/operators do not collapse unsafely');

// Principal pattern, short-working and genuine branch evidence.
const full66 = record({ id: '66-full', routeNumber: '66', origin: 'Waltham Cross Bus Station', destination: 'Loughton Station', originStopPointId: 'W-A', destinationStopPointId: 'L', pattern: ['W-A', 'M', 'L'], direction: 'outbound' });
const short66 = record({ id: '66-short', routeNumber: '66', origin: 'Waltham Cross Bus Station', destination: 'Hammond Street', originStopPointId: 'W-C', destinationStopPointId: 'M', pattern: ['W-C', 'M'], direction: 'outbound' });
short66.destinationEndpointDecision = endpoint('Hammond Street', 'M', 'area:HAMMOND');
const shortRows = rows([short66, full66]);
assert.equal(shortRows.length, 1);
assert.equal(shortRows[0].destination, 'Loughton Station');
assert.match(`${shortRows[0].serviceNote} ${shortRows[0].routeGroupNote || ''}`, /Hammond Street|short workings|variants/i);
assert.ok(shortRows[0].publicServiceGroupingDecision.shortWorkingRecordIds.includes('66-short'));
assert.ok(shortRows[0].publicServiceGroupingDecision.alternateDestinations.includes('Hammond Street'));
const branchRows = rows([
  record({ id: 'branch-north', routeNumber: '13', destination: 'North Weald', destinationStopPointId: 'L', pattern: ['W-A', 'M', 'L'], sourceRouteIds: ['family-13'] }),
  record({ id: 'branch-epping', routeNumber: '13A', destination: 'Epping', destinationStopPointId: 'H', pattern: ['W-A', 'X', 'H'], sourceRouteIds: ['family-13'] })
]);
assert.equal(branchRows.length, 2, 'materially divergent family branches remain visible');
assert.ok(branchRows.every(row => row.publicServiceGroupingDecision.materialDestinationEvidence.length));
assert.equal(rows([record({ id: 'unrelated-13a', routeNumber: '13A', destination: 'Epping', pattern: ['Q', 'R'], sourceRouteIds: ['unrelated'] }), record({ id: 'unrelated-13', routeNumber: '13', destination: 'North Weald', pattern: ['S', 'T'], sourceRouteIds: ['other'] })]).length, 2, 'same-number-stem services without lineage/pattern evidence remain separate');
assert.equal(rows([record({ id: 'n13', routeNumber: 'N13' }), record({ id: '13', routeNumber: '13' })]).length, 2, 'N-prefixed routes are excluded from ordinary numeric family logic');

// Calendar qualifications and frequency identity remain separate from public
// service identity, and same-minute genuinely distinct journeys survive.
const school13 = record({ id: 'school-13', routeNumber: '13C', calendarProfileId: 'school-day', serviceNote: 'Route 13C operates on school days only.', sourceRouteIds: ['family-13'], departuresByDay: { ...week, saturday: [], sunday: [] } });
const term13 = record({ id: 'term-13', routeNumber: '13', calendarProfileId: 'term-time', serviceNote: 'Route 13 operates in term-time only.', sourceRouteIds: ['family-13'] });
const calendarRows = rows([school13, term13]);
assert.ok(calendarRows.some(row => /school days/i.test(`${row.serviceNote} ${row.routeGroupNote || ''}`)));
assert.ok(calendarRows.some(row => /term-time/i.test(`${row.serviceNote} ${row.routeGroupNote || ''}`)));
const sameMinute = rows([record({ id: 'journey-a', routeNumber: '242', departureEvidenceByDay: { monday: [{ minute: 500, journeyIdentity: 'A', provider: 'TfL' }], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } }), record({ id: 'journey-b', routeNumber: '242', departureEvidenceByDay: { monday: [{ minute: 500, journeyIdentity: 'B', provider: 'TfL' }], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } })]);
assert.equal(sameMinute[0].canonicalDeparturePopulation.monday.length, 2, 'same-minute journeys with different identities are not deduplicated');
const duplicateJourney = rows([record({ id: 'journey-tfl', routeNumber: '217', departureEvidenceByDay: { monday: [{ minute: 500, journeyIdentity: 'J', provider: 'TfL' }], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } }), record({ id: 'journey-national', routeNumber: '217', operator: 'Operator not supplied in the timetable', provider: 'TNDS', departureEvidenceByDay: { monday: [{ minute: 500, journeyIdentity: 'J', provider: 'TNDS' }], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } })]);
assert.equal(duplicateJourney[0].canonicalDeparturePopulation.monday.length, 1, 'cross-source physical journey copy is counted once');

// A StopArea proves one terminus even when arrival and departure use
// different stands.  The arrival row is suppressed only when a departing row
// for the same assessed place exists.
const tenOut = record({ id: '310-outbound', routeNumber: '310', origin: 'Hertford Bus Station', destination: 'Bus Station', originStopPointId: 'H', destinationStopPointId: 'W-C', pattern: ['H', 'M', 'W-C'], direction: 'outbound' });
tenOut.destinationEndpointDecision = endpoint('Waltham Cross Bus Station', 'W-C', 'area:WALTHAM', 'Bus Station');
const tenIn = record({ id: '310-inbound', routeNumber: '310', origin: 'Bus Station', destination: 'Hertford Bus Station', originStopPointId: 'W-A', destinationStopPointId: 'H', pattern: ['W-A', 'M', 'H'], direction: 'inbound' });
tenIn.originEndpointDecision = endpoint('Waltham Cross Bus Station', 'W-A', 'area:WALTHAM', 'Bus Station');
const tenRows = rows([tenOut, tenIn]);
assert.equal(tenRows.length, 1, 'proven terminal removes the arrival-only redundant row');
assert.equal(tenRows[0].direction, 'inbound');
// BUS-GROUP-1D supersedes the former generic service-note terminus banner:
// the proven fact is now emitted once through plannerNotes.terminus.
assert.equal(tenRows[0].plannerNotes.terminus, 'Waltham Cross Bus Station');
assert.ok(tenRows[0].terminusDecision.arrivalEvidence.includes('310-outbound'), 'suppressed arrival remains auditable');
assert.deepEqual(tenRows[0].terminusDecision.terminalStopPointIds, ['W-A']);
const through = record({ id: 'through', routeNumber: '491', origin: 'North', destination: 'South', originStopPointId: 'H', destinationStopPointId: 'L', pattern: ['H', 'W-A', 'M', 'L'], direction: 'southbound' });
through.originEndpointDecision = endpoint('North', 'H', 'area:HERTFORD');
through.destinationEndpointDecision = endpoint('South', 'L', 'area:LOUGHTON');
assert.equal(rows([through]).length, 1);
assert.equal(rows([through])[0].terminusDecision.status, 'through-service', 'through service at assessed place is not suppressed');
const uncertain = record({ id: 'uncertain', routeNumber: '15', origin: 'Bus Station', destination: 'Harlow Town Centre', originStopPointId: 'W-A', destinationStopPointId: 'H', pattern: ['W-A', 'M', 'H'] });
uncertain.originEndpointDecision = { chosen: 'Waltham Cross Bus Station', chosenDisplayName: 'Waltham Cross Bus Station', primaryEndpointStopPointId: 'W-A', stopArea: { id: 'area:WALTHAM', name: 'Waltham Cross Bus Station' } };
assert.equal(rows([uncertain])[0].terminusDecision.proven, false, 'uncertain endpoint proof fails safe');

// Circular state is carried through unchanged, and Browser/Word use the same
// grouped row and note.
const circular = record({ id: '16-loop', routeNumber: '16', origin: 'Loop', destination: 'Loop', originStopPointId: 'W-A', destinationStopPointId: 'W-A', pattern: ['W-A', 'M', 'W-A'], circular: true, direction: 'clockwise' });
const circularRow = rows([circular])[0];
assert.equal(circularRow.circular, true);
const wordRow = buildBusWordTables({ ok: true, stops, plannerServiceSummaries: tenRows, serviceSummaries: [] })[1].rows.find(row => Array.isArray(row) && row[0] === '310');
assert.equal(wordRow[1], tenRows[0].operator);
assert.match(wordRow[2], /Hertford Bus Station/);
const wordNotes = buildBusWordTables({ ok: true, stops, plannerServiceSummaries: tenRows, serviceSummaries: [] })[1].rows.filter(row => !Array.isArray(row)).map(row => row.text).join(' ');
assert.match(wordNotes, /Terminus: Waltham Cross Bus Station/);
assert.ok(tenRows[0].plannerServiceGroup.destinationEndpointDecision, 'BUS-DEST endpoint decision remains under the planner group');
assert.ok(buildPlannerServiceGroups([tenIn], stops)[0].publicServiceGroupingDecision, 'grouping decision is a domain object before presentation');

console.log('PASS BUS-GROUP public-service grouping, endpoint/place equivalence, branch/short-working notes, calendar/frequency safety, terminus proof, and Browser/Word parity.');
