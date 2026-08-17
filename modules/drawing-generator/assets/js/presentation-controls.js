const CONTROLLED_BUS_COLOURS = Object.freeze(['#ed1c24', '#0057e7', '#7f2a90', '#ec1ce8']);
export const BUS_COLOUR_OPTIONS = Object.freeze([
  Object.freeze({ value: '#ed1c24', label: 'Red' }),
  Object.freeze({ value: '#0057e7', label: 'Blue' }),
  Object.freeze({ value: '#7f2a90', label: 'Purple' }),
  Object.freeze({ value: '#ec1ce8', label: 'Magenta / Pink' })
]);

export const BASEMAP_APPEARANCE_DEFAULT = Object.freeze({ colour: 'colour', emphasis: 'faded' });

export function normaliseBasemapAppearance(value = {}) {
  return Object.freeze({
    colour: value.colour === 'greyscale' ? 'greyscale' : 'colour',
    emphasis: value.emphasis === 'normal' ? 'normal' : 'faded'
  });
}

export function basemapOpacity(appearance = BASEMAP_APPEARANCE_DEFAULT) {
  return normaliseBasemapAppearance(appearance).emphasis === 'faded' ? .6 : 1;
}

function routeReference(feature) {
  return String(feature.properties?.ref || feature.properties?.routeGroup || feature.properties?.routeLabel || '').trim();
}

export function normaliseBusGroups(groups = []) {
  const occupied = new Set();
  return groups.flatMap((group, index) => {
    const routeRefs = [...new Set((group.routeRefs || []).map(value => String(value).trim()).filter(Boolean))].filter(ref => !occupied.has(ref));
    routeRefs.forEach(ref => occupied.add(ref));
    if (!routeRefs.length) return [];
    const label = String(group.label || `BUS ROUTES ${routeRefs.join(', ')}`).trim();
    return [{ id: String(group.id || `bus-group-${index + 1}`), label, routeRefs, colour: CONTROLLED_BUS_COLOURS.includes(group.colour) ? group.colour : CONTROLLED_BUS_COLOURS[index % CONTROLLED_BUS_COLOURS.length] }];
  });
}

export function applyBusPresentationGroups(features = [], groups = []) {
  const normalised = normaliseBusGroups(groups);
  const offsets = normalised.map((group, index) => ({ ...group, presentationOffset: normalised.length === 1 ? 0 : (index - (normalised.length - 1) / 2) * (normalised.length === 2 ? 3 : 2.5) }));
  const byReference = new Map(offsets.flatMap(group => group.routeRefs.map(ref => [ref, group])));
  return features.map(feature => {
    if (feature.properties?.class !== 'bus-route') return feature;
    const reference = routeReference(feature);
    const group = byReference.get(reference);
    if (!group) {
      const identity = reference || 'UNREFERENCED';
      return {
        ...feature,
        properties: {
          ...feature.properties,
          presentationBusGroup: `ungrouped-${identity}`,
          presentationBusLabel: `BUS ROUTE ${identity}`,
          presentationBusRouteRefs: reference ? [reference] : [],
          // Preserve the deterministic current-source route colour. This keeps
          // separate services visually distinguishable at real junctions while
          // leaving planner-created grouping as presentation-only.
          colour: feature.properties?.colour || '#ed1c24'
        }
      };
    }
    return { ...feature, properties: { ...feature.properties, presentationBusGroup: group.id, presentationBusLabel: group.label, presentationBusRouteRefs: [...group.routeRefs], presentationBusOffset: group.presentationOffset, colour: group.colour } };
  });
}

function routeLines(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function localMetres([lon, lat], referenceLatitude) {
  const radians = referenceLatitude * Math.PI / 180;
  return [lon * 111320 * Math.cos(radians), lat * 110540];
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy));
}

function projectedRoute(feature, referenceLatitude) {
  return routeLines(feature.geometry).map(line => line.map(point => localMetres(point, referenceLatitude))).filter(line => line.length >= 2);
}

function sampledPoints(lines, limit = 36) {
  const vertices = lines.flat();
  if (vertices.length <= limit) return vertices;
  const result = [];
  for (let index = 0; index < limit; index += 1) result.push(vertices[Math.round(index * (vertices.length - 1) / (limit - 1))]);
  return result;
}

function proximityCoverage(points, targetLines, thresholdMetres) {
  if (!points.length || !targetLines.length) return 0;
  let near = 0;
  points.forEach(point => {
    let distance = Infinity;
    targetLines.forEach(line => {
      for (let index = 1; index < line.length; index += 1) distance = Math.min(distance, pointSegmentDistance(point, line[index - 1], line[index]));
    });
    if (distance <= thresholdMetres) near += 1;
  });
  return near / points.length;
}

export function suggestBusPresentationGroups(features = [], existingGroups = [], thresholdMetres = 28) {
  const occupied = new Set(normaliseBusGroups(existingGroups).flatMap(group => group.routeRefs));
  const byRef = new Map();
  features.filter(feature => feature.properties?.class === 'bus-route').forEach(feature => {
    const ref = routeReference(feature);
    if (!ref || occupied.has(ref) || !routeLines(feature.geometry).length) return;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref).push(feature);
  });
  const records = [...byRef.entries()].map(([ref, routeFeatures]) => {
    const coordinates = routeFeatures.flatMap(feature => routeLines(feature.geometry)).flat();
    const referenceLatitude = coordinates.length ? coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length : 51.5;
    const lines = routeFeatures.flatMap(feature => projectedRoute(feature, referenceLatitude));
    return { ref, lines, samples: sampledPoints(lines) };
  });
  const adjacency = new Map(records.map(record => [record.ref, new Set()]));
  for (let left = 0; left < records.length; left += 1) for (let right = left + 1; right < records.length; right += 1) {
    const a = records[left], b = records[right];
    const ab = proximityCoverage(a.samples, b.lines, thresholdMetres);
    const ba = proximityCoverage(b.samples, a.lines, thresholdMetres);
    const average = (ab + ba) / 2;
    if (average >= .66 && Math.min(ab, ba) >= .42) {
      adjacency.get(a.ref).add(b.ref);
      adjacency.get(b.ref).add(a.ref);
    }
  }
  const visited = new Set();
  const suggestions = [];
  records.forEach(record => {
    if (visited.has(record.ref) || !adjacency.get(record.ref).size) return;
    const queue = [record.ref], refs = [];
    visited.add(record.ref);
    while (queue.length) {
      const current = queue.shift(); refs.push(current);
      adjacency.get(current).forEach(next => { if (!visited.has(next)) { visited.add(next); queue.push(next); } });
    }
    if (refs.length >= 2) suggestions.push({
      routeRefs: refs.sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true })),
      reason: `Strong shared current mapped corridor (within about ${thresholdMetres} m).`
    });
  });
  return suggestions.sort((left, right) => right.routeRefs.length - left.routeRefs.length || left.routeRefs[0].localeCompare(right.routeRefs[0], 'en-GB', { numeric: true }));
}

export function busRouteReferences(features = []) {
  return [...new Set(features.filter(feature => feature.properties?.class === 'bus-route').map(routeReference).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true }));
}

export function nextBusGroupId(groups = []) {
  const used = new Set(normaliseBusGroups(groups).map(group => group.id));
  let index = 1;
  while (used.has(`bus-group-${index}`)) index += 1;
  return `bus-group-${index}`;
}
