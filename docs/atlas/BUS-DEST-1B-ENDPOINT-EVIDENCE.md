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

## Waltham Cross 700 m review

The diagnostic review was run at the confirmed point `51.685600,-0.031100`
with the full 700 m assessment. The rebuilt browser review returned `14`
stops and `39` planner service summaries. The detailed evidence panel showed
exact IDs and source-derived locality/StopArea decisions for routes 13, 15,
66, and 310, with the route rows and controlled frequency/period summaries
preserved. London control routes remained present in the same review.

Key endpoint results:

- 13: Waltham Cross Bus Station ↔ The Talbot;
- 15: Waltham Cross Bus Station ↔ Harlow Town Centre Temp Bus Station;
- 66: Waltham Cross Bus Station ↔ Loughton Station, with Smiths Lane evidence
  qualified as Hammond Street (Smiths Lane) where that endpoint is used;
- 310: Hertford Bus Station ↔ Waltham Cross Bus Station, with Ware Railway
  Station retained as the source endpoint in the relevant pattern;
- circular route 16 remains circular and is not converted into a linear
  origin/destination claim;
- London controls 217, 279, 317, 327, 491, and N279 remain represented.

## Review and handover

Product Owner review should inspect the browser's **Show detailed evidence**
panel for the four target route families, confirm the raw GTFS fields and
exact-match method, then compare the route rows with the Word export. The
review must remain diagnostic until acceptance. A further rebuild or any
publication requires a new controlled decision and a fresh frozen-source
identity.
