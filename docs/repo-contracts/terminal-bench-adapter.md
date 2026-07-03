---
status: active
owner: HEB maintainers
source_of_truth: Terminal-Bench site, Harbor docs, Terminal-Bench repo, and the installed `terminal-bench` CLI
last_reviewed: 2026-07-03
review_after: 2026-10-03
provenance: Added for issue #70 Terminal-Bench comparison spike
---

# Terminal-Bench Adapter Repo Contract

## When To Read

Open this before changing code, docs, tests, or reports that run Terminal-Bench, compare HEB against Terminal-Bench tasks, or interpret Terminal-Bench results.

Review this contract early if a PR adds a committed Terminal-Bench adapter, changes Terminal-Bench dataset versions, or reports public benchmark scores.

## Assumptions This Repo Relies On

- Terminal-Bench owns task definitions, Docker execution, agents, and scoring. HEB may wrap agent prompts, but it must not modify upstream tasks or scoring when claiming comparable Terminal-Bench results.
- Keep Terminal-Bench scores separate from the local HEB pilot table. The local pilot uses committed fixtures under `test/fixtures/benchmark-runner/source-repo`; it is not a public benchmark import.
- The #70 smoke used the installed legacy/beta package lane where `terminal-bench run` is the executable command shape and `terminal-bench-core==0.1.1` is the pinned dataset. Treat that as spike evidence only, not as the default public comparison route.
- For public or reportable Terminal-Bench 2.x comparisons, use Harbor, the current official harness named by Terminal-Bench docs, and pin the Harbor dataset such as `terminal-bench/terminal-bench-2` or `terminal-bench/terminal-bench-2-1`.
- Record the native harness command, Harbor or `terminal-bench` package version, dataset id, task subset, and any divergence from the current public leaderboard rules. Do not use moving dataset heads for reportable comparisons.
- Prefer WSL or Linux for Terminal-Bench runs from this Windows workstation. Windows-native runs can fail from console encoding, Unix-tool, Git line-ending, and Docker path-separator assumptions.
- HEB/no-HEB comparisons should keep the model, task ids, attempts, timeouts, dataset version, and run order fixed. In the legacy package lane, guidance can be injected through `--agent-kwarg prompt_template=<path>` or a custom agent wrapper; in the Harbor lane, verify and use Harbor's current agent or custom-agent mechanism instead of assuming the legacy prompt-template flag transfers.

## Validation

- Inspect: https://github.com/harbor-framework/terminal-bench, https://www.tbench.ai/, https://www.tbench.ai/docs/run-terminal-bench-2-0, and https://www.tbench.ai/docs/run-terminal-bench-2-1.
- Current public-lane smoke shape: `harbor run -d terminal-bench/terminal-bench-2 -a oracle -l 5` or `harbor run -d terminal-bench/terminal-bench-2-1 -a oracle -l 5`, depending on the target benchmark version.
- Inspect locally: `uv tool run terminal-bench --help`, `uv tool run terminal-bench run --help`, and `uv tool run terminal-bench datasets list`.
- Legacy package smoke check: from WSL, `terminal-bench-core==0.1.1` ran one selected task, `swe-bench-langcodes`; `oracle` resolved 1/1 and `nop` resolved 0/1.
- Windows-native blocker check: the same package exposed code-page, missing Unix `rm`, CRLF shell script, and Docker `\tmp` path failures before WSL succeeded.

## Known Pitfalls

- Do not mix Terminal-Bench leaderboard or task-subset scores with local HEB pilot results.
- Do not report `oracle` or `nop` smoke checks as HEB/no-HEB model-agent performance.
- Do not route public/reportable Terminal-Bench 2.x comparisons through `terminal-bench-core==0.1.1` or `terminal-bench run`; use Harbor unless the report explicitly scopes itself to the legacy package lane.
- On Windows, set UTF-8 output before listing datasets or Rich output can fail on checkmark characters.
- If running natively on Windows, make Unix tools available and force Git checkout/download behavior to preserve LF scripts, but prefer WSL/Linux because Docker path handling can still fail.
- Do not use `terminal-bench-core` without a version when the goal is a comparable legacy-package report.

## Retirement

Retire or supersede this contract when Terminal-Bench provides a stable generated integration contract that covers CLI, dataset, Docker, and scoring semantics, or when this repo stops using Terminal-Bench as an external benchmark lane.
