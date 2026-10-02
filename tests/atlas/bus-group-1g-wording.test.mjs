import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlannerBusServiceSummaries } from '../../src/atlas/domain/bus-planner-summary.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/bus-group-1e-waltham-mixed-runtime.json', import.meta.url), 'utf8'));
const rows = buildPlannerBusServiceSummaries(fixture.serviceSummaries, fixture.stops);
const rowFor = route => rows.find(row => (row.publicRouteNumbers ?? row.routeNumbers ?? [row.routeNumber]).includes(route));

const row13 = rowFor('13');
const additional13 = "Route 13A also serves St Margaret's Hospital and Waltham Abbey (Princesfield Rd); route 13B also serves Railway Station and Waltham Abbey (Princesfield Rd); route 13C operates to Two Brewers";
assert.equal(row13.plannerNotes.additionalServices, additional13);
assert.ok(row13.routeGroupNote.includes(`Additional services: ${additional13}.`));
assert.match(row13.plannerNotes.additionalServices, /13A/);
assert.match(row13.plannerNotes.additionalServices, /13B/);
assert.match(row13.plannerNotes.additionalServices, /13C/);
assert.match(row13.plannerNotes.additionalServices, /St Margaret's Hospital and Waltham Abbey/);
assert.doesNotMatch(row13.plannerNotes.additionalServices, /13A –|13B –|13C –/);

assert.equal(rowFor('15A').plannerNotes.additionalServices, 'Route 15A also serves Katherines');
assert.equal(rowFor('242').plannerNotes.additionalServices, 'Route 242 provides connections to Brookfield Centre and Welham Green Railway Station');
assert.equal(rowFor('279').plannerNotes.additionalServices, 'Some route 279 journeys also serve Manor House Station');
assert.equal(rowFor('A1').plannerNotes.additionalServices, 'Some route A1 journeys also serve Highbridge Rdbt');
assert.equal(rowFor('66').plannerNotes.shortWorkings, 'Some route 66 journeys operate to Hammond Street (Smiths Lane)');

const word = buildBusWordTables({ ok: true, stops: fixture.stops, plannerServiceSummaries: rows, serviceSummaries: [] });
const wordServiceRows = word.find(table => table.caption.startsWith('Table 3.3')).rows;
const wordText = wordServiceRows.map(row => Array.isArray(row) ? row.join(' ') : row.text).join(' ');
for (const row of [row13, rowFor('15A'), rowFor('242'), rowFor('279'), rowFor('A1')]) {
  assert.ok(wordText.includes(`Additional services: ${row.plannerNotes.additionalServices}.`));
}
assert.ok(wordText.includes('Short workings: Some route 66 journeys operate to Hammond Street (Smiths Lane).'));
assert.ok(wordText.includes('Route terminus: Waltham Cross Bus Station.'));
assert.equal(rowFor('279').terminusDecision.presentation, 'departing-only');
assert.deepEqual(rowFor('13').calendarProfileIds, []);

console.log('PASS BUS-GROUP-1G human Additional services wording, natural joining, same-route branch language, and Browser/Word parity controls.');
