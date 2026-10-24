import { createSiteSelector } from '../../../src/atlas/application/site-selector.mjs';
import { SITE_LOCATION_METHODS } from '../../../src/atlas/domain/site.mjs';
import { isGreaterLondonPoint } from '../../../src/atlas/domain/geography.mjs';
import { createJsonCache } from '../../../src/atlas/infrastructure/cache.mjs';
import { createAtlasDataSourceResolver } from '../../../src/atlas/infrastructure/atlas-data-sources.mjs';
import { atlasDataSources } from '../../../atlas/config/atlas-data-sources.mjs';
import { createAtlasReferenceData } from '../../../src/atlas/reference-data/atlas-reference-data.mjs';
import { createNominatimGeocodingAdapter } from '../../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createTflBusStopAdapter } from '../../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createPreparedBusDataAdapter } from '../../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createTflBusTimetableAdapter } from '../../../src/atlas/adapters/tfl-bus-timetable-adapter.mjs';
import { createTflIbusOperatorAdapter } from '../../../src/atlas/adapters/tfl-ibus-operator-adapter.mjs';
import { createAuthoritativeBusTimetableAdapter } from '../../../src/atlas/adapters/authoritative-bus-timetable-adapter.mjs';
import { createOsrmAccessRoutingAdapter } from '../../../src/atlas/adapters/osrm-access-routing-adapter.mjs';
import { createTflRequestScheduler } from '../../../src/atlas/adapters/tfl-request-scheduler.mjs';
import { createBusStopDiscovery } from '../../../src/atlas/application/bus-stop-discovery.mjs';
import { createBusAssessment, TFL_SAFE_DETAILED_PAIR_LIMIT } from '../../../src/atlas/application/bus-assessment.mjs';
import { buildBusTransportStatement, buildBusWordTables, busWordFilename } from '../../../src/atlas/presentation/bus-word-export.mjs';
import { withNumericMapReferences } from '../../../src/atlas/presentation/bus-map-references.mjs';
import { layoutNumberedMapMarkers } from '../../../src/atlas/presentation/bus-map-layout.mjs';
import { createAtlasTaskStatus } from '../../../src/atlas/presentation/atlas-task-status.mjs';
import { buildBusTimetablePresentationNote, buildPlannerBusServiceSummaries, plannerRouteDisplayNumber, PLANNER_TERMINUS_PRESENTATION_NOTE } from '../../../src/atlas/domain/bus-planner-summary.mjs';
import { buildServicePresentation, formatServiceOriginDestination } from '../../../src/atlas/domain/bus-service-assessment.mjs';
import { buildStopDiscoverySourceLabel, buildTimetableSourcePresentation, isOtherNearbyStopRecord, partialTimetableQualification, plannerFacingServiceNote, stopRoutesPresentation } from '../../../src/atlas/domain/bus-source-presentation.mjs';
import { plannerStopWarning, recommendedBusStop } from '../../../src/atlas/domain/bus-planner-trust.mjs';
import { downloadWordDocument } from '../../../assets/js/word-export.js';

const $ = id => document.getElementById(id);
const diagnosticMode = new URLSearchParams(window.location.search).get('diagnostics') === '1';
if (diagnosticMode && $('developerDiagnostics')) $('developerDiagnostics').hidden = false;
const declaredTestBuild = String(document.body.dataset.atlasTestBuild || document.documentElement.dataset.atlasTestBuild || '').trim();
document.querySelectorAll('body [data-atlas-test-build]').forEach(element => {
  element.textContent = declaredTestBuild ? `Development/Test build · ${declaredTestBuild}` : 'Development/Test build · not declared';
});
const taskStatus = createAtlasTaskStatus({ messageElement: $('taskStatusMessage'), regionElement: $('taskStatus'), progressElement: $('taskStatusProgress'), countElement: $('taskStatusProgressText'), stageElements: [...document.querySelectorAll('[data-task-stage]')] });
const cache = createJsonCache({ storage: localStorage, namespace: 'atlas.alpha13' });
const geocoder = createNominatimGeocodingAdapter({ cache });
const tflRequestScheduler = createTflRequestScheduler({ onEvent: event => taskStatus.update(event) });
const tfl = createTflBusStopAdapter({ cache, requestScheduler: tflRequestScheduler });
const isV2Review = new URL(window.location.href).searchParams.get('review') === 'v2';
const v2DataBaseUrl = isV2Review ? `${window.location.origin}/__atlas-review/v2-data/` : null;
const atlasData = createAtlasDataSourceResolver(isV2Review ? {
  ...atlasDataSources,
  datasets: {
    ...atlasDataSources.datasets,
    bus: { ...atlasDataSources.datasets.bus, baseUrl: `${v2DataBaseUrl}bus/` },
    tnds: { ...atlasDataSources.datasets.tnds, baseUrl: `${v2DataBaseUrl}bus-tnds/` }
  }
} : atlasDataSources);
const preparedBusData = createPreparedBusDataAdapter({
  baseUrl: atlasData.baseUrl('bus'),
  tndsBaseUrl: atlasData.baseUrl('tnds'),
  busFileUrl: relativePath => atlasData.fileUrl('bus', relativePath),
  tndsFileUrl: relativePath => atlasData.fileUrl('tnds', relativePath)
});
const referenceData = createAtlasReferenceData({ adapter: preparedBusData });
const tflTimetable = createTflBusTimetableAdapter({ cache, requestScheduler: tflRequestScheduler });
const tflIbusOperatorAdapter = createTflIbusOperatorAdapter({
  fetchImpl: globalThis.fetch,
  manifestUrl: new URL('../../data/tfl-ibus/manifest.json', import.meta.url).toString()
});
const authoritativeTimetable = createAuthoritativeBusTimetableAdapter({ tflAdapter: tflTimetable, tflIbusOperatorAdapter, nationalAdapter: preparedBusData, londonSupplementAdapter: preparedBusData });
const accessRouting = createOsrmAccessRoutingAdapter();
const busStops = createBusStopDiscovery({ tflAdapter: tfl, naptanAdapter: preparedBusData, referenceData, crossBoundaryTfL: true });
const busAssessment = createBusAssessment({ stopDiscovery: busStops, timetableData: authoritativeTimetable, accessRouting, referenceData });
const selector = createSiteSelector();
const views = ['modules', 'bus', 'about'];
const METHOD_LABELS = Object.freeze({
  [SITE_LOCATION_METHODS.GEOCODED_CANDIDATE]: 'From address result',
  [SITE_LOCATION_METHODS.PLANNER_ADJUSTED]: 'Adjusted on map',
  [SITE_LOCATION_METHODS.MAP_SELECTED]: 'Chosen on map',
  [SITE_LOCATION_METHODS.COORDINATES_ENTERED]: 'Entered coordinates'
});
let confirmedSite = null;
let map = null;
let mapExportContext = null;
let assessmentMarker = null;
let radiusCircle = null;
let busStopMarkers = [];
let routeLayers = [];
let currentBusResult = null;
let pendingScopeDiscovery = null;
let pendingScopeContext = null;
let lastAssessmentMode = 'full';
let selectedStopIds = new Set();
let selectedServiceIds = new Set();
let selectionInitialised = false;
let detailedEvidenceVisible = false;
let radiusTouched = false;
let workflowStage = 1;

function stopKey(stop) { return String(stop?.id || stop?.sourceId || ''); }
function serviceKey(service) { return String(service?.id || `${service?.routeNumber}|${service?.operator}|${service?.origin}|${service?.destination}`); }
function selectedResult() {
  if (!currentBusResult) return null;
  const stops = currentBusResult.stops.filter(stop => selectedStopIds.has(stopKey(stop)));
  const stopIds = new Set(stops.map(stopKey));
  const sourceServices = Array.isArray(currentBusResult.plannerServiceSummaries)
    ? currentBusResult.plannerServiceSummaries
    : buildPlannerBusServiceSummaries(currentBusResult.serviceSummaries, currentBusResult.stops);
  const plannerServiceSummaries = sourceServices.filter(service => selectedServiceIds.has(serviceKey(service)) && service.stopIds?.some(id => stopIds.has(String(id))));
  const serviceSummaries = currentBusResult.serviceSummaries.filter(service => service.stopIds?.some(id => stopIds.has(String(id))));
  const report = { ...currentBusResult, stops, serviceSummaries, plannerServiceSummaries };
  report.wording = assessmentWording(report, plannerServiceSummaries);
  return report;
}

