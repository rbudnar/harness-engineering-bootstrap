# Harness Engineering Bootstrap

A practical bootstrap template for creating a self-maintaining, token-efficient agent harness in a software repository.

The goal is not to add more documentation. The goal is to help coding agents load the right context at the right time, keep always-on instructions small, enforce drift mechanically where possible, and grow the harness only when repeated misses or real dependencies justify it.

HEB is a governance and routing layer built on open agent instruction formats. Use `AGENTS.md` as the canonical repository instruction file, with provider-specific files as thin adapters. When a repeated procedural workflow truly needs a reusable capability, package it as a `SKILL.md` directory aligned with the [Agent Skills specification](https://agentskills.io/specification) instead of expanding always-on guidance.

## Getting Started

Start with the bootstrap planner. It is read-only: it surveys a target repository and prints a review-ready harness plan, but it does not write files into that repository. Run it from a checkout, or from a tagged GitHub package spec once that tag includes the package entrypoint.

Requirements: Git, Node.js 20 or newer, and no `npm install` step.

```bash
git clone https://github.com/rbudnar/harness-engineering-bootstrap.git
cd harness-engineering-bootstrap
node scripts/harness-bootstrap-plan.mjs --repo /absolute/path/to/target-repo
```

GitHub tag usage avoids the public npm registry while still using the dry-run package bin:

```bash
npm exec --yes --package=github:rbudnar/harness-engineering-bootstrap#vX.Y.Z -c "harness-bootstrap init --repo /absolute/path/to/target-repo"
```

On Windows, direct checkout usage is `node .\scripts\harness-bootstrap-plan.mjs init --repo C:\Users\you\Documents\repos\target-repo`. `init` prints a plan only; `--write` is intentionally unsupported until a separate issue approves write-mode evidence, rollback, and generated-file scope. Public npm registry usage, such as `npm exec --package=@rbudnar/harness-engineering-bootstrap -c "harness-bootstrap init --repo <repo>"`, is also unsupported until a publishing issue approves package contents, provenance, rollback, and credentials.

Read the generated plan before copying or creating anything. The most important sections are:

- `Required Core`: the smallest always-on harness the repo appears to need.
- `Triggered Optional Modules`: optional controls with local trigger evidence.
- `Explicitly Rejected Modules`: things the planner intentionally did not recommend.
- `Validation Steps`: commands or checks to run before accepting the harness.

Apply only the items you accept in the target repo, usually starting with a thin `AGENTS.md` and any tiny provider adapters that point back to it. Use [the template](templates/Harness%20Engineering%20Bootstrap.md) as reference material while implementing the plan; do not copy every optional module by default.

After changes in the target repo, rerun the planner and the target repo's validation commands. To capture machine-readable planner output:

```bash
node scripts/harness-bootstrap-plan.mjs --repo /absolute/path/to/target-repo --json
```

For a repository that is already bootstrapped, use update mode against the release tag you want to adopt:

```bash
node scripts/harness-bootstrap-plan.mjs --repo /absolute/path/to/target-repo --mode update --target-version v0.1.0
```

## Contents

- [Getting Started](#getting-started) - how to run the read-only bootstrap planner against a downstream repository.
- [Template](templates/Harness%20Engineering%20Bootstrap.md) - the current bootstrap template.
- [Dogfooding guide](docs/dogfooding.md) - how this repo keeps the template from becoming a fat harness.
- [Template fitness check](scripts/template-fitness.mjs) - local and CI bloat guard for template changes.
- [Bootstrap planner](scripts/harness-bootstrap-plan.mjs) - read-only repo survey that emits review-ready markdown or JSON.
- [Package metadata](package.json) - local and GitHub-ref bin entrypoint for the read-only planner.
- [Changelog](CHANGELOG.md) - version history and major design changes.
- [Release policy](docs/releases.md) - HEB version, tag, release-note, and update metadata contract.
- [References](REFERENCES.md) and [contract memory skill](.agents/skills/contract-memory/SKILL.md) - source material plus the first progressive-disclosure skill prototype.
- [Version marker](VERSION) - current template version for tags and releases.

## What This Template Emphasizes

- Thin cross-agent entry points such as `AGENTS.md`.
- Thin Claude, Gemini, and Copilot adapters that route back to the same source of truth.
- Compatibility with the open `AGENTS.md` format and Agent Skills specification-aligned `SKILL.md` packages.
- Task-routed docs instead of broad context loading.
- Decision memory and trigger-gated contract memory for external data and cross-repo assumptions.
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

For downstream bootstrapper runs, use [Getting Started](#getting-started) above.

## Release And Update Path

`VERSION`, `CHANGELOG.md`, `docs/releases.md`, and GitHub tags/releases are the template release source of truth. `VERSION` stores the numeric value such as `0.1.0`; release tags use the `v0.1.0` form.

Stable releases are automated on merged PRs with exactly one release label: `release:current`, `release:patch`, or `release:minor`. Current releases publish the existing `VERSION` only when `CHANGELOG.md`'s `## Unreleased` section has no pending notes. Patch and minor releases promote `## Unreleased` notes, bump `VERSION`, commit directly to `main`, tag the release, and create a GitHub Release.

Repositories that adopt this template should record accepted bootstrap metadata in `docs/harness-version.json` or `.harness/harness-version.json` so later planner runs can distinguish first-time bootstraps from template updates.

For an already-bootstrapped repository, run the planner in update mode against the target tag before writing files. The plan should classify each upstream template change as already satisfied, applicable, intentionally rejected as bloat, deferred, or blocked, and it should name the rollback path before the update PR is merged.

## How To Use

Copy the template into a target repository and adapt it to that repository's actual stack, workflows, risks, and existing documentation. Do not copy every optional module by default. The template is intentionally more detailed than the files it asks you to create.

Start with the required core, then add optional modules only when the repository has a real trigger for them and a smaller existing control would not be enough.

## License

This project is dedicated to the public domain under [CC0 1.0 Universal](LICENSE). You may copy, modify, distribute, and use the template without permission or attribution. Credit is appreciated but not required.
