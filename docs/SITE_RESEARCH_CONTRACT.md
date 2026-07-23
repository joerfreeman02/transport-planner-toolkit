# Site Research data contract

Build: `SITE-RESEARCH-1.0.0-20260723`

- Request schema: `tpt-site-research-request-v1`
- Completed schema: `tpt-site-research-completed-v1`
- Maximum per combined pack: 3 Rail records, 2 standalone Bus Stops or one verified pair, 6 canonical Bus Routes and 12 stop-route relationships.
- Rail-only packs may contain 5 Rail records. Bus-only packs retain the 2-stop, 6-route and 12-relationship limits.
- Canonical Bus Route identity is transport authority or region + route number + normalised terminal pair + variant. Operator wording and geographic prose are not identity fields.
- Completed imports are independently validated and distributed to local Rail, Bus Stop, Bus Route and stop-route proposal stores. Valid tasks survive a partial import; failed tasks remain explicit.
- Shared records are reused only when the mode-specific completeness and evidence rules pass. Railway TPH and Bus operating/service relationships are mandatory where applicable.
