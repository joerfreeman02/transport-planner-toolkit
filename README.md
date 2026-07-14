# Transport Planner Toolkit — Sprint 2B

This release adds the no-cost assisted Rail Intelligence workflow.

## Workflow
1. Find and route all nearby stations.
2. Export `rail_station_research_request.json`.
3. Upload the request to ChatGPT for authoritative-source research.
4. Import the completed `tpt-rail-research-response-v1` JSON.
5. Saved verified station records are reused automatically on future projects.

The station database now includes **Line name(s)** for London Underground, London Overground, DLR, Elizabeth line, tram/light-rail and other named routes where relevant.
