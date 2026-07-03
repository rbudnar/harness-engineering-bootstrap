---
status: active
owner: HEB maintainers
source_of_truth: Terminal-Bench repo, Terminal-Bench site, and the installed `terminal-bench` CLI
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
- In the current package, `terminal-bench run` is the executable command shape observed locally. Upstream docs may also refer to the CLI as `tb`.
- Use a pinned dataset name and version such as `terminal-bench-core==0.1.1`; do not use a moving dataset head for reportable comparisons.
- Prefer WSL or Linux for Terminal-Bench runs from this Windows workstation. Windows-native runs can fail from console encoding, Unix-tool, Git line-ending, and Docker path-separator assumptions.
- HEB/no-HEB comparisons should inject guidance through `--agent-kwarg prompt_template=<path>` or a custom agent wrapper while keeping the model, task ids, attempts, timeouts, dataset version, and run order fixed.

## Validation

- Inspect: https://github.com/harbor-framework/terminal-bench and https://www.tbench.ai/
- Inspect locally: `uv tool run terminal-bench --help`, `uv tool run terminal-bench run --help`, and `uv tool run terminal-bench datasets list`.
- Smoke check: from WSL, `terminal-bench-core==0.1.1` ran one selected task, `swe-bench-langcodes`; `oracle` resolved 1/1 and `nop` resolved 0/1.
- Windows-native blocker check: the same package exposed code-page, missing Unix `rm`, CRLF shell script, and Docker `\tmp` path failures before WSL succeeded.

## Known Pitfalls

- Do not mix Terminal-Bench leaderboard or task-subset scores with local HEB pilot results.
- Do not report `oracle` or `nop` smoke checks as HEB/no-HEB model-agent performance.
- On Windows, set UTF-8 output before listing datasets or Rich output can fail on checkmark characters.
- If running natively on Windows, make Unix tools available and force Git checkout/download behavior to preserve LF scripts, but prefer WSL/Linux because Docker path handling can still fail.
- Do not use `terminal-bench-core` without a version when the goal is a comparable report.

## Retirement

Retire or supersede this contract when Terminal-Bench provides a stable generated integration contract that covers CLI, dataset, Docker, and scoring semantics, or when this repo stops using Terminal-Bench as an external benchmark lane.
