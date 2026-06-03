# Measurement Layer Reference

Use this reference only after Phase 8 of the main template says measurement detail is triggered. This is routed detail, not required always-on guidance and not a reason to create PR metrics, health reports, feedback logs, or evals by default.

## Admission Gate

Start with the minimal local baseline from the main template:

- always-on instruction size
- required harness file presence
- broken internal link count
- harness validator pass/fail
- active decision count
- data/repo contract count when contracts exist

Add deeper measurement only when there is local trigger evidence:

- active PR or review workflow
- recurring agent iteration or repeated review loops
- enough history to make trends meaningful
- several validators, contracts, metrics, or routers that need prioritization
- production or long-running agent runtime where safety or drift metrics are load-bearing

Smaller-control check: if a single local validator summary or PR checkbox captures the signal, do not add scheduled reports, standing issues, or eval harnesses.

Validation signal: the measurement output should make one next action clearer, reduce repeated rediscovery, or expose a recurring harness miss. If nobody uses the output over an audit window, retire or weaken it.

## Metrics Script

`scripts/harness-metrics.*` should emit one JSON object to stdout. It must work locally with partial data. If `gh`, CI history, traces, or PR history are unavailable, emit `null` for unavailable values and include a `warnings` array.

Minimal implementations may emit only the local baseline fields plus `warnings`. Mature repositories can add the categories below as their triggers appear.

Recommended top-level shape:

```json
{
  "generated_at": "2026-04-24T00:00:00Z",
  "window_days": 30,
  "token_pressure": {},
  "rot_indicators": {},
  "harness_health": {},
  "contract_coverage": {},
  "control_coverage": {},
  "runtime_safety": {},
  "behavioral_drift": {},
  "workflow_outcomes": {},
  "warnings": []
}
```

Metric categories:

- `token_pressure`: line and byte counts for always-on instruction files such as `AGENTS.md`, provider adapters, and other auto-loaded files.
- `rot_indicators`: broken links, orphan or deprecated decision citations, stale contracts/references, duplicate instruction blocks, conflicting active decisions, and unroutable ADR entries.
- `harness_health`: active/superseded decision counts, routed-decision coverage, control inventory presence, guide/sensor counts, contract counts, validator pass/fail, and quality-gate runtime.
- `contract_coverage`: external data sources and cross-repo dependencies with or without contracts; start warning-only until scans are reliable.
- `control_coverage`: fast sensors in local/CI gates, scheduled drift sensors, inferential PR sensors, controls missing owner/failure mode/retirement signal, and bespoke scaffolds missing a model/tool-upgrade reassessment signal.
- `runtime_safety`: write tools with approval tiers, scoped credentials, audit logs, trace coverage, MCP/tool-contract validation, and fault-injection profiles when agent runtime safety is enabled.
- `behavioral_drift`: drift sensor presence, alert count, false-positive rate, latency, and whether alerts lead to context injection, review, rollback, or harness issues.
- `workflow_outcomes`: first-pass CI success, time to first green, time to merge, decision/contract citation rates, correction marker counts, provider-memory conflict counts, and prediction hit/miss rate.

## Health Report

Add `scripts/harness-health.*` only when several validators, metrics, contracts, routers, or recurring audits need prioritization. A health report interprets gates; it does not replace them.

Default mode is advisory: generate the report and exit `0` even when `actions[]` is non-empty. Use nonzero exits only for script/runtime failure, or for an explicit `--strict` mode after at least one low-noise audit cycle and an active decision that promotes health actions to enforcement.

Recommended output:

```json
{
  "healthy": false,
  "summary": "Harness validation passes, but decision memory is past the router threshold.",
  "actions": [
    "Add a decision index/router or record an accepted scaling gap",
    "Add PR observation marker capture to metrics"
  ],
  "evidence": {
    "harness_validation_passed": true,
    "active_decision_count": 32,
    "agents_md_lines": 90
  },
  "warnings": []
}
```

Exit codes:

- `0`: report generated; advisory actions do not fail CI.
- `1`: explicit `--strict` mode found required action, or a deterministic required check failed after documented promotion.
- `2`: a required check crashed or could not run.

Avoid circular dependency: metrics may record whether a health report exists, but `harness-metrics.*` should not call `harness-health.*` if health already wraps metrics.

## Human Correction Markers

Use lightweight markers in PR bodies, issue comments, inline review comments, or review submissions when scripts cannot infer human-observed friction:

- `harness:miss-docs`
- `harness:miss-adr`
- `harness:miss-decision-route`
- `harness:data-contract-needed`
- `harness:repo-contract-needed`
- `harness:runtime-safety-needed`
- `harness:behavior-drift`
- `harness:evidence-gap`
- `harness:wrong-command`
- `harness:missing-sensor`
- `harness:missing-guide`
- `harness:context-rot`
- `harness:provider-memory-conflict`
- `harness:review-noise`
- `harness:token-bloat`
- `harness:obsolete-scaffold`
- `harness:prediction-miss`
- `harness:handoff-claim`
- `harness:semantic-scope`
- `harness:scope-ratchet`

If PR templates include a `No harness issue observed` option, metrics should validate that it is mutually exclusive with positive observations.

## Feedback Log

Add `docs/harness-feedback/` only for repositories with frequent agent iteration. Keep entries short and actionable:

```text
docs/harness-feedback/
  INDEX.md
  <yyyy-mm-dd-short-title>.md
```

Each entry should identify what went wrong, why the harness allowed it, what changed, and what prevention check was added. Include frontmatter for status, owner, last review, source of truth, scope, and verification.

## Storage And Scheduled Reports

Do not commit large raw logs. Use one of:

- GitHub Actions job summary only
- artifact upload for scheduled JSON output
- one standing GitHub issue such as "Harness Health"
- `docs/harness-metrics/history.jsonl` only when committed trend history stays small

Scheduled reports should summarize trends and recommended actions, not dump raw logs. Agents should read only the latest metrics summary during harness audits unless they are explicitly investigating a trend.

## Optional Regression Eval

For mature harnesses, create a small fixed task set to evaluate harness revisions. Keep it optional because it costs agent time.

Recommended structure:

```text
docs/harness-evals/
  README.md
  tasks.yml
  harness-snapshots/
  results.jsonl
```

Task categories may include bug fix, feature addition, refactor, docs-only change, CI/release change, domain gotcha, long-running handoff task, and review-only task.

Track enough data to explain changes in outcome: task id, harness version, agent tool/model, task type, success, first-pass green, wall time, token cost, human touches, docs read/modified, CI failures, retry loops, control variant, ablated controls, prediction, and notes.

For nontrivial harness edits, add a short prediction before merge: what metric, marker count, failure mode, or agent behavior should improve, over what window, and what evidence would show the edit did not help. Check predictions during the next harness audit.

External eval frameworks are adapters, not required infrastructure. Prefer repo-specific tasks, source-traced acceptance criteria, and reproducible traces before generic benchmarks or LLM judges.
