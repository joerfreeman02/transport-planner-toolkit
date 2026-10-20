# BUS-BETA-S2C-3 Oversized TNDS Service Closeout Handover

## Outcome

**NOT READY FOR MANUAL ACCEPTANCE.** The frozen Run #53 candidate was built and structurally validated on GitHub-hosted runners. Its exhaustive TNDS package audit passed. The real-candidate control audit reached Waltham Cross and failed because routes **13A** and **13B** did not reach planner summaries. No production-code or route-interpretation change was made in response. Treat this as an MA-02 review blocker for a separate, tightly scoped diagnosis of route evidence and terminus/operator presentation.

## Source and measurement evidence

- Frozen primary producer run: `39217550518`, artifact `12169814614`, digest `sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb`.
- Frozen TNDS producer run: `39217550518`, artifact `12171771295`, digest `sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1`.
- Retained exhaustive measurement of the frozen TNDS input: 308,569 parsed logical records; 308,547 runtime-eligible records; 22 explicit non-runtime-materializable metadata-only records; 134,024,052 eligible departure-evidence rows. The largest logical record was 34,723,337 serialized bytes. It was large because timetable departure evidence expands across journeys, not because of stop-sequence or calendar material.
- The exhaustive prepared-package audit on the actual candidate passed across all eight regions. It verifies logical identity conservation, fragment completeness, row ordering/evidence conservation, referenced shard existence, gzip decoding and the 8 MiB decompressed-shard ceiling.

The retained local measurement report is `C:\Users\joe.freeman\AppData\Local\Temp\ATLAS-BUS-S2C3-Run53-TNDS-20261020\logical-record-measurements-retained.json`. The interrupted local preparation output and logs were preserved. No further national processing was performed locally.

## Implementation and hosted execution

- Branch: `codex/atlas-bus-beta-s2c-3-oversized-service-closeout`.
- Candidate code SHA: `151199cc914c235870f444d26b03c2309edbd035`.
- Final-SHA zero-download preflight: run `39429890524`, success on the candidate code SHA. Evidence artifact `12268465143`, digest `sha256:4a230ad4319a260da8b5eea73fcbde867d4a57e12be845de7020fe6d22a605d1`.
- Frozen-source candidate compose: run #75, run ID `39430415441`, success through candidate build, structural validation, immutable checkpoint creation/upload and exhaustive package audit; the downstream actual-candidate audit failed at Waltham Cross.
- Immutable review candidate: artifact `12275615359`, digest `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`, size 2,549,732,499 bytes. It remains on GitHub; it was not downloaded locally.
- Candidate audit report artifact: `12277242078`, digest `sha256:f5119690792f8c0f5e1215127e33d6d738a9ff2dee0702c04b1c6d44b27a129f`.
- Run #75 restored and verified the exact frozen primary and TNDS artifact IDs/digests. Fresh primary and fresh TNDS acquisition paths were skipped. Publication and deployment jobs were skipped.
- Candidate version remained `2.0.0-alpha.15`, build `ATLAS-2.0.0-alpha.15-20260914`.

## Control results and limits

- **Pipers Lane:** the real-candidate assertions passed for BODS-primary route 230, TNDS route 230, TNDS route 231, planner summaries for 230/231, and circular evidence reaching downstream composition.
- **Waltham Cross / 47 Berkley Avenue:** assertion failed because planner summaries were missing routes 13A and 13B. The audit stopped at this assertion. It did not persist the in-memory control rows, so this run does not establish whether those two routes were absent from the underlying matched rows or suppressed during planner summarization.
- Chingford, PE1/Queensgate, the all-region adapter/browser smoke, and the full downstream deterministic suite were not reached after the Waltham assertion failed. Do not claim those gates passed.
- No headless browser result was produced. Do not present the candidate as ready for manual acceptance or Technical Director acceptance.

Next diagnosis should inspect the retained candidate artifact on a GitHub-hosted runner and determine whether 13A/13B evidence is absent at the Waltham call points or present but suppressed by route-terminus/operator presentation. Keep any MA-02 change out of the fragmentation implementation unless evidence proves a direct runtime-packaging defect.

## Machine constraint and local review environment

No candidate files were downloaded to the OneDrive-backed workspace. Creating a local review environment would require at least the 2,549,732,499-byte candidate artifact download, plus temporary disk space and local serving. That work is both blocked by the failed readiness gate and materially burdens local disk/network; it was not attempted. Existing local measurement and partial-preparation files remain intact.

## Programme lessons for Rail and future modules

- Separate source acquisition from interpretation and retain immutable raw-source checkpoints.
- Measure full source size and logical-record distributions before selecting production packaging.
- Version prepared data explicitly and bound browser materialization; stream or semantically fragment oversized logical records without loss.
- Preserve primary evidence when supplementary sources fail, while marking completeness partial and review-required.
- Track exact provenance, source authority, identities, and conservation counts; never silently omit evidence.
- Test the actual candidate end to end, including real controls and runtime requests; fixture-only tests are not enough.
- Require candidate-level automated gates before manual acceptance.
- Keep golden control locations and their expected evidence visible across releases.
- Do not extract shared Rail infrastructure or start Rail development without a later ADR.
