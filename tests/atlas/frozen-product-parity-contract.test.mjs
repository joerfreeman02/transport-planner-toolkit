import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFrozenProductParity } from './frozen-product-parity.mjs';

const oracle = JSON.parse(readFileSync(new URL('./fixtures/accepted-bus-product-semantic-oracle.json', import.meta.url), 'utf8'));
const stopFields = ['Map reference', 'Stop name', 'Direction', 'Walking distance / time', 'Cycling distance / time', 'Routes serving stop'];
const controls = Object.fromEntries(Object.entries(oracle.controls).map(([id, item]) => [id, {
  assessmentCoordinates: item.assessmentCoordinates,
  assessmentMode: item.assessmentMode,
  radiusMetres: item.radiusMetres,
  generatedWordStops: item.stopRows.map(row => Object.fromEntries(stopFields.map((field, index) => [field, row[index]]))),
  renderedRows: item.serviceRows,
  generatedWordRows: item.wordRows,
  renderedServiceNotes: item.serviceNotes,
  reviewEvidence: item.reviewEvidence,
  reviewCount: item.reviewCount,
  status: item.completion === 'complete' ? 'Complete' : item.completion === 'partial' ? `Assessment finished — ${item.reviewCount} evidence items need review` : 'Unavailable'
}]));
const candidateReport = {
  candidateRun: oracle.candidate.run,
  candidateArtifactId: oracle.candidate.artifactId,
  candidateDigest: oracle.candidate.digest,
  candidateProducerSha: '151199cc914c235870f444d26b03c2309edbd035',
  acquisitionAttempted: false,
  publicationAttempted: false,
  deploymentAttempted: false,
  controls
};

assert.equal(assertFrozenProductParity(oracle, candidateReport, { allowPartialControls: false }).controls, 7);
const broken = structuredClone(candidateReport);
broken.controls['waltham-cross'].renderedRows[0].Operator = 'Invented operator';
assert.throws(() => assertFrozenProductParity(oracle, broken), /Browser route\/service rows differ/);
const acquired = structuredClone(candidateReport);
acquired.acquisitionAttempted = true;
assert.throws(() => assertFrozenProductParity(oracle, acquired), /without acquisition/);
console.log('PASS frozen semantic oracle covers all seven accepted Run #75 Browser/Word controls and fails on changed service facts or acquisition.');
