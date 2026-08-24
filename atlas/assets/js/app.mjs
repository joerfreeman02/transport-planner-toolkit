import { createJsonCache } from '../../../src/atlas/infrastructure/cache.mjs';
import { createNominatimGeocodingAdapter } from '../../../src/atlas/adapters/nominatim-geocoding-adapter.mjs';
import { createTflBusStopAdapter } from '../../../src/atlas/adapters/tfl-bus-stop-adapter.mjs';

const $ = id => document.getElementById(id);
const cache = createJsonCache({ storage: localStorage, namespace: 'atlas.alpha1' });
const geocoder = createNominatimGeocodingAdapter({ cache });
const tfl = createTflBusStopAdapter({ cache });
const views = ['report-builder', 'modules', 'projects', 'about'];
let confirmedSite = null;

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
  if (kind === 'address') return 'Address search is temporarily unavailable. Please try again shortly.';
  return 'Bus information is temporarily unavailable. Please try again shortly.';
}

function plannerStopWarning(warning) {
  if (/incomplete/i.test(warning)) return 'Some incomplete stop records were left out.';
  if (/duplicate/i.test(warning)) return 'Repeated stop records were counted once.';
  if (/no bus stops/i.test(warning)) return 'No bus stops were found within the selected distance.';
  if (/dataset timestamp|dataset.*version/i.test(warning)) return 'Transport for London did not include a publication date with this result.';
  return warning.replace(/TfL/g, 'Transport for London');
}

function renderCandidates(result) {
  const list = $('candidateList');
  list.replaceChildren();
  if (!result.data.length) {
    setCallout($('geocodeStatus'), 'We could not find a matching UK address. Check the address and try again.', 'warning');
    return;
  }
  const adjusted = result.warnings.length > 0;
  const message = result.data.length > 1
    ? 'We found more than one possible location. Please choose the correct site.'
    : adjusted
      ? 'We adjusted the address wording to find a possible match. Check the property carefully before continuing.'
      : 'We found one possible location. Check it carefully before continuing.';
  setCallout($('geocodeStatus'), message, result.data.length > 1 || adjusted ? 'warning' : 'success');
  result.data.forEach(candidate => {
    const card = document.createElement('article');
    card.className = 'candidate';
    const detail = document.createElement('div');
    const address = document.createElement('p');
    address.textContent = candidate.displayAddress;
    const meta = document.createElement('small');
    meta.textContent = 'Possible address match';
    detail.append(address, meta);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Confirm this site';
    button.addEventListener('click', () => confirmCandidate(candidate));
    card.append(detail, button);
    list.append(card);
  });
}

