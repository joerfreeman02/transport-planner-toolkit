# BUS-DEST-1B: authoritative endpoint source evidence

Status: **implementation complete; Product Owner and Technical Director review required**  
Scope: **V2 preparation and diagnostic review only**  
Production: **Alpha.15 unchanged; no publication, deployment, merge, or Alpha.16 declaration**

## Evidence contract

`atlas-prepared-bus-data-v2` version `2.1.0` preserves an `endpointEvidence`
object on each prepared BODS service record with `origin` and `destination`
collections. Each exact evidence record retains:

- raw GTFS `stop_id`, `stop_code`, and `stop_name`;
- the exact match method (`gtfs-stop-id-equals-atco-code`,
  `gtfs-stop-code-equals-naptan-code`, or explicit unresolved identity);
- resolved NaPTAN ID, code, CommonName, Indicator, StopType, BusStopType,
  status, and source provenance;
- NPTG locality code/name and evidenced parent locality where supplied;
- exact active StopArea references and names, without inventing a group when
  the authoritative group record is missing or inactive;
- route short name, long name, description, trip headsign, ordered pattern
  endpoints, and BODS pattern provenance.

Repeated endpoint evidence is keyed by exact physical StopPoint identity and
aggregates deterministic unique raw GTFS values, trip headsigns, route names,
descriptions, match methods, and source identities. The V2 review cache marker
also records the frozen source run/snapshot, prepared schema/version, and the
generator compatibility fingerprint covering all prepared-data generators.

Only exact identity is admissible. Names, coordinates, proximity, fuzzy text,
route number, or planner intuition cannot create endpoint evidence. When
runtime exact hydration is unavailable, the planner may consume persisted
prepared evidence and labels it `prepared-exact-endpoint`. If runtime and
prepared evidence materially disagree, the result is explicitly
`runtime-prepared-conflict` and requires review.

## Frozen source and rebuild record

The controlled diagnostic rebuild used only the cached frozen source snapshot;
no live acquisition and no TNDS input were used.

| Item | Value |
|---|---|
| Frozen source run | `36125621080` |
| Frozen source snapshot fingerprint | `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c` |
| NaPTAN SHA-256 | `808fd287d953245b806144dbd36808417f49077e25013c031ddd8158e4b5fc51` |
| NPTG SHA-256 | `c5d70a938600bbdc32420fa1e0dedf1a2218e073873363db0ecba38074b5e414` |
| Snapshot date | `2026-09-25` |
| Rebuild generated at | `2026-10-01T00:00:00Z` |
| Rebuilt schema | `atlas-prepared-bus-data-v2` / `2.1.0` |
| Active StopPoints | `375,640` |
| Logical groups | `97,346` |
| NPTG localities | `43,900` |
| BODS regions | `9` |
| Output capacity | `132,451,681` bytes / `1,637` files |

The previous prepared V2 data directory was `110,614,782` bytes / `1,638`
files. The increase is the expected endpoint-evidence and locality-parent
payload, not a source expansion.

## Recovered control evidence

All listed controls are active, bus/coach-eligible, coordinate-valid NaPTAN
StopPoints with exact GTFS `stop_id == ATCOCode` matches in the frozen BODS
snapshot.

| Control ID | NaPTAN CommonName / Indicator | NPTG locality | Active StopArea evidence |
|---|---|---|---|
| `210021703430` | Bus Station / Stop C | Waltham Cross `E0013720` | Bus Station `naptan:210G432` |
| `210021703435` | Bus Station / Stop D | Waltham Cross `E0013720` | Bus Station `naptan:210G432` |
| `210021301920` | Bus Station | Hertford `E0046986` | Bus Station `naptan:210G592` |
| `210021302375` | Ware Railway Station | Ware `E0047008` | source references `naptan:210G508`, group record unresolved |
| `210021702900` | Smiths Lane | Hammond Street `E0013712` | source references `naptan:210G476`, group record unresolved |
| `15003503100B` | Temp Bus Station | Harlow Town Centre `N0076799`, parent Harlow `E0055813` | Bus Station `naptan:150G00000876` |
| `1500IM350B` | The Talbot / N-bound | North Weald `N0076828` | The Talbot `naptan:150G00002628` |
| `1500IM358` | Loughton Station | Loughton `E0046286` | Loughton Station `naptan:150G00000960`, parent TfL group retained |

