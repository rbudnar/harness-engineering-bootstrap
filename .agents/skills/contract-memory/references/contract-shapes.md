# Contract Shapes

Use these shapes when a data or repo contract is already triggered. Omit fields that do not carry real information, but keep provenance, validation, and retirement/review signals visible.

## Admission Check

- Trigger evidence: external semantics or cross-repo assumptions already affect correctness.
- Smaller control: an existing doc, ADR, route, schema link, test, or review prompt is not enough.
- Validation: there is a source, check, fixture, owner review, or manual audit that can prove the assumption.
- Retirement: there is a signal for deleting, weakening, superseding, or revisiting the contract.

Reject the contract when the dependency is hypothetical, the source is fully local, the file would mostly restate public docs, or the contract cannot name a validation signal.

The examples below are fictional shape examples. Do not add them to a repo unless the trigger is real in that repo, and replace every fictional source with an inspected source of truth.

## Data Contract

Use for external data systems, APIs, event streams, model outputs, shared datasets, generated schemas, or files whose semantics are not fully owned by this repo.

### Compact Example

Admission:

- Trigger evidence: a service consumes an external billing `invoice.updated` event and a previous change confused `finalized` with `paid`.
- Smaller control: a README link to provider docs did not put event timing and retry semantics near the webhook handler.
- Validation: replay one captured fixture or contract-test payload and compare the fields against the provider's current event docs.
- Retirement: delete or supersede when generated event schemas plus tests cover the semantic assumptions.

```markdown
# Billing Invoice Event Data Contract

Status: active
Owner: Payments
Source of truth: Billing provider event docs and captured fixture `invoice-updated-paid.json`
Last reviewed: <date inspected>
Review after: <date or release trigger>

## When To Read

Open before changing invoice webhook parsing, retry logic, payment-state tests, or docs.

## Semantics This Repo Relies On

- `status=paid` means funds are captured; `status=finalized` only means the invoice can be collected.
- Event timestamps are provider UTC seconds; convert once at the boundary.

## Validation

- Inspect: provider event docs for `invoice.updated`
- Test/check: webhook fixture replay covers the finalized-to-paid transition.

## Known Pitfalls

- Do not trigger fulfillment from `finalized`.

## Retirement

Revisit when generated provider schemas or webhook contract tests cover these assumptions.
```

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

### Compact Example

Admission:

- Trigger evidence: this repo consumes generated design tokens from another repository, and a prior change copied token values locally.
- Smaller control: an ADR link did not stop agents from hard-coding upstream color values during UI fixes.
- Validation: compare the consumed generated artifact against the upstream release and run the token import test.
- Retirement: delete or supersede when the generated package plus tests make local assumptions unnecessary.

```markdown
# Design System Token Repo Contract

Status: active
Owner: Frontend Platform
Source of truth: Design-system repo release notes and generated `tokens.css`
Last reviewed: <date inspected>
Review after: <next design-system major version>

## When To Read

Open before changing theme imports, token aliases, UI color tests, or local overrides.

## Assumptions This Repo Relies On

- This repo consumes generated CSS variables, not the design-system source token JSON.
- `--color-danger` is the semantic danger token; do not copy or pin the upstream hex value locally.

## Validation

- Inspect: upstream release notes and generated `tokens.css`
- Test/check: token import snapshot or equivalent visual-regression check
- Owner/review signal: design-system owner approves breaking token changes.

## Known Pitfalls

- Do not treat copied hex values as the source of truth.

## Retirement

Revisit when the dependency is removed or a generated contract package replaces this handwritten note.
```

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
