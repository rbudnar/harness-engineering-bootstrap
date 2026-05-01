# Harness Engineering Bootstrap

A practical bootstrap template for creating a self-maintaining, token-efficient agent harness in a software repository.

The goal is not to add more documentation. The goal is to help coding agents load the right context at the right time, keep always-on instructions small, enforce drift mechanically where possible, and grow the harness only when repeated misses or real dependencies justify it.

## Contents

- [Template](templates/Harness%20Engineering%20Bootstrap%20Codex%20V4.md) - the current bootstrap template.
- [Changelog](CHANGELOG.md) - version history and major design changes.
- [References](REFERENCES.md) - source material and related work used while developing the template.

## What This Template Emphasizes

- Thin cross-agent entry points such as `AGENTS.md`.
- Task-routed docs instead of broad context loading.
- Decision memory, data contracts, and repo contracts.
- Deterministic quality gates and harness validation.
- Minimal local metrics first; PR metrics and scheduled reporting only when triggered.
- Guide/sensor and computational/inferential control taxonomy.
- Optional URL-fetchable context maps for remote agents.
- A harnessify path for turning repeated agent friction into the smallest durable control.

## How To Use

Copy the template into a target repository and adapt it to that repository's actual stack, workflows, risks, and existing documentation. Do not copy every optional module by default. The template is intentionally more detailed than the files it asks you to create.

Start with the required core, then add optional modules only when the repository has a real trigger for them.
## License

This project is dedicated to the public domain under [CC0 1.0 Universal](LICENSE).

You may copy, modify, distribute, and use the template without permission or attribution. Credit is appreciated but not required.
