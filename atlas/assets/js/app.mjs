import { createSiteSelector } from '../../../src/atlas/application/site-selector.mjs';
import { SITE_LOCATION_METHODS } from '../../../src/atlas/domain/site.mjs';
import { createJsonCache } from '../../../src/atlas/infrastructure/cache.mjs';
import { createNominatimGeocodingAdapter } from '../../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createTflBusStopAdapter } from '../../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createPreparedBusDataAdapter } from '../../../src/atlas/adapters/prepared-bus-data-adapter.mjs';
import { createOsrmAccessRoutingAdapter } from '../../../src/atlas/adapters/osrm-access-routing-adapter.mjs';
import { createBusStopDiscovery } from '../../../src/atlas/application/bus-stop-discovery.mjs';
import { createBusAssessment } from '../../../src/atlas/application/bus-assessment.mjs';

const $ = id => document.getElementById(id);
const cache = createJsonCache({ storage: localStorage, namespace: 'atlas.alpha4' });
const geocoder = createNominatimGeocodingAdapter({ cache });
const tfl = createTflBusStopAdapter({ cache });
const preparedBusData = createPreparedBusDataAdapter({ baseUrl: new URL('../../data/bus/', import.meta.url) });
const accessRouting = createOsrmAccessRoutingAdapter();
const busStops = createBusStopDiscovery({ tflAdapter: tfl, naptanAdapter: preparedBusData });
const busAssessment = createBusAssessment({ stopDiscovery: busStops, timetableData: preparedBusData, accessRouting });
const selector = createSiteSelector();
const views = ['report-builder', 'modules', 'projects', 'about'];
const METHOD_LABELS = Object.freeze({
  [SITE_LOCATION_METHODS.GEOCODED_CANDIDATE]: 'From address result',
  [SITE_LOCATION_METHODS.PLANNER_ADJUSTED]: 'Adjusted on map',
  [SITE_LOCATION_METHODS.MAP_SELECTED]: 'Chosen on map',
  [SITE_LOCATION_METHODS.COORDINATES_ENTERED]: 'Entered coordinates'
});
let confirmedSite = null;
let map = null;
let assessmentMarker = null;
let busStopMarkers = [];
let routeLayers = [];

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
  if (kind === 'address') return 'Site search is temporarily unavailable. You can still choose the assessment point on the map.';
  if (result.code === 'coverage_not_implemented') return 'Bus-stop coverage outside Greater London is not connected in this browser yet. The confirmed point was not treated as a zero-stop result.';
  if (result.code === 'invalid_response') return 'The authoritative bus source returned information ATLAS could not safely interpret. No result has been assumed.';
  return 'Bus information is temporarily unavailable. Please try again shortly.';
}

function plannerStopWarning(warning) {
  if (/incomplete/i.test(warning)) return 'Some incomplete stop records were left out.';
  if (/duplicate/i.test(warning)) return 'Repeated stop records were counted once.';
  if (/no bus stops/i.test(warning)) return 'No bus stops were found within the selected distance.';
  if (/dataset timestamp|dataset.*version/i.test(warning)) return 'The source did not include a publication date with this result.';
  if (/prepared bus dataset is .*days old/i.test(warning)) return 'The prepared national bus information should be refreshed before formal use.';
  if (/date-specific exceptions/i.test(warning)) return 'Some timetables contain date-specific changes. Check the assessment date before formal use.';
  if (/No zero-stop conclusion/i.test(warning)) return warning;
  return warning.replace(/TfL/g, 'Transport for London');
}

function providerLabel(result) {
  return /naptan|prepared-national/i.test(result?.provenance?.providerAdapter || '') ? 'Department for Transport NaPTAN' : 'Transport for London';
}

function assessmentMethod(site) {
  if (site?.assessmentPoint?.method === SITE_LOCATION_METHODS.GEOCODED_CANDIDATE && site.validation?.state === 'confirmed') return 'Confirmed from address';
  return METHOD_LABELS[site?.assessmentPoint?.method] || 'Selected by planner';
}

