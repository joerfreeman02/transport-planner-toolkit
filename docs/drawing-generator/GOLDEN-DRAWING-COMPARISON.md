# Sanitised golden-drawing comparison

The four supplied historic A3 PDFs were rendered page-by-page and visually inspected locally. Client/project text and PDFs are not included in this public repository. The supplied current corporate logo, not the superseded precedent mark, is used.

## Measurable precedent characteristics

| Drawing family | Matched characteristics | Material differences / classification |
|---|---|---|
| Regional plan | A3 landscape; large map left; right legend; full-width lower title strip; north arrow top-left; 1 km/20 mm scale bar; site red; main road red; motorway magenta; cycle orange; water blue; rail grey; station-mode hierarchy. | Current data are live OSM rather than a frozen manual dataset (source-data change). Labels are simpler and use deterministic collision-free placement only for selected features (styling difference). Precise strategic-cycle and navigable-waterway authority reconciliation is not yet automatic (Toolkit omission, explicit fallback). |
| Regional routing | Same regional hierarchy plus red route-to and blue route-from direction arrows. | Routes must be drawn/imported and approved; no automatic HGV decision (intentional professional-control difference). Arrow cadence and typography are close but not a pixel copy (styling difference). |
| Local context | A3 landscape; map left; full-height right legend/title panel; north arrow; 50 m/20 mm scale bar; bus groups; community symbols; site red. | Complete bus-route discovery and community relevance are not claimed (source/Toolkit limitation); user-reviewed groups are supported. Label optimisation is simpler (styling difference). |
| Local routing | Local layout and scale with site/community/route-to/route-from hierarchy. | Professional route selection remains manual (intentional); current logo/title construction differs from the historic brand (authorised styling change). |

## Expected-present regional evidence

The benchmark shows major roads, railway infrastructure, multiple station modes and, where present in its historical extent/data, motorway, strategic cycle and waterway features. DG-0 requests all of those evidence classes from current structured OSM, renders only returned/approved vectors, and exposes missing-class warnings. It does not alter current data to force a historic match.

## Comparison conclusion

The sheet geometry, scale hierarchy, title/legend placement, major line hierarchy, station distinction, site emphasis and routing colours are materially aligned with the precedent. Remaining differences are predominantly live-source coverage, manual professional classification and typographic/label refinements. A final area-for-area feature audit requires the Product Owner to load approved site/route geometry and a retained source snapshot; it must not be encoded as a public client fixture.
