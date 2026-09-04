# HEB Benchmark Runner And Result Schema

Issue: #52
Depends on: #51
Feeds: #53 pilot, #54 governance feedback

This runner turns the benchmark protocol into reproducible inputs and comparable JSONL results. It is intentionally small: it prepares pinned task workspaces, applies one variant overlay, and records manual or adapter-produced result rows. It does not choose an agent, score subjective behavior with an LLM judge, or require private credentials.

## Commands

```bash
node scripts/benchmark-runner.mjs validate --manifest test/fixtures/benchmark-runner/tasks.valid.json
node scripts/benchmark-runner.mjs prepare --manifest test/fixtures/benchmark-runner/tasks.valid.json --task docs-only-fixture-001 --variant static-minimal-agents --workspace <temp-workspace>
node scripts/benchmark-runner.mjs record --manifest test/fixtures/benchmark-runner/tasks.valid.json --result <manual-result.json> --out <results.jsonl> --artifacts-dir <artifact-dir>
node scripts/benchmark-runner.mjs validate-results --manifest test/fixtures/benchmark-runner/tasks.valid.json --out <results.jsonl> --artifacts-dir <artifact-dir>
node scripts/benchmark-summary.mjs --results <results.jsonl>
```

Use `hash-fixture` when adding or updating a committed fixture:

```bash
node scripts/benchmark-runner.mjs hash-fixture --path <fixture-dir>
```

## Task Manifest

The manifest schema version is `heb-benchmark-tasks.v1`. Use JSON so the runner has no package install step.

Required top-level fields:

- `schema_version`: must be `heb-benchmark-tasks.v1`.
- `suite_id`: stable suite or pilot id.
- `harness_version`: HEB version under evaluation when known.
- `variants[]`: each variant has `id`, `correction_policy`, and optional `overlay_paths[]`.
- `tasks[]`: each task records the pinned source, prompt, category, guidance normalization, allowed variants, graders, expected routes, and excluded requirements.

Task `source` may be:

- `{ "type": "fixture", "path": "...", "revision": "sha256:<digest>" }`
- `{ "type": "git", "repo": "https://...", "revision": "<commit-or-tag>" }`

Fixture checksums are verified during `prepare`. Git sources are cloned and checked out at the exact revision supplied by the manifest.

## Result Rows

The JSONL result schema version is `heb-benchmark-result.v1`. Each row represents one task, variant, and trial.

Required identity fields:

- `run_id`, `task_id`, `trial`, `variant`, `agent_surface`

Runner-filled or normalized fields:

- `repo`, `source_revision`, `harness_version`, `schema_version`
- `wall_time_seconds` when `started_at` and `finished_at` are present
- `warnings[]` for missing partial telemetry

Outcome and telemetry fields:

- `success`, `first_pass_green`, `tests_passed`, `validator_passed`
- `run_config` for model/context/tool/sandbox comparison controls
- `model` for the declared/requested model, `observed_model` when product logs expose the actually routed model, and `model_routing_evidence[]` for transcript or metadata pointers
- `route_hits`, `stale_hits`, `unnecessary_reads`, `docs_cited`
- `commands_run`, `files_read`, `files_modified`
- `human_touches`, `retry_loops`
- `token_estimate`, `cost_estimate`
- `artifact_paths`, `notes`

Review-loop convergence episodes may include:

```json
{
  "review_loop": {
    "reviewed_heads": 3,
    "review_attempts": 5,
    "remediation_heads": 2,
    "same_family_recurrences": 1,
    "gross_remediation_lines": 120,
    "rework_lines": 35,
    "initial_scope_lines": 80,
    "final_scope_lines": 130,
    "blocker_count": 2,
    "residual_count": 1,
    "noise_count": 1,
    "prompt_bytes": 45000,
    "escaped_relevant_defects": 0,
    "terminal_full_review": true,
    "triggered_actions": ["design-mechanism-checkpoint"]
  }
}
```

Fields may be `null` when unavailable, but adapters should populate every field
they can during the run. A result cannot set `success: true` when
`escaped_relevant_defects` is nonzero or `terminal_full_review` is not true.
Efficiency measurements remain diagnostic; they never override correctness.
`benchmark-summary.mjs` renders these rows in a dedicated review-loop table so
feedback is visible at PR closeout instead of waiting for a monthly report.
Nullable review metrics remain distinct from measured zero, false, or empty
values; medians, totals, booleans, and action arrays show partial coverage
explicitly.

`token_estimate` may be a non-negative number or an object with `unit`, `input`, `output`, and `total`; if `input` and `output` are present, `total` is computed. `cost_estimate` may be a non-negative number or `{ "currency": "USD", "amount": 0.01 }`.

Partial telemetry is allowed. If run configuration, token, cost, transcript, or trace data is unavailable, record `null` or omit the artifact path; the runner adds warnings instead of failing the row. When `model` is present but `observed_model` is unavailable, the runner warns so summaries do not accidentally treat a deployed product run as a pure model comparison. `benchmark-summary.mjs` surfaces warning counts and model-provenance rollups so those caveats remain visible in the report path.

## Artifact Policy

Raw transcripts, diffs, workspaces, and trace logs should stay outside committed source by default. Store them under a temp or caller-provided artifact directory and record paths in `artifact_paths`. The runner records paths only; it does not inline large logs into JSONL rows.

The Terminal-Bench comparison helper follows the same boundary for model-backed runs: job artifacts default to an OS temp directory and `run`/`preflight` reject a jobs directory inside this checkout unless the caller passes `--allow-repo-jobs-dir` to acknowledge benchmark contamination risk. Oracle and nop smoke runs remain allowed in repo-local directories because they do not expose prior artifacts to a model-backed agent.

## Fresh Run Loop

Use this loop for regular benchmark runs until a full agent adapter is implemented:

1. Pick or create a run directory outside the repository, such as `$env:TEMP/heb-benchmark-runs/<date-run-id>` on Windows or `/tmp/heb-benchmark-runs/<date-run-id>` on Unix-like systems.
2. Validate the manifest with `benchmark-runner.mjs validate`.
3. For each task, variant, and trial, call `benchmark-runner.mjs prepare` into a clean workspace under the run directory.
4. Run the chosen agent surface in that prepared workspace with the task prompt from the manifest.
5. Run the task's deterministic graders and inspect the final diff.
6. Write one result JSON object for that task, variant, and trial, then append it with `benchmark-runner.mjs record`.
7. Validate the complete JSONL with `benchmark-runner.mjs validate-results`.
8. Summarize the run with `benchmark-summary.mjs --results <results.jsonl>` and include the table in the PR body, issue comment, or report.

Do not commit raw fresh-run workspaces, transcripts, or large logs. Commit a result artifact only when the run is intentionally becoming a stable pilot or release comparison.

## Pilot Boundary

This runner is enough for #53 when a pilot can:

- validate one task manifest,
- prepare the same pinned task for at least two variants,
- record one JSONL row per task/variant/trial,
- validate the result file with partial telemetry, and
- compare rows without relying on private repositories or agent-specific state.

After #53, remove or tighten any field that is hard to collect consistently or does not influence #54 governance.
