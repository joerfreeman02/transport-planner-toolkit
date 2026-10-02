import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-group-1d-waltham-runtime.json', import.meta.url), 'utf8'));
const fullPattern = (service, length) => {
  const first = service.originStopPointId || service.orderedPatternEndpoints?.[0] || `${service.routeNumber}-ORIGIN`;
  const last = service.destinationStopPointId || service.orderedPatternEndpoints?.at(-1) || first;
  return [first, ...Array.from({ length: Math.max(1, length - 2) }, (_, index) => `gtfs:frozen:${service.routeNumber}:${index + 1}`), last];
};
const enrichedServices = fixture.serviceSummaries.map(service => {
  const route = String(service.routeNumber);
  const length = route === '13' ? 4 : route === '13A' ? 9 : route === '13B' ? 7 : route === '13C' ? 12
    : route === '15' ? 4 : route === '15A' ? 10 : route === '279' ? 11 : route === '16' ? 8 : route === '16C' ? 10 : 5;
  return { ...service, circularPatternStopIds: fullPattern(service, length) };
});

const baselineRows = buildPlannerBusServiceSummaries(fixture.serviceSummaries, fixture.stops);
const enrichedRows = buildPlannerBusServiceSummaries(enrichedServices, fixture.stops);
const semantic = rows => rows
  .filter(row => !['16', '16C'].includes(row.routeNumber))
  .map(row => ({
    routeNumber: row.routeNumber,
    publicRouteNumbers: row.publicRouteNumbers,
    routeFamilyLabel: row.routeFamilyLabel,
    destination: row.destination,
    additionalServices: row.plannerNotes.additionalServices,
    shortWorkings: row.plannerNotes.shortWorkings
  }));
assert.deepEqual(semantic(enrichedRows), semantic(baselineRows), 'dedicated CIRC patterns are invisible to frozen GROUP semantics');

const rowFor = route => enrichedRows.find(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route));
assert.equal(rowFor('13').routeNumber, '13');
assert.deepEqual(rowFor('13').publicRouteNumbers, ['13', '13A', '13B', '13C']);
assert.equal(rowFor('15').routeNumber, '15');
assert.deepEqual(rowFor('15').publicRouteNumbers, ['15', '15A']);
assert.equal(enrichedRows.filter(row => row.routeNumber === '279').length, 1);
assert.match(rowFor('279').plannerNotes.additionalServices, /Manor House/);
assert.equal(rowFor('279').routeNumber, '279');
assert.equal(rowFor('N279').routeNumber, 'N279');
for (const route of ['66', '217', '242', '251', '310', '317', '327', '491', 'N279']) assert.equal(enrichedRows.filter(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route)).length, 1, `${route} remains one public row`);
assert.match(rowFor('66').plannerNotes.shortWorkings, /Hammond Street/);
assert.match(rowFor('251').plannerNotes.shortWorkings, /Hammond Street/);
assert.match(rowFor('242').destination, /Potters Bar/);

for (const route of ['16', '16C']) {
  const row = rowFor(route);
  assert.equal(row.circularServiceDecision.classification, 'circular');
  assert.doesNotMatch(row.plannerNotes.circularService, /\b(?:gtfs:|\d{5,})/i);
  assert.equal(row.plannerNotes.additionalServices, null);
  assert.ok(row.plannerNotes.shortWorkings);
}
const wordText = buildBusWordTables({ ok: true, stops: fixture.stops, plannerServiceSummaries: enrichedRows, serviceSummaries: [] })
  .flatMap(table => table.rows ?? [])
  .map(row => Array.isArray(row) ? row.join(' ') : String(row?.text ?? ''))
  .join(' ');
assert.match(wordText, /Route 13/);
assert.doesNotMatch(wordText, /Route 13C is the main|Route 15A is the main/);
assert.doesNotMatch(wordText, /\b(?:gtfs:|210021703430|1500[A-Z0-9]+)/i);
assert.doesNotMatch(wordText, /Additional services:[^\.]*Maple Gate[^\.]*Short workings:[^\.]*Maple Gate/i);

console.log('PASS BUS-CIRC-1C enriched prepared-data shape preserves frozen GROUP and Word semantics');
