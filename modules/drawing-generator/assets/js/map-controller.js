const SOURCE_STYLES = Object.freeze({
  'main-road': { color: '#ed1c24', weight: 2, opacity: .8 }, motorway: { color: '#ec1ce8', weight: 3, opacity: .85 },
  railway: { color: '#777', weight: 2, dashArray: '5 3' }, waterway: { color: '#0047bb', weight: 2 },
  'strategic-cycle': { color: '#f0a500', weight: 2 }, 'cycle-route': { color: '#0057e7', weight: 2 },
  'bus-route': { color: '#7f2a90', weight: 3 }
});

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

export function createMapController({ onSiteChanged, onSiteDeleted, onOverlayCreated, onOverlayChanged, onOverlayDeleted }) {
  const map = L.map('editingMap', { zoomControl: true }).setView([52.2, -1.4], 6);
  const base = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true, opacity: .62, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const editable = L.featureGroup().addTo(map);
  const source = L.geoJSON(null, {
    style: feature => SOURCE_STYLES[feature.properties?.class] || { color: '#777', weight: 1.5 },
    pointToLayer: (feature, latlng) => L.marker(latlng, { icon: pointIcon(feature.properties?.class || 'source') }),
    onEachFeature: (feature, layer) => { const label = feature.properties?.name || feature.properties?.routeLabel || feature.properties?.class; if (label) layer.bindTooltip(label); }
  }).addTo(map);
  L.control.layers({ OpenStreetMap: base }, { 'Structured vector source': source, 'Editable geometry': editable }, { collapsed: false }).addTo(map);
  map.addControl(new L.Control.Draw({ draw: false, edit: { featureGroup: editable, remove: true } }));
  L.control.scale({ imperial: false }).addTo(map);

  let pending = null;
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
    pending = null;
  });
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
      [...editable.getLayers()].filter(layer => layer._dgKind === 'site').forEach(layer => editable.removeLayer(layer));
      if (geometry) addGeoJsonToEditable({ type: 'Feature', properties: {}, geometry }, 'site');
      const bounds = editable.getBounds(); if (geometry && bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
    },
    setOverlays(overlays) {
      [...editable.getLayers()].filter(layer => layer._dgKind === 'overlay').forEach(layer => editable.removeLayer(layer));
      overlays.forEach(overlay => { if (overlay.properties.visible !== false) addGeoJsonToEditable(overlay, 'overlay', overlay.id); });
    },
    setSource(features) { source.clearLayers(); source.addData({ type: 'FeatureCollection', features }); },
    startSiteDrawing() { pending = { kind: 'site' }; new L.Draw.Polygon(map, { allowIntersection: false, shapeOptions: { color: '#ed1c24', weight: 4 } }).enable(); },
    startOverlayDrawing(type, metadata) {
      pending = { kind: 'overlay', metadata };
      const handlers = {
        Point: () => new L.Draw.Marker(map, { icon: pointIcon('overlay') }),
        LineString: () => new L.Draw.Polyline(map, { shapeOptions: { color: metadata.colour, weight: 4 } }),
        Polygon: () => new L.Draw.Polygon(map, { allowIntersection: false, shapeOptions: { color: metadata.colour, weight: 4 } })
      };
      if (!handlers[type]) throw new Error(`Unsupported drawing geometry: ${type}.`);
      handlers[type]().enable();
    },
    clearSite() {
      [...editable.getLayers()].filter(layer => layer._dgKind === 'site').forEach(layer => editable.removeLayer(layer));
    }
  };
}
