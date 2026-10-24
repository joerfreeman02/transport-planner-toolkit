import assert from 'node:assert/strict';
import { buildAssessmentMapPdf } from '../../src/atlas/presentation/bus-map-pdf.mjs';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const pdf = buildAssessmentMapPdf(jpeg, 1200, 800);
const text = new TextDecoder('latin1').decode(pdf);
assert.equal(text.slice(0, 8), '%PDF-1.4');
assert.match(text, /\/MediaBox \[0 0 1190\.55 841\.89\]/, 'standalone maps use a landscape A3 page');
assert.match(text, /\/Subtype \/Image[\s\S]*?\/Filter \/DCTDecode/);
assert.match(text, /\/MapImage Do/);
assert.match(text, /startxref\n\d+\n%%EOF$/);
assert.throws(() => buildAssessmentMapPdf(new Uint8Array(), 100, 100), /valid JPEG/);
assert.throws(() => buildAssessmentMapPdf(jpeg, 0, 100), /valid JPEG/);
console.log('PASS deterministic A3 landscape PDF map container and input validation.');
