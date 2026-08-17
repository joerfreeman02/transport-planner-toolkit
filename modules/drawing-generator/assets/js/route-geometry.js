const EARTH_RADIUS_METRES = 6371008.8;

function radians(value) {
  return value * Math.PI / 180;
}

export function haversineMetres(a, b) {
  const latitudeDelta = radians(b[1] - a[1]);
  const longitudeDelta = radians(b[0] - a[0]);
  const latitudeA = radians(a[1]);
  const latitudeB = radians(b[1]);
  const term = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term));
}

function asRouteCoordinates(geometry) {
  if (geometry?.type !== 'LineString' || geometry.coordinates.length < 2) {
    throw new Error('Road-guidance geometry must be a LineString with at least two coordinates.');
  }
  return geometry.coordinates;
}

export function routeLengthMetres(geometry) {
  const coordinates = asRouteCoordinates(geometry);
  return coordinates.slice(1).reduce((total, coordinate, index) => total + haversineMetres(coordinates[index], coordinate), 0);
}

function coordinateAtDistance(coordinates, requestedDistance) {
  const total = coordinates.slice(1).reduce((sum, coordinate, index) => sum + haversineMetres(coordinates[index], coordinate), 0);
  const target = Math.max(0, Math.min(total, requestedDistance));
  let traversed = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segment = haversineMetres(start, end);
    if (traversed + segment >= target || index === coordinates.length - 1) {
      const ratio = segment ? (target - traversed) / segment : 0;
      return [start[0] + ((end[0] - start[0]) * ratio), start[1] + ((end[1] - start[1]) * ratio)];
    }
    traversed += segment;
  }
  return [...coordinates.at(-1)];
}

export function routeArrowPlacements(geometry, family = 'regional') {
  const coordinates = asRouteCoordinates(geometry);
  const length = routeLengthMetres(geometry);
  const preferredSpacing = family === 'local' ? 105 : 1700;
  const count = Math.max(1, Math.min(10, Math.floor(length / preferredSpacing)));
  const spacing = length / (count + 1);
  const tangentDistance = Math.max(family === 'local' ? 7 : 100, Math.min(spacing * 0.16, family === 'local' ? 22 : 340));
  return Array.from({ length: count }, (_, index) => {
    const distance = spacing * (index + 1);
    return {
      distanceMetres: distance,
      start: coordinateAtDistance(coordinates, Math.max(0, distance - tangentDistance)),
      end: coordinateAtDistance(coordinates, Math.min(length, distance + tangentDistance))
    };
  });
}

function localPoint(point, referenceLatitude) {
  return [
    point[0] * 111320 * Math.cos(radians(referenceLatitude)),
    point[1] * 110540
  ];
}

function pointToSegmentDistanceMetres(point, start, end) {
  const referenceLatitude = point[1];
  const p = localPoint(point, referenceLatitude);
  const a = localPoint(start, referenceLatitude);
  const b = localPoint(end, referenceLatitude);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const denominator = (dx * dx) + (dy * dy);
  const ratio = denominator ? Math.max(0, Math.min(1, (((p[0] - a[0]) * dx) + ((p[1] - a[1]) * dy)) / denominator)) : 0;
  return Math.hypot(p[0] - (a[0] + ratio * dx), p[1] - (a[1] + ratio * dy));
}

function siteRings(siteGeometry) {
  if (siteGeometry?.type === 'Polygon') return siteGeometry.coordinates;
  if (siteGeometry?.type === 'MultiPolygon') return siteGeometry.coordinates.flat();
  return [];
}

function distanceToSite(point, siteGeometry) {
  const rings = siteRings(siteGeometry);
  if (!rings.length) return Number.POSITIVE_INFINITY;
  return Math.min(...rings.flatMap(ring => ring.slice(1).map((end, index) => pointToSegmentDistanceMetres(point, ring[index], end))));
}

export function normaliseRouteDirection(geometry, className, siteGeometry, options = {}) {
  const coordinates = asRouteCoordinates(geometry);
  if (!['route-to-site', 'route-from-site'].includes(className) || !siteRings(siteGeometry).length) {
    return { geometry: structuredClone(geometry), status: 'review-required', reversed: false, reason: 'ROUTE DIRECTION REQUIRES REVIEW' };
  }
  const startDistanceMetres = distanceToSite(coordinates[0], siteGeometry);
  const endDistanceMetres = distanceToSite(coordinates.at(-1), siteGeometry);
  const ambiguityMetres = options.ambiguityMetres ?? Math.max(10, Math.min(50, routeLengthMetres(geometry) * 0.01));
  if (Math.abs(startDistanceMetres - endDistanceMetres) <= ambiguityMetres) {
    return {
      geometry: structuredClone(geometry), status: 'review-required', reversed: false,
      startDistanceMetres, endDistanceMetres, reason: 'ROUTE DIRECTION REQUIRES REVIEW'
    };
  }
  const nearestEndpoint = startDistanceMetres < endDistanceMetres ? 'start' : 'end';
  const requiredNearestEndpoint = className === 'route-to-site' ? 'end' : 'start';
  const reversed = nearestEndpoint !== requiredNearestEndpoint;
  return {
    geometry: reversed ? { ...structuredClone(geometry), coordinates: [...coordinates].reverse().map(coordinate => [...coordinate]) } : structuredClone(geometry),
    status: 'confirmed', reversed, startDistanceMetres, endDistanceMetres,
    normalization: reversed ? `Geometry reversed: ${requiredNearestEndpoint.toUpperCase()} is now nearest the site.` : `Geometry retained: ${requiredNearestEndpoint.toUpperCase()} is nearest the site.`
  };
}

function nearestMeasure(point, coordinates) {
  let cumulative = 0;
  let best = { distanceMetres: Number.POSITIVE_INFINITY, measureMetres: 0 };
  coordinates.slice(1).forEach((end, index) => {
    const start = coordinates[index];
    const referenceLatitude = point[1];
    const p = localPoint(point, referenceLatitude);
    const a = localPoint(start, referenceLatitude);
    const b = localPoint(end, referenceLatitude);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const denominator = (dx * dx) + (dy * dy);
    const ratio = denominator ? Math.max(0, Math.min(1, (((p[0] - a[0]) * dx) + ((p[1] - a[1]) * dy)) / denominator)) : 0;
    const distanceMetres = Math.hypot(p[0] - (a[0] + ratio * dx), p[1] - (a[1] + ratio * dy));
    if (distanceMetres < best.distanceMetres) best = { distanceMetres, measureMetres: cumulative + (haversineMetres(start, end) * ratio) };
    cumulative += haversineMetres(start, end);
  });
  return best;
}

export function assessGuidanceOrder(guidanceCoordinates, snappedGeometry) {
  const snappedCoordinates = asRouteCoordinates(snappedGeometry);
  const measures = guidanceCoordinates.map(coordinate => nearestMeasure(coordinate, snappedCoordinates));
  const orderPreserved = measures.every((measurement, index) => index === 0 || measurement.measureMetres + 5 >= measures[index - 1].measureMetres);
  return {
    orderPreserved,
    maxGuidanceDeviationMetres: Math.max(0, ...measures.map(measurement => measurement.distanceMetres)),
    measuresMetres: measures.map(measurement => measurement.measureMetres)
  };
}
