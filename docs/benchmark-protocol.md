# HEB Benchmark Protocol

Issue: #51
Parent: #31
Follow-ups: #52 runner/schema, #53 first pilot, #54 governance feedback

## Purpose

This protocol defines how HEB should be evaluated before a runner exists. It does not claim that HEB improves downstream outcomes yet.

The question is:

> When does HEB improve, fail to improve, or hurt coding-agent outcomes compared with simpler repository context strategies?

The first benchmark must measure repeated agent work, not a single task. HEB's strongest claim is not that the first run is always better. The claim is that small, routed controls help agents recover from repeated misses, reduce same-family mistakes over time, and avoid carrying stale ceremony when those controls stop paying for themselves.

## Design Evidence

- AGENTS.md evaluation research found repository context files can reduce task success and increase inference cost when they add unnecessary requirements: https://arxiv.org/abs/2602.11988
- OpenAI evaluation guidance frames eval design as objective, dataset, metrics, comparison, and continuous evaluation: https://developers.openai.com/api/docs/guides/evaluation-best-practices
- Anthropic agent-eval guidance emphasizes deterministic task outcomes first, then transcript/tool-use grading where needed: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- SWE-bench and Terminal-Bench use reproducible task environments plus outcome checks: https://www.swebench.com/SWE-bench/ and https://arxiv.org/abs/2601.11868
- tau-bench-style repeated-trial reliability is relevant because one successful attempt can hide inconsistent agent behavior: https://sierra.ai/blog/tau-bench-shaping-development-evaluation-agents
- GitHub's Copilot harness evaluation combines public benchmarks, internal benchmarks, real-world metrics, controlled harness comparisons, token efficiency, task resolution, and run-to-run variance: https://github.blog/ai-and-ml/github-copilot/evaluating-performance-and-efficiency-of-the-github-copilot-agentic-harness-across-models-and-tasks/

## Benchmark Source Catalog

The first HEB pilot is local: it uses the committed fixture under `test/fixtures/benchmark-runner/source-repo`, not a public benchmark suite. External benchmarks are design evidence and adapter candidates until the runner can preserve their native evaluation semantics.

Good public candidates:

| Source | Canonical source | What it tests | HEB use |
| --- | --- | --- | --- |
| SWE-bench / SWE-bench Lite / Verified | https://github.com/swe-bench/SWE-bench and https://www.swebench.com/SWE-bench/ | Real GitHub issue resolution with patch evaluation. | Best fit for coding-agent outcome comparisons after an adapter can pin dataset split, repo revision, Docker image behavior, and generated patch evaluation. |
| Terminal-Bench | https://github.com/harbor-framework/terminal-bench and https://www.tbench.ai/ | End-to-end terminal tasks with task instructions, tests, and sandboxed execution. | Best first public external benchmark for CLI-agent harness behavior, because its native shape already matches prepared environments plus programmatic graders. |
| tau-bench / tau2-bench / tau3-bench | https://github.com/sierra-research/tau2-bench and https://www.taubench.com/ | Tool-using conversational agents across domain policies and APIs. | Useful for runtime/tool-policy and handoff guidance, but not a direct coding-harness baseline. Keep separate from coding-task success claims. |

Do not mix these scores with the local pilot table. Add a public benchmark only through an adapter that records source version, task subset, native command, environment requirements, scoring semantics, and any known divergence from upstream leaderboard rules. If an adapter depends on upstream repository behavior rather than a one-time reference, add a compact repo contract before treating the results as comparable.

## Variants

Run each task against these variants with the same model, agent surface, time budget, and starting repository state:

1. No added repository guidance: the task prompt and repository are available, but no generated harness files are added.
2. Static minimal AGENTS-only: a short root `AGENTS.md` gives only canonical repo commands and hard constraints, and remains unchanged across attempts.
3. Adaptive minimal AGENTS-only: the same short root `AGENTS.md` starts as variant 2, then receives the same post-miss correction budget as HEB during longitudinal episodes.
4. HEB planned core: the read-only planner output is applied as the smallest accepted HEB core for that repo, including routed docs and validation commands only when trigger evidence exists.
5. Bloated or memory-bank comparator: optional and excluded by default. Add only when there is clear trigger evidence and a concrete comparator to test, because otherwise it mainly proves that noisy context is noisy.

Normalize pre-existing agent guidance before applying a variant. If a pinned public repo already contains agent-facing files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, Cursor rules, Windsurf rules, local skills, or memory-bank docs, either exclude that repo from the first suite or create a fixture patch that removes or masks those files consistently before variant overlays are applied. No variant should inherit upstream agent guidance unless the experiment explicitly studies that guidance as its own comparator.

