export const V2_REVIEW_CACHE_MARKER_SCHEMA = 'atlas-v2-review-prepared-cache-v2';

export function buildPreparedCacheMarker({ runId, snapshotId, snapshotReport, manifest, generatorFingerprint }) {
  return {
    markerSchema: V2_REVIEW_CACHE_MARKER_SCHEMA,
    runId,
    sourceRunId: runId,
    snapshotId,
    sourceSnapshotId: snapshotId,
    snapshotReport,
    preparedSchema: manifest.schema,
    preparedDataVersion: manifest.version,
    generatorFingerprint,
    counts: manifest.counts || null,
    generatedAt: manifest.generatedAt
  };
}

export function preparedCacheMarkerMatches(marker, expected) {
  return Boolean(
    marker?.markerSchema === V2_REVIEW_CACHE_MARKER_SCHEMA &&
    marker.sourceRunId === expected.sourceRunId &&
    marker.sourceSnapshotId === expected.sourceSnapshotId &&
    marker.preparedSchema === expected.preparedSchema &&
    marker.preparedDataVersion === expected.preparedDataVersion &&
    marker.generatorFingerprint?.schema === expected.generatorFingerprint?.schema &&
    marker.generatorFingerprint?.sha256 === expected.generatorFingerprint?.sha256
  );
}
