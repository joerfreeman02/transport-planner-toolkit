# BUS-CIRC-1B frozen snapshot recovery and real circular-pattern handover

## Scope and release boundary

| Item | Value |
|---|---|
| Required starting SHA | `b0ed6fc54008669969b8f2ac35ecf1a2bc4f3b42` |
| Branch | `codex/atlas-bus-circ` |
| Production | Alpha.15 (`2.0.0-alpha.15`) |
| Source policy | Exact GitHub Actions artifact recovery only; no live NaPTAN/NPTG/BODS/TNDS/TfL acquisition |
| Publication boundary | Review-only candidate; not activated, published, deployed, merged, or promoted to Alpha.16 |

This handover completes the BUS-CIRC-1A raw-pattern evidence gap. It uses the
existing ordered BODS pattern plumbing and the existing V2 review build path.
It does not change the active `atlas/data/bus` bank or the production source
configuration.

## Exact frozen-source recovery

No exact raw source snapshot was present in the checkout or its sibling
worktrees. The authorised recovery was therefore made from the exact GitHub
Actions artifact:

| Item | Value |
|---|---|
| Artifact workflow run | `36125621080` |
| Artifact name | `atlas-reference-source-snapshot-36125621080` |
| Artifact ID | `10859084240` |
| Local recovery directory | `tmp/bus-circ-1b-source-recovery/source-snapshot` |
| Snapshot schema | `atlas-bus-source-snapshot-v1` |
| Snapshot ID | `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9` |
| Reuse mode | `FROZEN_DIAGNOSTIC_EXPLICIT` |
| Production eligible | `false` |
| Freshness claimed | `false` |
| Manifest SHA256 after recovery/rebuild | `DE9B57BD42AE5485652D9956658A96C4895587F33AED5BC7D171A9A04A66ECAE` |

The embedded source manifest deliberately preserves its own provenance. Its
`producer.runId` is `36112119760`, and its explicit frozen reuse source is
`36120372747`; those are not the surrounding artifact-container run ID. The
artifact-container identity is reported above exactly as recovered, without
rewriting the embedded provenance.

Verification passed with:

```text
python tools/atlas-bus-data/source_snapshot.py --verify tmp/bus-circ-1b-source-recovery/source-snapshot
```

Verified source hashes:

| Source | SHA256 |
|---|---|
| NaPTAN XML | `808fd287d953245b806144dbd36808417f49077e25013c031ddd8158e4b5fc51` |
| NPTG XML | `c5d70a938600bbdc32420fa1e0dedf1a2218e073873363db0ecba38074b5e414` |
| BODS east_anglia | `210106d92adfbc838e809184720e12c347be3ea644c5faa8969ca46e3ceba1df` |
| BODS east_midlands | `a88cb7e187f50513366af45ce01dd733b0dec51cdb9df4aa3804548b510b40ef` |
| BODS london | `65cfa2800fadc5042895a119d95ab515e8d152510c838df3dba81f362634d729` |
| BODS north_east | `635bddec572ea59975d6a7ffdafe6d6a248b43529ad1cb56be18daef3b62ed71` |
| BODS north_west | `83edc2c895b7c7de76eb110af3086f08209d11b2a0d4b633dd0da76137252aeb` |
| BODS south_east | `a1f41ed9b8734550b18d74c70b2ed8e03f79766775b1b72f0c81057529c3ba8a` |
| BODS south_west | `b3ffddba4e0a9ae4ace6d43380675b91bf768a12b649500e61402d4951806dd2` |
| BODS west_midlands | `261670bdf00b60a6269566facb2087ed5e142966d04ed642572713e595dbd50b` |
| BODS yorkshire | `b426eef9b5e70550c1d129e39fe3e6e5a86f8fb0f79c9aa3342cbeb7c1101f8c` |
| BODS aggregate | `1a92c22259c7805fb4100c0918b7b7671bec12b05a57a58c00ba0b1be38f1c62` |

## Real ordered BODS evidence

The targeted extraction was run first against `south_east.zip`, whose feed
window begins `20260925`. The earlier 20260904 representative date correctly
returned no active trips for these records; the extraction was rerun against
the feed-start representative date. All listed calls resolved to exact NaPTAN
StopPoint IDs; no `gtfs:` trace identity was used for these three principal
patterns. Repeated calls were retained.

