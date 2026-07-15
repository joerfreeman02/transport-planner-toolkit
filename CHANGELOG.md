# Changelog

## Sprint 3 map runtime hotfix - 2026-07-15
- Replaced the unavailable external map-engine script with the repository's local runtime in Accessibility 1.1.1 and Railway 4.3.1.
- Restored map initialisation and address-control event wiring without changing Sprint 3 exports.

## Sprint 3 - Formatting and Exporting
- Added shared EAS 2026 Word-table formatting for Accessibility 1.1 and Railway 4.3.
- Added rich-copy and Word-compatible download exports while retaining transparent CSV exports.

## Railway RAIL-4.2.1-20260715
- Fixed the non-interactive Railway map, route geometry rendering and duplicate mapped stations.
- Froze Railway 4.2.1 as the accepted functional baseline before the cross-module Formatting and Exporting sprint.

## Railway RAIL-4.2.0-20260715
- Added the cleaned Railway assessment interface, dedicated Sources register, readable directional TPH controls, expanded map controls and explicit Knowledge Library save confirmation.
- Updated the central module manifest to the deployed Railway build.

## Foundation 1.6.0
- Rolled canonical codebase back to confirmed-working Sprint 2A baseline.
- Added central module manifest.
- Added automated foundation regression check.
- Added architecture decision log.
- Excluded rejected Sprint 2B regression.
