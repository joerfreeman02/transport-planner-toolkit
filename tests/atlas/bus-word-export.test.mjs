import { docxBlob } from '../../assets/js/word-export.js';
import assert from 'node:assert/strict';
import { buildBusWordTables, busWordFilename } from '../../src/atlas/presentation/bus-word-export.mjs';

const result = {
  ok: true,
  stops: [
    { name: 'Balaam Street', displayDirection: 'Stop S (Eastbound)', walking: { status: 'routed', distanceMetres: 58, durationSeconds: 60 }, cycling: { status: 'routed', distanceMetres: 80, durationSeconds: 60 }, routes: ['262', '473'] },
    { name: 'Balaam Street', displayDirection: 'Stop T (Westbound)', walking: { status: 'routed', distanceMetres: 39, durationSeconds: 60 }, cycling: { status: 'routed', distanceMetres: 39, durationSeconds: 60 }, routes: ['241', '262', '325', '473', '678'] }
  ],
  serviceSummaries: [{
    routeNumber: '241',
    operator: 'Stagecoach London',
    origin: 'Here East, Hackney Wick',
    destination: 'Royal Crest Avenue, Silvertown',
    principalLocations: ['Stratford City', 'Stratford', 'Plaistow', 'Custom House'],
    stopDirection: 'Southbound',
    typicalFrequencyText: 'Wednesday: Approx. 4 buses/hour (every 15 mins)',
    operatingPeriodLines: ['Mon-Fri: Approx. 05:11–01:29 (next day)', 'Saturday: Approx. 05:09–01:29 (next day)', 'Sunday: Approx. 06:19–01:29 (next day)'],
    serviceNote: ''
  }]
};

const tables = buildBusWordTables(result);
assert.equal(tables.length, 2);
assert.equal(tables[0].caption, 'Table 3.2 - Bus Stop Summary');
assert.deepEqual(tables[0].headers, ['Stop label', 'Stop name', 'Direction', 'Walking distance / time', 'Cycling distance / time', 'Routes serving stop']);
assert.equal(tables[0].rows[0][0], 'Stop');
assert.equal(tables[0].rows[0][1], 'Balaam Street');
assert.equal(tables[0].rows[0][2], 'Stop S (Eastbound)');
assert.equal(tables[0].rows[0][5], '262, 473');
assert.equal(tables[1].caption, 'Table 3.3 - Bus Service Summary');
assert.deepEqual(tables[1].headers, ['Route', 'Operator', 'Origin / destination', 'Principal locations', 'Typical frequency', 'Operating period']);
assert.match(tables[1].rows[0][2], /Here East, Hackney Wick – Royal Crest Avenue, Silvertown/);
assert.match(tables[1].rows[0][2], /\(Southbound\)$/);
assert.match(tables[1].rows[0][4], /Approx\. 4 buses\/hour/);
assert.match(tables[1].rows[0][5], /next day/);
assert.equal(busWordFilename({ displayAddress: '100 High Street, Plaistow' }), 'ATLAS Bus Assessment - 100 High Street, Plaistow.docx');
assert.equal(busWordFilename({ latitude: 51.7, longitude: -0.1 }), 'ATLAS Bus Assessment.docx');
const filtered = buildBusWordTables({ ...result, stops: [result.stops[1]], serviceSummaries: [] });
assert.equal(filtered[0].rows.length, 1);
assert.equal(filtered[0].rows[0][2], 'Stop T (Westbound)');
assert.equal(filtered[1].rows.length, 0);
const reviewItems = [
  { code: 'unresolved-timetable-request', route: '397', stop: '490TEST003', source: 'timetable source', message: 'Raw timetable request diagnostic.' },
  { code: 'unresolved-timetable-request', route: '215', stop: '490TEST004', source: 'timetable source', message: 'Another raw diagnostic.' },
  { code: 'unresolved-timetable-request', route: '397', stop: '490TEST005', source: 'timetable source', message: 'Duplicate route diagnostic.' }
];
const plannerInput = {
  ok: true,
  stops: [],
  reviewItems,
  plannerServiceSummaries: [{
    routeNumber: '310', operator: 'Arriva', directionPatternText: 'Towards Waltham Cross', servedAtText: 'Hertford Bus Station',
    principalLocationsText: 'Hoddesdon', typicalFrequencyText: 'Mon-Fri: 2 journeys/day', operatingPeriodLines: ['Mon-Fri: Approx. 08:00–18:00']
  }]
};
const plannerWord = buildBusWordTables(plannerInput);
const plannerWordNotes = plannerWord[1].rows.filter(row => !Array.isArray(row)).map(row => row.text).join(' ');
assert.match(plannerWordNotes, /Additional source evidence remains available in the ATLAS assessment workspace/);
assert.match(plannerWordNotes, /Planner review required: timetable\/source evidence requires review for routes 215, 397 at one or more assessed stops\./);
assert.equal((plannerWord[1].rows.filter(row => !Array.isArray(row) && /^Planner review required:/.test(row.text))).length, 1, 'Word emits one concise material qualification');
assert.doesNotMatch(plannerWordNotes, /490TEST003|490TEST004|490TEST005|Raw timetable request diagnostic|Another raw diagnostic|Duplicate route diagnostic/);
assert.doesNotMatch(plannerWordNotes, /Show detailed evidence/);
assert.deepEqual(plannerInput.reviewItems, reviewItems, 'Word export retains internal reviewItems unchanged');
assert.equal(buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: [], serviceSummaries: [], reviewItems: [] })[1].rows.some(row => !Array.isArray(row) && /^Planner review required:/.test(row.text)), false, 'Complete assessment without review items gets no qualification');