HEB can lose honestly. A result where variant 1 or 2 beats HEB on success, cost, or mistake recurrence must be treated as evidence to tighten or remove HEB guidance, not as a benchmarking failure.

## Run Configuration

Hold the run configuration fixed unless the experiment explicitly studies a model or agent-surface difference. Record enough configuration for #52 to reject accidental apples-to-oranges comparisons:

- model, provider, context window, reasoning effort, and model-specific flags
- agent surface, harness version, CLI or extension version, and task prompt
- tool allowlist, disabled tools, MCP servers, network policy, and sandbox policy
- prompt/context budget, timeout, cache state, run order, and random seed when available

Efficiency should be reported per resolved task, not only as raw token totals. A harness that uses fewer tokens but also solves fewer tasks is not automatically better; compare task resolution, tokens per successful task, cost per successful task, and wall time together.

## Correction Policy Matrix

Longitudinal episodes must distinguish HEB-specific governance from ordinary persistence. Use the same failed attempt, near-neighbor task, and delayed-regression task across variants, but apply corrections according to this matrix:

| Variant | Correction policy after a miss |
| --- | --- |
| No added repository guidance | Static. Reset the repo to the same pinned task state; do not add persistent guidance. |
| Static minimal AGENTS-only | Static. Keep the initial short `AGENTS.md`; do not add new routes or reminders. |
| Adaptive minimal AGENTS-only | Allow one small correction with the same size and intent budget as HEB, but constrain it to the minimal guidance surface. |
| HEB planned core | Allow only the smallest HEB-allowed correction: route update, doc tightening, validator, doctor warning, issue marker, or retirement of misleading guidance. |
| Bloated or memory-bank comparator | Define the update rule before the run; exclude the comparator if the rule cannot be made reproducible. |

Record the correction policy, correction patch, and harness snapshot for every staged episode. Otherwise the benchmark can only show that any persistent correction helps, not that HEB's routed governance helps more than a simpler control.

## Task Suite

Start with 10 to 20 small public fixture or public open-source repositories. Exclude private repositories, private credentials, paid services, and tasks that require hidden human knowledge.

Every task must pin the repository or fixture to an immutable starting point: commit SHA, release tag, fixture archive checksum, or generated fixture checksum. Do not use a moving default branch as the benchmark input.

Every task must also record the pre-existing guidance inventory and the normalization policy used before variants run. If existing guidance cannot be removed, masked, or deliberately modeled without changing the task's meaning, exclude the task from the first benchmark.

Each task should belong to one primary category:

- Bug fix
- Feature addition
- Refactor
- Docs-only
- CI or release
- Domain gotcha
- Long-running handoff
- Review-only

Each category should include at least one deterministic outcome check. Prefer tests, static checks, file-state assertions, or exact doc assertions. Use rubric or transcript grading only for behaviors that cannot be measured from final repository state.

## Longitudinal Episodes

To exercise self-correction, at least one third of the suite should be organized as same-family episodes instead of isolated tasks.

An episode has four stages:

1. First encounter: the agent receives a task with a realistic route gap, stale cue, wrong-command trap, missing guide, missing sensor, or repeated domain gotcha.
2. Harness response: if the miss happens, apply only the smallest HEB-allowed correction: route update, doc tightening, validator, doctor warning, issue marker, or retirement of misleading guidance.
3. Near-neighbor retest: a fresh agent attempt receives a different task in the same defect family, not the exact original task.
4. Delayed regression: after unrelated tasks run, repeat another near-neighbor task to check whether the correction still helps without causing extra context cost.

Score the episode by recurrence, not just by final task success. If HEB solves the original task but repeats the same avoidable mistake on the near-neighbor, the self-correction claim did not hold.

## Metrics

Record these per task attempt:

- Success: deterministic grader passes and no required behavior regresses.
- First-pass green: success without a repair loop after the first validation run.
- Route-hit rate: the agent used the intended routed doc, command, contract, or skill when relevant. Diagnostic only; do not make it a success gate.
- Stale-hit rate: the agent relied on stale, superseded, or irrelevant context. Diagnostic unless it causes a task failure.
- Unnecessary reads: files read that were not needed for the task family or route. Diagnostic unless it causes a cost or time failure.
- Docs cited: durable repo sources named in the final explanation or PR summary. Diagnostic only; outcome graders remain primary.
- Tests run: commands executed, pass/fail, and whether the canonical quality gate was included when applicable.
- Retry loops: repeated failed edits, repeated failed commands, or review-fix cycles.
- Token or cost estimate: provider-reported usage when available, otherwise a consistent proxy such as transcript bytes.
- Tokens or cost per successful task: efficiency normalized by completed work, not just total consumption.
- Wall time: elapsed task time.
- Human touches: clarifying questions, manual corrections, or reviewer interventions needed.
- Mistake-family recurrence: whether the same route, command, stale-context, guide, or sensor failure recurred after a harness correction.
- Correction lag: number of attempts between first observed miss and first successful near-neighbor run.
- Control harm: added guidance increased reads, stale hits, or cost without improving success or recurrence.

