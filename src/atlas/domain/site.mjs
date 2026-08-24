export const SITE_SCHEMA_VERSION = '1.0.0';

const VALID_STATES = new Set(['candidate', 'confirmed', 'invalid']);

const clean = value => String(value ?? '').trim();
const list = value => Object.freeze((Array.isArray(value) ? value : value ? [value] : []).map(clean).filter(Boolean));

function finiteCoordinate(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createSite(input = {}) {
  const suppliedAddress = clean(input.suppliedAddress ?? input.address);
  const displayAddress = clean(input.displayAddress ?? suppliedAddress);
  const latitude = finiteCoordinate(input.latitude);
  const longitude = finiteCoordinate(input.longitude);
  const warnings = [...list(input.warnings)];
  const errors = [...list(input.errors)];

  if (!suppliedAddress) errors.push('A supplied address is required.');
  if (!displayAddress) errors.push('A display address is required.');
  if (latitude === null) errors.push('Latitude is required.');
  else if (latitude < -90 || latitude > 90) errors.push('Latitude must be between -90 and 90.');
  if (longitude === null) errors.push('Longitude is required.');
  else if (longitude < -180 || longitude > 180) errors.push('Longitude must be between -180 and 180.');

  const geocodingSource = clean(input.geocodingSource);
  const geocodingSourceIdentifier = clean(input.geocodingSourceIdentifier);
  const geocodingSourceEndpoint = clean(input.geocodingSourceEndpoint);
  const retrievedAt = clean(input.retrievedAt);

  if ((latitude !== null || longitude !== null) && !geocodingSource) errors.push('Geocoding source is required for located sites.');
  if (retrievedAt && Number.isNaN(Date.parse(retrievedAt))) errors.push('Geocoding retrieval timestamp must be ISO-8601 compatible.');

  let state = clean(input.validationState) || (errors.length ? 'invalid' : 'candidate');
  if (!VALID_STATES.has(state)) errors.push(`Unsupported Site validation state: ${state}.`);
  if (errors.length) state = 'invalid';

  return Object.freeze({
    schemaVersion: SITE_SCHEMA_VERSION,
    siteId: clean(input.siteId) || null,
    project: Object.freeze({
      id: clean(input.projectId) || null,
      name: clean(input.projectName) || null
    }),
    suppliedAddress,
    displayAddress,
    latitude,
    longitude,
    coordinateReferenceSystem: 'EPSG:4326',
    geocoding: Object.freeze({
      source: geocodingSource || null,
      sourceIdentifier: geocodingSourceIdentifier || null,
      sourceEndpoint: geocodingSourceEndpoint || null,
      query: clean(input.geocodingQuery) || suppliedAddress || null,
      retrievedAt: retrievedAt || null,
      licence: clean(input.geocodingLicence) || null
    }),
    validation: Object.freeze({
      state,
      confirmedAt: state === 'confirmed' ? clean(input.confirmedAt) || retrievedAt || null : null,
      warnings: Object.freeze(warnings),
      errors: Object.freeze(errors)
    })
  });
}

export function confirmSite(candidate, { confirmedAt = new Date().toISOString() } = {}) {
  if (!candidate || candidate.validation?.state === 'invalid') throw new Error('Only a valid Site candidate can be confirmed.');
  return createSite({
    ...candidate,
    projectId: candidate.project?.id,
    projectName: candidate.project?.name,
    geocodingSource: candidate.geocoding?.source,
    geocodingSourceIdentifier: candidate.geocoding?.sourceIdentifier,
    geocodingSourceEndpoint: candidate.geocoding?.sourceEndpoint,
    geocodingQuery: candidate.geocoding?.query,
    retrievedAt: candidate.geocoding?.retrievedAt,
    geocodingLicence: candidate.geocoding?.licence,
    warnings: candidate.validation?.warnings,
    errors: [],
    validationState: 'confirmed',
    confirmedAt
  });
}

export function isConfirmedSite(site) {
  return site?.schemaVersion === SITE_SCHEMA_VERSION && site.validation?.state === 'confirmed' && Number.isFinite(site.latitude) && Number.isFinite(site.longitude);
}
