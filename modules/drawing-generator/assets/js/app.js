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
  sourcesByMode: {},
  overlayStore: createOverlayStore(persisted.overlays || []),
  basemapByMode: {},
  basemapProvider: basemapProvider(),
  basemapRenderToken: 0,
  lastRender: null,
  activeDrawing: null
};
Object.keys(DRAWING_MODES).forEach(id => { state.metadataByMode[id] = { ...defaultMetadata(id), ...(state.metadataByMode[id] || {}) }; });

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ modeId: state.modeId, location: state.location, site: state.site, metadataByMode: state.metadataByMode, overlays: state.overlayStore.list() }));
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
  const classes = new Set(currentSource().features.map(item => item.properties?.class));
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
  const source = currentSource();
  const basemap = currentBasemap();
  const result = renderDrawingSvg({ modeId: state.modeId, centerBng: drawingCentre(), site: state.site, sourceFeatures: source.features, overlays: state.overlayStore.list(), sourceStatus: source.status, includeBasemap: basemap.requested, basemapProvider: state.basemapProvider, basemapStatus: basemap.status });
  byId('sheetMap').innerHTML = result.markup;
  byId('sheetLegend').innerHTML = legendMarkup(result.legend);
  byId('drawingSheet').className = `drawing-sheet layout-${mode.family}`;
  document.querySelectorAll('[data-sheet-meta]').forEach(element => { const value = metadata()[element.dataset.sheetMeta]; element.textContent = value || '-'; });
  byId('sheetAttribution').textContent = `${state.basemapProvider.attribution} | Basemap: ${state.basemapProvider.name}; professional overlays: ${source.snapshot?.provider || 'reviewed/manual evidence'}.`;
  byId('sheetExtent').textContent = `BNG extent ${result.extent.groundWidth.toFixed(0)} m x ${result.extent.groundHeight.toFixed(0)} m - A3 @ 1:${mode.scale.toLocaleString('en-GB')}`;
  const missing = mode.requiredClasses.filter(className => !availableClasses().has(className));
  const scaleMatches = scaleMetadataMatches(mode);
  state.lastRender = { modeId: state.modeId, result, missing, scaleMatches };
  updateDrawingReadiness();
  monitorBasemapTiles(result);
}

function updateDrawingReadiness() {
  const record = state.lastRender;
  if (!record || record.modeId !== state.modeId) return;
  const mode = modeConfig(state.modeId);
  const basemap = currentBasemap();
  const blockPrint = !record.scaleMatches || basemap.status !== 'success';
  byId('printDrawing').disabled = blockPrint;
  if (!record.scaleMatches) setMessage('drawingStatus', `Print blocked: scale metadata must be 1:${mode.scale.toLocaleString('en-GB')} for ${mode.title}.`, 'error');
  else if (basemap.status === 'failed') setMessage('drawingStatus', 'BASEMAP FAILED TO LOAD - REVIEW REQUIRED. Controlled overlays remain intact; retry Generate / refresh drawing.', 'error');
  else if (!basemap.requested) setMessage('drawingStatus', 'Generate the drawing to load the rendered OpenStreetMap basemap before printing.', 'warning');
  else if (basemap.status === 'loading') setMessage('drawingStatus', `Loading rendered OpenStreetMap basemap (${basemap.loaded}/${basemap.total || record.result.basemap?.tileCount || 0} tiles).`, 'warning');
  else if (!state.site) setMessage('drawingStatus', `Not issue-ready: no confirmed site boundary. Missing layer evidence: ${record.missing.join(', ') || 'none'}.`, 'warning');
  else if (record.missing.length) setMessage('drawingStatus', `Basemap ready. Required professional layers without current evidence: ${record.missing.join(', ')}. Add reviewed overlays or retrieve source data.`, 'warning');
  else setMessage('drawingStatus', 'Basemap and configured layer classes are present. Professional content and route approval are still required.', 'success');
}

function setBasemapDomStatus(status) {
  const svg = byId('drawingSvg');
  if (!svg) return;
  svg.dataset.basemapStatus = status;
  const warning = byId('basemapFailureWarning');
  if (warning) warning.setAttribute('visibility', status === 'failed' ? 'visible' : 'hidden');
}

