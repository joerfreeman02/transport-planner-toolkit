const SCHEMA = 'tfl-ibus-operator-index-v1';
const PROVIDER = 'TfL iBus Static Data';

const text = value => String(value ?? '').trim();
const normal = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const unique = values => [...new Set(values.map(text).filter(Boolean))];

function assessmentDay(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(result) ? result.slice(0, 10) : '';
}

function assertVersion(value, expected, context) {
  if (value != null && String(value) !== expected) throw new Error(`Mixed TfL iBus Base_Version in ${context}.`);
}

export function validateTflIbusOperatorIndex(index) {
  if (!index || typeof index !== 'object' || index.schema !== SCHEMA) throw new Error('Unsupported or missing TfL iBus operator-index schema.');
  const version = text(index.baseVersion);
  if (!/^\d{8}$/.test(version)) throw new Error('TfL iBus operator index has an invalid Base_Version.');
  if (!text(index.validFrom) || !text(index.validTo) || !Array.isArray(index.serviceLines) || !Array.isArray(index.patterns)) throw new Error('TfL iBus operator index is missing validity or lineage data.');
  for (const line of index.serviceLines) {
    assertVersion(line?.baseVersion, version, 'Line');
    if (!text(line?.serviceLineNo) || !text(line?.contractLineNo)) throw new Error('TfL iBus Line mapping is incomplete.');
  }
  for (const pattern of index.patterns) {
    assertVersion(pattern?.baseVersion, version, 'Pattern');
    if (!text(pattern?.patternIdx) || !text(pattern?.serviceLineNo) || !text(pattern?.contractLineNo) || Number(pattern?.patternType) !== 1 || !Array.isArray(pattern?.orderedStopPointIds) || !Array.isArray(pattern?.journeys)) throw new Error('TfL iBus productive Pattern evidence is incomplete.');
    for (const journey of pattern.journeys) {
      assertVersion(journey?.baseVersion, version, 'Journey');
      if (Number(journey?.journeyType) !== 1 || !text(journey?.journeyIdx) || !text(journey?.blockIdx) || !Array.isArray(journey?.calendarEvidence)) throw new Error('TfL iBus productive Journey lineage is incomplete.');
      for (const calendar of journey.calendarEvidence) assertVersion(calendar?.baseVersion, version, 'Block_CalendarDay');
    }
  }
  return index;
}

function isOrderedSubsequence(needle = [], haystack = []) {
  if (!needle.length || !haystack.length) return false;
  let cursor = 0;
  for (const value of haystack) if (normal(value) === normal(needle[cursor])) cursor += 1;
  return cursor === needle.length;
}

function patternMatchesService(pattern, service) {
  const orderedIds = (pattern.orderedStopPointIds ?? []).map(text).filter(Boolean);
  const timetablePattern = (service.routePatternStopIds ?? []).map(text).filter(Boolean);
  const assessedStops = Object.keys(service.stopSchedules ?? {}).map(text).filter(Boolean);
  if (!isOrderedSubsequence(timetablePattern, orderedIds)) return false;
  if (!assessedStops.length || assessedStops.some(id => !orderedIds.some(candidate => normal(candidate) === normal(id)))) return false;

  const destinationIds = unique([
    service.destinationStopPointId,
    ...(service.destinationStopPointIds ?? []),
    service.source?.destinationStopPointId
  ]);
  if (!destinationIds.length || !destinationIds.some(id => normal(id) === normal(orderedIds.at(-1)))) return false;

  const clippedAtAssessedOrigin = service.source?.routePatternStartIsAssessedStop === true;
  const originIds = unique([service.originStopPointId, ...(service.originStopPointIds ?? []), service.source?.originStopPointId]);
  if (!clippedAtAssessedOrigin && originIds.length && !originIds.some(id => normal(id) === normal(orderedIds[0]))) return false;
  return true;
}