### Waltham route 16

- BODS route ID: `6770339`.
- Principal service: `south_east:6770339:0:303ca11ab560`.
- Headsign: `Waltham Cross Bus Station (Stop C)`.
- Source endpoints: `Bus Station → Bus Station`; source circular assertion:
  `true`.
- Complete ordered pattern: 26 calls; first and last StopPoint are
  `210021703430`, repeated at positions 1 and 26.
- Exact endpoint evidence resolves StopPoint `210021703430`, NaPTAN code
  `hrtadadj`, indicator `Stop C`, and StopArea `naptan:210G432` (`Bus Station`)
  at both endpoints.
- Ordered StopPoint IDs:

  `210021703430,210021703460,210021703480,210021705000,150022013002,150022013005,150022013006,150022014001,150022014003,150022014005,150022014006,1500IM501,150022014013,150022014011,150022014009,150022014007,150022014004,150022014002,150022011003,1500220130Y5,1500IM392,150022013001,210021706160,210021700020,210021700040,210021703430`

The two shorter records are open variants from Highbridge Rdbt and to Quaker
Lane. Their complete ordered evidence contains internal repeats and is retained
as partial-loop variants; it does not overturn the closed principal pattern.

Decision: `circular`, closure basis `same-physical-stop-point`.

Planner output: `Route 16 operates as a circular service via Waltham Cross
Railway Station, Queensway and Lea Road.`

### Waltham route 16C

- BODS route ID: `6770341`.
- Principal service: `south_east:6770341:0:6c704c34ae6e`.
- Headsign: `Waltham Cross Bus Station (Stop C)`.
- Source endpoints: `Bus Station → Bus Station`; source circular assertion:
  `true`.
- Complete ordered pattern: 104 calls; first and last StopPoint are
  `210021703430`, repeated at positions 1 and 104.
- Repeated internal StopPoints retained as evidence: `1500WABYGRNM`,
  `150022017002`, `1500IM397`, `1500IM542`, and `150022017003` each recur.
- Exact endpoint evidence resolves StopArea `naptan:210G432` (`Bus Station`)
  at both endpoints and Stop C at the physical endpoint.
- Ordered StopPoint IDs:

  `210021703430,210021703460,210021703480,210021705000,150022013002,150022013005,150022013006,150022014001,150022014003,1500WABYGRNM,150022017002,150022021001,150022021003,150022021004,150022021007,150022021009,1500220210Y0,1500IM1078B,1500IM397,150022020003,1500IM542,150022017003,150022014005,150022014006,1500IM501,150022014010,150022014012,150022014014,150022014015,150022016002,150022016004,150022016005,150022016008,150042001006,150042001003,1500IM1045,1500DEBDEN10,150042002004,150042002006,150042002008,150042002010,1500DEBDEN2,150042016002,150042016004,150042016006,1500IM388B,150042016010,150042015001,150042015003,1500420150Y9,150042015011,150042012004,1500IM2417,150042010008,150042010006,1500IM504,1500IM358,150042015002,150042016012,150042016009,1500IM388,150042016005,150042016003,150042016001,1500DEBDEN2B,150042002011,150042002009,1500DEBDEN11,150042002003,150042002001,1500IM145B,150042001004,150042001005,150022016007,150022016006,150022016003,150022016001,150022014016,150022014013,150022014011,150022014009,150022014007,1500WABYGRNM,150022017002,150022020004,1500IM397,1500IM1078,150022021010,150022021008,150022021006,150022021005,150022021002,1500IM542,150022017003,150022014004,150022014002,150022011003,1500220130Y5,1500IM392,150022013001,210021706160,210021700020,210021700040,210021703430`

The four shorter records are retained as partial-loop variants (Maynard Court,
Maple Gate and the two directions), while the 104-call closed pattern remains
the principal family decision.

Decision: `circular`, closure basis `same-physical-stop-point` with the same
authoritative StopArea also confirmed.

Planner output: `Route 16C operates as a circular service via Waltham Cross
Railway Station, Queensway and Lea Road.`

### Pipers route 230

