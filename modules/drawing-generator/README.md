# Drawing Generator DG-0

Isolated live-review candidate for four EAS A3 planning drawings. Open `modules/drawing-generator/` through a web server; ES modules do not support reliable `file://` execution.

Version `DRAW-0.1.0`; build `DRAW-0.1.0-DG0C3.3A-20260817`; status **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**.

## Supported drawings

- Regional Plan and Regional Routing Plan: A3 landscape at 1:50,000.
- Local Context Plan and Local Routing Plan: A3 landscape at 1:2,500.

The editing map is for interaction and uses an unobscured OpenStreetMap layer. The issued sheet is a hybrid composition: rendered OSM Standard XYZ tiles are placed individually into the exact EPSG:27700 frame through projection-aware affine transforms, while professional transport/site geometry remains controlled vector evidence. It is not a screenshot or one stretched map image. A distinct, legible `© OpenStreetMap contributors` map-corner attribution is retained in every issued mode. Regional modes use z13 and at most 80 intersecting tiles; local modes use z17 and the same cap. Connected like-for-like vectors are grouped for presentation, repeated labels are capped, and colliding labels are withheld. Regional A/M labels show only returned route references, with a single repeated reference normally permitted.

The primary workflow is planner-first: choose the drawing, identify and locate the project, confirm the boundary, set appearance/check sources, then generate and review. The normal five-step interface keeps diagnostics, raw source information and implementation controls under **Advanced controls and diagnostics**. Colour OSM with faded emphasis is the default; greyscale and normal emphasis are optional and only affect the rendered tile group. A station more than the deterministic 200 m threshold from compatible returned railway geometry is clearly marked `REVIEW REQUIRED - NO NEARBY RETURNED RAIL GEOMETRY` and withheld until the planner explicitly includes it. Generic rail geometry is neutral `RAILWAY`; a named passenger mode is only shown when explicitly evidenced. Its raw source geometry is not relocated; include/exclude choices are persisted locally by stable source ID. Map navigation is enabled by default and every active drawing action has an explicit Cancel path. Separate editor controls cover Roads, Cycle, Rail, Bus, Water and Community candidates. A dashed **ISSUED DRAWING EXTENT** is calculated by the same fixed-scale BNG engine as the issued PDF.

In a routing mode, the planner draws ordered waypoint guidance through the roads they have selected. Ordinary clicks add waypoints; dragging pans and the mouse wheel zooms without creating vertices, so a long Regional route can be authored across the fixed issued area. A provider-neutral adapter may replace that rough line with mapped road geometry through the waypoints. The returned geometry is assistance only: the planner must review and approve it, direction is normalized deterministically against the confirmed site, and print remains blocked for a failed snap, ambiguous direction, material waypoint deviation or missing approval. The rough line is retained for retry/manual fallback. No HGV suitability or route recommendation is made. Issued TO/FROM arrows use white halos and opposing presentation-only offsets while stored/snapped geometry remains unchanged.

## Local verification

```text
node modules/drawing-generator/tests/drawing-generator.test.mjs
node modules/drawing-generator/tests/browser-smoke.mjs
node modules/drawing-generator/tests/pdf-qa.mjs
node modules/drawing-generator/tests/real-world-routing-pdf-qa.mjs
```

The browser and four-mode PDF tests require Playwright Chromium and a local static server at `http://127.0.0.1:8768/` unless `TPT_REVIEW_ROOT` is set. They intercept all tile and routing requests and make no public retrieval. `real-world-regional-pdf-qa.mjs` and `real-world-routing-pdf-qa.mjs` are separate guarded live evidence scripts and require explicit approval through `DG0_ALLOW_LIVE_OSM_QA=1` and `DG0_ALLOW_LIVE_ROUTING_QA=1` respectively. The routing script makes exactly two deliberate, sequential route requests and one bounded tile viewport.

See `docs/drawing-generator/CURRENT-SOURCE-MAPPING.md` for the C3.3 OSM/TfL authority boundary, status filters, mode colours, bus geometry rule and exact community-footprint method.
