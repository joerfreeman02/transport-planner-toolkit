import { BUILD, CONTROLLED_COLOURS, OSM_ATTRIBUTION, STATUS, STORAGE_KEY } from './config.js';
import { configureProj4 } from './crs.js';
import { DRAWING_MODES, defaultMetadata, modeConfig } from './drawing-modes.js';
import { extractOverlayFeatures, extractSiteGeometry, geometryCenterBng, locationCenterBng } from './geometry.js';
import { createOverlayStore, OVERLAY_CLASSES } from './overlay-store.js';
import { extentForDrawing } from './scale-engine.js';
import { OverpassTransportAdapter } from './source-adapter.js';
import { classVisibleForDrawing, renderDrawingSvg } from './svg-renderer.js';
import { createMapController } from './map-controller.js';
import { basemapProvider, validateBasemapProvider } from './basemap-compositor.js';
import { normaliseRouteDirection } from './route-geometry.js';
import { DEFAULT_ROAD_ROUTING_PROVIDER, snapRouteThroughGuidance } from './route-snap-adapter.js';
import { assessStationRailConsistency, resolveSourcePresentation, stationReviewCandidates } from './source-review.js';
import { BASEMAP_APPEARANCE_DEFAULT, busRouteReferences, nextBusGroupId, normaliseBasemapAppearance, normaliseBusGroups } from './presentation-controls.js';

configureProj4(globalThis.proj4);
const byId = id => document.getElementById(id);
const metaInputs = [...document.querySelectorAll('[data-meta]')];

function loadPersisted() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

const persisted = loadPersisted();
const state = {
  modeId: DRAWING_MODES[persisted.modeId] ? persisted.modeId : 'regional-plan',
  location: persisted.location && Number.isFinite(persisted.location.lat) && Number.isFinite(persisted.location.lon) ? persisted.location : null,
  site: persisted.site || null,
  metadataByMode: persisted.metadataByMode || {},
  sourceReview: persisted.sourceReview || {},
  appearanceByMode: persisted.appearanceByMode || {},
  busGroupsByMode: persisted.busGroupsByMode || {},
  outputByMode: persisted.outputByMode || {},
  sourcesByMode: {},
  overlayStore: createOverlayStore(persisted.overlays || []),
  basemapByMode: {},
  basemapProvider: basemapProvider(),
  roadRoutingProvider: DEFAULT_ROAD_ROUTING_PROVIDER,
  basemapRenderToken: 0,
  lastRender: null,
  activeDrawing: null
};
Object.keys(DRAWING_MODES).forEach(id => { state.metadataByMode[id] = { ...defaultMetadata(id), ...(state.metadataByMode[id] || {}) }; });

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ modeId: state.modeId, location: state.location, site: state.site, metadataByMode: state.metadataByMode, sourceReview: state.sourceReview, appearanceByMode: state.appearanceByMode, busGroupsByMode: state.busGroupsByMode, outputByMode: state.outputByMode, overlays: state.overlayStore.list() }));
  } catch { setMessage('overlayStatus', 'The browser could not persist the current editable geometry. Download the overlay file before closing.', 'warning'); }
}

function setMessage(id, text, kind = '') {
  const element = byId(id); element.textContent = text; element.className = `status-message ${kind}`;
}

function metadata() { return state.metadataByMode[state.modeId]; }

function populateMetadata() {
  const values = metadata();
  metaInputs.forEach(input => { input.value = values[input.dataset.meta] || ''; });
}

function captureMetadata() {
  const values = metadata();
  metaInputs.forEach(input => { values[input.dataset.meta] = input.value.trim(); });
  persist(); renderPreview();
}

function drawingCentre() {
  if (state.site) return geometryCenterBng(state.site);
  if (state.location) return locationCenterBng(state.location);
  return locationCenterBng({ lat: 52.2, lon: -1.4 });
}

function currentSource() { return state.sourcesByMode[state.modeId] || { status: 'not-loaded', features: [], snapshot: null }; }

function currentAppearance() {
  state.appearanceByMode[state.modeId] = normaliseBasemapAppearance(state.appearanceByMode[state.modeId] || BASEMAP_APPEARANCE_DEFAULT);
  return state.appearanceByMode[state.modeId];
}

function currentBusGroups() {
  state.busGroupsByMode[state.modeId] = normaliseBusGroups(state.busGroupsByMode[state.modeId] || []);
  return state.busGroupsByMode[state.modeId];
}
function currentOutput() { state.outputByMode[state.modeId] ||= { purpose: 'internal', confirmed: false }; return state.outputByMode[state.modeId]; }

function reviewedSourceFeatures() {
  return resolveSourcePresentation(currentSource().features, state.sourceReview);
}

function currentBasemap() {
  state.basemapByMode[state.modeId] ||= { requested: false, status: 'not-requested', loaded: 0, total: 0, error: '' };
  return state.basemapByMode[state.modeId];
}

function invalidateBasemaps() {
  state.basemapByMode = {};
  state.basemapRenderToken += 1;
}

function legendMarkup(items) {
  return items.map(item => {
    const type = item.className.startsWith('station-') || ['community', 'custom-point'].includes(item.className) ? 'point' : ['site', 'custom-area'].includes(item.className) ? 'area' : `line${item.dash ? ' dashed' : ''}`;
    const colour = item.stroke || item.fill;
    return `<div class="legend-row"><i class="legend-symbol ${type}" style="--legend-colour:${colour}"></i><span>${item.label}</span></div>`;
  }).join('') || '<p>NO VISIBLE LAYERS</p>';
}

function availableClasses() {
  const classes = new Set(reviewedSourceFeatures().map(item => item.properties?.class));
  state.overlayStore.list().filter(item => item.properties.visible !== false && classVisibleForDrawing(state.modeId, item.properties.class)).forEach(item => classes.add(item.properties.class));
  if ([...classes].some(className => className?.startsWith('station-'))) classes.add('rail-station');
  if (state.site) classes.add('site');
  if (classes.has('strategic-cycle') || classes.has('cycle-network-primary') || classes.has('cycle-network-local')) {
    classes.add('cycle-route');
    classes.add('cycle-network');
  }
  return classes;
}

function scaleMetadataMatches(mode) {
  const text = String(metadata().scale || '');
  const denominator = Number((text.includes(':') ? text.split(':').at(-1) : text).replace(/[^0-9]/g, ''));
  return denominator === mode.scale;
}

function renderPreview() {
  const mode = modeConfig(state.modeId);
  mapUi.setIssuedDrawingExtent(drawingCentre(), state.modeId);
  const source = currentSource();
  const basemap = currentBasemap();
  const result = renderDrawingSvg({ modeId: state.modeId, centerBng: drawingCentre(), site: state.site, sourceFeatures: source.features, sourceReview: state.sourceReview, overlays: state.overlayStore.list(), sourceStatus: source.status, includeBasemap: basemap.requested, basemapProvider: state.basemapProvider, basemapStatus: basemap.status, basemapAppearance: currentAppearance(), busGroups: currentBusGroups() });
  byId('sheetMap').innerHTML = result.markup;
  byId('sheetLegend').innerHTML = legendMarkup(result.legend);
  byId('drawingSheet').className = `drawing-sheet layout-${mode.family}${currentOutput().purpose === 'client' && currentOutput().confirmed ? ' client-issue' : ''}`;
  document.querySelectorAll('[data-sheet-meta]').forEach(element => { const value = metadata()[element.dataset.sheetMeta]; element.textContent = value || '-'; });
  const routeProviders = isRoutingMode() ? [...new Set(routeOverlays().map(item => item.properties.route?.provenance?.providerName).filter(Boolean))] : [];
  const routeAttribution = routeProviders.length ? `; road geometry: ${routeProviders.join(', ')} (geometry assistance only - planner selected/approved)` : '';
  byId('sheetAttribution').textContent = `Professional source: ${source.snapshot?.provider || 'reviewed/manual evidence'}${routeAttribution}. Engineering extent shown at right.`;
  byId('sheetExtent').textContent = `BNG extent ${result.extent.groundWidth.toFixed(0)} m x ${result.extent.groundHeight.toFixed(0)} m - A3 @ 1:${mode.scale.toLocaleString('en-GB')}`;
  const missing = mode.requiredClasses.filter(className => !availableClasses().has(className));
  const scaleMatches = scaleMetadataMatches(mode);
  state.lastRender = { modeId: state.modeId, result, missing, scaleMatches };
  renderSourcesAudit();
  renderBusPresentationGroups();
  updateDrawingReadiness();
  monitorBasemapTiles(result);
}

