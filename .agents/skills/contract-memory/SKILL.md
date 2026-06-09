---
name: contract-memory
description: Maintain trigger-gated HEB contract memory for external data semantics and cross-repo assumptions. Use when adding, auditing, or reviewing docs/data-contracts, docs/repo-contracts, or a change that depends on an external data source, API, service, generated artifact, package, or repository; do not use for ordinary architecture docs or when no external dependency trigger exists.
---

# Contract Memory

Use this skill to decide whether contract memory is needed and, when it is, to create the smallest useful data or repo contract. Contract files are source-of-truth routes for external semantics; they are not generic architecture notes.

## Workflow

1. Confirm the trigger before writing anything:
   - external data, API, model output, generated artifact, shared package, service, or another repository owns behavior the current repo depends on
   - an agent or reviewer previously guessed, duplicated, or misunderstood that external behavior
   - a change introduces a new external dependency whose semantics are not already documented in the repo
2. Try the smaller control first. Prefer a short existing doc update, ADR, code comment, schema link, or route update when that fully resolves the risk.
3. Choose the contract surface:
   - use `docs/data-contracts/` for external data semantics, schemas, APIs, events, model outputs, or files whose meaning is not owned by this repo
   - use `docs/repo-contracts/` for cross-repo, package, service, generated-artifact, or upstream behavior assumptions
4. Read `references/contract-shapes.md` only when drafting or reviewing contract fields and examples.
5. Keep every contract compact: source of truth, assumptions, validation, known pitfalls, freshness metadata, and retirement or review-after signal.
6. Update the relevant index route when a contract file is added, moved, superseded, or retired. If this creates the first data or repo contract surface, also add or verify the root `AGENTS.md` route that tells future agents when to open that index.

## Boundaries

Do not create contract folders just to make the harness look complete. If the trigger is weak, record the missing trigger or reject the addition as bloat.

Do not duplicate full schemas, upstream implementations, generated files, or public documentation. Link to the source and summarize only the semantics that agents need to avoid wrong changes.

Retire or merge a contract when the dependency disappears, the source of truth moves into this repo, a generated schema plus tests fully covers the risk, or the contract causes more routing noise than useful protection.

## Validation

Run the repo's normal harness gate after edits. In this repository, run:

```bash
node scripts/template-fitness.mjs
```

When the target repo has contract-specific checks, run those too. Otherwise include a manual validation note naming the source of truth that was inspected and the failure mode the contract now prevents.
