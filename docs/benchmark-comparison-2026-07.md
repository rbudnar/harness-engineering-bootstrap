# HEB Benchmark Comparison Spike

Issue: #70
Date: 2026-07-03

## Scope

This report compares the current HEB local benchmark evidence with a tiny Terminal-Bench adapter spike. It is not a full public leaderboard run and it does not claim that HEB improves agents globally.

The comparison has two separate lanes:

- Local HEB lane: validated the existing HEB pilot rows for `no-added-guidance` versus `heb-planned-core`.
- Terminal-Bench lane: added a WSL-aware Harbor comparison runner, proved paired `no-added-guidance` versus `heb-guided` execution with `oracle`, completed the paired run with `claude-code` using forced Claude OAuth, and completed the paired run with `codex` using subscription-backed ChatGPT auth.

The first `claude-code` attempt reached Harbor and Claude Code inside the task container but stopped before model inference because no valid Anthropic credential was available to the sandbox. The follow-up `claude-code` attempt reached model inference through `CLAUDE_FORCE_OAUTH=1` plus `CLAUDE_CODE_OAUTH_TOKEN`, consumed tokens/cost, and completed both variants with reward `0.0`. The `codex` attempt reached model inference through `CODEX_AUTH_JSON_PATH` and resolved both variants.

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
- Reportable Terminal-Bench comparisons should use Harbor, pin the dataset, task subset, model, agent surface, attempts, timeouts, run order, and any divergence from leaderboard rules.
- Harbor exposes `--extra-instruction-path`, which this PR uses for the `heb-guided` condition while leaving upstream tasks and scoring unchanged.

## Harbor Comparison Runner

This PR adds `scripts/terminal-bench-comparison.mjs` and the reviewed guidance fixture `test/fixtures/terminal-bench-comparison/heb-extra-instructions.md`.

The runner executes two Harbor jobs with the same dataset, task ids, agent, model, attempts, concurrency, and timeout:

- `no-added-guidance`: passes only the Terminal-Bench task instruction.
- `heb-guided`: appends the committed HEB guidance fixture through Harbor `--extra-instruction-path`.

Model-backed runs default raw Harbor job artifacts to the OS temp directory so later agents do not inherit prior benchmark artifacts from this checkout. The helper rejects repo-local model-backed jobs directories unless `--allow-repo-jobs-dir` is passed to acknowledge contamination risk. Compact summary JSON can still be written under the gitignored `.heb-benchmark-runs/terminal-bench/` path for review. The summary JSON records Harbor version, dataset, task refs, task checksums, agent/model versions, reward, exceptions, token counts, cost, wall-time fields from Harbor `result.json`, and whether a repo-local jobs directory was acknowledged.

Windows/WSL command shape used for the Codex subscription-auth run:

```powershell
$env:CODEX_AUTH_JSON_PATH = '/mnt/c/Users/Rbudn/.codex/auth.json'
$env:WSLENV = 'CODEX_AUTH_JSON_PATH'

node scripts/terminal-bench-comparison.mjs preflight --wsl --agent codex --model gpt-5.5

node scripts/terminal-bench-comparison.mjs run `
  --wsl `
  --agent codex `
  --model gpt-5.5 `
  --run-id issue-70-codex-chatgpt-auth `
  --task terminal-bench/regex-log `
  --timeout-multiplier 1 `
  --ak reasoning_effort=medium `
  --ak reasoning_summary=none `
  --ak web_search=disabled `
  --out .heb-benchmark-runs/terminal-bench/issue-70-codex-chatgpt-auth-summary.json
```

`CODEX_AUTH_JSON_PATH` points Harbor at the refreshed Windows Codex ChatGPT auth file from inside WSL. `WSLENV=CODEX_AUTH_JSON_PATH` is required so WSL receives the variable from Windows PowerShell.

Windows/WSL command shape for repeatable Claude subscription OAuth:

```powershell
# Run this interactively first, then store the emitted token securely for the run.
claude setup-token

$env:CLAUDE_CODE_OAUTH_TOKEN = '<token from claude setup-token>'
$env:CLAUDE_FORCE_OAUTH = '1'
$env:WSLENV = 'CLAUDE_CODE_OAUTH_TOKEN/u:CLAUDE_FORCE_OAUTH/u'
$runId = 'terminal-bench-claude-oauth-smoke'

node scripts/terminal-bench-comparison.mjs preflight --wsl --agent claude-code --model anthropic/claude-haiku-4-5

node scripts/terminal-bench-comparison.mjs run `
  --wsl `
  --agent claude-code `
  --model anthropic/claude-haiku-4-5 `
  --run-id $runId `
  --task terminal-bench/regex-log `
  --timeout-multiplier 1 `
  --ak max_turns=20 `
  --ak thinking=disabled `
  --out ".heb-benchmark-runs/terminal-bench/$runId-summary.json"
