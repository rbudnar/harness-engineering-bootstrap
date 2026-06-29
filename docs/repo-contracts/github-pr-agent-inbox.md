---
status: active
owner: HEB maintainers
source_of_truth: GitHub Actions, REST, GraphQL, and branch-protection docs checked 2026-06-27
last_reviewed: 2026-06-27
review_after: 2026-09-27
provenance: Added with PR Agent Inbox dogfooding workflow
---

# GitHub PR Agent Inbox

Read this before changing `.github/workflows/pr-agent-inbox.yml`, `scripts/pr-agent-inbox.mjs`, or PR-readiness dogfooding rules.

## Contract

- The durable required-check candidate is the PR-head commit status named `agent-inbox-clean`; the PR-attached workflow also fails while the normalized inbox is not clean.
- The script owns the portable state model: `clean`, `agentAttention`, `statusState`, item list, sticky comment marker, `agent-inbox-clean` status, and `agent-attention` label.
- The `agent-inbox-clean` status is append-only on GitHub; skip publishing when the latest status for the same head SHA and context already has the same state and description.
- Review-thread state comes from GraphQL `PullRequest.reviewThreads`; unresolved threads block even when GitHub marks them outdated.
- Body-only requested changes come from `reviewDecision` and review lists; they block even without inline review threads.
- When multiple owned sticky reports exist, update the newest one so stale duplicates do not become the durable inbox.
- Native GitHub branch protection remains authoritative for required reviews and required conversation resolution; the inbox reports those gates but does not replace them.
- Scheduled and manual full-repo sweeps share a stable concurrency group so overlapping sweeps cancel instead of racing comment/status writes.
- Failed required checks block. Pending required checks are allowed in the workflow to avoid self-deadlock and are caught by later PR events, `/agent-inbox refresh`, or the scheduled sweep.
- `UNSTABLE`, `BLOCKED`, and `HAS_HOOKS` merge states are not blocking by themselves; structured review-thread, review-decision, draft, merge-conflict, branch-behind, and required-check classification decide whether inbox items exist.
- Same-repo `BEHIND` merge state is agent-actionable merge-readiness work because the branch needs an update before it can merge.
- Read and paginate effective branch rules after a classic branch-protection 404 because this repo may be protected by rulesets. Only branches with no classic protection and no effective rules are explicitly unprotected; failed optional checks do not block there. When protection metadata is unavailable to the workflow token, treat failed non-inbox checks as potentially required instead of reporting clean.
- The sticky PR comment must include `<!-- agent-inbox:v1 -->` so any agent can find the current report without provider-specific state.

## Validation

- `node --test scripts/pr-agent-inbox.test.mjs`
- `node --test scripts/weekly-harness-report.test.mjs`
- `node scripts/template-fitness.mjs`
- `node scripts/harness-doctor.mjs`

## Known Edges

- GitHub has a `pull_request_review_thread` webhook event, but it is not a GitHub Actions workflow trigger in the checked Actions docs. Thread resolution may therefore need `/agent-inbox refresh` or the scheduled sweep to turn the `agent-inbox-clean` status green quickly.
- The PR that introduces this workflow checks out base-owned code under `pull_request_target`; if the base ref does not yet contain `scripts/pr-agent-inbox.mjs`, the workflow must pass with a bootstrap notice instead of running PR-head code.
- Fork PRs must run repository-owned code only. Keep `pull_request_target` checkouts pinned to the base commit unless a later contract explicitly proves a safe alternative.
- Fork PR review/comment events may have read-only tokens. Skip write-backed review-event refreshes for forks and rely on `pull_request_target`, `/agent-inbox refresh`, or scheduled refresh to publish the PR-head status.

## Revisit

Revisit this contract if GitHub Actions adds a first-class review-thread trigger, if branch-protection APIs change required-check shape, or if the inbox has two false positives or two missed actionable review states in one month.
