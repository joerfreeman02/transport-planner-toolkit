# ATLAS 2.0 migration and recovery note

Alpha.1 adds `/atlas/`; it does not replace `/`, remove a legacy module or rewrite history.

The pre-ATLAS product is recoverable at commit `551b7cbf6646e72f21842bf77b93633373a9cac2` and local freeze branch `backup/legacy-toolkit-pre-atlas-2.0-20260824`. That baseline intentionally includes Bus 1.5.0 and Drawing Generator 0.1.0/WIP; it does not imply every module is Product Owner accepted.

Unaccepted local Bus 1.8.2 work is separately preserved at branch `backup/local-main-wip-pre-atlas-2.0-20260824`, commit `b5fc0e995d0bfa2effd2f24a6a72bd73550179b0`. It is preservation only and must not be automatically merged into ATLAS.

Migration should happen module by module after deterministic evidence behaviour and Product Owner acceptance. Until then, legacy functionality and the Shared Library remain available. Alpha.1 changes no protected legacy file.

Rollback requires no history rewrite: serve or branch from the freeze commit and omit the additive ATLAS commits. The separate WIP preservation branch remains available for later review.