```

`CLAUDE_FORCE_OAUTH=1` makes Harbor's `claude-code` adapter ignore API-key fallbacks and use `CLAUDE_CODE_OAUTH_TOKEN`. `WSLENV=CLAUDE_CODE_OAUTH_TOKEN/u:CLAUDE_FORCE_OAUTH/u` is required when launching the runner from Windows PowerShell with `--wsl`.

## Harbor Runs From This PR

Environment:

- Date: 2026-07-03.
- Harbor: `0.17.0`.
- Dataset: `terminal-bench/terminal-bench-2`.
- Task: `terminal-bench/regex-log`.
- Task ref: `sha256:72f5f52d6b523a00380cb088fcf0ba83a2e2f7b478fdad6515598ab43584e337`.
- Task checksum: `993ccf8945b50b4acc3af94bec7ade72c047aed23374dacabb2010d7816bd992`.
- Attempts/concurrency: `-k 1`, `-n 1`.
- Timeout multiplier: `0.35` for oracle and the earlier auth-blocked Claude smoke timing; `1` for the Codex subscription-auth run and the credentialed Claude OAuth run.

Runner oracle paired smoke:

```bash
node scripts/terminal-bench-comparison.mjs run \
  --wsl \
  --agent oracle \
  --run-id issue-70-oracle-pair \
  --task terminal-bench/regex-log \
  --timeout-multiplier 0.35 \
  --out .heb-benchmark-runs/terminal-bench/issue-70-oracle-pair-summary.json
```

| Variant | Agent | Reward | Success | Exceptions | Wall time | Token/cost |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `no-added-guidance` | `oracle` | 1.0 | 1/1 | 0 | 26s | n/a |
| `heb-guided` | `oracle` | 1.0 | 1/1 | 0 | 27s | n/a |

Runner Codex paired model run with ChatGPT subscription auth:

```bash
node scripts/terminal-bench-comparison.mjs run \
  --wsl \
  --agent codex \
  --model gpt-5.5 \
  --run-id issue-70-codex-chatgpt-auth \
  --task terminal-bench/regex-log \
  --timeout-multiplier 1 \
  --ak reasoning_effort=medium \
  --ak reasoning_summary=none \
  --ak web_search=disabled \
  --out .heb-benchmark-runs/terminal-bench/issue-70-codex-chatgpt-auth-summary.json
```

| Variant | Agent/model | Reward | Success | Exceptions | Input/cache/output/reasoning tokens | Cost | Wall time |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `no-added-guidance` | `codex` / `gpt-5.5` | 1.0 | 1/1 | 0 | 41,927 / 18,944 / 2,017 / 1,081 | n/a | 247s |
| `heb-guided` | `codex` / `gpt-5.5` | 1.0 | 1/1 | 0 | 76,179 / 53,248 / 2,423 / 761 | n/a | 223s |

Interpretation: this is a real model-agent run through Harbor using subscription-backed Codex auth, not an API key. Both variants passed the single task. This one-task, one-attempt result does not show HEB improves Terminal-Bench performance; it only proves the paired runner can execute a credentialed model benchmark and preserve reward plus token telemetry.

Harbor wrote null token fields in `agent_result` because its Codex trajectory conversion hit a post-run LiteLLM/cwd error after the tasks passed. The committed runner now falls back to the raw Codex `turn.completed` usage event in `agent/codex.txt` for input, cached-input, output, and reasoning-token counts. Cost remains `n/a` because subscription-backed ChatGPT auth does not expose API billing cost in this run artifact.

Runner Claude-Code earlier auth-blocked attempt:

```bash
node scripts/terminal-bench-comparison.mjs run \
  --wsl \
  --agent claude-code \
  --model anthropic/claude-haiku-4-5 \
  --run-id issue-70-claude-auth-blocked \
  --task terminal-bench/regex-log \
  --timeout-multiplier 0.35 \
  --ak max_turns=20 \
  --ak thinking=disabled \
  --allow-missing-auth \
  --out .heb-benchmark-runs/terminal-bench/issue-70-claude-auth-blocked-summary.json
