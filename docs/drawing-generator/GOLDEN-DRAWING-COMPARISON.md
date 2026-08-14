# Sanitised golden-drawing comparison

The four supplied historic A3 PDFs were rendered page-by-page and visually inspected locally. Client/project text and PDFs are not included in this public repository. The supplied current corporate logo, not the superseded precedent mark, is used.

## Measurable precedent characteristics

| Drawing family | Matched characteristics | Material differences / classification |
|---|---|---|
| Regional plan | A3 landscape; large map left; right legend; full-width lower title strip; north arrow top-left; 1 km/20 mm scale bar; site red; main road red; motorway magenta; cycle orange; water blue; rail grey; station-mode hierarchy. | Current data are live OSM rather than a frozen manual dataset (source-data change). Labels are simpler and use deterministic placement only for selected features (styling difference). Generic cycle relations and unproven waterways are review-only, rather than being upgraded (intentional source-safety correction). |
| Regional routing | Same regional hierarchy plus red route-to and blue route-from direction arrows. | Routes must be drawn/imported and approved; no automatic HGV decision (intentional professional-control difference). Arrow cadence and typography are close but not a pixel copy (styling difference). |
| Local context | A3 landscape; map left; full-height right legend/title panel; north arrow; 50 m/20 mm scale bar; bus groups; community symbols; site red. | Complete bus-route discovery and community relevance are not claimed (source/Toolkit limitation); user-reviewed groups are supported. Label optimisation is simpler (styling difference). |
| Local routing | Local layout and scale with site/community/route-to/route-from hierarchy. | Professional route selection remains manual (intentional); current logo/title construction differs from the historic brand (authorised styling change). |

## Authorised historical-extent comparison

Using the separately authorised historic-review bounding box, a local-only current OSM retrieval was run against the configured public Overpass service. The query, boundary, coordinates, raw response and rendered evidence are deliberately excluded from version control. The returned evidence was normalised into the observable road, railway/station, cycle, waterway and local bus/community candidate classes requested by the relevant drawing modes.

The comparison confirms that the four-sheet structure and returned-class hierarchy are suitable for the precedent review, while preserving current-source differences. Current source rules now deliberately withhold generic bicycle-route relations from the strategic class and withhold every untagged canal/river from the navigable class. Road labels only identify an A-road when an explicit A reference is returned; motorway status remains tied to OSM motorway tagging. These are source-safety changes, not attempts to force a historic visual match.

## Comparison conclusion

The sheet geometry, scale hierarchy, title/legend placement, major line hierarchy, station distinction, site emphasis and routing colours are materially aligned with the precedent. Remaining differences are live-source coverage, manual professional classification and typographic/label refinements. The actual site boundary and approved route geometry still require Product Owner input and must not be encoded as a public fixture.
