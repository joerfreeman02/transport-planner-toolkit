# Accessibility Assessment 1.0 RC1

## Purpose
Final targeted classification correction before the module is considered for Stable release.

## Fixed
An unnamed or outdoor `leisure=sports_centre` polygon can no longer appear as **Gym / leisure centre**. It is retained under **Sports facility**.

## Acceptance check
Re-test the rural site, Plaistow and one suburban site. Confirm that:
- the rural field no longer appears as Gym / leisure centre;
- a genuine named gym/leisure centre is still returned where mapped;
- maps, facilities, routes, CSV and wording remain unchanged.

## Build
`Accessibility Assessment 1.0 RC1 · AA-RC1-20260714-1945`
