import { isOtherNearbyStopRecord } from './bus-source-presentation.mjs';

/**
 * Map source warnings to planner-facing warnings without turning a returned
 * stop inventory into a false zero-stop result.
 */
export function plannerStopWarning(warning, result = null) {
  const text = String(warning ?? '');
  if (/sidecar|prepared v1 data does not contain|logical stoparea|nptg locality/i.test(text)) return '';
  if (/incomplete/i.test(text)) return 'Some incomplete stop records were left out.';
  if (/duplicate/i.test(text)) return 'Repeated stop records were counted once.';
  if (/no bus stops/i.test(text)) return result?.stops?.length ? '' : 'No bus stops were found within the selected distance.';
  if (/dataset timestamp|dataset.*version/i.test(text)) return '';
  if (/prepared bus dataset is .*days old/i.test(text)) return 'The prepared national bus information should be refreshed before formal use.';
  if (/date-specific exceptions/i.test(text)) return 'Some timetables contain date-specific changes. Check the assessment date before formal use.';
  if (/No zero-stop conclusion/i.test(text)) return text;
  return text.replace(/TfL/g, 'Transport for London');
}

/** Keep incomplete timetable rows selectable so the report cannot hide a
 * route-bearing stop merely because its prepared shard failed. */
export function recommendedBusStop(stop = {}) {
  if (isOtherNearbyStopRecord(stop)) return false;
  if (['SOURCE_UNAVAILABLE', 'PARTIAL'].includes(String(stop?.timetableEvidenceStatus ?? '').toUpperCase())) return true;
  return stop?.timetableMatch !== false;
}