function updateDrawingReadiness() {
  const record = state.lastRender;
  if (!record || record.modeId !== state.modeId) return;
  const mode = modeConfig(state.modeId);
  const basemap = currentBasemap();
  const routeBlock = routingIssue();
  const blockPrint = !record.scaleMatches || basemap.status !== 'success' || Boolean(routeBlock) || (currentOutput().purpose === 'client' && !currentOutput().confirmed);
  byId('printDrawing').disabled = blockPrint;
  if (!record.scaleMatches) setMessage('drawingStatus', `Print blocked: scale metadata must be 1:${mode.scale.toLocaleString('en-GB')} for ${mode.title}.`, 'error');
  else if (basemap.status === 'failed') setMessage('drawingStatus', 'BASEMAP INCOMPLETE — PRINT BLOCKED. Controlled overlays remain intact; use Retry basemap.', 'error');
  else if (!basemap.requested) setMessage('drawingStatus', 'Generate the drawing to load the rendered OpenStreetMap basemap before printing.', 'warning');
  else if (basemap.status === 'loading') setMessage('drawingStatus', `Loading rendered OpenStreetMap basemap (${basemap.loaded}/${basemap.total || record.result.basemap?.tileCount || 0} tiles).`, 'warning');
  else if (!state.site) setMessage('drawingStatus', `Not issue-ready: no confirmed site boundary. Missing layer evidence: ${record.missing.join(', ') || 'none'}.`, 'warning');
  else if (routeBlock) setMessage('drawingStatus', `Print blocked: ${routeBlock}`, 'error');
  else if (currentOutput().purpose === 'client' && !currentOutput().confirmed) setMessage('drawingStatus', 'Print blocked: confirm professional review for Client / Professional Issue.', 'error');
  else if (record.missing.length) setMessage('drawingStatus', `Basemap ready. Required professional layers without current evidence: ${record.missing.join(', ')}. Add reviewed overlays or retrieve source data.`, 'warning');
  else setMessage('drawingStatus', 'Basemap and configured layer classes are present. Professional content and route approval are still required.', 'success');
}

function setBasemapDomStatus(status) {
  const svg = byId('drawingSvg');
  if (!svg) return;
  svg.dataset.basemapStatus = status;
  const warning = byId('basemapFailureWarning');
  if (warning) warning.setAttribute('visibility', status === 'failed' ? 'visible' : 'hidden');
  byId('retryBasemap').hidden = status !== 'failed';
}

function monitorBasemapTiles(result) {
  const basemap = currentBasemap();
  if (!basemap.requested || !result.basemap) return updateDrawingReadiness();
  const tiles = result.basemap.tiles || [];
  const token = ++state.basemapRenderToken;
  basemap.status = 'loading'; basemap.loaded = 0; basemap.total = tiles.length; basemap.error = '';
  setBasemapDomStatus('loading'); updateDrawingReadiness();
  if (!tiles.length) {
    basemap.status = 'failed'; basemap.error = 'No tile images were composed.'; setBasemapDomStatus('failed'); updateDrawingReadiness(); return;
  }
  Promise.all(tiles.map(async (tile, index) => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(tile.url, { mode: 'cors', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`Tile ${index + 1} failed.`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      if (bitmap.width < 128 || bitmap.height < 128) { bitmap.close(); throw new Error(`Tile ${index + 1} is incomplete.`); }
      return bitmap;
    } catch (error) { if (error.name === 'AbortError') throw new Error(`Tile ${index + 1} timed out.`); throw error; }
    finally { clearTimeout(timeout); }
  })).then(bitmaps => {
    if (token !== state.basemapRenderToken) return;
    basemap.loaded = bitmaps.length;
    const paint = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (token !== state.basemapRenderToken) return;
      const image = byId('sheetMap').querySelector('.issued-basemap-image');
      basemap.status = !image || !image.complete || image.naturalWidth < 1 || image.naturalHeight < 1 ? 'failed' : 'success';
      if (basemap.status === 'failed') basemap.error ||= 'Issued basemap image is incomplete.';
      setBasemapDomStatus(basemap.status); updateDrawingReadiness();
    }));
    {
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(result.viewWidth * 2); canvas.height = Math.ceil(result.viewHeight * 2);
      const context = canvas.getContext('2d');
      try {
        bitmaps.forEach((bitmap, index) => { const m = tiles[index].matrix; context.setTransform(m.a * 2, m.b * 2, m.c * 2, m.d * 2, m.e * 2, m.f * 2); context.drawImage(bitmap, 0, 0, result.basemap.provider.tileSize, result.basemap.provider.tileSize); bitmap.close(); });
        context.setTransform(1, 0, 0, 1, 0, 0);
        canvas.toBlob(blob => {
          if (token !== state.basemapRenderToken || !blob) return;
          const url = URL.createObjectURL(blob); const image = document.createElement('img'); image.className = 'issued-basemap-image'; image.alt = 'Rendered OpenStreetMap issued basemap'; image.width = canvas.width; image.height = canvas.height;
          image.onload = async () => { try { await image.decode(); const map = byId('sheetMap'); const old = map.querySelector('.issued-basemap-image'); image.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;object-fit:fill;print-color-adjust:exact;-webkit-print-color-adjust:exact;'; map.style.position = 'relative'; map.style.overflow = 'hidden'; const svg = byId('drawingSvg'); svg.style.position = 'relative'; svg.style.zIndex = '2'; const background = [...svg.children].find(child => child.tagName?.toLowerCase() === 'rect'); if (background) background.setAttribute('fill', 'none'); map.prepend(image); map.dataset.basemapImageReady = 'true'; if (old) { const previous = old.src; old.remove(); if (previous.startsWith('blob:')) URL.revokeObjectURL(previous); } paint(); } catch (error) { basemap.status = 'failed'; basemap.error = error.message; setBasemapDomStatus('failed'); updateDrawingReadiness(); } };
          image.onerror = () => { basemap.status = 'failed'; basemap.error = 'Issued basemap image failed to decode.'; setBasemapDomStatus('failed'); updateDrawingReadiness(); };
          image.src = url;
        }, 'image/png');
      } catch (error) { basemap.status = 'failed'; basemap.error = error.message; setBasemapDomStatus('failed'); updateDrawingReadiness(); }
    }
  }).catch(error => { if (token !== state.basemapRenderToken) return; basemap.status = 'failed'; basemap.error = error.message || 'Basemap tile decode failed.'; setBasemapDomStatus('failed'); updateDrawingReadiness(); });
  byId('workflowStatus').textContent = 'Loading complete issued OpenStreetMap tile coverage…';
  updateDrawingReadiness();
}

