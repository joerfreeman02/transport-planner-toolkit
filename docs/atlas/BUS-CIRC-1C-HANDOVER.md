# ATLAS BUS-CIRC-1C Handover

## Scope and decision

BUS-CIRC-1B was rejected for three independent defects: raw StopPoint IDs in
circular prose, Maple Gate/Maynard Court appearing in both Additional services
and Short workings, and enriched BODS patterns changing the frozen BUS-GROUP
presentation (13C over 13, 15A over 15, and a split 279 result).

This correction keeps BUS-GROUP subordinate to the accepted baseline at
`2f443376b1a91b371aa2ace9d54d4fe14e1d203f`. The BODS full ordered sequence is
now stored in optional `circularPatternStopIds`; the existing BODS
`routePatternStopIds` contract remains endpoint-level/absent as it was before
CIRC enrichment. TfL, TNDS, synthetic and older records continue to use
`routePatternStopIds` or named `routePatternStops` as the CIRC fallback.

No prepared-data version change was needed: the optional field remains under
schema `atlas-prepared-bus-data-v2`, version `2.1.0`.

## Evidence and presentation

The builder retains exact GTFS `stop_sequence` order, repeated StopPoints and
traceable `gtfs:<region>:...` identities in `circularPatternStopIds`.

The frozen Waltham control returns one principal row for 13 with 13A/13B/13C
as Additional services, one principal row for 15 with 15A as subordinate, one
useful row for 66 with Hammond Street as a Short working, one row each for 217,
310, 317, 327, 491 and N279, the accepted 242 result, and the compact 279
result with Manor House represented. 279 and N279 remain separate.

Circular source evidence remains proven:

- 16, source route `6770339`: 26 stops, first/last `210021703430`.
- 16C, source route `6770341`: 104 stops, first/last `210021703430`.
- 230, source route `118723`: 34 stops, first/last `021024595`.

Planner wording prefers resolved principal locations and filters technical
ATCO/NaPTAN/GTFS identifiers. Same public route plus same resolved place is
exclusive between Additional services and Short workings. A strict contained
pattern keeps Short-working precedence; a material divergent pattern remains
Additional/branch evidence. The other source patterns remain underneath the
row for audit use. `routeGroupNote` retains its older consolidated compatibility
wording, while structured Browser/Word annotations use the exclusive taxonomy.

The Pipers replay produces one route-230 public row, proven circular, with
human wording using `Luton Airport Parkway Rail Station`, `Luton Station
Interchange` and `Woodside`; no raw StopPoint ID is emitted. C/231 remain the
known TNDS review-source limitation.

## Frozen review candidate

The candidate was rebuilt review-only from the verified frozen diagnostic
snapshot for workflow run `36125621080` / snapshot
`8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9`.

Candidate size: `142,134,259` bytes, `1,637` files, `705` service shards.
The active bank is `87,272,247` bytes / `1,371` files, so the candidate delta is
`+54,862,012` bytes / `+62.86%`. This remains a review-only capacity note; no
publication or production approval is implied.

Regional replays retain the accepted controls: Cambridge `62` stops / `244`
raw services / `173` summaries / `48` rows, with only the expected Tour
circular; Birmingham `101` stops / `201` raw services / `196` summaries / `80`
rows, with no unsafe circular classifications.

## Verification

- Python builder suite: 15 tests passed.
- BUS-CIRC and enriched prepared-data GROUP/Word regression: passed.
- BUS-GROUP 1B–1G regressions: passed.
- Browser contract: passed; no page errors or failed local requests.
- Complete Node suite: passed after preserving the Alpha.14 audit-note contract.
- Source hashes: NaPTAN `808fd287d953245b806144dbd36808417f49077e25013c031ddd8158e4b5fc51`, NPTG `c5d70a938600bbdc32420fa1e0dedf1a2218e073873363db0ecba38074b5e414`, BODS aggregate `1a92c22259c7805fb4100c0918b7b7671bec12b05a57a58c00ba0b1be38f1c62`.

Review URL: `http://127.0.0.1:8771/atlas/?review=v2#modules`

No source acquisition, publication, activation, deployment, merge, version
bump or BUS-POLISH work was performed.
