import assert from 'node:assert/strict';
import {buildEasTable,wordDocument,plainTables,docxBlob,EAS_WORD_THEME} from '../assets/js/word-export.js';

const tables=[{caption:'Table X.X - Local Facilities',headers:['Facility','Distance'],rows:[{kind:'section',text:'Everyday needs'},['Pharmacy','500 m'],{kind:'summary',text:'Service pattern: half-hourly'},['Station','1.2 km']],widths:[70,30]}];
const html=wordDocument('Test export',tables);
const fragment=buildEasTable(tables[0]);

assert.match(html,/@page\{size:A4 portrait/);
assert.match(html,/Roboto/);
assert.match(html,/#D95300/);
assert.match(html,/#EFEFEF/);
assert.match(html,/application\/msword|Word\.Document/);
assert.match(fragment,/class="band"/);
assert.match(fragment,/class="section"/);
assert.match(fragment,/colspan="2"/);
assert.match(fragment,/Service pattern: half-hourly/);
assert.match(fragment,/width:70%/);
assert.match(plainTables(tables),/Facility\tDistance/);
assert.equal(EAS_WORD_THEME.caption,'#B3B3B3');
assert.doesNotMatch(html,/<script/i);
const bytes=new Uint8Array(await docxBlob('Test export',tables,'Access wording\n\nFirst access paragraph.\n\nService wording\n\nFirst service paragraph.').arrayBuffer());
assert.deepEqual([...bytes.slice(0,4)],[0x50,0x4b,0x03,0x04]);
const packageText=new TextDecoder().decode(bytes);
assert.match(packageText,/First access paragraph/);
assert.match(packageText,/First service paragraph/);
assert.ok((packageText.match(/<w:p>/g)||[]).length>=4,'wording uses separate Word paragraphs');

console.log('16 Word export formatting assertions passed.');
