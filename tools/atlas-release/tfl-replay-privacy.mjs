import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

export const ORIGINAL_CAPTURE_SHA256 = '9882a2057578b2d659a8522f90753ebedabcc012fd72c60e4547a82223ea4e7b';
export const EXPECTED_RESPONSE_COUNT = 135;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

export function canonicalTflReplayKey(method, rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.delete('lat');
  url.searchParams.delete('lon');
  url.searchParams.sort();
  return `${String(method).toUpperCase()} ${url.origin}${url.pathname}${url.search}`;
}

export function safeTflUrlForReport(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === 'api.tfl.gov.uk') {
      url.searchParams.delete('lat');
      url.searchParams.delete('lon');
      url.searchParams.sort();
    }
    return url.toString();
  } catch {
    return '[invalid URL omitted]';
  }
}

export async function readTflReplayCapture(filePath) {
  const bytes = await readFile(filePath);
  const json = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return { capture: JSON.parse(json.toString('utf8')), bytes, jsonBytes: json };
}

function orderedResponsesDigest(responses) {
  const hash = createHash('sha256');
  for (const [index, response] of responses.entries()) {
    const body = Buffer.from(response.bodyBase64, 'base64');
    hash.update(`${index}\0${response.status}\0${sha256(body)}\n`);
  }
  return hash.digest('hex');
}

function orderedRequestKeysDigest(responses) {
  const hash = createHash('sha256');
  for (const response of responses) hash.update(`${canonicalTflReplayKey(response.method, response.url)}\n`);
  return hash.digest('hex');
}

function statusCounts(responses) {
  return Object.fromEntries([...new Set(responses.map(response => response.status))]
    .sort((a, b) => a - b)
    .map(status => [String(status), responses.filter(response => response.status === status).length]));
}

function inspectPublicCapture(capture) {
  assert.equal(capture.schema, 'atlas-tfl-live-response-capture-v1', 'Unexpected source capture schema.');
  assert.equal(capture.responses?.length, EXPECTED_RESPONSE_COUNT, 'Source capture must contain all 135 responses.');
  const bodies = [];
  let coordinateRequests = 0;
  for (const response of capture.responses) {
    const url = new URL(response.url);
    assert.equal(url.protocol, 'https:', 'TfL responses must originate from HTTPS.');
    assert.equal(url.hostname, 'api.tfl.gov.uk', 'Capture contains a non-TfL response.');
    assert.ok(['GET', 'HEAD'].includes(String(response.method).toUpperCase()), 'Unexpected TfL request method.');
    assert.ok(Number.isInteger(response.status) && response.status >= 200 && response.status <= 599, 'Invalid captured HTTP status.');
    assert.equal(typeof response.bodyBase64, 'string', 'Captured response body is missing.');
    const queryKeys = [...url.searchParams.keys()].map(key => key.toLowerCase());
    assert.ok(!queryKeys.some(key => /(?:api.?key|token|secret|auth|email|signature)/i.test(key)), 'Request URL contains a credential-like parameter.');
    if (url.searchParams.has('lat') || url.searchParams.has('lon')) coordinateRequests++;
    for (const [name, value] of Object.entries(response.headers ?? {})) {
      assert.ok(['content-type', 'date'].includes(name.toLowerCase()), `Unexpected response header field: ${name}.`);
      assert.ok(!/(?:cookie|authorization|token|secret|api.?key)/i.test(name), 'Sensitive response header is present.');
    }
    const body = Buffer.from(response.bodyBase64, 'base64');
    const text = body.toString('utf8');
    assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text), 'Response body appears to contain an email address.');
    assert.ok(!/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i.test(text), 'Response body appears to contain a UK postcode.');
    assert.ok(!/(?:Bearer\s+[A-Za-z0-9._-]{12,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|api[_-]?key\s*[:=])/i.test(text), 'Response body appears to contain a credential.');
    assert.ok(!/C:\\Users\\|\/Users\/[^/]+\//i.test(text), 'Response body contains a workstation path.');
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (parsed && typeof parsed === 'object') {
      const visit = value => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          assert.ok(!/(?:phone|email|contact|client|customer|personal)/i.test(key), `Response body has a potentially personal field: ${key}.`);
          visit(child);
        }
      };
      visit(parsed);
    }
    bodies.push(body);
  }
  assert.equal(statusCounts(capture.responses)['400'], 2, 'The two captured HTTP 400 responses must be retained.');
  return { coordinateRequests, totalBodyBytes: bodies.reduce((sum, body) => sum + body.length, 0) };
}

