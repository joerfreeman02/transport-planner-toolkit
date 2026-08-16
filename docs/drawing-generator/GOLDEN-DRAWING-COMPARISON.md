# Sanitised golden-drawing comparison

The four supplied historic A3 PDFs were rendered page-by-page and visually inspected locally. Client/project text and PDFs are not included in this public repository. The supplied current corporate logo, not the superseded precedent mark, is used.

## Measurable precedent characteristics

| Drawing family | Matched characteristics | Material differences / classification |
|---|---|---|
| Regional plan | A3 landscape; large contextual map left; narrow right legend; full-width lower title strip; north arrow top-left; 1 km/20 mm scale bar; site red; main road red; motorway magenta; cycle orange; water blue; rail grey; station-mode hierarchy. | Current data are structured current OSM rather than a frozen manual dataset (source-data change). C2 adds restrained land/place/secondary-road context, connected-way presentation grouping and collision-managed labels. Proposed cycle evidence and unproven waterways remain review-only (intentional source-safety correction). |
| Regional routing | Same regional hierarchy plus red route-to and blue route-from direction arrows. | Routes must be drawn/imported and approved; no automatic HGV decision (intentional professional-control difference). Arrow cadence and typography are close but not a pixel copy (styling difference). |
| Local context | A3 landscape; map left; full-height right legend/title panel; north arrow; 50 m/20 mm scale bar; bus groups; community symbols; site red. | Complete bus-route discovery and community relevance are not claimed (source/Toolkit limitation); user-reviewed groups are supported. Label optimisation is simpler (styling difference). |
| Local routing | Local layout and scale with site/community/route-to/route-from hierarchy. | Professional route selection remains manual (intentional); current logo/title construction differs from the historic brand (authorised styling change). |

## Authorised historical-extent comparison

Using the separately authorised historic-review bounding box, a local-only current OSM retrieval was run against the configured public Overpass service. The query, boundary, coordinates, raw response and rendered evidence are deliberately excluded from version control. The returned evidence was normalised into the observable road, railway/station, cycle, waterway and local bus/community candidate classes requested by the relevant drawing modes.

The comparison confirms that the four-sheet structure and returned-class hierarchy are suitable for the precedent review, while preserving current-source differences. C2 recognises the current OSM bicycle hierarchy `icn`/`ncn`/`rcn`/`lcn` without inventing a route-reference requirement, but withholds lifecycle-tagged proposed/construction/disused relations. Every untagged canal/river remains outside the navigable class. Road labels only identify an A-road when an explicit A reference is returned; motorway status remains tied to OSM motorway tagging. These are source-safety changes, not attempts to force a historic visual match.

## Comparison conclusion

The sheet geometry, contextual hierarchy, scale hierarchy, title/legend placement, major line hierarchy, station distinction, site emphasis and routing colours are materially aligned with the precedent. C2 materially improves orientation and declutters source labels while keeping the source auditable. Remaining differences are live-source coverage, manual professional classification and advanced curved/leader-line typography. The actual site boundary and approved route geometry still require Product Owner input and must not be encoded as a public fixture.

## DG-0C3.1 routing comparison

The routing sheets now follow the precedent hierarchy more closely: rendered OSM context, site, route-to and route-from are primary; automatic main-road, motorway, cycle, water, rail and station thematic overlays are suppressed in Regional Routing. Local Routing additionally permits only explicitly selected community/manual overlays. Direction arrows are spaced by route distance on the final geometry rather than emitted at every source vertex. The right-side duplicate corporate block is removed, leaving one current EAS logo in the title block for every mode. Road following is a geometry-assistance enhancement, but planner waypoint choice and explicit approval remain the professional control.
