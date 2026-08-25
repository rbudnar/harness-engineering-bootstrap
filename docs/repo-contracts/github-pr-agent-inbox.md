---
status: active
owner: HEB maintainers
source_of_truth: GitHub Actions, REST, GraphQL, and branch-protection docs checked 2026-08-25
last_reviewed: 2026-08-25
review_after: 2026-11-25
provenance: Event-driven Agent Inbox dogfooding contract
---

# GitHub PR Agent Inbox

Read this before changing either Inbox workflow, `scripts/pr-agent-inbox.mjs`, or PR-readiness dogfooding rules.

## Contract

- `agent-inbox-clean` is a PR-head commit status for agent actionability, not total mergeability. It succeeds for clean or human-only waiting state and fails only when agents can act. Native GitHub review, conversation, and required-check gates remain authoritative.
- The sticky comment uses `<!-- agent-inbox:v1 -->`; unresolved GraphQL review threads, active requested-changes reviews, draft state, merge conflicts, branch-behind state, and required checks feed the portable state model.
- The Inbox has no polling schedule. Direct base-owned PR lifecycle events, an exact authorized `/agent-inbox refresh`, an exact PR or bounded open-PR manual dispatch, successful `PR Agent Inbox Signal` completions, and completed `Template Fitness` runs (regardless of conclusion) are its only wakeups.
- Review and review-comment events enter only through `.github/workflows/pr-agent-inbox-signal.yml`. That workflow is a GitHub-hosted, one-minute, zero-permission no-op: no checkout, artifact, cache, secret, event interpolation, or PR code execution. The publisher consumes no upstream data or code; it treats the completion only as a wakeup and rereads current GitHub API state.
- `workflow_run` admission binds the payload to the current active canonical workflow ID and path, not its mutable name. `Template Fitness` additionally binds its sealed live workflow ID. The signal title must exactly anchor the PR number.
- Both workflows use `ubuntu-latest`. This public personal-account repository must not use a persistent self-hosted runner for Inbox work.
- The resolver checks out only the exact route-time default-branch OID with credentials disabled. After the per-PR queue, the publisher requires exact route-time versus current default-branch name/OID equality, revalidates the event and current open PR, and again executes only that base-owned OID. It never checks out or executes PR-head content.
- Resolution and publication are separate phases with least job permissions. Publication writes `pending` on the freshly observed head before comment or label mutation, performs a bounded stable current-state reread, then updates the comment/label and writes the final status. Non-convergence leaves the durable status pending and fails closed.
- Check suppression is an exact canonical workflow/job pair. `PR Agent Inbox / agent-inbox` and `PR Agent Inbox Signal / signal` are ignored; the same job under another workflow, or another job under the same workflow, remains observable. The scalar `agent-inbox-clean` commit status is ignored separately.
- Every target shares `pr-agent-inbox-pr-<number>` concurrency with `cancel-in-progress: false`. GitHub may have A running and B pending when C arriving replaces B. This is safe because B carries no unique data, and C performs a post-queue current-state reread that subsumes both wakeups.
- Manual empty-input recovery enumerates at most 100 open PRs, includes drafts, deduplicates targets, and fails closed above the bound. Empty workflow-run PR associations use a bounded commit-to-open-PR fallback that also retains drafts.
- Comment and label failures are warnings so the normalized result remains visible. Failure to publish the durable status is fatal. Trusted sticky-comment selection prevents an untrusted marker spoof from creating or capturing the report.

## Fork and recovery semantics

GitHub may suppress, delay, require approval for, fail, or cancel a public-fork signal run. The Inbox therefore does not promise immediate review-event convergence when a signal does not successfully complete. Native GitHub review gates remain authoritative during that interval. An exact authorized `/agent-inbox refresh`, PR-specific manual dispatch, bounded manual recovery, or the next admitted event rereads and republishes current state. There is no webhook daemon, new service, secret, or scheduled fallback.

GitHub Actions has no immutable base-owned `pull_request_review_thread` trigger. Thread-resolution convergence has the same bounded recovery paths.

## Validation

- `node --test scripts/pr-agent-inbox.test.mjs scripts/pr-agent-inbox-event-driven-contract.test.mjs`
- `node scripts/template-fitness.mjs`
- `node scripts/harness-doctor.mjs`
- Manual dispatch against a real open PR after the workflows are present on the default branch

## Lift-and-shift

Copy both workflows, the Inbox script and both Inbox test files. Then replace the canonical producer paths/IDs, required check names, permissions, and repo-local fitness ownership with live evidence from the target repository. Keep the publisher base-owned and treat an unmerged PR as preparation only; workflow activation occurs only after an explicitly authorized merge.

## Revisit

Revisit if GitHub adds a first-class base-owned review-thread trigger, changes fork workflow approval semantics, changes required-check API shape, or the Inbox has two false positives or two missed actionable states in one month.
