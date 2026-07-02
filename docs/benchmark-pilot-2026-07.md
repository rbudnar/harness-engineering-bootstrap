# First HEB Benchmark Pilot

Issue: #53
Parent: #31
Depends on: #51, #52
Feeds: #54 governance feedback

## Scope

This is the first checked-in HEB benchmark pilot artifact. It uses the #52 runner schema against a small public fixture suite so the project has raw rows to inspect before making governance claims.

The pilot is intentionally modest:

- 10 fixed tasks against one pinned fixture repository.
- 2 static variants: `no-added-guidance` and `heb-planned-core`.
- 2 wrong-command-family tasks repeated for a second trial to expose early reliability noise.
- Manual-adapter scoring from deterministic task outcomes and review notes.

This is not a general model benchmark. It does not prove HEB improves agents globally, and it should not be used for release marketing.

## Artifacts

- Manifest: `test/fixtures/benchmark-pilot-2026-07/tasks.json`
- Raw rows: `test/fixtures/benchmark-pilot-2026-07/results.jsonl`
- Validation:
  - `node scripts/benchmark-runner.mjs validate --manifest test/fixtures/benchmark-pilot-2026-07/tasks.json`
  - `node scripts/benchmark-runner.mjs validate-results --manifest test/fixtures/benchmark-pilot-2026-07/tasks.json --out test/fixtures/benchmark-pilot-2026-07/results.jsonl --artifacts-dir test/fixtures/benchmark-pilot-2026-07`

## Results

First-trial task outcomes:

| Variant | Tasks | Success | First-pass green | Route hits | Stale hits | Median token estimate | Median wall time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `no-added-guidance` | 10 | 7/10 | 6/10 | 0/10 | 3 | 4,750 | 340s |
| `heb-planned-core` | 10 | 8/10 | 6/10 | 10/10 | 0 | 6,250 | 420s |

Repeated subset outcomes:

| Variant | Repeated trials | Success | Same-family stale-hit recurrence |
| --- | ---: | ---: | ---: |
| `no-added-guidance` | 2 | 1/2 | 1/2 |
| `heb-planned-core` | 2 | 2/2 | 0/2 |

## Findings

- HEB planned core improved first-trial success by one task in this tiny fixture suite, but first-pass green did not improve.
- HEB reduced wrong-command recurrence in the repeated subset, but the sample is far too small to treat that as stable.
- HEB increased context use: median token estimate and median wall time were higher than the no-guidance baseline.
- One HEB row failed because the guidance was too vague for a domain-gotcha task; a route hit was not enough to produce success.
- One HEB row failed from control harm: the agent followed guidance into unnecessary files even though the task asked for a README-only change.

## Caveats

This pilot has large uncertainty. With 10 first-trial tasks per variant, a one-task success delta is directional only. A rough binomial standard error for each success rate is about 13-14 percentage points, so this pilot cannot support a general HEB-improves-success claim.

The suite also uses one tiny fixture repository. It exercises runner mechanics, route use, and obvious failure families, but not real downstream repository complexity.

## Implications For #54

- Do not promote new always-on guidance from this pilot.
- Require benchmark-driven changes to name the task family and the tradeoff they affect.
- When HEB loses on success, recurrence, cost, or time, the follow-up should tighten trigger evidence, shorten wording, or retire the guidance before considering expansion.
- Treat route hits as diagnostic, not as a success metric.
- Any governance rule should require cost/time tradeoff reporting when HEB beats a simpler baseline.
- The next benchmark should add at least one non-doc fixture and one true adaptive correction episode before claiming self-correction evidence.

## Decision

This pilot unblocks #54, but it does not justify expanding the template. The governance rule in `docs/benchmark-governance.md` rejects new always-on guidance from this pilot, requires benchmark summaries to separate evidence from inference and unsupported claims, and closes the #31 benchmark roadmap once #54 lands.