```

| Variant | Agent/model | Reward | Success | Exceptions | Input/output tokens | Cost | Wall time |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `no-added-guidance` | `claude-code` / `claude-haiku-4-5` | 0.0 | 0/1 | 1 | 0 / 0 | $0.00 | 55s |
| `heb-guided` | `claude-code` / `claude-haiku-4-5` | 0.0 | 0/1 | 1 | 0 / 0 | $0.00 | 51s |

Interpretation: this proves the model-agent lane was wired but not authenticated. Harbor reported `apiKeySource: none` in the Claude Code agent stream, both variants exited as `NonZeroAgentExitCodeError`, and no provider tokens were consumed. It does not compare HEB performance.

Runner Claude-Code paired model run with forced Claude OAuth:

```bash
node scripts/terminal-bench-comparison.mjs run \
  --wsl \
  --agent claude-code \
  --model anthropic/claude-haiku-4-5 \
  --run-id issue-70-claude-oauth-access-token \
  --task terminal-bench/regex-log \
  --timeout-multiplier 1 \
  --ak max_turns=20 \
  --ak thinking=disabled \
  --out .heb-benchmark-runs/terminal-bench/issue-70-claude-oauth-access-token-summary.json
```

| Variant | Agent/model | Reward | Success | Exceptions | Input/cache/output/reasoning tokens | Cost | Wall time |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `no-added-guidance` | `claude-code` / `claude-haiku-4-5` | 0.0 | 0/1 | 0 | 69,520 / 61,874 / 1,588 / n/a | $0.0294 | 121s |
| `heb-guided` | `claude-code` / `claude-haiku-4-5` | 0.0 | 0/1 | 0 | 47,085 / 42,723 / 1,848 / n/a | $0.0222 | 83s |

Interpretation: this is a real model-agent run through Harbor using Claude subscription-backed OAuth, not an API key. Both variants reached inference, consumed provider tokens, and completed without exceptions. Both variants failed the task with reward `0.0`, so this does not show HEB improves Terminal-Bench performance; it proves the `claude-code` credential path now works and the runner preserves token/cost telemetry.

Credential checks performed:

- The initial Windows and WSL process environments had no `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, or `OPENAI_API_KEY`, which explains the earlier auth-blocked Claude attempt.
- Windows `claude -p` worked with the logged-in subscription account; WSL `claude -p` still failed with `403` using its local login file.
- Copying the Windows `.claude/.credentials.json` into a temporary WSL `CLAUDE_CONFIG_DIR` proved the WSL Claude CLI could use the Windows subscription credential, but Harbor's default `claude-code` adapter expects provider auth through environment variables inside the execution environment.
- A `claude setup-token` attempt from this noninteractive shell timed out before emitting a token. The repeatable supported route is to run `claude setup-token` interactively, then set the resulting long-lived token as `CLAUDE_CODE_OAUTH_TOKEN`.
- The successful Claude Harbor run used `CLAUDE_FORCE_OAUTH=1` and a current Windows Claude OAuth access token forwarded to WSL with `WSLENV=CLAUDE_CODE_OAUTH_TOKEN/u:CLAUDE_FORCE_OAUTH/u`. This proves the path, but the access-token form is short-lived; prefer `claude setup-token` for regular runs.
- The earlier Codex Harbor attempt with `CODEX_FORCE_AUTH_JSON=true` failed before inference because the local Codex auth refresh token was stale/reused; no `OPENAI_API_KEY` was available.
- The successful Codex run used `CODEX_AUTH_JSON_PATH=/mnt/c/Users/Rbudn/.codex/auth.json` with `WSLENV=CODEX_AUTH_JSON_PATH`, pointing WSL Harbor at the refreshed Windows Codex ChatGPT auth file.

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

Terminal-Bench is feasible as an external lane from WSL on this machine. This PR commits the smallest runner needed to repeat the paired Harbor comparison and verifies oracle smoke, subscription-auth Codex model execution, and forced-OAuth Claude-Code model execution.

The first #70 smoke used the legacy package lane because that was the locally installable path available during the spike. Public or reportable Terminal-Bench 2.x comparisons should use Harbor instead of `terminal-bench-core==0.1.1`.

Windows-native blockers found during the spike:

