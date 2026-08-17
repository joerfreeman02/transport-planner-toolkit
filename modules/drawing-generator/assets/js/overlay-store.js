import { CONTROLLED_COLOURS } from './config.js';
import { validateGeometry } from './geometry.js';

export const OVERLAY_CLASSES = Object.freeze({
  'main-road': { label: 'Main road / A road', geometry: ['LineString', 'MultiLineString'], colour: '#ed1c24' },
  motorway: { label: 'Motorway', geometry: ['LineString', 'MultiLineString'], colour: '#ec1ce8' },
  'cycle-network-primary': { label: 'National / regional cycle network', geometry: ['LineString', 'MultiLineString'], colour: '#00a651' },
  'cycle-network-local': { label: 'Local cycle network', geometry: ['LineString', 'MultiLineString'], colour: '#00a651' },
  'strategic-cycle': { label: 'Strategic cycle route', geometry: ['LineString', 'MultiLineString'], colour: '#00a651' },
  waterway: { label: 'Navigable waterway', geometry: ['LineString', 'MultiLineString'], colour: '#0057e7' },
  railway: { label: 'Railway', geometry: ['LineString', 'MultiLineString'], colour: '#666666' },
  'station-national-rail': { label: 'National Rail station', geometry: ['Point'], colour: '#888888' },
  'station-overground': { label: 'London Overground station', geometry: ['Point'], colour: '#f58220' },
  'station-underground': { label: 'London Underground station', geometry: ['Point'], colour: '#f4e51c' },
  'station-dlr': { label: 'DLR station', geometry: ['Point'], colour: '#00a4a7' },
  'station-tram': { label: 'Tram / light rail stop', geometry: ['Point'], colour: '#5a8f29' },
  'route-to-site': { label: 'Route to site', geometry: ['LineString', 'MultiLineString'], colour: '#ed1c24' },
  'route-from-site': { label: 'Route from site', geometry: ['LineString', 'MultiLineString'], colour: '#0057e7' },
  'bus-route': { label: 'Bus route', geometry: ['LineString', 'MultiLineString'], colour: '#7f2a90' },
  'cycle-route': { label: 'Cycle route', geometry: ['LineString', 'MultiLineString'], colour: '#00a651' },
  community: { label: 'Community consideration area', geometry: ['Polygon', 'MultiPolygon'], colour: '#666666' },
  'custom-line': { label: 'Reviewed line', geometry: ['LineString', 'MultiLineString'], colour: '#111111' },
  'custom-point': { label: 'Reviewed point', geometry: ['Point'], colour: '#666666' },
  'custom-area': { label: 'Reviewed area', geometry: ['Polygon', 'MultiPolygon'], colour: '#00a651' }
});

function id() {
  return globalThis.crypto?.randomUUID?.() || `overlay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normaliseOverlay(feature, metadata = {}) {
  const geometry = validateGeometry(feature?.geometry || feature);
  const className = metadata.className || feature?.properties?.class || feature?.properties?.className || defaultClass(geometry.type);
  const definition = OVERLAY_CLASSES[className];
  if (!definition) throw new Error(`Unsupported overlay class: ${className}.`);
  if (!definition.geometry.includes(geometry.type)) throw new Error(`${definition.label} does not support ${geometry.type} geometry.`);
  const colour = metadata.colour || feature?.properties?.colour || definition.colour;
  if (!CONTROLLED_COLOURS.includes(colour)) throw new Error('Overlay colour is outside the controlled drawing palette.');
  return {
    id: metadata.id || feature?.properties?.id || id(),
    type: 'Feature',
    properties: {
      class: className, label: String(metadata.label ?? feature?.properties?.label ?? feature?.properties?.name ?? '').trim(),
      layerName: String(metadata.layerName ?? feature?.properties?.layerName ?? definition.label).trim() || definition.label,
      colour, visible: metadata.visible ?? feature?.properties?.visible ?? true,
      source: metadata.source || feature?.properties?.source || 'manual/reviewed user input',
      route: structuredClone(metadata.route ?? feature?.properties?.route ?? null),
      community: structuredClone(metadata.community ?? feature?.properties?.community ?? null)
    },
    geometry
  };
}

function defaultClass(type) {
  if (type === 'Point') return 'custom-point';
  if (type.includes('Line')) return 'custom-line';
  return 'custom-area';
}

export function createOverlayStore(initial = []) {
  const records = new Map();
  const migrationWarnings = [];
  (Array.isArray(initial) ? initial : []).forEach((item, index) => {
    try {
      const record = normaliseOverlay(item);
      records.set(record.id, record);
    } catch (error) {
      migrationWarnings.push(Object.freeze({
        index,
        id: String(item?.id || item?.properties?.id || ''),
        className: String(item?.properties?.class || item?.properties?.className || ''),
        reason: String(error?.message || 'Saved item is incompatible with the current drawing rules.')
      }));
    }
  });
  return {
    migrationWarnings: () => migrationWarnings.map(item => ({ ...item })),
    list: () => [...records.values()].map(item => structuredClone(item)),
    get: overlayId => records.has(overlayId) ? structuredClone(records.get(overlayId)) : null,
    add(feature, metadata) { const record = normaliseOverlay(feature, metadata); records.set(record.id, record); return structuredClone(record); },
    update(overlayId, patch = {}) {
      const current = records.get(overlayId); if (!current) throw new Error('Overlay not found.');
      const feature = { ...current, properties: { ...current.properties, ...(patch.properties || patch) }, geometry: patch.geometry || current.geometry };
      const next = normaliseOverlay(feature, { id: overlayId, className: feature.properties.class, label: feature.properties.label, layerName: feature.properties.layerName, colour: feature.properties.colour, visible: feature.properties.visible, source: feature.properties.source, route: feature.properties.route, community: feature.properties.community });
      records.set(overlayId, next); return structuredClone(next);
    },
    remove(overlayId) { return records.delete(overlayId); },
    clear() { records.clear(); },
    exportGeoJson() { return { type: 'FeatureCollection', features: [...records.values()].map(item => ({ type: 'Feature', properties: { id: item.id, ...item.properties }, geometry: item.geometry })) }; }
  };
}
