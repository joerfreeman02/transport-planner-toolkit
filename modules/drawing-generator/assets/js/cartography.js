const LINE_CLASSES = new Set([
  'context-road-major', 'context-road-minor', 'main-road', 'motorway', 'railway', 'waterway',
  'cycle-network-primary', 'cycle-network-local', 'cycle-route', 'strategic-cycle', 'bus-route',
  'route-to-site', 'route-from-site', 'custom-line'
]);

const DRAW_ORDER = Object.freeze({
  'context-area': 10,
  'context-road-minor': 20,
  'context-road-major': 30,
  waterway: 40,
  railway: 50,
  'cycle-route': 60,
  'cycle-network-local': 61,
  'cycle-network-primary': 62,
  'strategic-cycle': 63,
  'main-road': 70,
  motorway: 75,
  'bus-route': 80,
  'route-to-site': 85,
  'route-from-site': 85,
  'context-place': 90,
  'station-national-rail': 91,
  'station-overground': 92,
  'station-underground': 93,
  'station-dlr': 94,
  'station-tram': 95,
  community: 96,
  'custom-point': 96,
  'custom-area': 97,
  site: 100
});

const LABEL_PRIORITY = Object.freeze({
  site: 100,
  motorway: 95,
  'main-road': 92,
  'station-national-rail': 90,
  'station-overground': 90,
  'station-underground': 90,
  'station-dlr': 90,
  'station-tram': 90,
  'cycle-network-primary': 80,
  'strategic-cycle': 80,
  'cycle-network-local': 72,
  'route-to-site': 70,
  'route-from-site': 70,
  'bus-route': 66,
  railway: 60,
  'context-place': 50,
  community: 45,
  'custom-point': 45,
  'custom-line': 40,
  'custom-area': 40
});

const normalise = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

function linesFromGeometry(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function coordinateKey(coordinate) {
  return `${Number(coordinate[0]).toFixed(5)},${Number(coordinate[1]).toFixed(5)}`;
}

function lineIdentity(feature) {
  const properties = feature.properties || {};
  const identity = properties.ref || properties.name || properties.routeLabel || properties.network || properties.railType || '';
  return `${properties.class}|${normalise(identity)}`;
}

function connectedComponents(records) {
  const parent = records.map((_, index) => index);
  const find = index => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) { const next = parent[index]; parent[index] = root; index = next; }
    return root;
  };
  const union = (left, right) => {
    const a = find(left), b = find(right);
    if (a !== b) parent[b] = a;
  };
  const endpoints = new Map();
  const sources = new Map();
  records.forEach((record, index) => {
    const keys = [coordinateKey(record.line[0]), coordinateKey(record.line.at(-1))];
    keys.forEach(key => {
      if (endpoints.has(key)) union(index, endpoints.get(key));
      else endpoints.set(key, index);
    });
    if (record.fromMultiLine && record.sourceId) {
      if (sources.has(record.sourceId)) union(index, sources.get(record.sourceId));
      else sources.set(record.sourceId, index);
    }
  });
  const components = new Map();
  records.forEach((record, index) => {
    const root = find(index);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(record);
  });
  return [...components.values()];
}

function generaliseLines(features) {
  const buckets = new Map();
  const retained = [];
  features.forEach((feature, featureIndex) => {
    const className = feature.properties?.class;
    const lines = LINE_CLASSES.has(className) ? linesFromGeometry(feature.geometry) : [];
    if (!lines.length) return retained.push(feature);
    const key = lineIdentity(feature);
    if (!buckets.has(key)) buckets.set(key, []);
    lines.forEach(line => buckets.get(key).push({
      feature,
      featureIndex,
      line,
      sourceId: feature.properties?.sourceId || feature.id || '',
      fromMultiLine: feature.geometry.type === 'MultiLineString'
    }));
  });
  buckets.forEach(records => connectedComponents(records).forEach((component, componentIndex) => {
    const exemplar = component[0].feature;
    const lines = component.map(record => record.line);
    const sourceIds = [...new Set(component.map(record => record.sourceId).filter(Boolean))];
    retained.push({
      ...exemplar,
      id: `${exemplar.id || exemplar.properties?.sourceId || 'presentation'}:${componentIndex}`,
      properties: { ...exemplar.properties, sourceIds, presentationSegmentCount: lines.length },
      geometry: lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines }
    });
  }));
  return retained;
}

function stationRank(className) {
  return ['station-underground', 'station-overground', 'station-dlr', 'station-tram', 'station-national-rail'].indexOf(className);
}

function dedupeStations(features) {
  const seen = new Map();
  const result = [];
  features.forEach(feature => {
    const className = feature.properties?.class || '';
    if (!className.startsWith('station-') || feature.geometry?.type !== 'Point') return result.push(feature);
    const label = normalise(feature.properties?.name || feature.properties?.ref);
    if (!label) return result.push(feature);
    const [lon, lat] = feature.geometry.coordinates;
    const key = `${label}|${Number(lon).toFixed(4)},${Number(lat).toFixed(4)}`;
    if (!seen.has(key)) {
      seen.set(key, result.length);
      result.push(feature);
      return;
    }
    const existingIndex = seen.get(key);
    if (stationRank(className) < stationRank(result[existingIndex].properties?.class || '')) result[existingIndex] = feature;
  });
  return result;
}

