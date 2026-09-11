export const SERVICE_DAYS = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

function text(value) { return String(value ?? '').trim(); }

function uniqueDays(values) {
  const wanted = new Set((values ?? []).map(value => text(value).toLowerCase()).filter(Boolean));
  return SERVICE_DAYS.filter(day => wanted.has(day));
}

export function createServiceCalendarEvidence({
  daysOfWeek = [],
  calendarResolved = false,
  schoolDayOnly = false,
  termTimeOnly = false,
  nonSchoolDayOnly = false,
  holidayOnly = false,
  sourceCalendarLabel = null,
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
  if (evidence.some(item => item?.schoolDayOnly)) notes.push('School days only.');
  else if (evidence.some(item => item?.termTimeOnly)) notes.push('Term-time service.');
  if (evidence.some(item => item?.nonSchoolDayOnly || item?.holidayOnly)) notes.push('Non-school days only.');
  return [...new Set(notes)];
}