## Trial Policy

The full protocol should use enough repeated attempts to expose reliability noise. Start with:

- Pilot: 6 tasks, static minimal AGENTS-only versus HEB planned core, 2 attempts each. Include adaptive minimal AGENTS-only if at least one longitudinal episode is in the pilot.
- First benchmark: 10 to 20 tasks, 4 required variants, 3 attempts each.
- Longitudinal episodes: at least 4 episodes in the first benchmark, with near-neighbor and delayed-regression stages.

Report pass-at-1, pass-at-k, all-trials-pass consistency, recurrence rate, correction lag, median cost/time, and run-to-run variance. Do not let pass-at-k hide instability: a variant that succeeds once but fails repeated attempts is less reliable than one that passes consistently. If results are close, variance is high, or cost-per-success moves in the opposite direction from raw success, treat results as directional evidence and expand the suite before changing template policy.

## Failure Modes That Tighten Or Remove HEB

The benchmark should produce governance action when any of these occur:

- HEB has lower success than minimal AGENTS-only with equal or higher cost.
- HEB reduces one defect family but creates new stale-context or unnecessary-read failures.
- A routed doc or optional module is not used across repeated relevant tasks.
- Same-family mistakes recur after the intended HEB correction.
- Agents follow HEB instructions that are technically correct but irrelevant to the task.
- The protocol requires private repos, credentials, or human-only judgment to pass.

Actions should prefer removal, shorter wording, stricter trigger evidence, or a mechanical validator before adding more prose.

## Task Manifest Sketch

Issue #52 should turn this into a machine-readable schema. The runner-facing manifest should include:

```json
{
  "id": "domain-gotcha-cache-invalidation-001",
  "repo": "public fixture or public repo URL",
  "revision": "commit SHA, tag, or fixture archive checksum",
  "preexisting_guidance_files": ["AGENTS.md", ".github/copilot-instructions.md"],
  "guidance_normalization": "removed, masked, excluded, or explicit-comparator",
  "category": "domain gotcha",
  "episode": "cache-invalidation-family",
  "episode_stage": "first-encounter",
  "suite_run_id": "2026-07-01-public-fixture-pilot",
  "variant": "heb-planned-core",
  "attempt_index": 1,
  "run_config": {
    "model": "model identifier",
    "context_window": "configured context window",
    "reasoning_effort": "configured reasoning effort",
    "agent_surface": "CLI, app, or manual adapter",
    "tool_policy": "allowed tools and disabled tools",
    "mcp_servers": ["server identifiers or empty"],
    "sandbox_policy": "workspace and network policy"
  },
  "correction_policy": "heb-planned-core",
  "harness_snapshot": "path or checksum for applied guidance",
  "task": "User-facing task prompt",
  "setup": ["commands or fixture state"],
  "graders": ["deterministic test commands or state checks"],
  "expected_routes": ["docs/testing.md", "docs/adr/cache.md"],
  "seeded_failure_family": "missed decision route",
  "transcript_log": "path to transcript or tool log",
  "cost": {
    "unit": "provider_tokens",
    "input": 12000,
    "output": 2000,
    "total": 14000
  },
  "excluded_requirements": ["private credentials", "network-only service"],
  "time_budget_minutes": 30
}
```

## Excluded Claims

This protocol cannot prove:

- HEB is globally better than other harness systems.
- HEB improves outcomes from a single benchmark task.
- More HEB is better.
- LLM judges alone can substitute for deterministic task outcomes.
- A private downstream success transfers to public repos without a comparable dependency surface.

## Validation Signal For #52

This protocol is ready for runner/schema work when a reviewer can use it to answer:

- Which variants must be run?
- Which task categories are in the suite?
- Which metrics are required versus optional?
- How are repeated self-correction episodes represented?
- Which immutable repository or fixture revision is used?
- Which model, context, tool, MCP, and sandbox configuration is held fixed?
- Which correction policy applies to each variant?
- What result would make HEB guidance smaller or weaker?

If those questions are not answerable from this document, narrow the protocol before implementing a runner.

## Revisit Rule

Review this protocol after the first pilot in #53. Retire or narrow any metric that is hard to collect consistently, fails to influence governance in #54, or encourages agents to optimize benchmark behavior instead of repository outcomes.