function unavailable(status, index, assessmentDate, detail = null) {
  return Object.freeze({
    provider: PROVIDER,
    status,
    baseVersion: text(index?.baseVersion) || null,
    assessmentDate: assessmentDay(assessmentDate) || null,
    detail
  });
}

export function resolveTflIbusOperatorEvidence(service, rawIndex, assessmentDate) {
  let index;
  try {
    index = validateTflIbusOperatorIndex(rawIndex);
  } catch (error) {
    return unavailable('invalid-index', rawIndex, assessmentDate, error.message);
  }
  const day = assessmentDay(assessmentDate);
  if (!day) return unavailable('invalid-assessment-date', index, assessmentDate);
  const validFrom = text(index.validFrom).slice(0, 10);
  const validTo = text(index.validTo).slice(0, 10);
  if (day < validFrom || day >= validTo) return unavailable('outside-base-version-validity', index, day, `Base_Version ${index.baseVersion} is valid from ${validFrom} to (exclusive) ${validTo}.`);

  const serviceLineNo = text(service?.source?.lineId ?? service?.routeNumber);
  const lineMappings = index.serviceLines.filter(line => normal(line.serviceLineNo) === normal(serviceLineNo));
  if (!lineMappings.length) return unavailable('service-line-not-indexed', index, day, 'No exact passenger-facing Service_Line_No mapping was indexed.');
  const mappedContracts = new Set(lineMappings.map(line => text(line.contractLineNo)));
  const patterns = index.patterns.filter(pattern => normal(pattern.serviceLineNo) === normal(serviceLineNo)
    && mappedContracts.has(text(pattern.contractLineNo))
    && patternMatchesService(pattern, service));
  if (!patterns.length) return unavailable('no-structured-pattern-match', index, day, 'No productive pattern matched the TfL timetable StopPoint sequence and exact endpoint evidence.');

  const candidates = patterns.map(pattern => ({
    pattern,
    journeys: pattern.journeys.filter(journey => Number(journey.journeyType) === 1
      && journey.calendarEvidence.some(calendar => calendar.calendarDay === day && calendar.blockRunsOnDay === true))
  })).filter(candidate => candidate.journeys.length > 0);
  if (!candidates.length) return unavailable('no-active-journey-on-date', index, day, 'Matching productive patterns have no active Block_CalendarDay evidence for this service date.');

  const operatorPairs = new Map();
  let missingOperator = false;
  for (const candidate of candidates) for (const journey of candidate.journeys) {
    const code = text(journey.operatorCode);
    const name = text(journey.operatorName);
    if (!code || !name) missingOperator = true;
    else operatorPairs.set(`${normal(code)}|${normal(name)}`, { code, name });
  }
  const evidence = Object.freeze({
    provider: PROVIDER,
    status: !missingOperator && operatorPairs.size === 1 ? 'resolved' : 'ambiguous',
    baseVersion: index.baseVersion,
    validFrom: index.validFrom,
    validTo: index.validTo,
    assessmentDate: day,
    serviceLineNo,
    contractLineNos: Object.freeze([...new Set(candidates.map(candidate => candidate.pattern.contractLineNo))].sort()),
    operator: operatorPairs.size === 1 && !missingOperator ? Object.freeze([...operatorPairs.values()][0]) : null,
    candidateOperatorCount: operatorPairs.size + (missingOperator ? 1 : 0),
    patterns: Object.freeze(candidates.map(({ pattern, journeys }) => Object.freeze({
      patternIdx: pattern.patternIdx,
      direction: pattern.direction,
      contractLineNo: pattern.contractLineNo,
      patternType: pattern.patternType,
      orderedStopPointIds: Object.freeze([...pattern.orderedStopPointIds]),
      journeys: Object.freeze(journeys.map(journey => Object.freeze({
        journeyIdx: journey.journeyIdx,
        journeyType: journey.journeyType,
        blockIdx: journey.blockIdx,
        operatorCode: journey.operatorCode || null,
        operatorName: journey.operatorName || null,
        startTimeSeconds: journey.startTimeSeconds,
        calendarEvidence: Object.freeze(journey.calendarEvidence.filter(calendar => calendar.calendarDay === day && calendar.blockRunsOnDay === true).map(calendar => Object.freeze({ ...calendar }))),
        scheduleObjectKey: journey.scheduleObjectKey || null
      })))
    }))),
    sourceObjects: Object.freeze(Object.keys(index.source?.objects ?? {}).sort()),
    retrievedAt: index.source?.retrievedAt ?? null,
    matchingBasis: Object.freeze(['Service_Line_No→Contract_Line_No', 'productive ordered Stop_In_Pattern/NaPTAN sequence', 'TfL timetable exact endpoint StopPoint', 'assessed StopPoint membership', 'productive Journey→Block→Operator', 'date-valid active Block_CalendarDay']),
    iBusDirection: null,
    timetableDirectionMappedMechanically: false
  });
  return evidence;
}

