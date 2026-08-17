function pointOnSegment(point, start, end) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 1e-10) return false;
  const dot = (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1]);
  if (dot < 0) return false;
  const squaredLength = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  return dot <= squaredLength;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[previous], end = ring[index];
    if (pointOnSegment(point, start, end)) return true;
    const crosses = (end[1] > point[1]) !== (start[1] > point[1])
      && point[0] < (start[0] - end[0]) * (point[1] - end[1]) / (start[1] - end[1]) + end[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point, geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(rings => rings.length && pointInRing(point, rings[0]) && !rings.slice(1).some(ring => pointInRing(point, ring)));
}

function evidence(candidateSourceId, buildingSourceId, associationMethod, reviewState, reviewReason = '', extra = {}) {
  return { candidateSourceId, buildingSourceId, associationMethod, reviewState, reviewRequired: reviewState !== 'ready', reviewReason, ...extra };
}

function readyPolygonCandidate(candidate) {
  const candidateSourceId = candidate.properties.sourceId;
  return {
    ...candidate,
    properties: {
      ...candidate.properties,
      communityEvidence: evidence(candidateSourceId, candidateSourceId, 'source-area', 'ready')
    }
  };
}

export function resolveCommunityCandidateGeometry(features) {
  const supports = features.filter(item => item.properties?.class === 'building-support' && ['Polygon', 'MultiPolygon'].includes(item.geometry?.type));
  const candidates = features.filter(item => item.properties?.class === 'community-candidate');
  const other = features.filter(item => !['building-support', 'community-candidate'].includes(item.properties?.class));
  const resolved = candidates.map(candidate => {
    if (['Polygon', 'MultiPolygon'].includes(candidate.geometry?.type)) return readyPolygonCandidate(candidate);
    const candidateSourceId = candidate.properties.sourceId;
    const point = candidate.geometry?.type === 'Point' ? candidate.geometry.coordinates : null;
    if (!point) {
      return {
        ...candidate,
        properties: { ...candidate.properties, communityEvidence: evidence(candidateSourceId, '', 'none', 'review-required', 'COMMUNITY FOOTPRINT REQUIRES REVIEW - CANDIDATE HAS NO USABLE AREA OR POINT GEOMETRY') }
      };
    }
    const containing = supports.filter(item => pointInPolygon(point, item.geometry));
    if (containing.length === 1) {
      const building = containing[0];
      return {
        ...candidate,
        properties: { ...candidate.properties, communityEvidence: evidence(candidateSourceId, building.properties.sourceId, 'single-containing-building', 'ready') },
        geometry: structuredClone(building.geometry)
      };
    }
    const reason = containing.length
      ? 'COMMUNITY FOOTPRINT REQUIRES REVIEW - MULTIPLE CONTAINING BUILDINGS'
      : 'COMMUNITY FOOTPRINT REQUIRES REVIEW - NO CONTAINING BUILDING';
    const footprintChoices = containing.map(item => ({
      sourceId: item.properties.sourceId,
      geometry: structuredClone(item.geometry)
    }));
    return {
      ...candidate,
      properties: { ...candidate.properties, communityEvidence: evidence(
        candidateSourceId, '', containing.length ? 'ambiguous-containing-buildings' : 'none', 'review-required', reason,
        footprintChoices.length ? { footprintChoices } : {}
      ) }
    };
  });
  return [...other, ...resolved];
}