function renderOverlayRows() {
  const overlays = state.overlayStore.list();
  const tbody = byId('overlayRows');
  if (!overlays.length) {
    tbody.innerHTML = '<tr><td colspan="6">No reviewed overlays.</td></tr>';
    setMessage('overlayStatus', 'No reviewed overlays.');
    mapUi.setOverlays([]); renderPreview(); return;
  }
  tbody.innerHTML = overlays.map(item => `<tr data-overlay-id="${item.id}">
    <td><input class="overlay-visible" type="checkbox" aria-label="Show ${escapeHtml(item.properties.layerName)}" ${item.properties.visible ? 'checked' : ''}></td>
    <td><input class="overlay-layer" value="${escapeHtml(item.properties.layerName)}">${item.properties.route ? `<small class="route-state">${escapeHtml(routeStateLabel(item.properties.route))}</small>` : ''}</td>
    <td><select class="overlay-class">${Object.entries(OVERLAY_CLASSES).map(([id, value]) => `<option value="${id}" ${id === item.properties.class ? 'selected' : ''}>${escapeHtml(value.label)}</option>`).join('')}</select></td>
    <td><input class="overlay-label" value="${escapeHtml(item.properties.label)}"></td>
    <td><select class="overlay-colour">${CONTROLLED_COLOURS.map(colour => `<option value="${colour}" ${colour === item.properties.colour ? 'selected' : ''}>${colour}</option>`).join('')}</select></td>
    <td><button class="remove-overlay">Delete</button></td>
  </tr>`).join('');
  tbody.querySelectorAll('tr').forEach(row => {
    const id = row.dataset.overlayId;
    const update = () => {
      try {
        const current = state.overlayStore.get(id);
        const className = row.querySelector('.overlay-class').value;
        const isRoute = ['route-to-site', 'route-from-site'].includes(className);
        const route = isRoute ? (current.properties.route || { status: 'snap-review-required', roughGeometry: structuredClone(current.geometry), selectionAuthority: 'planner', providerPurpose: 'manual-fallback-review', directionStatus: 'pending', reviewReason: 'A route-class overlay requires direction review and explicit manual acceptance or road-snap retry.' }) : null;
        state.overlayStore.update(id, { visible: row.querySelector('.overlay-visible').checked, layerName: row.querySelector('.overlay-layer').value, class: className, label: row.querySelector('.overlay-label').value, colour: row.querySelector('.overlay-colour').value, route });
        if (isRoute) revalidateRouteDirections(false);
        persist(); renderOverlayRows();
      } catch (error) { setMessage('overlayStatus', error.message, 'error'); }
    };
    row.querySelectorAll('input,select').forEach(control => control.addEventListener('change', update));
    row.querySelector('.remove-overlay').addEventListener('click', () => { state.overlayStore.remove(id); persist(); renderOverlayRows(); });
  });
  mapUi.setOverlays(overlays);
  setMessage('overlayStatus', `${overlays.length} reviewed overlay${overlays.length === 1 ? '' : 's'} retained across drawing modes.`, 'success');
  renderPreview();
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

function overlayMetadata() {
  return { className: byId('overlayClass').value, layerName: byId('overlayLayerName').value, label: byId('overlayLabel').value, colour: byId('overlayColour').value, visible: true };
}

const mapUi = createMapController({
  onMapCenterChanged: center => {
    if (state.site) return;
    if (state.location && Math.abs(state.location.lat - center.lat) < 1e-9 && Math.abs(state.location.lon - center.lon) < 1e-9) return;
    state.location = { ...center, label: 'Interactive map centre' };
    invalidateBasemaps(); state.sourcesByMode[state.modeId] = undefined;
    persist(); renderSourceStatus(); renderPreview();
  },
  onSiteChanged: geometry => acceptSite(geometry, 'Edited boundary'),
  onSiteDeleted: () => clearSite(),
  onOverlayCreated: (feature, meta) => {
    const isRoute = ['route-to-site', 'route-from-site'].includes(meta?.className);
    const record = state.overlayStore.add(feature, isRoute ? {
      ...meta, source: 'Planner-drawn waypoint guidance; road geometry pending review',
      route: { status: 'rough', roughGeometry: structuredClone(feature.geometry), selectionAuthority: 'planner', providerPurpose: 'geometry-assistance-only', directionStatus: 'pending' }
    } : meta);
    persist();
    queueMicrotask(() => { renderOverlayRows(); renderRoutingTools(); if (isRoute) processRouteOverlay(record.id); });
    return record;
  },
  onOverlayChanged: (id, geometry) => {
    const current = state.overlayStore.get(id);
    const isRoute = ['route-to-site', 'route-from-site'].includes(current?.properties?.class);
    state.overlayStore.update(id, isRoute ? {
      geometry, source: 'Planner-edited waypoint guidance; road geometry pending review',
      route: { ...(current.properties.route || {}), status: 'rough', roughGeometry: structuredClone(geometry), selectionAuthority: 'planner', providerPurpose: 'geometry-assistance-only', directionStatus: 'pending', approvedAt: null }
    } : { geometry });
    persist(); queueMicrotask(() => { renderOverlayRows(); if (isRoute) processRouteOverlay(id); });
  },
  onOverlayDeleted: id => { state.overlayStore.remove(id); persist(); queueMicrotask(renderOverlayRows); },
  onDrawingStateChanged: (active, detail) => {
    state.activeDrawing = active ? detail : null;
    byId('drawSite').disabled = active;
    const routeDrawing = active && detail?.kind === 'overlay' && ['route-to-site', 'route-from-site'].includes(detail.metadata?.className);
    byId('cancelDrawing').hidden = !active || routeDrawing;
    byId('cancelRouteDrawing').hidden = !routeDrawing;
    byId('drawRouteTo').disabled = active;
    byId('drawRouteFrom').disabled = active;
    if (active && detail?.kind === 'site') setMessage('siteStatus', 'Site drawing active. Complete the polygon or choose Cancel drawing to return to map navigation.', 'warning');
    if (routeDrawing) setMessage('routeStatus', `${detail.metadata.label} drawing active. Click to add waypoints; drag to pan and use the mouse wheel to zoom. Navigation does not add route vertices.`, 'warning');
    if (!active) renderRoutingTools();
  }
});

function acceptSite(input, origin = 'Boundary') {
  try {
    state.site = extractSiteGeometry(input);
    invalidateBasemaps(); mapUi.setSite(state.site); revalidateRouteDirections(true); persist(); renderOverlayRows(); renderPreview();
    setMessage('siteStatus', `${origin} accepted as explicit site geometry. Address/location point remains separate.`, 'success');
  } catch (error) { setMessage('siteStatus', error.message, 'error'); }
}

function clearSite() {
  state.site = null; invalidateBasemaps(); mapUi.clearSite(); revalidateRouteDirections(true); persist(); renderOverlayRows(); renderPreview();
  setMessage('siteStatus', 'Site boundary cleared. No boundary has been inferred.', 'warning');
}

async function readJson(file) {
  try { return JSON.parse(await file.text()); } catch { throw new Error('The selected file is not valid JSON.'); }
}

function downloadJson(filename, payload) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function searchAddress() {
  const query = byId('addressInput').value.trim();
  if (!query) return setMessage('siteStatus', 'Enter a UK address or postcode.', 'error');
  setMessage('siteStatus', 'Searching for a map centre...'); byId('searchResults').replaceChildren();
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2'); url.searchParams.set('countrycodes', 'gb'); url.searchParams.set('limit', '5'); url.searchParams.set('q', query);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Address search returned HTTP ${response.status}.`);
    const results = await response.json();
    if (!Array.isArray(results)) throw new Error('Address provider returned a malformed response.');
    if (!results.length) throw new Error('No matching UK location was found.');
    results.forEach(result => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = result.display_name;
      button.addEventListener('click', () => setLocation(Number(result.lat), Number(result.lon), result.display_name)); byId('searchResults').append(button);
    });
    setMessage('siteStatus', 'Select the correct result. It will centre the map without creating a boundary.', 'success');
  } catch (error) { setMessage('siteStatus', error.message, 'error'); }
}

