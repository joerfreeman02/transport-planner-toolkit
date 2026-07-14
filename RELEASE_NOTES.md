# Sprint 2A — Rail Intelligence Review

## Implemented
- Reusable local Rail Knowledge Library.
- Automatic matching of station discoveries to saved verified records.
- Field-level statuses: Missing, Needs review, Verified and Manual.
- Source and retrieval date for each station-information field.
- Knowledge JSON import/export for backup and sharing.
- Expanded station facilities: ticketing, waiting, toilets and car parking.
- TS-ready summary continues to use included station records.

## Important limitation
This static GitHub Pages build cannot reliably scrape National Rail, TfL or train-operator webpages because those sites generally do not permit browser cross-origin extraction. Official values must therefore be researched/verified and saved into the knowledge library. The app never labels an unverified value as authoritative.
