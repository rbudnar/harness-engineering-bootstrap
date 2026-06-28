# Repository Instructions

This repo maintains the Harness Engineering Bootstrap template. Dogfood it as an anti-bloat governor, not as a showcase for every optional harness module.

## First Reads

- Start with `README.md` for the repo map.
- Read `docs/dogfooding.md` before accepting automated harness suggestions.
- Open `docs/repo-contracts/INDEX.md` only when changing automation that depends on external repository, service, or API semantics.
- Open `templates/Harness Engineering Bootstrap.md` only when editing or reviewing the template.

## Editing Rules

- Keep `AGENTS.md` as the only required always-on agent file.
- Keep `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` as thin adapters that point back here.
- Do not copy template phases, checklists, or reference material into always-on files.
- New optional template guidance must include trigger evidence, a smaller-control check, a validation signal, and a retirement or revisit rule.
- Template rule changes must update `docs/dogfooding.md` or `scripts/template-fitness.mjs` in the same PR when the new rule changes how this repo should dogfood the template.
- Reject additions that merely make the template more comprehensive without improving routing, enforcement, or context economy.
- Update `CHANGELOG.md` for user-facing template changes.

## Checks

- Run `node scripts/template-fitness.mjs` after harness or template edits.
- For a proposed daily suggestion file, run `node scripts/template-fitness.mjs --suggestion <path>`.
