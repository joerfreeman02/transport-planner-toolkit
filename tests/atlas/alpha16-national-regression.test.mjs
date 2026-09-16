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
    routePatternCompleteness: 'complete',
    frequencyBasisStopId: 'SEL', stopIds: ['SEL'], departuresByDay: { ...Object.fromEntries(days.map(day => [day, []])), monday: departures },
    departureEvidenceByDay: evidence, sourceRecordIds: [id], timetableSource: source,
    calendarProfileId, serviceNote, qualifications, circular, ...extra
  };
}

function rowsFor(records, stops = selectedStops) {
  return buildPlannerBusServiceSummaries(records, stops);
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
  const resolved = rowsFor([record({ id: 'tfl-ok', routeNumber: 'T1', origin: 'City Centre', destination: 'Hospital', source: 'TfL', publicRouteOrigin: 'City Centre', publicRouteDestination: 'Hospital' })]);
  assert.equal(resolved[0].directionPatternText, 'Towards Hospital');
  const unresolved = rowsFor([record({ id: 'tfl-unresolved', routeNumber: 'T2', origin: 'Bus Station', destination: 'Bus Station', direction: '', source: 'TfL', patternNames: ['Bus Station', 'Bus Station'] })]);
  assert.equal(unresolved.length, 1, 'unresolved TfL identity remains visible without inventing a destination');
  assert.equal(unresolved[0].directionPatternText, 'Destination not resolved');
}

// 10. A material branch remains separately visible.
{
  const rows = rowsFor([
    record({ id: 'branch-a', routeNumber: 'B1', origin: 'Town A', destination: 'Town B', patternNames: ['Town A', 'Midpoint', 'Branch A', 'Town B'] }),
    record({ id: 'branch-b', routeNumber: 'B1', origin: 'Town A', destination: 'Town C', patternNames: ['Town A', 'Midpoint', 'Branch B', 'Town C'] })
  ]);
  assert.equal(rows.length, 2);
}

// 11. A complete pattern dominates a locally observed assessment fragment.
{
  const localStops = [{ id: 'SEL', name: 'Local stop', locality: 'Locality Y', distanceMetres: 80 }];
  const rows = rowsFor([
    record({ id: 'locality-trap-out', routeNumber: 'I11', origin: 'Town A', destination: 'Town B', patternNames: ['Town A', 'Locality X', 'Locality Y', 'Town B'], principalLocations: ['Town A', 'Locality X', 'Locality Y', 'Town B'] }),
    record({ id: 'locality-trap-back', routeNumber: 'I11', origin: 'Town B', destination: 'Town A', direction: 'Town A', patternNames: ['Town B', 'Locality Y', 'Locality X', 'Town A'], principalLocations: ['Town B', 'Locality Y', 'Locality X', 'Town A'] })
  ], localStops);
  assert.deepEqual(new Set(rows.map(row => row.destination)), new Set(['Town A', 'Town B']));
  assert.ok(rows.every(row => ![row.origin, row.destination].includes('Locality Y')));
}

// 12. A generic complete terminal may be named from its own terminal locality.
{
  const service = record({ id: 'generic-terminal-town', routeNumber: 'I12', origin: 'Town A', destination: 'Bus Station', patternNames: ['Town A', 'Bus Station'], routePatternStops: [
    { id: 'Town A-0', name: 'Town A', locality: 'Town A' },
    { id: 'Bus Station-1', name: 'Bus Station', locality: 'Town B' }
  ] });
  const [row] = rowsFor([service]);
  assert.equal(row.destination, 'Town B');
  assert.equal(row.publicEndpointEvidence.destination.localitySupport, true);
}

