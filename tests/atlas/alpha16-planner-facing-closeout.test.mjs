import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries, PLANNER_METHODOLOGY_NOTE, PLANNER_SERVED_AT_CORE_NOTE, PLANNER_WORD_METHODOLOGY_NOTE } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { docxBlob, wordFragment } from '../../src/atlas/presentation/word-export.mjs';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const stops = [
  { id: 'A', name: 'Selected Stop A', locality: 'Selected Town', distanceMetres: 100, walking: { status: 'routed', distanceMetres: 90 } },
  { id: 'B', name: 'Selected Stop B', locality: 'Selected Town', distanceMetres: 150, walking: { status: 'routed', distanceMetres: 130 } }
];

function record({
  routeNumber,
  id,
  origin,
  destination,
  direction = 'gtfs:0',
  directionFamily = direction,
  pattern = ['ORIGIN', 'A', 'B', 'DESTINATION'],
  departures = [420, 480],
  serviceNote = '',
  source = 'BODS',
  operator = 'Example Buses',
  circular = false,
  principalLocations = [origin, destination]
}) {
  const departureEvidenceByDay = Object.fromEntries(days.map(day => [day, departures.map((minute, index) => ({
    minute,
    journeyIdentity: `${id}-${day}-${index}`,
    provider: source
  }))]));
  return {
    id,
    routeNumber,
    operator,
    origin,
    destination,
    direction,
    directionFamily,
    circular,
    routePatternStopIds: pattern,
    routePatternStops: pattern.map((stopId, index) => ({ id: stopId, name: stopId === 'ORIGIN' ? origin : stopId === 'DESTINATION' ? destination : `Pattern stop ${index}` })),
    routePatternCompleteness: 'complete',
    principalLocations,
    frequencyBasisStopId: 'A',
    stopIds: ['A', 'B'],
    departuresByDay: Object.fromEntries(days.map(day => [day, departures])),
    departureEvidenceByDay,
    frequencyEvidence: [],
    sourceRecordIds: [id],
    timetableSource: source,
    calendarProfileId: 'ordinary',
    serviceNote
  };
}

const familyRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: '13', id: '13-main-out', origin: 'Waltham Cross', destination: 'North Weald', direction: 'gtfs:0' }),
  record({ routeNumber: '13', id: '13-main-in', origin: 'North Weald', destination: 'Waltham Cross', direction: 'gtfs:1', directionFamily: 'gtfs:1', pattern: ['DESTINATION', 'B', 'A', 'ORIGIN'] }),
  record({ routeNumber: '13A', id: '13a-short', origin: 'Waltham Cross', destination: 'Epping', serviceNote: 'Short working towards Epping.' })
], stops);
assert.equal(familyRows.length, 2, 'main and short-working directions remain concise rows');
const familyNote = familyRows.map(row => row.routeGroupNote).find(Boolean) ?? '';
assert.match(familyNote, /principal Route 13 service operates between (Waltham Cross and North Weald|North Weald and Waltham Cross)/i);
assert.match(familyNote, /Route 13A/);
assert.ok(familyRows.some(row => row.rawRouteNumbers.includes('13A')), 'raw route suffix remains retained on the planner row');

const shortWorkingRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: '25C', id: '25c-full', origin: 'Waltham Cross', destination: 'Harlow', pattern: ['ORIGIN', 'A', 'B', 'DESTINATION'] }),
  record({ routeNumber: '25C', id: '25c-short', origin: 'Waltham Cross', destination: 'Short Terminus', pattern: ['ORIGIN', 'A'], serviceNote: 'Short working towards Short Terminus.' })
], stops);
const shortWorkingNote = shortWorkingRows.map(row => row.routeGroupNote).find(Boolean) ?? '';
assert.match(shortWorkingNote, /shorter workings to Short Terminus/i);
assert.ok(shortWorkingRows.some(row => row.destination === 'Harlow'), 'principal destination remains the headline');

const unsafeRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: 'XA', id: 'xa-out', origin: 'Origin Town', destination: 'Destination Town', direction: 'gtfs:0' }),
  record({ routeNumber: 'XB', id: 'xb-in', origin: 'Destination Town', destination: 'Origin Town', direction: 'gtfs:1', directionFamily: 'gtfs:1', pattern: ['DESTINATION', 'B', 'A', 'ORIGIN'] })
], stops);
const unsafeNote = unsafeRows.map(row => row.routeGroupNote).find(Boolean) ?? '';
assert.doesNotMatch(unsafeNote, /principal Route/i, 'no principal is asserted when no base route can be established');
assert.match(unsafeNote, /service family includes Routes/i);

const multiLoopRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: 'L16', id: 'loop-a', origin: 'Loop Hub', destination: 'Loop Hub', pattern: ['ORIGIN', 'A', 'B', 'ORIGIN'], circular: true }),
  record({ routeNumber: 'L16', id: 'loop-b', origin: 'Loop Hub', destination: 'Loop Hub', pattern: ['ORIGIN', 'A', 'B', 'C', 'ORIGIN'], circular: true }),
  record({ routeNumber: 'L16', id: 'linear-short', origin: 'Loop Hub', destination: 'Short Terminus', pattern: ['ORIGIN', 'A', 'B'], circular: false })
], stops);
assert.ok(multiLoopRows.every(row => !row.circular && !row.directionPatternText.startsWith('Circular —')), 'multiple closed variants with open evidence remain linear in the planner');

const orderedEndpointStops = (service, localities, closedEndpointIds = false) => ({
  ...service,
  routePatternStopIds: localities.map((_, index) => closedEndpointIds && index === localities.length - 1 ? `${service.id}-pattern-0` : `${service.id}-pattern-${index}`),
  routePatternStops: localities.map((locality, index) => ({ id: `${service.id}-pattern-${index}`, name: 'Bus Station', locality }))
});
const actual310StructureRows = buildPlannerBusServiceSummaries([
  orderedEndpointStops(record({ routeNumber: '310', id: '310-loop-fragment', origin: 'Bus Station', destination: 'Bus Station', direction: 'Waltham Cross Bus Station', directionFamily: 'gtfs:0', circular: true, principalLocations: ['Waltham Cross', 'Theobalds Grove', 'Waltham Cross'] }), ['Waltham Cross', 'Theobalds Grove', 'Waltham Cross'], true),
  orderedEndpointStops(record({ routeNumber: '310', id: '310-full-outbound', origin: 'Bus Station', destination: 'Bus Station', direction: 'Hertford Bus Station', directionFamily: 'gtfs:0', principalLocations: ['Waltham Cross', 'Ware', 'Hertford'] }), ['Waltham Cross', 'Ware', 'Hertford']),
  orderedEndpointStops(record({ routeNumber: '310', id: '310-full-inbound', origin: 'Bus Station', destination: 'Bus Station', direction: 'Waltham Cross Bus Station', directionFamily: 'gtfs:1', principalLocations: ['Hertford', 'Ware', 'Waltham Cross'] }), ['Hertford', 'Ware', 'Waltham Cross']),
  orderedEndpointStops(record({ routeNumber: '310', id: '310-ware-short', origin: 'Bus Station', destination: 'Ware', direction: 'Ware', directionFamily: 'gtfs:0', principalLocations: ['Waltham Cross', 'Ware'] }), ['Waltham Cross', 'Ware'])
], stops);
assert.equal(actual310StructureRows.some(row => row.circular || row.directionPatternText.startsWith('Circular —')), false, `ordered linear family evidence overrides a generic closed local fragment: ${JSON.stringify(actual310StructureRows.map(row => ({ origin: row.origin, destination: row.destination, direction: row.directionPatternText, circular: row.circular, group: row.groupIdentity })))}`);
assert.deepEqual(new Set(actual310StructureRows.map(row => row.directionPatternText)), new Set(['Towards Hertford', 'Towards Waltham Cross']));
assert.match(actual310StructureRows.map(row => row.routeGroupNote ?? '').join(' '), /Ware/, 'shorter Ware evidence remains subordinate to the principal corridor');

const widerFamilyRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: '16', id: '16-loop', origin: 'Bus Station', destination: 'Bus Station', direction: 'Waltham Cross Bus Station', directionFamily: 'gtfs:0', circular: true, pattern: ['ORIGIN', 'A', 'ORIGIN'], principalLocations: ['Waltham Cross', 'Waltham Abbey', 'Waltham Cross'] }),
  record({ routeNumber: '16C', id: '16c-loop', origin: 'Bus Station', destination: 'Bus Station', direction: 'Waltham Cross Bus Station', directionFamily: 'gtfs:0', circular: true, pattern: ['ORIGIN', 'A', 'B', 'C', 'ORIGIN'], principalLocations: ['Waltham Cross', 'Waltham Abbey', 'Loughton', 'Debden', 'Waltham Cross'] }),
  record({ routeNumber: '16C', id: '16c-short', origin: 'Waltham Cross', destination: 'Maple Gate', direction: 'Maple Gate', directionFamily: 'gtfs:0', pattern: ['ORIGIN', 'A', 'B'], principalLocations: ['Waltham Cross', 'Waltham Abbey'] }),
  record({ routeNumber: '16', id: '16-short', origin: 'Waltham Cross', destination: 'Waltham Abbey', direction: 'Waltham Abbey', directionFamily: 'gtfs:0', pattern: ['ORIGIN', 'A'], principalLocations: ['Waltham Cross', 'Waltham Abbey'] })
], [{ ...stops[0], locality: '' }]);
assert.ok(widerFamilyRows.some(row => row.rawRouteNumbers.includes('16C')
  && !['Waltham Abbey', 'Maple Gate'].includes(row.origin)
  && !['Waltham Abbey', 'Maple Gate'].includes(row.destination)), 'a short working cannot be promoted over the wider unresolved family');
