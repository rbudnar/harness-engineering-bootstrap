# Changelog

Dates reflect repository history, not formal package releases.

## 2026-05-23

- Improved OTel routing in agent-runtime guidance: prefer GenAI semantic conventions (`gen_ai.*`) and document stability opt-in decisions.

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
