import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalTflReplayKey, verifyPrivacySafeAuditReport, verifyTflReplayFixture } from '../../tools/atlas-release/tfl-replay-privacy.mjs';

const fixturePath = new URL('./fixtures/tfl-replay/tfl-replay-c2.json.gz', import.meta.url);
const manifestPath = new URL('./fixtures/tfl-replay/privacy-manifest.json', import.meta.url);
const verified = await verifyTflReplayFixture(fixturePath, manifestPath);
assert.equal(verified.capture.responses.length, 135);
assert.deepEqual(verified.manifest.result.responseStatusCounts, { '200': 133, '400': 2 });
assert.equal(verified.manifest.source.originalSha256, '9882a2057578b2d659a8522f90753ebedabcc012fd72c60e4547a82223ea4e7b');
assert.equal(verified.manifest.result.bodyContentChanged, false);
assert.equal(verified.manifest.result.pseudonymizedCoordinateRequestCount, 2);
assert.equal(verified.capture.responses.some(response => response.control !== undefined), false);
assert.equal(Object.hasOwn(verified.capture, 'candidateRoot'), false);
assert.ok(verified.capture.responses.filter(response => new URL(response.url).searchParams.has('lat') || new URL(response.url).searchParams.has('lon')).every(response => {
  const url = new URL(response.url);
  return (!url.searchParams.has('lat') || url.searchParams.get('lat') === '0')
    && (!url.searchParams.has('lon') || url.searchParams.get('lon') === '0');
}));
assert.equal(
  canonicalTflReplayKey('GET', 'https://api.tfl.gov.uk/StopPoint?lat=51.1&lon=-0.1&radius=700&modes=bus'),
  canonicalTflReplayKey('GET', 'https://api.tfl.gov.uk/StopPoint?lat=0&lon=0&radius=700&modes=bus'),
  'Replay matching must ignore only pseudonymized coordinate parameters.'
);
assert.notEqual(
  canonicalTflReplayKey('GET', 'https://api.tfl.gov.uk/StopPoint?lat=0&lon=0&radius=700&modes=bus'),
  canonicalTflReplayKey('GET', 'https://api.tfl.gov.uk/StopPoint?lat=0&lon=0&radius=500&modes=bus'),
  'Replay matching must retain non-coordinate query parameters.'
);

const tmp = await mkdtemp(path.join(os.tmpdir(), 'atlas-tfl-privacy-'));
try {
  const reportPath = path.join(tmp, 'acceptance-report.json');
  const replayedRequests = Array.from({ length: 135 }, (_, index) => ({
    source: 'recorded live TfL response',
    control: index < 90 ? 'tufton' : 'grove-road',
    path: '/StopPoint',
    query: 'radius=700&modes=bus'
  }));
  const controls = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`control-${index + 1}`, {
    acknowledgementRecorded: true, wordExportVerified: true, mapExportVerified: true
  }]));
  await writeFile(reportPath, JSON.stringify({
    controls,
    failures: [],
    externalRequests: [],
    recordedTflReplay: { matchedResponses: 135, misses: [], unusedResponses: [] },
    runtimeIdentity: {
      worktreeRoot: 'application checkout', v2DataRoot: 'immutable Run #75 candidate data root',
      tflIbusDataRoot: 'coherent Run #75 iBus fixture',
      tflEvidence: { expectedHttp400s: [{ status: 400 }, { status: 400 }] }
    },
    tflReplayRequests: replayedRequests
  }));
  const report = await verifyPrivacySafeAuditReport(reportPath);
  assert.equal(Object.keys(report.controls).length, 16);
} finally {
  await rm(tmp, { recursive: true, force: true });
}

const workflow = await readFile(new URL('../../.github/workflows/atlas-beta2-release-validation.yml', import.meta.url), 'utf8');
assert.match(workflow, /pull_request:/);
assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
assert.doesNotMatch(workflow, /workflow_dispatch/);
assert.match(workflow, /Verify privacy-safe 135-response TfL capture/);
assert.match(workflow, /Run required exact-head 16-control Browser\/Word\/A3 audit/);
assert.match(workflow, /verify-audit release-audit-tfl\.json/);
assert.doesNotMatch(workflow, /pages:\s*write|deploy-pages|upload-pages-artifact/);

console.log('TfL replay privacy tests passed: 135 captured responses verified, 2 coordinates pseudonymized, and exact-head pre-merge audit is mandatory.');
