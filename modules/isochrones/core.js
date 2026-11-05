export const ISOCHRONE_BANDS = Object.freeze([
  Object.freeze({ from: 0, to: 300, label: '0–5 min', colour: '#2198c8' }),
  Object.freeze({ from: 300, to: 600, label: '5–10 min', colour: '#f49a32' }),
  Object.freeze({ from: 600, to: 900, label: '10–15 min', colour: '#d8ca10' }),
  Object.freeze({ from: 900, to: 1200, label: '15–20 min', colour: '#0d958c' }),
  Object.freeze({ from: 1200, to: 1500, label: '20–25 min', colour: '#56dce2' }),
  Object.freeze({ from: 1500, to: 1800, label: '25–30 min', colour: '#b446db' })
]);

const finiteCoordinate = coordinate => Array.isArray(coordinate)
  && coordinate.length >= 2
  && Number.isFinite(Number(coordinate[0]))
  && Number.isFinite(Number(coordinate[1]))
  && Math.abs(Number(coordinate[0])) <= 180
  && Math.abs(Number(coordinate[1])) <= 90;

function canonicalLineKey(coordinates) {
  const forward = JSON.stringify(coordinates);
  const reverse = JSON.stringify([...coordinates].reverse());
  return forward < reverse ? forward : reverse;
}

function bandForUpperBound(value, mode) {
  if (!Number.isFinite(value) || value < 0) return -1;
  const bandIndex = ISOCHRONE_BANDS.findIndex(band => value <= band.to);
  if (bandIndex < 0 || (mode === 'bicycle' && bandIndex > 2)) return -1;
  return bandIndex;
}

