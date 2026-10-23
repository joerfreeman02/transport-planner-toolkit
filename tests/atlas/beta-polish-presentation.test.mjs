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

const qualificationWord = buildBusWordTables({
  ok: true,
  stops: [],
  plannerServiceSummaries: [{
    routeNumber: '29', operator: 'Example Operator', directionPatternText: 'Towards Example', servedAtText: 'Civic Centre [2]*',
    principalLocationsText: 'Example Town', typicalFrequencyText: 'Mon–Fri: Every 20 minutes', typicalFrequencyLines: ['Mon–Fri: Every 20 minutes'],
    operatingPeriodLines: ['Mon–Fri: Approx. 06:00–22:00'], stopIds: ['490010001A'], publicRouteFamilyKey: '29',
    plannerNotes: { serviceQualification: 'School-day journeys only' }
  }],
  serviceSummaries: [],
  reviewItems: [{ code: 'unresolved-timetable-request', route: '29', message: 'Review timetable evidence.' }]
})[1].rows;
assert.equal(qualificationWord.find(row => row.semantic === 'qualification')?.kind, 'section', 'service qualifications use the restrained highlighted Word row style');
assert.equal(qualificationWord.find(row => row.semantic === 'review')?.kind, 'section', 'material review notes use the restrained highlighted Word row style');

const html = fs.readFileSync(new URL('../../atlas/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../atlas/assets/js/app.mjs', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../atlas/assets/css/atlas-shell.css', import.meta.url), 'utf8');
assert.match(html, /eas-atlas-header-lockup-transparent\.svg/);
assert.match(html, /eas-forge-lockup-light-with-tagline-on-white\.svg/);
assert.match(html, /Bus Assessment — Beta/);
assert.deepEqual([...html.matchAll(/data-view="([^"]+)"/g)].map(([, view]) => view), ['modules', 'about'], 'only real Modules and About navigation is exposed');
assert.equal((html.match(/class="module-icon"/g) ?? []).length, 5, 'module cards use five consistent inline SVG icons');
assert.match(html, /id="persistentMapHost"[\s\S]*id="siteMap"/);
assert.match(html, /id="findNearestStops"[\s\S]*Find nearest bus stop/);
assert.match(html, /id="findStops"[\s\S]*Build full Bus assessment/);
assert.match(html, /id="confirmMapLocation"[\s\S]*id="confirmAssessmentPoint"/);
assert.match(html, /six clear steps/);
assert.match(html, /id="assessment-settings-step-card"[\s\S]*id="radius"/);
assert.match(html, /id="results-step-card"/);
assert.match(html, /id="export-step-card"[\s\S]*id="exportBusWord"/);
assert.match(html, /task-loader-mark[^>]+atlas-mark-primary\.svg/);
assert.match(html, /id="resultReviewNotice"/);
assert.match(html, /<footer>[\s\S]*eas-forge-lockup-light-with-tagline-on-white\.svg[\s\S]*Created by Joe Freeman[\s\S]*ATLAS-2\.0\.0-alpha\.15-20260914/);
assert.doesNotMatch(html.match(/<footer>[\s\S]*?<\/footer>/)?.[0] ?? '', /eas-atlas-header-lockup/);
assert.ok(html.indexOf('serviceSummaryMethodology') < html.indexOf('<tbody id="serviceRows">'), 'browser frequency-basis explanation appears before service rows');
assert.match(app, /assessment data checked \$\{checked\}/i);
assert.match(app, /reviewBadge\.hidden = reviewItems\.length === 0/);
assert.match(app, /function startNewAssessment\(\)/);
assert.match(app, /current site and results will be cleared/);
assert.match(app, /identified \$\{presented\.length\} evidenced service pattern/);
assert.match(app, /function updateGuidedWorkflow\(\)/);
assert.match(app, /The one Leaflet map remains in the workspace/);
assert.match(css, /\.persistent-map-panel/);
assert.match(css, /height: clamp\(450px,62vh,720px\)/);
assert.match(css, /@keyframes atlas-spin/);
assert.match(css, /review-badge/);
console.log('PASS Bus Beta polish presentation contracts: provenance-safe numbered map references, current assessment wording, review disclosure, reset confirmation and Word parity.');