export async function sanitizeTflReplayCapture(sourcePath, fixturePath, manifestPath) {
  const sourceBytes = await readFile(sourcePath);
  assert.equal(sha256(sourceBytes), ORIGINAL_CAPTURE_SHA256, 'Source capture digest does not match the retained evidence identity.');
  const source = JSON.parse(sourceBytes.toString('utf8'));
  const inspection = inspectPublicCapture(source);
  const transformed = {
    schema: source.schema,
    capturedAt: source.capturedAt,
    sourceEnvironment: 'TfL API response capture from controlled headless acceptance; privacy transformed for public replay.',
    candidateManifestDigests: source.candidateManifestDigests,
    responses: source.responses.map(response => {
      const url = new URL(response.url);
      if (url.searchParams.has('lat')) url.searchParams.set('lat', '0');
      if (url.searchParams.has('lon')) url.searchParams.set('lon', '0');
      const headers = Object.fromEntries(Object.entries(response.headers ?? {})
        .filter(([name]) => name.toLowerCase() === 'content-type'));
      return {
        method: response.method,
        url: url.toString(),
        status: response.status,
        headers,
        bodyBase64: response.bodyBase64
      };
    })
  };
  const transformedBytes = jsonBytes(transformed);
  const compressed = gzipSync(transformedBytes, { level: 9, mtime: 0 });
  const manifest = {
    schema: 'atlas-tfl-replay-privacy-manifest-v1',
    source: {
      description: 'Retained Product Owner headless acceptance capture; original local source path intentionally withheld.',
      originalSha256: sha256(sourceBytes),
      originalSchema: source.schema,
      responseCount: source.responses.length,
      candidateRun: '39430415441',
      candidateArtifactId: '12275615359',
      candidateArtifactSha256: '5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471',
      candidateProducerSha: '151199cc914c235870f444d26b03c2309edbd035',
      candidateManifestDigests: source.candidateManifestDigests
    },
    result: {
      file: path.basename(fixturePath),
      gzipSha256: sha256(compressed),
      jsonSha256: sha256(transformedBytes),
      responseCount: transformed.responses.length,
      responseStatusCounts: statusCounts(transformed.responses),
      pseudonymizedCoordinateRequestCount: inspection.coordinateRequests,
      orderedStatusAndBodyDigest: orderedResponsesDigest(transformed.responses),
      orderedCanonicalRequestKeysDigest: orderedRequestKeysDigest(transformed.responses),
      totalResponseBodyBytes: inspection.totalBodyBytes,
      bodyContentChanged: false
    },
    transformations: [
      { field: 'candidateRoot', action: 'removed; contained a workstation filesystem path' },
      { field: 'sourceEnvironment', action: 'replaced with a generic capture provenance description' },
      { field: 'responses[].control', action: 'removed; replay matching does not use control labels' },
      { field: 'responses[].url query lat/lon', action: `replaced with 0 in ${inspection.coordinateRequests} coordinate-bearing requests; replay matches by canonical method, path and non-coordinate query parameters` },
      { field: 'responses[].headers.date', action: 'removed; preserved content-type when present' },
      { field: 'responses[].status', action: 'preserved exactly and in original response order' },
      { field: 'responses[].bodyBase64', action: 'preserved byte-for-byte and in original response order' }
    ],
    privacyReview: {
      sourceCapturePathWithheld: true,
      requestCoordinateValuesPseudonymized: true,
      responseBodiesAreCapturedPublicTfLResponses: true,
      automatedScan: { emailMatches: 0, postcodeMatches: 0, credentialMatches: 0, workstationPathMatches: 0, potentiallyPersonalBodyFieldNames: 0 },
      falsePositiveReview: 'Telephone-shaped regex matches were inspected by JSON field path and were NaPTAN/stop identifiers, not telephone fields.'
    }
  };
  const manifestBytes = jsonBytes(manifest);
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(fixturePath, compressed);
  await writeFile(manifestPath, manifestBytes);
  return { manifest, capture: transformed };
}