export function generalisePresentationFeatures(features) {
  return dedupeStations(generaliseLines(features)).sort((left, right) => {
    const leftOrder = DRAW_ORDER[left.properties?.class] ?? 65;
    const rightOrder = DRAW_ORDER[right.properties?.class] ?? 65;
    return leftOrder - rightOrder || String(left.id || '').localeCompare(String(right.id || ''));
  });
}

function projectedLines(feature, project) {
  return linesFromGeometry(feature.geometry).map(line => line.map(project)).filter(line => line.length >= 2);
}

function lineLength(line) {
  let length = 0;
  for (let index = 1; index < line.length; index += 1) length += Math.hypot(line[index][0] - line[index - 1][0], line[index][1] - line[index - 1][1]);
  return length;
}

function lineAnchor(feature, project) {
  const lines = projectedLines(feature, project).map(line => ({ line, length: lineLength(line) })).sort((a, b) => b.length - a.length);
  if (!lines.length) return null;
  const selected = lines[0];
  const target = selected.length / 2;
  let travelled = 0;
  for (let index = 1; index < selected.line.length; index += 1) {
    const start = selected.line[index - 1], end = selected.line[index];
    const segment = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (travelled + segment >= target && segment) {
      const ratio = (target - travelled) / segment;
      return { x: start[0] + (end[0] - start[0]) * ratio, y: start[1] + (end[1] - start[1]) * ratio, length: selected.length };
    }
    travelled += segment;
  }
  const fallback = selected.line[Math.floor(selected.line.length / 2)];
  return { x: fallback[0], y: fallback[1], length: selected.length };
}

function polygonAnchor(geometry, project) {
  const ring = geometry?.type === 'Polygon' ? geometry.coordinates[0] : geometry?.type === 'MultiPolygon' ? geometry.coordinates[0]?.[0] : null;
  if (!ring?.length) return null;
  const points = ring.map(project);
  return { x: points.reduce((sum, point) => sum + point[0], 0) / points.length, y: points.reduce((sum, point) => sum + point[1], 0) / points.length, length: 0 };
}

function labelForFeature(feature) {
  const properties = feature.properties || {};
  const className = properties.class || '';
  if (className.startsWith('context-road')) return '';
  if (className === 'context-place') return properties.name || '';
  if (className.startsWith('station-')) return properties.name || properties.ref || '';
  if (className === 'railway') return properties.name || properties.ref || '';
  if (className === 'site') return properties.label || 'SITE';
  return properties.label || properties.routeLabel || properties.ref || properties.name || '';
}

function labelAnchor(feature, project) {
  if (feature.geometry?.type === 'Point') {
    const [x, y] = project(feature.geometry.coordinates);
    return { x: x + 7, y: y - 6, length: 0 };
  }
  if (feature.geometry?.type?.includes('LineString')) return lineAnchor(feature, project);
  return polygonAnchor(feature.geometry, project);
}

function boxesOverlap(left, right) {
  return left.x1 < right.x2 && left.x2 > right.x1 && left.y1 < right.y2 && left.y2 > right.y1;
}

function maximumForClass(className) {
  if (className === 'main-road' || className === 'motorway' || className.startsWith('cycle-network')) return 2;
  return 1;
}

export function createLabelPlacements(features, project, modeId, viewWidth, viewHeight) {
  const candidates = features.flatMap((feature, index) => {
    const className = feature.properties?.class || '';
    const priority = LABEL_PRIORITY[className];
    const label = labelForFeature(feature);
    const anchor = label && priority ? labelAnchor(feature, project) : null;
    return anchor ? [{ feature, index, className, label, key: `${className}|${normalise(label)}`, priority, ...anchor }] : [];
  }).sort((left, right) => right.priority - left.priority || right.length - left.length || left.label.localeCompare(right.label) || left.index - right.index);

  const limit = modeId.startsWith('regional-') ? 30 : 42;
  const counts = new Map();
  const boxes = [];
  const placements = [];
  for (const candidate of candidates) {
    if (placements.length >= limit) break;
    const count = counts.get(candidate.key) || 0;
    if (count >= maximumForClass(candidate.className)) continue;
    const width = Math.min(150, Math.max(22, candidate.label.length * 4.3 + 8));
    const box = { x1: candidate.x - 4, y1: candidate.y - 11, x2: candidate.x + width, y2: candidate.y + 4 };
    if (box.x1 < 7 || box.y1 < 7 || box.x2 > viewWidth - 7 || box.y2 > viewHeight - 7) continue;
    if (boxes.some(existing => boxesOverlap(box, existing))) continue;
    boxes.push(box);
    counts.set(candidate.key, count + 1);
    placements.push({ ...candidate, box });
  }
  return placements;
}