## Canonical Product Owner Waltham acceptance record

This is the single acceptance record. The earlier `51.685600,-0.031100`
diagnostic point is superseded and must not be used as an acceptance result.

| Item | Accepted value |
|---|---|
| Latitude | `51.6857829` |
| Longitude | `-0.0330001` |
| Radius | `700 m` |
| Mode | Full Assessment |
| Frozen source | Run `36125621080`, snapshot `8e2982017598eb0f37153f03eb42bab596d70d1217cd08f0678944719fe666c9` |
| Physical stops | `16` |
| Distinct routes | `21` |
| Route×StopPoint pairs | `86` |
| Planner rows | `39` |
| Browser/Word parity | Passed; both use the same prepared evidence and planner summaries |

The review launcher invalidated the legacy marker and rebuilt from this same
frozen source after the generator fingerprint changed. No live NaPTAN, NPTG,
BODS, or TNDS acquisition was used.

| Route | Raw origin → destination; exact endpoint IDs | Exact match; NaPTAN / NPTG locality / parent / StopArea | Final planner result; evidence state |
|---|---|---|---|
| 13 | `Bus Station` → `The Talbot`; `210021703430` → `1500IM350B` | `gtfs-stop-id-equals-atco-code`; Bus Station / Waltham Cross `E0013720` / none / `naptan:210G432`; The Talbot / North Weald `N0076828` / none / `naptan:150G00002628` | The Talbot; `prepared-exact-endpoint`; no conflict, no unresolved identity |
| 15 | `Bus Station` → `Temp Bus Station`; `210021703430` → `15003503100B` | `gtfs-stop-id-equals-atco-code`; Bus Station / Waltham Cross `E0013720` / none / `naptan:210G432`; Temp Bus Station / Harlow Town Centre `N0076799` / Harlow `E0055813` / `naptan:150G00000876` | Harlow Town Centre Temp Bus Station; `prepared-exact-endpoint`; no conflict, no unresolved identity |
| 66 | `Bus Station` → `Smiths Lane`; `210021703430` → `210021702900`; reverse pattern retains `Loughton Station` `1500IM358` | `gtfs-stop-id-equals-atco-code`; Bus Station / Waltham Cross `E0013720` / none / `naptan:210G432`; Smiths Lane / Hammond Street `E0013712` / none / no active StopArea; Loughton Station / Loughton `E0046286` / TfL parent group / `naptan:150G00000960` | Hammond Street (Smiths Lane) or Loughton Station by source pattern; `prepared-exact-endpoint`; no conflict, no unresolved identity |
| 310 | `Bus Station` → `Bus Station`; `210021301920` → `210021703435`; reverse pattern is retained | `gtfs-stop-id-equals-atco-code`; Hertford Bus Station / Hertford `E0046986` / none / `naptan:210G592`; Waltham Cross Bus Station / Waltham Cross `E0013720` / none / `naptan:210G432` | Waltham Cross Bus Station or Hertford Bus Station by direction; `prepared-exact-endpoint`; no conflict, no unresolved identity. Ware Railway Station `210021302375` remains source-retained in its relevant pattern. |

London/TfL control: route `217` remains present with TfL authority and the
expected Turnpike Lane Bus Station ↔ Waltham Cross Bus Station pattern. TfL
authority and route-family semantics are unchanged.

For route 16: **Existing circular classification preserved unchanged during
BUS-DEST; final circular interpretation remains reserved for BUS-CIRC.**

## Review and handover

Product Owner review should inspect the browser's **Show detailed evidence**
panel for the four target route families, confirm the raw GTFS fields and
exact-match method, then compare the route rows with the Word export. The
review must remain diagnostic until acceptance. A further rebuild or any
publication requires a new controlled decision and a fresh frozen-source
identity.
