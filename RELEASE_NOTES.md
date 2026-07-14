# Sprint 1.1 — Map Engine Review Build

## Scope
Only the map subsystem changed. Facility discovery, classification, routing and exports are unchanged.

## Changes
- Bundled a local Leaflet-compatible stylesheet so map layout does not depend on the external CDN CSS.
- Retained the Leaflet JavaScript CDN that was already loading successfully.
- Replaced image marker icons with local CSS markers.
- Added ResizeObserver-based map resizing and tile-error diagnostics.

## Review gate
The initial map and the geocoded site map must render continuously on macOS Chrome/Safari, iPhone Safari and Windows Chrome.
