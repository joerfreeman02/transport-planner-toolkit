import { createJsonCache } from '../../../src/atlas/infrastructure/cache.mjs';
import { createNominatimGeocodingAdapter } from '../../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createTflBusStopAdapter } from '../../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';

const $ = id => document.getElementById(id);
const cache = createJsonCache({ storage: localStorage, namespace: 'atlas.alpha1' });
const geocoder = createNominatimGeocodingAdapter({ cache });
const tfl = createTflBusStopAdapter({ cache });
let confirmedSite = null;

function showView(name) {
  document.querySelectorAll('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== name; });
  document.querySelectorAll('nav [data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  if (location.hash !== `#${name}` && name !== 'modules') history.replaceState(null, '', `#${name}`);
}

function setCallout(element, message, state = 'neutral') {
  element.className = `callout ${state}`;
  element.textContent = message;
}

function formatTime(value) {
  if (!value) return 'Not supplied';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
}

function renderCandidates(result) {
  const list = $('candidateList');
  list.replaceChildren();
  if (!result.data.length) {
    setCallout($('geocodeStatus'), result.warnings.join(' ') || 'No address candidates were returned.', 'warning');
    return;
  }
  const state = result.data.length > 1 || result.warnings.length ? 'warning' : 'success';
  setCallout($('geocodeStatus'), `${result.data.length} candidate${result.data.length === 1 ? '' : 's'} returned. Select the correct property to confirm it. ${result.warnings.join(' ')}`.trim(), state);
  result.data.forEach(candidate => {
    const card = document.createElement('article');
    card.className = 'candidate';
    const detail = document.createElement('div');
    const address = document.createElement('p');
    address.textContent = candidate.displayAddress;
    const meta = document.createElement('small');
    meta.textContent = `${candidate.latitude.toFixed(6)}, ${candidate.longitude.toFixed(6)} · ${candidate.geocoding.sourceIdentifier}`;
    detail.append(address, meta);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Confirm this Site';
    button.addEventListener('click', () => confirmCandidate(candidate));
    card.append(detail, button);
    list.append(card);
  });
}

function confirmCandidate(candidate) {
  confirmedSite = geocoder.confirm(candidate);
  $('candidateList').replaceChildren();
  setCallout($('geocodeStatus'), 'Site confirmed. ATLAS can now request official nearby-stop evidence.', 'success');
  const panel = $('confirmedSite');
  panel.hidden = false;
  panel.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = 'Confirmed Site';
  const address = document.createElement('p');
  address.textContent = confirmedSite.displayAddress;
  const details = document.createElement('dl');
  const rows = [
    ['Coordinates', `${confirmedSite.latitude.toFixed(6)}, ${confirmedSite.longitude.toFixed(6)} (WGS84)`],
    ['Geocoding source', confirmedSite.geocoding.source],
    ['Source record', confirmedSite.geocoding.sourceIdentifier],
    ['Retrieved', formatTime(confirmedSite.geocoding.retrievedAt)]
  ];
  rows.forEach(([term, value]) => {
    const dt = document.createElement('dt'); dt.textContent = term;
    const dd = document.createElement('dd'); dd.textContent = value;
    details.append(dt, dd);
  });
  panel.append(strong, address, details);
  $('findStops').disabled = false;
  $('refreshStops').disabled = false;
  setCallout($('stopStatus'), 'Ready to retrieve nearby TfL bus stops.', 'neutral');
}

function renderEvidence(result) {
  const panel = $('evidencePanel');
  const rows = $('evidenceRows');
  panel.hidden = false;
  rows.replaceChildren();
  for (const evidence of result.evidence) {
    const stop = evidence.value;
    const row = document.createElement('tr');
    const cells = [
      [stop.name, stop.indicator || 'Indicator not supplied'],
      [stop.id, stop.stopType || 'Type not supplied'],
      [`${stop.distanceMetres.toLocaleString('en-GB')} m`, 'Straight-line, calculated'],
      [`${stop.latitude.toFixed(6)}, ${stop.longitude.toFixed(6)}`, 'WGS84'],
      [evidence.source.name, evidence.source.attribution || ''],
      [formatTime(evidence.retrievedAt), ''],
      [evidence.freshness.status === 'cached-current' ? 'Cached · valid' : 'Live · current', evidence.cache.status]
    ];
    cells.forEach(([primary, secondary], index) => {
      const cell = document.createElement('td');
      const text = document.createElement(index === 6 ? 'span' : 'span');
      text.textContent = primary;
      if (index === 6) text.className = 'freshness';
      cell.append(text);
      if (secondary) { const small = document.createElement('small'); small.textContent = secondary; cell.append(small); }
      row.append(cell);
    });
    rows.append(row);
  }
  $('evidenceSummary').textContent = `${result.evidence.length} Evidence record${result.evidence.length === 1 ? '' : 's'} · ${result.cache.status === 'hit' ? 'cached current result' : 'live source result'}`;
  const provenance = $('provenance');
  provenance.replaceChildren();
  const endpoint = document.createElement('p');
  const endpointLink = document.createElement('a');
  endpointLink.href = result.provenance.endpoint;
  endpointLink.target = '_blank';
  endpointLink.rel = 'noopener noreferrer';
  endpointLink.textContent = result.provenance.endpoint;
  endpoint.append('Source endpoint: ', endpointLink);
  const retrieved = document.createElement('p');
  retrieved.textContent = `Retrieved: ${formatTime(result.provenance.retrievedAt)} · Anonymous request: ${result.provenance.anonymousRequest ? 'yes' : 'no'} · Embedded API key: ${result.provenance.apiKeyEmbedded ? 'yes' : 'no'}`;
  const warningList = document.createElement('ul');
  result.warnings.forEach(warning => { const item = document.createElement('li'); item.textContent = warning; warningList.append(item); });
  provenance.append(endpoint, retrieved, warningList);
}

async function searchAddress(event) {
  event.preventDefault();
  confirmedSite = null;
  $('confirmedSite').hidden = true;
  $('findStops').disabled = true;
  $('refreshStops').disabled = true;
  $('evidencePanel').hidden = true;
  $('candidateList').replaceChildren();
  setCallout($('geocodeStatus'), 'Requesting address candidates…', 'neutral');
  const result = await geocoder.searchAddress($('address').value);
  if (!result.ok) {
    setCallout($('geocodeStatus'), `${result.message}${result.cache?.staleAvailable ? ' A stale cached result exists but was not used.' : ''}`, 'error');
    return;
  }
  renderCandidates(result);
}

async function loadStops(forceRefresh) {
  setCallout($('stopStatus'), forceRefresh ? 'Refreshing from TfL…' : 'Requesting nearby stops from TfL…', 'neutral');
  $('findStops').disabled = true;
  $('refreshStops').disabled = true;
  try {
    const result = await tfl.nearbyStops(confirmedSite, { radius: $('radius').value, forceRefresh });
    if (!result.ok) {
      $('evidencePanel').hidden = true;
      setCallout($('stopStatus'), `${result.message}${result.cache?.staleAvailable ? ' Stale cached data exists but has not been displayed.' : ''}`, 'error');
      return;
    }
    renderEvidence(result);
    const origin = result.cache.status === 'hit' ? 'A valid cached result is shown with its original retrieval time.' : 'A live TfL result is shown.';
    setCallout($('stopStatus'), `${result.data.length} nearby stop${result.data.length === 1 ? '' : 's'} returned. ${origin}`, result.warnings.length ? 'warning' : 'success');
  } finally {
    $('findStops').disabled = !confirmedSite;
    $('refreshStops').disabled = !confirmedSite;
  }
}

document.querySelectorAll('nav [data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('addressForm').addEventListener('submit', searchAddress);
$('findStops').addEventListener('click', () => loadStops(false));
$('refreshStops').addEventListener('click', () => loadStops(true));
window.addEventListener('hashchange', () => showView(['report-builder', 'projects'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'modules'));
showView(['report-builder', 'projects'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'modules');
