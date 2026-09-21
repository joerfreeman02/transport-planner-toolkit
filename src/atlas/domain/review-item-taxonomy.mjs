export const REVIEW_ITEM_CATEGORIES = Object.freeze({
  'unresolved-timetable-request': Object.freeze({ category: 'timetable', routeBearing: true }),
  'unprocessed-timetable-request': Object.freeze({ category: 'timetable', routeBearing: true }),
  'unprocessed-timetable-scope': Object.freeze({ category: 'timetable', routeBearing: false }),
  'quarantined-timetable-request': Object.freeze({ category: 'timetable', routeBearing: true }),
  'national-route-evidence': Object.freeze({ category: 'timetable', routeBearing: true }),
  'service-source-evidence': Object.freeze({ category: 'service-source', routeBearing: true }),
  'planner-route-identity': Object.freeze({ category: 'planner-route-identity', routeBearing: true }),
  'stop-source-coverage': Object.freeze({ category: 'stop-source-coverage', routeBearing: false }),
  'access-routing': Object.freeze({ category: 'access-routing', routeBearing: false }),
  'timetable-source-unavailable': Object.freeze({ category: 'timetable-source', routeBearing: false }),
  'no-planner-summary': Object.freeze({ category: 'planner-route-identity', routeBearing: false })
});

export function reviewItemTaxonomy(code) {
  return REVIEW_ITEM_CATEGORIES[code] ?? Object.freeze({ category: 'other-material', routeBearing: false });
}
