# BUS-BETA-S2C-2 corrected candidate replay handover

## Authority and baseline

- Repository: `joerfreeman02/transport-planner-toolkit`
- Starting branch: `codex/atlas-bus-beta-s2c-1-national-runtime-scale`
- Exact starting SHA: `cc8897d8396f54f01c78341834a98450829d2ad8`
- S2C-2 branch: `codex/atlas-bus-beta-s2c-2-candidate-replay-authority`
- Version/build remains `2.0.0-alpha.15` / `ATLAS-2.0.0-alpha.15-20260914`.
- Run #66 (`39282793987`) succeeded on the exact starting SHA. Its unexpired evidence artifact is `atlas-tnds-trust-offline-preflight-39282793987`, ID `12202446267`, digest `sha256:e9647b618d3227df6287b56ec703fa26f6b853d58610fd50e08c8ccbdefb445c`.
- The remote S2C-1 branch and clean local starting checkout were verified at the exact starting SHA before implementation.

## Selector implementation

The dispatcher adds one S2C-2-specific selector, implemented by `tools/atlas-bus-data/resolve_s2c2_selector.py` and tested directly. On this exact branch it accepts only:

1. the existing `v2` / measure-only / forced `TNDS-TRUST-PREFLIGHT-C1B` zero-download preflight; or
2. a manual `v1` compose with the exact Run #53 primary and TNDS producer, artifact, and digest values.

All other inputs must remain blank/default. Fresh-source selectors, `restore_candidate`, non-manual dispatch, and any other branch are rejected. The main guard checks out the exact workflow commit before running the selector. The candidate job uses the existing isolated review-only reusable workflow. Live acquisition, legacy production refresh, publication, and deployment paths remain unreachable for this selector.

The candidate workflow's exact-SHA preflight gate runs before source artifact metadata checks, downloads, or preparation. Run #66 proves the predecessor SHA and its evidence; the S2C-2 branch must produce its own exact-SHA offline preflight before the compose dispatch.

## Frozen source artifacts

Both required Run #53 artifacts were checked immediately before the S2C-2 compose sequence and were unexpired:

- Primary: run `39217550518`, artifact `12169814614`, name `atlas-reference-source-snapshot-39217550518`, digest `sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb`.
- TNDS: run `39217550518`, artifact `12171771295`, name `atlas-tnds-quarantined-39217550518`, digest `sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1`.

The S2C-2 compose reuses these exact artifacts. It does not reacquire BODS, NaPTAN, NPTG, TNDS, or other national data.

## Local verification

- Focused S2C-2 selector tests: 8 passed, including exact compose acceptance, exact preflight acceptance, wrong primary/TNDS run/artifact/digest refusal, fresh-source refusal, restore refusal, non-manual/wrong-branch refusal, and production-route isolation.
- Review-candidate Python workflow contracts: 23 passed.
- Full Python Bus-data suite: 304 passed.
- `node tests/atlas/run-all.mjs`: passed (`ATLAS Alpha.15 deterministic suite passed.`).
- `git diff --check`: passed.

The first sandboxed attempts to run broad Python/browser tests hit Windows temporary-directory permission errors; reruns with the approved test execution context passed. The repository's locked Playwright 1.58.2 package was installed from the existing pnpm store without downloading packages.

## Candidate and validation evidence

- Exact-SHA preflight: run #67, ID `39386196456`, succeeded on code SHA `c9f89ce6aed85d8f1cf68db45f2e0378ad893be4`. Evidence artifact ID `12247142703`, name `atlas-tnds-trust-offline-preflight-39386196456`, digest `sha256:693724f12fe0ea48ebe2266dac91ff6888cbee96e4e46a4f324934c54a5b4ff0`.
- The single authorised compose was run #68, ID `39386511773`, on branch `codex/atlas-bus-beta-s2c-2-candidate-replay-authority`, code SHA `c9f89ce6aed85d8f1cf68db45f2e0378ad893be4`, event `workflow_dispatch`. It failed in `Build complete review-only Bus and TNDS candidate with production builders` before structural validation or candidate checkpoint creation.
- Both exact Run #53 artifact metadata checks passed. Primary run `39217550518`, artifact `12169814614`, digest `sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb`, was restored and verified. TNDS run `39217550518`, artifact `12171771295`, digest `sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1`, was restored and verified.
- No fresh national source acquisition occurred. Fresh primary and TNDS acquisition steps were skipped; frozen artifacts were reused.
- The blocking TNDS pattern was `tnds:SE:bed_51-C1-_-y08-1.xml:51-C1-_-y08-1:pattern:JP_51-C1-_-y08-1-11-I-7`. It requires `9,765,619` bytes in one runtime shard, exceeding the `8,388,608`-byte (8 MiB) hard ceiling. The builder failed closed and explicitly reported that no service was dropped.
- No completed TNDS v2 manifest or shard set was produced, so a maximum emitted shard measurement is unavailable. The attempted indivisible pattern requirement was `9,765,619` bytes. Structural validation, post-save candidate integrity, and downstream deterministic validation did not run.
- Candidate artifact: none. Immutable full candidate checkpoint upload was skipped. Downstream validation artifact: none.
- Pipers Lane, Waltham Cross, and Chingford hosted deterministic controls were not reached in this failed run. Local Alpha.15 and Bus-data suites passed before dispatch, but they did not exercise this exact restored national candidate end to end.
- Publication/deployment: NO. The Deploy job was skipped, as were the production build and acquisition jobs.
- No local manual-review environment was prepared because no immutable candidate artifact exists. Manual acceptance remains outstanding.

The failure exposes an unresolved runtime packaging case: preserving the 8 MiB shard ceiling and every record requires a representation that can handle this 9,765,619-byte pattern without dropping it. This S2C-2 authorization was for one compose, so no second compose or runtime-code change was made under it. A follow-up correction and separately authorised replay are required before manual review.

## Controls and manual review

Pipers Lane 230/231/circular, Waltham Cross national plus TfL, and Chingford routes 357/444/657/W16 are engineering regression controls only. They do not constitute real manual acceptance. No GROUP, DEST, or CIRC rewrite is in scope.

MA-02 remains to be retested manually after corrected candidate data reaches the planner:

- Waltham route-terminus presentation;
- TfL/national endpoint identity proof;
- national operator presentation.

Manual acceptance remains outstanding. If the corrected candidate succeeds, a temporary local review environment will use its immutable artifact plus the S2C-2 runtime checkout; the candidate itself will remain unchanged.

## Release and tooling status

No Beta declaration, version/build increment, merge, PR, release, publication, or deployment is authorised. Dependabot remains configured; Codecov is deferred pending a coverage baseline; OpenSSF Scorecard is later; Sentry is deferred pending telemetry/privacy architecture; Renovate is not duplicated alongside Dependabot.
