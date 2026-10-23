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
import { buildBusWordTables, busWordFilename } from '../../../src/atlas/presentation/bus-word-export.mjs';
import { numberedServicesForPresentation, numberedStopsForPresentation } from '../../../src/atlas/presentation/map-references.mjs';
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
  datasets: { ...atlasDataSources.datasets, bus: { ...atlasDataSources.datasets.bus, baseUrl: `${v2DataBaseUrl}bus/` } }
} : atlasDataSources);
const preparedBusData = createPreparedBusDataAdapter({
  baseUrl: atlasData.baseUrl('bus'),
  tndsBaseUrl: isV2Review ? null : atlasData.baseUrl('tnds'),
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
const views = ['modules', 'about'];
const METHOD_LABELS = Object.freeze({
  [SITE_LOCATION_METHODS.GEOCODED_CANDIDATE]: 'From address result',
  [SITE_LOCATION_METHODS.PLANNER_ADJUSTED]: 'Adjusted on map',
  [SITE_LOCATION_METHODS.MAP_SELECTED]: 'Chosen on map',
  [SITE_LOCATION_METHODS.COORDINATES_ENTERED]: 'Entered coordinates'
});
let confirmedSite = null;
let map = null;
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
let locationChecked = false;

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
  const numberedStops = numberedStopsForPresentation(stops);
  return { ...currentBusResult, stops: numberedStops, serviceSummaries, plannerServiceSummaries: numberedServicesForPresentation(plannerServiceSummaries, stops, numberedStops), wording: assessmentWording({ ...currentBusResult, stops }, plannerServiceSummaries) };
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
  $('moduleDataStatus').textContent = message.textContent;
  $('moduleDataStatus').dataset.state = message.classList.contains('success') ? 'current' : 'review';
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
    const active = button.dataset.view === selected;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (location.hash !== `#${selected}`) history.replaceState(null, '', `#${selected}`);
  if (selected === 'modules' && map) setTimeout(() => map.invalidateSize({ pan: false, animate: false }), 0);
}

function updateGuidedWorkflow() {
  const selectedSite = Boolean(selector.getSnapshot().site);
  const hasResults = Boolean(currentBusResult?.ok);
  const states = {
    'site-step-card': selectedSite ? 'complete' : 'active',
    'location-step-card': confirmedSite ? 'complete' : selectedSite ? 'active' : 'upcoming',
    'assessment-settings-step-card': confirmedSite ? (hasResults ? 'complete' : 'active') : 'upcoming',
    'assessment-step-card': hasResults ? 'complete' : confirmedSite ? 'active' : 'upcoming',
    'results-step-card': hasResults ? 'active' : 'upcoming',
    'export-step-card': hasResults ? 'active' : 'upcoming'
  };
  for (const [id, state] of Object.entries(states)) {
    const card = $(id);
    if (!card) continue;
    card.dataset.workflowState = state;
  }
  $('results-step-card').hidden = !hasResults;
  $('assessment-settings-step-card').hidden = !confirmedSite;
  $('export-step-card').hidden = !hasResults;
  $('confirmMapLocation').disabled = !selectedSite || Boolean(confirmedSite) || locationChecked;
  $('confirmAssessmentPoint').disabled = !selectedSite || !locationChecked || Boolean(confirmedSite);
  $('siteSetupContent').hidden = selectedSite;
  $('siteStageSummary').hidden = !selectedSite;
  if (selectedSite) $('siteStageSummaryText').textContent = `${selector.getSnapshot().site?.displayAddress || selector.getSnapshot().site?.suppliedAddress || 'Site selected'} · continue to map check`;
  $('locationSetupContent').hidden = Boolean(confirmedSite) || locationChecked;
  $('locationStageSummary').hidden = !locationChecked;
  $('confirmSetupContent').hidden = !locationChecked || Boolean(confirmedSite);
  $('confirm-point-step-card').dataset.workflowState = confirmedSite ? 'complete' : locationChecked ? 'active' : 'upcoming';
  $('confirmPointStageSummary').hidden = !confirmedSite;
  $('reviewMapStep').hidden = Boolean(confirmedSite);
  if (locationChecked) $('locationStageSummaryText').textContent = `${selector.getSnapshot().site?.displayAddress || 'Site location'} checked on the map`;
  if (confirmedSite) $('confirmPointStageSummaryText').textContent = `${confirmedSite.displayAddress || confirmedSite.suppliedAddress || 'Assessment point'} confirmed`;
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
  const routeCount = new Set(presented.map(plannerRouteDisplayNumber).filter(Boolean)).size;
  const stopCount = new Set(presented.flatMap(service => service.stopIds ?? []).map(String)).size;
  const allLocations = [...new Set(presented.flatMap(service => String(service.principalLocationsText ?? '').split(/[,;·]/).map(value => value.trim()).filter(Boolean)))];
  const locationText = allLocations.length ? ` Principal locations evidenced in the summaries include ${allLocations.slice(0, 4).join(', ')}${allLocations.length > 4 ? ' and other destinations' : ''}.` : '';
  const intervals = presented.map(service => {
    const text = String(service.typicalFrequencyText ?? '');
    const match = text.match(/(?:every|~)\s*~?(\d+)\s*(?:–|-|to)\s*\d+\s*mins?|(?:every|~)\s*~?(\d+)\s*mins?/i);
    return Number(match?.[1] ?? match?.[2]);
  }).filter(Number.isFinite);
  const frequent = intervals.filter(minutes => minutes <= 15).length;
  const lessFrequent = intervals.filter(minutes => minutes >= 30).length;
  const frequencyText = [frequent && `${frequent} pattern${frequent === 1 ? '' : 's'} with intervals of 15 minutes or less`, lessFrequent && `${lessFrequent} with intervals of 30 minutes or more`].filter(Boolean).join('; ');
  const base = presented.length
    ? `The assessment identified ${presented.length} evidenced service pattern${presented.length === 1 ? '' : 's'} across ${routeCount} route${routeCount === 1 ? '' : 's'} at ${stopCount} selected stop${stopCount === 1 ? '' : 's'}.${frequencyText ? ` Available frequency summaries include ${frequencyText}.` : ''}${locationText} Table 3.3 sets out the directions, operating periods and selected-stop frequency basis.`
    : 'No matched timetable service summary is available for the selected assessed stops. Review Sources & checks before using this assessment.';
  const qualification = partialTimetableQualification(result.stops);
  return qualification ? `${base} ${qualification}` : base;
}

function startNewAssessment() {
  const hasWork = Boolean(confirmedSite || currentBusResult || $('address').value.trim() || selector.getSnapshot().site);
  if (hasWork && !window.confirm('Start a new assessment? The current site and results will be cleared.')) return;
  clearSelection();
  $('address').value = '';
  $('candidateList').replaceChildren();
  setCallout($('geocodeStatus'), 'Enter the site address or name and choose Find site.', 'neutral');
  $('radius').value = '700';
  radiusTouched = false;
  if (map) map.setView([52.5, -1.5], 6);
  $('address').focus();
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
  // The one Leaflet map remains in the workspace for setup and results.
  if (map) setTimeout(() => map.invalidateSize({ pan: false, animate: false }), 0);
}

function collapseSiteSetup(collapsed) {
  const site = selector.getSnapshot().site;
  $('siteSetupContent').hidden = collapsed;
  $('siteStageSummary').hidden = !collapsed || !site;
  if (collapsed) $('siteStageSummaryText').textContent = `${site?.displayAddress || site?.suppliedAddress || 'Assessment point'} · Site selected`;
  updateGuidedWorkflow();
}

function collapseAssessmentSetup(collapsed) {
  $('assessmentSetupContent').hidden = collapsed;
  $('assessmentStageSummary').hidden = !collapsed;
  if (collapsed) $('assessmentStageSummaryText').textContent = `${lastAssessmentMode === 'nearest' ? 'Nearest stop assessment' : 'Full assessment'} · ${selectedRadius()} m radius`;
  updateGuidedWorkflow();
}

function clearBusEvidence(message = 'Confirm the assessment point before checking nearby bus stops.') {
  const hadEvidence = !$('evidencePanel').hidden;
  confirmedSite = null;
  locationChecked = false;
  radiusTouched = false;
  detailedEvidenceVisible = false;
  currentBusResult = null;
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
  $('evidencePanel').hidden = true;
  $('results-step-card').hidden = true;
  $('export-step-card').hidden = true;
  $('resultReviewNotice').hidden = true;
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
  updateGuidedWorkflow();
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
  $('evidencePanel').hidden = true;
  $('results-step-card').hidden = true;
  $('export-step-card').hidden = true;
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
  updateGuidedWorkflow();
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
  return stop?.mapReference || '?';
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
  locationChecked = false;
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
  locationChecked = false;
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
  updateGuidedWorkflow();
}

function confirmMapLocation() {
  if (!selector.getSnapshot().site) return;
  locationChecked = true;
  setCallout($('mapStatus'), 'Location checked. Confirm the exact assessment point to continue.', 'success');
  updateGuidedWorkflow();
  $('confirm-point-step-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  const presentationStops = numberedStopsForPresentation(result.stops);
  const presentedServices = Array.isArray(result.plannerServiceSummaries)
    ? result.plannerServiceSummaries
    : buildPlannerBusServiceSummaries(result.serviceSummaries, result.stops);
  const presentationServices = numberedServicesForPresentation(presentedServices, result.stops, presentationStops);
  if (!selectionInitialised) {
    selectedStopIds = new Set(result.stops.filter(recommendedBusStop).map(stopKey));
    selectedServiceIds = new Set(presentedServices.map(serviceKey));
    selectionInitialised = true;
  }
  for (const service of presentedServices) {
    if (!service.stopIds?.some(id => selectedStopIds.has(String(id)))) selectedServiceIds.delete(serviceKey(service));
  }
  $('exportBusWord').disabled = false;
  const panel = $('evidencePanel');
  const rows = $('evidenceRows');
  const serviceRows = $('serviceRows');
  const detailPanel = $('serviceDetailPanel');
  const detailRows = $('serviceDetailRows');
  const detailToggle = $('toggleDetailedEvidence');
  panel.hidden = false;
  $('results-step-card').hidden = false;
  $('export-step-card').hidden = false;
  moveResultsMap(true);
  collapseAssessmentSetup(true);
  rows.replaceChildren();
  rows.closest('.table-wrap')?.parentElement?.querySelector('.other-nearby-stop-records')?.remove();
  serviceRows.replaceChildren();
  if (detailRows) detailRows.replaceChildren();
  const otherNearbyRecords = presentationStops.filter(isOtherNearbyStopRecord);
  for (const stop of presentationStops.filter(stop => !isOtherNearbyStopRecord(stop))) {
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
  if (!presentationStops.some(stop => !isOtherNearbyStopRecord(stop))) {
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
  presentationServices.forEach((service, index) => {
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
  renderBusStopMarkers(presentationStops);
  $('assessmentWording').textContent = assessmentWording(result, presentedServices.filter(service => selectedServiceIds.has(serviceKey(service)) && service.stopIds?.some(id => selectedStopIds.has(String(id)))));
  updateGuidedWorkflow();
  const stopProvenance = result.provenance.stops ?? {};
  const timetableProvenance = result.provenance.timetables ?? {};
  const checked = formatTime(stopProvenance.retrievedAt || timetableProvenance.retrievedAt);
  const stopSource = providerLabel({ provenance: stopProvenance });
  $('evidenceSummary').textContent = result.assessmentMode === 'nearest'
    ? `Nearest stop group: ${result.nearestGroup?.name || 'selected group'} · ${result.stops.length} stop record${result.stops.length === 1 ? '' : 's'} · ${presentedServices.length} planner service summar${presentedServices.length === 1 ? 'y' : 'ies'}`
    : `${result.stops.length} stop${result.stops.length === 1 ? '' : 's'} · ${presentedServices.length} planner service summar${presentedServices.length === 1 ? 'y' : 'ies'}`;
  const timetablePresentation = buildTimetableSourcePresentation(timetableProvenance, result.services ?? []);
  const timetableLabel = timetablePresentation.label;
  $('resultSource').textContent = `${stopSource}; ${timetableLabel}; OpenStreetMap routing`;
  $('resultChecked').textContent = checked;
  const reviewItems = result.reviewItems ?? [];
  $('resultFreshness').textContent = result.status === 'complete' ? 'Assessment complete' : 'Assessment finished — ' + evidenceReviewText(reviewItems.length);
  $('assessmentFreshness').textContent = checked === 'Not supplied' ? 'Assessment data check time was not supplied.' : `Assessment data checked ${checked}.`;
  const reviewBadge = $('sourceChecksBadge');
  reviewBadge.hidden = reviewItems.length === 0;
  reviewBadge.textContent = reviewItems.length ? evidenceReviewText(reviewItems.length) : '';
  $('resultReviewNotice').hidden = reviewItems.length === 0;
  $('resultReviewNotice').textContent = reviewItems.length ? evidenceReviewText(reviewItems.length) + ' — open Sources & checks for details.' : 'No evidence items need review.';
  $('sourceChecksHint').textContent = reviewItems.length ? 'Review flagged evidence before formal use.' : 'Source, freshness and assessment notes';
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
  if (submit) { submit.disabled = true; submit.classList.add('is-loading'); submit.setAttribute('aria-busy', 'true'); }
  try {
    const result = await geocoder.searchAddress(query);
    if (!result.ok) {
      const stale = result.cache?.staleAvailable ? ' An earlier result is now out of date and has not been shown.' : '';
      setCallout($('geocodeStatus'), `${plannerFailure('address', result)}${stale}`, 'error');
      return;
    }
    renderCandidates(result);
  } finally {
    if (submit) { submit.disabled = false; submit.classList.remove('is-loading'); submit.removeAttribute('aria-busy'); }
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
    if (!locationChecked) throw new Error('map-review-required');
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
    updateGuidedWorkflow();
  } catch {
    setCallout($('confirmationStatus'), 'Select a valid assessment point before confirming.', 'error');
  }
}

async function loadStops(forceRefresh, mode = lastAssessmentMode, { skipScope = false, discoveryOverride = null } = {}) {
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
  $('findStops').classList.add('is-loading');
  $('findNearestStops').classList.add('is-loading');
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
      scopeBox.textContent = `Selected radius: ${selectedRadius()} m · ${stopCount} stop${stopCount === 1 ? '' : 's'} · ${routeCount} distinct route${routeCount === 1 ? '' : 's'} · ${pairCount} detailed route × StopPoint pair${pairCount === 1 ? '' : 's'}.`;
      scopeBox.hidden = false;
      if (pairCount > TFL_SAFE_DETAILED_PAIR_LIMIT) {
        pendingScopeDiscovery = discovery;
        pendingScopeContext = { site: confirmedSite, radius: Number($('radius').value) };
        scopeBox.append(' This assessment may require staged TfL requests. Reduce the radius, use nearest/recommended assessment, or continue the full staged assessment. ');
        const nearest = document.createElement('button'); nearest.type = 'button'; nearest.className = 'secondary compact'; nearest.textContent = 'Use nearest assessment'; nearest.addEventListener('click', () => loadStops(false, 'nearest'));
        const continueButton = document.createElement('button'); continueButton.type = 'button'; continueButton.className = 'primary compact'; continueButton.textContent = 'Continue full staged assessment'; continueButton.addEventListener('click', () => {
          const reusableDiscovery = pendingScopeContext?.site === confirmedSite && Number(pendingScopeContext.radius) === Number($('radius').value) ? pendingScopeDiscovery : null;
          pendingScopeDiscovery = null;
          pendingScopeContext = null;
          loadStops(forceRefresh, 'full', { skipScope: true, discoveryOverride: reusableDiscovery });
        });
        scopeBox.append(nearest, continueButton);
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
    $('findStops').classList.remove('is-loading');
    $('findNearestStops').classList.remove('is-loading');
    $('findStops').disabled = !confirmedSite;
    $('findNearestStops').disabled = !confirmedSite;
    $('refreshStops').disabled = !confirmedSite;
    $('exportBusWord').disabled = !currentBusResult;
  }
}

function exportBusWord() {
  if (!currentBusResult?.ok || !confirmedSite) return setCallout($('stopStatus'), 'Build a Bus assessment before exporting to Word.', 'warning');
  const report = selectedResult();
  if (!report.stops.length && !(report.plannerServiceSummaries ?? report.serviceSummaries).length) return setCallout($('stopStatus'), 'Select at least one stop or service before exporting.', 'warning');
  downloadWordDocument(busWordFilename(confirmedSite), 'ATLAS Bus Assessment', buildBusWordTables(report), report.wording);
  setCallout($('stopStatus'), 'Word export created from the checked Bus assessment.', 'success');
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

document.querySelectorAll('nav [data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('newAssessment').addEventListener('click', startNewAssessment);
$('addressForm').addEventListener('submit', searchAddress);
$('chooseOnMap').addEventListener('click', () => {
  setCallout($('mapStatus'), 'Pan or zoom if needed, then click the map to place the assessment point.', 'warning');
  $('siteMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('siteMap').focus({ preventScroll: true });
});
$('coordinatesForm').addEventListener('submit', enterCoordinates);
$('confirmMapLocation').addEventListener('click', confirmMapLocation);
$('reviewMapStep').addEventListener('click', () => { $('locationSetupContent').hidden = false; $('locationStageSummary').hidden = true; locationChecked = false; updateGuidedWorkflow(); $('siteMap').focus({ preventScroll: true }); });
$('reviewResultsButton').addEventListener('click', () => $('evidencePanel').scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
$('viewDataDetails').addEventListener('click', () => { const details = $('dataStatusDetails'); details.open = !details.open; details.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
const localMaintenance = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
const updateButton = $('updateBusData');
updateButton.hidden = !localMaintenance;
if (localMaintenance) updateButton.addEventListener('click', updateBusData);
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
initMap();
showView(location.hash.slice(1));
refreshDataStatus();
updateGuidedWorkflow();

window.__ATLAS_SITE_SELECTOR__ = Object.freeze({ getSnapshot: selector.getSnapshot, getMap: () => map });
window.__ATLAS_BUS_UI__ = Object.freeze({ hasRadiusCircle: () => Boolean(radiusCircle), getTaskStatus: () => taskStatus.getState() });
