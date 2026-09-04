# ATLAS browser review environment

Status: DEV-ENV-1 development convenience  
Product version: `2.0.0-alpha.1`  
Build: `ATLAS-2.0.0-alpha.1-20260824`

## Product Owner — start and stop

### Start

1. Double-click **OPEN ATLAS REVIEW** in the supplied ATLAS review folder.
2. Wait for the normal Windows browser to open.
3. Confirm ATLAS shows `2.0.0-alpha.1`, then test Modules or About.

The accompanying window says when ATLAS is ready. No commands, administrator rights or technical setup are required.

### Stop

Either close the **ATLAS Development Review** window or double-click **STOP ATLAS REVIEW**.

Closing only the browser does not stop the review environment. It is safe to start ATLAS again: an existing review is reused rather than duplicated.

## What the launcher does

The launcher locates an available Node.js runtime, starts a small static-file review server bound only to this computer, selects an available local review address, opens `/atlas/` in the default Windows browser and remains open until stopped.

It prefers the usual ATLAS review address. If that address belongs to another application, ATLAS selects another one without stopping or altering the unrelated process. A still-running ATLAS review is reused. The Product Owner never needs to know the selected address.

The environment serves the ATLAS application and its required EAS/legacy static resources. It blocks repository internals such as `.git`, tests, documentation and launcher source from browser access. It does not write to ATLAS, legacy modules or project data.

## Dependencies

- Windows batch support included with Windows.
- Node.js, resolved in this order: system PATH, standard Program Files install, standard per-user install, or the existing Codex bundled runtime.
- The default Windows browser, opened through the Windows URL handler.

Python, PowerShell execution-policy changes, administrator rights, a backend, cloud hosting and new framework dependencies are not required.

On the current Product Owner machine, the launcher successfully locates the existing Codex bundled Node.js runtime even though `node.exe` is not on the normal PATH.

## Failure and recovery

Normal messages remain plain English. If startup cannot complete, the window advises the Product Owner to try again or ask Codex/developer support. Technical errors are appended outside the repository under:

`%LOCALAPPDATA%\EAS ATLAS\Review\atlas-review.log`

Small runtime state files in the same folder allow repeated launch and clean stop. If the review window is forcibly closed, a stale state file is checked and discarded on the next launch; no process is killed by identifier.

The launcher tries the local range 8769–8789 and never terminates a process merely because it occupies one of those addresses.

## Developer verification

From the ATLAS worktree with Node available:

```text
node tests/atlas/review-environment.test.mjs
node tests/atlas/review-environment-browser.mjs
```

The first test covers startup, ATLAS and legacy routes, static assets, unknown/protected paths, repeated launch, collision handling and shutdown. The second launches the actual review server and verifies the Alpha.1 shell, styles, JavaScript modules, navigation and mocked Bus workflow in a browser.

Existing Alpha.1 deterministic, browser, live-source and legacy-isolation checks remain separate and must pass before this branch is handed over.

## Scope boundary

DEV-ENV-1 changes development access only. It adds no backend, deployment, authentication, AI or transport-assessment functionality. The ATLAS product version/build remains unchanged and PR #20 must remain unmerged pending Product Owner review.

