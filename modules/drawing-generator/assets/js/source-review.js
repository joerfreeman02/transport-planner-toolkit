export const STATION_RAIL_REVIEW_THRESHOLD_METRES = 200;
export const NO_NEARBY_RAIL_WARNING = 'REVIEW REQUIRED - NO NEARBY RETURNED RAIL GEOMETRY';

const STATION_PREFIX = 'station-';

function radians(value) { return value * Math.PI / 180; }

function localMetres(point, latitude) {
  return [point[0] * 111320 * Math.cos(radians(latitude)), point[1] * 110540];
}

function pointToSegmentMetres(point, start, end) {
  const latitude = point[1];
  const p = localMetres(point, latitude);
  const a = localMetres(start, latitude);
  const b = localMetres(end, latitude);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const denominator = dx * dx + dy * dy;
  const ratio = denominator ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator)) : 0;
  return Math.hypot(p[0] - (a[0] + ratio * dx), p[1] - (a[1] + ratio * dy));
}

function lines(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

export function nearestRailDistanceMetres(stationGeometry, railwayFeatures = []) {
  if (stationGeometry?.type !== 'Point') return Number.POSITIVE_INFINITY;
  const point = stationGeometry.coordinates;
  const distances = railwayFeatures.flatMap(feature => lines(feature.geometry).flatMap(line => line.slice(1).map((end, index) => pointToSegmentMetres(point, line[index], end))));
  return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

export function assessStationRailConsistency(features, thresholdMetres = STATION_RAIL_REVIEW_THRESHOLD_METRES) {
  const railways = features.filter(feature => feature.properties?.class === 'railway');
  return features.map(feature => {
    const className = feature.properties?.class || '';
    if (!className.startsWith(STATION_PREFIX)) return structuredClone(feature);
    const nearestDistanceMetres = nearestRailDistanceMetres(feature.geometry, railways);
    const reviewRequired = !Number.isFinite(nearestDistanceMetres) || nearestDistanceMetres > thresholdMetres;
    return {
      ...structuredClone(feature),
      properties: {
        ...feature.properties,
        stationQa: {
          thresholdMetres,
          nearestRailDistanceMetres: Number.isFinite(nearestDistanceMetres) ? Math.round(nearestDistanceMetres) : null,
          reviewRequired,
          warning: reviewRequired ? NO_NEARBY_RAIL_WARNING : ''
        }
      }
    };
  });
}

export function sourceIdentifier(feature) {
  return String(feature?.properties?.sourceId || feature?.id || '');
}

export function reviewStateForFeature(feature, sourceReview = {}) {
  const sourceId = sourceIdentifier(feature);
  const override = sourceReview[sourceId];
  if (override === 'included' || override === 'excluded') return override;
  if (feature?.properties?.stationQa?.reviewRequired) return 'excluded';
  return 'included';
}

export function resolveSourcePresentation(features, sourceReview = {}) {
  return features.filter(feature => reviewStateForFeature(feature, sourceReview) === 'included').map(feature => ({
    ...structuredClone(feature),
    properties: { ...feature.properties, presentationReview: reviewStateForFeature(feature, sourceReview) }
  }));
}

export function stationReviewCandidates(features, sourceReview = {}) {
  return features.filter(feature => (feature.properties?.class || '').startsWith(STATION_PREFIX)).map(feature => {
    const sourceId = sourceIdentifier(feature);
    return {
      sourceId,
      name: feature.properties?.name || feature.properties?.ref || 'Unnamed station',
      mode: feature.properties?.mode || feature.properties?.class || 'Station',
      state: reviewStateForFeature(feature, sourceReview),
      qa: feature.properties?.stationQa || { reviewRequired: false, warning: '', nearestRailDistanceMetres: null, thresholdMetres: STATION_RAIL_REVIEW_THRESHOLD_METRES }
    };
  }).sort((left, right) => left.name.localeCompare(right.name) || left.sourceId.localeCompare(right.sourceId));
}