function setLocation(lat, lon, label = 'Coordinate entry') {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 49 || lat > 61 || lon < -9 || lon > 3) return setMessage('siteStatus', 'Enter plausible UK latitude and longitude values.', 'error');
  state.location = { lat, lon, label }; invalidateBasemaps(); byId('latitudeInput').value = lat.toFixed(6); byId('longitudeInput').value = lon.toFixed(6);
  mapUi.setView(lat, lon); byId('searchResults').replaceChildren(); state.sourcesByMode[state.modeId] = undefined; persist(); renderSourceStatus(); renderPreview();
  setMessage('siteStatus', 'Map centred. Draw or import the actual site boundary; no polygon was inferred.', 'success');
}

function renderSourceStatus() {
  const source = currentSource();
  byId('downloadSnapshot').disabled = !source.snapshot;
  byId('sourceDiagnostics').textContent = source.snapshot ? JSON.stringify(source.snapshot, null, 2) : 'Not loaded.';
  if (source.status === 'success') {
    const warnings = source.snapshot.warnings || [];
    setMessage('sourceStatus', `${source.features.length} classified vector features loaded from ${source.snapshot.provider}. The in-memory snapshot will be reused for print.${warnings.length ? ` ${warnings.join(' ')}` : ''}`, warnings.length ? 'warning' : 'success');
  }
  else if (source.status === 'zero') setMessage('sourceStatus', 'The provider request succeeded and returned a genuine zero-feature result for this extent.', 'warning');
  else if (source.status === 'failed') setMessage('sourceStatus', source.error, 'error');
  else setMessage('sourceStatus', 'No vector snapshot loaded. Required layers may be added through reviewed overlays.', 'warning');
  renderProfessionalSourceReview();
  renderCommunityCandidates();
  renderSourcesAudit();
  renderBusPresentationGroups();
}

function sourceLink(sourceId) {
  const match = String(sourceId || '').match(/^(node|way|relation)\/(\d+)$/);
  return match ? `https://www.openstreetmap.org/${match[1]}/${match[2]}` : 'https://www.openstreetmap.org/';
}

function featureCoordinate(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === 'Point') return geometry.coordinates;
  const values = [];
  const visit = value => {
    if (Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry?.coordinates);
  return values.length ? values.reduce((total, point) => [total[0] + point[0] / values.length, total[1] + point[1] / values.length], [0, 0]) : null;
}

function googleMapsLink(feature) {
  const coordinate = featureCoordinate(feature);
  return coordinate ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coordinate[1].toFixed(6)},${coordinate[0].toFixed(6)}`)}` : 'https://www.google.com/maps';
}

function sourceUsage() {
  const source = currentSource();
  if (source.status !== 'success') return 'Not yet refreshed';
  const classes = new Set(source.features.map(item => item.properties?.class));
  const used = [];
  if (classes.has('main-road') || classes.has('motorway')) used.push('road');
  if (classes.has('railway') || [...classes].some(value => value?.startsWith('station-'))) used.push('rail');
  if (classes.has('cycle-network-primary') || classes.has('cycle-network-local') || classes.has('cycle-route')) used.push('cycle');
  if (classes.has('bus-route')) used.push('bus');
  if (classes.has('community-candidate')) used.push('community');
  return used.length ? `Used for ${used.join(', ')} geometry` : 'Used - no applicable classified layer';
}

function auditRow(source, usedFor, status, href, action) {
  return `<article class="sources-audit-row"><strong>${escapeHtml(source)}</strong><span>${escapeHtml(usedFor)}</span><b class="audit-status">${escapeHtml(status)}</b><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(action)}</a></article>`;
}

function renderSourcesAudit() {
  const target = byId('sourcesAuditRows');
  if (!target) return;
  const source = currentSource();
  const basemap = currentBasemap();
  const routingUsed = isRoutingMode() && routeOverlays().some(item => item.properties.route?.provenance?.providerId);
  target.innerHTML = [
    auditRow('OpenStreetMap', 'Issued basemap', basemap.status === 'success' ? 'USED' : 'Ready when drawing is generated', 'https://www.openstreetmap.org/copyright', 'Open copyright/source'),
    auditRow('OpenStreetMap via Overpass', sourceUsage(), source.status === 'success' ? 'USED' : source.status === 'failed' ? 'Review required' : 'Not used yet', 'https://overpass-api.de/', 'Open source information'),
    auditRow('TfL Cycle Routes', 'Independent London cycle verification', 'REFERENCE - NOT USED', 'https://tfl.gov.uk/info-for/open-data-users/our-open-data?intcmp=3671', 'Open official TfL source'),
    auditRow('TfL', 'London bus service verification', 'REFERENCE - NOT USED', 'https://tfl.gov.uk/info-for/open-data-users/unified-api?intcmp=29422', 'Open official TfL source'),
    auditRow('TPT Railway evidence', 'Rail-mode classification support', source.status === 'success' ? 'USED WHERE APPLICABLE' : 'Not used yet', '../railway/', 'Open Railway module'),
    auditRow('OSRM', 'Planner-guided road geometry assistance', routingUsed ? 'USED IN ROUTING DRAWING' : 'NOT USED IN THIS DRAWING', 'https://project-osrm.org/', 'Open provider information')
  ].join('');
}

function renderBusPresentationGroups() {
  const panel = byId('busPresentationPanel');
  const refs = state.modeId === 'local-context' ? busRouteReferences(currentSource().features) : [];
  panel.hidden = !refs.length;
  if (!refs.length) return;
  const groups = currentBusGroups();
  const occupied = new Set(groups.flatMap(group => group.routeRefs));
  byId('busRouteSelection').innerHTML = refs.map(ref => `<label class="bus-route-choice"><input type="checkbox" value="${escapeHtml(ref)}" ${occupied.has(ref) ? 'disabled' : ''}>${escapeHtml(ref)}${occupied.has(ref) ? ' - grouped' : ''}</label>`).join('');
  byId('busGroupRows').innerHTML = groups.map(group => `<article class="bus-group-row" data-group-id="${escapeHtml(group.id)}"><i style="--group-colour:${escapeHtml(group.colour)}"></i><strong>${escapeHtml(group.label)}</strong><span>${escapeHtml(group.routeRefs.join(', '))}</span><button type="button">Remove group</button></article>`).join('') || '<p class="hint">Ungrouped services remain visible individually.</p>';
  byId('busGroupRows').querySelectorAll('button').forEach(button => button.addEventListener('click', event => {
    const id = event.currentTarget.closest('[data-group-id]').dataset.groupId;
    state.busGroupsByMode[state.modeId] = groups.filter(group => group.id !== id); persist(); renderPreview();
  }));
}

