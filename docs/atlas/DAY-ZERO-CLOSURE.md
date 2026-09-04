# ATLAS 2.0 Day Zero closure

Date: 2026-08-24  
Version: `2.0.0-alpha.1`  
Build: `ATLAS-2.0.0-alpha.1-20260824`  
Baseline: `551b7cbf6646e72f21842bf77b93633373a9cac2`  
Day Zero UX commit: `b9c8005bea8b661ba31ee45ace80c73bdf6ec525`

## Closure status

**A — Day Zero foundation suitable to freeze pending later Product Owner spot-check.**

This is development software. It is not a production release and has not received Product Owner manual acceptance.

## What changed

New ATLAS development now follows the authoritative-data direction established by ADR-009. The earlier TPT-era AI/library-led factual research direction is superseded for new ATLAS work; it remains recoverable as legacy history and functionality.

The closure pass did not redesign Alpha.1. It:

- established the permanent rule that ATLAS speaks transport-planner language, not software language;
- added the formal non-technical planner usability test;
- replaced software-led visible wording with clear actions, source, checked time, status and professional points to note;
- kept endpoints, response codes and cache state under optional technical details;
- added **About** to primary navigation;
- identified **ATLAS — Automated Transport & Location Assessment System** as part of the EAS FORGE R&D programme;
- added the protected visible attribution **Created by Joe Freeman**;
- retained concise OpenStreetMap/Nominatim and Transport for London acknowledgements;
- corrected narrow-screen navigation and converted the stop table to labelled mobile cards;
- added a general UK-scoped geocoding fallback so `33 Westow Street, Crystal Palace` genuinely resolves without hard-coded coordinates and still requires confirmation;
- added mocked browser protection for the planner workflow, software-language guard and plain source failure.

## What remains protected

The independent `/atlas/` application, Site and Evidence models, source-adapter boundary, Nominatim and TfL adapters, cache/freshness behaviour, provenance, explicit failure modes, deterministic test structure and live-source test structure remain intact.

The existing dashboard and protected legacy modules remain unchanged against baseline `551b7cb`. Bus 1.8.2 preservation work, the legacy freeze branch and all existing Drawing worktrees/QA outputs remain recoverable and separate.

## What Alpha.1 proves

- one reusable, explicitly confirmed Site;
- generic Evidence with source, time, validation and freshness;
- a source-adapter boundary with honest failure states;
- genuine address resolution and authoritative TfL nearby-stop discovery;
- clear source and checked-time presentation;
- a plain-English, responsive EAS-branded shell;
- an About page with permanent creator attribution;
- compatibility with the existing legacy Toolkit.

## What Alpha.1 does not prove

- a complete Bus Assessment;
- service, route, timetable, frequency, destination or professional stop-grouping analysis;
- Railway or Accessibility automation in ATLAS;
- a functional Report Builder;
- an accepted Drawing Generator;
- production readiness or Product Owner acceptance.

## Review access diagnosis

The earlier access problem was not an ATLAS application failure. The branch existed only in a local worktree, had not been pushed, and had no deployed review URL. The temporary local test server was stopped after engineering verification.

Opening `atlas/index.html` directly with `file://` is not a reliable alternative because modern browsers restrict local JavaScript modules and cross-origin source requests. Alpha.1 remains a static application; it does not need or introduce a backend.

The ordinary Product Owner method is a supplied remote static review link for the pushed development branch. Engineers may alternatively run a local static server. The remote link is for review only and is not a production deployment.

## Verification summary

The final evidence is recorded in [ALPHA1-TEST-RECORD.md](ALPHA1-TEST-RECORD.md). Thirty-three deterministic checks passed. Fixture browser, non-technical planner, responsive visual, live Node and live browser/CORS checks passed. The live shortened address returned the exact Westow Street property and 31 TfL stops. No protected legacy file changed.

Automated browser testing is the strongest reasonable substitute while the Product Owner is unavailable; it is not equivalent to a real planner beta test.

## Future direction

The next formal R&D increment must begin from this frozen, reviewable Day Zero foundation. No Alpha.2 Bus, Rail, Accessibility, STATS19, Drawing or Report Builder functionality is started by this closure.

## Recovery

- Pre-ATLAS freeze: `backup/legacy-toolkit-pre-atlas-2.0-20260824` at `551b7cb`.
- Preserved unaccepted Bus WIP: `backup/local-main-wip-pre-atlas-2.0-20260824` at `b5fc0e9`.
- Alpha.1 implementation: `97c94e7`.
- Day Zero UX closure: `b9c8005`.

Recovery requires selecting the relevant branch or commit; no force reset, history rewrite or deletion of worktrees is required.

