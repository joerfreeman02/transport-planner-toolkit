import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../atlas/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../atlas/assets/js/app.mjs', import.meta.url), 'utf8');
assert.match(html, /2\.0\.0-alpha\.6/);
assert.match(html, /ATLAS-2\.0\.0-alpha\.6-20260904/);
for (const id of ['dataStatusMessage', 'preparedDataDate', 'tndsDataDate', 'updateBusData', 'refreshDataStatus', 'recommendedSelection', 'selectAllRows', 'clearAllRows']) assert.match(html, new RegExp(`id="${id}"`));
assert.match(html, /<th>Include<\/th>/);
assert.match(app, /__atlas-review\/update-bus-data/);
assert.doesNotMatch(app, /Traveline (username|password)/i);
console.log('PASS Bus UI contract - Alpha.6 status, selection and local maintenance controls are exposed without browser credentials.');