function confirmCandidate(candidate) {
  confirmedSite = geocoder.confirm(candidate);
  $('candidateList').replaceChildren();
  setCallout($('geocodeStatus'), 'Site confirmed. You can now check nearby bus stops.', 'success');
  const panel = $('confirmedSite');
  panel.hidden = false;
  panel.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = 'Confirmed site';
  const address = document.createElement('p');
  address.textContent = confirmedSite.displayAddress;
  const details = document.createElement('dl');
  const rows = [
    ['Location', `${confirmedSite.latitude.toFixed(6)}, ${confirmedSite.longitude.toFixed(6)}`],
    ['Address source', 'OpenStreetMap'],
    ['Checked', formatTime(confirmedSite.geocoding.retrievedAt)]
  ];
  rows.forEach(([term, value]) => {
    const dt = document.createElement('dt'); dt.textContent = term;
    const dd = document.createElement('dd'); dd.textContent = value;
    details.append(dt, dd);
  });
  const technical = document.createElement('details');
  technical.className = 'technical-details';
  const summary = document.createElement('summary');
  summary.textContent = 'View address check details';
  const diagnostic = document.createElement('p');
  diagnostic.textContent = `Coordinate system: WGS84 · Source record: ${confirmedSite.geocoding.sourceIdentifier} · Search used: ${confirmedSite.geocoding.query}`;
  technical.append(summary, diagnostic);
  panel.append(strong, address, details, technical);
  $('findStops').disabled = false;
  $('refreshStops').disabled = false;
  setCallout($('stopStatus'), 'Ready to check nearby bus stops.', 'neutral');
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
      [stop.name, ''],
      [stop.indicator || 'Not provided', ''],
      [`${stop.distanceMetres.toLocaleString('en-GB')} m`, 'Straight-line distance'],
      [stop.id, '']
    ];
    const labels = ['Stop', 'Direction / stop letter', 'Distance', 'Stop reference'];
    cells.forEach(([primary, secondary], index) => {
      const cell = document.createElement('td');
      cell.dataset.label = labels[index];
      const text = document.createElement('span');
      text.textContent = primary;
      cell.append(text);
      if (secondary) { const small = document.createElement('small'); small.textContent = secondary; cell.append(small); }
      row.append(cell);
    });
    rows.append(row);
  }

  const checked = formatTime(result.provenance.retrievedAt);
  $('evidenceSummary').textContent = `${result.evidence.length} stop${result.evidence.length === 1 ? '' : 's'} found`;
  $('resultSource').textContent = 'Transport for London';
  $('resultChecked').textContent = checked;
  $('resultFreshness').textContent = `Up to date — checked ${checked}`;

  const plannerChecks = $('plannerChecks');
  plannerChecks.replaceChildren();
  const source = document.createElement('p');
  source.innerHTML = '<strong>Source:</strong> Transport for London';
  const checkedLine = document.createElement('p');
  checkedLine.innerHTML = `<strong>Checked:</strong> ${checked}`;
  const status = document.createElement('p');
  status.innerHTML = '<strong>Status:</strong> Up to date';
  plannerChecks.append(source, checkedLine, status);
  const plannerWarnings = [...new Set(result.warnings.map(plannerStopWarning))];
  if (plannerWarnings.length) {
    const heading = document.createElement('strong');
    heading.textContent = 'Points to note';
    const list = document.createElement('ul');
    plannerWarnings.forEach(warning => { const item = document.createElement('li'); item.textContent = warning; list.append(item); });
    plannerChecks.append(heading, list);
  }

  const diagnostics = $('diagnostics');
  diagnostics.replaceChildren();
  const endpoint = document.createElement('p');
  const endpointLink = document.createElement('a');
  endpointLink.href = result.provenance.endpoint;
  endpointLink.target = '_blank';
  endpointLink.rel = 'noopener noreferrer';
  endpointLink.textContent = result.provenance.endpoint;
  endpoint.append('Source endpoint: ', endpointLink);
  const request = document.createElement('p');
  request.textContent = `HTTP status: ${result.provenance.httpStatus ?? 'not supplied'} · Cache status: ${result.cache.status} · Anonymous request: ${result.provenance.anonymousRequest ? 'yes' : 'no'} · Embedded API key: ${result.provenance.apiKeyEmbedded ? 'yes' : 'no'}`;
  const retrieval = document.createElement('p');
  retrieval.textContent = `Exact retrieval timestamp: ${result.provenance.retrievedAt}`;
  diagnostics.append(endpoint, request, retrieval);
}

async function searchAddress(event) {
  event.preventDefault();
  confirmedSite = null;
  $('confirmedSite').hidden = true;
  $('findStops').disabled = true;
  $('refreshStops').disabled = true;
  $('evidencePanel').hidden = true;
  $('candidateList').replaceChildren();
  setCallout($('geocodeStatus'), 'Searching for the address…', 'neutral');
  const result = await geocoder.searchAddress($('address').value);
  if (!result.ok) {
    const stale = result.cache?.staleAvailable ? ' An earlier result is now out of date and has not been shown.' : '';
    setCallout($('geocodeStatus'), `${plannerFailure('address', result)}${stale}`, 'error');
    return;
  }
  renderCandidates(result);
}

async function loadStops(forceRefresh) {
  setCallout($('stopStatus'), forceRefresh ? 'Checking Transport for London again…' : 'Checking Transport for London…', 'neutral');
  $('findStops').disabled = true;
  $('refreshStops').disabled = true;
  try {
    const result = await tfl.nearbyStops(confirmedSite, { radius: $('radius').value, forceRefresh });
    if (!result.ok) {
      $('evidencePanel').hidden = true;
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

document.querySelectorAll('nav [data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('addressForm').addEventListener('submit', searchAddress);
$('findStops').addEventListener('click', () => loadStops(false));
$('refreshStops').addEventListener('click', () => loadStops(true));
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
showView(location.hash.slice(1));
