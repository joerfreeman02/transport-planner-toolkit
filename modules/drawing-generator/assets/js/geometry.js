import { transformGeometry, wgs84ToBng } from './crs.js';

const SUPPORTED = new Set(['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);
const isPair = value => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);

function signedArea(ring) {
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) total += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  return total / 2;
}

function orientation(a, b, c) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  return Math.abs(value) < 1e-12 ? 0 : value > 0 ? 1 : 2;
}

function segmentsIntersect(a, b, c, d) {
  return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
}

function validateRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) throw new Error('Each polygon ring must contain at least four coordinate positions.');
  if (!ring.every(isPair)) throw new Error('The geometry contains an invalid coordinate.');
  const first = ring[0], last = ring.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) throw new Error('Every polygon ring must be closed.');
  const count = ring.length - 1;
  for (let firstIndex = 0; firstIndex < count; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < count; secondIndex += 1) {
      if (Math.abs(firstIndex - secondIndex) <= 1 || (firstIndex === 0 && secondIndex === count - 1)) continue;
      if (segmentsIntersect(ring[firstIndex], ring[firstIndex + 1], ring[secondIndex], ring[secondIndex + 1])) throw new Error('The geometry appears to self-intersect.');
    }
  }
  if (Math.abs(signedArea(ring)) < 1e-14) throw new Error('A polygon ring has zero or negligible area.');
}

function validateCoordinates(geometry) {
  if (geometry.type === 'Point') {
    if (!isPair(geometry.coordinates)) throw new Error('Point geometry requires one finite coordinate pair.');
    return;
  }
  if (geometry.type === 'LineString') {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || !geometry.coordinates.every(isPair)) throw new Error('LineString geometry requires at least two finite coordinate pairs.');
    return;
  }
  if (geometry.type === 'MultiLineString') {
    if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) throw new Error('MultiLineString geometry is empty.');
    geometry.coordinates.forEach(coordinates => validateCoordinates({ type: 'LineString', coordinates }));
    return;
  }
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length) throw new Error(`${geometry.type} geometry is empty.`);
  polygons.forEach(polygon => {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error('A polygon has no rings.');
    polygon.forEach(validateRing);
  });
}

function validateWgs84Coordinates(value) {
  if (isPair(value)) {
    if (value[0] < -180 || value[0] > 180 || value[1] < -90 || value[1] > 90) throw new Error('Imported coordinates must use longitude/latitude values in EPSG:4326.');
    return;
  }
  if (!Array.isArray(value)) throw new Error('The geometry coordinate structure is malformed.');
  value.forEach(validateWgs84Coordinates);
}

export function validateGeometry(geometry, allowed = SUPPORTED) {
  if (!geometry || typeof geometry !== 'object' || !allowed.has(geometry.type)) throw new Error(`Unsupported geometry. Allowed types: ${[...allowed].join(', ')}.`);
  if (!Array.isArray(geometry.coordinates)) throw new Error('The geometry has no coordinate array.');
  validateCoordinates(geometry);
  validateWgs84Coordinates(geometry.coordinates);
  return structuredClone(geometry);
}

function geometryFromGeoJson(input, requireSingle = true) {
  if (!input || typeof input !== 'object') throw new Error('The selected file is not valid GeoJSON.');
  if (input.type === 'FeatureCollection') {
    if (!Array.isArray(input.features) || !input.features.length) throw new Error('The GeoJSON feature collection is empty.');
    if (requireSingle && input.features.length !== 1) throw new Error('Supply one explicit site feature; multiple features are not inferred as one boundary.');
    return requireSingle ? input.features[0].geometry : input.features.map(feature => feature.geometry);
  }
  if (input.type === 'Feature') return input.geometry;
  return input;
}

export function extractSiteGeometry(input) {
  const geometry = geometryFromGeoJson(input, true);
  return validateGeometry(geometry, new Set(['Polygon', 'MultiPolygon']));
}

export function extractOverlayFeatures(input) {
  const features = input?.type === 'FeatureCollection' ? input.features : [input?.type === 'Feature' ? input : { type: 'Feature', properties: {}, geometry: input }];
  if (!features.length) throw new Error('The overlay file is empty.');
  return features.map((feature, index) => {
    if (!feature || feature.type !== 'Feature') throw new Error(`Overlay ${index + 1} is not a GeoJSON Feature.`);
    return { type: 'Feature', properties: { ...(feature.properties || {}) }, geometry: validateGeometry(feature.geometry) };
  });
}

export function geometryCenterBng(geometry) {
  const projected = transformGeometry(validateGeometry(geometry), 'EPSG:4326', 'EPSG:27700');
  const pairs = [];
  (function collect(value) { if (isPair(value)) pairs.push(value); else value.forEach(collect); })(projected.coordinates);
  return { easting: pairs.reduce((sum, point) => sum + point[0], 0) / pairs.length, northing: pairs.reduce((sum, point) => sum + point[1], 0) / pairs.length };
}

export function bngBoundsForGeometry(geometry) {
  const projected = transformGeometry(validateGeometry(geometry), 'EPSG:4326', 'EPSG:27700');
  const pairs = [];
  (function collect(value) { if (isPair(value)) pairs.push(value); else value.forEach(collect); })(projected.coordinates);
  return { minE: Math.min(...pairs.map(point => point[0])), minN: Math.min(...pairs.map(point => point[1])), maxE: Math.max(...pairs.map(point => point[0])), maxN: Math.max(...pairs.map(point => point[1])) };
}

export function locationCenterBng(location) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) throw new Error('A confirmed map centre is required.');
  return wgs84ToBng([location.lon, location.lat]);
}
