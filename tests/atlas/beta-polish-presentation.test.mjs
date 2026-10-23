import assert from 'node:assert/strict';
import fs from 'node:fs';
import { numberedServicesForPresentation, numberedStopsForPresentation } from '../../src/atlas/presentation/map-references.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';

const stops = [
  { id: 'other-2', name: 'Nearby stop without route source', mapReference: 'D', transportMode: 'bus_coach', routes: [], timetableMatch: false },
  { id: '490010001A', name: 'Civic Centre', mapReference: 'B', routes: ['29'], walking: { status: 'routed', distanceMetres: 100 } },
  { id: '490010001B', name: 'Civic Centre', indicator: 'B', mapReference: 'C', routes: ['29'], walking: { status: 'routed', distanceMetres: 120 } },
  { id: '490010000Z', name: 'Station Road', mapReference: 'A', routes: ['29'], walking: { status: 'routed', distanceMetres: 90 } }
];
const numbered = numberedStopsForPresentation(stops);
assert.deepEqual(numbered.map(stop => [stop.id, stop.mapReference]), [
  ['490010000Z', '1'], ['490010001A', '2'], ['490010001B', '3'], ['other-2', '4']
]);
assert.deepEqual(numberedStopsForPresentation([...stops].reverse()).map(stop => [stop.id, stop.mapReference]), numbered.map(stop => [stop.id, stop.mapReference]), 'map references do not depend on response order');
assert.equal(stops[0].mapReference, 'D', 'presentation numbering does not mutate source/candidate data');
const mappedService = numberedServicesForPresentation([{ servedAtText: 'Civic Centre [B]*' }], stops, numbered);
assert.equal(mappedService[0].servedAtText, 'Civic Centre [2]*', 'service table references use the same stable numbers as stop rows and map markers');

const word = buildBusWordTables({
  ok: true,
  stops: numbered.filter(stop => stop.id !== 'other-2'),
  plannerServiceSummaries: [{
    routeNumber: '29', operator: 'Example Operator', directionPatternText: 'Towards Example', servedAtText: 'Civic Centre [2]*',
    principalLocationsText: 'Example Town', typicalFrequencyText: 'Mon–Fri: Every 20 minutes', typicalFrequencyLines: ['Mon–Fri: Every 20 minutes'],
    operatingPeriodLines: ['Mon–Fri: Approx. 06:00–22:00'], stopIds: ['490010001A'], publicRouteFamilyKey: '29'
  }],
  serviceSummaries: [], reviewItems: []
});
assert.deepEqual(word[0].rows.map(row => row[0]), ['1', '2', '3'], 'Word stop references use the same numbered presentation values');
assert.match(word[1].rows[0].text, /^\* marks the assessed stop/);
assert.ok(word[1].rows.findIndex(row => Array.isArray(row)) > 0, 'frequency-basis explanation precedes the first service row');

const html = fs.readFileSync(new URL('../../atlas/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../atlas/assets/js/app.mjs', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../atlas/assets/css/atlas-shell.css', import.meta.url), 'utf8');
assert.match(html, /atlas-logo-primary-on-white\.png/);
assert.match(html, /eas-forge-lockup-light-with-tagline-on-white\.svg/);
assert.match(html, /Bus Assessment — Beta/);
assert.ok(html.indexOf('serviceSummaryMethodology') < html.indexOf('<tbody id="serviceRows">'), 'browser frequency-basis explanation appears before service rows');
assert.match(app, /assessment data checked \$\{checked\}/i);
assert.match(app, /reviewBadge\.hidden = reviewItems\.length === 0/);
assert.match(app, /function startNewAssessment\(\)/);
assert.match(app, /current site and results will be cleared/);
assert.match(app, /Table 3\.3, based on the timetable evidence available/);
assert.match(css, /aspect-ratio: 1 \/ 1/);
assert.match(css, /review-badge/);
console.log('PASS Bus Beta polish presentation contracts: provenance-safe numbered map references, current assessment wording, review disclosure, reset confirmation and Word parity.');