export async function verifyTflReplayFixture(fixturePath, manifestPath) {
  const [compressed, manifestBytes] = await Promise.all([readFile(fixturePath), readFile(manifestPath)]);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.schema, 'atlas-tfl-replay-privacy-manifest-v1', 'Unexpected privacy manifest schema.');
  assert.equal(sha256(compressed), manifest.result.gzipSha256, 'Privacy fixture gzip digest mismatch.');
  const bytes = gunzipSync(compressed);
  assert.equal(sha256(bytes), manifest.result.jsonSha256, 'Privacy fixture JSON digest mismatch.');
  const capture = JSON.parse(bytes.toString('utf8'));
  assert.equal(capture.schema, 'atlas-tfl-live-response-capture-v1');
  assert.equal(capture.responses.length, EXPECTED_RESPONSE_COUNT);
  assert.ok(!Object.hasOwn(capture, 'candidateRoot'), 'Privacy fixture must not contain local candidate paths.');
  assert.equal(capture.responses.some(response => Object.hasOwn(response, 'control')), false, 'Privacy fixture must not contain original control labels.');
  const inspection = inspectPublicCapture(capture);
  assert.equal(inspection.coordinateRequests, manifest.result.pseudonymizedCoordinateRequestCount);
  for (const response of capture.responses) {
    const url = new URL(response.url);
    for (const key of ['lat', 'lon']) if (url.searchParams.has(key)) assert.equal(url.searchParams.get(key), '0', `Coordinate query parameter ${key} was not pseudonymized.`);
  }
  assert.deepEqual(statusCounts(capture.responses), manifest.result.responseStatusCounts);
  assert.equal(orderedResponsesDigest(capture.responses), manifest.result.orderedStatusAndBodyDigest);
  assert.equal(orderedRequestKeysDigest(capture.responses), manifest.result.orderedCanonicalRequestKeysDigest);
  assert.equal(inspection.totalBodyBytes, manifest.result.totalResponseBodyBytes);
  assert.equal(manifest.source.originalSha256, ORIGINAL_CAPTURE_SHA256);
  assert.equal(manifest.source.responseCount, EXPECTED_RESPONSE_COUNT);
  assert.equal(manifest.result.bodyContentChanged, false);
  return { capture, manifest, gzipSha256: sha256(compressed), jsonSha256: sha256(bytes) };
}