- `terminal-bench datasets list` needs `PYTHONIOENCODING=utf-8` or `PYTHONUTF8=1`; otherwise Rich output with checkmarks can fail under Windows code page 1252.
- Dataset download invokes Unix `rm -rf .git`; plain Windows PATH did not provide `rm`. Temporarily prepending `C:\Program Files\Git\usr\bin` fixed that step.
- System Git has `core.autocrlf=true`, which converted downloaded shell scripts to CRLF and broke Linux Docker builds. The retry used child-process Git config `core.autocrlf=false` and cleared the Terminal-Bench dataset cache.
- After the line-ending fix, the Windows-native run still failed while copying into a Linux container because Docker received `\tmp` rather than `/tmp`.

WSL avoided those Windows-native blockers and completed the oracle/nop smoke.

Adapter path:

- The legacy package installed agents use `--agent-kwarg prompt_template=<path>` to render task instructions through a Jinja2 template containing `{{ instruction }}`.
- Harbor exposes `--extra-instruction-path`; `scripts/terminal-bench-comparison.mjs` uses that flag for the HEB-guided condition.
- A true HEB/no-HEB comparison should run the same model agent, task ids, attempts, timeouts, dataset version, and harness lane with two guidance surfaces:
  - no added guidance: pass through the task instruction only;
  - HEB guided: append only the smallest HEB task-run guidance needed to preserve deterministic grading, avoid stale context, and report evidence/tradeoffs.
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and `CLAUDE_CODE_OAUTH_TOKEN` were absent in both Windows and WSL shells for the first paired Claude-Code attempt, so that attempt failed before model inference and remains auth-blocked evidence rather than a benchmark score.
- Forwarding Claude OAuth with `CLAUDE_FORCE_OAUTH=1` and `CLAUDE_CODE_OAUTH_TOKEN` let Harbor run `claude-code` to inference; both variants completed with no exceptions and reward `0.0`.
- Codex subscription auth worked through Harbor by forwarding `CODEX_AUTH_JSON_PATH` into WSL via `WSLENV`.

## Evidence, Inference, Unsupported Claims

Evidence:

- The local HEB pilot manifest and result rows still validate with the current repo state.
- The local HEB summary remains `no-added-guidance` 7/10 first-trial success versus `heb-planned-core` 8/10, with equal first-pass green and higher HEB cost/time proxies.
- Terminal-Bench `terminal-bench-core==0.1.1` can run from WSL here on one selected legacy-package task: oracle resolved `swe-bench-langcodes`; nop did not.
- The committed runner can run paired Harbor jobs from Windows through WSL and successfully used Harbor `--extra-instruction-path`.
- The Harbor `oracle` paired smoke resolved `terminal-bench/regex-log` in both variants.
- The first Harbor `claude-code` paired attempt ran both variants but failed before inference with no valid provider credential, recording zero tokens and zero cost.
- The follow-up Harbor `claude-code` forced-OAuth run reached inference and completed both variants without exceptions, but both variants failed `terminal-bench/regex-log` with reward `0.0`.
- The Harbor `codex` paired run used ChatGPT subscription auth and resolved `terminal-bench/regex-log` in both variants with reward 1.0.
- Windows-native Terminal-Bench execution has concrete encoding, Unix-tool, Git line-ending, and Docker path blockers.

Inference:

- Terminal-Bench is a viable external benchmark family for this repo when run from WSL or Linux.
- HEB/no-HEB Terminal-Bench comparison should wrap agent guidance through the selected harness's native agent mechanism, not by changing Terminal-Bench tasks or scoring.
- Harbor is the right default lane for future public/reportable Terminal-Bench 2.x comparisons.
- The current runner is sufficient for a small regular smoke and for a credentialed one-task model A/B; larger or leaderboard-style runs should expand task count, attempts, and timeouts deliberately.

Unsupported:

- This spike does not show that HEB improves Terminal-Bench model-agent results, because the authenticated model-agent evidence is limited to one-task, one-attempt comparisons: Codex passed both variants and Claude-Code failed both variants.
- This spike does not make the local HEB pilot comparable with Terminal-Bench leaderboard scores.
- This spike does not prove that the legacy `terminal-bench-core==0.1.1` lane is comparable with current Terminal-Bench 2.x Harbor leaderboard rules.
- This spike does not justify template, planner, or dogfooding expansion.

## Decision

Close #70 with this bounded comparison report, the WSL-aware Harbor runner, the committed HEB guidance fixture, and the repo contract. Do not expand HEB guidance from these results.

Before making any HEB performance claim, expand the credentialed model-agent lane beyond this one-task smoke: use more Terminal-Bench tasks, repeated attempts, and fixed run order, then compare reward, pass-at-k, token/cost telemetry where available, and wall time.
