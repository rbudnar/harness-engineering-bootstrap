# HEB Benchmark Comparison Spike

Issue: #70
Date: 2026-07-03

## Scope

This report compares the current HEB local benchmark evidence with a tiny Terminal-Bench adapter spike. It is not a full public leaderboard run and it does not claim that HEB improves agents globally.

The comparison has two separate lanes:

- Local HEB lane: validated the existing HEB pilot rows for `no-added-guidance` versus `heb-planned-core`.
- Terminal-Bench lane: proved a one-task legacy-package Terminal-Bench smoke in WSL, then recorded the Harbor route needed for any future public/reportable Terminal-Bench 2.x comparison.

## Local HEB Lane

Commands:

```bash
node scripts/benchmark-runner.mjs validate --manifest test/fixtures/benchmark-pilot-2026-07/tasks.json
node scripts/benchmark-runner.mjs validate-results --manifest test/fixtures/benchmark-pilot-2026-07/tasks.json --out test/fixtures/benchmark-pilot-2026-07/results.jsonl --artifacts-dir test/fixtures/benchmark-pilot-2026-07
node scripts/benchmark-summary.mjs --results test/fixtures/benchmark-pilot-2026-07/results.jsonl
```

Results:

- Manifest validation: valid, 10 tasks.
- Result validation: 24 rows.

First-trial outcomes:

| Variant | Tasks | Success | First-pass green | Route hits | Stale hits | Median token estimate | Median wall time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `no-added-guidance` | 10 | 7/10 | 6/10 | 0/10 | 3 | 4,750 | 340s |
| `heb-planned-core` | 10 | 8/10 | 6/10 | 10/10 | 0 | 6,250 | 420s |

Repeated subset:

| Variant | Repeated trials | Success | Same-family stale recurrence |
| --- | ---: | ---: | ---: |
| `no-added-guidance` | 2 | 1/2 | 1/2 |
| `heb-planned-core` | 2 | 2/2 | 0/2 |

Interpretation stays unchanged from the pilot: this is directional local evidence only. HEB had one more first-trial success and better repeated-subset stale recurrence, but did not improve first-pass green and increased estimated token and wall-time cost.

## Terminal-Bench Lane

Canonical sources:

- Terminal-Bench repo: https://github.com/harbor-framework/terminal-bench
- Terminal-Bench site: https://www.tbench.ai/
- Current Terminal-Bench 2.0/2.1 run docs: https://www.tbench.ai/docs/run-terminal-bench-2-0 and https://www.tbench.ai/docs/run-terminal-bench-2-1

Current public-lane shape:

- Terminal-Bench 2.0 docs name Harbor as the official harness and use `harbor run -d terminal-bench/terminal-bench-2 -a oracle -l 5` for a smoke run.
- Terminal-Bench 2.1 docs run through Harbor with the `terminal-bench/terminal-bench-2-1` dataset.
- A future reportable Terminal-Bench comparison should use Harbor, pin the dataset, task subset, model, agent surface, attempts, timeouts, run order, and any divergence from leaderboard rules.

Observed legacy package shape:

- `uv tool run terminal-bench --help` exposes `run`, `tasks`, `datasets`, `runs`, and `cache`.
- `terminal-bench run --help` supports `--dataset`, `--dataset-path`, `--task-id`, `--n-tasks`, `--agent`, `--agent-import-path`, `--agent-kwarg`, `--n-attempts`, timeouts, and output paths.
- `terminal-bench datasets list` reports `terminal-bench-core==0.1.1` as compatible with the current package and `terminal-bench-core==0.1.0` as incompatible.
- In this environment, the executable entrypoint is `terminal-bench`; upstream docs may also refer to the CLI as `tb`. This was enough for a legacy-package smoke, not a current public benchmark lane.

Legacy package WSL smoke run:

```bash
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 uv tool run terminal-bench run \
  --dataset terminal-bench-core==0.1.1 \
  --n-tasks 1 \
  --agent oracle \
  --output-path /tmp/heb-terminal-bench-spike \
  --run-id heb-issue-70-oracle-wsl \
  --n-concurrent 1 \
  --n-attempts 1 \
  --global-agent-timeout-sec 60 \
  --global-test-timeout-sec 60 \
  --no-upload-results \
  --cleanup
```

Native Terminal-Bench selected `swe-bench-langcodes` for the one-task oracle run.