function monitorBasemapTiles(result) {
  const basemap = currentBasemap();
  if (!basemap.requested || !result.basemap) return updateDrawingReadiness();
  const images = [...byId('sheetMap').querySelectorAll('[data-basemap-tile]')];
  const token = ++state.basemapRenderToken;
  basemap.status = 'loading'; basemap.loaded = 0; basemap.total = images.length; basemap.error = '';
  setBasemapDomStatus('loading'); updateDrawingReadiness();
  if (!images.length) {
    basemap.status = 'failed'; basemap.error = 'No tile images were composed.'; setBasemapDomStatus('failed'); updateDrawingReadiness(); return;
  }
  let settled = 0;
  let failed = false;
  const settle = error => {
    if (token !== state.basemapRenderToken) return;
    settled += 1;
    if (error) { failed = true; basemap.error ||= error; }
    else basemap.loaded += 1;
    if (settled < images.length) { updateDrawingReadiness(); return; }
    basemap.status = failed ? 'failed' : 'success';
    setBasemapDomStatus(basemap.status);
    byId('workflowStatus').textContent = failed ? 'Basemap failed to load. Retry; professional overlays remain intact.' : `Drawing basemap ready from ${state.basemapProvider.name}. Review professional overlays before printing.`;
    updateDrawingReadiness();
  };
  images.forEach((image, index) => {
    image.addEventListener('load', () => settle(''), { once: true });
    image.addEventListener('error', () => settle(`Tile ${index + 1} failed.`), { once: true });
  });
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
    <td><input class="overlay-layer" value="${escapeHtml(item.properties.layerName)}"></td>
    <td><select class="overlay-class">${Object.entries(OVERLAY_CLASSES).map(([id, value]) => `<option value="${id}" ${id === item.properties.class ? 'selected' : ''}>${escapeHtml(value.label)}</option>`).join('')}</select></td>
    <td><input class="overlay-label" value="${escapeHtml(item.properties.label)}"></td>
    <td><select class="overlay-colour">${CONTROLLED_COLOURS.map(colour => `<option value="${colour}" ${colour === item.properties.colour ? 'selected' : ''}>${colour}</option>`).join('')}</select></td>
    <td><button class="remove-overlay">Delete</button></td>
  </tr>`).join('');
  tbody.querySelectorAll('tr').forEach(row => {
    const id = row.dataset.overlayId;
    const update = () => {
      try {
        state.overlayStore.update(id, { visible: row.querySelector('.overlay-visible').checked, layerName: row.querySelector('.overlay-layer').value, class: row.querySelector('.overlay-class').value, label: row.querySelector('.overlay-label').value, colour: row.querySelector('.overlay-colour').value });
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
  onSiteChanged: geometry => acceptSite(geometry, 'Edited boundary'),
  onSiteDeleted: () => clearSite(),
  onOverlayCreated: (feature, meta) => { const record = state.overlayStore.add(feature, meta); persist(); queueMicrotask(() => { renderOverlayRows(); renderRoutingTools(); }); return record; },
  onOverlayChanged: (id, geometry) => { state.overlayStore.update(id, { geometry }); persist(); queueMicrotask(renderOverlayRows); },
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
    if (routeDrawing) setMessage('routeStatus', `${detail.metadata.label} drawing active. Complete the line or choose Cancel route drawing.`, 'warning');
    if (!active) renderRoutingTools();
  }
});

function acceptSite(input, origin = 'Boundary') {
  try {
    state.site = extractSiteGeometry(input);
    invalidateBasemaps(); mapUi.setSite(state.site); persist(); renderPreview();
    setMessage('siteStatus', `${origin} accepted as explicit site geometry. Address/location point remains separate.`, 'success');
  } catch (error) { setMessage('siteStatus', error.message, 'error'); }
}

function clearSite() {
  state.site = null; invalidateBasemaps(); mapUi.clearSite(); persist(); renderPreview();
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
  renderCommunityCandidates();
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
    state.sourcesByMode[state.modeId] = source; mapUi.setSource(source.features); renderSourceStatus(); renderPreview();
    if (currentBasemap().status !== 'failed') byId('workflowStatus').textContent = 'Professional source refreshed; waiting for the rendered basemap if still loading.';
    return true;
  } catch (error) {
    state.sourcesByMode[state.modeId] = { status: 'failed', features: [], snapshot: null, error: `${error.message}${error.details?.failures ? ` ${error.details.failures.map(item => `${item.endpoint}: ${item.kind}`).join('; ')}` : ''}` };
    mapUi.setSource([]); renderSourceStatus(); renderPreview();
    byId('workflowStatus').textContent = 'Professional vector evidence could not be loaded. The rendered basemap and reviewed manual overlays remain separate.';
    return false;
  } finally { byId('loadSources').disabled = false; byId('generateDrawing').disabled = false; }
}

function renderCommunityCandidates() {
  const candidates = currentSource().features.filter(item => item.properties?.class === 'community-candidate');
  byId('communityPanel').hidden = state.modeId !== 'local-context' || !candidates.length;
  byId('communityCandidates').innerHTML = candidates.map((item, index) => `<div class="candidate-card" data-index="${index}"><strong>${escapeHtml(item.properties.name || 'Unnamed mapped feature')}</strong><span>${escapeHtml(item.properties.category || 'Unclassified')}</span><button>Add as reviewed consideration</button></div>`).join('');
  byId('communityCandidates').querySelectorAll('.candidate-card').forEach(card => card.querySelector('button').addEventListener('click', () => {
    const item = candidates[Number(card.dataset.index)];
    state.overlayStore.add(item, { className: 'community', label: item.properties.name || item.properties.category, layerName: 'Community considerations', colour: '#666666', source: item.properties.sourceId });
    persist(); renderOverlayRows();
  }));
}

function isRoutingMode() { return state.modeId.endsWith('-routing'); }

function routeOverlays() {
  return state.overlayStore.list().filter(item => ['route-to-site', 'route-from-site'].includes(item.properties.class));
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
  if (!active) setMessage('routeStatus', routes.length
    ? `${toCount} route-to-site and ${fromCount} route-from-site line${routes.length === 1 ? '' : 's'} retained. Delete/redraw only after planner review.`
    : 'No planner-approved routing lines added. Choose a direction to begin drawing.', routes.length ? 'success' : 'warning');
}

function startRouteDrawing(className) {
  const definition = className === 'route-to-site'
    ? { label: 'ROUTE TO SITE', colour: '#ed1c24' }
    : { label: 'ROUTE FROM SITE', colour: '#0057e7' };
  mapUi.startOverlayDrawing('LineString', { className, layerName: 'Planner-approved routing', label: definition.label, colour: definition.colour, visible: true });
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

function initialiseControls() {
  byId('modeSelect').value = state.modeId;
  byId('overlayColour').innerHTML = CONTROLLED_COLOURS.map(colour => `<option value="${colour}">${colour}</option>`).join('');
  populateOverlayClassOptions();
  byId('overlayClass').addEventListener('change', () => { byId('overlayColour').value = OVERLAY_CLASSES[byId('overlayClass').value].colour; });
  byId('modeSelect').addEventListener('change', event => {
    captureMetadata(); state.modeId = event.target.value; state.metadataByMode[state.modeId] ||= defaultMetadata(state.modeId);
    populateMetadata(); populateOverlayClassOptions(); mapUi.setSource(currentSource().features); renderSourceStatus(); renderRoutingTools(); persist(); renderPreview();
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
  byId('siteFile').addEventListener('change', async event => { const file = event.target.files[0]; if (file) { try { acceptSite(await readJson(file), 'Imported boundary'); } catch (error) { setMessage('siteStatus', error.message, 'error'); } } event.target.value = ''; });
  document.querySelectorAll('[data-draw-overlay]').forEach(button => button.addEventListener('click', () => { try { mapUi.startOverlayDrawing(button.dataset.drawOverlay, overlayMetadata()); } catch (error) { setMessage('overlayStatus', error.message, 'error'); } }));
  byId('overlayFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (file) try { extractOverlayFeatures(await readJson(file)).forEach(feature => state.overlayStore.add(feature, { ...overlayMetadata(), className: feature.properties.class || overlayMetadata().className, label: feature.properties.label || feature.properties.name || overlayMetadata().label, layerName: feature.properties.layerName || overlayMetadata().layerName, colour: feature.properties.colour || overlayMetadata().colour })); persist(); renderOverlayRows(); } catch (error) { setMessage('overlayStatus', error.message, 'error'); }
    event.target.value = '';
  });
  byId('downloadOverlays').addEventListener('click', () => downloadJson(`drawing-overlays-${BUILD}.geojson`, state.overlayStore.exportGeoJson()));
  byId('loadSources').addEventListener('click', retrieveSources);
  byId('generateDrawing').addEventListener('click', retrieveSources);
  byId('downloadSnapshot').addEventListener('click', () => { if (currentSource().snapshot) downloadJson(`drawing-source-${state.modeId}-${BUILD}.json`, { ...currentSource().snapshot, features: currentSource().features }); });
  byId('refreshPreview').addEventListener('click', renderPreview);
  byId('printDrawing').addEventListener('click', () => {
    if (currentBasemap().status !== 'success') return updateDrawingReadiness();
    window.print();
  });
}

initialiseControls(); populateMetadata();
if (state.location) { byId('latitudeInput').value = state.location.lat; byId('longitudeInput').value = state.location.lon; mapUi.setView(state.location.lat, state.location.lon); }
if (state.site) { try { state.site = extractSiteGeometry(state.site); mapUi.setSite(state.site); } catch { state.site = null; } }
renderOverlayRows(); renderSourceStatus(); renderRoutingTools(); renderPreview();
setTimeout(() => mapUi.invalidate(), 100);

if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  Object.defineProperty(window, '__DG0_ACCEPTANCE__', {
    value: Object.freeze({
      setMode(id) { if (!DRAWING_MODES[id]) throw new Error('Invalid mode'); state.modeId = id; byId('modeSelect').value = id; populateMetadata(); populateOverlayClassOptions(); mapUi.setSource(currentSource().features); renderSourceStatus(); renderRoutingTools(); renderPreview(); },
      setLocation(lat, lon, label = 'Acceptance QA location') { setLocation(lat, lon, label); },
      setSite(geometry) { acceptSite(geometry, 'Synthetic acceptance fixture'); },
      setSource(features, snapshot = {}) { state.sourcesByMode[state.modeId] = { status: 'success', features, snapshot: { attribution: OSM_ATTRIBUTION, provider: 'Synthetic acceptance fixture', ...snapshot } }; mapUi.setSource(features); renderSourceStatus(); renderPreview(); },
      addOverlay(feature, metadata) { const record = state.overlayStore.add(feature, metadata); renderOverlayRows(); return record; },
      clearOverlays() { state.overlayStore.clear(); renderOverlayRows(); },
      setBasemapProvider(provider) { state.basemapProvider = validateBasemapProvider(provider); invalidateBasemaps(); renderPreview(); },
      requestBasemap() { const basemap = currentBasemap(); basemap.requested = true; basemap.status = 'loading'; renderPreview(); },
      render: renderPreview,
      snapshot: () => ({ modeId: state.modeId, site: state.site, location: state.location, overlays: state.overlayStore.list(), source: currentSource(), basemap: { ...currentBasemap(), providerId: state.basemapProvider.id, zoom: state.lastRender?.result.basemap?.zoom || null, tileCount: state.lastRender?.result.basemap?.tileCount || 0, maxAlignmentError: state.lastRender?.result.basemap?.maxAlignmentError || null }, metadata: structuredClone(metadata()), status: STATUS, drawingActive: mapUi.isDrawingActive(), navigationEnabled: mapUi.navigationEnabled(), routingVisible: !byId('routingTools').hidden, advancedOpen: byId('advancedTools').open })
    }), configurable: false, enumerable: false, writable: false
  });
}
