# Harness Engineering Bootstrap

A practical bootstrap template for creating a self-maintaining, token-efficient agent harness in a software repository.

The goal is not to add more documentation. The goal is to help coding agents load the right context at the right time, keep always-on instructions small, enforce drift mechanically where possible, and grow the harness only when repeated misses or real dependencies justify it.

## Contents

- [Template](templates/Harness%20Engineering%20Bootstrap.md) - the current bootstrap template.
- [Dogfooding guide](docs/dogfooding.md) - how this repo keeps the template from becoming a fat harness.
- [Template fitness check](scripts/template-fitness.mjs) - local and CI bloat guard for template changes.
- [Bootstrap planner](scripts/harness-bootstrap-plan.mjs) - read-only repo survey that emits review-ready markdown or JSON.
- [Changelog](CHANGELOG.md) - version history and major design changes.
- [References](REFERENCES.md) - source material and related work used while developing the template.
- [Version marker](VERSION) - current template version for tags and releases.

## What This Template Emphasizes

- Thin cross-agent entry points such as `AGENTS.md`.
- Thin Claude, Gemini, and Copilot adapters that route back to the same source of truth.
- Task-routed docs instead of broad context loading.
- Decision memory, data contracts, and repo contracts.
- Deterministic quality gates and harness validation.
- A read-only bootstrap planner CLI for first-pass repo surveys and review-ready setup plans.
- Minimal local metrics first; PR metrics and scheduled reporting only when triggered.
- Guide/sensor and computational/inferential control taxonomy.
- Programmatic state surfaces before raw context dumps.
- Optional URL-fetchable context maps for remote agents.
- A harnessify path for turning repeated agent friction into the smallest durable control.
- Replaceable, thin scaffolding with model/tool-upgrade review triggers.
- Triggered agent-runtime safety docs for tools, credentials, approvals, audits, and autonomous jobs.
- Triggered behavioral-drift sensors and evidence packs for long-running or source-heavy agent work.
- Explicit self-correction rules so repeated agent mistakes become repo-owned harness updates or visible markers.
- Semantic-scope checks so broad migrations and user-visible control changes verify their payoff before scaling.
- Layer mapping, progressive disclosure, optional OTel/MCP guidance, and decision-observability checks for mature harnesses.

## Dogfooding This Template

This repo uses a deliberately small harness to test the template against its own principles. `AGENTS.md` stays thin, Claude/Gemini/Copilot adapters point back to it, `docs/dogfooding.md` defines the admission test and automated PR loop for daily suggestions, and the fitness check rejects avoidable bloat in always-on guidance and template growth.

Run the local gate after template or harness edits:

```bash
node scripts/template-fitness.mjs
```

To check an automation proposal file before accepting it:

```bash
node scripts/template-fitness.mjs --suggestion path/to/suggestion.md
```

Run the bootstrap planner before testing the template against another repo:

```bash
node scripts/harness-bootstrap-plan.mjs --repo path/to/repo
node scripts/harness-bootstrap-plan.mjs --repo path/to/repo --json
node scripts/harness-bootstrap-plan.mjs --repo path/to/repo --mode update --target-version <tag>
```

## Release And Update Path

`VERSION`, `CHANGELOG.md`, and GitHub tags/releases are the template release source of truth. Repositories that adopt this template should record accepted bootstrap metadata in `docs/harness-version.json` or `.harness/harness-version.json` so later planner runs can distinguish first-time bootstraps from template updates.

For an already-bootstrapped repository, run the planner in update mode against the target tag before writing files. The plan should classify each upstream template change as already satisfied, applicable, intentionally rejected as bloat, or blocked, and it should name the rollback path before the update PR is merged.

## How To Use

Copy the template into a target repository and adapt it to that repository's actual stack, workflows, risks, and existing documentation. Do not copy every optional module by default. The template is intentionally more detailed than the files it asks you to create.

Start with the required core, then add optional modules only when the repository has a real trigger for them and a smaller existing control would not be enough.

## License

This project is dedicated to the public domain under [CC0 1.0 Universal](LICENSE).

You may copy, modify, distribute, and use the template without permission or attribution. Credit is appreciated but not required.