function groupSelectedBusRoutes() {
  const selected = [...byId('busRouteSelection').querySelectorAll('input:checked')].map(input => input.value);
  if (!selected.length) return setMessage('sourceStatus', 'Select one or more ungrouped bus routes first.', 'warning');
  const groups = currentBusGroups();
  const label = byId('busGroupLabel').value.trim() || `BUS ROUTES ${selected.join(', ')}`;
  groups.push({ id: nextBusGroupId(groups), label, routeRefs: selected, colour: byId('busGroupColour').value });
  state.busGroupsByMode[state.modeId] = normaliseBusGroups(groups);
  byId('busGroupLabel').value = ''; persist(); renderPreview();
}

function setSourceReviewState(sourceId, reviewState) {
  if (!sourceId || !['included', 'excluded'].includes(reviewState)) return;
  state.sourceReview[sourceId] = reviewState;
  persist();
  mapUi.setSource(reviewedSourceFeatures(), state.modeId);
  renderSourceStatus();
  renderPreview();
}

function renderProfessionalSourceReview() {
  const candidates = stationReviewCandidates(currentSource().features, state.sourceReview);
  const panel = byId('sourceReviewPanel');
  panel.hidden = !candidates.length;
  if (!candidates.length) return;
  byId('sourceReviewRows').innerHTML = candidates.map(candidate => {
    const qa = candidate.qa;
    const proximity = qa.reviewRequired
      ? `${escapeHtml(qa.warning)}${qa.nearestRailDistanceMetres === null ? '' : ` (${qa.nearestRailDistanceMetres} m from returned railway; threshold ${qa.thresholdMetres} m)`}`
      : `Nearest returned railway: ${qa.nearestRailDistanceMetres ?? 'not assessed'} m (threshold ${qa.thresholdMetres} m)`;
    const action = candidate.state === 'included' ? 'Exclude' : 'Include';
    const nextState = candidate.state === 'included' ? 'excluded' : 'included';
    return `<article class="source-review-card" data-source-id="${escapeHtml(candidate.sourceId)}">
      <div><strong>${escapeHtml(candidate.name)}</strong><span>${escapeHtml(candidate.mode)}</span></div>
      <code>${escapeHtml(candidate.sourceId)}</code>
      <p class="${qa.reviewRequired ? 'review-warning' : 'review-ok'}">${proximity}</p>
      <div class="source-review-action"><b>${candidate.state.toUpperCase()}</b><button type="button" data-next-state="${nextState}">${action}</button></div>
    </article>`;
  }).join('');
  byId('sourceReviewRows').querySelectorAll('.source-review-card').forEach(card => {
    card.querySelector('button').addEventListener('click', () => setSourceReviewState(card.dataset.sourceId, card.querySelector('button').dataset.nextState));
  });
}

async function retrieveSources() {
  if (!state.location && !state.site) {
    setMessage('sourceStatus', 'Locate the map or import the site before retrieving data.', 'error');
    byId('workflowStatus').textContent = 'Locate the site before generating the drawing.';
    return false;
  }
  setMessage('sourceStatus', 'Retrieving structured professional transport features for the exact drawing extent...');
  const basemap = currentBasemap();
  basemap.requested = true; basemap.status = 'loading'; basemap.loaded = 0; basemap.total = 0; basemap.error = '';
  byId('workflowStatus').textContent = 'Loading the rendered OpenStreetMap basemap and controlled EAS overlays...';
  byId('loadSources').disabled = true; byId('generateDrawing').disabled = true;
  renderPreview();
  const adapter = new OverpassTransportAdapter();
  try {
    const source = await adapter.retrieve(state.modeId, extentForDrawing(drawingCentre(), state.modeId), BUILD);
    state.sourcesByMode[state.modeId] = { ...source, features: assessStationRailConsistency(source.features) }; mapUi.setSource(reviewedSourceFeatures(), state.modeId); renderSourceStatus(); renderPreview();
    if (currentBasemap().status !== 'failed') byId('workflowStatus').textContent = 'Professional source refreshed; waiting for the rendered basemap if still loading.';
    return true;
  } catch (error) {
    state.sourcesByMode[state.modeId] = { status: 'failed', features: [], snapshot: null, error: `${error.message}${error.details?.failures ? ` ${error.details.failures.map(item => `${item.endpoint}: ${item.kind}`).join('; ')}` : ''}` };
    mapUi.setSource([], state.modeId); renderSourceStatus(); renderPreview();
    byId('workflowStatus').textContent = 'Professional vector evidence could not be loaded. The rendered basemap and reviewed manual overlays remain separate.';
    return false;
  } finally { byId('loadSources').disabled = false; byId('generateDrawing').disabled = false; }
}

function renderCommunityCandidates() {
  const candidates = currentSource().features.filter(item => item.properties?.class === 'community-candidate');
  byId('communityPanel').hidden = state.modeId !== 'local-context' || !candidates.length;
  const selected = new Set(state.overlayStore.list().map(item => item.properties.community?.candidateSourceId).filter(Boolean));
  byId('communityCandidates').innerHTML = candidates.map((item, index) => {
    const evidence = item.properties.communityEvidence || {};
    const sourceId = item.properties.sourceId;
    const added = selected.has(sourceId);
    const disabled = evidence.reviewRequired;
    const status = disabled ? 'Review required' : evidence.associationMethod === 'source-area' ? 'Source area' : 'Single containing building';
    return `<div class="candidate-card${added ? ' is-selected' : ''}${disabled ? ' requires-review' : ''}" data-index="${index}"><strong>${escapeHtml(item.properties.name || 'Unnamed mapped feature')}</strong><span>${escapeHtml(item.properties.category || 'Unclassified')}</span><small>OSM source ID: ${escapeHtml(sourceId)}</small><small>Geometry: ${escapeHtml(status)}${disabled ? ` - ${escapeHtml(evidence.reviewReason || '')}` : ''}</small><div class="candidate-audit-actions"><a href="${escapeHtml(sourceLink(sourceId))}" target="_blank" rel="noopener">Open OSM</a><a href="${escapeHtml(googleMapsLink(item))}" target="_blank" rel="noopener">Open in Google Maps</a></div><button ${disabled ? 'disabled' : ''}>${disabled ? 'Footprint requires review' : added ? 'Added — Remove' : 'Add as reviewed area'}</button></div>`;
  }).join('');
  byId('communityCandidates').querySelectorAll('.candidate-card').forEach(card => card.querySelector('button').addEventListener('click', () => {
    const item = candidates[Number(card.dataset.index)];
    const sourceId = item.properties.sourceId;
    const overlayId = `community:${sourceId}`;
    if (state.overlayStore.get(overlayId)) state.overlayStore.remove(overlayId);
    else state.overlayStore.add(item, {
      id: overlayId, className: 'community', label: item.properties.name || item.properties.category,
      layerName: 'Community considerations', colour: '#666666', source: sourceId,
      community: structuredClone(item.properties.communityEvidence)
    });
    persist(); renderOverlayRows(); renderCommunityCandidates();
  }));
}

function isRoutingMode() { return state.modeId.endsWith('-routing'); }

function routeOverlays() {
  return state.overlayStore.list().filter(item => ['route-to-site', 'route-from-site'].includes(item.properties.class));
}

const routeJobs = new Map();

