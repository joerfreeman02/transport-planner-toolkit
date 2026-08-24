import { GREATER_LONDON_BOUNDARY } from './greater-london-boundary.mjs';

const radians = degrees => degrees * Math.PI / 180;

function cartesianToGeodetic({ x, y, z }, { a, b }) {
  const e2 = 1 - (b * b) / (a * a);
  const p = Math.hypot(x, y);
  let latitude = Math.atan2(z, p * (1 - e2));
  let previous;
  do {
    previous = latitude;
    const nu = a / Math.sqrt(1 - e2 * Math.sin(latitude) ** 2);
    latitude = Math.atan2(z + e2 * nu * Math.sin(latitude), p);
  } while (Math.abs(latitude - previous) > 1e-12);
  return { latitude, longitude: Math.atan2(y, x) };
}

export function wgs84ToBritishNationalGrid(latitudeValue, longitudeValue) {
  const latitude = radians(Number(latitudeValue));
  const longitude = radians(Number(longitudeValue));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Valid WGS84 coordinates are required.');

  const wgs84 = { a: 6378137, b: 6356752.314245 };
  const e2 = 1 - (wgs84.b * wgs84.b) / (wgs84.a * wgs84.a);
  const nu = wgs84.a / Math.sqrt(1 - e2 * Math.sin(latitude) ** 2);
  const cartesian = {
    x: nu * Math.cos(latitude) * Math.cos(longitude),
    y: nu * Math.cos(latitude) * Math.sin(longitude),
    z: (1 - e2) * nu * Math.sin(latitude)
  };

  const arcseconds = Math.PI / (180 * 3600);
  const transform = {
    tx: -446.448, ty: 125.157, tz: -542.06,
    rx: -0.1502 * arcseconds, ry: -0.247 * arcseconds, rz: -0.8421 * arcseconds,
    scale: 1 + 20.4894e-6
  };
  const osgbCartesian = {
    x: transform.tx + cartesian.x * transform.scale - cartesian.y * transform.rz + cartesian.z * transform.ry,
    y: transform.ty + cartesian.x * transform.rz + cartesian.y * transform.scale - cartesian.z * transform.rx,
    z: transform.tz - cartesian.x * transform.ry + cartesian.y * transform.rx + cartesian.z * transform.scale
  };
  const airy = { a: 6377563.396, b: 6356256.909 };
  const geodetic = cartesianToGeodetic(osgbCartesian, airy);

  const f0 = 0.9996012717;
  const latitude0 = radians(49);
  const longitude0 = radians(-2);
  const northing0 = -100000;
  const easting0 = 400000;
  const airyE2 = 1 - (airy.b * airy.b) / (airy.a * airy.a);
  const n = (airy.a - airy.b) / (airy.a + airy.b);
  const sinLatitude = Math.sin(geodetic.latitude);
  const cosLatitude = Math.cos(geodetic.latitude);
  const tanLatitude = Math.tan(geodetic.latitude);
  const nuGrid = airy.a * f0 / Math.sqrt(1 - airyE2 * sinLatitude ** 2);
  const rho = airy.a * f0 * (1 - airyE2) / (1 - airyE2 * sinLatitude ** 2) ** 1.5;
  const eta2 = nuGrid / rho - 1;
  const deltaLatitude = geodetic.latitude - latitude0;
  const sumLatitude = geodetic.latitude + latitude0;
  const meridionalArc = airy.b * f0 * (
    (1 + n + 5 / 4 * n ** 2 + 5 / 4 * n ** 3) * deltaLatitude
    - (3 * n + 3 * n ** 2 + 21 / 8 * n ** 3) * Math.sin(deltaLatitude) * Math.cos(sumLatitude)
    + (15 / 8 * n ** 2 + 15 / 8 * n ** 3) * Math.sin(2 * deltaLatitude) * Math.cos(2 * sumLatitude)
    - 35 / 24 * n ** 3 * Math.sin(3 * deltaLatitude) * Math.cos(3 * sumLatitude)
  );
  const deltaLongitude = geodetic.longitude - longitude0;
  const northing = northing0 + meridionalArc
    + nuGrid / 2 * sinLatitude * cosLatitude * deltaLongitude ** 2
    + nuGrid / 24 * sinLatitude * cosLatitude ** 3 * (5 - tanLatitude ** 2 + 9 * eta2) * deltaLongitude ** 4
    + nuGrid / 720 * sinLatitude * cosLatitude ** 5 * (61 - 58 * tanLatitude ** 2 + tanLatitude ** 4) * deltaLongitude ** 6;
  const easting = easting0
    + nuGrid * cosLatitude * deltaLongitude
    + nuGrid / 6 * cosLatitude ** 3 * (nuGrid / rho - tanLatitude ** 2) * deltaLongitude ** 3
    + nuGrid / 120 * cosLatitude ** 5 * (5 - 18 * tanLatitude ** 2 + tanLatitude ** 4 + 14 * eta2 - 58 * tanLatitude ** 2 * eta2) * deltaLongitude ** 5;
  return Object.freeze({ easting, northing });
}

export function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses = (y > point.northing) !== (previousY > point.northing)
      && point.easting < (previousX - x) * (point.northing - y) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function isGreaterLondonPoint({ latitude, longitude }, boundary = GREATER_LONDON_BOUNDARY) {
  const point = wgs84ToBritishNationalGrid(latitude, longitude);
  return boundary.rings.some(ring => pointInRing(point, ring));
}

export const GREATER_LONDON_BOUNDARY_SOURCE = GREATER_LONDON_BOUNDARY.metadata;
