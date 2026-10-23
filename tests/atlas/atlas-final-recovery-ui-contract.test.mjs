import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { numberedServicesForPresentation, numberedStopsForPresentation } from '../../src/atlas/presentation/map-references.mjs';
import { buildBusWordTables } from '../../src/atlas/presentation/bus-word-export.mjs';
import { PLANNER_METHODOLOGY_NOTE } from '../../src/atlas/domain/bus-planner-summary.mjs';

const html = readFileSync(new URL('../../atlas/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../atlas/assets/js/app.mjs', import.meta.url), 'utf8');
for (const id of ['site-step-card', 'location-step-card', 'assessment-settings-step-card', 'assessment-step-card', 'results-step-card', 'export-step-card']) {
  assert.match(html, new RegExp(`id="${id}"`), `Guided workflow retains ${id}.`);
}
for (const id of ['findNearestStops', 'findStops', 'radius', 'taskStatus', 'sourceChecksDetails', 'newAssessment', 'exportBusWord']) {
  assert.match(html, new RegExp(`id="${id}"`), `Accepted Bus functionality retains ${id}.`);
}
assert.doesNotMatch(html, /data-view="(?:projects|report-builder|export|support)"/i, 'Navigation exposes only functioning ATLAS sections.');
assert.doesNotMatch(html, /All systems operational|services per day|key destinations|Use my location|navigator\.geolocation/i, 'The interface does not claim unsupported features or metrics.');
assert.match(html, /eas-forge-lockup-dark-with-tagline\.svg/, 'Footer uses the approved EAS | FORGE lock-up.');
assert.doesNotMatch(html.match(/<footer[\s\S]*?<\/footer>/i)?.[0] ?? '', /atlas.*logo|atlas.*lockup/i, 'Footer does not repeat the ATLAS logo.');
assert.match(app, /function assessmentWording\(result, services/, 'Transport Statement wording is derived from planner-facing service summaries.');
assert.match(app, /Table 3\.3 sets out the directions, selected-stop frequencies, operating periods and service qualifications/, 'Transport Statement wording remains conservative and grounded in the planner summary.');

const originalStops = [
  { id: 'B', mapReference: 'F', name: 'Second Stop', displayDirection: 'Stop B', latitude: 51.2, longitude: -0.1 },
  { id: 'A', mapReference: 'C', name: 'First Stop', displayDirection: 'Stop A', latitude: 51.1, longitude: -0.2 }
];
const numbered = numberedStopsForPresentation(originalStops);
assert.deepEqual(numbered.map(stop => [stop.id, stop.mapReference]), [['A', '1'], ['B', '2']], 'Map references are deterministic across equivalent input orders.');
assert.deepEqual(originalStops.map(stop => stop.mapReference), ['F', 'C'], 'Presentation numbering does not mutate source stop records.');
const sourceService = {
  routeNumber: '313', operator: 'Arriva London North', directionPatternText: 'Towards Chingford Station',
  servedAtText: 'First Stop [C]*; Second Stop [F]', principalLocationsText: 'Ponders End, Chingford',
  typicalFrequencyText: 'Mon-Sat: Typically every ~20 mins; Sun: Every ~30 mins',
  operatingPeriodLines: ['Mon-Sat: Approx. 05:00–00:59 (next day)'], stopIds: ['A', 'B']
};
const remapped = numberedServicesForPresentation([sourceService], originalStops, numbered)[0];
assert.equal(remapped.servedAtText, 'First Stop [1]*; Second Stop [2]');
for (const key of ['routeNumber', 'operator', 'directionPatternText', 'principalLocationsText', 'typicalFrequencyText', 'operatingPeriodLines', 'stopIds']) {
  assert.deepEqual(remapped[key], sourceService[key], `Map presentation leaves ${key} unchanged.`);
}
const word = buildBusWordTables({ ok: true, stops: numbered, plannerServiceSummaries: [remapped], serviceSummaries: [], reviewItems: [] });
const wordRow = word[1].rows.find(row => Array.isArray(row) && row[0] === '313');
assert.ok(wordRow, 'Word includes the same planner service row.');
assert.deepEqual(wordRow.slice(0, 7), ['313', 'Arriva London North', 'Towards Chingford Station', 'First Stop [1]*; Second Stop [2]', 'Ponders End, Chingford', 'Mon-Sat: Typically every ~20 mins; Sun: Every ~30 mins', 'Mon-Sat: Approx. 05:00–00:59 (next day)']);
assert.ok(word[1].rows.some(row => !Array.isArray(row) && row.text === PLANNER_METHODOLOGY_NOTE), 'Word retains accepted methodology wording.');

console.log('PASS final recovery UI preserves the six-stage workflow and accepted Bus controls.');
console.log('PASS numbered map references remain deterministic and do not alter stop/service facts.');
console.log('PASS Browser/Word presentation contract retains operator, direction, frequency, periods and methodology.');
