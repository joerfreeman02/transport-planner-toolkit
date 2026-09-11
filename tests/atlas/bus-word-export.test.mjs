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
assert.deepEqual(tables[0].headers, ['Stop name', 'Direction', 'Walking distance / time', 'Cycling distance / time', 'Routes serving stop']);
assert.equal(tables[0].rows[0][0], 'Balaam Street');
assert.equal(tables[0].rows[0][1], 'Stop S (Eastbound)');
assert.equal(tables[0].rows[0][4], '262, 473');
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
assert.equal(filtered[0].rows[0][1], 'Stop T (Westbound)');
assert.equal(filtered[1].rows.length, 0);
const plannerWord = buildBusWordTables({
  ok: true,
  stops: [],
  plannerServiceSummaries: [{
    routeNumber: '310', operator: 'Arriva', directionPatternText: 'Towards Waltham Cross', servedAtText: 'Hertford Bus Station',
    principalLocationsText: 'Hoddesdon', typicalFrequencyText: 'Mon-Fri: 2 journeys/day', operatingPeriodLines: ['Mon-Fri: Approx. 08:00–18:00']
  }]
});
const plannerWordNotes = plannerWord[1].rows.filter(row => !Array.isArray(row)).map(row => row.text).join(' ');
assert.match(plannerWordNotes, /Detailed source evidence is retained within the ATLAS assessment workspace/);
assert.doesNotMatch(plannerWordNotes, /Show detailed evidence/);
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