export function parseIso4App(data, filename) {
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Not a GeoJSON FeatureCollection');
  }

  const starts = data.features.filter(feature => feature?.geometry?.type === 'Point'
    && feature?.properties?.name === 'start point');
  if (!starts.length) throw new Error('Iso4App start point missing');

  const modes = new Set(starts.map(feature => feature.properties?.mobility));
  if (modes.size !== 1 || !['pedestrian', 'bicycle'].includes([...modes][0])) {
    throw new Error('Start point mobility must consistently be pedestrian or bicycle');
  }
  const mode = [...modes][0];
  const originsByCoordinate = new Map();
  for (const feature of starts) {
    const coordinate = feature.geometry.coordinates;
    if (!finiteCoordinate(coordinate)) throw new Error('Iso4App start point must use valid WGS84 [longitude, latitude] coordinates');
    originsByCoordinate.set(JSON.stringify(coordinate), feature);
  }

  const access = /roundabout/i.test(filename) ? 'roundabout'
    : /\bpub\b/i.test(filename) ? 'pub' : null;
  const seen = new Set();
  const features = [];
  let ignoredSegments = 0;
  for (const feature of data.features) {
    const geometry = feature?.geometry;
    const properties = feature?.properties || {};
    if (geometry?.type !== 'LineString' || properties.name !== 'segment') continue;
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2
      || geometry.coordinates.some(coordinate => !finiteCoordinate(coordinate))) {
      ignoredSegments += 1;
      continue;
    }
    const band = bandForUpperBound(Number(properties.to), mode);
    if (band < 0) {
      ignoredSegments += 1;
      continue;
    }
    const key = `${band}:${canonicalLineKey(geometry.coordinates)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({
      ...feature,
      geometry,
      properties: { ...properties, easBand: band, sourceScenario: filename, mode }
    });
  }
  if (!features.length) throw new Error('No usable street-network segments in the supported travel-time ranges');

  return Object.freeze({
    filename,
    mode,
    access,
    origins: Object.freeze([...originsByCoordinate.values()].map(feature => ({
      geometry: feature.geometry,
      properties: feature.properties
    }))),
    features: Object.freeze(features),
    ignoredSegments
  });
}

function asLonLat(points) {
  return Array.isArray(points)
    ? points.map(point => [Number(point.lon), Number(point.lat)]).filter(finiteCoordinate)
    : [];
}

const samePoint = (a, b) => Math.abs(a[0] - b[0]) <= 1e-7 && Math.abs(a[1] - b[1]) <= 1e-7;
const closedRing = ring => ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1]);
const exactClose = ring => {
  if (closedRing(ring)) ring[ring.length - 1] = [...ring[0]];
  return ring;
};

function stitchMemberRings(members) {
  const fragments = members.map(member => asLonLat(member.geometry)).filter(points => points.length >= 2);
  const rings = [];
  const incomplete = [];

  while (fragments.length) {
    let chain = fragments.shift();
    let progress = true;
    while (!closedRing(chain) && progress) {
      progress = false;
      for (let index = 0; index < fragments.length; index += 1) {
        const next = fragments[index];
        if (samePoint(chain[chain.length - 1], next[0])) {
          chain = chain.concat(next.slice(1));
        } else if (samePoint(chain[chain.length - 1], next[next.length - 1])) {
          chain = chain.concat([...next].reverse().slice(1));
        } else if (samePoint(next[next.length - 1], chain[0])) {
          chain = next.slice(0, -1).concat(chain);
        } else if (samePoint(next[0], chain[0])) {
          chain = [...next].reverse().slice(0, -1).concat(chain);
        } else {
          continue;
        }
        fragments.splice(index, 1);
        progress = true;
        break;
      }
    }
    if (closedRing(chain)) rings.push(exactClose(chain));
    else incomplete.push(chain);
  }
  return { rings, incomplete };
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(area / 2);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [x, y] = ring[current];
    const [previousX, previousY] = ring[previous];
    const crosses = (y > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function memberPolygons(members) {
  const outer = stitchMemberRings(members.filter(member => member.role === 'outer'));
  const inner = stitchMemberRings(members.filter(member => member.role === 'inner'));
  const polygons = outer.rings.map(ring => [ring]);
  const incomplete = [...outer.incomplete, ...inner.incomplete];
  for (const hole of inner.rings) {
    const containing = outer.rings
      .map((ring, index) => ({ index, area: ringArea(ring), ring }))
      .filter(item => pointInRing(hole[0], item.ring))
      .sort((a, b) => a.area - b.area)[0];
    if (!containing) incomplete.push(hole);
    else polygons[containing.index].push(hole);
  }
  return { polygons, incomplete };
}

export function assembleResidential(elements = []) {
  const features = [];
  const incomplete = [];
  let mappedWays = 0;
  let mappedRelations = 0;

  for (const element of elements) {
    if (element?.tags?.landuse !== 'residential') continue;
    if (element.type === 'way') {
      mappedWays += 1;
      const chain = asLonLat(element.geometry);
      if (closedRing(chain)) {
        exactClose(chain);
        features.push({
          type: 'Feature',
          properties: { source: `OSM way ${element.id}`, osmId: element.id, osmType: 'way' },
          geometry: { type: 'Polygon', coordinates: [chain] }
        });
      } else incomplete.push({ source: `OSM way ${element.id}`, coordinates: chain });
    } else if (element.type === 'relation') {
      mappedRelations += 1;
      const assembled = memberPolygons(element.members || []);
      for (const coordinates of assembled.polygons) {
        features.push({
          type: 'Feature',
          properties: { source: `OSM relation ${element.id}`, osmId: element.id, osmType: 'relation' },
          geometry: { type: 'Polygon', coordinates }
        });
      }
      for (const coordinates of assembled.incomplete) {
        if (coordinates.length >= 2) incomplete.push({ source: `OSM relation ${element.id}`, coordinates });
      }
      if (!assembled.polygons.length && !assembled.incomplete.length) {
        incomplete.push({ source: `OSM relation ${element.id}`, coordinates: [] });
      }
    }
  }

  return Object.freeze({
    features: Object.freeze(features),
    incomplete: Object.freeze(incomplete),
    mappedWays,
    mappedRelations,
    coverage: 'unknown'
  });
}

export function parseNamedPois(elements = []) {
  const seen = new Set();
  const points = [];
  for (const element of elements) {
    const tags = element.tags || {};
    const name = String(tags.name || '').trim();
    const latitude = Number(element.lat ?? element.center?.lat);
    const longitude = Number(element.lon ?? element.center?.lon);
    const category = tags.amenity === 'school' ? 'School'
      : tags.amenity === 'college' ? 'College'
        : tags.amenity === 'kindergarten' ? 'Nursery'
          : tags.shop === 'supermarket' ? 'Supermarket' : 'Named OSM feature';
    const relevant = ['school', 'college', 'kindergarten'].includes(tags.amenity)
      || tags.shop === 'supermarket'
      || /tesco|studio|shopping park|high street|employment|industrial estate|business park/i.test(name);
    if (!relevant || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const key = `${name}:${latitude.toFixed(7)}:${longitude.toFixed(7)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(Object.freeze({ name, latitude, longitude, category, source: element.type && element.id ? `OSM ${element.type} ${element.id}` : 'OSM' }));
  }
  return Object.freeze(points);
}
