# ATLAS Beta.2 — Friday 20 November continuation

**Status:** unreleased WIP; Technical Director review: NO; Product Owner re-acceptance: NO. Continue only on `codex/atlas-bus-beta2-blockers-20261118` in the isolated worktree `C:\Users\joe.freeman\.codex\worktrees\atlas-beta2-blockers-20261118\atlas-beta2-known-defects-hardening`. Preserve the original dirty review checkout at `C:\Users\joe.freeman\.codex\worktrees\atlas-po-defect-correction\atlas-beta2-known-defects-hardening` and the verified recovery patch (SHA-256 `92E9F654815F2C8EE1B3634096B095C688EF72E39FA4F5559C6EE8074C7D3D22`).

## First action

Find a working Python 3 interpreter and run `tools/atlas-bus-data/test_build_static_index.py`. The current session had no runnable Python; do not call that test passed until it runs successfully.

## Remaining blockers and sequence

1. Re-run the final focused JS checks and the full deterministic ATLAS suite using the frozen Run #75 Bus/TNDS and verified TfL iBus manifests. Do not refresh data.
2. Reproduce and correct only the 13-control audit regressions: Waltham Route 212 frequency-basis ID, Abbotts Rise Route 25B family membership, PE1 Route 202 arriving-journey terminus evidence. First identify each first incorrect transformation; protect the out-of-scope grouping architecture.
3. Obtain a text-readable copy or manually inspect the official June 2026 Route 231 PDF. Map evidence to exact stop identities `021024640`, `021028151`, `021013516`; reconcile effective date, direction, calendar and journey identity against Run #75 without rewriting the snapshot. Keep warnings at the supported physical stop.
4. Confirm current Route 16/24 role disclosures in actual Browser and Word output, preserving the independent Route 24 endpoint warning and Route 16C Sunday 19:45 control.
5. Re-run the complete 13-control Browser/Word/map audit with captured TfL evidence; document every remaining failure without broadening scope.
6. Verify isolated/original worktrees, backup hashes, staged path list and diff. Create an explicitly WIP local checkpoint and normal-push only if the remote branch has not advanced and the push is fast-forward. Otherwise retain the local checkpoint and create a Git bundle. Never force-push, merge, tag, release, deploy, change version, or refresh national data.

Frozen baselines: Run #75 Bus manifest `1195f19b55d476600060d89b4a56517e039032f39f9a917ad49647ffec89df4f`; TNDS manifest `2cc49b4ac5081fd23557024bfaf0b2809d4a207ce07e7de306d2b1e48bde727f`; iBus manifest `3090e1da6da21878725d0b30343757bd32c65fcdd56d9fdecb6f6ae6c75b5d53` with declared index hash `39b0eae384ec7a44115f898b940b3f35213577195706d38a82fa97707d2610de`. Candidate version is `2.0.0-beta.1`; do not present it as an accepted release.
