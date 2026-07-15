# Release notes — RAIL-4.2.1-20260715

## Map reliability defect release

- Railway now uses the full Leaflet 1.9.4 engine already used by Accessibility. Panning, mouse-wheel and touch zoom, zoom buttons, site-marker dragging and responsive resizing are restored.
- Walking and cycling route GeoJSON is rendered through native Leaflet layers and fitted to the map. If routing failed and the displayed value is only an estimate, the module explains that no route geometry is available rather than drawing a misleading straight line.
- Duplicate OSM features representing the same physical station are consolidated using authoritative identifiers first, then normalised name, rail mode and proximity. Stations with different rail modes remain separate.
- Automated tests cover the production map engine, route-layer handling and both positive and negative deduplication cases.

## Railway assessment interface

- The assessment is now separated into Assessment, Sources, and Research & Library views.
- Map controls expose walking and cycling routes independently, fit the full assessment, return to the site, and clear displayed routes.
- Typical weekday frequency by destination is edited as readable directional rows rather than raw JSON. Each row records the direction or destination, trains per hour, and an optional service-pattern note.
- Source URLs and retrieval details are consolidated in the Sources register, keeping the assessment review concise.
- The exported research request remains self-instructing: the user only needs to attach it to a new ChatGPT conversation. It explicitly instructs ChatGPT to research every station without asking what action is required and to return the completed import file.
- Knowledge Library imports retain identifier matching, protected newer verified evidence, conflict tracking, validation, and automatic pre-import backups.
- Saving an individual station now displays a timestamped confirmation within that station card and in the page status message.

## Compatibility

The research and Knowledge Library schemas remain unchanged at version 2/v3 respectively, so existing completed research and library exports remain compatible.
