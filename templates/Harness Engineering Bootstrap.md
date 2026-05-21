# Harness Engineering Bootstrap

Use this template to set up a self-maintaining, token-efficient agent harness for a repository. It is designed for Codex, Claude Code, Gemini CLI, Copilot, Cursor, Windsurf, and similar coding agents.

The harness goal is not "more docs." The goal is a repository that gives agents the right context at the right time, catches drift mechanically, grows when real context gaps appear, and improves based on measured evidence rather than feel.

## Prerequisites

- An existing repository with source code
- A normal way to run tests or quality checks
- CI, or a clear path to add CI
- GitHub CLI (`gh`) available if you want GitHub PR/comment metrics

If the repository lacks tests, CI, linting, or type checks, bootstrap those basics first or include them in the harness setup.

## Instructions for the Agent

> I want you to set up a harness engineering system for this repository.
>
> Optimize for:
> - Correct context at the right time
> - Low always-on token cost
> - Cross-agent consistency
> - Mechanical enforcement over verbal reminders
> - Explicit data and cross-repo contracts when triggered
> - Self-growth from repeated agent mistakes and missing context
> - Rot prevention and measurable improvement over time
>
> First inspect this repository's actual stack, layout, tests, CI, external data dependencies, cross-repo dependencies, and existing docs. Do not blindly create every optional artifact below. Use the required core, then add optional modules only when the repository has enough complexity or trigger evidence to justify them.
>
> Treat this as harness engineering: give agents a map, deterministic gates, and feedback loops. Do not create a giant instruction manual.

## How to Use This Template

This bootstrap document is intentionally more detailed than the files it creates. Do not copy it wholesale into the repository.

Use it in this order:

1. Survey the repository and produce a short setup plan.
2. Create the required core: `AGENTS.md`, `docs/README.md`, architecture docs, decision memory, testing docs, CI/CD docs, human guide, one exact unified quality-gate command, harness validation, and a minimal local metrics baseline.
3. Add optional modules only when their trigger conditions are already present.
4. Establish a baseline so future harness changes can be measured.

Required core:

- Thin cross-agent entry point
- Task-routed docs
- Decision memory
- Deterministic quality gate
- Provider-memory precedence rule
- Harness validation
- Minimal local harness metrics
- Human guide

Triggered modules:

- Data contracts for external data semantics
- Repo contracts for cross-repo assumptions
- Internal data-store docs for repo-owned persistence formats, migrations, locks, and schemas
- References for private, version-sensitive, or repeatedly misunderstood procedures
- Path-scoped instructions for subtrees with real local policy
- Feedback log and regression evals for mature or high-iteration repos
- GitHub/PR workflow metrics and scheduled trend reports for active PR workflows
- URL-fetchable context maps for remote agents or one-shot URL bootstrap
- Agent-readable health report for mature harnesses with several validators/metrics
- Harnessify/workflow-to-control skill or guide for repeated agent friction
- Agent runtime safety docs for repositories that let agents touch real systems, secrets, user data, or autonomous jobs
- Behavioral drift sensors for long-running agents with stable behavioral anchors or repeated drift failures
- Evidence packs for source-heavy research tasks where claims need traceable support
- Fault-injection/resilience tests for production agent runtimes or brittle tool integrations
- Token-efficient code-search adapters for very large repositories where `rg` plus selective reads becomes too expensive

## Core Principles

1. **Small always-on context.** Files that every agent auto-loads must stay short and actionable. Put maps and routing instructions there, not full architecture manuals.
2. **Context is pulled, not pushed.** Agents should load the smallest relevant context at the time they need it.
3. **Facts have owners and lifecycle.** Decisions, contracts, and references can be active, draft, deprecated, or superseded. Stale instructions are bugs.
4. **Memory is typed.** Keep instructions, decisions, semantic facts, data contracts, repo contracts, and episode history separate so agents do not confuse old events with current truth.
5. **Missing context is a harness signal.** If an agent must guess, repeatedly ask, or rediscover the same fact, the harness is missing a durable context route.
6. **Procedures belong in executable tools where possible.** If a rule can be checked by a script, encode it in a script and CI, not only in prose.
7. **Self-growth must be evidence-driven.** Add harness surface only when a trigger appears: repeated confusion, external dependency, domain invariant, review miss, or measurable rot.
8. **Classify controls.** Treat every important harness artifact as a guide or sensor, and as computational or inferential. Guides steer before the agent acts; sensors observe after it acts and help it self-correct.
9. **Left-shift cheap feedback.** Run fast deterministic sensors as early as possible: local hooks, agent self-checks, CI, and scheduled audits. Reserve expensive inferential review for changes where semantic judgment is worth the cost.
10. **Every control encodes an assumption.** Record what failure mode a nontrivial control prevents, what signal proves it is useful, and when to retire or weaken it.
11. **Prefer programmatic state surfaces.** Put large, changing, or inspectable state in deterministic artifacts that agents can query, such as files, generated schemas, logs, structured traces, snapshots, or CLI outputs. Feed the model pointers and summaries before dumping raw state into context.
12. **Keep scaffolding replaceable.** Treat bespoke orchestration, tool wrappers, memory layers, and multi-agent topologies as capability-era controls. Keep the harness thin, push domain process into routable skills/docs, push repeatable execution into deterministic tools, and make every nontrivial scaffold easy to reassess when models or first-party harnesses improve.
13. **Verify semantic payoff before scaling work.** Treat issue bodies, handoff docs, and PRD prose as hypotheses. Before broad migrations or user-visible control changes, verify the central claim against running behavior, rendered output, or source that owns the display.
14. **Measure the harness.** Track token pressure, drift, CI quality, PR velocity, repeated corrections, control coverage, contract coverage, and runtime safety over time.

## Harness Layer Map

Use this ETCLOVG layer map when auditing coverage or explaining where a control belongs. It is a vocabulary adapter, not a required reorganization of the repository:

| Layer | What It Covers | Template Surfaces |
|---|---|---|
| Execution | Runtime environment, sandboxing, filesystem/network boundaries, credentials, isolation | quality gates, `docs/agent-runtime.md`, CI/CD docs |
| Tooling | Tool interfaces, MCP servers, CLI/API contracts, schemas, permissions | agent-runtime docs, repo/data contracts, validators |
| Context | Progressive disclosure, routers, docs, decisions, references, search indexes | `AGENTS.md`, `docs/README.md`, ADR index, references, evidence packs |
| Lifecycle | Plans, handoffs, orchestration, task state, retries, self-growth | task contracts, harnessify path, plans, memory model |
| Observability | Traces, logs, metrics, audit records, decision outcomes | metrics, health report, OTel spans when enabled |
| Verification | Tests, evals, review harnesses, adversarial validation, fault injection | quality gate, harness evals, review harness, chaos tests |
| Governance | Ownership, approval tiers, safety policy, lifecycle, retirement | human guide, control inventory, agent-runtime safety, decisions |

Every nontrivial control should map to at least one layer. If the map reveals a missing layer, add the smallest useful guide or sensor; do not create empty layer files.

## Phase 0: Repository Survey and Bootstrap Plan

Before writing files, inspect:

