import { generalisePresentationFeatures } from './cartography.js';
import { basemapProvider } from './basemap-compositor.js';
import { issuedExtentGeoJson } from './scale-engine.js';

const SOURCE_STYLES = Object.freeze({
  'context-area': { color: '#b6b6a9', weight: .7, opacity: .55, fillColor: '#e8e8df', fillOpacity: .32 },
  'context-road-major': { color: '#a8a8a0', weight: 2, opacity: .75 },
  'context-road-minor': { color: '#c9c9c2', weight: 1.2, opacity: .7 },
  'context-place': { color: '#777', weight: 1, opacity: .6 },
  'main-road': { color: '#ed1c24', weight: 2, opacity: .8 }, motorway: { color: '#ec1ce8', weight: 3, opacity: .85 },
  railway: { color: '#666', weight: 2.4, dashArray: '7 3' }, waterway: { color: '#00a9e0', weight: 2.6 }, 'waterway-review': { color: '#00a9e0', weight: 1.8, dashArray: '3 4' },
  'cycle-network-primary': { color: '#00a651', weight: 3 }, 'cycle-network-local': { color: '#00a651', weight: 2.5, dashArray: '7 4' },
  'strategic-cycle': { color: '#00a651', weight: 2.8 }, 'cycle-route': { color: '#00a651', weight: 2.5, dashArray: '7 4' }, 'cycle-review': { color: '#7f2a90', weight: 1.8, dashArray: '3 4' },
  'bus-route': { color: '#7f2a90', weight: 3.4 }, 'bus-route-review': { color: '#ed1c24', weight: 2, dashArray: '3 4' },
  'community-candidate': { color: '#666', weight: 1.5, fillColor: '#999', fillOpacity: .12 }
});

const SOURCE_GROUPS = Object.freeze({
  Roads: new Set(['context-road-major', 'context-road-minor', 'main-road', 'motorway']),
  Cycle: new Set(['cycle-network-primary', 'cycle-network-local', 'strategic-cycle', 'cycle-route', 'cycle-review']),
  Rail: new Set(['railway', 'station-national-rail', 'station-overground', 'station-underground', 'station-dlr', 'station-tram']),
  Bus: new Set(['bus-route', 'bus-route-review']),
  Water: new Set(['waterway', 'waterway-review']),
  Community: new Set(['community-candidate'])
});

function groupForFeature(feature) {
  const className = feature.properties?.class;
  return Object.keys(SOURCE_GROUPS).find(name => SOURCE_GROUPS[name].has(className)) || '';
}

function sourceStyle(feature) {
  const className = feature.properties?.class;
  if (className === 'railway') {
    const railMode = feature.properties?.railMode || '';
    const colour = { 'London Overground': '#f58220', 'London Underground': '#0057e7', DLR: '#00a4a7', 'Tram/light rail': '#5a8f29', 'National Rail': '#666' }[railMode] || '#666';
    return { ...(SOURCE_STYLES.railway || {}), color: colour, ...(railMode ? { dashArray: '' } : {}) };
  }
  return { ...(SOURCE_STYLES[className] || { color: '#777', weight: 1.5 }), ...(feature.properties?.colour ? { color: feature.properties.colour } : {}) };
}

function defaultGroups(modeId) {
  if (modeId === 'regional-plan') return new Set(['Roads', 'Cycle', 'Rail', 'Water']);
  if (modeId === 'local-context') return new Set(['Cycle', 'Rail', 'Bus', 'Water', 'Community']);
  return new Set();
}

function collectSiteGeometry(editableGroup) {
  const geometries = [];
  editableGroup.eachLayer(layer => { if (layer._dgKind === 'site') geometries.push(layer.toGeoJSON().geometry); });
  if (!geometries.length) return null;
  if (geometries.length === 1) return geometries[0];
  const polygons = geometries.flatMap(geometry => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);
  return { type: 'MultiPolygon', coordinates: polygons };
}

function pointIcon(className = 'source') {
  return L.divIcon({ className: `dg-map-marker ${className}`, html: '<span></span>', iconSize: [14, 14], iconAnchor: [7, 7] });
}