assert.ok(widerFamilyRows.some(row => row.principalLocations.includes('Loughton')), 'the intermediate remains available as supporting planner evidence');
const widerFamilyNote = widerFamilyRows.map(row => `${row.serviceNote ?? ''} ${row.routeGroupNote ?? ''}`).join(' ');
assert.match(widerFamilyNote, /Waltham Abbey/);
assert.match(widerFamilyNote, /Maple Gate/);

const limitedVariantRows = buildPlannerBusServiceSummaries([
  record({ routeNumber: '242', id: '242-principal', origin: 'Waltham Cross', destination: 'Potters Bar', direction: 'Potters Bar', directionFamily: 'gtfs:1' }),
  record({ routeNumber: '242', id: '242-limited', origin: 'Bus Station', destination: 'Brookfield Centre', direction: 'Brookfield Centre', directionFamily: 'gtfs:1' })
], stops);
assert.equal(limitedVariantRows.some(row => /Brookfield Centre/.test(row.directionPatternText)), false, 'one-sided limited workings do not become the headline destination');
assert.match(limitedVariantRows.map(row => row.routeGroupNote ?? '').join(' '), /Brookfield Centre/, 'one-sided limited workings remain visible in the family Service Note');

const plannerText = familyRows.concat(unsafeRows).map(row => [
  row.directionPatternText,
  row.principalLocationsText,
  row.serviceNote,
  row.routeGroupNote
].filter(Boolean).join(' ')).join(' ');
assert.doesNotMatch(plannerText, /selected variant|resolved family|PublicServiceFamily|source component|semantic group|prepared feed|provider reconciliation/i);

assert.match(PLANNER_METHODOLOGY_NOTE, /Served at.*selected search radius/i);
assert.match(PLANNER_METHODOLOGY_NOTE, /does not represent the full route stop list/i);
assert.match(PLANNER_METHODOLOGY_NOTE, /timetable basis/i);
assert.ok(PLANNER_METHODOLOGY_NOTE.startsWith(PLANNER_SERVED_AT_CORE_NOTE));
const wordServiceTable = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: familyRows, serviceSummaries: [], reviewItems: [{ route: '13', source: 'test', message: 'internal review detail' }] })[1];
assert.deepEqual(wordServiceTable.widths, [8, 11, 12, 15, 20, 17, 17]);
assert.deepEqual(wordServiceTable.beforeTableNotes, [PLANNER_WORD_METHODOLOGY_NOTE]);
assert.equal(wordServiceTable.rows.some(row => row?.kind === 'summary' && /internal review detail|Evidence items to review/.test(row.text)), false, 'Word export keeps review diagnostics out of Table 3.3');
assert.equal(wordServiceTable.rows.some(row => row?.kind === 'summary' && /Served at/.test(row.text)), false, 'Word note is outside Table 3.3 rows');
const wordHtml = wordFragment([wordServiceTable]);
assert.ok(wordHtml.indexOf('Table 3.3 - Bus Service Summary') < wordHtml.indexOf('Table note — Served at:'));
assert.ok(wordHtml.indexOf('Table note — Served at:') < wordHtml.indexOf('<table class="eas-table">'));
assert.doesNotMatch(wordHtml, /Show detailed evidence/);
const docxText = new TextDecoder().decode(new Uint8Array(await (await docxBlob('ATLAS Bus Assessment', [wordServiceTable])).arrayBuffer()));
assert.ok(docxText.indexOf('Table 3.3 - Bus Service Summary') < docxText.indexOf('Table note — Served at:'));
assert.ok(docxText.indexOf('Table note — Served at:') < docxText.indexOf('<w:tbl>'));
assert.doesNotMatch(docxText, /internal review detail|Evidence items to review|Show detailed evidence/);
const indexHtml = fs.readFileSync(new URL('../../atlas/index.html', import.meta.url), 'utf8');
const appModule = fs.readFileSync(new URL('../../atlas/assets/js/app.mjs', import.meta.url), 'utf8');
assert.ok(indexHtml.includes(PLANNER_METHODOLOGY_NOTE), 'Browser markup contains the shared Served-at explanation');
assert.ok(indexHtml.indexOf('id="serviceSummaryMethodology"') < indexHtml.indexOf('<table class="bus-service-summary">'), 'Browser note precedes Table 3.3');
assert.match(appModule, /serviceSummaryMethodology.*PLANNER_METHODOLOGY_NOTE/s, 'Browser rendering uses the shared Served-at explanation');

console.log('PASS Alpha.16 planner-facing closeout: hierarchy, neutral wording, family retention and Served-at parity.');