// 13. A selected-site bus station inside a complete route is not a terminal.
{
  const localStops = [{ id: 'SEL', name: 'Bus Station', locality: 'Locality Y', distanceMetres: 80 }];
  const atSite = [
    { id: 'Town A-0', name: 'Town A', locality: 'Town A' },
    { id: 'Bus Station-1', name: 'Bus Station', locality: 'Locality Y' },
    { id: 'Town B-2', name: 'Town B', locality: 'Town B' }
  ];
  const rows = rowsFor([
    record({ id: 'site-station-out', routeNumber: 'I13', origin: 'Bus Station', destination: 'Bus Station', patternNames: ['Town A', 'Bus Station', 'Town B'], routePatternStops: atSite }),
    record({ id: 'site-station-back', routeNumber: 'I13', origin: 'Bus Station', destination: 'Bus Station', direction: 'Town A', patternNames: ['Town B', 'Bus Station', 'Town A'], routePatternStops: [...atSite].reverse() })
  ], localStops);
  assert.deepEqual(new Set(rows.map(row => row.destination)), new Set(['Town A', 'Town B']));
  assert.ok(rows.every(row => ![row.origin, row.destination].includes('Locality Y')));
}

// 14. A full A-D corridor outranks a shorter A-C working.
{
  const rows = rowsFor([
    record({ id: 'short-main', routeNumber: 'I14', origin: 'A', destination: 'D', patternNames: ['A', 'B', 'C', 'D'] }),
    record({ id: 'short-variant', routeNumber: 'I14A', origin: 'A', destination: 'C', patternNames: ['A', 'B', 'C'], serviceNote: 'Short working towards C.' })
  ]);
  assert.ok(rows.some(row => row.destination === 'D'));
  assert.ok(rows.some(row => /C/.test(`${row.routeGroupNote ?? ''} ${row.serviceNote}`)));
}

// 15. Matching complete reciprocal evidence resolves a generic reverse.
{
  const rows = rowsFor([
    record({ id: 'reciprocal-explicit', routeNumber: 'I15', origin: 'A', destination: 'D', publicRouteOrigin: 'A', publicRouteDestination: 'D', patternNames: ['A', 'Midpoint', 'D'] }),
    record({ id: 'reciprocal-generic', routeNumber: 'I15', origin: 'Bus Station', destination: 'Bus Station', direction: 'Bus Station', patternNames: ['D', 'Midpoint', 'A'] })
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map(row => row.destination)), new Set(['A', 'D']));
}

// 16. Generic reverse labels without complete matching evidence stay unresolved.
{
  const rows = rowsFor([
    record({ id: 'one-sided-explicit', routeNumber: 'I16', origin: 'A', destination: 'D', publicRouteOrigin: 'A', publicRouteDestination: 'D' }),
    record({ id: 'one-sided-unknown', routeNumber: 'I16', origin: 'Bus Station', destination: 'Bus Station', direction: 'Bus Station', routePatternStopIds: [], routePatternStops: [], routePatternCompleteness: 'partial' })
  ]);
  const unresolved = rows.find(row => row.rawServiceSummaries.some(service => service.id === 'one-sided-unknown'));
  assert.ok(unresolved);
  assert.equal(unresolved.directionPatternText, 'Destination not resolved');
  assert.equal(unresolved.publicEndpointEvidence.destination.status, 'unresolved');
  assert.equal(unresolved.publicEndpointEvidence.destination.value, null, 'raw generic terminal labels do not masquerade as resolved endpoint provenance');
}

// 17. A positively declared and complete closed pattern remains circular.
{
  const [row] = rowsFor([record({ id: 'true-loop', routeNumber: 'I17', origin: 'Loop', destination: 'Loop', patternNames: ['Loop', 'Midpoint', 'Loop'], circular: true })]);
  assert.equal(row.circular, true);
}

// 18. Equal generic endpoint labels do not turn a complete open pattern circular.
{
  const [row] = rowsFor([record({ id: 'false-loop', routeNumber: 'I18', origin: 'Bus Station', destination: 'Bus Station', direction: 'Bus Station', patternNames: ['Town A', 'Midpoint', 'Town B'], circular: true })]);
  assert.equal(row.circular, false);
}

