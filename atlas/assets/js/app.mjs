import { createSiteSelector } from '../../../src/atlas/application/site-selector.mjs';
import { SITE_LOCATION_METHODS } from '../../../src/atlas/domain/site.mjs';
import { createJsonCache } from '../../../src/atlas/infrastructure/cache.mjs';
import { createNominatimGeocodingAdapter } from '../../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createTflBusStopAdapter } from '../../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';
import { createNaptanBusStopAdapter } from '../../../src/atlas/adapters/naptan-bus-stop-adapter.mjs';
import { createBusStopDiscovery } from '../../../src/atlas/application/bus-stop-discovery.mjs';

const $ = id => document.getElementById(id);
const cache = createJsonCache({ storage: localStorage, namespace: 'atlas.alpha3' });
const geocoder = createNominatimGeocodingAdapter({ cache });
const tfl = createTflBusStopAdapter({ cache });
const naptan = createNaptanBusStopAdapter({ cache });
const busStops = createBusStopDiscovery({ tflAdapter: tfl, naptanAdapter: naptan });
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
  if (/No zero-stop conclusion/i.test(warning)) return warning;
  return warning.replace(/TfL/g, 'Transport for London');
}

function providerLabel(result) {
  return result?.provenance?.providerAdapter?.startsWith('naptan') ? 'Department for Transport NaPTAN' : 'Transport for London';
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
  $('findStops').disabled = true;
  $('refreshStops').disabled = true;
  $('evidencePanel').hidden = true;
  $('evidenceRows').replaceChildren();
  setCallout($('stopStatus'), hadEvidence ? 'The assessment point changed, so the earlier bus results were cleared. Confirm the new point before checking again.' : message, hadEvidence ? 'warning' : 'neutral');
}

function googleMapsUrl(stop) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(stop.latitude) + ',' + String(stop.longitude))}`;
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
    const link = document.createElement('a');
    link.href = googleMapsUrl(stop);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in Google Maps';
    popup.append(name, detail, services, link);
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

function renderEvidence(result) {
  const panel = $('evidencePanel');
  const rows = $('evidenceRows');
  panel.hidden = false;
  rows.replaceChildren();
  for (const evidence of result.evidence) {
    const stop = evidence.value;
    const row = document.createElement('tr');
    const direction = [stop.indicator, stop.direction].filter(Boolean).join(' · ') || 'Not provided';
    const mapLink = document.createElement('a');
    mapLink.href = googleMapsUrl(stop); mapLink.target = '_blank'; mapLink.rel = 'noopener noreferrer'; mapLink.textContent = 'Open map';
    const cells = [[stop.name, ''], [direction, ''], [`${stop.distanceMetres.toLocaleString('en-GB')} m`, 'Straight-line discovery distance'], [stop.routes?.length ? stop.routes.join(', ') : 'Not available', ''], [mapLink, ''], [stop.sourceId || stop.id, '']];
    const labels = ['Stop', 'Direction / stop letter', 'Discovery distance', 'Routes serving stop', 'Google Maps', 'Source stop ID'];
    cells.forEach(([primary, secondary], index) => {
      const cell = document.createElement('td');
      cell.dataset.label = labels[index];
      if (primary instanceof Node) cell.append(primary);
      else { const text = document.createElement('span'); text.textContent = primary; cell.append(text); }
      if (secondary) { const small = document.createElement('small'); small.textContent = secondary; cell.append(small); }
      row.append(cell);
    });
    rows.append(row);
  }
  renderBusStopMarkers(result.data);
  const checked = formatTime(result.provenance.retrievedAt);
  const sourceName = providerLabel(result);
  $('evidenceSummary').textContent = `${result.evidence.length} stop${result.evidence.length === 1 ? '' : 's'} found`;
  $('resultSource').textContent = sourceName;
  $('resultChecked').textContent = checked;
  $('resultFreshness').textContent = `Up to date — checked ${checked}`;
  const plannerChecks = $('plannerChecks');
  plannerChecks.replaceChildren();
  const source = document.createElement('p'); source.innerHTML = `<strong>Source:</strong> ${sourceName}`;
  const checkedLine = document.createElement('p'); checkedLine.innerHTML = `<strong>Checked:</strong> ${checked}`;
  const status = document.createElement('p'); status.innerHTML = '<strong>Status:</strong> Up to date';
  plannerChecks.append(source, checkedLine, status);
  const plannerWarnings = [...new Set(result.warnings.map(plannerStopWarning))];
  if (plannerWarnings.length) {
    const heading = document.createElement('strong'); heading.textContent = 'Points to note';
    const list = document.createElement('ul');
    plannerWarnings.forEach(warning => { const item = document.createElement('li'); item.textContent = warning; list.append(item); });
    plannerChecks.append(heading, list);
  }
  const diagnostics = $('diagnostics');
  diagnostics.replaceChildren();
  const endpoint = document.createElement('p');
  const endpointLink = document.createElement('a');
  endpointLink.href = result.provenance.endpoint; endpointLink.target = '_blank'; endpointLink.rel = 'noopener noreferrer'; endpointLink.textContent = result.provenance.endpoint;
  endpoint.append('Source endpoint: ', endpointLink);
  const request = document.createElement('p'); request.textContent = `HTTP status: ${result.provenance.httpStatus ?? 'not supplied'} · Cache status: ${result.cache.status} · Anonymous request: ${result.provenance.anonymousRequest ? 'yes' : 'no'} · Embedded API key: ${result.provenance.apiKeyEmbedded ? 'yes' : 'no'}`;
  const retrieval = document.createElement('p'); retrieval.textContent = `Exact retrieval timestamp: ${result.provenance.retrievedAt}`;
  const routing = document.createElement('p'); routing.textContent = `Provider routing: ${result.provenance.providerSelectedBy}`;
  diagnostics.append(endpoint, request, retrieval, routing);
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
    const result = await busStops.nearbyStops(confirmedSite, { radius: $('radius').value, forceRefresh });
    if (!result.ok) {
      $('evidencePanel').hidden = true;
      busStopMarkers.forEach(marker => map.removeLayer(marker));
      busStopMarkers = [];
      const stale = result.cache?.staleAvailable ? ' An earlier result is now out of date and has not been shown.' : '';
      setCallout($('stopStatus'), `${plannerFailure('bus', result)}${stale}`, 'error');
      return;
    }
    renderEvidence(result);
    const checked = formatTime(result.provenance.retrievedAt);
    setCallout($('stopStatus'), `${result.data.length} nearby stop${result.data.length === 1 ? '' : 's'} found. Up to date — checked ${checked}.`, result.warnings.length ? 'warning' : 'success');
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
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
initMap();
showView(location.hash.slice(1));

window.__ATLAS_SITE_SELECTOR__ = Object.freeze({ getSnapshot: selector.getSnapshot, getMap: () => map });
