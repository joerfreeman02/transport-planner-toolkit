# Drawing Generator DG-0

Isolated live-review candidate for four EAS A3 planning drawings. Open `modules/drawing-generator/` through a web server; ES modules do not support reliable `file://` execution.

Version `DRAW-0.1.0`; build `DRAW-0.1.0-DG0C3-20260816`; status **WORK IN PROGRESS / LIVE REVIEW - NOT ACCEPTED BASELINE**.

## Supported drawings

- Regional Plan and Regional Routing Plan: A3 landscape at 1:50,000.
- Local Context Plan and Local Routing Plan: A3 landscape at 1:2,500.

The editing map is for interaction and uses an unobscured OpenStreetMap layer. The issued sheet is a hybrid composition: rendered OSM Standard XYZ tiles are placed individually into the exact EPSG:27700 frame through projection-aware affine transforms, while professional transport/site geometry remains controlled vector evidence. It is not a screenshot or one stretched map image. Regional modes use z13 and at most 80 intersecting tiles; local modes use z17 and the same cap. Connected like-for-like vectors are grouped for presentation, repeated labels are capped, and colliding labels are withheld. Where safe automation is unavailable, reviewed GeoJSON/manual overlays are the intended workflow.

The primary workflow is planner-first: choose the drawing, identify and locate the project, confirm the boundary, then generate and review. Title-block diagnostics and professional overlays remain available under **Advanced editing / source diagnostics**. Map navigation is enabled by default and every active drawing action has an explicit Cancel path.

## Local verification

```text
node modules/drawing-generator/tests/drawing-generator.test.mjs
node modules/drawing-generator/tests/browser-smoke.mjs
node modules/drawing-generator/tests/pdf-qa.mjs
```

The browser and four-mode PDF tests require Playwright Chromium and a local static server at `http://127.0.0.1:8768/` unless `TPT_REVIEW_ROOT` is set. They intercept all tile requests and make no public tile retrieval. `real-world-regional-pdf-qa.mjs` is a separate, guarded one-viewport live evidence script and must be run only with explicit approval and `DG0_ALLOW_LIVE_OSM_QA=1`.
