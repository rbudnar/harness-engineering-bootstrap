# Changelog

Released HEB sections use `## vX.Y.Z - YYYY-MM-DD`; see `docs/releases.md` for the full release-note contract.

## Unreleased

### Summary

- Aligned HEB with the public `AGENTS.md` and Agent Skills `SKILL.md` standards while keeping optional skills trigger-gated.
- Clarified the README front door so first-time downstream users can run the read-only bootstrap planner without hunting through repo-internal dogfooding notes.
- Added private package metadata, npm publish guards, and a `harness-bootstrap` bin so the read-only planner can run from a checkout or GitHub package spec without publishing to npm.
- Added `harness-bootstrap init` as a dry-run first-time bootstrap command while keeping `--write` explicitly unsupported.
- Updated the MCP specification reference to the current dated version (2025-11-25).

### Template Changes

- Documented HEB as a governance layer over `AGENTS.md`, with optional procedural capabilities packaged as Agent Skills-standard `SKILL.md` directories only when smaller controls are insufficient.
- Added a Getting Started section with requirements, clone/run commands, Windows usage, output sections to review, and the update-mode command.

### Planner And Metadata

- Added template-fitness validation for repo-local `SKILL.md` packages so future repository skills use valid standard frontmatter.
- Added package metadata validation, release-preparation version sync, and release-workflow staging for `package.json`.

### Migration

### Validation

- `node --test scripts/harness-bootstrap-plan.test.mjs`
- `node --test scripts/package-entrypoint.test.mjs`
- `node --test scripts/prepare-stable-release.test.mjs`
- `node scripts/template-fitness.mjs`
- `node scripts/harness-bootstrap-plan.mjs --repo .`

### Rollback

## v0.1.0 - 2026-05-30

### Summary

- Initial versioned HEB release for bootstrapping thin, task-routed agent harnesses and testing version-aware updates in consuming repositories.
- Defines the release policy needed before treating `--target-version` as a public update contract.
- Adds automated stable GitHub Releases for merged PRs with explicit release labels.
- Clarifies release-note classification and generated changelog formatting after PR review.

### Template Changes

- Added durable plan lifecycle guidance for active plan artifacts, execution preflight, single-agent phase separation, explicit rejection of untriggered modules, and progress-log handoff.
- Added implementation-time decision-surface and defect-family guidance so repeated same-class review findings become modeled fixes with regression matrices instead of point patches.
- Added `docs/releases.md` as the source for HEB versioning, tag format, release-note format, accepted metadata fields, and rollback expectations.
- Added `deferred` to the release-note classification outcomes consuming repositories can record during update planning.
- Documented stable release labels and ruleset bypass expectations so release automation stays intentional.
- Clarified that `release:current` is exceptional bootstrap/recovery/admin machinery; normal ongoing stable releases use `release:patch` or `release:minor`.

### Planner And Metadata

- Added a read-only bootstrap planner CLI with markdown and JSON output, fixture tests, and CI coverage so agents can produce review-ready harness setup plans before writing target-repo files.
- Added update-mode planning, template version metadata, rollback guidance, and a `VERSION` fitness check so already-bootstrapped repositories can move between template releases without manual chat relay.
- Aligned planner update output with the release policy by naming `docs/releases.md`, `v<VERSION>` tags, and the accepted metadata fields.
- Added a release-preparation helper that promotes `CHANGELOG.md` release notes, bumps `VERSION` for patch/minor releases, and emits GitHub Release notes.
- Preserved a blank line after generated release headings so patch and minor release sections match the documented changelog shape.
- Added a guard that blocks `release:current` when `CHANGELOG.md` still has pending `## Unreleased` notes.
- Used a trusted merged-PR trigger for stable releases so fork-origin PRs can release after merge without checking out unmerged fork code.
- Let release reruns recover a missing GitHub Release from an existing reachable tag after `main` has advanced.
- Refuse to guess release semantics when `main` advances before the expected release tag exists.

### Migration

- First-time consumers can run the planner in bootstrap mode and record accepted metadata after validation.
- Already-bootstrapped consumers should run update mode with `--target-version v0.1.0`, classify each release-note item, and record accepted, rejected, deferred, validation, and rollback metadata only after validation passes.
- Use `release:current` to publish the current `VERSION` without a bump, or `release:patch` / `release:minor` to create the next stable release after merge.

### Validation

- `node --test scripts/prepare-stable-release.test.mjs`
- `node --test scripts/harness-bootstrap-plan.test.mjs`
- `node scripts/template-fitness.mjs`
- `node scripts/harness-bootstrap-plan.mjs --repo .`
- `node scripts/harness-bootstrap-plan.mjs --repo . --mode update --target-version v0.1.0`

### Rollback