| Run | Dataset | Task | Agent | Resolved | Accuracy |
| --- | --- | --- | --- | ---: | ---: |
| `heb-issue-70-oracle-wsl` | `terminal-bench-core==0.1.1` | `swe-bench-langcodes` | `oracle` | 1/1 | 100% |
| `heb-issue-70-nop-wsl` | `terminal-bench-core==0.1.1` | `swe-bench-langcodes` | `nop` | 0/1 | 0% |

The `nop` run used the same task id and command shape, replacing `--agent oracle` with `--agent nop`. This is a harness sanity check, not a HEB/no-HEB comparison.

## Terminal-Bench Adapter Findings

Terminal-Bench is feasible as an external lane from WSL on this machine. It is not yet a committed HEB benchmark adapter.

The #70 smoke used the legacy package lane because that was the locally installable path available during the spike. Public or reportable Terminal-Bench 2.x comparisons should use Harbor instead of `terminal-bench-core==0.1.1`.

Windows-native blockers found during the spike:

- `terminal-bench datasets list` needs `PYTHONIOENCODING=utf-8` or `PYTHONUTF8=1`; otherwise Rich output with checkmarks can fail under Windows code page 1252.
- Dataset download invokes Unix `rm -rf .git`; plain Windows PATH did not provide `rm`. Temporarily prepending `C:\Program Files\Git\usr\bin` fixed that step.
- System Git has `core.autocrlf=true`, which converted downloaded shell scripts to CRLF and broke Linux Docker builds. The retry used child-process Git config `core.autocrlf=false` and cleared the Terminal-Bench dataset cache.
- After the line-ending fix, the Windows-native run still failed while copying into a Linux container because Docker received `\tmp` rather than `/tmp`.

WSL avoided those Windows-native blockers and completed the oracle/nop smoke.

Adapter path:

- The legacy package installed agents use `--agent-kwarg prompt_template=<path>` to render task instructions through a Jinja2 template containing `{{ instruction }}`.
- Harbor docs expose built-in agents and custom agents through `--agent-import-path`; a future Harbor comparison should verify the current guidance-injection mechanism before running reportable results.
- A true HEB/no-HEB comparison should run the same model agent, task ids, attempts, timeouts, dataset version, and harness lane with two guidance surfaces:
  - no added guidance: pass through the task instruction only;
  - HEB guided: prepend only the smallest HEB task-run guidance needed to preserve deterministic grading, avoid stale context, and report evidence/tradeoffs.
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` were absent in both Windows and WSL shells, so no Codex or Claude Terminal-Bench model-agent comparison was run in this spike.

## Evidence, Inference, Unsupported Claims

Evidence:

- The local HEB pilot manifest and result rows still validate with the current repo state.
- The local HEB summary remains `no-added-guidance` 7/10 first-trial success versus `heb-planned-core` 8/10, with equal first-pass green and higher HEB cost/time proxies.
- Terminal-Bench `terminal-bench-core==0.1.1` can run from WSL here on one selected legacy-package task: oracle resolved `swe-bench-langcodes`; nop did not.
- Windows-native Terminal-Bench execution has concrete encoding, Unix-tool, Git line-ending, and Docker path blockers.

Inference:

- Terminal-Bench is a viable external benchmark family for this repo when run from WSL or Linux.
- HEB/no-HEB Terminal-Bench comparison should wrap agent guidance through the selected harness's native agent mechanism, not by changing Terminal-Bench tasks or scoring.
- Harbor is the right default lane for future public/reportable Terminal-Bench 2.x comparisons.

Unsupported:

- This spike does not show that HEB improves Terminal-Bench model-agent results.
- This spike does not make the local HEB pilot comparable with Terminal-Bench leaderboard scores.
- This spike does not prove that the legacy `terminal-bench-core==0.1.1` lane is comparable with current Terminal-Bench 2.x Harbor leaderboard rules.
- This spike does not justify template, planner, or dogfooding expansion.

## Decision

Close #70 with this bounded comparison report and repo contract. Do not expand HEB guidance from these results.

If a future decision needs public benchmark evidence, run a separate model-backed Terminal-Bench comparison from WSL/Linux with credentials available, Harbor as the current public-lane harness, fixed task ids, fixed model and agent surface, and two checked guidance surfaces. Keep those results separate from the local HEB pilot table.
