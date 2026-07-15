# Railway Assessment module

Visible build: `RAIL-4.0.1-20260715`.

This self-contained module discovers mapped stations, keeps rail modes separate, calculates walking and cycling routes with transparent estimated fallbacks, and stores traceable station research in a browser-local Rail Knowledge Library.

## Assisted-research workflow

1. Confirm a site and run a station search.
2. Approve the stations required for the assessment.
3. Select **Export station research request**.
4. Upload the exported JSON to a new ChatGPT conversation. The file contains explicit instructions to research every station and return `tpt-rail-research-completed-v2` JSON.
5. Import the completed JSON using **Import completed research**.
6. Review the import summary and saved library records.

Test fixtures under `tests/fixtures/` are synthetic and are marked as fixtures. They must not be used as real railway evidence.
