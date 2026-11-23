# Draft ADR-016 — ATLAS module shell and style boundaries

**Status:** Draft for Technical Director review; no implementation approved
**Date:** 23 November 2026
**Scope:** Future ATLAS shell and independent module styling, including a possible Rail module

## Context and evidence from the current implementation

`atlas/index.html` is the single document for the Modules, Bus and About views. It loads the EAS theme and Leaflet styles, then `atlas-shell.css`, then `bus-beta-workspace.css`. The order is significant: the Bus stylesheet re-declares `:root` variables and broad `body`, `button`, `main`, `.app-header`, `.header-inner`, `.brand`, navigation and focus selectors that the shell stylesheet also owns. The Bus sheet therefore supplies part of the present shell appearance through later cascade precedence.

`atlas-shell.css` contains global resets, base typography/colour variables, shell header/navigation, module cards, About cards, common headings and generic container rules. It also names some elements generically, such as `.workspace` and `.about-card`, whose ownership is not explicit in the selector name. `bus-beta-workspace.css` contains Bus workspace structure and Bus controls, but also overrides shell-level selectors and shared variables. The existing code is proven for the current page only; these overlapping selectors are not evidence of an approved cross-module design system.

`app.mjs` owns view selection (`modules`, `bus`, `about`), Bus assessment composition, maps, acknowledgements, Sources & Checks, and exports in one large entry module. Its `#bus` view is a shell view and a Bus implementation view at once. The module picker, About content and Bus workflow are authored in the same HTML file, and global IDs/selectors couple the script to that document.

## Decision proposed

Keep the present implementation unchanged through Beta.2 release and freeze. For a later, separately approved architecture sprint, define a small ATLAS shell contract and give each module an explicit style and runtime entry boundary. The shell would own navigation, page landmarks, module selection, global typography/tokens, focus treatment, shared status patterns and the common content frame. Each module would own its workspace layout, domain controls, maps and module-specific presentation.

Candidate shared components (for example, module cards, status badges, headings, alerts and button treatment) remain proposals until accessibility, ownership, API and maintenance review approves each one. Existing `.about-card` or `.workspace` selectors must not be promoted to shared components by renaming alone.

## Proposed boundaries

- **Shell assets:** a shell stylesheet and shell entry point loaded once; namespaced `atlas-shell-*` classes and documented CSS custom properties only.
- **Module assets:** Bus and future Rail stylesheets loaded by their module entry points. A module may consume documented shell tokens and components but must not override `body`, `main`, generic element selectors, shell navigation or another module's classes.
- **HTML:** a stable shell landmark and navigation contract; module content mounts in a designated module region. A module must not replace shell navigation or About content.
- **JavaScript:** shell routing and module registration remain separate from assessment orchestration. Each module receives a small context (mount point, navigation callback, shared status API); it does not import another module's workflow.
- **Data and exports:** module-owned domain adapters and export rules stay with their module unless a separately reviewed interface proves a shared need.
- **Assets:** module-owned image, icon and map assets remain within module paths. Shared branding assets are versioned and owned by the shell.

## Versioning and compatibility

The first shell/module interface should have an explicit version and a compatibility test. A module must declare its supported shell interface version. Shell token or component changes that break a module require an interface-version update and a coordinated migration. No module may rely on stylesheet order or private selectors as an undocumented API.

## Verification requirements

Before accepting the future refactor, run the existing 16-control Browser/Word/A3 audit and Bus golden controls against the unchanged module, add shell/module isolation assertions, test keyboard and focus behaviour, check mobile and desktop layouts, compare screenshots for all current Bus views, and run a minimal Rail-shaped fixture that uses only the proposed shell contract. Test deep links, module switching, About/version presentation, map resize, acknowledgement and export flow. No Rail timetable behaviour is in scope merely because a Rail fixture exists.

## Migration and rollback proposal

1. Inventory selectors, CSS variables, script globals, IDs and load-order assumptions; record baseline screenshots and exact build.
2. Add shell contract tests without moving rules.
3. Extract only proven shell rules while the old Bus stylesheet remains available as an explicit compatibility layer.
4. Namespace the Bus selectors in a separate reviewed change; remove duplicate global overrides only after visual and behaviour parity.
5. Introduce a minimal independent module entry boundary; retain the old route until exact browser regression passes.
6. Remove compatibility CSS only after the full acceptance matrix passes. Roll back by restoring the prior frozen shell/module artifact, not by editing timetable logic or data.

## Open decisions requiring approval

- Whether modules are mounted by a JavaScript registry or by separate static pages sharing a navigation component.
- The exact shell interface and versioning mechanism.
- Which status, button, card and map primitives are genuinely common.
- Whether CSS Modules, native CSS layers, or namespaced plain CSS best fit the static Pages architecture.
- Whether shell tokens need a published package or remain an in-repository contract.
- Required accessibility target and visual-difference tolerance.

This ADR is a discovery record only. RE-1 does not move CSS, rename selectors, alter load order, refactor `app.mjs`, change layout or add Rail functionality.
