import { docxBlob } from '../../assets/js/word-export.js';
import assert from 'node:assert/strict';
import { buildBusTransportStatement, buildBusWordTables, busWordFilename } from '../../src/atlas/presentation/bus-word-export.mjs';

const result = {
  ok: true,
  stops: [
    { id:'stop-1', mapReference:'A', displayMapReference:'1', name:'Balaam Street', displayDirection:'Stop S (Eastbound)', walking:{status:'routed',distanceMetres:58,durationSeconds:60}, cycling:{status:'routed',distanceMetres:80,durationSeconds:60}, routes:['262','473'] },
    { id:'stop-2', mapReference:'B', displayMapReference:'2', name:'Balaam Street', displayDirection:'Stop T (Westbound)', walking:{status:'routed',distanceMetres:39,durationSeconds:60}, cycling:{status:'routed',distanceMetres:39,durationSeconds:60}, routes:['241','262','325','473','678'] }
  ],
  reviewItems:[{code:'unresolved-timetable-request',route:'397',message:'Private raw source failure'}],
  plannerServiceSummaries:[{
    routeNumber:'66',operator:'Arriva Herts and Essex',directionPatternText:'Towards Loughton Station',servedAtText:'Bus Station — Stop C [1]*',
    principalLocations:['Waltham Cross Railway Station','Railway Station','St Margaret\'s Hospital','Waltham Abbey','Loughton'],principalLocationsText:'Waltham Cross, Waltham Abbey, Loughton',typicalFrequencyText:'Mon-Fri: Typically every ~30–40 mins',operatingPeriodLines:['Mon-Fri: Approx. 05:29–19:05'],publicRouteFamilyKey:'66',
    plannerNotes:{shortWorkings:'Some journeys operate to Hammond Street (Smiths Lane)',reviewNote:'Private internal warning'}
  }]
};
const mapOn = buildBusWordTables(result);
const mapOff = buildBusWordTables(result,{includeMap:false});
const narrative = buildBusTransportStatement(result);
assert.equal(narrative.split('\n\n').length,2);
assert.match(narrative,/assessment covers 2 bus stops/i);
assert.match(narrative,/Waltham Cross Railway Station/);
assert.doesNotMatch(narrative,/Waltham Cross Railway Station, Railway Station/);
assert.doesNotMatch(narrative,/checked evidence|planner-facing|ATLAS/i);
assert.deepEqual(mapOn[0].headers,['Map reference','Stop name','Direction','Walking distance / time','Cycling distance / time','Routes serving stop']);
assert.equal(mapOn[0].rows[0][0],'1');
assert.ok(mapOn[1].rows.some(row=>Array.isArray(row)&&row[0]==='66'&&row[3].includes('[1]')));
assert.deepEqual(mapOff[0].headers,['Stop name','Direction','Walking distance / time','Cycling distance / time','Routes serving stop']);
assert.equal(mapOff[0].rows[0].length,5);
assert.ok(mapOff[1].rows.some(row=>Array.isArray(row)&&row[0]==='66'&&!row[3].includes('[1]')));
assert.doesNotMatch(JSON.stringify([...mapOn,narrative]),/ATLAS|Private raw source failure|Private internal warning|Planner review required/i);
assert.ok(mapOn[1].rows.some(row=>!Array.isArray(row)&&row.semantic==='short-working'));
assert.equal(busWordFilename({displayAddress:'100 High Street, Plaistow'}),'Bus Assessment - 100 High Street, Plaistow.docx');
assert.equal(busWordFilename({latitude:51.7,longitude:-0.1}),'Bus Assessment.docx');
assert.equal(mapOn[0].widths.reduce((a,b)=>a+b,0),100);
const mapPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pysAAAAASUVORK5CYII=';
const blob=docxBlob('Bus Assessment',mapOn,narrative,{wordingPlacement:'before',mapPngDataUrl:mapPng});
const decoded=new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
assert.equal(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer()).slice(0,2)),'PK');
assert.ok(decoded.indexOf('Transport Statement wording')<decoded.indexOf('Bus Assessment Map')&&decoded.indexOf('Bus Assessment Map')<decoded.indexOf('Table 3.2 - Bus Stop Summary'));
assert.match(decoded,/word\/media\/assessment-map\.png/);
assert.match(decoded,/w:sz w:val="12"/,'table cells and notes use 6 pt Word text');
assert.doesNotMatch(decoded,/ATLAS|Private raw source failure|Planner review required/i);
assert.doesNotMatch(decoded,/\?\?\?/,'Broken stop label placeholders must never appear in Word output.');
const noMapBlob=docxBlob('Bus Assessment',mapOff,narrative,{wordingPlacement:'before'});
const noMapXml=new TextDecoder().decode(new Uint8Array(await noMapBlob.arrayBuffer()));
assert.doesNotMatch(noMapXml,/assessment-map\.png|rId2/);
assert.doesNotMatch(JSON.stringify(mapOff),/\[1\]/);
console.log('PASS external Word export is neutral, compact, and review-safe.');
console.log('PASS map-on DOCX embeds the PNG after wording; map-off DOCX omits the map column and map references.');