function clearBusEvidence(message = 'Confirm the assessment point before checking nearby bus stops.') {
  const hadEvidence = !$('evidencePanel').hidden;
  confirmedSite = null;
  busStopMarkers.forEach(marker => map?.removeLayer(marker));
  busStopMarkers = [];
  routeLayers.forEach(layer => map?.removeLayer(layer));
  routeLayers = [];
  $('findStops').disabled = true;
  $('refreshStops').disabled = true;
  $('evidencePanel').hidden = true;
  $('evidenceRows').replaceChildren();
  $('serviceRows').replaceChildren();
  $('assessmentWording').textContent = '';
  $('clearRoutes').hidden = true;
  setCallout($('stopStatus'), hadEvidence ? 'The assessment point changed, so the earlier bus results were cleared. Confirm the new point before checking again.' : message, hadEvidence ? 'warning' : 'neutral');
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
  setCallout($('stopStatus'), `Checking the ${label} route to ${stop.name}…`, 'neutral');
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
  setCallout($('stopStatus'), `${mode === 'walk' ? 'Walking' : 'Cycling'} route shown for ${stop.name}.`, 'success');
}

function renderBusStopMarkers(stops) {
  busStopMarkers.forEach(marker => map.removeLayer(marker));
  busStopMarkers = [];
  for (const stop of stops) {
    const marker = window.L.marker([stop.latitude, stop.longitude], {
      title: `${stop.name}${stop.indicator ? ` — ${stop.indicator}` : ''}`,
      icon: window.L.divIcon({ className: '', html: '<div class="bus-stop-marker" aria-hidden="true"><span></span></div>', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] })
    }).addTo(map);
    const popup = document.createElement('div');
    popup.className = 'bus-stop-popup';
    const name = document.createElement('strong');
    name.textContent = stop.name;
    const detail = document.createElement('p');
    detail.textContent = [stop.indicator, stop.direction].filter(Boolean).join(' · ') || 'Direction not provided';
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
  ensureMarker(site.latitude, site.longitude, centreMap);
  $('latitude').value = site.latitude.toFixed(6);
  $('longitude').value = site.longitude.toFixed(6);
  $('selectedIdentity').textContent = site.displayAddress || site.suppliedAddress;
  $('selectedMethod').textContent = assessmentMethod(site);
  $('selectedCoordinates').textContent = `${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}`;
  $('selectedLocation').hidden = false;
  $('confirmedSite').hidden = true;
  $('confirmAssessmentPoint').disabled = false;
  setCallout($('mapStatus'), message || 'Check the marker carefully. Drag it or click the map to move it.', site.assessmentPoint.adjustedFromCandidate ? 'warning' : 'success');
  setCallout($('confirmationStatus'), 'The assessment point has not been confirmed yet.', 'warning');
  clearBusEvidence();
}

function mapIdentity() {
  return $('address').value.trim() || 'Site selected on map';
}

function chooseMapPoint(latitude, longitude, message = 'Assessment point chosen on the map. Check it carefully, then confirm it.') {
  try {
    const site = selector.chooseOnMap({ latitude, longitude, suppliedAddress: mapIdentity(), displayAddress: mapIdentity() });
    renderDraftSite(site, { message });
  } catch {
    setCallout($('mapStatus'), 'That point could not be used. Choose a valid location on the map.', 'error');
  }
}

