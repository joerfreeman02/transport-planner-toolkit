import assert from 'node:assert/strict';
import {buildEasTable,wordDocument,plainTables,docxBlob,EAS_WORD_THEME} from '../assets/js/word-export.js';

const tables=[{caption:'Table X.X - Local Facilities',headers:['Facility','Distance'],rows:[['Pharmacy','500 m'],['Station','1.2 km']],widths:[70,30]}];
const html=wordDocument('Test export',tables);
const fragment=buildEasTable(tables[0]);

assert.match(html,/@page\{size:A4 portrait/);
assert.match(html,/Roboto/);
assert.match(html,/#D95300/);
assert.match(html,/#EFEFEF/);
assert.match(html,/application\/msword|Word\.Document/);
assert.match(fragment,/class="band"/);
assert.match(fragment,/width:70%/);
assert.match(plainTables(tables),/Facility\tDistance/);
assert.equal(EAS_WORD_THEME.caption,'#B3B3B3');
assert.doesNotMatch(html,/<script/i);
const bytes=new Uint8Array(await docxBlob('Test export',tables).arrayBuffer());
assert.deepEqual([...bytes.slice(0,4)],[0x50,0x4b,0x03,0x04]);

console.log('10 Word export formatting assertions passed.');