const qualificationCases = [
  ['unresolved timetable only', [{ code: 'unresolved-timetable-request', route: '215', message: 'diagnostic' }], /timetable\/source evidence requires review for routes 215/, [/access-routing evidence/, /stop-source coverage evidence/]],
  ['national route evidence', [{ code: 'national-route-evidence', route: '385', message: 'diagnostic' }], /timetable\/source evidence requires review for routes 385/, [/access-routing evidence/]],
  ['planner route identity only', [{ code: 'planner-route-identity', route: '397', message: 'diagnostic' }], /planner route\/destination identity evidence also requires planner review for routes 397/, [/timetable\/source evidence/]],
  ['access routing only', [{ code: 'access-routing', stop: 'STOP', message: 'diagnostic' }], /access-routing evidence also requires planner review/, [/490TEST|diagnostic/]],
  ['stop source coverage only', [{ code: 'stop-source-coverage', stop: 'STOP', message: 'diagnostic' }], /stop-source coverage evidence also requires planner review/, [/490TEST|diagnostic/]],
  ['timetable plus access routing', [{ code: 'unresolved-timetable-request', route: '215', message: 'diagnostic' }, { code: 'access-routing', stop: 'STOP', message: 'diagnostic' }], /timetable\/source evidence requires review for routes 215.*Additional access-routing evidence also requires planner review/s, []],
  ['timetable plus stop source coverage', [{ code: 'unresolved-timetable-request', route: '215', message: 'diagnostic' }, { code: 'stop-source-coverage', stop: 'STOP', message: 'diagnostic' }], /timetable\/source evidence requires review for routes 215.*Additional stop-source coverage evidence also requires planner review/s, []],
  ['duplicate routes', [{ code: 'unresolved-timetable-request', route: '397', message: 'one' }, { code: 'national-route-evidence', route: '215', message: 'two' }, { code: 'unresolved-timetable-request', route: '397', message: 'three' }], /routes 215, 397/, []],
  ['no review items', [], null, [/Planner review required:/]]
];
for (const [label, items, expected, forbidden] of qualificationCases) {
  const rows = buildBusWordTables({ ok: true, stops: [], plannerServiceSummaries: [], serviceSummaries: [], reviewItems: items })[1].rows;
  const qualifications = rows.filter(row => !Array.isArray(row) && /^Planner review required:/.test(row.text));
  assert.ok(qualifications.length <= 1, `${label}: at most one client-facing qualification block`);
  const note = qualifications.map(row => row.text).join(' ');
  if (expected) assert.match(note, expected, `${label}: expected structured qualification`);
  for (const pattern of forbidden) assert.doesNotMatch(note, pattern, `${label}: no material category or raw diagnostic is hidden/leaked`);
  if (!items.length) assert.equal(qualifications.length, 0, `${label}: no qualification for no review items`);
}
console.log('PASS Word export respects planner-selected stop and service rows.');
console.log('PASS Alpha.5 Plaistow Word export contract.');

const blob = docxBlob('ATLAS Bus Assessment', tables, 'The site is served by bus routes 241, 262 and 473.');
const bytes = new Uint8Array(await blob.arrayBuffer());
assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
const decoded = new TextDecoder().decode(bytes);
assert.match(decoded, /Table 3\.2 - Bus Stop Summary/);
assert.match(decoded, /Balaam Street/);
assert.match(decoded, /Table 3\.3 - Bus Service Summary/);
console.log('PASS Alpha.5 shared DOCX package contains the Plaistow-style Bus tables.');
