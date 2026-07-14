# Sprint 2B — Assisted Rail Research

This review build implements the free assisted-research bridge agreed for Sprint 2.

It does not place an API key in the browser and does not claim to scrape restricted websites automatically. Instead, it exports a structured request for ChatGPT and imports the completed, source-backed station records.

## Review points
- Export a research request after finding stations.
- Confirm the JSON contains every included station and walking/cycling results.
- Import a completed research response.
- Confirm fields, statuses, sources, retrieval dates and line names populate.
- Confirm saved stations are reused on a later search.
