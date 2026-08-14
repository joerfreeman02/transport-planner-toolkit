# CRS and scale QA

## CRS

Issued geometry is transformed from WGS84 (`EPSG:4326`) to British National Grid (`EPSG:27700`) through Proj4js 2.19.10. The definition is:

`+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +datum=OSGB36 +units=m +no_defs`

This explicitly applies the OSGB36 datum rather than treating BNG as WGS84 Transverse Mercator. Control `[651409.903, 313177.270]` transforms within `0.000002°` of `[1.716052, 52.657979]`. Observed for WGS84 `[-0.1276, 51.5072]`: BNG `[530043.197878, 180358.207964]`, inverse `[-0.127599987496, 51.507199995396]`, calculated round-trip error `0.001005 m` (test ceiling `0.02 m`). This is appropriate for DG-0 plan composition, but it is not a survey transformation; OSTN15 grid-shift support remains a future precision enhancement.

## Physical scale relationships

| Modes | Denominator | Paper relationship | Scale bar | Map frame | Ground extent |
|---|---:|---|---|---|---|
| Regional Plan / Routing | 50,000 | 1 mm = 50 m | 20 mm = 1,000 m | 336 x 245 mm | 16,800 x 12,250 m |
| Local Context / Routing | 2,500 | 1 mm = 2.5 m | 20 mm = 50 m | 318 x 285 mm | 795 x 712.5 m |

The extent is centred on the explicit site centroid, or on the user-selected location if no boundary exists. It is calculated in projected metres from physical millimetres and the denominator; Leaflet zoom and screenshot dimensions are not inputs.

## PDF acceptance

The print stylesheet declares `@page` A3 landscape with zero page margin and a `420mm x 297mm` sheet. The scale bar remains a 20 mm CSS/SVG element for all modes; its text changes from 1 km to 50 m. Automated PDF creation validates one page, build/mode/scale state and sheet contents. Final PDFs are also inspected with Poppler for MediaBox/page count and rendered to images for visual QA.
