# Dogfooding the Template

This repository dogfoods the Harness Engineering Bootstrap template as an anti-bloat control. Success means the template stays useful under repeated improvement pressure without teaching consuming repos to build fat harnesses.

## Always-on Context

- `AGENTS.md` is the only required always-on agent file.
- Provider-specific always-on or path/glob adapters, if added, must be short redirects back to `AGENTS.md` and should exist only when native `AGENTS.md` loading is insufficient for that provider surface.
- Current provider adapters are `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md`; no Cursor/Windsurf path adapters are present.
- Do not put template phases, bootstrap checklists, reference lists, or optional-module details in always-on files.
- Repo-local skills are pulled context under the [Agent Skills specification](https://agentskills.io/specification), not always-on guidance; current skill: `.agents/skills/contract-memory/SKILL.md` for contract-memory work.
- Default budget: `AGENTS.md` up to 80 lines, each provider adapter up to 40 lines, total always-on guidance up to 160 lines.

## Suggestion Admission

Daily automation suggestions must classify themselves as exactly one of:

- Reduce context
- Improve routing
- Add mechanical enforcement
- Clarify trigger/retirement criteria
- Reject as bloat

Accepted suggestions must provide:

- Evidence: the current repo fact, repeated miss, token-cost problem, safety risk, or ambiguity being addressed.
- Smaller control: why a smaller doc edit, route update, marker, or existing check is not enough.
- Validation: the check, metric, marker, or review step that can show whether the change helped.
- Retirement or revisit: when the guidance should be weakened, deleted, or reconsidered.
- Prediction: what outcome should improve and what evidence would show the edit failed.

Rejection is a useful outcome. A suggestion that only makes the template more complete, more fashionable, or more defensive without reducing context cost or preventing a real miss should be rejected and may be marked `harness:token-bloat`.

## Proposal File Shape

Scout digests with multiple recommendations are evidence, not proposal files. Split them into one proposal file per recommendation before running the gate.

Evidence must distinguish local repo evidence from external source claims. Verify date-sensitive or product-specific claims against the primary source before accepting a suggestion, and record corrections in `## Evidence`.

The daily automation should evaluate first, write proposal files outside the repo, run `node scripts/template-fitness.mjs --suggestion <proposal-file>` for each one, and return a digest that separates accepted candidates, rejected-as-bloat candidates, source corrections, and skipped duplicates.

## Dedupe Index (Attention Dilution Guard)

As the scout ledger grows, avoid “attention dilution” by making dedupe mechanical instead of re-reading the middle of the already-reviewed list.

- Maintain the ledger outside the repo as JSONL (append-only).
- Optional helper: build a compact index outside the repo from that ledger before doing expensive reading or proposal work:

```bash
node scripts/scout-ledger-index.mjs --ledger <path/to/ledger.jsonl>
```

This replaces a `.jsonl` suffix with `.index.json` (for example, `ledger.index.json`) next to the ledger and is designed to support O(1) “have we reviewed this key/URL?” checks without scanning the full JSONL file.

## Automated PR Loop

The automation may open a repository PR only after a suggestion passes the proposal gate and has a small, evidence-backed implementation path. The PR must remain human-reviewed before merge.

When automation opens a PR, it must:

- Start from current `main` and use a short-lived `codex/<slug>` branch.
- Apply only accepted candidates that share one coherent template outcome; split unrelated accepted candidates into later runs or separate PRs.
- Update the template and the dogfooding harness together when a new template rule changes this repo's own best-practice contract. Template rule changes must keep this dogfooding harness current in the same PR.
- Prefer the smallest route, wording, or validator change that satisfies the proposal. Do not install a new optional module by default.
- Add a repo-local skill only after the skill-creation gate passes, and keep its `SKILL.md` frontmatter valid so `template-fitness` can check it mechanically.
- Keep automation authority limited to branch, PR, issue, comment, and label operations unless a proposal documents deterministic pre-action authorization or explicit human confirmation for broader writes.
- Run `node scripts/template-fitness.mjs` and the suggestion gate for every accepted proposal file.
- Run the PR readiness checklist: `node scripts/template-fitness.mjs`, plain `codex review --base origin/main` when Codex CLI is available, GitHub `template-fitness` checks, replies/resolutions for review threads, and a concise PR summary comment.
- Notify with the PR URL, proposal paths, validation results, review status, and any rejected or skipped candidates.

Use these headings when automation writes a suggestion file:

```markdown
# <short suggestion title>

## Classification

<one allowed classification>

## Evidence

## Smaller Control

## Validation

## Retirement

## Prediction
```

`## Prediction` is required for accepted suggestions. It may be omitted when the classification is `Reject as bloat`.

## Quality Gate

```bash
node scripts/template-fitness.mjs
```

CI runs `node scripts/harness-doctor.mjs` as a warning-mode rot audit so humans do not have to remember it. Run it locally for fast feedback when changing durable memory, routes, contracts, or references.
Weekly reporting runs `.github/workflows/weekly-harness-report.yml`, comments on the standing "Weekly Harness Report" issue for notification, uploads artifacts, and creates or updates "Harness problems detected by weekly report" before failing when checks fail or doctor warnings appear. PR readiness runs `.github/workflows/pr-agent-inbox.yml`, keeps a sticky "PR Agent Inbox" comment current, and publishes `agent-inbox-clean` while the normalized inbox is not clean.
To validate a proposal file from automation, run:

```bash
node scripts/template-fitness.mjs --suggestion path/to/suggestion.md
```

The gate checks always-on size, anti-bloat anchors, the tightened main-template growth budget, checklist size, triggered-module count, and suggestion admission fields.

## Bootstrap Planner Dogfood

Planner, update-mode, and release-policy changes must stay read-only until a separate accepted issue authorizes writes:
```bash
node --test scripts/harness-bootstrap-plan.test.mjs
node scripts/harness-bootstrap-plan.mjs --repo .
```
Output must keep required core, triggered modules, rejected modules, activation assumptions, smaller-control rationale, validation steps, open questions, phase handoff rules, and any closeout/resume state visible enough for a fresh reviewer to challenge without manual chat relay.

## Review Posture

Treat every template addition as guilty until it proves it improves right-context-at-right-time behavior. Prefer deleting, tightening, or routing existing guidance before adding a new section. If review finds repeated issues in one defect family, the next change must name the missing model and add or update a regression matrix instead of point-fixing examples.