export function createTflIbusOperatorAdapter({ fetchImpl = globalThis.fetch, indexUrl = null, manifestUrl = null, index = null, clock = () => new Date() } = {}) {
  let loadedIndex = index ? Promise.resolve(index) : null;
  let loadStatus = index ? 'provided' : 'not-loaded';

  async function readIndex() {
    if (loadedIndex) return loadedIndex;
    if (typeof fetchImpl !== 'function' || (!indexUrl && !manifestUrl)) throw new Error('TfL iBus operator index URL or injected index is unavailable.');
    loadStatus = 'loading';
    loadedIndex = (async () => {
      let resolvedIndexUrl = indexUrl;
      let manifest = null;
      if (manifestUrl) {
        const response = await fetchImpl(manifestUrl);
        if (!response?.ok) throw new Error(`TfL iBus operator manifest request failed with HTTP ${response?.status ?? 'unknown'}.`);
        manifest = await response.json();
        if (manifest?.schema !== 'tfl-ibus-operator-index-manifest-v1' || !text(manifest.indexPath) || !/^\d{8}$/.test(text(manifest.baseVersion)) || !/^[0-9a-f]{64}$/i.test(text(manifest.indexSha256))) throw new Error('TfL iBus operator manifest is invalid.');
        resolvedIndexUrl = new URL(manifest.indexPath, manifestUrl).toString();
      }
      const response = await fetchImpl(resolvedIndexUrl);
      if (!response?.ok) throw new Error(`TfL iBus operator index request failed with HTTP ${response?.status ?? 'unknown'}.`);
      let data;
      if (manifest) {
        const bytes = await response.arrayBuffer();
        if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable; TfL iBus index integrity cannot be verified.');
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        const actualSha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (actualSha256 !== manifest.indexSha256.toLowerCase()) throw new Error('TfL iBus operator index SHA-256 does not match its manifest.');
        data = JSON.parse(new TextDecoder().decode(bytes));
      } else data = await response.json();
      validateTflIbusOperatorIndex(data);
      if (manifest && (manifest.baseVersion !== data.baseVersion || manifest.validFrom !== data.validFrom || manifest.validTo !== data.validTo)) throw new Error('TfL iBus manifest and index Base_Version metadata disagree.');
      loadStatus = 'loaded';
      return data;
    })().catch(error => {
      loadedIndex = null;
      loadStatus = 'unavailable';
      throw error;
    });
    return loadedIndex;
  }

  async function resolveOperator(service, { assessmentDate = clock() } = {}) {
    try {
      return resolveTflIbusOperatorEvidence(service, await readIndex(), assessmentDate);
    } catch (error) {
      return unavailable('unavailable', null, assessmentDate, error.message);
    }
  }

  return Object.freeze({
    id: 'tfl-ibus-operator-v1',
    resolveOperator,
    getStatus: () => loadStatus
  });
}
