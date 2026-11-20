import { isOtherNearbyStopRecord } from './bus-source-presentation.mjs';

/**
 * Map source warnings to planner-facing warnings without turning a returned
 * stop inventory into a false zero-stop result.
 */
export function plannerStopWarning(warning, result = null) {
  const text = String(warning ?? '').replace(/\bTfL\b/gi, 'Transport for London');
  if (/SpecialDaysOperation|special-day operating metadata/i.test(text)) return '';
  if (/sidecar|prepared v1 data does not contain|logical stoparea|nptg locality/i.test(text)) return '';
  if (/prepared bus dataset does not contain a valid update time/i.test(text)) return 'The national bus timetable snapshot has no recorded preparation date; check a current operator timetable before relying on it.';
  const age = text.match(/prepared bus dataset is (\d+) days old/i);
  if (age) return `The national bus timetable snapshot is ${age[1]} days old. Check the operator’s current timetable before relying on it.`;
  if (/incomplete/i.test(text)) return 'Some stop records were incomplete and left out; the assessment may not cover every nearby stop.';
  if (/duplicate/i.test(text)) return 'Repeated stop records were counted once.';
  if (/no bus stops/i.test(text)) return result?.stops?.length ? '' : 'No bus stops were found within the selected distance.';
  if (/dataset timestamp|dataset.*version/i.test(text)) return '';
  if (/date-specific exceptions|date-specific changes/i.test(text)) return 'Some timetable records include date-specific changes. Check the operator timetable for the assessment date before relying on those days.';
  if (/transport for london stoppoint records were checked at this confirmed point outside the greater london boundary/i.test(text)) return 'Transport for London stop records were returned for this location. Transport for London timetable information applies only to the exact stops it returned.';
  if (/transport for london timetable authority was used only for returned transport for london stoppoint records/i.test(text)) return 'Other routes and stops continue to use their national timetable source; Transport for London results supplement that evidence only where TfL returned the exact StopPoint.';
  if (/transport for london and supplementary national evidence disagree on an unresolved route identity/i.test(text)) return 'For some London routes, the TfL and national records disagree about the route pattern. ATLAS kept the TfL timetable as the primary schedule; see the affected review topics.';
  if (/transport for london scheduled timetable information could not be checked for one or more services/i.test(text)) return 'Transport for London could not confirm every exact-stop timetable. ATLAS retained the schedules it could establish; review the affected route and stop topics below.';
  if (/transport for london returned a route sequence that atlas could not safely interpret/i.test(text)) return 'ATLAS could not confirm the stop order in one or more TfL route records; check the affected route pattern before relying on its listed locations.';
  if (/supplied operating-period\/frequency evidence/i.test(text)) return '';
  if (/No zero-stop conclusion/i.test(text)) return text;
  return text;
}

/** Keep incomplete timetable rows selectable so the report cannot hide a
 * route-bearing stop merely because its prepared shard failed. */
export function recommendedBusStop(stop = {}) {
  if (isOtherNearbyStopRecord(stop)) return false;
  if (['SOURCE_UNAVAILABLE', 'PARTIAL'].includes(String(stop?.timetableEvidenceStatus ?? '').toUpperCase())) return true;
  return stop?.timetableMatch !== false;
}
