const EPSG_27700 = '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +datum=OSGB36 +units=m +no_defs';
let implementation = globalThis.proj4;

export function configureProj4(proj4Implementation) {
  if (typeof proj4Implementation !== 'function' || typeof proj4Implementation.defs !== 'function') throw new Error('A compatible Proj4 implementation is required.');
  implementation = proj4Implementation;
  implementation.defs('EPSG:27700', EPSG_27700);
  return implementation;
}

function projection() {
  if (!implementation) implementation = globalThis.proj4;
  if (!implementation) throw new Error('Proj4 is not available.');
  if (!implementation.defs('EPSG:27700')) configureProj4(implementation);
  return implementation;
}

export function wgs84ToBng(coordinate) {
  validatePair(coordinate, 'WGS84');
  const [easting, northing] = projection()('EPSG:4326', 'EPSG:27700', coordinate.slice(0, 2));
  return { easting, northing };
}

export function bngToWgs84(coordinate) {
  validatePair(coordinate, 'BNG');
  return projection()('EPSG:27700', 'EPSG:4326', coordinate.slice(0, 2));
}

export function mapCoordinates(value, transform) {
  return isPair(value) ? transform(value) : value.map(item => mapCoordinates(item, transform));
}

export function transformGeometry(geometry, from, to) {
  if (!geometry || !geometry.type || !Array.isArray(geometry.coordinates)) throw new Error('A GeoJSON geometry is required.');
  return { type: geometry.type, coordinates: mapCoordinates(geometry.coordinates, coordinate => projection()(from, to, coordinate.slice(0, 2))) };
}

export function roundTripErrorMetres(lonLat) {
  const projected = wgs84ToBng(lonLat);
  const reversed = bngToWgs84([projected.easting, projected.northing]);
  const latitude = lonLat[1] * Math.PI / 180;
  const dx = (reversed[0] - lonLat[0]) * 111320 * Math.cos(latitude);
  const dy = (reversed[1] - lonLat[1]) * 110540;
  return Math.hypot(dx, dy);
}

function isPair(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function validatePair(value, label) {
  if (!isPair(value)) throw new Error(`${label} coordinates must be a finite pair.`);
}

if (implementation) configureProj4(implementation);

export { EPSG_27700 };