function routeStateLabel(route = {}) {
  const labels = {
    rough: 'ROUGH WAYPOINT GUIDANCE', snapping: 'ROAD SNAP IN PROGRESS',
    'snapped-review': 'ROAD SNAP READY - PLANNER APPROVAL REQUIRED',
    approved: 'PLANNER APPROVED ROAD-SNAPPED GEOMETRY',
    'manual-approved': 'PLANNER-ACCEPTED MANUAL FALLBACK',
    'snap-failed': 'ROAD SNAP FAILED - MANUAL REVIEW REQUIRED',
    'snap-review-required': 'ROAD SNAP DEVIATION - ADD GUIDANCE / REVIEW',
    'direction-review': 'ROUTE DIRECTION REQUIRES REVIEW'
  };
  const base = labels[route.status] || 'ROUTE REVIEW REQUIRED';
  return route.directionNormalization ? `${base}. ${route.directionNormalization}` : base;
}

function routingIssue() {
  if (!isRoutingMode()) return '';
  const routes = routeOverlays();
  if (!routes.some(item => item.properties.class === 'route-to-site') || !routes.some(item => item.properties.class === 'route-from-site')) return 'Both route-to-site and route-from-site geometry are required.';
  if (routes.some(item => item.properties.route?.status === 'snapping')) return 'Road snapping is still in progress.';
  if (routes.some(item => item.properties.route?.status === 'snap-failed')) return 'ROAD SNAP FAILED - ROUTE REQUIRES MANUAL REVIEW';
  if (routes.some(item => item.properties.route?.directionStatus !== 'confirmed')) return 'ROUTE DIRECTION REQUIRES REVIEW';
  if (routes.some(item => !['approved', 'manual-approved'].includes(item.properties.route?.status))) return 'Road-snapped geometry requires explicit planner approval.';
  return '';
}

function updateRouteRecord(id, patch) {
  const current = state.overlayStore.get(id);
  if (!current) return null;
  const next = state.overlayStore.update(id, {
    ...(patch.geometry ? { geometry: patch.geometry } : {}),
    ...(patch.source ? { source: patch.source } : {}),
    route: { ...(current.properties.route || {}), ...(patch.route || {}) }
  });
  persist(); renderOverlayRows(); renderRoutingTools(); return next;
}

async function processRouteOverlay(id) {
  if (routeJobs.has(id)) return routeJobs.get(id);
  const job = (async () => {
    const current = state.overlayStore.get(id);
    if (!current) return null;
    const roughGeometry = structuredClone(current.properties.route?.roughGeometry || current.geometry);
    updateRouteRecord(id, { geometry: roughGeometry, route: { status: 'snapping', roughGeometry, directionStatus: 'pending', error: '' } });
    const snapped = await snapRouteThroughGuidance(roughGeometry, { provider: state.roadRoutingProvider });
    if (!state.overlayStore.get(id)) return null;
    if (snapped.status === 'snap-failed') {
      return updateRouteRecord(id, {
        geometry: roughGeometry,
        source: 'Planner-drawn waypoint guidance; road snap failed and manual review is required',
        route: { status: 'snap-failed', roughGeometry, directionStatus: state.site ? 'pending' : 'review-required', error: snapped.error, provenance: null }
      });
    }
    const direction = normaliseRouteDirection(snapped.geometry, current.properties.class, state.site);
    const status = direction.status !== 'confirmed' ? 'direction-review' : snapped.reviewRequired ? 'snap-review-required' : 'snapped-review';
    return updateRouteRecord(id, {
      geometry: direction.geometry,
      source: `${snapped.provenance.providerName}; geometry assistance only; planner selection and approval required`,
      route: {
        status, roughGeometry, snappedGeometry: structuredClone(direction.geometry), directionStatus: direction.status,
        directionNormalization: direction.normalization || direction.reason, reversedByNormalization: direction.reversed,
        provenance: snapped.provenance, error: '', approvedAt: null,
        reviewReason: snapped.reviewRequired ? 'The snapped geometry materially departed from one or more planner guidance points.' : ''
      }
    });
  })().finally(() => routeJobs.delete(id));
  routeJobs.set(id, job);
  return job;
}

function revalidateRouteDirections(siteChanged = false) {
  routeOverlays().forEach(item => {
    const route = item.properties.route || {};
    const direction = normaliseRouteDirection(item.geometry, item.properties.class, state.site);
    let status = route.status;
    if (direction.status !== 'confirmed') status = route.status === 'snap-failed' ? 'snap-failed' : 'direction-review';
    else {
      if (route.status === 'direction-review') status = route.statusBeforeDirectionReview || 'snapped-review';
      if (siteChanged && status === 'approved') status = 'snapped-review';
      if (siteChanged && status === 'manual-approved') status = 'snap-review-required';
    }
    state.overlayStore.update(item.id, {
      geometry: direction.geometry,
      route: {
        ...route, status, directionStatus: direction.status,
        statusBeforeDirectionReview: direction.status === 'confirmed' ? null : (route.status === 'direction-review' ? route.statusBeforeDirectionReview : route.status),
        directionNormalization: direction.normalization || direction.reason,
        reversedByNormalization: Boolean(route.reversedByNormalization || direction.reversed),
        approvedAt: status === 'approved' ? route.approvedAt : null
      }
    });
  });
  persist(); renderRoutingTools();
}

function migrateLegacyRoutesForReview() {
  let migrated = false;
  routeOverlays().forEach(item => {
    if (item.properties.route) return;
    state.overlayStore.update(item.id, {
      route: {
        status: 'snap-review-required', roughGeometry: structuredClone(item.geometry),
        selectionAuthority: 'planner', providerPurpose: 'manual-fallback-review', directionStatus: 'pending',
        reviewReason: 'Legacy route requires direction review and explicit manual acceptance or road-snap retry.'
      }
    });
    migrated = true;
  });
  if (migrated) revalidateRouteDirections(false);
}

function approveSnappedRoutes() {
  let approved = 0;
  routeOverlays().forEach(item => {
    const route = item.properties.route || {};
    if (route.status === 'snapped-review' && route.directionStatus === 'confirmed') {
      state.overlayStore.update(item.id, { route: { ...route, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: 'planner using current browser session' } });
      approved += 1;
    }
  });
  persist(); renderOverlayRows(); renderRoutingTools();
  if (!approved) setMessage('routeStatus', 'No road-snapped route is currently eligible for approval. Resolve snap deviation or direction review first.', 'warning');
}

function retryRoadSnap() {
  const retryable = routeOverlays().filter(item => ['snap-failed', 'snap-review-required'].includes(item.properties.route?.status));
  if (!retryable.length) return setMessage('routeStatus', 'No route currently requires a road-snap retry.', 'warning');
  retryable.forEach(item => processRouteOverlay(item.id));
}

function acceptManualFallback() {
  let accepted = 0;
  routeOverlays().forEach(item => {
    const route = item.properties.route || {};
    if (!['snap-failed', 'snap-review-required'].includes(route.status)) return;
    const roughGeometry = route.roughGeometry || item.geometry;
    const direction = normaliseRouteDirection(roughGeometry, item.properties.class, state.site);
    if (direction.status !== 'confirmed') {
      state.overlayStore.update(item.id, { geometry: roughGeometry, route: { ...route, status: 'direction-review', statusBeforeDirectionReview: 'manual-approved', directionStatus: 'review-required', directionNormalization: direction.reason } });
      return;
    }
    state.overlayStore.update(item.id, {
      geometry: direction.geometry,
      source: 'Planner-accepted manual fallback geometry after road-snap review',
      route: { ...route, status: 'manual-approved', directionStatus: 'confirmed', directionNormalization: direction.normalization, reversedByNormalization: direction.reversed, manualFallbackAccepted: true, approvedAt: new Date().toISOString(), approvedBy: 'planner using current browser session' }
    });
    accepted += 1;
  });
  persist(); renderOverlayRows(); renderRoutingTools();
  if (!accepted) setMessage('routeStatus', 'Manual fallback could not be accepted. A failed/deviated route and an unambiguous confirmed site are required.', 'warning');
}