export function createMapController({ onSiteChanged, onSiteDeleted, onOverlayCreated, onOverlayChanged, onOverlayDeleted, onDrawingStateChanged = () => {}, onMapCenterChanged = () => {} }) {
  const map = L.map('editingMap', { zoomControl: true }).setView([52.2, -1.4], 6);
  const provider = basemapProvider();
  const base = L.tileLayer(provider.urlTemplate, { minZoom: provider.minZoom, maxZoom: provider.maxZoom, crossOrigin: true, opacity: 1, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const editable = L.featureGroup().addTo(map);
  const sourceGroups = Object.fromEntries(Object.keys(SOURCE_GROUPS).map(name => [name, L.geoJSON(null, {
    style: sourceStyle,
    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: pointIcon(feature.properties?.class || 'source') }),
    onEachFeature: (feature, layer) => { const label = feature.properties?.name || feature.properties?.routeLabel || feature.properties?.class; if (label) layer.bindTooltip(label); }
  })]));
  const issuedExtent = L.geoJSON(null, { style: { className: 'issued-drawing-extent', color: '#082c66', weight: 2, opacity: .85, fill: false, dashArray: '9 7', interactive: false } }).addTo(map);
  const overlayControls = {
    Roads: sourceGroups.Roads, Cycle: sourceGroups.Cycle, Rail: sourceGroups.Rail, Bus: sourceGroups.Bus,
    Water: sourceGroups.Water, 'Community candidates': sourceGroups.Community,
    'ISSUED DRAWING EXTENT': issuedExtent, 'Editable geometry': editable
  };
  L.control.layers({ OpenStreetMap: base }, overlayControls, { collapsed: true }).addTo(map);
  map.addControl(new L.Control.Draw({ draw: false, edit: { featureGroup: editable, remove: true } }));
  L.control.scale({ imperial: false }).addTo(map);

  let pending = null;
  let activeHandler = null;
  let currentIssuedExtent = null;

  function finishDrawingState() {
    const completed = pending;
    pending = null;
    activeHandler = null;
    if (map.dragging) map.dragging.enable();
    onDrawingStateChanged(false, completed);
  }

  function cancelDrawing() {
    const handler = activeHandler;
    const cancelled = pending;
    activeHandler = null;
    pending = null;
    if (handler?.enabled()) handler.disable();
    if (map.dragging) map.dragging.enable();
    onDrawingStateChanged(false, cancelled);
  }

  function startDrawing(handler, nextPending) {
    cancelDrawing();
    pending = nextPending;
    activeHandler = handler;
    const routeNavigation = nextPending.kind === 'overlay' && ['route-to-site', 'route-from-site'].includes(nextPending.metadata?.className);
    if (map.dragging) routeNavigation ? map.dragging.enable() : map.dragging.disable();
    handler.enable();
    onDrawingStateChanged(true, pending);
  }

  map.on(L.Draw.Event.CREATED, event => {
    if (!pending) return;
    if (pending.kind === 'site') {
      [...editable.getLayers()].filter(layer => layer._dgKind === 'site').forEach(layer => editable.removeLayer(layer));
      event.layer._dgKind = 'site';
      if (event.layer.setStyle) event.layer.setStyle({ color: '#ed1c24', weight: 4, fillColor: '#ed1c24', fillOpacity: .12 });
      editable.addLayer(event.layer);
      onSiteChanged(event.layer.toGeoJSON().geometry);
    } else {
      const created = onOverlayCreated(event.layer.toGeoJSON(), pending.metadata);
      event.layer._dgKind = 'overlay'; event.layer._dgOverlayId = created.id;
      if (event.layer.setStyle) event.layer.setStyle({ color: created.properties.colour, weight: 4, fillColor: created.properties.colour, fillOpacity: .25 });
      editable.addLayer(event.layer);
    }
    finishDrawingState();
  });
  map.on(L.Draw.Event.DRAWSTOP, () => finishDrawingState());
  map.on('draw:canceled', () => finishDrawingState());
  map.on(L.Draw.Event.EDITED, event => {
    let siteTouched = false;
    event.layers.eachLayer(layer => {
      if (layer._dgKind === 'site') siteTouched = true;
      if (layer._dgKind === 'overlay') onOverlayChanged(layer._dgOverlayId, layer.toGeoJSON().geometry);
    });
    if (siteTouched) onSiteChanged(collectSiteGeometry(editable));
  });
  map.on(L.Draw.Event.DELETED, event => {
    let siteDeleted = false;
    event.layers.eachLayer(layer => {
      if (layer._dgKind === 'site') siteDeleted = true;
      if (layer._dgKind === 'overlay') onOverlayDeleted(layer._dgOverlayId);
    });
    if (siteDeleted && !collectSiteGeometry(editable)) onSiteDeleted();
  });
  map.on('moveend', () => {
    const center = map.getCenter();
    onMapCenterChanged({ lat: center.lat, lon: center.lng });
  });

  function addGeoJsonToEditable(feature, kind, id = '') {
    const group = L.geoJSON(feature, {
      style: () => kind === 'site'
        ? { color: '#ed1c24', weight: 4, fillColor: '#ed1c24', fillOpacity: .12 }
        : { color: feature.properties?.colour || '#111', weight: 4, fillColor: feature.properties?.colour || '#111', fillOpacity: .25 },
      pointToLayer: (item, latlng) => L.marker(latlng, { icon: pointIcon(kind) })
    });
    group.eachLayer(layer => { layer._dgKind = kind; if (id) layer._dgOverlayId = id; editable.addLayer(layer); });
  }

  return {
    map,
    setView(lat, lon, zoom = 16) { map.setView([lat, lon], zoom); },
    invalidate() { map.invalidateSize(); },
    setSite(geometry) {
      cancelDrawing();
      [...editable.getLayers()].filter(layer => layer._dgKind === 'site').forEach(layer => editable.removeLayer(layer));
      if (geometry) addGeoJsonToEditable({ type: 'Feature', properties: {}, geometry }, 'site');
      const bounds = editable.getBounds(); if (geometry && bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
    },
    setOverlays(overlays) {
      [...editable.getLayers()].filter(layer => layer._dgKind === 'overlay').forEach(layer => editable.removeLayer(layer));
      overlays.forEach(overlay => { if (overlay.properties.visible !== false) addGeoJsonToEditable(overlay, 'overlay', overlay.id); });
    },
    setSource(features, modeId = 'regional-plan') {
      Object.values(sourceGroups).forEach(group => { group.clearLayers(); map.removeLayer(group); });
      generalisePresentationFeatures(features).forEach(feature => {
        const groupName = groupForFeature(feature);
        if (groupName) sourceGroups[groupName].addData(feature);
      });
      defaultGroups(modeId).forEach(name => sourceGroups[name].addTo(map));
    },
    setIssuedDrawingExtent(centerBng, modeId) {
      const feature = issuedExtentGeoJson(centerBng, modeId);
      currentIssuedExtent = feature;
      issuedExtent.clearLayers(); issuedExtent.addData(feature);
      issuedExtent.bindTooltip(feature.properties.label, { sticky: true });
      return feature;
    },
    startSiteDrawing() { startDrawing(new L.Draw.Polygon(map, { allowIntersection: false, shapeOptions: { color: '#ed1c24', weight: 4 } }), { kind: 'site' }); },
    startOverlayDrawing(type, metadata) {
      const handlers = {
        Point: () => new L.Draw.Marker(map, { icon: pointIcon('overlay') }),
        LineString: () => new L.Draw.Polyline(map, { shapeOptions: { color: metadata.colour, weight: 4 } }),
        Polygon: () => new L.Draw.Polygon(map, { allowIntersection: false, shapeOptions: { color: metadata.colour, weight: 4 } })
      };
      if (!handlers[type]) throw new Error(`Unsupported drawing geometry: ${type}.`);
      startDrawing(handlers[type](), { kind: 'overlay', metadata });
    },
    cancelDrawing,
    isDrawingActive() { return Boolean(activeHandler); },
    navigationEnabled() { return Boolean(map.dragging?.enabled()); },
    activeVertexCount() { return activeHandler?._markers?.length || 0; },
    mapCenter() { const center = map.getCenter(); return { lat: center.lat, lon: center.lng }; },
    issuedExtent() { return currentIssuedExtent ? structuredClone(currentIssuedExtent) : null; },
    clearSite() {
      cancelDrawing();
      [...editable.getLayers()].filter(layer => layer._dgKind === 'site').forEach(layer => editable.removeLayer(layer));
    }
  };
}