export async function verifyPrivacySafeAuditReport(reportPath, expectedControlCount = 16) {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(Object.keys(report.controls ?? {}).length, expectedControlCount, `The audit must contain all ${expectedControlCount} required controls.`);
  assert.equal(report.failures?.length, 0, 'The hosted audit recorded one or more failures.');
  assert.equal(report.externalRequests?.length, 0, 'The hosted audit made an unexpected external request.');
  assert.equal(report.recordedTflReplay?.matchedResponses, EXPECTED_RESPONSE_COUNT, 'The hosted audit did not replay all 135 responses.');
  assert.equal(report.recordedTflReplay?.misses?.length, 0, 'The hosted audit has unmatched TfL responses.');
  assert.equal(report.recordedTflReplay?.unusedResponses?.length, 0, 'The hosted audit has unused TfL responses.');
  assert.equal(report.runtimeIdentity?.tflEvidence?.expectedHttp400s?.length, 2, 'The two expected captured TfL HTTP 400 results were not retained.');
  const replayed = report.tflReplayRequests?.filter(request => request.source === 'recorded live TfL response') ?? [];
  assert.equal(replayed.length, EXPECTED_RESPONSE_COUNT, 'The audit report does not account for every replayed response.');
  for (const request of replayed) {
    const query = new URLSearchParams(request.query ?? '');
    assert.equal(query.has('lat') || query.has('lon'), false, 'The audit report exposes a request coordinate.');
  }
  for (const [controlId, result] of Object.entries(report.controls)) {
    assert.equal(typeof result.acknowledgementRecorded, 'boolean', `${controlId} acknowledgement result is missing.`);
    assert.equal(result.acknowledgementRecorded, true, `${controlId} lacks a Sources & Checks acknowledgement.`);
    assert.equal(result.wordExportVerified, true, `${controlId} Word export was not verified.`);
    assert.equal(result.mapExportVerified, true, `${controlId} A3 map export was not verified.`);
  }
  const serialized = JSON.stringify(report);
  assert.ok(!/C:\\Users\\|\/Users\/[^/]+\//i.test(serialized), 'Audit report exposes a workstation path.');
  assert.ok(!/"(?:candidateRoot|worktreeRoot|v2DataRoot|tflIbusDataRoot|capturePath)"\s*:\s*"(?:[A-Za-z]:\\\\|\/Users\/|\/home\/)/i.test(serialized), 'Audit report exposes an absolute filesystem path.');
  assert.ok(!Object.hasOwn(report, 'candidateRoot') || report.candidateRoot === 'immutable Run #75 candidate data root', 'Audit report candidate root is not redacted.');
  assert.equal(report.runtimeIdentity?.worktreeRoot, 'application checkout');
  assert.equal(report.runtimeIdentity?.v2DataRoot, 'immutable Run #75 candidate data root');
  assert.equal(report.runtimeIdentity?.tflIbusDataRoot, 'coherent Run #75 iBus fixture');
  assert.equal(Object.values(report.controls).some(control => Object.hasOwn(control, 'assessmentCoordinates')), false, 'Audit report contains raw assessment coordinates.');
  assert.equal(Object.values(report.controls).some(control => Object.hasOwn(control, 'wordText')), false, 'Audit report contains full Word text.');
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, sourceOrFixture, fixtureOrManifest, maybeManifest] = process.argv.slice(2);
  if (command === 'sanitize') {
    assert.ok(maybeManifest, 'Usage: tfl-replay-privacy.mjs sanitize <source.json> <fixture.json.gz> <privacy-manifest.json>');
    const { manifest } = await sanitizeTflReplayCapture(sourceOrFixture, fixtureOrManifest, maybeManifest);
    console.log(JSON.stringify({ responses: manifest.result.responseCount, originalSha256: manifest.source.originalSha256, gzipSha256: manifest.result.gzipSha256, jsonSha256: manifest.result.jsonSha256 }));
  } else if (command === 'verify') {
    const verified = await verifyTflReplayFixture(sourceOrFixture, fixtureOrManifest);
    console.log(JSON.stringify({ responses: verified.manifest.result.responseCount, gzipSha256: verified.gzipSha256, orderedStatusAndBodyDigest: verified.manifest.result.orderedStatusAndBodyDigest }));
  } else if (command === 'verify-audit') {
    const report = await verifyPrivacySafeAuditReport(sourceOrFixture, Number(fixtureOrManifest ?? 16));
    console.log(JSON.stringify({ controls: Object.keys(report.controls).length, replayedResponses: report.recordedTflReplay.matchedResponses, expectedHttp400s: report.runtimeIdentity.tflEvidence.expectedHttp400s.length, readiness: report.readiness }));
  } else {
    throw new Error('Usage: tfl-replay-privacy.mjs <sanitize|verify|verify-audit> ...');
  }
}
