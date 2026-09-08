export const SITE_SCHEMA_VERSION = '2.0.0';

export const SITE_LOCATION_METHODS = Object.freeze({
  GEOCODED_CANDIDATE: 'geocoded_candidate',
  PLANNER_ADJUSTED: 'planner_adjusted',
  MAP_SELECTED: 'map_selected',
  COORDINATES_ENTERED: 'coordinates_entered'
});

const VALID_STATES = new Set(['candidate', 'confirmed', 'invalid']);
const VALID_METHODS = new Set(Object.values(SITE_LOCATION_METHODS));

const clean = value => String(value ?? '').trim();
const list = value => Object.freeze((Array.isArray(value) ? value : value ? [value] : []).map(clean).filter(Boolean));

function finiteCoordinate(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function samePoint(first, second) {
  return first.latitude !== null && first.longitude !== null
    && second.latitude !== null && second.longitude !== null
    && Math.abs(first.latitude - second.latitude) < 1e-10
    && Math.abs(first.longitude - second.longitude) < 1e-10;
}

function timestamp(value, label, errors) {
  const supplied = clean(value);
  if (supplied && Number.isNaN(Date.parse(supplied))) errors.push(`${label} must be ISO-8601 compatible.`);
  return supplied || null;
}

export function createSite(input = {}) {
  const suppliedAddress = clean(input.suppliedAddress ?? input.address);
  const displayAddress = clean(input.displayAddress ?? suppliedAddress);
  const geocodingInput = input.geocoding ?? {};
  const assessmentInput = input.assessmentPoint ?? {};
  const geocodingSource = clean(input.geocodingSource ?? geocodingInput.source);
  const geocodedPoint = {
    latitude: finiteCoordinate(input.geocodedLatitude ?? geocodingInput.latitude ?? (geocodingSource ? input.latitude : null)),
    longitude: finiteCoordinate(input.geocodedLongitude ?? geocodingInput.longitude ?? (geocodingSource ? input.longitude : null))
  };
  const assessmentPoint = {
    latitude: finiteCoordinate(input.assessmentLatitude ?? assessmentInput.latitude ?? input.latitude),
    longitude: finiteCoordinate(input.assessmentLongitude ?? assessmentInput.longitude ?? input.longitude)
  };
  const warnings = [...list(input.warnings ?? input.validation?.warnings)];
  const errors = [...list(input.errors ?? input.validation?.errors)];

  const method = clean(input.locationMethod ?? assessmentInput.method)
    || (geocodingSource ? SITE_LOCATION_METHODS.GEOCODED_CANDIDATE : SITE_LOCATION_METHODS.MAP_SELECTED);
  const addressRequired = Boolean(geocodingSource)
    || method === SITE_LOCATION_METHODS.GEOCODED_CANDIDATE
    || method === SITE_LOCATION_METHODS.PLANNER_ADJUSTED;

  if (addressRequired && !suppliedAddress) errors.push('A supplied address or site description is required for a geocoded Site.');
  if (addressRequired && !displayAddress) errors.push('A display address or site description is required for a geocoded Site.');
  if (assessmentPoint.latitude === null) errors.push('Assessment-point latitude is required.');
  else if (assessmentPoint.latitude < -90 || assessmentPoint.latitude > 90) errors.push('Assessment-point latitude must be between -90 and 90.');
  if (assessmentPoint.longitude === null) errors.push('Assessment-point longitude is required.');
  else if (assessmentPoint.longitude < -180 || assessmentPoint.longitude > 180) errors.push('Assessment-point longitude must be between -180 and 180.');

  if (geocodedPoint.latitude !== null && (geocodedPoint.latitude < -90 || geocodedPoint.latitude > 90)) errors.push('Geocoded latitude must be between -90 and 90.');
  if (geocodedPoint.longitude !== null && (geocodedPoint.longitude < -180 || geocodedPoint.longitude > 180)) errors.push('Geocoded longitude must be between -180 and 180.');
  if ((geocodedPoint.latitude !== null || geocodedPoint.longitude !== null) && !geocodingSource) errors.push('Geocoding source is required when geocoding coordinates are recorded.');
  if (geocodingSource && (geocodedPoint.latitude === null || geocodedPoint.longitude === null)) errors.push('Both original geocoding coordinates are required when a geocoding source is recorded.');

  if (!VALID_METHODS.has(method)) errors.push(`Unsupported assessment-point method: ${method}.`);

  const retrievedAt = timestamp(input.retrievedAt ?? geocodingInput.retrievedAt, 'Geocoding retrieval timestamp', errors);
  const requestedState = clean(input.validationState ?? input.validation?.state);
  let state = requestedState || (errors.length ? 'invalid' : 'candidate');
  if (!VALID_STATES.has(state)) errors.push(`Unsupported Site validation state: ${state}.`);
  if (errors.length) state = 'invalid';
  const confirmedAt = state === 'confirmed'
    ? timestamp(input.confirmedAt ?? assessmentInput.confirmedAt ?? input.validation?.confirmedAt, 'Assessment-point confirmation timestamp', errors)
    : null;
  if (errors.length) state = 'invalid';

  const adjustedFromCandidate = input.adjustedFromCandidate ?? assessmentInput.adjustedFromCandidate
    ?? (geocodingSource ? method !== SITE_LOCATION_METHODS.GEOCODED_CANDIDATE || !samePoint(geocodedPoint, assessmentPoint) : false);
  const userVisibleStatus = state === 'confirmed' ? 'Confirmed assessment point' : state === 'invalid' ? 'Location needs correction' : 'Assessment point not confirmed';

  return Object.freeze({
    schemaVersion: SITE_SCHEMA_VERSION,
    siteId: clean(input.siteId) || null,
    project: Object.freeze({
      id: clean(input.projectId ?? input.project?.id) || null,
      name: clean(input.projectName ?? input.project?.name) || null
    }),
    suppliedAddress,
    displayAddress,
    latitude: assessmentPoint.latitude,
    longitude: assessmentPoint.longitude,
    coordinateReferenceSystem: 'EPSG:4326',
    geocoding: Object.freeze({
      source: geocodingSource || null,
      sourceIdentifier: clean(input.geocodingSourceIdentifier ?? geocodingInput.sourceIdentifier) || null,
      sourceEndpoint: clean(input.geocodingSourceEndpoint ?? geocodingInput.sourceEndpoint) || null,
      query: clean(input.geocodingQuery ?? geocodingInput.query) || null,
      strategy: clean(input.geocodingStrategy ?? geocodingInput.strategy) || null,
      latitude: geocodedPoint.latitude,
      longitude: geocodedPoint.longitude,
      retrievedAt,
      licence: clean(input.geocodingLicence ?? geocodingInput.licence) || null
    }),
    assessmentPoint: Object.freeze({
      latitude: assessmentPoint.latitude,
      longitude: assessmentPoint.longitude,
      method,
      adjustedFromCandidate: Boolean(adjustedFromCandidate),
      confirmedAt,
      status: userVisibleStatus
    }),
    validation: Object.freeze({
      state,
      confirmedAt,
      warnings: Object.freeze(warnings),
      errors: Object.freeze(errors)
    })
  });
}

export function setAssessmentPoint(site, { latitude, longitude, method = SITE_LOCATION_METHODS.PLANNER_ADJUSTED } = {}) {
  if (!site || site.validation?.state === 'invalid') throw new Error('A valid Site identity is required before setting its assessment point.');
  const nextPoint = { latitude: finiteCoordinate(latitude), longitude: finiteCoordinate(longitude) };
  const originalPoint = { latitude: finiteCoordinate(site.geocoding?.latitude), longitude: finiteCoordinate(site.geocoding?.longitude) };
  return createSite({
    ...site,
    projectId: site.project?.id,
    projectName: site.project?.name,
    assessmentLatitude: latitude,
    assessmentLongitude: longitude,
    locationMethod: method,
    adjustedFromCandidate: Boolean(site.geocoding?.source)
      && (method !== SITE_LOCATION_METHODS.GEOCODED_CANDIDATE || !samePoint(originalPoint, nextPoint)),
    validationState: 'candidate',
    confirmedAt: null,
    warnings: site.validation?.warnings,
    errors: []
  });
}

export function confirmSite(candidate, { confirmedAt = new Date().toISOString() } = {}) {
  if (!candidate || candidate.validation?.state === 'invalid') throw new Error('Only a valid Site assessment point can be confirmed.');
  return createSite({
    ...candidate,
    projectId: candidate.project?.id,
    projectName: candidate.project?.name,
    validationState: 'confirmed',
    confirmedAt,
    warnings: candidate.validation?.warnings,
    errors: []
  });
}

export function isConfirmedSite(site) {
  return site?.schemaVersion === SITE_SCHEMA_VERSION
    && site.validation?.state === 'confirmed'
    && site.assessmentPoint?.confirmedAt
    && Number.isFinite(site.latitude)
    && Number.isFinite(site.longitude);
}