// 19. Operator-specific corridors remain separate.
{
  const rows = rowsFor([
    record({ id: 'op-a', routeNumber: 'I19', origin: 'Town A', destination: 'Town B', operator: 'Alpha Transit' }),
    record({ id: 'op-b', routeNumber: 'I19', origin: 'Town C', destination: 'Town D', operator: 'Beta Transit' })
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map(row => row.operator)), new Set(['Alpha Transit', 'Beta Transit']));
}

// 20. Suffix-family principal and variant evidence remain separately represented.
{
  const rows = rowsFor([
    record({ id: 'suffix-principal-full', routeNumber: 'I20', origin: 'A', destination: 'D', patternNames: ['A', 'B', 'C', 'D'] }),
    record({ id: 'suffix-principal-short', routeNumber: 'I20A', origin: 'A', destination: 'C', patternNames: ['A', 'B', 'C'] })
  ]);
  assert.ok(rows.some(row => row.destination === 'D'));
  assert.ok(rows.some(row => row.rawRouteNumbers.includes('I20A')));
}

// 21. A high-activity clipped fragment cannot displace full-pattern terminals.
{
  const rows = rowsFor([
    record({ id: 'activity-full-out', routeNumber: 'I21', origin: 'Town A', destination: 'Town B', patternNames: ['Town A', 'Locality X', 'Locality Y', 'Town B'], recordActivity: 2 }),
    record({ id: 'activity-full-back', routeNumber: 'I21', origin: 'Town B', destination: 'Town A', direction: 'Town A', patternNames: ['Town B', 'Locality Y', 'Locality X', 'Town A'], recordActivity: 2 }),
    record({ id: 'activity-fragment', routeNumber: 'I21', origin: 'Locality Y', destination: 'Town B', direction: 'Town B', patternNames: ['Locality Y', 'Town B'], routePatternCompleteness: 'partial', recordActivity: 5000 })
  ]);
  assert.ok(rows.some(row => row.origin === 'Town A' && row.destination === 'Town B'));
  assert.ok(rows.every(row => ![row.origin, row.destination].includes('Locality Y')));
}

// 22. Current authoritative route metadata outranks an older retained pattern.
{
  const currentSource = { provider: 'TfL', routeMetadata: 'matched' };
  const currentOut = record({ id: 'current-metadata-out', routeNumber: 'I22', origin: 'Town A', destination: 'New Town', publicRouteOrigin: 'Town A', publicRouteDestination: 'New Town', direction: 'New Town', validFrom: '2026-09-05', source: 'TfL', routePatternCompleteness: 'partial' });
  currentOut.source = currentSource;
  const currentBack = record({ id: 'current-metadata-back', routeNumber: 'I22', origin: 'New Town', destination: 'Town A', publicRouteOrigin: 'New Town', publicRouteDestination: 'Town A', direction: 'Town A', validFrom: '2026-09-05', source: 'TfL', routePatternCompleteness: 'partial' });
  currentBack.source = currentSource;
  const rows = rowsFor([
    record({ id: 'old-pattern-out', routeNumber: 'I22', origin: 'Town A', destination: 'Old Town', patternNames: ['Town A', 'Shared', 'Old Town'], validFrom: '2024-01-01' }),
    record({ id: 'old-pattern-back', routeNumber: 'I22', origin: 'Old Town', destination: 'Town A', patternNames: ['Old Town', 'Shared', 'Town A'], validFrom: '2024-01-01' }),
    currentOut,
    currentBack
  ]);
  assert.ok(rows.some(row => row.destination === 'New Town'));
  assert.ok(rows.every(row => ![row.origin, row.destination].includes('Old Town')));
  assert.ok(rows.filter(row => row.destination === 'New Town').every(row => row.publicEndpointEvidence.destination.evidenceClass === 'authoritative-route-section'), JSON.stringify(rows.map(row => ({ o: row.origin, d: row.destination, evidence: row.publicEndpointEvidence }))));
}

console.log('PASS Alpha.16 national planner regression matrix: 22/22 cases.');