- Before publishing a tag, abandon the release branch and leave `VERSION` plus metadata unchanged.
- Delete a generated GitHub Release and tag, then revert the release commit when a patch or minor release created one.
- After a consuming repo accepts the release, roll back by reverting the update PR, restoring previous `docs/harness-version.json` or `.harness/harness-version.json`, rerunning validation, and recording the rollback note.

## Pre-release History

## 2026-05-25

- Clarified agent-runtime safety guidance: high-impact tool actions should use deterministic pre-action authorization or explicit confirmation outside model judgment, fail closed when policy context is missing, and audit allow/deny decisions.

## 2026-05-24

- Added `scripts/scout-ledger-index.mjs` to build a compact dedupe index for the scout JSONL ledger, reducing re-review and attention dilution as the ledger grows.

## 2026-05-23

- Improved OTel routing in agent-runtime guidance: prefer GenAI semantic conventions (`gen_ai.*`) and document emitted semconv version and stability opt-in decisions.

## 2026-05-22

- Clarified MCP safety guidance: treat MCP server capability/scope broadening as an execution-surface change requiring re-approval, not only launch/config changes.

## 2026-05-21

- Clarified agent-runtime safety guidance for MCP: when STDIO servers are launched from local config, treat config and server registration/install changes as execution-surface changes and require allowlists/sandboxing where practical.

## 2026-05-20

- Clarified the dogfooding automation loop: accepted candidates may produce a `codex/` PR after proposal-gate validation, run the shipping process, and notify when ready for human review.
- Required template rule changes to update this repo's dogfooding contract or validator in the same PR when the new rule changes the template's own best practices.
- Added a dogfooding harness for this template repo: thin `AGENTS.md`, `docs/dogfooding.md`, and a `node scripts/template-fitness.mjs` anti-bloat gate.
- Added thin Claude, Gemini, and Copilot adapters that route back to `AGENTS.md` instead of duplicating repository instructions.
- Clarified scout-digest intake: split multi-recommendation reports into one sourced proposal per recommendation before running the gate.
- Documented the daily automation contract: generate sourced proposal files outside the repo, run the fitness gate, and report accepted, rejected, corrected, and skipped items separately.
- Added GitHub Actions coverage for the template fitness check so automation PRs get a deterministic context-bloat signal.

## 2026-05-19

- Added semantic-scope guidance for broad migrations: handoff claims must be verified, user-visible payoff must be stated, scope-thrash gets PR markers, and adversarial review is not treated as semantic validation.
- Tightened optional-module admission criteria and added explicit self-correction rules for missed ADRs, stale context, wrong commands, missing guides/sensors, and repeated agent mistakes.

## 2026-05-18

- Added layer-map, progressive-disclosure, OTel/MCP, fault-injection, adversarial-validation, code-search-adapter, and decision-observability guidance as triggered additions.
- Added triggered guidance for behavioral drift anchors, source-traced evidence packs, evaluation adapters, programmatic state surfaces, control priority layers, and multi-agent handoff patterns.
- Added triggered agent-runtime safety guidance and replaceability review triggers for capability-era harness scaffolding.

## 2026-05-01

### Implementation refinements

- Clarified implementation guidance for internal data stores, health-report advisory exits, harnessify split-out, skill creation gates, MECE promotion, ADR filename conventions, and decision-file redirect shims.
- Tightened ADR routing guidance so large decision files require an authoritative compact index, with split ADR files as the default at threshold unless a temporary accepted gap is recorded.

### Context maps and review harness

- Added optional `llms.txt` / `llms-full.txt` context maps for URL-first or remote-agent bootstrapping.
- Added resolver MECE guidance so skill, task, and decision routes avoid accidental overlap and obvious gaps.
- Added a harnessify / workflow-to-control path for turning repeated friction into the smallest durable control.
- Added optional agent-readable health report guidance over validators and metrics.
- Clarified that implemented repositories should document exact runnable quality-gate commands, not template wildcards.
- Split required metrics into a minimal local baseline, with GitHub/PR metrics and scheduled trend reports as triggered modules.
- Made the review harness canonical in docs, with `.github/copilot-instructions.md` as an optional Copilot adapter.
- Strengthened URL-map privacy and freshness guidance.
- Narrowed docs-update rules to avoid low-value documentation churn.

### Control taxonomy and metrics

- Added guide/sensor and computational/inferential control taxonomy.
- Added compact harness-control inventory guidance for mature or high-churn repositories.
- Tightened decision-index and decision-router guidance once decision memory grows.
- Added task contracts for long-running, multi-agent, or handoff-heavy work.
- Expanded PR observation capture and harness metrics around missed guides, missed sensors, and missed decision routes.
- Added retirement and ablation guidance so harness controls do not become permanent stale ceremony.

### Initial bootstrap structure

- Established the core bootstrap structure: thin agent entry points, task-routed docs, decision memory, deterministic gates, provider-memory precedence, harness validation, metrics, and human review guidance.
- Added triggered modules for data contracts, repo contracts, references, path-scoped instructions, feedback logs, and harness regression evals.