async function refreshDataStatus() {
  const message = $('dataStatusMessage');
  try {
    const response = await fetch(isV2Review ? `${v2DataBaseUrl}status/manifest.json` : 'data/status/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('status unavailable');
    const status = await response.json();
    $('preparedDataDate').textContent = formatTime(status.successfulRefreshAt);
    const sourceMessage = (outcome, noun = 'data') => ({ UPDATED: `Updated successfully — new ${noun} detected`, CHECKED_NO_CHANGE: 'Checked successfully — no changes detected', FAILED: 'Refresh failed — last validated data remains in use', LIVE: 'Live source — checked when a London assessment is run' }[outcome] || 'Status not supplied');
    $('naptanDataState').textContent = sourceMessage(status.sources?.naptan?.outcome, 'stop data');
    $('bodsDataState').textContent = sourceMessage(status.sources?.bods?.outcome, 'timetable data');
    const tnds = sourceMessage(status.sources?.tnds?.outcome, 'supplementary timetable data');
    $('tndsDataDate').textContent = `${tnds} · ${status.sources?.tnds?.regionsChecked?.length || 0} England regions checked`;
    $('tflDataState').textContent = sourceMessage(status.sources?.tfl?.outcome || 'LIVE');
    const age = Date.now() - new Date(status.successfulRefreshAt).getTime();
    if (Number.isFinite(age) && age > 8 * 24 * 60 * 60 * 1000) {
      message.textContent = `Bus data: Review needed — last validated data from ${formatTime(status.successfulRefreshAt)}.`;
      message.className = 'status-message warning';
    } else {
      message.textContent = 'Bus data: Current ✓';
      message.className = 'status-message success';
    }
  } catch { message.textContent = 'Bus data: Status unavailable'; message.className = 'status-message warning'; }
  const badge = $('busDataCurrent');
  if (badge) {
    badge.textContent = message.textContent;
    badge.className = `current-badge${message.classList.contains('warning') ? ' warning' : ''}`;
  }
}

async function updateBusData() {
  const button = $('updateBusData'); button.disabled = true;
  try {
    const response = await fetch('/__atlas-review/update-bus-data', { method: 'POST' });
    if (!response.ok) throw new Error('unavailable');
    setCallout($('stopStatus'), 'Bus data updater opened in a secure local window. Complete the update there, then return here and refresh the data status.', 'success');
  } catch { setCallout($('stopStatus'), 'Bus data updates are available from the local ATLAS maintenance environment.', 'warning'); }
  finally { button.disabled = false; }
}

function showView(name) {
  const selected = views.includes(name) ? name : 'modules';
  document.querySelectorAll('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== selected; });
  document.querySelectorAll('nav [data-view]').forEach(button => {
    const active = button.dataset.view === (selected === 'bus' ? 'modules' : selected);
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (location.hash !== `#${selected}`) history.replaceState(null, '', `#${selected}`);
  if ((selected === 'modules' || selected === 'bus') && map) setTimeout(() => map.invalidateSize({ pan: false, animate: false }), 0);
}

function activateWorkflowStage(stage) {
  const next = Math.max(1, Math.min(6, Number(stage) || 1));
  if (next >= 5 && !currentBusResult) { setCallout($('workflowHint'), 'Run the assessment before viewing Results.'); return; }
  if (next >= 2 && !selector.getSnapshot().site) { setCallout($('workflowHint'), 'Find a location before confirming the assessment point.'); return; }
  if (next >= 3 && !confirmedSite) { setCallout($('workflowHint'), 'Confirm the assessment point before choosing assessment settings.'); return; }
  workflowStage = next;
  $('workflowHint').textContent = '';
  if (next === 5 || next === 6) showView('bus');
  if (next === 6) {
    try { mapExportContext = captureMapExportContext() || mapExportContext; } catch { /* Export context is best-effort; it must not block the workflow. */ }
  }
  document.body.dataset.busWorkflowStage = String(next);
  const layout = document.querySelector('.workflow-layout');
  const evidencePanel = $('evidencePanel');
  const exportPanel = $('exportWorkspace');
  layout.hidden = next >= 5;
  evidencePanel.hidden = next !== 5;
  exportPanel.hidden = next !== 6;
  $('site-step-card').classList.toggle('workflow-active', next === 1);
  $('location-step-card').classList.toggle('workflow-active', next === 2);
  $('confirm-point-step-card').classList.toggle('workflow-active', next === 2);
  $('confirm-point-step-card').classList.toggle('workflow-supporting', next === 2);
  $('assessment-step-card').classList.toggle('workflow-active', next === 3 || next === 4);
  $('assessment-step-card').querySelector('.step-number').textContent = next === 3 ? '3' : '4';
  $('assessmentSettingsPanel').hidden = next !== 3;
  $('assessmentRunPanel').hidden = next !== 4;
  $('assessmentSetupContent').hidden = false;
  $('siteSetupContent').hidden = false;
  $('locationSetupContent').hidden = false;
  $('confirmSetupContent').hidden = false;
  $('siteStageSummary').hidden = true;
  $('assessmentStageSummary').hidden = true;
  document.querySelectorAll('[data-workflow-step]').forEach(button => {
    const buttonStage = Number(button.dataset.workflowStep);
    button.classList.toggle('active', buttonStage === next);
    button.classList.toggle('complete', buttonStage < next);
    button.disabled = (buttonStage === 2 && !selector.getSnapshot().site)
      || ((buttonStage === 3 || buttonStage === 4) && !confirmedSite)
      ;
    button.setAttribute('aria-disabled', String((buttonStage === 5 || buttonStage === 6) && !currentBusResult));
    if (buttonStage === next) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
  $('mapStageHint').textContent = ({
    1: 'Search for a site or choose a point on the map.',
    2: 'Check the address and adjust the point if needed.',
    3: 'The selected radius is shown around the assessment point.',
    4: 'The map updates as stops and access evidence are checked.'
  })[next] || 'Assessment map and deterministic stop references.';
  if (next < 5) moveResultsMap(false);
  if (next === 5) moveResultsMap(true);
  setTimeout(() => map?.invalidateSize({ pan: false, animate: false }), 0);
}

function setCallout(element, message, state = 'neutral') {
  element.className = `callout ${state}`;
  element.textContent = message;
}

function formatTime(value) {
  if (!value) return 'Not supplied';
  const date = new Date(value);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${day} at ${time}`;
}

function plannerFailure(kind, result) {
  if (result.code === 'invalid_request') return result.message.replace(/Site/g, 'site');
  if (kind === 'address') return 'Site search is temporarily unavailable. Try Find site again, or choose the assessment point on the map.';
  if (result.stage === 'nearest') return 'Walking routes could not be checked, so ATLAS did not choose a nearest bus stop group. Try again or use the full Bus assessment.';
  if (result.code === 'coverage_not_implemented') return 'Bus-stop coverage outside Greater London is not connected in this browser yet. The confirmed point was not treated as a zero-stop result.';
  if (result.code === 'invalid_response') return 'The authoritative bus source returned information ATLAS could not safely interpret. No result has been assumed.';
  return 'Bus information is temporarily unavailable. Please try again shortly.';
}

function assessmentWording(result, services, selectedIds = null) {
  const presented = (services ?? []).filter(service => !selectedIds || (selectedIds.has(serviceKey(service)) && service.stopIds?.some(id => result.stops.some(stop => selectedIds.has(stopKey(stop)) && String(id) === stopKey(stop)))));
  return buildBusTransportStatement(result, { services: presented, nearestGroupName: result.nearestGroup?.name ?? null });
}

function plannerAnnotationEntries(service) {
  const notes = service?.plannerNotes ?? {};
  const sentence = value => String(value ?? '').trim().replace(/[.]+$/u, '');
  return [
    notes.terminus ? ['Route terminus', `${sentence(notes.terminus)}.`] : null,
    notes.additionalServices ? ['Additional services', `${sentence(notes.additionalServices)}.`] : null,
    notes.shortWorkings ? ['Short workings', `${sentence(notes.shortWorkings)}.`] : null,
    notes.serviceQualification ? ['Service qualification', `${sentence(notes.serviceQualification)}.`] : null,
    notes.circularService ? ['Circular service', notes.circularService] : null,
    notes.reviewNote ? ['Review note', notes.reviewNote] : null
  ].filter(Boolean);
}

function plannerAnnotationClass(label) {
  if (/^route terminus$/i.test(String(label ?? '').trim())) return 'terminus';
  return String(label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'review-note';
}

function providerLabel(result) {
  return buildStopDiscoverySourceLabel(result?.provenance);
}

function assessmentMethod(site) {
  if (site?.assessmentPoint?.method === SITE_LOCATION_METHODS.GEOCODED_CANDIDATE && site.validation?.state === 'confirmed') return 'Confirmed from address';
  return METHOD_LABELS[site?.assessmentPoint?.method] || 'Selected by planner';
}

function moveResultsMap(showResults) {
  const frame = $('siteMapFrame');
  const target = showResults ? $('resultsMapHost') : $('persistentMapHost');
  if (!frame || !target || frame.parentElement === target) return;
  target.append(frame);
  setTimeout(() => map?.invalidateSize({ pan: false, animate: false }), 0);
}

function captureMapExportContext() {
  const leafletMap = map;
  const tileLayer = Object.values(leafletMap?._layers ?? {}).find(layer => layer instanceof window.L.TileLayer);
  const zoom = leafletMap?.getZoom();
  const pixelOrigin = leafletMap?.getPixelOrigin();
  const measuredSize = leafletMap?.getSize();
  if (!tileLayer || !pixelOrigin || !zoom || !measuredSize?.x || !measuredSize?.y) return null;
  const tiles = Object.values(tileLayer._tiles ?? {})
    .filter(tile => tile.coords?.z === zoom && tile.el?.complete && tile.el.naturalWidth)
    .map(tile => ({ x: Number(tile.coords.x), y: Number(tile.coords.y), src: tile.el.src }));
  if (!tiles.length) return null;
  return {
    zoom,
    pixelOrigin: { x: Number(pixelOrigin.x), y: Number(pixelOrigin.y) },
    size: { x: Number(measuredSize.x), y: Number(measuredSize.y) },
    tiles
  };
}

function collapseSiteSetup(collapsed) {
  $('siteStageSummary').hidden = !collapsed;
  if (collapsed) $('siteStageSummaryText').textContent = `${confirmedSite?.displayAddress || confirmedSite?.suppliedAddress || 'Assessment point'} · Assessment point confirmed`;
}

function collapseAssessmentSetup(collapsed) {
  $('assessmentStageSummary').hidden = !collapsed;
  if (collapsed) $('assessmentStageSummaryText').textContent = `${lastAssessmentMode === 'nearest' ? 'Nearest stop assessment' : 'Full assessment'} · ${selectedRadius()} m radius`;
}

function clearBusEvidence(message = 'Confirm the assessment point before checking nearby bus stops.') {
  const hadEvidence = !$('evidencePanel').hidden;
  confirmedSite = null;
  radiusTouched = false;
  detailedEvidenceVisible = false;
  currentBusResult = null;
  mapExportContext = null;
  pendingScopeDiscovery = null;
  pendingScopeContext = null;
  busStopMarkers.forEach(marker => map?.removeLayer(marker));
  busStopMarkers = [];
  routeLayers.forEach(layer => map?.removeLayer(layer));
  routeLayers = [];
  if (radiusCircle) { map?.removeLayer(radiusCircle); radiusCircle = null; }
  $('findStops').disabled = true;
  $('findNearestStops').disabled = true;
  $('refreshStops').disabled = true;
  $('exportBusWord').disabled = true;
  $('exportAssessmentMap').disabled = true;
  $('plannerReviewAcknowledgement').checked = false;
  $('plannerReviewGate').hidden = true;
  $('evidencePanel').hidden = true;
  $('exportWorkspace').hidden = true;
  $('evidenceRows').replaceChildren();
  $('serviceRows').replaceChildren();
  $('assessmentWording').textContent = '';
  $('clearRoutes').hidden = true;
  selectedStopIds = new Set(); selectedServiceIds = new Set(); selectionInitialised = false;
  collapseSiteSetup(false);
  collapseAssessmentSetup(false);
  moveResultsMap(false);
  taskStatus.reset();
  setCallout($('stopStatus'), hadEvidence ? 'The assessment point changed, so the earlier bus results were cleared. Confirm the new point before checking again.' : message, hadEvidence ? 'warning' : 'neutral');
}

function clearStaleBusAssessment() {
  const scopeVisible = !$('assessmentScope').hidden;
  if (!currentBusResult && !scopeVisible && !pendingScopeDiscovery) return;
  currentBusResult = null;
  pendingScopeDiscovery = null;
  pendingScopeContext = null;
  detailedEvidenceVisible = false;
  busStopMarkers.forEach(marker => map?.removeLayer(marker));
  busStopMarkers = [];
  routeLayers.forEach(layer => map?.removeLayer(layer));
  routeLayers = [];
  $('exportBusWord').disabled = true;
  $('exportAssessmentMap').disabled = true;
  $('evidencePanel').hidden = true;
  $('exportWorkspace').hidden = true;
  $('assessmentScope').replaceChildren();
  $('assessmentScope').hidden = true;
  $('evidenceRows').replaceChildren();
  $('serviceRows').replaceChildren();
  $('assessmentWording').textContent = '';
  $('clearRoutes').hidden = true;
  selectedStopIds = new Set();
  selectedServiceIds = new Set();
  selectionInitialised = false;
  collapseAssessmentSetup(false);
  moveResultsMap(false);
  taskStatus.reset();
  setCallout($('stopStatus'), 'The assessment radius changed. Build the Bus assessment again to update the evidence.', 'warning');
}

function selectedRadius() {
  const value = Number($('radius').value);
  return Number.isFinite(value) ? Math.max(100, Math.min(2000, value)) : 700;
}

function syncRadiusCircle(radiusOverride = null) {
  const site = confirmedSite || selector.getSnapshot().site;
  if (!site || !map || !window.L) return;
  const radius = Number.isFinite(Number(radiusOverride)) ? Number(radiusOverride) : selectedRadius();
  if (!radiusCircle) {
    radiusCircle = window.L.circle([site.latitude, site.longitude], {
      radius,
      color: '#146b63',
      weight: 2,
      fillColor: '#44bba4',
      fillOpacity: 0.12,
      interactive: false
    }).addTo(map);
  } else {
    radiusCircle.setLatLng([site.latitude, site.longitude]);
    radiusCircle.setRadius(radius);
  }
}

function googleMapsUrl(stop) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(stop.latitude) + ',' + String(stop.longitude))}`;
}

function formatAccess(route) {
  if (route?.status !== 'routed') return 'Route unavailable';
  const minutes = Math.max(1, Math.round(route.durationSeconds / 60));
  return `${route.distanceMetres.toLocaleString('en-GB')} m · ${minutes} min${minutes === 1 ? '' : 's'}`;
}

function clearRouteLines() {
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];
  $('clearRoutes').hidden = true;
}

async function showAccessRoute(stop, mode) {
  const label = mode === 'walk' ? 'walking' : 'cycling';
  setCallout($('stopStatus'), `Checking the ${label} route to map reference ${stop.mapReference || 'the selected stop'} — ${stop.name}…`, 'neutral');
  const result = await accessRouting.geometry(confirmedSite, stop, mode);
  if (!result.ok) {
    setCallout($('stopStatus'), `The ${label} route line is temporarily unavailable. The assessment results have not been changed.`, 'warning');
    return;
  }
  clearRouteLines();
  const layer = window.L.geoJSON(result.geometry, { style: { color: mode === 'walk' ? '#146b63' : '#9a6517', weight: 5, dashArray: mode === 'cycle' ? '8 6' : null, opacity: .9 } }).addTo(map);
  routeLayers.push(layer);
  $('clearRoutes').hidden = false;
  map.fitBounds(layer.getBounds().pad(.2));
  setCallout($('stopStatus'), `${mode === 'walk' ? 'Walking' : 'Cycling'} route shown for map reference ${stop.mapReference || 'the selected stop'} — ${stop.name}.`, 'success');
}

function plannerStopLabel(stop) {
  return stop?.displayMapReference || stop?.mapReference || '?';
}

function renderBusStopMarkers(stops) {
  busStopMarkers.forEach(marker => map.removeLayer(marker));
  busStopMarkers = [];
  for (const stop of stops) {
    const marker = window.L.marker([stop.latitude, stop.longitude], {
      title: `Map reference ${plannerStopLabel(stop)} — ${stop.name}`,
      icon: window.L.divIcon({ className: '', html: `<div class="bus-stop-marker" aria-label="Map reference ${plannerStopLabel(stop)}"><span>${plannerStopLabel(stop)}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -17] })
    }).addTo(map);
    marker.__atlasStopId = stopKey(stop);
    const popup = document.createElement('div');
    popup.className = 'bus-stop-popup';
    const name = document.createElement('strong');
    name.textContent = `${plannerStopLabel(stop)} — ${stop.name}`;
    const detail = document.createElement('p');
    detail.textContent = [stop.logicalGroupLabel, stop.indicator, stop.direction].filter(Boolean).join(' · ') || 'Direction not provided';
    const services = document.createElement('p');
    services.textContent = stop.routes?.length ? `Routes: ${stop.routes.join(', ')}` : 'Routes not available from this source check';
    const access = document.createElement('p');
    access.textContent = `Walk: ${formatAccess(stop.walking)} · Cycle: ${formatAccess(stop.cycling)}`;
    const link = document.createElement('a');
    link.href = googleMapsUrl(stop);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in Google Maps';
    const actions = document.createElement('div');
    actions.className = 'route-actions';
    for (const [mode, label] of [['walk', 'Show walking route'], ['cycle', 'Show cycling route']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => showAccessRoute(stop, mode));
      actions.append(button);
    }
    popup.append(name, detail, services, access, link, actions);
    marker.bindPopup(popup);
    busStopMarkers.push(marker);
  }
}

function clearSelection() {
  selector.reset();
  confirmedSite = null;
  radiusTouched = false;
  detailedEvidenceVisible = false;
  if (assessmentMarker) {
    map.removeLayer(assessmentMarker);
    assessmentMarker = null;
  }
  $('selectedLocation').hidden = true;
  $('confirmedSite').hidden = true;
  $('confirmAssessmentPoint').disabled = true;
  $('latitude').value = '';
  $('longitude').value = '';
  setCallout($('mapStatus'), 'Choose a possible match or click the map to place the assessment point.', 'neutral');
  setCallout($('confirmationStatus'), 'Select an assessment point before confirming.', 'neutral');
  clearBusEvidence();
  activateWorkflowStage(1);
}

function ensureMarker(latitude, longitude, centreMap = false) {
  const leaflet = window.L;
  if (assessmentMarker) assessmentMarker.setLatLng([latitude, longitude]);
  else {
    assessmentMarker = leaflet.marker([latitude, longitude], {
      draggable: true,
      title: 'Assessment point — drag to move',
      icon: leaflet.divIcon({ className: '', html: '<div class="assessment-point-marker" aria-hidden="true"><span></span></div>', iconSize: [34, 42], iconAnchor: [17, 38] })
    }).addTo(map);
    assessmentMarker.on('dragend', () => {
      const point = assessmentMarker.getLatLng();
      chooseMapPoint(point.lat, point.lng, 'The marker was moved. Check the new assessment point, then confirm it.');
    });
  }
  if (centreMap) map.setView([latitude, longitude], 17);
}

function renderDraftSite(site, { centreMap = false, message } = {}) {
  ensureMarker(site.latitude, site.longitude, centreMap);
  $('latitude').value = site.latitude.toFixed(6);
  $('longitude').value = site.longitude.toFixed(6);
  const identity = site.displayAddress || site.suppliedAddress;
  $('selectedIdentity').textContent = identity;
  $('selectedIdentity').hidden = !identity;
  $('selectedMethod').textContent = assessmentMethod(site);
  $('selectedCoordinates').textContent = `${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}`;
  $('selectedLocation').hidden = false;
  $('confirmedSite').hidden = true;
  $('confirmAssessmentPoint').disabled = false;
  setCallout($('mapStatus'), message || 'Check the marker carefully. Drag it or click the map to move it.', site.assessmentPoint.adjustedFromCandidate ? 'warning' : 'success');
  setCallout($('confirmationStatus'), 'The assessment point has not been confirmed yet.', 'warning');
  clearBusEvidence();
  syncRadiusCircle();
  activateWorkflowStage(2);
}

function chooseMapPoint(latitude, longitude, message = 'Assessment point chosen on the map. Check it carefully, then confirm it.') {
  try {
    const site = selector.chooseOnMap({ latitude, longitude });
    renderDraftSite(site, { message });
  } catch {
    setCallout($('mapStatus'), 'That point could not be used. Choose a valid location on the map.', 'error');
  }
}

function renderCandidates(result) {
  const list = $('candidateList');
  list.replaceChildren();
  if (!result.data.length) {
    setCallout($('geocodeStatus'), 'We could not find a suitable match. Try a different search, or choose the assessment point on the map instead.', 'warning');
    return;
  }
  const relaxed = Boolean(result.provenance?.relaxed);
  const message = result.data.length > 1
    ? 'We found more than one possible match. Choose the best result, then check the map.'
    : relaxed
      ? 'We found a possible match using the building or location details. Please check the map before confirming.'
      : 'We found one possible match. Choose it, then check the map.';
  setCallout($('geocodeStatus'), message, result.data.length > 1 || relaxed ? 'warning' : 'success');
  result.data.forEach(candidate => {
    const card = document.createElement('article');
    card.className = 'candidate';
    const detail = document.createElement('div');
    const address = document.createElement('p');
    address.textContent = candidate.displayAddress;
    detail.append(address);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Use this result';
    button.addEventListener('click', () => {
      const site = selector.selectCandidate(candidate);
      list.replaceChildren();
      renderDraftSite(site, { centreMap: true, message: 'Possible match placed on the map. Check the marker and move it if the access point is elsewhere.' });
      setCallout($('geocodeStatus'), 'Possible match selected. Now check the assessment point on the map.', 'success');
    });
    card.append(detail, button);
    list.append(card);
  });
}

function renderConfirmedSite(site) {
  const panel = $('confirmedSite');
  panel.hidden = false;
  panel.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = 'Confirmed assessment point';
  const identity = site.displayAddress || site.suppliedAddress;
  const address = identity ? document.createElement('p') : null;
  if (address) address.textContent = identity;
  const details = document.createElement('dl');
  const rows = [
    ['Location', assessmentMethod(site)],
    ['Coordinates', `${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}`],
    ['Confirmed', formatTime(site.assessmentPoint.confirmedAt)]
  ];
  rows.forEach(([term, value]) => {
    const dt = document.createElement('dt'); dt.textContent = term;
    const dd = document.createElement('dd'); dd.textContent = value;
    details.append(dt, dd);
  });
  if (diagnosticMode && site.geocoding.source) {
    const technical = document.createElement('details');
    technical.className = 'technical-details';
    const summary = document.createElement('summary');
    summary.textContent = 'View address check details';
    const diagnostic = document.createElement('p');
    diagnostic.textContent = `Address source: ${site.geocoding.source}. Original address point: ${site.geocoding.latitude.toFixed(6)}, ${site.geocoding.longitude.toFixed(6)}. Source record: ${site.geocoding.sourceIdentifier}. Search used: ${site.geocoding.query}.`;
    technical.append(summary, diagnostic);
    panel.append(strong, ...(address ? [address] : []), details, technical);
  } else panel.append(strong, ...(address ? [address] : []), details);
}

function appendCell(row, label, value, secondary = '') {
  const cell = document.createElement('td');
  cell.dataset.label = label;
  if (value instanceof Node) cell.append(value);
  else cell.textContent = value;
  if (secondary) { const small = document.createElement('small'); small.textContent = secondary; cell.append(small); }
  row.append(cell);
  return cell;
}

function reviewItemText(item) {
  const scope = [item.route && 'Route ' + item.route, item.stop && 'Stop ' + item.stop, item.source].filter(Boolean).join(' · ');
  return scope ? scope + ': ' + item.message : item.message;
}

function evidenceReviewText(count) {
  return `${count} evidence item${count === 1 ? '' : 's'} ${count === 1 ? 'needs' : 'need'} review`;
}

function renderAssessment(result) {
  currentBusResult = result;
  result = withNumericMapReferences(result);
  const presentedServices = Array.isArray(result.plannerServiceSummaries)
    ? result.plannerServiceSummaries
    : buildPlannerBusServiceSummaries(result.serviceSummaries, result.stops);
  if (!selectionInitialised) {
    selectedStopIds = new Set(result.stops.filter(recommendedBusStop).map(stopKey));
    selectedServiceIds = new Set(presentedServices.map(serviceKey));
    selectionInitialised = true;
  }
  for (const service of presentedServices) {
    if (!service.stopIds?.some(id => selectedStopIds.has(String(id)))) selectedServiceIds.delete(serviceKey(service));
  }
  $('exportBusWord').disabled = false;
  $('exportAssessmentMap').disabled = false;
  const panel = $('evidencePanel');
  const rows = $('evidenceRows');
  const serviceRows = $('serviceRows');
  const detailPanel = $('serviceDetailPanel');
  const detailRows = $('serviceDetailRows');
  const detailToggle = $('toggleDetailedEvidence');
  panel.hidden = false;
  moveResultsMap(true);
  collapseAssessmentSetup(true);
  rows.replaceChildren();
  rows.closest('.table-wrap')?.parentElement?.querySelector('.other-nearby-stop-records')?.remove();
  serviceRows.replaceChildren();
  if (detailRows) detailRows.replaceChildren();
  const otherNearbyRecords = result.stops.filter(isOtherNearbyStopRecord);
  for (const stop of result.stops.filter(stop => !isOtherNearbyStopRecord(stop))) {
    const row = document.createElement('tr');
    const selectedForReport = selectedStopIds.has(stopKey(stop));
    if (!selectedForReport) row.classList.add('diagnostic-candidate');
    row.dataset.stopId = stopKey(stop);
    const include = document.createElement('input'); include.type = 'checkbox'; include.checked = selectedStopIds.has(stopKey(stop)); include.setAttribute('aria-label', `Include ${stop.name}`);
    include.addEventListener('change', () => { if (include.checked) selectedStopIds.add(stopKey(stop)); else selectedStopIds.delete(stopKey(stop)); renderAssessment(result); });
    appendCell(row, 'Include', include);
    appendCell(row, 'Map reference', plannerStopLabel(stop));
    const stopCell = document.createElement('span');
    const stopName = document.createElement('strong'); stopName.textContent = stop.name;
    const mapLink = document.createElement('a'); mapLink.href = googleMapsUrl(stop); mapLink.target = '_blank'; mapLink.rel = 'noopener noreferrer'; mapLink.textContent = 'Open in Google Maps';
    stopCell.append(stopName, document.createElement('br'), mapLink);
    appendCell(row, 'Stop name', stopCell);
    appendCell(row, 'Direction / indicator', stop.displayDirection);
    const walking = appendCell(row, 'Walking distance / time', formatAccess(stop.walking));
    if (stop.walking.status !== 'routed') walking.classList.add('route-unavailable');
    appendCell(row, 'Routes serving stop', stopRoutesPresentation(stop, { selectedForReport }));
    row.addEventListener('click', event => {
      if (event.target.closest('input, a, button')) return;
      const marker = busStopMarkers.find(candidate => candidate.__atlasStopId === stopKey(stop));
      if (marker) { marker.openPopup(); map.panTo(marker.getLatLng()); }
    });
    rows.append(row);
  }
  if (!result.stops.some(stop => !isOtherNearbyStopRecord(stop))) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 6; cell.textContent = 'No authoritative bus stops were found within the selected discovery radius.'; row.append(cell); rows.append(row);
  }
  if (otherNearbyRecords.length) {
    const region = document.createElement('details');
    region.className = 'other-nearby-stop-records';
    const summary = document.createElement('summary');
    summary.textContent = `Other nearby stop records — no route information currently available (${otherNearbyRecords.length})`;
    region.append(summary);
    const explanation = document.createElement('p');
    explanation.textContent = 'The source records currently provide no route information. This does not establish that a stop is inactive or that no service uses it. These records remain on the map and in the detailed source evidence, but are not presented as route-bearing stops or included in the Word summary.';
    region.append(explanation);
    const table = document.createElement('table');
    table.className = 'other-nearby-stop-table';
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['Map reference', 'Stop name', 'Indicator', 'Walking distance / time', 'Status']) {
      const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; headerRow.append(cell);
    }
    head.append(headerRow); table.append(head);
    const body = document.createElement('tbody');
    for (const stop of otherNearbyRecords) {
      const row = document.createElement('tr');
      for (const value of [stop.mapReference || '?', stop.name || 'Stop name not supplied', stop.displayDirection || stop.indicator || 'Not supplied', formatAccess(stop.walking), 'No route information is currently available in the source']) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      row.dataset.stopId = stopKey(stop);
      body.append(row);
    }
    table.append(body); region.append(table);
    rows.closest('.table-wrap')?.after(region);
  }
  if (presentedServices.some(service => service.plannerNotes?.terminus)) {
    const noteRow = document.createElement('tr'); noteRow.className = 'service-note semantic-annotation annotation-terminus-presentation';
    const noteCell = document.createElement('td'); noteCell.colSpan = 9; noteCell.setAttribute('role', 'note');
    const label = document.createElement('strong'); label.textContent = 'Presentation note: ';
    noteCell.append(label, PLANNER_TERMINUS_PRESENTATION_NOTE); noteRow.append(noteCell); serviceRows.append(noteRow);
  }
  const timetableNote = buildBusTimetablePresentationNote(result, presentedServices);
  if (timetableNote) {
    const noteRow = document.createElement('tr'); noteRow.className = 'service-note semantic-annotation annotation-presentation-note annotation-timetable-variation';
    const noteCell = document.createElement('td'); noteCell.colSpan = 9; noteCell.setAttribute('role', 'note');
    const label = document.createElement('strong'); label.textContent = 'Timetable note: ';
    noteCell.append(label, timetableNote); noteRow.append(noteCell); serviceRows.append(noteRow);
  }
  presentedServices.forEach((service, index) => {
    const row = document.createElement('tr');
    const supported = service.stopIds?.some(id => selectedStopIds.has(String(id)));
    const include = document.createElement('input'); include.type = 'checkbox'; include.checked = selectedServiceIds.has(serviceKey(service)) && supported; include.disabled = !supported; include.setAttribute('aria-label', `Include route ${service.routeNumber}`);
    include.addEventListener('change', () => { if (include.checked) selectedServiceIds.add(serviceKey(service)); else selectedServiceIds.delete(serviceKey(service)); renderAssessment(result); });
    appendCell(row, 'Include', include);
    appendCell(row, 'Route', plannerRouteDisplayNumber(service));
    appendCell(row, 'Operator', service.operator);
    appendCell(row, 'Direction / main service pattern', service.directionPatternText || formatServiceOriginDestination(service));
    appendCell(row, 'Served at', service.servedAtText || service.frequencyBasisStopName || 'Representative stop not supplied');
    appendCell(row, 'Principal locations', service.principalLocationsText || service.presentation?.principalLocationsText || 'See route origin / destination');
    const frequencies = document.createElement('ul'); frequencies.className = 'period-lines';
    (service.typicalFrequencyLines || String(service.typicalFrequencyText || 'Frequency unavailable').split('\n')).forEach(line => { const item = document.createElement('li'); item.textContent = line; frequencies.append(item); });
    appendCell(row, 'Typical frequency', frequencies);
    const periods = document.createElement('ul'); periods.className = 'period-lines';
    service.operatingPeriodLines.forEach(line => { const item = document.createElement('li'); item.textContent = line; periods.append(item); });
    appendCell(row, 'Operating period at stop', periods);
    const sourceBadge = document.createElement('span');
    sourceBadge.className = 'timetable-source-badge';
    sourceBadge.textContent = service.timetableSource || '';
    appendCell(row, 'Source', sourceBadge);
    serviceRows.append(row);
    const duplicateTerminusNote = service.plannerNotes?.terminus && /\broute terminus\b/i.test(String(service.serviceNote || ''));
    const structuredQualificationNote = /^(?:school[- ]day(?:s)?(?:[- ]only)?(?: service)?|runs? on school days only|operates? during term time only|term[- ]time service|runs? on non-school days only|non-school days only|operates? on holidays only|operating days could not be fully confirmed)(?:;.*)?\.?$/i.test(String(service.serviceNote || '').trim());
    const visibleServiceNote = plannerFacingServiceNote(service.serviceNote);
    if (visibleServiceNote && !duplicateTerminusNote && !structuredQualificationNote) {
      const noteRow = document.createElement('tr'); noteRow.className = 'service-note';
      const noteCell = document.createElement('td'); noteCell.colSpan = 9;
      const label = document.createElement('strong'); label.textContent = 'Service note: ';
      noteCell.append(label, visibleServiceNote); noteRow.append(noteCell); serviceRows.append(noteRow);
    }
    const next = presentedServices[index + 1];
    if (!next || next.publicRouteFamilyKey !== service.publicRouteFamilyKey) {
      const annotations = plannerAnnotationEntries(service);
      if (annotations.length) {
        for (const [labelText, value] of annotations) {
          const noteRow = document.createElement('tr'); noteRow.className = `service-note route-group-note semantic-annotation annotation-${plannerAnnotationClass(labelText)}`;
          const noteCell = document.createElement('td'); noteCell.colSpan = 9;
          noteCell.setAttribute('role', 'note');
          const label = document.createElement('strong'); label.textContent = `${labelText}: `;
          noteCell.append(label, value); noteRow.append(noteCell); serviceRows.append(noteRow);
        }
      } else if (plannerFacingServiceNote(service.routeGroupNote)) {
        const noteRow = document.createElement('tr'); noteRow.className = 'service-note route-group-note';
        const noteCell = document.createElement('td'); noteCell.colSpan = 9;
        const label = document.createElement('strong'); label.textContent = 'Service note: ';
        noteCell.append(label, plannerFacingServiceNote(service.routeGroupNote)); noteRow.append(noteCell); serviceRows.append(noteRow);
      }
    }
  });
  if (!presentedServices.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 9; cell.textContent = 'No matched timetable summary is available. Review Sources and checks before using the stop information.'; row.append(cell); serviceRows.append(row);
  }
  if (detailPanel && detailRows) {
    detailPanel.hidden = !detailedEvidenceVisible;
    if (detailToggle) detailToggle.textContent = detailedEvidenceVisible ? 'Hide detailed evidence' : 'Show detailed evidence';
    if (detailedEvidenceVisible) {
      const otherStopRecords = result.stops.filter(isOtherNearbyStopRecord);
      if (otherStopRecords.length) {
        const article = document.createElement('article'); article.className = 'service-detail other-nearby-stop-evidence';
        const heading = document.createElement('strong'); heading.textContent = 'Other nearby stop records — retained, without route attribution';
        const detail = document.createElement('p');
        detail.textContent = otherStopRecords.map(stop => `${stop.name || 'Stop name not supplied'} · StopPoint ${stop.id} · map reference ${stop.mapReference || 'not supplied'} · mode ${stop.transportMode || 'not supplied'} · status ${stop.status || 'not supplied'} · routes currently absent from the source`).join('\n');
        article.append(heading, detail); detailRows.append(article);
      }
      for (const service of result.services ?? []) {
        const article = document.createElement('article');
        article.className = 'service-detail';
        const heading = document.createElement('strong');
        heading.textContent = `${service.routeNumber || 'Route not supplied'} · ${service.origin || 'Origin not supplied'} – ${service.destination || 'Destination not supplied'}`;
        const detail = document.createElement('p');
        const planner = (result.serviceSummaries ?? []).find(summary => (summary.sourceRecordIds ?? []).includes(service.id))
          || (result.plannerServiceSummaries ?? []).find(summary => (summary.sourceRecordIds ?? []).includes(service.id));
        const endpointLines = ['origin', 'destination'].map(side => {
          const decision = planner?.[`${side}EndpointDecision`];
          const label = side[0].toUpperCase() + side.slice(1);
          if (!decision) return `${label}: ${service[side] || 'not supplied'} · source resolution not available`;
          const state = decision.conflict ? 'conflicting evidence' : decision.unresolved ? 'needs review' : 'resolved';
          return `${label}: ${decision.chosenDisplayName || service[side] || 'not supplied'} · ${state}`;
        });
        const calendar = service.calendarProfileLabel || service.calendarProfileId || 'not supplied';
        const servedStopCount = Object.keys(service.stopSchedules ?? {}).length;
        const patternStopCount = (service.routePatternStopIds ?? []).length;
        detail.textContent = [
          `Operator: ${service.operator || 'not supplied'} · Source: ${service.timetableSource || service.source?.provider || 'not supplied'} · Calendar: ${calendar}`,
          `Pattern coverage: ${patternStopCount || 'not supplied'} route stops · ${servedStopCount} assessed stops`,
          ...endpointLines
        ].join('\n');
        article.append(heading, detail);
        detailRows.append(article);
      }
      if (!(result.services ?? []).length) detailRows.textContent = 'No detailed timetable records were returned for this assessment.';
    }
  }
  renderBusStopMarkers(result.stops);
  const wording = assessmentWording(result, presentedServices.filter(service => selectedServiceIds.has(serviceKey(service)) && service.stopIds?.some(id => selectedStopIds.has(String(id)))));
  $('assessmentWording').textContent = wording;
  $('copyAssessmentWording').disabled = !wording;
  const stopProvenance = result.provenance.stops ?? {};
  const timetableProvenance = result.provenance.timetables ?? {};
  const checked = formatTime(stopProvenance.retrievedAt || timetableProvenance.retrievedAt);
  const stopSource = providerLabel({ provenance: stopProvenance });
  const foundStopCount = Number(result.discoveredStopCount ?? result.discoveredStops?.length ?? result.stops.length);
  const stopCountText = foundStopCount !== result.stops.length ? `${foundStopCount} stops found · ${result.stops.length} assessed` : `${result.stops.length} stops assessed`;
  $('evidenceSummary').textContent = `${result.assessmentMode === 'nearest' ? `Nearest stop group: ${result.nearestGroup?.name || 'selected group'} · ` : ''}${stopCountText} · ${presentedServices.length} service summar${presentedServices.length === 1 ? 'y' : 'ies'}`;
  const timetablePresentation = buildTimetableSourcePresentation(timetableProvenance, result.services ?? []);
  const timetableLabel = timetablePresentation.label;
  $('resultSource').textContent = `${stopSource}; ${timetableLabel}; OpenStreetMap routing`;
  $('resultChecked').textContent = checked;
  const reviewItems = result.reviewItems ?? [];
  $('plannerReviewGate').hidden = reviewItems.length === 0;
  $('plannerReviewAcknowledgement').checked = false;
  $('plannerReviewGateStatus').textContent = reviewItems.length ? `${reviewItems.length} flagged item${reviewItems.length === 1 ? '' : 's'} remain visible in Sources & Checks.` : 'No flagged evidence requires acknowledgement.';
  updateFormalExportAvailability();
  $('resultFreshness').textContent = reviewItems.length ? `${reviewItems.length} evidence item${reviewItems.length === 1 ? '' : 's'} require${reviewItems.length === 1 ? 's' : ''} review` : 'Assessment complete';
  $('sourceReviewBadge').textContent = reviewItems.length ? `${reviewItems.length} item${reviewItems.length === 1 ? '' : 's'} require review` : 'No review items';
  $('sourceReviewBadge').hidden = reviewItems.length === 0;
  $('sourceChecksDetails').open = false;
  $('busDataCurrent').textContent = $('dataStatusMessage').textContent;
  $('busDataCurrent').className = `current-badge${$('dataStatusMessage').classList.contains('warning') ? ' warning' : ''}`;
  const plannerChecks = $('plannerChecks');
  plannerChecks.replaceChildren();
  for (const [labelText, value] of [['Stops', stopSource], ['Timetables', timetableLabel], ['Access routes', 'OpenStreetMap routing through OSRM'], ['Checked', checked], ['Result', result.status === 'complete' ? 'Complete for the information shown' : 'Assessment finished — ' + evidenceReviewText(reviewItems.length)]]) {
    const line = document.createElement('p'); const label = document.createElement('strong'); label.textContent = `${labelText}: `; line.append(label, value); plannerChecks.append(line);
  }
  const plannerWarnings = [...new Set(result.warnings.map(warning => plannerStopWarning(warning, result)).filter(Boolean))];
  if (plannerWarnings.length) {
    const heading = document.createElement('strong'); heading.textContent = 'Points to note';
    const list = document.createElement('ul');
    plannerWarnings.forEach(warning => { const item = document.createElement('li'); item.textContent = warning; list.append(item); });
    plannerChecks.append(heading, list);
  }
  if (reviewItems.length) {
    const heading = document.createElement('strong'); heading.textContent = 'Evidence items to review';
    const list = document.createElement('ul');
    reviewItems.forEach(item => { const line = document.createElement('li'); line.textContent = reviewItemText(item); list.append(line); });
    plannerChecks.append(heading, list);
  }
  if (diagnosticMode) {
  const diagnostics = $('diagnostics');
  diagnostics.replaceChildren();
  const diagnosticLines = [
    `Review dataset: ${isV2Review ? 'Prepared Data V2 / frozen NPTG diagnostic review' : 'Default local V1 review'}`,
    `Stop source reference: ${stopProvenance.endpoint || 'not supplied'}`,
    `Timetable source reference: ${timetableProvenance.endpoint || 'not supplied'}`,
    `Prepared dataset time: ${timetableProvenance.dataPreparedAt || stopProvenance.dataPreparedAt || 'not supplied'}`,
    `Assessment mode: ${result.assessmentMode || 'full'}`,
    `Discovery radius: ${result.provenance.stops?.actualDiscoveryRadiusMetres || result.provenance.stops?.radiusMetres || selectedRadius()} metres`,
    `Nearest stop-group method: ${result.nearestGroup?.basis || 'not applicable'}`,
    `Representative timetable dates: ${JSON.stringify(timetableProvenance.representativeDates || {})}`,
    `Source stop IDs: ${result.stops.map(stop => stop.id).join(', ')}`,
    `Provider routing: ${stopProvenance.providerSelectedBy || 'not supplied'}`,
    `Embedded API key: ${stopProvenance.apiKeyEmbedded || timetableProvenance.apiKeyEmbedded ? 'yes' : 'no'}`
  ];
  diagnosticLines.forEach(value => { const line = document.createElement('p'); line.textContent = value; diagnostics.append(line); });
  const nptgHeading = document.createElement('strong'); nptgHeading.textContent = 'NPTG locality evidence'; diagnostics.append(nptgHeading);
  const nptgList = document.createElement('ul');
  for (const stop of result.stops) {
    const locality = stop.nptgLocalityEvidence || stop.nptgLocality;
    const refs = (stop.logicalGroupRefs ?? []).map(ref => ref.id || ref.sourceId).filter(Boolean).join(', ') || 'none';
    const line = document.createElement('li');
    line.textContent = `${stop.id}: locality ${stop.nptgLocalityCode || 'not supplied'} — ${stop.nptgLocalityName || 'unresolved'}; parent ${stop.parentLocalityId || 'not supplied'} — ${stop.parentLocality || 'unresolved'}; district ${stop.districtId || 'not supplied'} — ${stop.districtName || 'unresolved'}; resolution ${stop.localityResolution || (locality ? 'resolved' : 'not-supplied')}; logical refs ${refs}; source ${stop.referenceDataProvenance?.source || locality?.provenance?.source || 'not supplied'}`;
    nptgList.append(line);
  }
  if (!result.stops.length) { const line = document.createElement('li'); line.textContent = 'No stop records were returned for this assessment.'; nptgList.append(line); }
  diagnostics.append(nptgList);
  const stopAreaHeading = document.createElement('strong'); stopAreaHeading.textContent = 'StopArea physical structure'; diagnostics.append(stopAreaHeading);
  const stopAreaList = document.createElement('ul');
  const stopArea = stopProvenance.stopAreaCompletion || {};
  const stopAreaSummary = document.createElement('li');
  stopAreaSummary.textContent = `Algorithm: ${stopArea.algorithm || 'not supplied'}; qualified groups ${stopArea.qualifiedGroupCount ?? 0}; completed members ${stopArea.completedMemberCount ?? 0}; invalid members ${stopArea.invalidMemberCount ?? 0}; unresolved groups ${stopArea.unresolvedGroupCount ?? 0}; available ${stopArea.available === false ? 'no' : 'yes'}`;
  stopAreaList.append(stopAreaSummary);
  for (const stop of result.stops) {
    const groups = (stop.logicalGroupIds ?? stop.logicalGroupRefs?.map(ref => ref.id || ref.sourceId) ?? []).filter(Boolean).join(', ') || 'none';
    const line = document.createElement('li');
    line.textContent = `${stop.id}: ${stop.stopAreaCompletionStatus || (stop.core ? 'CORE' : 'not supplied')}; distance ${Number.isFinite(Number(stop.distanceMetres)) ? `${Math.round(Number(stop.distanceMetres))} m` : 'not supplied'}; groups ${groups}`;
    stopAreaList.append(line);
  }
  diagnostics.append(stopAreaList);
  }
  activateWorkflowStage(5);
}

async function searchAddress(event) {
  event.preventDefault();
  const query = $('address').value.trim();
  if (!query) {
    setCallout($('geocodeStatus'), 'Enter a site address or name before searching.', 'error');
    return;
  }
  clearSelection();
  $('candidateList').replaceChildren();
  setCallout($('geocodeStatus'), 'Searching for the site…', 'neutral');
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  try {
    const result = await geocoder.searchAddress(query);
    if (!result.ok) {
      const stale = result.cache?.staleAvailable ? ' An earlier result is now out of date and has not been shown.' : '';
      setCallout($('geocodeStatus'), `${plannerFailure('address', result)}${stale}`, 'error');
      return;
    }
    renderCandidates(result);
  } finally {
    if (submit) submit.disabled = false;
  }
}

function enterCoordinates(event) {
  event.preventDefault();
  try {
    const site = selector.enterCoordinates({
      latitude: $('latitude').value,
      longitude: $('longitude').value
    });
    $('coordinateStatus').textContent = 'Coordinates applied. Check the marker on the map, then confirm the assessment point.';
    renderDraftSite(site, { centreMap: true, message: 'Coordinates applied. Check the marker, then confirm the assessment point.' });
  } catch {
    $('coordinateStatus').textContent = 'Enter valid decimal coordinates. Latitude must be between -90 and 90; longitude between -180 and 180.';
  }
}

function confirmAssessmentPoint() {
  try {
    confirmedSite = selector.confirm();
    if (!radiusTouched) $('radius').value = isGreaterLondonPoint(confirmedSite) ? '400' : '700';
    renderConfirmedSite(confirmedSite);
    syncRadiusCircle();
    $('confirmAssessmentPoint').disabled = true;
    $('findStops').disabled = false;
    $('findNearestStops').disabled = false;
    $('refreshStops').disabled = false;
    collapseSiteSetup(true);
    setCallout($('confirmationStatus'), `${assessmentMethod(confirmedSite)}. The assessment point is confirmed.`, 'success');
    setCallout($('stopStatus'), `Ready to check nearby bus stops. The ${selectedRadius()} m assessment radius is shown on the map.`, 'neutral');
    activateWorkflowStage(3);
  } catch {
    setCallout($('confirmationStatus'), 'Select a valid assessment point before confirming.', 'error');
  }
}

async function loadStops(forceRefresh, mode = lastAssessmentMode, { skipScope = false, discoveryOverride = null } = {}) {
  activateWorkflowStage(4);
  lastAssessmentMode = mode === 'nearest' ? 'nearest' : 'full';
  if (!skipScope || lastAssessmentMode !== 'full') {
    pendingScopeDiscovery = null;
    pendingScopeContext = null;
  }
  const action = lastAssessmentMode === 'nearest' ? 'nearest bus stop group' : 'full Bus assessment';
  setCallout($('stopStatus'), forceRefresh ? `Checking the ${action} again…` : `Building the ${action}…`, 'neutral');
  $('findStops').disabled = true;
  $('findNearestStops').disabled = true;
  $('refreshStops').disabled = true;
  $('exportBusWord').disabled = true;
  $('assessmentScope').hidden = true;
  taskStatus.update({ phase: 'finding-stops' });
  try {
    let discovery = discoveryOverride;
    if (lastAssessmentMode === 'full' && !skipScope) {
      const scope = await busAssessment.inspectScope(confirmedSite, { radius: $('radius').value, forceRefresh });
      if (!scope.ok) {
        pendingScopeDiscovery = null;
        pendingScopeContext = null;
        taskStatus.update({ phase: 'unavailable', detail: 'The required stop evidence could not be checked.' });
        setCallout($('stopStatus'), `${plannerFailure('bus', scope)}`, 'error');
        return;
      }
      const { stopCount, routeCount, pairCount } = scope.scope;
      discovery = scope.discovery ?? null;
      const scopeBox = $('assessmentScope');
      scopeBox.replaceChildren();
      if (pairCount > TFL_SAFE_DETAILED_PAIR_LIMIT) {
        pendingScopeDiscovery = discovery;
        pendingScopeContext = { site: confirmedSite, radius: Number($('radius').value) };
        const heading = document.createElement('strong'); heading.textContent = 'Large assessment';
        const explanation = document.createElement('p'); explanation.textContent = 'This assessment covers a large number of stops and may take longer. This assessment may require staged TfL requests.';
        const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Assessment details';
        const counts = document.createElement('p'); counts.textContent = `${stopCount} stops · ${routeCount} routes · ${pairCount} detailed route/stop checks within ${selectedRadius()} m.`;
        details.append(summary, counts);
        const nearest = document.createElement('button'); nearest.type = 'button'; nearest.className = 'primary compact'; nearest.textContent = 'Use nearest stop group'; nearest.addEventListener('click', () => loadStops(false, 'nearest'));
        const continueButton = document.createElement('button'); continueButton.type = 'button'; continueButton.className = 'secondary compact'; continueButton.textContent = 'Continue full assessment'; continueButton.addEventListener('click', () => {
          const reusableDiscovery = pendingScopeContext?.site === confirmedSite && Number(pendingScopeContext.radius) === Number($('radius').value) ? pendingScopeDiscovery : null;
          pendingScopeDiscovery = null;
          pendingScopeContext = null;
          loadStops(forceRefresh, 'full', { skipScope: true, discoveryOverride: reusableDiscovery });
        });
        scopeBox.append(heading, explanation, details, nearest, continueButton);
        scopeBox.hidden = false;
        return;
      }
    }
    const result = await busAssessment.assess(confirmedSite, { radius: $('radius').value, forceRefresh, mode: lastAssessmentMode, discovery, onProgress: progress => taskStatus.update(progress) });
    if (!result.ok) {
      $('evidencePanel').hidden = true;
      currentBusResult = null;
      busStopMarkers.forEach(marker => map.removeLayer(marker));
      busStopMarkers = [];
      const stale = result.stopsResult?.cache?.staleAvailable ? ' An earlier result is now out of date and has not been shown.' : '';
      setCallout($('stopStatus'), `${plannerFailure('bus', result)}${stale}`, 'error');
      return;
    }
    renderAssessment(result);
    syncRadiusCircle(result.provenance.stops?.actualDiscoveryRadiusMetres ?? result.provenance.stops?.radiusMetres ?? selectedRadius());
    const checked = formatTime(result.provenance.stops?.retrievedAt || result.provenance.timetables?.retrievedAt);
    const modeText = result.assessmentMode === 'nearest' ? `Nearest stop group "${result.nearestGroup?.name || 'selected group'}"` : `${result.stops.length} nearby stop${result.stops.length === 1 ? '' : 's'}`;
    const reviewCount = result.reviewItems?.length ?? 0;
    const message = result.status === 'complete' ? `${modeText} assessed. Complete - checked ${checked}.` : `${modeText} assessed. Assessment finished — ${evidenceReviewText(reviewCount)}.`;
    setCallout($('stopStatus'), message, result.status === 'complete' && !result.warnings.length ? 'success' : 'warning');
  } catch {
    taskStatus.update({ phase: 'unavailable', detail: 'The assessment could not be completed.' });
    setCallout($('stopStatus'), 'The assessment could not be completed. No successful-looking result has been shown.', 'error');
  } finally {
    $('findStops').disabled = !confirmedSite;
    $('findNearestStops').disabled = !confirmedSite;
    $('refreshStops').disabled = !confirmedSite;
    updateFormalExportAvailability();
  }
}

function updateFormalExportAvailability() {
  const reviewRequired = (currentBusResult?.reviewItems?.length ?? 0) > 0;
  const acknowledged = !reviewRequired || Boolean($('plannerReviewAcknowledgement')?.checked);
  $('exportBusWord').disabled = !currentBusResult?.ok || !acknowledged;
  $('exportAssessmentMap').disabled = !currentBusResult?.ok || !acknowledged;
}

async function svgToPngDataUrl(svg) {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, image.naturalWidth * 2); canvas.height = Math.max(1, image.naturalHeight * 2);
    const context = canvas.getContext('2d'); if (!context) throw new Error('PNG canvas is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

async function exportBusWord() {
  if (!currentBusResult?.ok || !confirmedSite) return setCallout($('exportStatus'), 'Build a Bus assessment before exporting to Word.', 'warning');
  const report = selectedResult();
  if (!report.stops.length && !(report.plannerServiceSummaries ?? report.serviceSummaries).length) return setCallout($('exportStatus'), 'Select at least one stop or service before exporting.', 'warning');
  if ((report.reviewItems?.length ?? 0) && !$('plannerReviewAcknowledgement').checked) return setCallout($('exportStatus'), 'Review the flagged Sources & Checks and acknowledge them before formal export.', 'warning');
  const includeMap = $('includeMapInWord').checked;
  let mapPngDataUrl = null;
  try { if (includeMap) mapPngDataUrl = await exportAssessmentMap({ download: false }); }
  catch { return setCallout($('exportStatus'), 'The assessment map could not be prepared for the Word report. Turn off the map option or return to Results and try again.', 'error'); }
  if (includeMap && !mapPngDataUrl) return setCallout($('exportStatus'), 'The assessment map could not be prepared for the Word report.', 'error');
  const presentationReport = withNumericMapReferences(report, { referenceStops: currentBusResult.stops });
  downloadWordDocument(busWordFilename(confirmedSite), 'Bus Assessment', buildBusWordTables(presentationReport, { includeMap }), report.wording, { wordingPlacement: 'before', mapPngDataUrl });
  setCallout($('exportStatus'), 'Word assessment created from the checked Bus results.', 'success');
}

function escapeSvg(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

async function exportAssessmentMap({ download = true } = {}) {
  if (!currentBusResult?.ok || !confirmedSite) { if (download) setCallout($('exportStatus'), 'Build a Bus assessment before exporting the map.', 'warning'); return null; }
  if ((currentBusResult.reviewItems?.length ?? 0) && !$('plannerReviewAcknowledgement').checked) { if (download) setCallout($('exportStatus'), 'Review the flagged Sources & Checks and acknowledge them before formal export.', 'warning'); return null; }
  const report = withNumericMapReferences(selectedResult(), { referenceStops: currentBusResult.stops });
  const stops = report.stops.filter(stop => !isOtherNearbyStopRecord(stop) && Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude)));
  const leafletMap = map;
  let context = mapExportContext;
  if (!context) {
    try { context = captureMapExportContext(); } catch { /* Report an unavailable map context below. */ }
  }
  if (!context) return setCallout($('exportStatus'), 'The browser map context is not available yet. Return to Results, wait for the map, and try again.', 'warning');
  const { zoom, pixelOrigin } = context;
  const mapSize = context.size;
  setCallout($('exportStatus'), 'Preparing the standalone map from the displayed OpenStreetMap tiles…', 'neutral');
  try {
    const tiles = [];
    for (const tile of context.tiles) {
      const response = await fetch(tile.src, { mode: 'cors' });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      const contentType = response.headers.get('content-type') || 'image/png';
      tiles.push({ x: tile.x * 256 - pixelOrigin.x, y: tile.y * 256 - pixelOrigin.y, uri: `data:${contentType};base64,${btoa(binary)}` });
    }
    if (!tiles.length) throw new Error('No readable map tiles were available.');
    const scale = Math.min(1.5, 1500 / mapSize.x);
    const width = Math.round(mapSize.x * scale);
    const mapHeight = Math.round(mapSize.y * scale);
    const top = 88;
    const keyColumns = 2;
    const keyRows = Math.ceil(stops.length / keyColumns);
    const height = top + mapHeight + 72 + Math.max(1, keyRows) * 21 + 34;
    const project = point => {
      const pixel = leafletMap.project([Number(point.latitude), Number(point.longitude)], zoom);
      return { x: (pixel.x - pixelOrigin.x) * scale, y: top + (pixel.y - pixelOrigin.y) * scale };
    };
    const site = { latitude: Number(confirmedSite.latitude), longitude: Number(confirmedSite.longitude) };
    const sitePoint = project(site);
    const projectedStops = stops.map(stop => ({ stop, ...project(stop) }));
    const positionedStops = layoutNumberedMapMarkers(projectedStops.map(({ stop, ...point }) => ({ ...point, item: stop })), { width, top, mapHeight });
    const pointMarkup = positionedStops.map(({ item: stop, point, original, displaced }) => {
      const reference = escapeSvg(plannerStopLabel(stop));
      const leader = displaced ? `<line x1="${original.x.toFixed(1)}" y1="${original.y.toFixed(1)}" x2="${point.x.toFixed(1)}" y2="${point.y.toFixed(1)}" stroke="#061d37" stroke-opacity=".7" stroke-width="1"/>` : '';
      return `<g>${leader}<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="13" fill="#002761" stroke="#fff" stroke-width="4"/><text x="${point.x.toFixed(1)}" y="${(point.y + 4).toFixed(1)}" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-size="10" font-weight="700" fill="#fff">${reference}</text></g>`;
    }).join('');
    const radius = Number(report.provenance?.stops?.actualDiscoveryRadiusMetres || report.provenance?.stops?.radiusMetres || selectedRadius());
    const metresPerPixel = 156543.03392 * Math.max(.15, Math.cos(site.latitude * Math.PI / 180)) / (2 ** zoom);
    const radiusPx = report.assessmentMode === 'nearest' ? 0 : radius / metresPerPixel * scale;
    const ring = radiusPx > 0 ? `<circle cx="${sitePoint.x.toFixed(1)}" cy="${sitePoint.y.toFixed(1)}" r="${radiusPx.toFixed(1)}" fill="#fc7315" fill-opacity=".045" stroke="#fc7315" stroke-opacity=".72" stroke-width="2" stroke-dasharray="8 7"/>` : '';
    const tileMarkup = tiles.map(tile => `<image x="${(tile.x * scale).toFixed(1)}" y="${(top + tile.y * scale).toFixed(1)}" width="${(256 * scale).toFixed(1)}" height="${(256 * scale).toFixed(1)}" href="${tile.uri}"/>`).join('');
    const siteMarker = `<path d="M ${sitePoint.x - 14} ${sitePoint.y} L ${sitePoint.x} ${sitePoint.y + 24} L ${sitePoint.x + 14} ${sitePoint.y} L ${sitePoint.x + 14} ${sitePoint.y - 15} A 14 14 0 1 0 ${sitePoint.x - 14} ${sitePoint.y - 15} Z" fill="#fc7315" stroke="#fff" stroke-width="4"/><circle cx="${sitePoint.x}" cy="${sitePoint.y - 15}" r="4" fill="#fff"/>`;
    const identity = escapeSvg(confirmedSite.displayAddress || confirmedSite.suppliedAddress || 'Bus assessment');
    const key = stops.map((stop, index) => {
      const column = index < keyRows ? 0 : 1;
      const row = index % keyRows;
      const x = 40 + column * Math.round(width / keyColumns);
      const y = top + mapHeight + 66 + row * 21;
      const name = escapeSvg(`${plannerStopLabel(stop)} · ${stop.name || 'Bus stop'}${stop.indicator ? ` — ${stop.indicator}` : ''}`.slice(0, 72));
      return `<circle cx="${x + 8}" cy="${y - 4}" r="8" fill="#002761"/><text x="${x + 8}" y="${y}" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-size="9" font-weight="700" fill="#fff">${plannerStopLabel(stop)}</text><text x="${x + 22}" y="${y}" font-family="Roboto,Arial,sans-serif" font-size="12" fill="#26394d">${name}</text>`;
    }).join('');
    const leafletOrigin = leafletMap.unproject([pixelOrigin.x + mapSize.x - 100, pixelOrigin.y + mapSize.y - 35], zoom);
    const leafletScaleEnd = leafletMap.unproject([pixelOrigin.x + mapSize.x, pixelOrigin.y + mapSize.y - 35], zoom);
    const measuredMetres = leafletMap.distance(leafletOrigin, leafletScaleEnd);
    const roundedScale = 10 ** Math.floor(Math.log10(measuredMetres));
    const scaleLabelMetres = Math.max(1, Math.round(measuredMetres / roundedScale)) * roundedScale;
    const scaleWidth = Math.min(100, (scaleLabelMetres / measuredMetres) * 100) * scale;
    const scaleMarkup = `<g transform="translate(${width - scaleWidth - 28} ${top + mapHeight - 22})"><rect width="${scaleWidth.toFixed(1)}" height="5" fill="#061d37"/><text x="0" y="-6" font-family="Roboto,Arial,sans-serif" font-size="11" font-weight="700" fill="#061d37">${scaleLabelMetres >= 1000 ? `${(scaleLabelMetres / 1000).toLocaleString('en-GB')} km` : `${scaleLabelMetres.toLocaleString('en-GB')} m`}</text></g>`;
    const north = `<g transform="translate(${width - 34} ${top + 20})"><text x="0" y="0" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-size="12" font-weight="700" fill="#061d37">N</text><path d="M 0 8 L -7 27 L 0 23 L 7 27 Z" fill="#061d37"/></g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">Bus Assessment Map — ${identity}</title><desc id="desc">OpenStreetMap context with an orange assessment point, numbered assessed stops, and a subdued assessment-radius overlay. Route geometry is not shown.</desc><rect width="100%" height="100%" fill="#fff"/><text x="32" y="34" font-family="Roboto,Arial,sans-serif" font-size="23" font-weight="700" fill="#061d37">Bus Assessment Map</text><text x="32" y="59" font-family="Roboto,Arial,sans-serif" font-size="13" fill="#475b70">${identity}</text><defs><clipPath id="mapClip"><rect x="0" y="${top}" width="${width}" height="${mapHeight}" rx="7"/></clipPath></defs><rect x="0" y="${top}" width="${width}" height="${mapHeight}" fill="#e8eef2"/><g clip-path="url(#mapClip)">${tileMarkup}${ring}${pointMarkup}${siteMarker}${north}${scaleMarkup}</g><rect x="0" y="${top}" width="${width}" height="${mapHeight}" rx="7" fill="none" stroke="#aab8c4"/><g transform="translate(32 ${top + mapHeight + 28})"><circle cx="8" cy="0" r="8" fill="#fc7315"/><text x="22" y="4" font-family="Roboto,Arial,sans-serif" font-size="12" fill="#26394d">Assessment point</text><circle cx="150" cy="0" r="8" fill="#002761"/><text x="164" y="4" font-family="Roboto,Arial,sans-serif" font-size="12" fill="#26394d">Assessed stop</text>${ring ? `<line x1="285" y1="0" x2="320" y2="0" stroke="#fc7315" stroke-width="2" stroke-dasharray="6 5"/><text x="328" y="4" font-family="Roboto,Arial,sans-serif" font-size="12" fill="#26394d">${radius} m assessment radius</text>` : ''}</g>${key}<text x="32" y="${height - 13}" font-family="Roboto,Arial,sans-serif" font-size="10" fill="#64748b">Map data © OpenStreetMap contributors · Assessment point and stop positions from the checked assessment</text></svg>`;
    const png = await svgToPngDataUrl(svg);
    if (!download) return png;
    const link = document.createElement('a'); link.href = png; link.download = busWordFilename(confirmedSite).replace(/\.docx$/i, '').replace(/^Bus Assessment - /, 'Bus Assessment Map - ') + '.png'; link.click();
    setCallout($('exportStatus'), `Standalone PNG map exported with ${stops.length} numbered stop references and the displayed map context.`, 'success');
  } catch {
    if (download) setCallout($('exportStatus'), 'A standalone map could not be prepared from the displayed assessment map tiles. Return to Results, wait for the map to finish loading, and try again.', 'error');
    return null;
  }
}

function initMap() {
  const leaflet = window.L;
  if (!leaflet) {
    setCallout($('mapStatus'), 'The map could not start. Refresh the page or ask for support.', 'error');
    return;
  }
  map = leaflet.map('siteMap', { zoomControl: true, preferCanvas: true }).setView([52.5, -1.5], 6);
  const tiles = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
    crossOrigin: 'anonymous',
    updateWhenIdle: true,
    keepBuffer: 2
  });
  tiles.addTo(map);
  leaflet.control.scale({ imperial: false }).addTo(map);
  map.on('click', event => chooseMapPoint(event.latlng.lat, event.latlng.lng));
  const refresh = () => requestAnimationFrame(() => map.invalidateSize({ pan: false, animate: false }));
  if ('ResizeObserver' in window) new ResizeObserver(refresh).observe($('siteMap'));
  window.addEventListener('resize', refresh, { passive: true });
  setTimeout(refresh, 0);
  setTimeout(refresh, 250);
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  showView(button.dataset.view);
}));
document.querySelectorAll('[data-workflow-step]').forEach(button => button.addEventListener('click', () => activateWorkflowStage(button.dataset.workflowStep)));
$('newAssessment').addEventListener('click', () => {
  const hasProgress = Boolean(confirmedSite || currentBusResult || selector.getSnapshot().site);
  if (hasProgress && !window.confirm('Start a new assessment? The current site and results will be cleared.')) return;
  clearSelection();
  $('address').value = '';
  $('candidateList').replaceChildren();
  setCallout($('geocodeStatus'), 'Enter the site address or name and choose Find site.', 'neutral');
  showView('bus');
  activateWorkflowStage(1);
});
$('goToExport').addEventListener('click', () => activateWorkflowStage(6));
$('goToExportBottom').addEventListener('click', () => activateWorkflowStage(6));
$('continueToRunAssessment').addEventListener('click', () => {
  activateWorkflowStage(4);
  $('findNearestStops').focus({ preventScroll: false });
});
$('copyAssessmentWording').addEventListener('click', async () => {
  const wording = $('assessmentWording').textContent.trim();
  if (!wording) return;
  try {
    await navigator.clipboard.writeText(wording);
    setCallout($('workflowHint'), 'Assessment wording copied.');
  } catch {
    setCallout($('workflowHint'), 'Copying is unavailable in this browser. Select the assessment wording to copy it.');
  }
});
$('editAssessment').addEventListener('click', () => activateWorkflowStage(4));
$('returnToResults').addEventListener('click', () => activateWorkflowStage(5));
$('exportAssessmentMap').addEventListener('click', () => exportAssessmentMap());
$('plannerReviewAcknowledgement').addEventListener('change', () => { $('plannerReviewGateStatus').textContent = $('plannerReviewAcknowledgement').checked ? 'Sources & Checks reviewed. The evidence items remain recorded.' : 'Review the evidence drawer before formal export.'; updateFormalExportAvailability(); });
$('addressForm').addEventListener('submit', searchAddress);
$('chooseOnMap').addEventListener('click', () => {
  setCallout($('mapStatus'), 'Pan or zoom if needed, then click the map to place the assessment point.', 'warning');
  $('siteMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('siteMap').focus({ preventScroll: true });
});
$('coordinatesForm').addEventListener('submit', enterCoordinates);
$('confirmAssessmentPoint').addEventListener('click', confirmAssessmentPoint);
$('changeSite').addEventListener('click', clearSelection);
$('changeAssessment').addEventListener('click', () => { clearStaleBusAssessment(); $('assessmentSetupContent').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('radius').addEventListener('input', () => { radiusTouched = true; clearStaleBusAssessment(); syncRadiusCircle(); });
$('findNearestStops').addEventListener('click', () => loadStops(false, 'nearest'));
$('findStops').addEventListener('click', () => loadStops(false, 'full'));
$('refreshStops').addEventListener('click', () => loadStops(true, lastAssessmentMode));
$('exportBusWord').addEventListener('click', exportBusWord);
$('clearRoutes').addEventListener('click', clearRouteLines);
$('recommendedSelection').addEventListener('click', () => { selectionInitialised = false; renderAssessment(currentBusResult); });
  $('selectAllRows').addEventListener('click', () => { selectedStopIds = new Set((currentBusResult?.stops ?? []).filter(stop => !isOtherNearbyStopRecord(stop)).map(stopKey)); selectedServiceIds = new Set((currentBusResult?.plannerServiceSummaries ?? currentBusResult?.serviceSummaries ?? []).map(serviceKey)); selectionInitialised = true; renderAssessment(currentBusResult); });
$('clearAllRows').addEventListener('click', () => { selectedStopIds = new Set(); selectedServiceIds = new Set(); selectionInitialised = true; renderAssessment(currentBusResult); });
$('toggleDetailedEvidence').addEventListener('click', () => { detailedEvidenceVisible = !detailedEvidenceVisible; renderAssessment(currentBusResult); });
$('refreshDataStatus').addEventListener('click', refreshDataStatus);
const localMaintenance = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
const updateButton = $('updateBusData');
updateButton.hidden = !localMaintenance;
if (localMaintenance) updateButton.addEventListener('click', updateBusData);
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
moveResultsMap(false);
initMap();
showView(location.hash.slice(1));
activateWorkflowStage(1);
refreshDataStatus();

window.__ATLAS_SITE_SELECTOR__ = Object.freeze({ getSnapshot: selector.getSnapshot, getMap: () => map });
window.__ATLAS_BUS_UI__ = Object.freeze({ hasRadiusCircle: () => Boolean(radiusCircle), getTaskStatus: () => taskStatus.getState() });
