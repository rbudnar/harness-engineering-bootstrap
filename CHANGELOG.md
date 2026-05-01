# Changelog

## V4

- Added optional `llms.txt` / `llms-full.txt` context maps for URL-first or remote-agent bootstrapping.
- Added resolver MECE guidance so skill, task, and decision routes avoid accidental overlap and obvious gaps.
- Added a harnessify / workflow-to-control path for turning repeated friction into the smallest durable control.
- Added optional agent-readable health report guidance over validators and metrics.
- Clarified that implemented repositories should document exact runnable quality-gate commands, not template wildcards.
- Split required metrics into a minimal local baseline, with GitHub/PR metrics and scheduled trend reports as triggered modules.
- Made the review harness canonical in docs, with `.github/copilot-instructions.md` as an optional Copilot adapter.
- Strengthened URL-map privacy and freshness guidance.
- Narrowed docs-update rules to avoid low-value documentation churn.

## V3

- Added guide/sensor and computational/inferential control taxonomy.
- Added compact harness-control inventory guidance for mature or high-churn repositories.
- Tightened decision-index and decision-router guidance once decision memory grows.
- Added task contracts for long-running, multi-agent, or handoff-heavy work.
- Expanded PR observation capture and harness metrics around missed guides, missed sensors, and missed decision routes.
- Added retirement and ablation guidance so harness controls do not become permanent stale ceremony.

## V2

- Established the core bootstrap structure: thin agent entry points, task-routed docs, decision memory, deterministic gates, provider-memory precedence, harness validation, metrics, and human review guidance.
- Added triggered modules for data contracts, repo contracts, references, path-scoped instructions, feedback logs, and harness regression evals.