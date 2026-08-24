# ATLAS product language and usability principles

Status: permanent product requirement  
Established: 2026-08-24

## Transport-planner language

> ATLAS must speak transport-planner language, not software language.

A competent transport planner must be able to use the standard ATLAS workflow without understanding JSON, APIs, endpoints, schemas, adapters, caches, TTLs, HTTP codes, CORS, payloads, GitHub, ChatGPT or the internal architecture.

Normal pages should answer, in this order:

1. What assessment action is available?
2. What must the planner provide or confirm?
3. What did ATLAS find or calculate?
4. Which trusted source was used and when was it checked?
5. Is the information up to date, and is there anything affecting professional interpretation?
6. What should the planner do next?

Software diagnostics may be retained under an optional **View technical details** control. They must not replace the planner-facing explanation.

## Non-technical planner usability test

The formal acceptance principle is:

> A transport planner who is uncomfortable with technology should be able to open ATLAS, establish a site, run an available assessment, understand the result and know what to do next without needing assistance from the Product Owner.

This is an ongoing product test, not a one-off Alpha.1 observation. Automated browser checks provide an early safeguard but are not equivalent to real colleague beta testing.

## Professional information remains visible

Plain language must not remove information required for professional judgement. Relevant stop name, direction or stop letter, distance, source, checked date, freshness and interpretation warnings remain visible. Detailed source records, endpoints, response codes and cache state belong in optional diagnostics.

## Status language

- **Available**: accepted for its stated normal use.
- **In development**: usable for controlled review but incomplete and unaccepted.
- **Planned**: not implemented.
- **Existing Toolkit**: available outside ATLAS; migration is not implied.
- **Under review**: WIP requiring professional caution; not accepted for normal use.

## Protected creator attribution

The primary navigation contains an About page identifying:

**ATLAS — Automated Transport & Location Assessment System**  
**Created by Joe Freeman**

Creator attribution is a permanent part of the ATLAS product identity. It must not be removed, hidden or replaced during routine redesign, refactoring or module development without explicit Product Owner approval. This recognises product authorship and makes no unsupported assertion about legal copyright or intellectual-property ownership.

