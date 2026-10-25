# ATLAS Bus 2.0.0-beta.1 — Internal Beta release record

## Acceptance

On **25 October 2026**, the Product Owner and Technical Director accepted the ATLAS Bus Assessment candidate for controlled Internal Beta project use.

Classification: **ATLAS Bus Assessment — Internal Beta Accepted**.

The acceptance followed the completed final correction sprint and its trusted Bus intelligence regressions, 309-test Bus-data Python suite, deterministic ATLAS suite, immutable Run #75 verification, actual-candidate planner diagnostic, Browser/Word audit, rendered normal-product acceptance audit, and Chingford 657 golden regression. The Product Owner had manually reviewed substantial portions of the updated UI and outputs. This record does not claim that a manual test was performed during the final acceptance turn: the local review server could not be reopened then, and acceptance instead relied on the exact-SHA hosted rendered/product validation.

The Beta is suitable for controlled internal project use. Outputs remain subject to professional planner review. Minor non-material UI defects may be corrected through controlled maintenance, and internal users may report issues during Beta.

## Release identity

- Accepted engineering/runtime SHA: `672aeb8c103f4d586f21d24094c10b504fa1428c`.
- Release-identity commit SHA: `5dabb4da92bc14c8531c46e0f70bb55a74e48dfb`.
- Version: `2.0.0-beta.1`.
- Build: `ATLAS-2.0.0-beta.1-20261025`.
- Header identity: `ATLAS · Bus Beta`; detailed version and build remain in About.
- Rollback baseline before this release: `b3ad244dc98253da2f95a8ea9d0274ab32140f6f`, retained by `backup/atlas-bus-beta-intelligence-accepted-20261023`.

## Frozen data candidate

The release remains bound to the immutable Run #75 candidate:

- Workflow run: `39430415441`.
- Artifact ID: `12275615359`.
- Name: `atlas-bus-beta-review-candidate-39430415441`.
- Producer SHA: `151199cc914c235870f444d26b03c2309edbd035`.
- Size: `2,549,732,499` bytes.
- Canonical GitHub upload digest: `sha256:5cad24e0a47a4c77a8ec8616d746bf9f538404420fcb9505f297607632e1a471`.

The artifact was neither rebuilt nor replaced. No fresh national acquisition occurred during release preparation.

## Validation and trusted controls

The accepted engineering revision passed hosted Run `40191628031` before release identity was added. The exact release-candidate and exact-main SHA validations are mandatory release gates; their run IDs and final SHA are carried by the annotated Beta tag message, the GitHub Actions checks attached to the release SHA, and the final release handover. These checks use the frozen-candidate diagnostic path and do not acquire or rebuild national data. Required controls include Route 66, Route 251, Route 242, Waltham full/nearest semantics, Pipers 46/230/231, PE1 route 202, Chingford 657 and review grouping, Enfield 313/329, Browser/Word parity, and Sources & Checks evidence grouping.

## Limitations and operational status

- Automatic national-source refresh is **not yet operationally closed** and is outside this release.
- The optional global status manifest may be absent; ATLAS must not claim globally current data when its status is unavailable.
- Minor UI defects may still be identified by internal Beta users.
- Professional planner review remains required.
- The automatic updater is not claimed to be live.

Internal-use wording: **ATLAS Bus is available as an Internal Beta for project use. The core assessment, timetable analysis, review and export functions have been validated. Minor UI issues may continue to be refined during Beta, and users should report anything unexpected. Automatic national data updating remains the final operational closeout item.**

## Recovery and freeze

The previous accepted main baseline `b3ad244dc98253da2f95a8ea9d0274ab32140f6f` remains the rollback point. After exact-main validation succeeds, the release is retained on `backup/atlas-bus-beta-2.0.0-beta.1-20261025` and annotated tag `atlas-bus-beta-2.0.0-beta.1`. The tag must point only to the exact validated main SHA.
