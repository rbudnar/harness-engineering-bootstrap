# Contract Shapes

Use these shapes when a data or repo contract is already triggered. Omit fields that do not carry real information, but keep provenance, validation, and retirement/review signals visible.

## Admission Check

- Trigger evidence: external semantics or cross-repo assumptions already affect correctness.
- Smaller control: an existing doc, ADR, route, schema link, test, or review prompt is not enough.
- Validation: there is a source, check, fixture, owner review, or manual audit that can prove the assumption.
- Retirement: there is a signal for deleting, weakening, superseding, or revisiting the contract.

Reject the contract when the dependency is hypothetical, the source is fully local, the file would mostly restate public docs, or the contract cannot name a validation signal.

## Data Contract

Use for external data systems, APIs, event streams, model outputs, shared datasets, generated schemas, or files whose semantics are not fully owned by this repo.

```markdown
# <Domain Or Source> Data Contract

Status: active | draft | deprecated | superseded
Owner:
Source of truth:
Last reviewed:
Review after:
Supersedes:
Superseded by:

## When To Read

Open this before changing code, SQL, prompts, tests, or docs that rely on <source/domain>.

## Semantics This Repo Relies On

- <field/event/API/model-output meaning that is not obvious from names alone>
- <enum, join, filter, freshness, retention, or unit assumption>

## Validation

- Inspect:
- Test/check:
- Fallback when unavailable:

## Known Pitfalls

- <common wrong assumption or risky shortcut>

## Retirement

Revisit or retire when <source moves, generated schema covers the risk, dependency disappears, or assumption changes>.
```

## Repo Contract

Use for another repository, package, service, generated artifact, deployment pipeline, model, or upstream interface that owns behavior this repo relies on.

```markdown
# <Repo Or System> Contract

Status: active | draft | deprecated | superseded
Owner:
Source of truth:
Last reviewed:
Review after:
Supersedes:
Superseded by:

## When To Read

Open this before changing code, docs, tests, or automation that depends on <repo/system>.

## Assumptions This Repo Relies On

- <owned behavior, interface, artifact, deployment rule, or compatibility assumption>
- <what this repo must not reimplement or silently fork>

## Validation

- Inspect:
- Test/check:
- Owner/review signal:

## Known Pitfalls

- <common duplication, stale-copy, or source-of-truth mistake>

## Retirement

Revisit or retire when <dependency is removed, interface moves local, upstream changes, or a generated contract replaces the hand-written one>.
```
