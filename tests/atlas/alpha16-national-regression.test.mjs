import assert from 'node:assert/strict';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const selectedStops = [{ id: 'SEL', name: 'Assessment stop', locality: 'Midpoint', distanceMetres: 100 }];

function pattern(names) {
  return names.map((name, index) => ({ id: `${name}-${index}`, name, locality: name }));
}

function record({
  id, routeNumber, origin, destination, direction = destination, operator = 'Example Transit', source = 'BODS',
  patternNames = [origin, 'Midpoint', destination], departures = [420, 480], circular = false,
  calendarProfileId = 'ordinary', serviceNote = '', serviceLineageId = routeNumber, directionFamily = '',
  qualifications = [], ...extra
}) {
  const evidence = Object.fromEntries(days.map(day => [day, []]));
  evidence.monday = departures.map((minute, index) => ({
    minute, journeyIdentity: `${id}-journey-${index}`, provider: source, stopPointId: 'SEL'
  }));
  return {
    id, routeNumber, operator, origin, destination, direction, directionFamily, serviceLineageId,
    routePatternStopIds: patternNames.map((name, index) => `${name}-${index}`),
    routePatternStops: pattern(patternNames), principalLocations: [origin, destination],
    frequencyBasisStopId: 'SEL', stopIds: ['SEL'], departuresByDay: { ...Object.fromEntries(days.map(day => [day, []])), monday: departures },
    departureEvidenceByDay: evidence, sourceRecordIds: [id], timetableSource: source,
    calendarProfileId, serviceNote, qualifications, circular, ...extra
  };
}

function rowsFor(records) {
  return buildPlannerBusServiceSummaries(records, selectedStops);
}

// 1. Straightforward two-direction BODS route.
{
  const rows = rowsFor([
    record({ id: 'linear-out', routeNumber: 'L1', origin: 'Town A', destination: 'Town B' }),
    record({ id: 'linear-back', routeNumber: 'L1', origin: 'Town B', destination: 'Town A', direction: 'Town A', patternNames: ['Town B', 'Midpoint', 'Town A'] })
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map(row => row.destination)), new Set(['Town A', 'Town B']));
  assert.ok(rows.every(row => row.typicalFrequencyText && row.operatingPeriodLines.length));
}

// 2. Suffix variants belong to one family and retain their short-working destination.
{
  const rows = rowsFor([
    record({ id: 'suffix-main', routeNumber: 'X', origin: 'Town A', destination: 'Town B' }),
    record({ id: 'suffix-short', routeNumber: 'XA', origin: 'Town A', destination: 'Town C', direction: 'Town C', patternNames: ['Town A', 'Midpoint', 'Town C'] })
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].rawRouteNumbers, ['X', 'XA']);
  assert.match(`${rows[0].routeVariantNote} ${rows[0].serviceNote} ${rows[0].routeGroupNote}`, /Town C/);
}

// 3. Similar route numbers with divergent corridors must not merge.
{
  const rows = rowsFor([
    record({ id: 'divergent-base', routeNumber: 'X', origin: 'Town A', destination: 'Town B', patternNames: ['Town A', 'Alpha', 'Town B'] }),
    record({ id: 'divergent-suffix', routeNumber: 'XA', origin: 'Town D', destination: 'Town E', patternNames: ['Town D', 'Delta', 'Town E'] })
  ]);
  assert.equal(rows.length, 2);
}

// 4. At an endpoint, show only the represented outward direction.
{
  const rows = rowsFor([record({ id: 'terminus', routeNumber: 'T1', origin: 'Town A', destination: 'Town B', patternNames: ['Town A', 'Town B'] })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].directionPatternText, 'Towards Town B');
}

// 5. A genuinely closed ordered pattern remains circular.
{
  const rows = rowsFor([record({ id: 'loop', routeNumber: 'C1', origin: 'Loop', destination: 'Loop', patternNames: ['Loop', 'Midpoint', 'Loop'], circular: true })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].circular, true);
}

// 6. School/term-time evidence is retained and is not promoted to ordinary service.
{
  const rows = rowsFor([record({ id: 'school', routeNumber: 'S1', origin: 'School', destination: 'Town', calendarProfileId: 'school-day', qualifications: ['School days only'], serviceNote: 'School days only.' })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].calendarProfileId, 'school-day');
  assert.match(rows[0].serviceNote, /School days only/i);
}

// 7. Materially different operators remain distinct opportunities.
{
  const rows = rowsFor([
    record({ id: 'operator-a-out', routeNumber: 'M1', origin: 'Town A', destination: 'Town B', operator: 'Alpha Transit' }),
    record({ id: 'operator-a-back', routeNumber: 'M1', origin: 'Town B', destination: 'Town A', operator: 'Alpha Transit', direction: 'Town A', patternNames: ['Town B', 'Midpoint', 'Town A'] }),
    record({ id: 'operator-b-out', routeNumber: 'M1', origin: 'Town A', destination: 'Town B', operator: 'Beta Transit' }),
    record({ id: 'operator-b-back', routeNumber: 'M1', origin: 'Town B', destination: 'Town A', operator: 'Beta Transit', direction: 'Town A', patternNames: ['Town B', 'Midpoint', 'Town A'] })
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(new Set(rows.map(row => row.operator)), new Set(['Alpha Transit', 'Beta Transit']));
}

// 8. BODS/TNDS copies collapse one physical departure but retain both source IDs.
{
  const first = record({ id: 'duplicate-bods', routeNumber: 'D1', origin: 'Town A', destination: 'Town B', source: 'BODS' });
  const copy = record({ id: 'duplicate-tnds', routeNumber: 'D1', origin: 'Town A', destination: 'Town B', source: 'TNDS' });
  copy.departureEvidenceByDay.monday[0].journeyIdentity = first.departureEvidenceByDay.monday[0].journeyIdentity;
  const rows = rowsFor([first, copy]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].canonicalDeparturePopulationAll.monday.length, departuresCount(first));
  assert.deepEqual(new Set(rows[0].sourceRecordIds), new Set(['duplicate-bods', 'duplicate-tnds']));
}

function departuresCount(service) {
  return service.departureEvidenceByDay.monday.length;
}

// 9. TfL evidence is treated as an ordinary authoritative route; unresolved
// endpoint evidence produces review-required output instead of invention.
{
  const resolved = rowsFor([record({ id: 'tfl-ok', routeNumber: 'T1', origin: 'City Centre', destination: 'Hospital', source: 'TfL' })]);
  assert.equal(resolved[0].directionPatternText, 'Towards Hospital');
  const unresolved = rowsFor([record({ id: 'tfl-unresolved', routeNumber: 'T2', origin: 'Bus Station', destination: 'Bus Station', direction: '', source: 'TfL', patternNames: ['Bus Station', 'Bus Station'] })]);
  assert.equal(unresolved.length, 0, 'unresolved TfL identity is withheld rather than invented');
}

// 10. A material branch remains separately visible.
{
  const rows = rowsFor([
    record({ id: 'branch-a', routeNumber: 'B1', origin: 'Town A', destination: 'Town B', patternNames: ['Town A', 'Midpoint', 'Branch A', 'Town B'] }),
    record({ id: 'branch-b', routeNumber: 'B1', origin: 'Town A', destination: 'Town C', patternNames: ['Town A', 'Midpoint', 'Branch B', 'Town C'] })
  ]);
  assert.equal(rows.length, 2);
}

console.log('PASS Alpha.16 national planner regression matrix: 10/10 cases.');