function renderRoutingTools() {
  const panel = byId('routingTools');
  panel.hidden = !isRoutingMode();
  if (panel.hidden) return;
  const routes = routeOverlays();
  const toCount = routes.filter(item => item.properties.class === 'route-to-site').length;
  const fromCount = routes.filter(item => item.properties.class === 'route-from-site').length;
  const active = Boolean(state.activeDrawing);
  byId('drawRouteTo').disabled = active;
  byId('drawRouteFrom').disabled = active;
  byId('deleteRoutes').disabled = active || !routes.length;
  byId('approveSnappedRoutes').disabled = active || !routes.some(item => item.properties.route?.status === 'snapped-review' && item.properties.route?.directionStatus === 'confirmed');
  byId('retryRoadSnap').disabled = active || !routes.some(item => ['snap-failed', 'snap-review-required'].includes(item.properties.route?.status));
  byId('acceptManualFallback').disabled = active || !routes.some(item => ['snap-failed', 'snap-review-required'].includes(item.properties.route?.status));
  if (!active) {
    const failed = routes.find(item => item.properties.route?.status === 'snap-failed');
    const direction = routes.find(item => item.properties.route?.directionStatus === 'review-required');
    const deviation = routes.find(item => item.properties.route?.status === 'snap-review-required');
    const snapping = routes.find(item => item.properties.route?.status === 'snapping');
    if (failed) setMessage('routeStatus', `ROAD SNAP FAILED — ROUTE REQUIRES MANUAL REVIEW. ${failed.properties.route.error || ''}`.trim(), 'error');
    else if (direction) setMessage('routeStatus', 'ROUTE DIRECTION REQUIRES REVIEW', 'error');
    else if (deviation) setMessage('routeStatus', 'Road snap requires review: add/edit waypoint guidance, redraw, or retry before approval.', 'error');
    else if (snapping) setMessage('routeStatus', 'Following the planner waypoint guidance along mapped roads...', 'warning');
    else if (routes.some(item => item.properties.route?.status === 'snapped-review')) setMessage('routeStatus', 'Road-snapped geometry is ready. Review it, then explicitly approve it for the drawing.', 'warning');
    else setMessage('routeStatus', routes.length
      ? `${toCount} route-to-site and ${fromCount} route-from-site line${routes.length === 1 ? '' : 's'} retained with planner-controlled direction and approval.`
      : 'No route guidance added. Draw waypoints in the roads/order selected by the planner.', routes.length ? 'success' : 'warning');
  }
}

function startRouteDrawing(className) {
  const definition = className === 'route-to-site'
    ? { label: 'ROUTE TO SITE', colour: '#ed1c24' }
    : { label: 'ROUTE FROM SITE', colour: '#0057e7' };
  mapUi.startOverlayDrawing('LineString', { className, layerName: 'Planner-guided road routing', label: definition.label, colour: definition.colour, visible: true });
}

function cancelRouteDrawing() {
  mapUi.cancelDrawing();
  setMessage('routeStatus', 'Route drawing cancelled. Map navigation restored.', 'success');
}

function deleteRoutes() {
  routeOverlays().forEach(item => state.overlayStore.remove(item.id));
  persist();
  renderOverlayRows();
  renderRoutingTools();
  setMessage('routeStatus', 'Route lines deleted. Choose Draw Route To Site or Draw Route From Site to redraw.', 'warning');
}

function populateOverlayClassOptions() {
  const options = Object.entries(OVERLAY_CLASSES).filter(([id]) => classVisibleForDrawing(state.modeId, id));
  byId('overlayClass').innerHTML = options.map(([id, value]) => `<option value="${id}">${value.label}</option>`).join('');
  const selected = OVERLAY_CLASSES[byId('overlayClass').value];
  if (selected) byId('overlayColour').value = selected.colour;
}

function populateAppearanceControls() {
  const appearance = currentAppearance();
  byId('basemapColour').value = appearance.colour;
  byId('basemapEmphasis').value = appearance.emphasis;
  const output = currentOutput(); byId('outputPurpose').value = output.purpose; byId('issueConfirmed').checked = output.confirmed; byId('issueConfirmation').hidden = output.purpose !== 'client';
}

function initialiseControls() {
  byId('modeSelect').value = state.modeId;
  byId('overlayColour').innerHTML = CONTROLLED_COLOURS.map(colour => `<option value="${colour}">${colour}</option>`).join('');
  byId('busGroupColour').innerHTML = ['#ed1c24', '#0057e7', '#7f2a90', '#ec1ce8'].map(colour => `<option value="${colour}">${colour}</option>`).join('');
  populateAppearanceControls();
  populateOverlayClassOptions();
  byId('overlayClass').addEventListener('change', () => { byId('overlayColour').value = OVERLAY_CLASSES[byId('overlayClass').value].colour; });
  byId('modeSelect').addEventListener('change', event => {
    captureMetadata(); state.modeId = event.target.value; state.metadataByMode[state.modeId] ||= defaultMetadata(state.modeId);
    populateMetadata(); populateOverlayClassOptions(); populateAppearanceControls(); mapUi.setSource(reviewedSourceFeatures(), state.modeId); renderSourceStatus(); renderRoutingTools(); persist(); renderPreview();
  });
  metaInputs.forEach(input => input.addEventListener('input', captureMetadata));
  byId('searchAddress').addEventListener('click', searchAddress);
  byId('useCoordinates').addEventListener('click', () => setLocation(Number(byId('latitudeInput').value), Number(byId('longitudeInput').value)));
  byId('drawSite').addEventListener('click', () => mapUi.startSiteDrawing());
  byId('cancelDrawing').addEventListener('click', () => { mapUi.cancelDrawing(); setMessage('siteStatus', 'Drawing cancelled. Map navigation restored.', 'success'); });
  byId('clearSite').addEventListener('click', clearSite);
  byId('drawRouteTo').addEventListener('click', () => startRouteDrawing('route-to-site'));
  byId('drawRouteFrom').addEventListener('click', () => startRouteDrawing('route-from-site'));
  byId('cancelRouteDrawing').addEventListener('click', cancelRouteDrawing);
  byId('deleteRoutes').addEventListener('click', deleteRoutes);
  byId('approveSnappedRoutes').addEventListener('click', approveSnappedRoutes);
  byId('retryRoadSnap').addEventListener('click', retryRoadSnap);
  byId('acceptManualFallback').addEventListener('click', acceptManualFallback);
  byId('siteFile').addEventListener('change', async event => { const file = event.target.files[0]; if (file) { try { acceptSite(await readJson(file), 'Imported boundary'); } catch (error) { setMessage('siteStatus', error.message, 'error'); } } event.target.value = ''; });
  document.querySelectorAll('[data-draw-overlay]').forEach(button => button.addEventListener('click', () => { try { mapUi.startOverlayDrawing(button.dataset.drawOverlay, overlayMetadata()); } catch (error) { setMessage('overlayStatus', error.message, 'error'); } }));
  byId('overlayFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (file) try {
      extractOverlayFeatures(await readJson(file)).forEach(feature => {
        const base = overlayMetadata();
        const className = feature.properties.class || base.className;
        const route = ['route-to-site', 'route-from-site'].includes(className) ? { status: 'snap-review-required', roughGeometry: structuredClone(feature.geometry), selectionAuthority: 'planner', providerPurpose: 'manual-fallback-review', directionStatus: 'pending', reviewReason: 'Imported route requires direction review and explicit manual acceptance or road-snap retry.' } : null;
        state.overlayStore.add(feature, { ...base, className, label: feature.properties.label || feature.properties.name || base.label, layerName: feature.properties.layerName || base.layerName, colour: feature.properties.colour || base.colour, source: feature.properties.source || 'Imported planner geometry requiring review', route });
      });
      revalidateRouteDirections(false); persist(); renderOverlayRows();
    } catch (error) { setMessage('overlayStatus', error.message, 'error'); }
    event.target.value = '';
  });
  byId('downloadOverlays').addEventListener('click', () => downloadJson(`drawing-overlays-${BUILD}.geojson`, state.overlayStore.exportGeoJson()));
  byId('basemapColour').addEventListener('change', () => { state.appearanceByMode[state.modeId] = normaliseBasemapAppearance({ ...currentAppearance(), colour: byId('basemapColour').value }); persist(); renderPreview(); });
  byId('basemapEmphasis').addEventListener('change', () => { state.appearanceByMode[state.modeId] = normaliseBasemapAppearance({ ...currentAppearance(), emphasis: byId('basemapEmphasis').value }); persist(); renderPreview(); });
  byId('outputPurpose').addEventListener('change', () => { state.outputByMode[state.modeId] = { purpose: byId('outputPurpose').value, confirmed: false }; persist(); populateAppearanceControls(); renderPreview(); });
  byId('issueConfirmed').addEventListener('change', () => { currentOutput().confirmed = byId('issueConfirmed').checked; persist(); renderPreview(); });
  byId('groupSelectedBusRoutes').addEventListener('click', groupSelectedBusRoutes);
  byId('loadSources').addEventListener('click', retrieveSources);
  byId('generateDrawing').addEventListener('click', retrieveSources);
  byId('retryBasemap').addEventListener('click', () => { const basemap = currentBasemap(); basemap.requested = true; basemap.status = 'loading'; basemap.loaded = 0; basemap.total = 0; basemap.error = ''; renderPreview(); });
  byId('downloadSnapshot').addEventListener('click', () => { if (currentSource().snapshot) downloadJson(`drawing-source-${state.modeId}-${BUILD}.json`, { ...currentSource().snapshot, features: currentSource().features }); });
  byId('refreshPreview').addEventListener('click', renderPreview);
  byId('printDrawing').addEventListener('click', () => {
    if (currentBasemap().status !== 'success' || routingIssue()) return updateDrawingReadiness();
    window.print();
  });
}

