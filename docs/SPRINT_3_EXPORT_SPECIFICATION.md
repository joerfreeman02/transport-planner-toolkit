# Sprint 3 - Formatting and Exporting Specification

## Status

Design contract for Word-ready Accessibility and Railway exports. Functional discovery, map, routing, classification, review and Knowledge Library behaviour remains frozen.

## Evidence reviewed

- Legacy Transport Technical Note, 598 Hertford Road, Table 2.1 (local facilities).
- Legacy Transport Statement, First Place Nursery, Tables 3.1 and 3.3 (local facilities and railway summary).
- New-template Transport Statement, 100 High Street Plaistow.
- `EAS_Transport Template_2026.dotx` styles, theme, sections and sample table.

## Word compatibility target

- A4 portrait page; 20 mm left/right margins, 30 mm top margin and 20 mm bottom margin.
- Body typography: Roboto, 11 pt; 1.15 line spacing; justified prose.
- Heading typography: Roboto Medium; orange `#D95300`.
- Table caption: italic, grey `#B3B3B3`, left aligned, kept with table.
- Table header: orange `#D95300`, white Roboto Medium text, centred vertically.
- Body rows: white and pale grey `#EFEFEF` alternating bands.
- Rules: black, 0.5 pt; compact top/bottom cell padding.
- Table content is centred, with the first descriptive column left aligned where this materially improves scanability.
- All exports use human-readable text. Technical status and source data remain in CSV/research exports, not the report tables.

## Accessibility table

Caption: `Table X.X - Local Facilities within a Reasonable Walking/Cycling Distance`.

Columns:

1. Facility type
2. Facility
3. Distance
4. Walk time (mins)
5. Cycle time (mins)

Only included and non-rejected results are exported. Distance is the assessed walking-route distance and must retain its routed/estimated qualification in a note when applicable.
Included facilities are separated by labelled category rows: Transport, Education and childcare, Everyday needs, Healthcare, and Leisure and community. Empty categories are omitted.

## Railway tables

Two tables are used to avoid an unreadable wide table on A4 portrait pages.

### Railway station access summary

1. Station
2. Mode
3. Walking distance
4. Walking time
5. Cycling distance
6. Cycling time

### Railway service summary

1. Station
2. Station manager
3. Train operators
4. Railway lines
5. Typical weekday trains per hour by direction
6. Principal direct destinations served
7. Cycle storage
8. Step-free access (tick/cross)

Directional TPH must state the direction/destination. Overlapping destination entries must not be summed. Only included stations are exported.
Each station is followed by a full-width summary row containing its service pattern and journey opportunities. A separate optional Word export presents each station's directional/destination TPH entries as Direction/destination, TPH and Service note.

## Export methods

- **Copy Word table(s):** rich HTML plus plain-text fallback for pasting into the EAS Word template.
- **Download Word-compatible file:** genuine `.docx` OOXML document with A4 page rules and embedded EAS table styling. It opens directly in Microsoft Word and can be copied into a report based on the `.dotx` template.
- **CSV:** retained as the transparent technical/data export.

## Release gates

- Shared formatting code is regression tested once and consumed by both modules.
- Existing module regression suites must pass unchanged.
- Sample Accessibility and Railway documents must be opened/rendered in Word and visually checked for headers, banding, borders, wrapping and A4 fit.
- No functional change to discovery, mapping, routing, classification, research or library merge logic is permitted in this sprint.