- BODS route ID: `118723`.
- Service: `south_east:118723:0:b7eada5524c4`.
- Headsign: `Caddington Woods, Lyons Community Centre`.
- Source endpoints: `Lyons Community Centre → Lyons Community Centre`; source
  circular assertion: `true`.
- Complete ordered pattern: 34 calls; first and last StopPoint are
  `021024595`, repeated at positions 1 and 34.
- Exact endpoint evidence resolves StopPoint `021024595`, NaPTAN code
  `ahlamgap`, locality Caddington. This snapshot has no StopArea reference for
  that StopPoint, so closure is correctly based on the exact physical ID.
- Ordered StopPoint IDs:

  `021024595,021013509,021013508,021013510,021013512,021013513,021013515,021013516,021028151,021013517,021013518,021013534,021013537,021013540,021013541,210021400211,021012009,021012007,02900202,02901244,02901616,02903800,02903622,02900043,02903722,02903032,02903034,02903037,02903006,02903038,02903040,02903047,021028168,021024595`

Decision: `circular`, closure basis `same-physical-stop-point`.

Planner output: `Route 230 operates as a circular service via Chaul End Road,
Winchfield and Manor Road.`

## Candidate rebuild and capacity

One separate V2 candidate was built with the existing static-index path from
the verified source snapshot. It was written to ignored review material under
`tmp/bus-circ-1b-review-candidate`; the active bank was not overwritten.

| Measurement | Active bank | V2 review candidate |
|---|---:|---:|
| On-disk bytes | 87,272,247 | 142,128,518 |
| Files | 1,371 | 1,637 |
| Service-shard paths | 706 | 705 |

The final launched review-candidate delta is `+54,856,271` bytes, or
`+62.86%`. The largest V2 service shard is `services/49000-london.json.gz` at
`10,487,619` bytes. The
candidate is below the repository's conservative 900,000,000-byte Bus safe
ceiling and below the per-file Git blob ceiling, so the capacity result is
`pass for isolated review`, not a publication approval. Its larger footprint
still requires an explicit production-capacity decision before any future
publication work.

## Replay and presentation controls

The Waltham replay was run through the V2 prepared adapter, frozen NaPTAN/NPTG
reference data, service assessment, endpoint resolution, planner grouping and
Word presentation path. The real principal 16/16C patterns above were observed
from the candidate, and the Pipers 230 pattern was replayed through the same
decision path. The frozen Cambridge and Birmingham review controls remain:

| Control | Stops | Raw services | Service summaries | Planner rows |
|---|---:|---:|---:|---:|
| Cambridge | 62 | 244 | 173 | 48 |
| Birmingham | 101 | 201 | 196 | 80 |

The candidate Waltham replay returned 16 physical stops, 97 raw services, 67
service summaries and 21 route numbers, with TfL and TNDS deliberately not
consulted. The candidate Pipers replay returned 11 nearby stops, one raw
service, one summary, and the exact 34-call route 230 pattern. The
Alpha.14/Alpha.15 red-shape controls, BUS-GROUP 1B–1G controls,
duplicate Additional/Short taxonomy controls, Browser/Word wording parity and
the V2 review-server route remain deterministic. No unresolved source evidence
was upgraded by hand, and the remaining TNDS route C / 231 limitation is still
review-only.

## GitHub tooling adoption review

No tooling adoption change was made in this assignment. Dependabot is present
but repository alerts remain disabled; Renovate would overlap with the current
weekly Dependabot path; Codecov would need an explicit coverage policy;
OpenSSF Scorecard is useful for public supply-chain signals; Sentry remains
deferred for this local/frozen review; and main-branch protection should be
enabled with required review and deterministic checks before production merge.

## Acceptance decision

- Exact artifact recovery and source verification: passed.
- Real ordered BODS evidence for 16, 16C and 230: passed.
- Candidate circular decisions and human planner wording: passed.
- Candidate capacity for isolated review: passed.
- Active bank changed or activated: no.
- Publication, deployment, merge, or Alpha.16: no.

Recommendation: keep this V2 build review-only. Do not publish or activate it
as part of BUS-CIRC-1B; any production promotion needs a separate capacity,
publication, and product-owner decision.
