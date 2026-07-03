# HEB Benchmark Governance

Issue: #54
Parent: #31
Inputs: #51 protocol, #52 runner/schema, #53 first pilot

This document defines how benchmark results are allowed to change HEB. Benchmark data is useful only when it changes a scoped decision: template wording, planner behavior, dogfooding gates, roadmap priority, or retirement of a weak control.

## Decision Boundary

Benchmark-driven changes must name:

- Task family: the category, episode, route, command, or defect family affected.
- Result evidence: raw result rows, deterministic grader output, validation command, and sample size.
- Tradeoff: success, first-pass green, recurrence, token or cost estimate, wall time, human touches, and control harm.
- Decision: promote, tighten, remove, defer, reject, rerun, or open a narrower follow-up.

Route hits, docs cited, and files read are diagnostic signals. They do not justify template or planner promotion unless task outcomes, recurrence, or cost-normalized success also improve.

## Evidence Classes

Use these classes in benchmark summaries, release notes, and PR bodies:

| Class | What belongs here | Example |
| --- | --- | --- |
| Evidence | Validated result rows, deterministic grader results, command output, fixture checksums, row counts, and exact sample size. | `heb-planned-core` succeeded on 8 of 10 first-trial pilot tasks. |
| Inference | Bounded interpretation tied to a task family or observed tradeoff. | HEB may reduce wrong-command recurrence in this tiny fixture suite. |
| Unsupported claim | Anything broader than the suite, model, task family, or evidence can support. | HEB generally improves coding-agent performance. |

If a summary cannot separate evidence from inference, the benchmark result is not ready to drive a template, planner, or dogfooding change.

## Promotion Rules

Promote guidance into the template, planner, or dogfooding gate only when all are true:

- The result names the task family and includes a reproducible manifest plus validated result rows.
- HEB improves success, first-pass green, recurrence, or cost-normalized success against a simpler baseline.
- The tradeoff is acceptable or explicitly documented; higher cost or wall time must be named.
- The change is the smallest useful control: validator, route tightening, shorter wording, or retirement before new prose.
- The proposed control has a validation signal and a revisit or retirement trigger.

Planner changes need one extra test: the benchmark finding must map to a repository fact the read-only planner can detect. If the planner cannot detect the fact without guessing, record the result as evidence but do not change planner output.

## Tighten Or Remove Rules

Prefer tightening, shortening, or removal when any benchmark row or repeated family shows:

- HEB has lower success than a simpler baseline with equal or higher cost.
- First-pass green does not improve and retry or human-touch burden increases.
- A route hit does not improve the deterministic task outcome.
- Guidance causes stale hits, unnecessary reads, wrong-file edits, or control harm.
- The same defect family recurs after the intended HEB correction.
- A result depends on private credentials, hidden human knowledge, or subjective grading alone.

Negative results are useful. They should create smaller controls, retirement decisions, or rejected roadmap actions before they create new optional modules.

## Release Notes And Public Claims

Release notes may say that HEB added benchmark mechanics, a pilot, or a governance rule when those artifacts are in the diff. They must not claim broad agent-performance improvement unless a larger benchmark with repeated public tasks supports it.

Use this release-note shape for benchmark-driven changes:

- Evidence: exact suite, row count, variants, and validation command.
- Inference: task-family-specific interpretation and caveats.
- Decision: what changed in template, planner, dogfooding, or roadmap priority.
- Unsupported: claims the release intentionally does not make.

## Post-Pilot Decision

The #53 pilot provides directional evidence only:

| Signal | `no-added-guidance` | `heb-planned-core` | Decision |
| --- | ---: | ---: | --- |
| First-trial success | 7/10 | 8/10 | Directional only; do not promote always-on guidance. |
| First-pass green | 6/10 | 6/10 | No first-pass improvement. |
| Route hits | 0/10 | 10/10 | Diagnostic; not a success claim. |
| Stale hits | 3 | 0 | Useful signal for wrong-command tasks, but sample is tiny. |
| Median token estimate | 4,750 | 6,250 | HEB cost increased and must be reported. |
| Median wall time | 340s | 420s | HEB time increased and must be reported. |
| Repeated-subset success | 1/2 | 2/2 | Directional; needs a true adaptive episode before promotion. |

Roadmap action from the pilot: explicitly reject expanding always-on template guidance from these results. Close #54 with this governance rule, and close parent #31 once #51 through #54 are complete. Do not open a larger benchmark-scaling issue until a future template, planner, or dogfooding decision needs stronger evidence.

## Rerun And Retirement

Rerun the benchmark before using benchmark evidence to justify a nontrivial template or planner expansion. A rerun should add at least one non-doc fixture and one true adaptive correction episode before making self-correction claims.

Retire or narrow benchmark fields that are hard to collect consistently, remain diagnostic only across two audit windows, or do not influence a roadmap or template decision. If no decisions use benchmark results over two release cycles, keep only the runner/schema validation and stop treating benchmark reporting as an active governance surface.
