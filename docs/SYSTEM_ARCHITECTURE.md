# Transport Planner Toolkit — System Architecture v1.0

## Status
Locked architecture baseline for the Accessibility Assessment module.

## Core rule
No user-interface release may be deployed until the underlying engines pass the automated and manual release gates defined in this document.

## Engine architecture

### Location Engine
Inputs: address/postcode, coordinates, map pin, and later OS grid reference/What3Words.
Outputs: confirmed coordinates, address label, confirmation state, and configured walking/cycling radii.

### Facility Data Engine
- One primary request at the configured walking radius.
- One optional extension request at the configured cycling radius.
- Firm timeout and sequential mirror failover.
- A failed request is never interpreted as “no facilities”.

### Classification Engine
- Category-specific tags are mandatory.
- Names and addresses may improve display only; they cannot create a category match.
- The nearest valid feature is selected by straight-line distance.
- Explicit false-positive exclusions are regression tested.

Examples:
- GP: `amenity=doctors` or `healthcare=general_practitioner/doctor`.
- Supermarket: `shop=supermarket`.
- Pharmacy: `amenity=pharmacy` or `healthcare=pharmacy`.
- Bus stop: `highway=bus_stop`, or qualifying public-transport bus tags.

### Routing Engine
- Route only the selected result.
- Controlled concurrency and firm timeouts.
- Walking and cycling failures are independent.
- Fallback estimates are clearly marked and never presented as routed values.

### Review Engine
Accept, reject, replace, edit, or manually add a facility. Low-confidence, estimated or manual results require explicit confirmation before report wording.

### Report Engine
Produces concise, grouped TS, TA and Travel Plan wording. It remains factual and does not automatically claim that a site is “highly sustainable” without explicit criteria and user approval.

### Map and Export Engine
Map: site, facility markers, editable 2 km/5 km catchments, selectable routes, legend, north arrow and scale bar.
Exports: CSV and copy-to-Word first; project save/load; later XLSX, DOCX, PDF and report-ready map image.

## Data flow
1. Locate site.
2. Confirm pin.
3. Perform one primary facility download.
4. Classify locally.
5. Perform one optional wider extension.
6. Route selected facilities.
7. Review and confirm.
8. Generate outputs.

## Performance target
- Normal target: under 30 seconds.
- Maximum acceptable target: 60 seconds.
- No indefinite loading.
- Every network operation has a timeout and recoverable failure state.

## Privacy
- Project information remains in-browser or in user-created project files.
- Only technically necessary coordinates/search/routing data are sent to mapping services.
- No analytics, advertising or tracking.
- No paid service without prior approval.

## Release stages
Engine Prototype → Alpha → Beta → Release Candidate → Stable.

## Non-negotiable regression tests
- A convenience shop cannot populate unrelated categories.
- A leisure centre cannot be a GP.
- Adult learning cannot be an FE/sixth-form result without qualifying evidence.
- Bus, rail, Underground, Overground and DLR remain distinct.
- Query failure cannot become “none found”.
- Fixing one category cannot remove another.
- Old cached versions cannot reappear during development.
- Maps must render consistently across Chrome/Safari and Windows/macOS.
