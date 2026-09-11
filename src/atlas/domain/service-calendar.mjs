export const SERVICE_DAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
export const CALENDAR_PROFILE_IDS = Object.freeze(['ordinary', 'school-day', 'term-time', 'non-school-day', 'holiday', 'other-resolved', 'unresolved']);

function text(value) { return String(value ?? '').trim(); }

function uniqueDays(values) {
  const wanted = new Set((values ?? []).map(value => text(value).toLowerCase()).filter(Boolean));
  return SERVICE_DAYS.filter(day => wanted.has(day));
}

export function deriveCalendarProfileId({ resolved = false, schoolDayOnly = false, termTimeOnly = false, nonSchoolDayOnly = false, holidayOnly = false } = {}) {
  if (!resolved) return 'unresolved';
  if (schoolDayOnly && (nonSchoolDayOnly || holidayOnly)) return 'unresolved';
  if (holidayOnly) return 'holiday';
  if (nonSchoolDayOnly) return 'non-school-day';
  if (schoolDayOnly) return 'school-day';
  if (termTimeOnly) return 'term-time';
  return 'ordinary';
}

export function calendarProfileLabel(profileId) {
  return {
    'school-day': 'school days',
    'term-time': 'term time',
    'non-school-day': 'non-school days',
    holiday: 'holidays',
    'other-resolved': 'calendar-specific days',
    unresolved: 'unresolved calendar'
  }[text(profileId)] || null;
}

export function calendarProfilesMutuallyExclusive(first, second) {
  const left = text(first?.calendarProfileId);
  const right = text(second?.calendarProfileId);
  if (!left || !right || left === right) return false;
  const pair = new Set([left, right]);
  if (pair.has('school-day') && (pair.has('non-school-day') || pair.has('holiday'))) return true;
  if (pair.has('term-time') && (pair.has('non-school-day') || pair.has('holiday'))) return true;
  return false;
}

export function createServiceCalendarEvidence({
  daysOfWeek = [],
  calendarResolved = false,
  schoolDayOnly = false,
  termTimeOnly = false,
  nonSchoolDayOnly = false,
  holidayOnly = false,
  sourceCalendarLabel = null,
  calendarProfileId = null,
  dateExceptions = [],
  qualificationMetadata = {},
  provenance = {},
  resolutionStatus = null,
  warnings = []
} = {}) {
  const days = uniqueDays(daysOfWeek);
  const resolved = Boolean(calendarResolved && days.length);
  return Object.freeze({
    days,
    daysOfWeek: Object.freeze(days),
    calendarResolved: resolved,
    resolved,
    schoolDayOnly: Boolean(schoolDayOnly),
    termTimeOnly: Boolean(termTimeOnly),
    nonSchoolDayOnly: Boolean(nonSchoolDayOnly),
    holidayOnly: Boolean(holidayOnly),
    calendarProfileId: text(calendarProfileId) || deriveCalendarProfileId({ resolved, schoolDayOnly, termTimeOnly, nonSchoolDayOnly, holidayOnly }),
    sourceCalendarLabel: text(sourceCalendarLabel) || null,
    dateExceptions: Object.freeze((dateExceptions ?? []).map(text).filter(Boolean)),
    qualificationMetadata: Object.freeze({ ...(qualificationMetadata ?? {}) }),
    provenance: Object.freeze({ ...(provenance ?? {}) }),
    resolutionStatus: resolutionStatus || (resolved ? 'resolved' : 'unresolved'),
    warnings: Object.freeze((warnings ?? []).map(text).filter(Boolean))
  });
}

export function calendarQualificationNotes(calendarEvidence = []) {
  const evidence = Array.isArray(calendarEvidence) ? calendarEvidence : [calendarEvidence];
  const notes = [];
  const school = evidence.some(item => item?.schoolDayOnly || item?.calendarProfileId === 'school-day');
  const nonSchool = evidence.some(item => item?.nonSchoolDayOnly || item?.holidayOnly || ['non-school-day', 'holiday'].includes(item?.calendarProfileId));
  if (school && nonSchool) notes.push('Timetable varies between school and non-school days.');
  else if (school) notes.push('School days only.');
  else if (evidence.some(item => item?.termTimeOnly || item?.calendarProfileId === 'term-time')) notes.push('Term-time service.');
  else if (nonSchool) notes.push('Non-school days only.');
  return [...new Set(notes)];
}