initialiseControls(); populateMetadata();
if (state.location) { byId('latitudeInput').value = state.location.lat; byId('longitudeInput').value = state.location.lon; mapUi.setView(state.location.lat, state.location.lon); }
if (state.site) { try { state.site = extractSiteGeometry(state.site); mapUi.setSite(state.site); } catch { state.site = null; } }
migrateLegacyRoutesForReview();
renderOverlayRows(); renderSourceStatus(); renderRoutingTools(); renderPreview();
setTimeout(() => mapUi.invalidate(), 100);

if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  Object.defineProperty(window, '__DG0_ACCEPTANCE__', {
    value: Object.freeze({
      setMode(id) { if (!DRAWING_MODES[id]) throw new Error('Invalid mode'); state.modeId = id; byId('modeSelect').value = id; populateMetadata(); populateOverlayClassOptions(); populateAppearanceControls(); mapUi.setSource(reviewedSourceFeatures(), state.modeId); renderSourceStatus(); renderRoutingTools(); renderPreview(); },
      setLocation(lat, lon, label = 'Acceptance QA location') { setLocation(lat, lon, label); },
      setSite(geometry) { acceptSite(geometry, 'Synthetic acceptance fixture'); },
      setSource(features, snapshot = {}) { state.sourcesByMode[state.modeId] = { status: 'success', features: assessStationRailConsistency(features), snapshot: { attribution: OSM_ATTRIBUTION, provider: 'Synthetic acceptance fixture', ...snapshot } }; mapUi.setSource(reviewedSourceFeatures(), state.modeId); renderSourceStatus(); renderPreview(); },
      setSourceReview(sourceId, reviewState) { setSourceReviewState(sourceId, reviewState); },
      addOverlay(feature, metadata) { const record = state.overlayStore.add(feature, metadata); renderOverlayRows(); return record; },
      async addRoughRoute(geometry, className) {
        if (!['route-to-site', 'route-from-site'].includes(className)) throw new Error('Invalid route class');
        const definition = className === 'route-to-site' ? { label: 'ROUTE TO SITE', colour: '#ed1c24' } : { label: 'ROUTE FROM SITE', colour: '#0057e7' };
        const record = state.overlayStore.add({ type: 'Feature', properties: {}, geometry }, {
          className, layerName: 'Planner-guided road routing', label: definition.label, colour: definition.colour, visible: true,
          source: 'Planner-drawn waypoint guidance; road geometry pending review',
          route: { status: 'rough', roughGeometry: structuredClone(geometry), selectionAuthority: 'planner', providerPurpose: 'geometry-assistance-only', directionStatus: 'pending' }
        });
        renderOverlayRows(); await processRouteOverlay(record.id); return state.overlayStore.get(record.id);
      },
      async waitForRoutes() { await Promise.all([...routeJobs.values()]); return routeOverlays(); },
      approveRoutes() { approveSnappedRoutes(); return routeOverlays(); },
      acceptManualRoutes() { acceptManualFallback(); return routeOverlays(); },
      retryRoutes() { retryRoadSnap(); },
      clearOverlays() { state.overlayStore.clear(); renderOverlayRows(); },
      setBasemapProvider(provider) { state.basemapProvider = validateBasemapProvider(provider); invalidateBasemaps(); renderPreview(); },
      setRoadRoutingProvider(provider) { state.roadRoutingProvider = Object.freeze({ ...DEFAULT_ROAD_ROUTING_PROVIDER, ...provider }); },
      requestBasemap() { const basemap = currentBasemap(); basemap.requested = true; basemap.status = 'loading'; renderPreview(); },
      render: renderPreview,
      snapshot: () => ({ modeId: state.modeId, site: state.site, location: state.location, overlays: state.overlayStore.list(), source: currentSource(), reviewedSourceFeatures: reviewedSourceFeatures(), sourceReview: structuredClone(state.sourceReview), busGroups: structuredClone(currentBusGroups()), basemapAppearance: structuredClone(currentAppearance()), issuedExtent: mapUi.issuedExtent(), basemap: { ...currentBasemap(), providerId: state.basemapProvider.id, zoom: state.lastRender?.result.basemap?.zoom || null, tileCount: state.lastRender?.result.basemap?.tileCount || 0, maxAlignmentError: state.lastRender?.result.basemap?.maxAlignmentError || null }, metadata: structuredClone(metadata()), status: STATUS, drawingActive: mapUi.isDrawingActive(), navigationEnabled: mapUi.navigationEnabled(), activeRouteVertexCount: mapUi.activeVertexCount(), mapCenter: mapUi.mapCenter(), routingVisible: !byId('routingTools').hidden, advancedOpen: byId('advancedTools').open })
    }), configurable: false, enumerable: false, writable: false
  });
}
