const CONTROLLED_BUS_COLOURS = Object.freeze(['#7f2a90', '#00a651', '#00a9e0', '#f58220']);

export const BASEMAP_APPEARANCE_DEFAULT = Object.freeze({ colour: 'colour', emphasis: 'faded' });

export function normaliseBasemapAppearance(value = {}) {
  return Object.freeze({
    colour: value.colour === 'greyscale' ? 'greyscale' : 'colour',
    emphasis: value.emphasis === 'normal' ? 'normal' : 'faded'
  });
}

export function basemapOpacity(appearance = BASEMAP_APPEARANCE_DEFAULT) {
  return normaliseBasemapAppearance(appearance).emphasis === 'faded' ? .8 : 1;
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
  const byReference = new Map(normalised.flatMap(group => group.routeRefs.map(ref => [ref, group])));
  return features.map(feature => {
    if (feature.properties?.class !== 'bus-route') return feature;
    const reference = routeReference(feature);
    const group = byReference.get(reference);
    if (!group) { const identity = reference || 'UNREFERENCED'; return { ...feature, properties: { ...feature.properties, presentationBusGroup: `ungrouped-${identity}`, presentationBusLabel: `BUS ROUTE ${identity}`, presentationBusRouteRefs: reference ? [reference] : [], colour: '#ed1c24' } }; }
    return { ...feature, properties: { ...feature.properties, presentationBusGroup: group.id, presentationBusLabel: group.label, presentationBusRouteRefs: [...group.routeRefs], colour: group.colour } };
  });
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
