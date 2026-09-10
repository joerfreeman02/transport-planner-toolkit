import { hasScheduledEvidenceAt } from './scheduled-evidence.mjs';

export const TIMETABLE_PRESENTATION_LABELS = Object.freeze({
  tfl: 'Transport for London scheduled timetables',
  national: 'Department for Transport bus timetables'
});

export const STOP_PRESENTATION_LABELS = Object.freeze({
  tfl: 'Transport for London StopPoint',
  national: 'Department for Transport NaPTAN'
});

const text = value => String(value ?? '').trim();
const normal = value => text(value).toLowerCase();

export function timetableProviderKindsFromText(value) {
  const source = text(value);
  return [...new Set([
    /TfL|Transport for London/i.test(source) ? 'tfl' : null,
    /BODS|Bus Open Data|Department for Transport bus timetable/i.test(source) ? 'national' : null,
    /TNDS|Traveline National Dataset/i.test(source) ? 'national' : null
  ].filter(Boolean))];
}

export function timetableProviderLabelsFromText(value) {
  const source = text(value);
  return [...new Set([
    /BODS|Bus Open Data|Department for Transport bus timetable/i.test(source) ? 'BODS' : null,
    /TNDS|Traveline National Dataset/i.test(source) ? 'TNDS' : null
  ].filter(Boolean))];
}

export function timetableProviderKinds(service = {}) {
  return timetableProviderKindsFromText([service.timetableSource, service.source?.provider].filter(Boolean).join(' '));
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function allTfLRequestsFailed(provenance) {
  return Boolean(provenance.tflTimetableAttempted)
    && Number(provenance.failedRequests || 0) > 0
    && Number(provenance.successfulRequests || 0) === 0;
}

function structuredTimetableScope(provenance = {}) {
  const hasScope = ['tflTimetableAttempted', 'nationalTimetableAttempted', 'nationalSupplementaryAttempted', 'nationalEvidenceRequired', 'nationalEvidenceNotRequired']
    .some(field => Object.prototype.hasOwnProperty.call(provenance, field));
  if (hasScope) return null;
  const source = text(provenance.source);
  if (/TfL scheduled timetable authority/i.test(source)) return ['tfl'];
  if (/Department for Transport Bus Open Data Service|Traveline National Dataset/i.test(source)) return ['national'];
  const inferred = timetableProviderKindsFromText(source);
  return inferred.length === 1 ? inferred : [];
}

export function buildTimetableSourcePresentation(provenance = {}, services = []) {
  const serviceKinds = new Set((services ?? []).flatMap(timetableProviderKinds));
  const legacyKinds = structuredTimetableScope(provenance) ?? [];
  const tflAttempted = provenance.tflTimetableAttempted === true || serviceKinds.has('tfl') || legacyKinds.includes('tfl');
  const nationalAttempted = provenance.nationalTimetableAttempted === true || serviceKinds.has('national') || legacyKinds.includes('national');
  const labels = [];
  if (tflAttempted) labels.push(`${TIMETABLE_PRESENTATION_LABELS.tfl}${allTfLRequestsFailed(provenance) ? ' (unavailable)' : ''}`);
  if (nationalAttempted) labels.push(`${TIMETABLE_PRESENTATION_LABELS.national}${provenance.nationalSourceAvailable === false ? ' (unavailable)' : ''}`);
  return Object.freeze({
    providers: Object.freeze(unique([
      tflAttempted ? 'tfl' : null,
      nationalAttempted ? 'national' : null
    ])),
    label: labels.join(' + ') || 'No timetable source was checked',
    tflTimetableAttempted: tflAttempted,
    nationalTimetableAttempted: nationalAttempted
  });
}

function routeAuthorityKinds(stop = {}) {
  const routeAuthorities = stop.routeAuthorities && typeof stop.routeAuthorities === 'object'
    ? Object.values(stop.routeAuthorities).flatMap(values => Array.isArray(values) ? values : [values])
    : (stop.timetableAuthorities ?? [stop.timetableAuthority]);
  const kinds = new Set();
  for (const authority of routeAuthorities.map(normal).filter(Boolean)) {
    if (authority === 'tfl' || authority.includes('transport for london')) kinds.add('tfl');
    else kinds.add('national');
  }
  return kinds;
}

function identityForStop(identity, stopId) {
  return text(identity).endsWith(`|${stopId}`);
}

export function buildStopTimetableSourcePresentation(stop = {}, provenance = {}, services = []) {
  const stopId = text(stop.id || stop.sourceId);
  const authorityKinds = routeAuthorityKinds(stop);
  const legacyKinds = structuredTimetableScope(provenance) ?? [];
  const matchedKinds = new Set((services ?? [])
    .filter(service => hasScheduledEvidenceAt(service, stopId))
    .flatMap(timetableProviderKinds));
  const tflRequestForStop = (provenance.tflTimetableRequestIdentities ?? []).some(identity => identityForStop(identity, stopId));
  const nationalScopeForStop = (provenance.nationalTimetableStopIds ?? []).map(text).includes(stopId);
  const hasTflRequestScope = Object.prototype.hasOwnProperty.call(provenance, 'tflTimetableRequestIdentities');
  const hasNationalStopScope = Object.prototype.hasOwnProperty.call(provenance, 'nationalTimetableStopIds');
  const tflRelevant = authorityKinds.has('tfl') || tflRequestForStop || matchedKinds.has('tfl');
  const nationalRelevant = authorityKinds.has('national') || nationalScopeForStop || matchedKinds.has('national');
  const tflAttemptedForStop = tflRequestForStop || matchedKinds.has('tfl') || legacyKinds.includes('tfl') || (provenance.tflTimetableAttempted === true && !hasTflRequestScope && authorityKinds.has('tfl'));
  const nationalAttemptedForStop = nationalScopeForStop || matchedKinds.has('national') || legacyKinds.includes('national') || (provenance.nationalTimetableAttempted === true && !hasNationalStopScope && authorityKinds.has('national'));
  const checked = [];
  const unavailable = [];
  if (tflRelevant && tflAttemptedForStop) {
    if (allTfLRequestsFailed(provenance) && !matchedKinds.has('tfl')) unavailable.push('TfL');
    else checked.push('TfL');
  }
  if (nationalRelevant && nationalAttemptedForStop) {
    if (provenance.nationalSourceAvailable === false && !matchedKinds.has('national')) unavailable.push('BODS/TNDS');
    else checked.push(...(provenance.nationalTimetableProviders?.length ? provenance.nationalTimetableProviders : ['BODS/TNDS']));
  }
  return Object.freeze({
    checked: Object.freeze(unique(checked)),
    unavailable: Object.freeze(unique(unavailable)),
    label: unique(checked).join(' / '),
    unavailableLabel: unique(unavailable).join(' / ')
  });
}

export function buildStopDiscoverySourceLabel(provenance = {}) {
  const nationalAvailable = provenance.nationalStopSourceAvailable === true;
  const tflAvailable = provenance.tflStopSourceAvailable === true;
  if (!provenance.crossBoundaryTfLAttempted && tflAvailable && provenance.nationalStopSourceAvailable == null) return 'Transport for London';
  if (nationalAvailable && tflAvailable) return `${STOP_PRESENTATION_LABELS.national} + ${STOP_PRESENTATION_LABELS.tfl}`;
  if (nationalAvailable) return STOP_PRESENTATION_LABELS.national;
  if (tflAvailable) return STOP_PRESENTATION_LABELS.tfl;
  return 'Bus stop sources unavailable';
}
