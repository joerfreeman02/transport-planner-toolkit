# Transport Planner Toolkit
## Accessibility Assessment Module – Version 4 Technical Specification

**Status:** Specification v1.0 – Approved Build Basis  
**Project name:** TBC  
**Date:** 14 July 2026

## Objective
Automate TS, TA and Travel Plan accessibility work by identifying the nearest valid facilities and returning routed walking and cycling distance/time, with controlled manual correction, map output, audit evidence and report-ready narrative.

## Locked workflow
1. Enter and confirm the site location.
2. Use editable 2 km walking and 5 km cycling catchments.
3. Make one controlled primary data download and classify locally.
4. Extend only missing categories to the wider catchment.
5. Select one nearest valid result per category.
6. Calculate walking and cycling route distance/time.
7. Flag estimates, ambiguity and manual changes.
8. Export table, map, audit and narrative.

## Key requirements
- Complete within 60 seconds under normal conditions.
- Strict category-specific classification; names/addresses cannot create matches.
- One selected result per category, with reject/replace/edit/manual-add controls.
- Routed distances used where available; straight-line fallback is prominently flagged.
- Main table: Facility, Name, Walking distance/time, Cycling distance/time, Data source.
- Manual/low-confidence results require confirmation before report wording.
- Privacy-first, no paid dependencies without approval, no analytics or tracking.
- Release stages: Alpha, Beta, Release Candidate, Stable.

The DOCX contains the complete specification, categories, acceptance criteria, exports and development sequence.
