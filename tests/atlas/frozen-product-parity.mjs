import assert from 'node:assert/strict';

const STOP_FIELDS = ['Map reference', 'Stop name', 'Direction', 'Walking distance / time', 'Cycling distance / time', 'Routes serving stop'];
const SERVICE_FIELDS = ['Route', 'Operator', 'Direction / main service pattern', 'Served at', 'Principal locations', 'Typical frequency', 'Operating period at stop', 'Source'];
const WORD_FIELDS = SERVICE_FIELDS.filter(field => field !== 'Source');

export function normaliseProductFact(value) {
  return String(value ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/\s*\[([A-Z]+|\d+)\](\*)?/g, (_match, _reference, star) => ` [ref]${star || ''}`)
    .replace(/\s+/g, ' ')
    .trim();
}

function completionClass(status) {
  const value = String(status ?? '');
  if (/^Complete\b/i.test(value)) return 'complete';
  if (/^Assessment finished\b/i.test(value)) return 'partial';
  return 'unavailable';
}

function projectedRows(rows, fields) {
  return (rows ?? []).map(row => Object.fromEntries(fields.map((field, index) => {
    const value = Array.isArray(row) ? row[index] : row[field];
    return [field, field === 'Map reference' ? (String(value ?? '').trim() ? '[ref]' : '') : normaliseProductFact(value)];
  })));
}

export function assertFrozenProductParity(oracle, report, { allowPartialControls = true } = {}) {
  assert.equal(oracle?.schema, 'atlas-accepted-bus-product-semantic-oracle-v1', 'A versioned accepted semantic oracle is required.');
  assert.equal(oracle.acceptedBaselineSha, 'b3ad244dc98253da2f95a8ea9d0274ab32140f6f');
  assert.equal(report?.candidateRun, oracle.candidate.run);
  assert.equal(String(report?.candidateArtifactId), String(oracle.candidate.artifactId));
  assert.equal(report?.candidateDigest, oracle.candidate.digest);
  assert.equal(report?.candidateProducerSha, '151199cc914c235870f444d26b03c2309edbd035');
  assert.equal(report?.acquisitionAttempted, false, 'Parity audit must use the immutable candidate without acquisition.');
  assert.equal(report?.publicationAttempted, false);
  assert.equal(report?.deploymentAttempted, false);

  const ids = Object.keys(report.controls ?? {});
  assert.ok(ids.length, 'Parity report contains no controls.');
  if (!allowPartialControls) assert.deepEqual([...ids].sort(), Object.keys(oracle.controls).sort());
  for (const id of ids) {
    const expected = oracle.controls[id];
    const actual = report.controls[id];
    assert.ok(expected, `No accepted-baseline oracle exists for ${id}.`);
    assert.deepEqual(actual.assessmentCoordinates, expected.assessmentCoordinates, `${id}: assessment point changed.`);
    assert.equal(actual.assessmentMode || 'full', expected.assessmentMode, `${id}: assessment mode changed.`);
    if (actual.radiusMetres !== undefined) assert.equal(actual.radiusMetres, expected.radiusMetres, `${id}: radius changed.`);
    assert.deepEqual(projectedRows(actual.generatedWordStops, STOP_FIELDS), projectedRows(expected.stopRows, STOP_FIELDS), `${id}: Word assessed-stop population or stop facts differ from accepted baseline.`);
    assert.deepEqual(projectedRows(actual.renderedRows, SERVICE_FIELDS), expected.serviceRows, `${id}: Browser route/service rows differ from accepted baseline.`);
    assert.deepEqual(projectedRows(actual.generatedWordRows, WORD_FIELDS), expected.wordRows, `${id}: Word route/service rows differ from accepted baseline.`);
    assert.deepEqual((actual.renderedServiceNotes ?? []).map(normaliseProductFact), expected.serviceNotes, `${id}: qualifications, short workings or additional-service notes differ.`);
    assert.deepEqual((actual.reviewEvidence ?? []).map(normaliseProductFact).sort(), [...expected.reviewEvidence].sort(), `${id}: evidence-review identities/messages differ.`);
    assert.equal(Number(actual.reviewCount ?? 0), expected.reviewCount, `${id}: evidence-review count differs.`);
    assert.equal(completionClass(actual.status), expected.completion, `${id}: complete/partial/fail-closed status differs.`);
  }
  return { controls: ids.length, ids };
}