- Existing instruction files: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules`, `.windsurf/rules`
- Existing docs: `README.md`, `docs/`, `CONTRIBUTING.md`, architecture notes, ADRs
- Build and test commands from package files, Makefiles, CI workflows, scripts, and README
- Source layout, module boundaries, generated files, migrations, deployment scripts
- CI workflows and required secrets
- Existing guides: agent instructions, skills, task templates, examples, generated references, architecture docs, `llms.txt`, and `llms-full.txt`
- Existing sensors: tests, linters, type checks, structural checks, coverage, security scans, review bots, hooks, observability, browser checks, health reports, and runtime monitors
- External data dependencies: SQL tables, warehouses, APIs, event streams, files, schemas, models
- Cross-repository dependencies: shared packages, generated artifacts, copied logic, upstream implementations, deployment assumptions
- Agent runtime and tool-safety surface: MCP servers, autonomous jobs, write tools, credentials, network egress, approval tiers, audit logs, max runtime, and kill switches
- Observability surface: logs, traces, metrics, run IDs, trace IDs, span hierarchy, audit records, and dashboard/report destinations
- Code-search surface: whether `rg` and selective file reads are enough, or whether a generated search index would materially reduce token load
- Recent commits and PRs, if available, to infer repeated mistakes and non-obvious decisions

Then produce a short setup plan:

- Required harness files to create or update
- Optional files you recommend, with why they are worth the maintenance cost
- Data contracts or repo contracts triggered by existing dependencies
- Deterministic gates to add
- Harness controls to classify as guide/sensor and computational/inferential
- Whether remote agents need URL-fetchable context maps
- Whether skill/task routing has MECE overlap or coverage gaps
- Whether a health-report wrapper would make existing checks more actionable
- Whether agent runtime safety docs are triggered by write tools, secrets, production access, or autonomous workflows
- Whether behavioral drift sensors are justified by long-running sessions or repeated ignored guidance
- Whether source-heavy research needs evidence packs instead of ad hoc links in chat
- Whether OTel-style traces, MCP tool contracts, managed sandboxes, fault injection, adversarial validation, or code-search adapters are triggered by the repo's actual runtime and scale
- Whether migration or refactor guidance should require a user-visible semantic scope check before adding, removing, or moving controls across pages, components, or commands
- Any controls whose maintenance cost or stale assumptions look suspicious
- Any bespoke scaffolding that should have a model/tool-upgrade reassessment trigger
- Measurement script scope
- Any questions for the human where the code cannot answer safely

Proceed after the plan is accepted, unless the human explicitly asked you to implement without a plan gate.

## Phase 1: Required Knowledge Base

Create or update `docs/` as the version-controlled, agent-agnostic knowledge base.

### `docs/README.md` - Start Here and Task Router

Keep this as a map, not a manual. Target under 120 lines for ordinary repositories.

Include:

- What the project is and what problem it solves
- Quick start commands: install, run, test, quality gate
- Documentation map with "when to read" guidance
- Task router: "If the task is X, read Y first"
- Compact route, module, or package inventory only if it helps orientation
- Key external dependencies and services
- Links to deeper docs

Avoid:

- Full directory dumps
- Duplicating architecture details from `docs/architecture.md`
- Long explanations agents can discover from code
- Instructions to read the entire docs tree by default

Example task router:

```markdown
| Task | Read First |
|------|------------|
| Architecture change | `docs/architecture.md`, decision memory |
| CI or release change | `docs/ci-cd.md`, pinning ADR |
| Test change | `docs/testing.md` |
| External SQL/data change | `docs/data-contracts/INDEX.md`, relevant contract |
| Cross-repo dependency change | `docs/repo-contracts/INDEX.md`, relevant contract |
| Established-pattern change | decision index/router, then relevant active decision |
| Domain behavior change | relevant domain doc or glossary |
| Large multi-step work | active execution plan, then task docs |
```

### `docs/architecture.md` - System Shape

Include:

- Module or package boundaries
- Allowed dependency directions
- Data flow and request flow
- Key abstractions and where they live
- Non-obvious runtime behavior: caching, auth, background jobs, migrations, generated code
- Any architecture rules enforced by tooling

### Decision Memory: `docs/decisions.md` or `docs/adr/`

Use one of these based on repo size:

- Small repo or fewer than about 10 active decisions: use `docs/decisions.md`.
- Larger repo, monorepo, or many decisions: use `docs/adr/INDEX.md` plus one ADR file per decision.

Decision memory must be routable. Do not create a long archive that agents must read from top to bottom.

Use a compact index in either format:

- `docs/decisions.md` may be both the index and the decision store while the repo is small.
- `docs/adr/INDEX.md` must be the index once decisions are split into separate files.

The index should let an agent answer: "Which active decisions apply to this task or file path?"

Recommended index columns:

| Column | Purpose |
|---|---|
| ID | Stable decision ID |
| Status | `Proposed`, `Active`, `Deprecated`, or `Superseded` |
| Area | Short domain, such as caching, auth, SQL, UI, CI |
| Applies To | File paths, path globs, modules, tables, services, or commands |
| Read When | Trigger phrase for when an agent should open the decision |
| Rule | One-sentence operational rule |
| Detail | Link to full ADR body, or section anchor if using one file |

Example:

```markdown
| ID | Status | Area | Applies To | Read When | Rule | Detail |
|---|---|---|---|---|---|---|
| D14 | Active | HTML safety | `components/*table*`, `components/*chart*` | using `ui.html(... sanitize=False)` | Escape every interpolated value server-side. | [D14](adr/D14-html-safety.md) |
| D25 | Active | Caching | `services/data_service.py`, `services/disk_cache.py` | changing cache keys, invalidation, or Databricks fetches | Preserve the L1/L2/L3 cache contract and documented invalidation semantics. | [D25](adr/D25-disk-cache.md) |
```

Full decision bodies may be verbose, but the index must stay compact. Agents should read the index first, then open only the matching decisions unless the task explicitly asks for a full decision audit. File names should match the repository's decision ID convention, including any padding width, such as `ADR-026-thin-agent-entry-points.md` for three-digit ADR IDs or `D14-html-safety.md` for short decision IDs.

Decision memory must not become an unrouted archive. When decision memory starts getting hard to scan, add an authoritative compact decision index with routing metadata immediately.

For small or medium repositories, `docs/decisions.md` may remain a single file if it has a compact index at the top and agents can identify relevant active decisions without reading the whole file.

For larger or higher-churn decision memory, splitting is the default implementation. Split `docs/decisions.md` into `docs/adr/INDEX.md` plus one file per decision when any of these are true:

- Active-decision count exceeds about 25.
- `docs/decisions.md` exceeds about 700-1000 lines.
- `docs/decisions.md` exceeds about 300-500 lines and decisions are no longer easy to scan.
- Multiple areas or teams contribute decisions.
- Agents or reviewers repeatedly miss relevant decisions.
- Decision bodies need long rationale, alternatives, or incident history.

At or above these thresholds, choose one outcome before declaring the bootstrap complete:

1. Split ADR bodies into `docs/adr/<id>-<slug>.md` files, or another documented stable naming pattern, and keep `docs/adr/INDEX.md` as the authoritative first-read surface.
2. Defer splitting as an accepted temporary harness gap, with a reason, owner or follow-up, and a compact index/router still added in the same bootstrap.

Do not leave a long unindexed `docs/decisions.md` as an accepted final state. Do not split decisions unless the index remains authoritative and validated.

When splitting from `docs/decisions.md` to `docs/adr/`, keep `docs/decisions.md` as a short redirect shim to `docs/adr/INDEX.md` if existing PRs, docs, memories, or external links may still point at it. Delete the old file only after the split PR records a link inventory, such as repo search plus any docs link checker, confirming it is no longer a useful route.

Each decision must include:

- Stable ID: `ADR-0001` or `D1`
- Title
- Status: `Proposed`, `Active`, `Deprecated`, or `Superseded`
- Date
- Scope
- Area
- Applies To
- Read When
- Decision
- Why
- Trade-offs and rejected alternatives
- Consequences
- Review rules, if this decision should affect PR review
- `Supersedes` / `Superseded by`, when relevant

Active decisions are current truth. Deprecated or superseded decisions are preserved for history but must not drive new code or review comments.

For repos with many active or verbose decisions, add `scripts/decision-router.sh`, `scripts/decision-router.py`, or `scripts/decision-router.mjs`.

The router should accept changed files, task labels, or both, and print relevant active decisions:

```bash
./scripts/decision-router.py --files services/data_service.py components/activity_table_html.py
./scripts/decision-router.py --task "change Databricks cache behavior"
```

The router can be simple. A path-glob and keyword match over the decision index is enough at first. Prefer deterministic routing over vector search for PR-time checks.

Expected output:

```text
Relevant active decisions:
- D14 HTML safety: components/*table*, components/*chart*
- D22 Databricks wrapper: services/data_service.py
- D25 Disk cache: services/data_service.py, services/disk_cache.py
```

Use the router in PR checks or job summaries when changed files intersect decision-covered paths. This catches missing decision context without requiring agents to read every decision.

The router should be checked for MECE quality:

- Mutually exclusive: one changed path or task should not route to multiple conflicting decisions unless chaining is intentional and documented.
- Collectively exhaustive: common task types should not fall through with no relevant route when active decisions clearly apply.
- Exceptions are allowed when a task genuinely crosses domains, but the output should make the relationship clear.

At bootstrap time, require at least a manual MECE note or validator warning when routed decisions, docs, or skills already exist. The harness validator should eventually check:

- Every active decision has `Area`, `Applies To`, and `Read When` routing fields or appears in the compact decision index.
- Router output excludes deprecated and superseded decisions.
- Review rules cite only active decisions.
- `harness:miss-decision-route` markers are counted so router gaps become measurable.

### `docs/testing.md` - Test Strategy

Include:

- Test commands
- What to test and what not to test
- Mocking and fixture boundaries
- Slow or external tests
- Current coverage map if useful and mechanically maintainable

### `docs/ci-cd.md` - Automation and Release

Include:

- CI jobs and what they check
- Required secrets and environment variables
- Deployment flow
- Release or tagging rules
- Which checks are authoritative before merge

### `docs/human-guide.md` - Human Role

Include:

- What the harness handles automatically
- A compact control inventory: each important guide or sensor, whether it is computational or inferential, when it runs, and what failure mode it prevents
- When humans should intervene
- How to review agent PRs
- How to add or revise decisions
- How to report a repeated agent mistake so the harness improves
- How to run a periodic harness audit

Recommended control inventory columns:

| Control | Direction | Execution | Lifecycle | Failure mode prevented | Owner / source |
|---|---|---|---|---|---|
| `AGENTS.md` | Guide | Inferential | Session start | Wrong context loading and broad doc scans | `AGENTS.md` |
| `npm run lint` | Sensor | Computational | Local + CI | Style and architecture drift | `eslint.config.*` |
| Review harness / PR bot | Sensor | Inferential | PR review | Semantic regressions and missed harness updates | `docs/review-harness.md` or `docs/human-guide.md` |

Direction values: `Guide`, `Sensor`, or `Guide + Sensor`.
Execution values: `Computational`, `Inferential`, or `Hybrid`.
Lifecycle values should be concrete: session start, pre-commit, pre-push, local gate, PR CI, scheduled audit, runtime, or release.

For nontrivial controls, document the assumption behind the control and the retirement signal. Example:

```markdown
Assumption: Agents frequently miss layer-boundary rules from prose alone.
Control: ESLint `no-restricted-imports` layer rules.
Signal: Layer violations are caught locally/CI with actionable errors.
Retire or weaken when: The architecture changes and a replacement structural check exists.
```

## Phase 2: Optional Context Modules Triggered by Evidence

Do not create empty optional systems. Install trigger rules so future agents know when optional modules become required.

Default to zero optional modules. Optional modules are admitted only when they pass this test:

- Trigger evidence: a current repo fact, repeated miss, safety risk, token-cost problem, or runtime/tool complexity already exists.
- Failure mode: the module prevents a specific mistake, drift pattern, safety issue, or repeated human correction.
- Smaller-control check: a smaller doc section, ADR entry, script check, PR-template prompt, or route update is not enough.
- Progressive-disclosure route: agents can find the module only when needed; it does not become broad always-on context.
- Validation signal: a sensor, metric, marker, review checklist, or explicit audit step can show whether it helps; do not create a new sensor just to satisfy this item.
- Retirement or revisit rule: the module has an owner and source of truth plus a condition for weakening, deleting, or revisiting it.

If any item is missing, do not add the module yet. Record the trigger rule or follow-up marker instead. If several modules are triggered at once, prioritize the one or two that reduce the highest-risk repeated failure or largest token waste, and record the rest as follow-up.

### `docs/references/`

Use for private, version-sensitive, repeatedly misunderstood, or task-oriented references.

Good contents:

- Non-obvious implementation procedures
- Private API behavior
- Version-specific library behavior
- Domain logic that agents repeatedly need
- Common failure modes and correct patterns

Each file should be small, focused, indexed, and explicit about when to read it.

Do not mirror public docs that agents can cheaply and reliably fetch when needed.

If the repository already has a convention such as `docs/llm-references/`, use that existing name. Otherwise prefer `docs/references/` to avoid making the docs feel agent-only when the content is useful to humans too.

### `llms.txt` and `llms-full.txt`

Use only when agents may need to orient from a URL before cloning the repo, or when the repo is frequently inspected by browser-based agents, ChatGPT, Copilot, remote code-review agents, or other tools that benefit from a single raw fetch. Do not create URL-fetchable maps for private or sensitive context unless the repo owner explicitly accepts the exposure and access model.

Purpose:

A URL-fetchable context map is an adapter for remote agents. It is not a replacement for `AGENTS.md` or the repo docs. It points external agents at the same canonical sources a local agent would read.

Recommended files:

```text
llms.txt       # compact context map and raw links
llms-full.txt  # optional one-fetch bundle with the map plus core docs inlined
```

Before adding URL maps, verify:

- The mapped context is safe for the intended audience and does not expose private data, secrets, customer details, or sensitive internal semantics.
- Links are generated for the intended repository URL, branch, or immutable ref.
- Private docs are omitted, summarized safely, or clearly gated behind authenticated access.
- The generation command is documented so stale maps can be detected and rebuilt.

`llms.txt` should include:

- One-paragraph project summary
- Raw links to `AGENTS.md`, `docs/README.md`, decision index, contract indexes, review harness, and install/run docs
- Read order for common tasks
- Trust boundary and privacy warning when relevant
- Regeneration command if links depend on repository URL or branch

`llms-full.txt` is optional and should be generated, not hand-maintained. Include only stable core docs that help a remote agent start correctly. Do not inline long ADR archives, generated schemas, private data contracts, or anything likely to rot quickly.

Validation should check that URL maps point to existing files, exclude disallowed private/sensitive paths, and are regenerated when the repository URL, branch/ref, or core context map changes.

### `docs/task-contracts/` or `docs/exec-plans/`

Use only for long-running, multi-agent, or handoff-heavy work where a short prompt is not enough to preserve intent.

Purpose:

Task contracts make large work testable before implementation starts. They are especially useful when one agent plans, another implements, and a third reviews or evaluates.

Trigger conditions:

- The work spans multiple sessions, agents, branches, or PRs
- The task has ambiguous product behavior or UX acceptance criteria
- The task has multiple independently testable slices
- A previous long-running task drifted away from the user's actual goal
- Humans need to approve behavior before implementation details are chosen

Each task contract should include:

- Goal and non-goals
- User-visible acceptance criteria
- Architecture and contract constraints already known
- Sprint or slice boundaries, if useful
- Testable behaviors and verification commands for each slice
- Handoff state: current status, open questions, and next action
- Retirement rule: delete, archive, or convert durable lessons into docs/ADRs/contracts after the work lands

Do not turn every task into a checked-in plan. For short work, an agent's session-local plan is enough. Checked-in task contracts are for work where durable coordination is worth the maintenance cost.

### `docs/evidence-packs/` or `docs/research/`

Use only for source-heavy research, policy, compliance, legal, competitive, technical-decision, or external-reference tasks where agents repeatedly need to assemble claims from many sources and preserve why a conclusion was reached.

Purpose:

Evidence packs keep research context traceable without dumping every source into always-on docs. They are useful when a later agent must distinguish supported claims, open gaps, contradictions, and source freshness.

Do not create this for ordinary coding work, small documentation updates, or one-off web lookups whose sources are already cited in a PR or ADR.

Each evidence pack should include:

- Research question and decision it supports
- Claim list, each linked to source-backed evidence
- Evidence nodes: source URL or repo path, date accessed, short summary, confidence, and relevant quote or line pointer when allowed
- Contradictions, missing evidence, and unresolved questions
- Freshness risk: which facts are likely to drift
- Synthesis: what should change in the repo, if anything
- Retirement rule: convert durable decisions into ADRs/docs/contracts, then archive or delete the evidence pack

For broad research, prefer a navigator/searcher split as a workflow pattern, not a permanent multi-agent framework: one agent owns the evidence graph and gap list, while independent searches fill specific missing evidence.

### Code Search Adapters

Use only when repository scale, generated code, polyglot structure, or repeated agent token waste makes plain `rg` plus selective file reads insufficient.

Purpose:

A code-search adapter gives agents a low-token way to find relevant files, symbols, and examples before reading source. It is a retrieval surface, not a replacement for deterministic tests, type checks, or direct code inspection before editing.

Trigger conditions:

- Agents repeatedly open large files or many irrelevant files before finding the right implementation.
- `rg` finds too many lexical matches, or important matches require semantic/symbol search.
- The repo is a monorepo, has many generated files, or has multiple implementations with similar names.
- Token-pressure metrics show code discovery is a meaningful cost.

Guidelines:

- Keep `rg` as the default first tool for exact text, filenames, and identifiers.
- Add an indexed search adapter only when it has a documented build/update command, ignored paths, freshness check, and fallback behavior.
- Prefer hybrid lexical plus semantic retrieval for natural-language questions; prefer exact search for symbols, IDs, generated artifacts, and migration names.
- Validate that the adapter reduces tokens or wall time on a small fixed task set before adding it to normal agent instructions.
- Treat packages such as Semble as optional adapters, not required infrastructure.

### `docs/agent-runtime.md` or `docs/agent-runtime-safety.md`

Create when this repository ships, configures, or operates agents, MCP servers, tool-calling workflows, scheduled automations, or low-code/no-code agent flows that can act outside a local development sandbox.

Purpose:

Agent runtime docs describe the production constraint surface around agents. They make permissions, credentials, approvals, observability, retries, and intervention paths explicit so safety is enforced by configuration and tooling rather than prompt-only reminders.

Do not create this for a repository that only uses coding agents locally with ordinary development tools and no durable external access. Capture ordinary review expectations and local tool usage in `docs/human-guide.md` instead.

Trigger conditions:

- An agent can mutate external state: deploy, merge, send messages, update tickets, write databases, change cloud resources, or call paid APIs.
- An agent can read sensitive data: user data, secrets, production logs, customer files, private documents, or authenticated browser sessions.
- MCP servers, browser agents, scheduled scouts, background agents, hooks, plugins, or CI jobs run with shared credentials.
- The workflow runs for long periods or without continuous human supervision.
- Prompt injection, tool-output injection, data exfiltration, runaway cost, or duplicate writes would matter.
- Research, training, evaluation, staging, or production harnesses reuse tools or credentials in ways that could blur safety assumptions.

Each agent-runtime doc should include:

- Metadata block and owner
- Runtime scope: which agents, jobs, tools, MCP servers, environments, and entry points it covers
- Tool inventory: tool name, capability, environment, owner, credential source, read/write scope, network scope, and whether it is enabled by default
- Tool contract model: MCP, OpenAPI, JSON Schema, typed SDK, CLI help, or another explicit schema; include versioning, compatibility, and schema-drift validation
- MCP transport boundary (when MCP is used): if the client launches STDIO servers from local config, treat config and registry/install changes as execution-surface changes; require explicit command/args allowlists (no shell), and run servers least-privilege in a sandbox where practical
- Security baseline: OWASP Agentic Application risks or the repository's internal equivalent, mapped to concrete controls
- Permission model: deny-by-default stance, allowlist, scoped tokens/RBAC, network egress rules, and approval tiers for writes
- Sandbox model: workspace boundaries, external read/write restrictions, whether hooks/MCP initialization/plugins are sandboxed, and whether stronger isolation such as managed sandboxes, microVMs, containers, VMs, or remote execution environments is required
- Secret model: no ambient host credentials by default; explicit task-scoped secret injection or a credential broker for short-lived credentials where practical
- Action safety: idempotency expectations, retry policy, rate and cost budgets, maximum runtime, duplicate-write prevention, rollback path, kill switch, and escalation route
- Input/output safety: handling for untrusted tool output, prompt injection, tool poisoning, memory poisoning, secret redaction, data retention, and user-visible output review
- Observability: run IDs, trace IDs, audit logs, command logs, traces, screenshots/videos when useful, intervention records, and how to replay or reproduce a run where practical
- OTel guidance when enabled: represent a session or task as a root span; use child spans for planning, model calls, tool calls, MCP requests, tests, retries, human approvals, and handoffs; include attributes for model, tool, route, decision/contract IDs, token/cost estimates, status, and failure category
- Environment split: how production, staging/evaluation, and research/training harnesses differ; what must never be copied from one to another without review
- Verification: exact checks, dashboards, or manual review steps that prove the boundary still works

Required `AGENTS.md` rule when an agent runtime exists:

```markdown
## Agent Runtime Safety

Before changing agent tools, MCP servers, autonomous jobs, credentials, network access, approval tiers, retries, or runtime limits:

1. Read `docs/agent-runtime.md` or `docs/agent-runtime-safety.md`.
2. Keep safety in tool configuration, scoped credentials, checks, or CI where possible; do not rely on prompt text alone.
3. Do not broaden write access, credential scope, network egress, runtime duration, or autonomous behavior without an active decision or explicit human approval.
4. If research/eval tools and production tools differ, preserve the documented boundary and update verification if it changes.
```

### `docs/behavioral-anchors.md`

Use only when long-running agents repeatedly drift from stable behavioral constraints, such as ignoring verification rules, fabricating prior agreement, skipping required escalation, broadening scope, or repeating a known unsafe workflow.

Purpose:

Behavioral anchors make repeated agent-behavior failures observable without making root instructions larger. They can be checked by a lightweight sensor that compares the current task or trace against positive and negative anchors, then emits an advisory warning, context injection, or review marker.

Trigger conditions:

- Long sessions or autonomous runs repeatedly ignore stable project behavior rules.
- Provider memory retrieves the right fact but the agent still fails to act on it.
- Humans repeatedly write the same behavioral correction in PRs or task threads.
- A safety or runtime boundary depends on agents honoring a small set of explicit behavioral constraints.

Each anchor set should include:

- Positive anchors: short, task-shaped examples of desired behavior
- Negative anchors: short, task-shaped examples of known failure modes
- Scope: tools, paths, tasks, or agents where the anchors apply
- Scoring method and threshold, if automated
- Action when triggered: inject context, request review, block only after a low-noise trial, or open a harness issue
- False-positive review process, latency/cost budget, and owner

Do not use behavioral anchors as generic personality tuning. Keep them tied to repeated, measurable failures and retire them if they stop adding signal.

### Agent Runtime Fault Injection

Use only for production agent runtimes, high-risk MCP/tool integrations, or repeated incidents where normal tests miss tool failures.

Purpose:

Fault injection tests whether the harness fails safely when tools and external systems behave badly. It should live near runtime/eval checks, not in always-on instructions.

Trigger conditions:

- Tools time out, rate-limit, return malformed payloads, change schemas, or produce partial results.
- Agent retries have caused duplicate writes, cost spirals, or confusing user-visible output.
- Tool-output prompt injection, schema drift, or degraded upstream services would create safety or correctness risk.
- A production agent runtime needs release confidence beyond ordinary unit and integration tests.

Start with a tiny fault profile set:

- `SchemaDrift`: missing, renamed, extra, or type-shifted fields
- `TimeoutFault`: slow, hanging, cancelled, or rate-limited tool calls
- `MalformedResponseFault`: invalid JSON, truncated output, wrong encoding, or contradictory fields
- `CostSpiralFault`: repeated retries, unexpectedly large outputs, or runaway planning loops
- `ToolPoisoningFault`: hostile instructions or misleading claims embedded in tool output

Run fault injection in a sandbox with fake credentials and explicit cost caps. Promote it to CI only after the tests are deterministic enough to be low-noise. Tools such as `agentfuzz` can be adapters for this module, but do not make a specific package mandatory.

### `docs/internal-data-stores.md` or `docs/internal-data-stores/`

Create when the repository owns persistent local or internal data formats whose correctness matters, such as JSON stores, SQLite databases, cache directories, lockfiles, generated indexes, migrations, or user-editable files that the application reads back.

Purpose:

Internal data-store docs define repo-owned persistence semantics. They prevent agents from guessing schema versions, migration behavior, lockfile safety, atomic-write contracts, cleanup scope, or compatibility expectations.

Default to one consolidated `docs/internal-data-stores.md` file for small repos or a small number of stores. Split to `docs/internal-data-stores/INDEX.md` plus per-store files only when the consolidated file becomes hard to route. In either shape, keep one authoritative index or route so agents can identify the relevant store without reading every store contract.

Trigger conditions:

- The repo persists user data or durable state outside a normal external database
- A file format, cache layout, migration, lockfile, or cleanup rule is not obvious from code
- A PR changes schema versioning, atomic-write behavior, lock paths, retention, migration, or destructive cleanup scope
- Tests or reviews repeatedly explain internal persistence semantics
- The store is not external enough for `docs/data-contracts/`, but is load-bearing for correctness

Each internal data-store entry or split-out doc should include:

- Metadata block and freshness review interval
- Store path or location rules
- Schema/version fields and migration expectations
- Atomic write, locking, concurrency, and sync assumptions
- Cleanup/uninstall safety boundaries
- How to inspect, validate, or repair the store
- Tests or validators that protect the contract

Add these docs to freshness metadata checks once they become load-bearing, such as the repo's docs-with-metadata allowlist or other freshness-validator input. Do not create internal data-store docs for simple ephemeral cache directories with no compatibility or safety contract.

### `docs/data-contracts/`

Create when the repository interacts with external data systems such as databases, warehouses, APIs, event streams, model outputs, or files whose schema and semantics are not fully defined in this repo.

Structure:

```text
docs/data-contracts/
  INDEX.md
  <domain-or-table>.md
  generated/ (optional)
```

Purpose:

Data contracts define the semantic meaning of external data, not just structure. They prevent agents from guessing schema behavior, misinterpreting columns, writing unsafe SQL, or treating column names as sufficient business meaning.

Trigger conditions:

- The repo writes SQL against external tables
- The repo reads from Databricks, a warehouse, production database, analytics database, event stream, external API, or shared dataset
- A PR introduces a new table, view, schema, event, API, model output, or external data source
- A table or field meaning is not obvious from code
- Agents or humans repeatedly explain column meanings, enum semantics, joins, filters, or business rules
- A query depends on domain concepts that are not defined in the repo
- A previous agent made an incorrect data assumption

Each data contract should include:

- Metadata block
- When to read this document
- Source of truth: catalog/schema/table, API, event name, dataset path, or owner
- Critical column meanings and enums
- Common joins or usage patterns
- Known pitfalls or common misunderstandings
- How to inspect or validate the live schema
- Generated schema link, if available

Guidelines:

- Do not duplicate full schemas inline.
- Prefer generated artifacts for full structure.
- Focus human-written text on semantics and correctness.
- Keep each file small enough that an agent can load it only when needed.
- Separate stable meaning from generated structure.

Generated artifacts should be machine-maintained:

```text
docs/data-contracts/generated/
  <table>.schema.json
```

Required `AGENTS.md` rule when data contracts exist:

```markdown
## External Data and SQL

Before writing SQL or changing code that depends on external data:

1. Read `docs/data-contracts/INDEX.md`.
2. Open the relevant table/domain contract.
3. Use documented joins, filters, and semantics.
4. If no contract exists for the data source, create one or flag the gap before relying on assumptions.

Do not infer business meaning from column names alone.
```

### `docs/repo-contracts/`

Create when the repository depends on other repositories for logic, data, generated artifacts, APIs, shared types, models, deployment behavior, or domain assumptions.

Structure:

```text
docs/repo-contracts/
  INDEX.md
  <repo-or-system>.md
```

Purpose:

Repo contracts define what this repository assumes about other repositories. They prevent agents from reimplementing upstream logic, missing critical dependencies, treating copied behavior as the source of truth, or forgetting that another repo owns part of the behavior.

Trigger conditions:

- This repo depends on behavior implemented in another repo
- A PR introduces a dependency on another repo, service, package, generated artifact, model, API, or deployment pipeline
- An agent needs to inspect another repo to understand correct behavior
- Logic is copied, mirrored, derived from, or expected to stay compatible with another repo
- The source of truth for behavior is outside this repo
- Cross-repo assumptions would cause bugs if they changed silently
- A previous agent duplicated or misunderstood upstream behavior

Each repo contract should include:

- Metadata block
- Why the external repo/system matters
- What functionality, data, artifacts, or behavior is relied on
- Where to look: repo plus key files, docs, APIs, or generated artifacts
- Contract assumptions: what is safe to rely on
- How to validate behavior
- Common pitfalls

Guidelines:

- Link to source-of-truth code instead of duplicating logic.
- Capture only critical assumptions.
- Keep documents small and focused.
- Prefer stable interfaces over implementation details.
- Treat stale repo contracts as risk signals, not permanent truth.

Required `AGENTS.md` rule when repo contracts exist:

```markdown
## Cross-Repository Dependencies

Before changing code that depends on another repository or external system:

1. Read `docs/repo-contracts/INDEX.md`.
2. Open the relevant repo/system contract.
3. Prefer the upstream interface or source of truth over duplicating behavior.
4. If no contract exists for the dependency, create one or flag the gap before relying on assumptions.

Do not reimplement upstream behavior unless the contract explains why that is intentional.
```

### `docs/QUALITY_SCORE.md`

Use only for multi-domain or high-churn repos where agents need to know which areas are reliable examples and which areas contain tech debt.

Do not create this for small repos where it will become a stale opinion file.

## Phase 3: Durable Metadata

For durable docs whose content can rot, add lightweight frontmatter. Do not add metadata to tiny stable index files unless it helps.

Recommended fields:

```markdown
---
owner: platform
last_reviewed: 2026-04-24
status: active
scope: "CI, release, and deployment"
used_when: "changing workflows, release scripts, secrets, or deployment"
source_of_truth: "docs/ci-cd.md"
verification: "scripts/validate-harness.py"
supersedes:
superseded_by:
---
```

Rules:

- If a document is superseded, mark it clearly and point to the replacement.
- If the source of truth is outside the repo, link or name it.
- If verification is manual, state the manual procedure.
- If ownership is unknown, write `unknown` rather than omitting the field.
- Prefer approximate but honest metadata over hidden uncertainty.
- The harness validator should flag stale required docs after the repo's chosen review interval.

Metadata exists to reduce context rot. It should not become a bureaucracy.

## Phase 4: Agent Entry Points

Create one canonical shared instruction source and thin wrappers for tools that need their own filenames.

### `AGENTS.md` - Canonical Shared Entry Point

Commit `AGENTS.md` at the repository root.

Target 60-90 lines. It may be longer only if the repo has a strong reason, but keep it well below tool instruction-size limits.

Include:

- Start-here pointer to `docs/README.md`
- Exact install, run, test, and quality-gate commands
- Non-obvious constraints agents routinely get wrong
- Context routing table: "If working on X, read Y first"
- Missing-context rule
- Provider-memory precedence rule
- Harness self-growth trigger rules
- Harness maintenance rules
- Reviewer section pointing to the canonical review harness, such as `docs/review-harness.md` or the review section of `docs/human-guide.md`; tool-specific adapters may point back to it
- Instruction not to duplicate project/domain knowledge in `AGENTS.md`; put it in `docs/`

Do not include:

- Full architecture explanations
- Long style guides
- Generic advice such as "write clean code"
- Task-specific plans
- Historical notes that do not affect current work

Keep stable content first and volatile task-specific context out of `AGENTS.md`. This improves token discipline and lets tools with prompt caching benefit from a stable prefix.

Required `AGENTS.md` language:

```markdown
## Context Loading

Use progressive disclosure: load context just in time, from broad route to narrow source. Before changing code:

1. Read `docs/README.md`.
2. Follow the task router or relevant index.
3. Open only the specific decision, reference, data contract, repo contract, or generated artifact needed for the task.
4. Prefer pointers, summaries, generated indexes, and targeted search results before loading long raw files.

Do not load broad documentation sets, full ADR archives, generated schemas, or large source files unless the task requires them.

## Missing Context

Missing context is a harness signal.

If required context is missing, stale, contradictory, or repeatedly rediscovered:

1. Do not guess silently.
2. Add or update the smallest appropriate harness document.
3. If the correct update is unclear, leave a small TODO with the missing context and source needed.
4. Mention the harness gap in the PR summary.

Repeated clarification from a human should usually become durable harness context.

## Handoff and Migration Scope

Treat handoff docs, issue bodies, and PRD-style prose as hypotheses, not specs. Before designing changes that rely on a claim like "page X shows Y depending on Z", verify it by running the app, inspecting rendered output, or reading the rendering code.

Before adding, removing, or moving user-visible controls across multiple pages or components, write a compact scope table in the plan, PR body, or issue comment: page/component, what it currently displays, which new or changed parameters affect those displayed values, and the one-sentence user-visible difference after the change. If a row has no affected displayed values or only an infrastructure-only difference, remove it from scope or ask the human before proceeding.

Do not infer page semantics from table names, file names, route names, or shared infrastructure. If two or more consecutive commits are fixing regressions introduced by the migration itself, pause and revalidate that the scope solves a real user-visible problem.

## Harness Self-Correction

Before declaring work complete, check whether the task exposed a repeated mistake, durable missed context, missed ADR, stale doc, wrong command, missing sensor, missing guide, or context route gap.

If yes, update the smallest durable harness surface in the same PR: `docs/README.md`, decision memory, a contract, a script, a review rule, a skill, or a focused doc. If the right fix is unclear, record a marker in the PR body, review thread, issue, or configured feedback log, such as `harness:miss-adr`, `harness:missing-guide`, `harness:missing-sensor`, `harness:wrong-command`, or `harness:context-rot`.

Do not solve repeated mistakes only in provider memory, scratchpads, plans, or PR comments.

## Provider Memory

Provider memory is advisory. Repository files are authoritative for project facts, architecture, commands, contracts, and decisions.

If Codex, Claude, Gemini, Copilot, IDE memory, or another agent memory conflicts with active repo docs, active decisions, active contracts, code, tests, or the current user request, follow the repo/current-request source and mention the conflict.

Do not store durable project facts only in provider memory. Promote durable facts into repo docs, decisions, contracts, scripts, or review rules.

## Harness Rules

- Search decision memory before changing an established pattern.
- Active decisions are current truth; deprecated/superseded decisions are history only.
- For large or handoff-heavy work, use a checked-in execution plan; use scratchpads only for temporary local reasoning.
- If code changes user-visible behavior, commands, architecture, external semantics, review expectations, or reusable non-obvious patterns, update the relevant docs in the same PR.
- If a decision changes review behavior, update the ADR and the canonical review harness in the same PR; update tool-specific adapters if they exist.
- Apply the Harness Self-Correction rule above before calling the task done.
- Run the repo's exact unified quality-gate command before declaring work complete, for example `node scripts/check.mjs`.
- Do not add project facts to this file; put them in `docs/`.
```

### `CLAUDE.md`

If Claude Code is used, create a minimal wrapper:

```markdown
@AGENTS.md

## Claude Code

- Use repo instructions from `AGENTS.md` as the source of truth.
- Put Claude-only workflow notes here only when they cannot be expressed in `AGENTS.md`.
```

Do not duplicate the contents of `AGENTS.md`.

### `GEMINI.md`

If Gemini CLI is used, either configure Gemini to load `AGENTS.md` as a context file or create a minimal wrapper:

```markdown
# Gemini Context

Read and follow `AGENTS.md`; it is the canonical repository instruction file.

Do not duplicate repository rules here. Add Gemini-only notes only when necessary.
```

### Nested and Path-Scoped Instructions

Use nested instruction files or path-specific rule systems only when a subtree has real local policy.

Good uses:

- Monorepo packages with different build/test commands
- Frontend and backend stacks with different conventions
- Generated-code directories with strict edit rules
- Security-sensitive or migration-heavy subtrees

Rules:

- Do not repeat global instructions in nested files.
- Keep nested files focused on that subtree.
- Point to relevant active decisions instead of restating long rationale.
- Add nested files to the context routing table.
- Validate that nested files do not duplicate large blocks from root instructions.

### `.github/copilot-instructions.md`

Commit this file when GitHub Copilot Chat, Copilot coding agent, or Copilot code review is used.

This file is a Copilot adapter for the canonical review harness. Keep the canonical review rules in `docs/review-harness.md` or `docs/human-guide.md`, then have Copilot-specific instructions point back to that source.

Required sections:

1. **What this repo is**
   - One short paragraph describing blast radius and review bar.
2. **Before reviewing, read**
   - `AGENTS.md`
   - `docs/README.md`
   - Decision memory: `docs/decisions.md` or `docs/adr/INDEX.md`
   - Relevant data or repo contracts when the diff touches them
3. **Reject outright**
   - Hard rules.
   - Every rule must cite an active decision ID.
   - Each rule should state consequence and suggested fix.
4. **Flag and request justification**
   - Softer rules where exceptions may be valid.
   - Cite decisions or contracts where applicable.
5. **Require before approving**
   - CI and quality gates
   - ADR updates for architectural changes
   - Contract updates for external data or cross-repo dependency changes
   - Docs updates for user-visible behavior, commands, architecture, external semantics, review expectations, or reusable non-obvious patterns
6. **How to phrase comments**
   - Lead with the decision or contract ID when applicable.
   - Quote the relevant line.
   - Link to the decision or contract.
   - Frame soft flags as questions.
7. **Things not to comment on**
   - Findings already handled by formatter, linter, type checker, import linter, or intentionally suppressed rules.
8. **Context rot rule**
   - Never enforce deprecated or superseded decisions or contracts.
   - If review rules conflict with decision/contract memory, comment that the harness is stale rather than enforcing the stale rule.

## Phase 5: Memory Model and Self-Growth

Encode this model into `docs/human-guide.md` and summarize it in `AGENTS.md`.

### Control Types

Use this vocabulary consistently:

| Term | Meaning | Examples |
|---|---|---|
| Guide | Feedforward control that steers the agent before it acts | `AGENTS.md`, task router, skills, architecture docs, examples |
| Sensor | Feedback control that observes after the agent acts | tests, linters, type checks, review agents, browser checks, metrics |
| Computational | Deterministic, fast, CPU/tool-based control | ESLint, TypeScript, dependency graph checks, schema validators |
| Inferential | Model-mediated semantic control | code-review agents, design review skills, LLM judges, prompt-based QA |
| Hybrid | Uses both deterministic tooling and semantic review | `/ship-pr`, full release readiness checks, human review with CI evidence |

Avoid arguing about labels when the action is clear. The purpose is to make coverage and cost visible: a repo should know which controls steer, which controls detect, which are cheap enough to run constantly, and which should be reserved for higher-risk moments.

### Control Priority Layers

Use priority layers to resolve conflicts between controls without inventing a new debate each time.

Default order:

1. Platform, legal, safety, and tool-enforced restrictions
2. Current human request and explicit approval boundaries
3. Repository source of truth: code, tests, CI, active decisions, active contracts, and agent-runtime safety docs
4. Task acceptance criteria and correctness evidence
5. Efficiency, token cost, style, and convenience

If a lower-priority control conflicts with a higher-priority one, follow the higher-priority control and record the stale or conflicting lower-priority control as a harness issue. If two same-priority active controls conflict, stop and ask the human which one to supersede.

### Harness Replaceability

Treat nontrivial harness scaffolding as something to justify and periodically prune, not as permanent product surface.

For bespoke tool wrappers, planner/executor loops, multi-agent graphs, custom memory layers, route optimizers, eval judges, or runtime middleware, record:

- The model or tool limitation this scaffold compensates for
- Why a first-party harness feature, simple repo artifact, skill, script, or deterministic CLI is not enough
- Whether the logic belongs in a guide/skill, deterministic tool, product code, or runtime safety boundary
- The removal cost if the scaffold becomes obsolete
- The review trigger: new model, new first-party harness capability, recurring false positives, runtime overhead, token bloat, or repeated agent confusion

Prefer plain files, git history, structured task contracts, skills, and small deterministic tools before adding opaque framework layers. When a model or agent tool improves, run a short upgrade review: strip away scaffolding that is no longer load-bearing, then use the regression eval or harness metrics to confirm the removal did not hurt outcomes.

### Multi-Agent and Handoff Patterns

Keep multi-agent structure explicit and small.

Use:

- Skills when the repo needs a reusable procedure or judgment pattern.
- Routers when the problem is choosing the right context or procedure.
- Subagents when the work is truly parallel, requires context isolation, or benefits from independent review.
- Handoffs or task contracts when work spans sessions, branches, PRs, or ownership boundaries.
- Evaluator agents when subjective or end-to-end behavior needs a second pass that deterministic tests cannot provide.
- Adversarial validators when high-impact findings, security claims, architecture decisions, or evidence syntheses need an independent attempt at disproof before acceptance.

Before adding a multi-agent graph, document ownership, I/O contracts, shared state, arbitration when agents disagree, termination criteria, budget, and the verification signal that proves the topology helps. Be especially cautious with distributed deliberation loops: they can multiply cost and uncertainty unless an eval shows they improve outcomes for this repo.

Adversarial validation should have a narrow brief:

- Original claim or patch to challenge
- Evidence the validator may inspect
- Disproof criteria and severity threshold
- Whether the validator can propose fixes or only reject/ask questions
- How disagreements are resolved and recorded

Do not use adversarial validation for routine low-risk edits. Use it when false positives, false confidence, or missed exploitability would cost more than the extra review.

Adversarial validation is not a substitute for semantic-scope verification. Before invoking adversarial review on a migration or broad refactor, the owning agent should independently verify that the change solves the right user-visible problem and include the evidence. If the review brief should challenge scope, say so explicitly; otherwise reviewers will naturally focus on local defects such as SQL, cache keys, edge cases, and race conditions.

### Resolver MECE

MECE means mutually exclusive, collectively exhaustive.

Use it for skill, task, and decision routers:

- Mutually exclusive: routes should not accidentally claim the same trigger or path with conflicting instructions.
- Collectively exhaustive: common, important user intents should have a route.
- Intentional overlap is fine when chaining is explicit. Example: final PR shipping may chain review triage, CI checks, and merge-readiness validation.

Resolver checks can start as warnings:

- Duplicate or near-duplicate trigger phrases across skills.
- Skills or docs that are never routed from any index.
- Common harness markers with no corresponding durable route.
- A task route that points to stale, deprecated, or superseded guidance.

Promote MECE warnings to failures only after at least one audit cycle, roughly 30 days for active repos, with no false positives or accepted noise, and document the promotion in a decision.

### Memory Types

1. **Working memory**
   - Current chat/session only.
   - Do not persist unless it becomes a real decision, contract, fix, or repeated lesson.

2. **Episodic memory**
   - What happened: commits, PRs, issues, review threads, incident notes.
   - Source of truth is git/GitHub, not a permanent scratchpad.
   - Branch-scoped scratchpads are allowed only if gitignored or clearly temporary.
   - Scratchpads must include branch name, owner, creation date, and deletion condition.

   Use two planning tiers:

   - **Checked-in execution plans** for multi-hour, multi-agent, cross-PR, or handoff-heavy work. Store under `docs/plans/active/` while active, then move to `docs/plans/completed/` only when the plan has lasting value.
   - **Gitignored scratchpads** for local exploration, failed avenues, temporary notes, and session-only reasoning. Store under a clearly ignored path such as `.scratch/` or the repo's established local-notes directory.

   Before closing a task, promote any durable lesson from scratchpads or execution plans into semantic docs, decision memory, data contracts, repo contracts, scripts, or review rules. Then delete or archive the temporary material according to its lifecycle rule.

3. **Semantic memory**
   - Current facts about the system and domain.
   - Lives in `docs/README.md`, `docs/architecture.md`, `docs/testing.md`, `docs/ci-cd.md`, references, data contracts, and repo contracts.

4. **Procedural memory**
   - How agents should behave.
   - Lives in `AGENTS.md`, canonical review harness docs, tool-specific adapters, scripts, skills, hooks, and CI.

5. **Decision memory**
   - Why the system works this way.
   - Lives in `docs/decisions.md` or `docs/adr/`.

### Provider Memory Interop

Provider-native memory includes Codex memory, Claude Code memory, Gemini memory, Copilot/IDE memory, and any tool-specific "dreaming" or summarization feature. Treat these memories as useful recall, not as repository authority.

Use this boundary:

1. Platform, safety, and tool instructions still apply.
2. The current human request controls the current task.
3. Current repository state controls project behavior: code, tests, CI, generated schemas, and reproducible artifacts.
4. Active repository harness files control project guidance: `AGENTS.md`, `docs/README.md`, active decisions, active data contracts, active repo contracts, and current reference docs.
5. Agent-specific wrappers adapt the shared rules to a tool.
6. Provider-native memory is last. Use it for user preferences, workflow hints, and pointers to canonical repo files.

If provider memory conflicts with the repository harness, follow the repository source and mention the conflict. If provider memory contains a durable project lesson that is not in the repo, promote the lesson into the smallest appropriate harness file instead of relying on private memory.

During harness audits, ask the active agent to report which instruction and memory sources it loaded if the tool supports that. Do not fail validation just because a provider does not expose private memory internals.

### Self-Growth Rule

When a repeated or high-risk failure appears, classify the fix:

- Missing fact: update semantic docs.
- Missing data semantics: add or update a data contract.
- Missing cross-repo assumption: add or update a repo contract.
- Missing rationale: add or update a decision.
- Missed existing decision: update the decision index, decision router, task router, or path-scoped instructions.
- Repeated workflow error: update procedural memory or a skill.
- Missing runtime boundary: add or update agent-runtime safety docs, scoped tool configuration, approval tiers, or audit checks.
- Mechanically checkable mistake: add a script/CI check.
- Review should have caught it: add or update the canonical review harness or the relevant tool-specific adapter.
- Wrong migration scope or unverified handoff claim: add a semantic-scope guide, PR prompt, review rule, data contract, repo contract, or route.
- Failure happened before code was written: add or improve a guide.
- Failure escaped after code was written: add or improve a sensor.
- Existing control fired but was ignored or too noisy: improve the control's output, lifecycle, or severity before adding another rule.

Do not add every one-off mistake to always-on instructions. Promote only repeated, costly, or high-risk lessons.

Self-improving memory loops are experimental unless the repo has a controlled eval setup. If the repo tries failure-to-memory learning, keep it outside always-on instructions at first:

- Store candidate rules, examples, or mixed artifacts in an eval or lab area.
- Require a fixed task set, before/after metrics, and a rollback path.
- Promote only artifacts that improve success, cost, human-touch rate, or safety without increasing drift.
- Keep capacity limits so learned memory cannot grow without bound.
- Record whether the artifact belongs in a doc, decision, contract, skill, validator, or should be discarded.

Do not broadcast self-generated rules across agents or branches without evidence from the repo's own tasks.

### Harnessify Path

Add a `harnessify`, `workflow-to-control`, or similarly named skill/guide when the repo has enough agent iteration that repeated friction needs a standard triage path.

Location rule: a short harnessify note may live in `docs/human-guide.md`, but if it grows beyond a compact checklist or includes marker thresholds, candidate-fix priority lists, or a skill-creation gate, put it in `docs/harnessify.md` and link to it from `docs/human-guide.md`.

This is not a generic skill generator. It answers: what is the smallest durable harness control that prevents this specific repeated failure?

Checklist:

1. Evidence: PR, review comment, marker, incident, or repeated human correction.
2. Failure mode: missing fact, missing route, missing decision, missing contract, missing sensor, noisy sensor, or stale guidance.
3. Smallest durable fix: semantic doc, ADR, data contract, repo contract, skill, validator, PR template, review rule, or health-report action.
4. Routing: how future agents discover it.
5. Enforcement: whether a deterministic check should exist now, later, or never.
6. Validation: test, fixture, eval, or manual audit question that proves the fix works.
7. Retirement: what signal says the control can be removed, weakened, or moved out of always-on context.

Prefer harnessifying repeated workflows and misses over adding more root instructions.

Skill-creation gate: before creating a new skill, at least two smaller controls should have been tried and shown insufficient, unless the workflow is clearly repeated, multi-step, and procedural. Smaller controls include semantic docs, ADRs, contracts, validators, PR template prompts, review rules, or examples. "Considered but not tried" is not enough evidence for a new skill unless the risk or cost of trying the smaller control is explicit.

### Conflict Resolution

When facts conflict:

1. Current code plus passing tests wins for implementation behavior.
2. Active decisions and active contracts win over deprecated or superseded ones.
3. More specific path-scoped instructions win for files in that path.
4. Provider-native memory loses to current repo sources and the current human request.
5. If docs and code disagree, fix the docs or flag the conflict before coding further.
6. If two active decisions or contracts conflict, stop and ask the human which one to supersede.

## Phase 6: Deterministic Gates

Add deterministic checks so correctness does not depend on agents remembering prose.

### Unified Quality Gate

Create or update one exact quality-gate command that runs all required checks. Use `scripts/check.*` only as template notation while authoring this bootstrap; implemented repos must document a runnable command such as `node scripts/check.mjs`, `python scripts/check.py`, `bash scripts/check.sh`, or `make check`.

It should include, as applicable:

- Format check
- Linter
- Type checker
- Unit tests
- Integration tests that are safe locally
- Architecture or import boundary checks
- Doc validation
- Harness validation
- Contract validation when data/repo contracts exist

Support `--fix` when the repo has reliable auto-fixers.

### Architecture Enforcement

Use the right tool for the stack:

- Python: `import-linter`, Ruff custom rules, or AST scripts
- TypeScript/JavaScript: ESLint import rules or dependency-cruiser
- Go: package boundary tests or static analysis
- .NET: architecture tests or Roslyn analyzers
- Polyglot/monorepo: custom structural scripts

The contract must match the real architecture. Do not invent ideal boundaries the current code cannot pass without a migration plan.

### Baseline ADRs

Add these if applicable:

- **Pinning policy.** Defines minimum pinning expectations for GitHub Actions, package installs in CI, pre-commit hooks, external installer scripts, containers, and generated lockfiles.
- **Parser vs regex policy.** If the harness validates structured files like YAML, JSON, TOML, Markdown, XML, SQL, or schemas, define when regex is acceptable and when the check must graduate to a parser.
- **Agent scratchpad policy.** Defines where temporary plans and notes may live, how they are scoped, and when they are deleted.
- **Docs/contracts as source of truth policy.** Defines which facts belong in docs, data contracts, repo contracts, scripts, and issue/PR history.

### `scripts/validate-harness.*`

Add a harness validator that checks:

- `AGENTS.md` exists and stays under the configured line/byte budget
- `CLAUDE.md` and `GEMINI.md`, if present, are wrappers and do not duplicate large sections
- `docs/README.md` exists and links to required docs
- Required durable docs include freshness metadata when the repo enables metadata checks
- Decision IDs are unique
- Decision index exists and includes compact routing metadata when the repo has many or split decisions
- Every active decision has status, area, applies-to, read-when, rule, and detail/anchor metadata when decision routing is enabled
- Every ADR file is listed in the decision index, and every index detail link resolves
- Decision router, if present, returns active decisions and does not route to deprecated/superseded decisions
- Deprecated/superseded decisions are not referenced by active hard review rules
- Every decision cited in the canonical review harness exists and is active
- Tool-specific review adapters, if present, point back to the canonical review harness
- Every hard review rule cites a decision ID
- Broken internal doc links fail the check
- Optional docs with `last_verified` fields are not past the configured stale threshold
- Duplicate command definitions or duplicated instruction blocks are reported as rot risks
- Data contracts referenced by `docs/data-contracts/INDEX.md` exist and have metadata
- Repo contracts referenced by `docs/repo-contracts/INDEX.md` exist and have metadata
- `AGENTS.md` includes the provider-memory precedence rule
- If `docs/agent-runtime.md` or `docs/agent-runtime-safety.md` exists, `AGENTS.md` includes the agent-runtime safety rule and the runtime doc links to its verification checks
- If behavioral anchors, evidence packs, code-search adapters, or fault-injection profiles exist, their indexes or docs are reachable from the task router or relevant runtime/eval docs

Run this validator in the repo's exact unified quality-gate command and CI.

### Optional Contract Coverage Checks

Add only when signal is reliable:

- If SQL references a table, it should appear in `docs/data-contracts/INDEX.md`.
- If code references another repo, generated artifact, external service, or shared package, it should appear in `docs/repo-contracts/INDEX.md`.
- If a generated artifact is required, it should be reproducible by a documented command.
- If agent-specific instruction files exist, they should point back to `AGENTS.md`.

Prefer warnings at first. Promote to failures once the signal is reliable and low-noise.

## Phase 7: PR Hooks and Human Workflow

Add or update `.github/pull_request_template.md` when the repo uses GitHub PRs.

Recommended section:

```markdown
## Harness Impact

- [ ] Updated relevant docs / ADR / reference
- [ ] Updated data contracts
- [ ] Updated repo contracts
- [ ] Added or updated enforcement/checks
- [ ] No harness impact

## External Context

- [ ] This PR uses external data
- [ ] This PR depends on another repo/system
- [ ] This PR changes behavior other agents are likely to reuse
- [ ] None

## Semantic Scope

- [ ] User-visible payoff is stated for every migrated page/component/command
- [ ] Scope table or verification evidence is included or linked when this is a broad migration
- [ ] Handoff, issue, or PRD claims were verified against running behavior, rendered output, or source that owns the display
- [ ] Scope excludes pages/components/commands whose displayed behavior is not affected
- [ ] Not applicable

## Agent/Harness Observations

- [ ] Agent needed repeated clarification (`harness:missing-guide` or `harness:context-rot`)
- [ ] Agent could not find relevant context (`harness:missing-guide`)
- [ ] Agent made an incorrect assumption (`harness:miss-docs`, `harness:miss-adr`, or contract marker)
- [ ] Decision router / index failed to surface relevant context (`harness:miss-decision-route`)
- [ ] New data contract needed (`harness:data-contract-needed`)
- [ ] New repo contract needed (`harness:repo-contract-needed`)
- [ ] Runtime/tool safety boundary needed (`harness:runtime-safety-needed`)
- [ ] Agent repeated a known behavioral drift (`harness:behavior-drift`)
- [ ] Source-heavy work lacked traceable evidence (`harness:evidence-gap`)
- [ ] Existing context was stale (`harness:context-rot`)
- [ ] Existing sensor was missing, ignored, or too noisy (`harness:missing-sensor` or `harness:review-noise`)
- [ ] Bespoke scaffold looks obsolete or too costly (`harness:obsolete-scaffold`)
- [ ] Harness edit prediction missed (`harness:prediction-miss`)
- [ ] Provider memory conflicted with repo context (`harness:provider-memory-conflict`)
- [ ] Handoff or issue claim was wrong or unverified (`harness:handoff-claim`)
- [ ] Migration scope lacked a user-visible semantic payoff (`harness:semantic-scope`)
- [ ] Repeated self-introduced fixes suggest wrong scope (`harness:scope-ratchet`)
- [ ] No harness issue observed (mutually exclusive)

## If no harness update was made

Explain why existing context remains accurate:
```

Change rule:

If modifying schema usage, data semantics, cross-repo behavior, public/internal interfaces, non-obvious domain logic, user-visible controls, migration scope, or agent workflow assumptions, update the relevant harness file or explicitly state why no harness update is needed.

This rule is intentionally lightweight. The goal is to make drift visible, not create process overhead.

Metrics should parse checked observation boxes directly when possible. If that is not implemented, include the matching lightweight marker in the PR body or a review comment. `No harness issue observed` is mutually exclusive with every positive observation.

## Phase 8: Measurement Layer

Create a low-token, deterministic measurement layer. Agents should not spend normal task time self-evaluating the harness. Scripts and CI should collect most evidence.

Start with a minimal local baseline: always-on instruction size, required-file presence, broken-link count, validator pass/fail, active decision count, and contract count when contracts exist. Add GitHub/PR metrics, scheduled trend reports, and standing issues only when the repository actually has an active PR workflow, recurring agent iteration, or enough history to make the numbers meaningful.

The measurement layer has four possible parts:

1. **PR-time harness checks**
   - Use when the repository has pull requests, merge requests, or a comparable review gate.
   - Purpose: catch immediate drift introduced by the PR.
   - Required command: run the repo's exact unified quality-gate command, which must include harness validation once the harness exists.
   - If the repo separates checks, run the repo's exact harness validator command directly in the PR workflow too.
   - Output: CI status plus a short job summary.

2. **Minimal local metrics baseline**
   - Run locally and in CI once the harness exists.
   - Required output can be small JSON or a concise text summary.
   - Do not require `gh`, PR history, scheduled CI, or external service access.

3. **Scheduled harness health report**
   - Trigger only for active repos, high-iteration agent workflows, or repos where humans want recurring drift reports.
   - Default cadence: weekly for active/high-churn repos, biweekly or monthly for low-churn repos.
   - Recommended command: the repo's exact harness-audit command once the audit wrapper exists, for example `node scripts/harness-audit.mjs --window-days 30`.
   - Output: GitHub Actions job summary plus a JSON artifact. Optionally update one standing GitHub issue or append compact history to `docs/harness-metrics/history.jsonl`.

4. **Task and PR event capture**
   - Use PR template checkboxes and lightweight markers to capture human-observed friction that scripts cannot infer.
   - The metrics script should parse checked observation boxes or count explicit markers from PR descriptions, review comments, issue comments, or the repo's chosen issue tracker.
   - Validate or review that `None` / `No harness issue observed` options are mutually exclusive with positive observations.
   - Humans should not need to remember a separate metrics process; the PR template and review markers are the capture surface.

Default CI policy:

- Fail PRs for deterministic harness violations: missing required files, broken internal links, invalid indexes, duplicate active decision IDs, missing required metadata, stale active rules that exceed the repo threshold, and active review rules that cite missing or superseded decisions.
- Warn first for heuristic checks: contract coverage scans, broad dependency detection, stale optional references, duplicate prose similarity, and provider-memory conflict markers.
- Promote warnings to failures only after the check is reliable, low-noise, and documented in an active decision.

If the repository uses GitHub Actions, create or extend a workflow for the PR check. Add a scheduled report workflow only when scheduled harness reporting is enabled. If it uses another CI system, implement the same lifecycle there.

### `scripts/harness-metrics.*`

Create a script that emits one JSON object to stdout.

It should work locally with partial data. If `gh` or CI history is unavailable, emit `null` for unavailable metrics and include a `warnings` array.

### `scripts/harness-health.*`

Add only when the repo has several validators, metrics, contracts, routers, or recurring harness audits.

The health report should not replace gates. It should interpret them for an agent or human and produce an action-oriented summary.

Default mode is advisory: generate the report and exit `0` even when `actions[]` is non-empty. Use nonzero exits only for script/runtime failure, or for an explicit `--strict` mode after the repo has completed at least one audit cycle with low-noise health actions and documented the promotion in a decision.

Recommended output shape:

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

Use exit codes if the report is run by CI or cron:

- `0`: report generated. In default advisory mode, recommended actions do not fail CI.
- `1`: explicit `--strict` mode found required action, or a deterministic required check failed. Use this only after the repo has completed at least one low-noise audit cycle and recorded an evidence-backed decision that promotes health actions to enforcement.
- `2`: could not determine health because a required check crashed or could not run.

The value is prioritization, not more enforcement: agents can read `actions[]` instead of interpreting raw validator and metrics JSON from scratch. Avoid circular dependency: metrics may record whether a health report exists, but `harness-metrics.*` should not call `harness-health.*` if `harness-health.*` already wraps metrics.

Recommended metrics output shape:

The object below is a superset. Minimal implementations may emit only the local baseline fields plus `warnings`, or use `null` for disabled GitHub/PR, control-coverage, contract-coverage, runtime-safety, or behavioral-drift metrics.

```json
{
  "generated_at": "2026-04-24T00:00:00Z",
  "window_days": 30,
  "token_pressure": {
    "agents_md_bytes": 0,
    "agents_md_lines": 0,
    "claude_md_bytes": 0,
    "gemini_md_bytes": 0,
    "copilot_instructions_bytes": 0,
    "always_on_instruction_bytes_total": 0,
    "always_on_instruction_file_count": 0
  },
  "rot_indicators": {
    "broken_doc_links": 0,
    "orphan_decision_citations": 0,
    "deprecated_decision_citations": 0,
    "orphan_contract_references": 0,
    "stale_contract_count": 0,
    "stale_behavioral_anchor_count": 0,
    "orphan_evidence_pack_count": 0,
    "duplicate_instruction_blocks": 0,
    "stale_reference_count": 0,
    "adr_status_conflicts": 0,
    "decision_index_orphan_entries": 0,
    "decision_index_missing_routes": 0
  },
  "harness_health": {
    "active_decision_count": 0,
    "superseded_decision_count": 0,
    "active_decisions_with_routes": null,
    "decision_router_configured": null,
    "control_inventory_configured": null,
    "guide_count": null,
    "sensor_count": null,
    "computational_control_count": null,
    "inferential_control_count": null,
    "controls_with_retirement_criteria": null,
    "data_contract_count": 0,
    "repo_contract_count": 0,
    "internal_data_store_doc_count": 0,
    "agent_runtime_doc_count": 0,
    "behavioral_anchor_set_count": 0,
    "evidence_pack_count": 0,
    "hard_review_rules_without_decision": 0,
    "check_gate_runtime_seconds": null,
    "harness_validation_passed": null
  },
  "contract_coverage": {
    "external_data_sources_detected": null,
    "external_data_sources_with_contracts": null,
    "sql_references_without_contract": null,
    "cross_repo_dependencies_detected": null,
    "cross_repo_dependencies_with_contracts": null,
    "repo_references_without_contract": null
  },
  "control_coverage": {
    "fast_sensors_in_local_gate": null,
    "fast_sensors_in_ci": null,
    "scheduled_drift_sensors": null,
    "inferential_sensors_in_pr_flow": null,
    "controls_without_failure_mode": null,
    "controls_without_owner": null,
    "controls_without_retirement_signal": null,
    "capability_scaffolds_without_review_signal": null
  },
  "runtime_safety": {
    "agent_runtime_doc_configured": null,
    "production_agent_tools_detected": null,
    "write_tools_with_approval_tiers": null,
    "tools_with_scoped_credentials": null,
    "runtime_controls_without_audit_logs": null,
    "train_eval_prod_boundary_reviewed": null,
    "otel_trace_coverage": null,
    "mcp_tool_contracts_validated": null,
    "fault_injection_profile_count": null
  },
  "behavioral_drift": {
    "behavioral_anchor_sensor_configured": null,
    "drift_alert_count": null,
    "drift_alert_false_positive_rate": null,
    "drift_sensor_p95_latency_ms": null
  },
  "workflow_outcomes": {
    "prs_merged": null,
    "first_pass_ci_success_rate": null,
    "mean_pr_open_to_green_hours": null,
    "mean_pr_open_to_merge_hours": null,
    "adr_citation_rate_in_prs": null,
    "contract_citation_rate_in_prs": null,
    "harness_correction_comment_count": null,
    "provider_memory_conflict_comment_count": null,
    "harness_edit_prediction_count": null,
    "harness_edit_prediction_hit_rate": null
  },
  "warnings": []
}
```

### Metric Definitions

Track these categories:

1. **Token pressure**
   - Size and count of always-on instruction files.
   - Examples: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and other repo-specific files that agents auto-load.
   - How to measure: file byte counts, line counts, and total always-on instruction bytes.
   - Why it matters: growth here is direct context-bloat risk.

2. **Rot indicators**
   - Broken links.
   - Orphan decision citations.
   - Deprecated decision citations.
   - Orphan data/repo contract references.
   - Stale contracts or references.
   - Stale behavioral anchors.
   - Orphan evidence packs whose durable conclusions were not promoted or archived.
   - Duplicate instruction blocks.
   - Conflicting active decisions or contracts.
   - Orphan decision-index entries or ADR files.
   - Active decisions missing applies-to/read-when routing metadata.
   - How to measure: doc link checks, decision/contract ID parsing, decision-index checks, metadata freshness checks, and duplicate-block heuristics.

3. **Harness health**
   - Active and superseded decision counts.
   - Active decisions with routing metadata.
   - Whether a decision router exists when the repo has many or split decisions.
   - Whether a control inventory exists and classifies guides/sensors.
   - Guide, sensor, computational-control, and inferential-control counts.
   - Controls with explicit failure modes and retirement criteria.
   - Data contract, repo contract, internal data-store doc, and agent-runtime doc counts. Count the consolidated internal-store or runtime file as one, or count split per-topic files when the repo uses an indexed directory.
   - Behavioral anchor set and evidence pack counts when those optional modules are enabled.
   - Review rules without decision or contract backing.
   - Unified quality-gate runtime.
   - Harness validator pass/fail.
   - How to measure: parse decision/contract indexes, run harness validation, time the quality gate.

4. **Control coverage**
   - Fast computational sensors present in local gate and CI.
   - Scheduled drift sensors present for docs, dependencies, contracts, and architecture where relevant.
   - Inferential sensors present in PR flow when semantic review is part of the harness.
   - Controls missing owner, failure mode, or retirement signal.
   - Bespoke scaffolds missing a model/tool-upgrade reassessment signal.
   - How to measure: parse the control inventory in `docs/human-guide.md` or the repo's chosen harness-control file.

5. **Runtime safety**
   - Agent runtime docs configured when production agent tools exist.
   - Write-capable tools covered by approval tiers.
   - Tools using scoped credentials instead of shared broad credentials.
   - Runtime controls with audit logs, run IDs, and intervention records.
   - OTel trace coverage for long-running sessions or production agent tasks when observability is enabled.
   - MCP or other tool-contract validation when tool servers/clients are used.
   - Fault-injection profiles configured for high-risk tool/runtime failures.
   - Training/evaluation/production boundaries reviewed when tools or harnesses cross environments.
   - How to measure: parse agent-runtime docs, MCP/tool configuration, CI secrets usage, policy files, audit-log configuration, and approval workflow definitions.

6. **Behavioral drift**
   - Behavioral anchor sensor configured when repeated drift triggers exist.
   - Drift alert count, false-positive rate, latency, and cost.
   - Whether drift alerts result in context injection, review, rollback, or harness issues.
   - How to measure: parse behavioral-anchor docs, sensor output, PR markers, and audit logs.

7. **Workflow outcomes**
   - First-pass CI success rate.
   - Time from PR open to first green CI.
   - Time from PR open to merge.
   - ADR citation rate in PR descriptions and review comments.
   - Contract citation rate in PR descriptions and review comments.
   - Human correction comments tagged with harness markers.
   - Provider-memory conflict comments tagged with harness markers.
   - Harness edit predictions and later hit/miss rate when decision observability is enabled.
   - How to measure: `gh` / GitHub API, CI status data, PR timelines, review comments, and lightweight harness labels or markers.

8. **Contract coverage**
   - External data sources with data contracts.
   - Cross-repo dependencies with repo contracts.
   - SQL/table references not covered by data contracts.
   - External package/repo references not covered by repo contracts.
   - How to measure: start with warnings from static scans; promote to failures only when the check is reliable and low-noise.

### Human Correction Markers

To measure repeated agent failures without heavy tracing, define lightweight markers humans can use in PR bodies, PR comments, or review comments:

- `harness:miss-docs` - agent changed behavior but missed docs
- `harness:miss-adr` - agent missed or contradicted a decision
- `harness:miss-decision-route` - agent missed a decision because the index/router did not surface it
- `harness:data-contract-needed` - agent relied on external data semantics without a contract
- `harness:repo-contract-needed` - agent relied on cross-repo behavior without a contract
- `harness:runtime-safety-needed` - agent tool access, credentials, approvals, or autonomous runtime behavior lacked a safety boundary
- `harness:behavior-drift` - agent repeated a known behavioral failure that should be covered by anchors or another guide/sensor
- `harness:evidence-gap` - source-heavy work made claims without traceable supporting evidence
- `harness:wrong-command` - agent used the wrong tool or command
- `harness:missing-sensor` - an issue escaped because no cheap feedback sensor existed
- `harness:missing-guide` - an issue repeated because no guide steered the agent before acting
- `harness:context-rot` - stale or conflicting harness guidance affected work
- `harness:provider-memory-conflict` - provider-native memory conflicted with repo source of truth
- `harness:review-noise` - automated review produced low-signal comments
- `harness:token-bloat` - too much context was loaded or always-on guidance grew too large
- `harness:obsolete-scaffold` - a wrapper, workflow, memory layer, or multi-agent scaffold persisted after it stopped paying for itself
- `harness:prediction-miss` - a harness edit failed to improve the predicted outcome or made the measured outcome worse
- `harness:handoff-claim` - agent trusted an issue, handoff, or PRD claim without verifying the displayed behavior it described
- `harness:semantic-scope` - migration or refactor scope included a page, component, command, or control with no user-visible payoff
- `harness:scope-ratchet` - repeated fixes addressed regressions introduced by the current change instead of rechecking whether the scope was correct

The metrics script should count these markers over the selected time window across PR bodies, issue comments, inline review comments, and review submissions when the platform exposes them.

### Feedback Log

Optional for repos with frequent agent iteration:

```text
docs/harness-feedback/
  INDEX.md
  <yyyy-mm-dd-short-title>.md
```

A feedback entry should be short and actionable:

```markdown
---
status: active
owner: unknown
last_reviewed: 2026-04-24
source_of_truth: PR/review/task link
scope: harness
verification: <check added or none>
---

# YYYY-MM-DD - <short title>

## What went wrong

## Why the harness allowed it

## Change made

## Prevention check added
```

### Metrics Storage

Do not commit large raw logs.

Use one of:

- GitHub Actions job summary only
- Artifact upload for scheduled JSON output
- One standing GitHub issue such as "Harness Health" when the repo wants a persistent human-readable report
- `docs/harness-metrics/history.jsonl` if the repo wants committed trend history and the file stays small

Agents should read only the latest metrics summary during harness audits. They should not load full history unless specifically asked to investigate a trend.

The scheduled report should summarize trends and recommended actions, not dump raw logs. It should answer:

- Is always-on instruction size growing?
- Are stale docs, references, decisions, or contracts increasing?
- Are harness correction markers recurring?
- Are contract coverage warnings shrinking or growing?
- Are PRs reaching green CI and merge faster or slower?
- Which harness fixes would reduce repeated agent or reviewer friction?

### Optional Harness Regression Eval

For mature repos, create a small fixed internal task set to evaluate harness revisions. This should be optional because it costs agent time, but it is the best way to avoid judging harness changes by feel.

Recommended structure:

```text
docs/harness-evals/
  README.md
  tasks.yml
  harness-snapshots/
  results.jsonl
```

Task categories should cover bug fix, feature addition, refactor, docs-only change, CI/release change, domain-specific gotcha, long-running handoff task, and review-only task.

Track for each run:

```text
task_id, harness_version, agent_tool, model, task_type, success,
first_pass_green, wall_minutes, input_tokens, output_tokens,
cached_tokens, human_touches, docs_read_count, docs_modified_count,
ci_failures, retry_loops, control_variant, ablated_controls,
harness_edit_prediction, prediction_result, notes
```

Rule for harness changes: they should improve task success, reduce agent cost, reduce human intervention, improve contract coverage, or reduce rot indicators without materially hurting the others.

For nontrivial harness edits, add a prediction before merging: what metric, marker count, failure mode, or agent behavior should improve, over what window, and what evidence would show the edit did not help. This is decision observability. Keep predictions short enough to live in the PR body, ADR, changelog entry, or eval note, then check them during the next harness audit.

If the repository ships an agent product or has frequent agent-driven development, document the chosen evaluation adapter in `docs/harness-evals/README.md`. External frameworks such as DeepEval are adapters, not required infrastructure; the source of truth is the repo's task set, traces, goldens, and acceptance criteria.

Evaluation adapter guidance:

- Prefer repo-specific tasks before generic benchmarks.
- Use external benchmarks such as SWE-bench Verified, WebArena, GAIA, or domain benchmarks only when they represent the repo's actual task distribution.
- Evaluate full traces when tool choice, planning, or step efficiency matters; evaluate components only when a specific component owns the failure.
- Calibrate LLM-judge rubrics with goldens, human labels, or inter-rater checks before using them as gates.
- Treat reliability statistics such as agreement rates, Cronbach's alpha, or McDonald's omega as optional rubric diagnostics, not bootstrap requirements.
- Keep eval artifacts source-traced and reproducible enough that a later agent can understand why a score changed.

For mature harnesses, occasionally run small ablations: remove or disable one guide or sensor in a controlled branch and compare outcomes against the baseline. Use ablations to retire controls that no longer pay for their context, runtime, or review cost. Keep the task set small enough that it can actually be run.

## Phase 9: Garbage Collection and Audit

Create a lightweight audit command or documented workflow.

Recommended command:

```bash
<exact harness validator command>
<exact harness metrics command>
<exact harness health command, if enabled>
```

If useful, add an exact `scripts/harness-audit.*` command that runs:

- Harness validator
- Health report wrapper, if present
- Metrics script
- Doc link checker
- Architecture check
- Decision citation check
- Decision index/router check
- Control inventory check
- Contract coverage checks
- Stale reference/contract checks

The audit output should answer:

- Which always-on files grew?
- Which docs, references, or contracts are stale?
- Which decisions/contracts are superseded but still enforced?
- Which decisions are active but not routable by task or file path?
- Which guides or sensors lack an owner, failure mode, lifecycle, or retirement signal?
- Which controls have not fired or helped in recent history and may be stale?
- Which bespoke scaffolds look obsolete after model or first-party harness upgrades?
- Which review rules lack decision backing?
- Which data or repo dependencies lack contracts?
- Which agent runtime tools have broad credentials, missing approval tiers, missing audit logs, or unclear kill switches?
- Which behavioral anchors are stale, noisy, or missing for repeated drift?
- Which evidence packs have durable conclusions that should be promoted or archived?
- Which harness misses recurred?
- Which health-report actions have stayed open across multiple audits?
- Which checks are slow enough to discourage agent use?

Audit cadence:

- Small repos: monthly or after major feature batches
- High-churn repos: weekly
- Harness/infrastructure repos: weekly, with CI summary

Run the audit cadence through scheduled CI where possible. Manual audits are a fallback for repos without scheduled CI.

Default to reports. Open cleanup PRs only for mechanical fixes or when the human explicitly enables auto-cleanup.

## Phase 10: Validate the Harness

Before considering the bootstrap complete, validate that the harness works as a context-routing system.

Manual validation:

- Where do I start?
- Which context file should I read?
- What should I avoid loading?
- What command checks my work?
- What should I update if I discover missing or stale context?
- Which controls are guides, and which controls are sensors?
- Which fast sensors should run before I ask for review?
- Which harness controls are intentionally absent because the repo has no trigger yet?
- What should I do if external data or cross-repo assumptions are involved?
- What should I do before changing agent tools, runtime permissions, or autonomous workflows?
- What should I do when source-heavy research needs traceable evidence?
- What should I do if long-running agents repeatedly drift from known behavior rules?
- What should I do if provider-native memory conflicts with the repo harness?

Mechanical validation:

- Required files exist.
- Index links resolve.
- Metadata is present where required.
- Decision index routes tasks or changed paths to the relevant active decisions when the repo uses split or verbose decision memory.
- Control inventory exists for mature/high-churn repos and names direction, execution type, lifecycle, failure mode, and owner.
- Nontrivial controls have a retirement or reassessment signal.
- Bespoke harness scaffolds have model/tool-upgrade reassessment triggers.
- Agent runtime safety docs exist when write tools, shared credentials, production access, or autonomous workflows are present.
- Behavioral anchor docs and sensors exist only when repeated behavioral drift triggers are present.
- Evidence packs are promoted or archived after durable decisions are made.
- URL-fetchable context maps, if present, resolve to current canonical context files.
- Health report, if present, summarizes validators and metrics into prioritized actions.
- Agent-specific instruction files point to the shared source of truth.
- Optional contract checks are warnings or failures according to confidence.
- CI or local commands document how to run the checks.
- PR-time harness checks are wired into CI.
- Scheduled harness metrics or audit reporting is wired into CI or the repo's equivalent automation.

Cross-agent validation:

- Shared rules live in `AGENTS.md`.
- Agent-specific files are adapters, not divergent sources of truth.
- Instructions avoid tool-specific assumptions where possible.
- Tool-specific assumptions are isolated and labeled.
- Provider-native memory is treated as advisory and never as the only source for project facts.

## Phase 11: Establish the Baseline

After creating and validating the harness, establish the first known-good baseline. This is the reference point for future harness metrics, rot audits, and self-growth decisions.

Steps:

1. Run the repo's exact unified quality-gate command.
2. Run the repo's exact harness validator command.
3. Run the minimal local metrics command; run GitHub/PR metrics only when that module is enabled.
4. Run contract coverage checks if data contracts or repo contracts exist.
5. Record the current guide/sensor inventory if the repo is mature enough to need one.
6. Verify PR-time harness checks are wired into CI or document the exact follow-up.
7. Verify scheduled harness reporting is wired into CI when that optional module is enabled, or document why it is intentionally absent.
8. Fix existing violations or document why they are accepted temporarily.
9. Record the initial metrics baseline.
10. Record known harness gaps as explicit follow-up work.
11. Open a bootstrap PR that includes the harness files, baseline metrics, accepted temporary violations, automation status, and known follow-up work.

The baseline should answer:

- What is the current always-on instruction size?
- Which decisions, contracts, and references are active?
- Which guides and sensors are active, and which are computational vs inferential?
- Which rot indicators are already present?
- Which checks are blocking versus warning-only?
- Which controls lack enough evidence to justify their cost?
- Which runtime safety boundaries are active, if any?
- Which behavioral drift or evidence-pack modules are active, if any?
- Which optional modules are intentionally absent because their triggers are not present?
- Should remote-agent context maps or a health-report wrapper exist yet, or are they intentionally absent?
- What should future agents improve first?

Do not treat baseline imperfections as automatic blockers. The goal is to make the starting state explicit so future changes can be measured against it.

## Bootstrap Checklist

- [ ] Survey repository structure, tooling, docs, external data, and cross-repo dependencies
- [ ] Produce a short setup plan before writing harness files unless the human asked to skip the plan gate
- [ ] Identify existing guides and sensors before adding new controls
- [ ] Decide whether `llms.txt` / `llms-full.txt` are needed for remote agents
- [ ] Create or update `AGENTS.md`
- [ ] Keep `AGENTS.md` concise and route to `docs/README.md`
- [ ] Add the provider-memory precedence rule to `AGENTS.md` and `docs/human-guide.md`
- [ ] Normalize agent-specific instruction files to point back to `AGENTS.md`, if present
- [ ] Create or update `docs/README.md`
- [ ] Create or update `docs/architecture.md`
- [ ] Create or update decision memory: `docs/decisions.md` or `docs/adr/`
- [ ] Add a compact decision index with status, area, applies-to, read-when, rule, and detail/anchor fields
- [ ] Add a decision-router script when decision count, file length, or repeated misses justify it
- [ ] Create or update `docs/testing.md`
- [ ] Create or update `docs/ci-cd.md`
- [ ] Create or update `docs/human-guide.md`
- [ ] Add a control inventory for mature/high-churn repos, classifying guide/sensor and computational/inferential controls
- [ ] Record failure mode, lifecycle, owner, and retirement signal for nontrivial controls
- [ ] Add focused reference files only when triggered
- [ ] Add internal data-store docs only when repo-owned persistence semantics are load-bearing
- [ ] Add task contracts only for long-running, multi-agent, or handoff-heavy work
- [ ] Add `docs/harnessify.md` or a harnessify/workflow-to-control skill only when repeated harness friction justifies it
- [ ] Add agent-runtime safety docs only when agents can touch real systems, secrets, user data, shared credentials, or autonomous jobs
- [ ] Add behavioral anchors only when long-running agents repeatedly drift from stable behavior rules
- [ ] Add evidence packs only when source-heavy research needs traceable claims and freshness tracking
- [ ] Add OTel-style trace guidance only when long-running or production agent runs need cross-step observability
- [ ] Add MCP or other explicit tool-contract validation only when tool servers/clients are load-bearing
- [ ] Add fault-injection profiles only for production agent runtimes or brittle tool integrations
- [ ] Add adversarial validation only for high-impact findings, security claims, or decisions where disproof is worth the extra pass
- [ ] Add a code-search adapter only when it measurably reduces token load or discovery time versus `rg` plus selective reads
- [ ] Add durable metadata to important harness docs
- [ ] Add data contracts only if external data triggers are present
- [ ] Add repo contracts only if cross-repo triggers are present
- [ ] Add trigger rules so future agents know when to add data/repo contracts later
- [ ] Add context rot and garbage-collection guidance
- [ ] Prefer programmatic state surfaces over raw context dumps for large, changing, or inspectable state
- [ ] Add or update one exact unified quality-gate command and use that exact command in docs and agent instructions
- [ ] Add basic harness validation
- [ ] Add contract coverage checks if practical
- [ ] Add or update the canonical review harness; add `.github/copilot-instructions.md` as an adapter only when Copilot is used
- [ ] Add or update PR template harness-impact questions
- [ ] Add semantic-scope prompts for broad migrations or user-visible control changes
- [ ] Add PR observation checkboxes and marker capture when GitHub PRs are used
- [ ] Add a minimal deterministic local metrics script
- [ ] Add GitHub/PR workflow metrics and scheduled trend reporting only when the repo has an active PR workflow or high agent iteration
- [ ] Add an agent-readable health report only when validators/metrics need prioritization
- [ ] Include marker counts from PR bodies, issue comments, inline review comments, and review submissions when a PR/issue workflow is available
- [ ] Include guide/sensor or control-coverage metrics when a control inventory exists
- [ ] Include runtime-safety metrics when agent runtime safety docs or production agent tools exist
- [ ] Include behavioral-drift metrics when behavioral anchors exist
- [ ] Record a prediction for nontrivial harness edits and verify it during the next audit
- [ ] Validate resolver reachability and MECE overlap when the repo has skills or many routed docs
- [ ] Wire PR-time harness checks into CI
- [ ] Wire scheduled harness metrics or audit reporting into CI only when scheduled reporting is enabled
- [ ] Choose report destination: job summary, artifact, standing issue, or compact committed history
- [ ] Add feedback log only if agent iteration is frequent enough to justify it
- [ ] Run and document harness validation commands
- [ ] Establish and record the initial harness baseline
- [ ] Bootstrap PR includes baseline metrics, accepted temporary violations, automation status, and known follow-up work

Do not create empty optional systems just because they exist in this template. Install trigger rules so future agents know when to add them.

## Summary

This harness is designed to:

- Provide the right context at the right time
- Preserve a typed and tiered memory system
- Prevent incorrect data and cross-repo assumptions
- Scale across repositories and agents
- Grow when new dependencies or repeated confusion appear
- Classify controls as guides/sensors and computational/inferential checks
- Keep always-on context thin while letting routers, skills, docs, reports, and contracts carry richer pulled context
- Retire or weaken controls whose assumptions no longer justify their cost
- Catch drift mechanically when practical
- Verify user-visible semantic scope before broad migrations
- Reduce context rot through metadata and garbage collection
- Improve through feedback, checks, contracts, and metrics

The system should remain small, composable, discoverable, cross-agent compatible, enforced, measured, and continuously improving.