function renderCandidates(result) {
  const list = $('candidateList');
  list.replaceChildren();
  if (!result.data.length) {
    setCallout($('geocodeStatus'), "We could not find a suitable match. Your description is still recorded — choose the site on the map instead.", 'warning');
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
  const address = document.createElement('p');
  address.textContent = site.displayAddress || site.suppliedAddress;
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
  if (site.geocoding.source) {
    const technical = document.createElement('details');
    technical.className = 'technical-details';
    const summary = document.createElement('summary');
    summary.textContent = 'View address check details';
    const diagnostic = document.createElement('p');
    diagnostic.textContent = `Address source: ${site.geocoding.source}. Original address point: ${site.geocoding.latitude.toFixed(6)}, ${site.geocoding.longitude.toFixed(6)}. Source record: ${site.geocoding.sourceIdentifier}. Search used: ${site.geocoding.query}.`;
    technical.append(summary, diagnostic);
    panel.append(strong, address, details, technical);
  } else panel.append(strong, address, details);
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

function renderAssessment(result) {
  const panel = $('evidencePanel');
  const rows = $('evidenceRows');
  const serviceRows = $('serviceRows');
  panel.hidden = false;
  rows.replaceChildren();
  serviceRows.replaceChildren();
  for (const stop of result.stops) {
    const row = document.createElement('tr');
    const stopCell = document.createElement('span');
    const stopName = document.createElement('strong'); stopName.textContent = stop.name;
    const mapLink = document.createElement('a'); mapLink.href = googleMapsUrl(stop); mapLink.target = '_blank'; mapLink.rel = 'noopener noreferrer'; mapLink.textContent = 'Open in Google Maps';
    stopCell.append(stopName, document.createElement('br'), mapLink);
    appendCell(row, 'Stop name', stopCell);
    appendCell(row, 'Direction', stop.displayDirection);
    const walking = appendCell(row, 'Walking distance / time', formatAccess(stop.walking));
    const cycling = appendCell(row, 'Cycling distance / time', formatAccess(stop.cycling));
    if (stop.walking.status !== 'routed') walking.classList.add('route-unavailable');
    if (stop.cycling.status !== 'routed') cycling.classList.add('route-unavailable');
    appendCell(row, 'Routes serving stop', stop.routes?.length ? stop.routes.join(', ') : 'Timetable route match unavailable');
    rows.append(row);
  }
  if (!result.stops.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5; cell.textContent = 'No authoritative bus stops were found within the selected discovery radius.'; row.append(cell); rows.append(row);
  }
  for (const service of result.serviceSummaries) {
    const row = document.createElement('tr');
    appendCell(row, 'Route', service.routeNumber);
    appendCell(row, 'Operator', service.operator);
    const originDestination = `${service.origin} - ${service.destination}${service.circular && service.direction ? ` (${service.direction})` : ''}`;
    appendCell(row, 'Origin / destination', originDestination);
    appendCell(row, 'Principal locations', service.principalLocations.length ? service.principalLocations.join(', ') : 'No additional principal locations identified');
    const periods = document.createElement('ul'); periods.className = 'period-lines';
    service.operatingPeriodLines.forEach(line => { const item = document.createElement('li'); item.textContent = line; periods.append(item); });
    appendCell(row, 'Operating period', periods);
    serviceRows.append(row);
    if (service.serviceNote) {
      const noteRow = document.createElement('tr'); noteRow.className = 'service-note';
      const noteCell = document.createElement('td'); noteCell.colSpan = 5;
      const label = document.createElement('strong'); label.textContent = 'Service note: ';
      noteCell.append(label, service.serviceNote); noteRow.append(noteCell); serviceRows.append(noteRow);
    }
  }
  if (!result.serviceSummaries.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5; cell.textContent = 'No matched timetable summary is available. Review Sources and checks before using the stop information.'; row.append(cell); serviceRows.append(row);
  }
  renderBusStopMarkers(result.stops);
  $('assessmentWording').textContent = result.wording;
  const stopProvenance = result.provenance.stops ?? {};
  const timetableProvenance = result.provenance.timetables ?? {};
  const checked = formatTime(stopProvenance.retrievedAt || timetableProvenance.retrievedAt);
  const stopSource = providerLabel({ provenance: stopProvenance });
  $('evidenceSummary').textContent = `${result.stops.length} stop${result.stops.length === 1 ? '' : 's'} · ${result.serviceSummaries.length} directional service summar${result.serviceSummaries.length === 1 ? 'y' : 'ies'}`;
  $('resultSource').textContent = `${stopSource}; Department for Transport bus timetables; OpenStreetMap routing`;
  $('resultChecked').textContent = checked;
  $('resultFreshness').textContent = result.status === 'complete' ? 'Assessment complete' : 'Partial assessment - review points to note';
  const plannerChecks = $('plannerChecks');
  plannerChecks.replaceChildren();
  for (const [labelText, value] of [['Stops', stopSource], ['Timetables', timetableProvenance.source || 'Department for Transport Bus Open Data Service'], ['Access routes', 'OpenStreetMap routing through OSRM'], ['Checked', checked], ['Result', result.status === 'complete' ? 'Complete for the information shown' : 'Partial - use the points to note below']]) {
    const line = document.createElement('p'); const label = document.createElement('strong'); label.textContent = `${labelText}: `; line.append(label, value); plannerChecks.append(line);
  }
  const plannerWarnings = [...new Set(result.warnings.map(plannerStopWarning))];
  if (plannerWarnings.length) {
    const heading = document.createElement('strong'); heading.textContent = 'Points to note';
    const list = document.createElement('ul');
    plannerWarnings.forEach(warning => { const item = document.createElement('li'); item.textContent = warning; list.append(item); });
    plannerChecks.append(heading, list);
  }
  const diagnostics = $('diagnostics');
  diagnostics.replaceChildren();
  const diagnosticLines = [
    `Stop source reference: ${stopProvenance.endpoint || 'not supplied'}`,
    `Timetable source reference: ${timetableProvenance.endpoint || 'not supplied'}`,
    `Prepared dataset time: ${timetableProvenance.dataPreparedAt || stopProvenance.dataPreparedAt || 'not supplied'}`,
    `Representative timetable dates: ${JSON.stringify(timetableProvenance.representativeDates || {})}`,
    `Source stop IDs: ${result.stops.map(stop => stop.id).join(', ')}`,
    `Provider routing: ${stopProvenance.providerSelectedBy || 'not supplied'}`,
    `Embedded API key: ${stopProvenance.apiKeyEmbedded || timetableProvenance.apiKeyEmbedded ? 'yes' : 'no'}`
  ];
  diagnosticLines.forEach(value => { const line = document.createElement('p'); line.textContent = value; diagnostics.append(line); });
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
      longitude: $('longitude').value,
      suppliedAddress: mapIdentity(),
      displayAddress: mapIdentity()
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
    renderConfirmedSite(confirmedSite);
    $('confirmAssessmentPoint').disabled = true;
    $('findStops').disabled = false;
    $('refreshStops').disabled = false;
    setCallout($('confirmationStatus'), `${assessmentMethod(confirmedSite)}. The assessment point is confirmed.`, 'success');
    setCallout($('stopStatus'), 'Ready to check nearby bus stops from the confirmed assessment point.', 'neutral');
  } catch {
    setCallout($('confirmationStatus'), 'Select a valid assessment point before confirming.', 'error');
  }
}

async function loadStops(forceRefresh) {
  setCallout($('stopStatus'), forceRefresh ? 'Checking the authoritative bus source again…' : 'Checking the authoritative bus source…', 'neutral');
  $('findStops').disabled = true;
  $('refreshStops').disabled = true;
  try {
    const result = await busAssessment.assess(confirmedSite, { radius: $('radius').value, forceRefresh });
    if (!result.ok) {
      $('evidencePanel').hidden = true;
      busStopMarkers.forEach(marker => map.removeLayer(marker));
      busStopMarkers = [];
      const stale = result.stopsResult?.cache?.staleAvailable ? ' An earlier result is now out of date and has not been shown.' : '';
      setCallout($('stopStatus'), `${plannerFailure('bus', result)}${stale}`, 'error');
      return;
    }
    renderAssessment(result);
    const checked = formatTime(result.provenance.stops?.retrievedAt || result.provenance.timetables?.retrievedAt);
    const message = result.status === 'complete'
      ? `${result.stops.length} nearby stop${result.stops.length === 1 ? '' : 's'} assessed. Complete - checked ${checked}.`
      : `${result.stops.length} nearby stop${result.stops.length === 1 ? '' : 's'} found. Part of the assessment is unavailable; review the points to note.`;
    setCallout($('stopStatus'), message, result.status === 'complete' && !result.warnings.length ? 'success' : 'warning');
  } finally {
    $('findStops').disabled = !confirmedSite;
    $('refreshStops').disabled = !confirmedSite;
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

document.querySelectorAll('nav [data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('addressForm').addEventListener('submit', searchAddress);
$('chooseOnMap').addEventListener('click', () => {
  setCallout($('mapStatus'), 'Pan or zoom if needed, then click the map to place the assessment point.', 'warning');
  $('siteMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('siteMap').focus({ preventScroll: true });
});
$('coordinatesForm').addEventListener('submit', enterCoordinates);
$('confirmAssessmentPoint').addEventListener('click', confirmAssessmentPoint);
$('findStops').addEventListener('click', () => loadStops(false));
$('refreshStops').addEventListener('click', () => loadStops(true));
$('clearRoutes').addEventListener('click', clearRouteLines);
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
initMap();
showView(location.hash.slice(1));

window.__ATLAS_SITE_SELECTOR__ = Object.freeze({ getSnapshot: selector.getSnapshot, getMap: () => map });
