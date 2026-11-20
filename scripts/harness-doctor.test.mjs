import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderTextReport, runDoctor } from './harness-doctor.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const doctorScript = resolve(testDir, 'harness-doctor.mjs');
const decisionFixtures = resolve(testDir, '../test/fixtures/harness-doctor/decision-memory');

test('passes a routed contract with complete lifecycle metadata', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n\nRead routed docs when a task triggers them.\n',
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog orders table
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
supersedes: none
superseded_by: none
---

# Orders Data Contract
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
    assert.equal(renderTextReport(report).includes('OK: no actionable warnings.'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts contract-memory body metadata shape for routed contracts', () => {
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': `# Orders Data Contract

Status: active
Owner: Data Platform
Source of truth: warehouse catalog orders table
Last reviewed: 2026-06-01
Review after: 2026-12-01

## Validation

- Inspect: warehouse catalog orders table
- Test/check: contract fixture replay

# Known Pitfalls
`,
    'docs/repo-contracts/INDEX.md': '# Repo Contracts\n\n- [Design Tokens](design-tokens.md)\n',
    'docs/repo-contracts/design-tokens.md': `# Design Token Repo Contract

Status: active
Owner: Frontend Platform
Source of truth: design-system generated tokens package
Last reviewed: 2026-06-01
Review after: 2026-12-01

## Validation

- Inspect: design-system release notes
- Test/check: token import snapshot
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores fenced examples when parsing body metadata', () => {
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': `# Orders Data Contract

\`\`\`markdown
Status: active
Owner: Data Platform
Source of truth: warehouse catalog orders table
Last reviewed: 2026-06-01
Review after: 2026-12-01
Provenance: example
\`\`\`
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'missing-metadata'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores nested fenced examples when parsing body metadata', () => {
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': [
      '# Orders Data Contract',
      '',
      '````markdown',
      '```yaml',
      'Status: active',
      'Owner: Data Platform',
      'Source of truth: warehouse catalog orders table',
      'Last reviewed: 2026-06-01',
      'Review after: 2026-12-01',
      'Provenance: example',
      '```',
      '````',
      '',
    ].join('\n'),
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'missing-metadata'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores list-item fenced examples when parsing body metadata', () => {
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': [
      '# Orders Data Contract',
      '',
      '- ```yaml',
      '  Status: active',
      '  Owner: Data Platform',
      '  Source of truth: warehouse catalog orders table',
      '  Last reviewed: 2026-06-01',
      '  Review after: 2026-12-01',
      '  Provenance: example',
      '  ```',
      '',
    ].join('\n'),
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'missing-metadata'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores HTML-commented examples when parsing body metadata', () => {
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': `# Orders Data Contract

<!--
Status: active
Owner: Data Platform
Source of truth: warehouse catalog orders table
Last reviewed: 2026-06-01
Review after: 2026-12-01
Provenance: example
-->
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'missing-metadata'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores indented examples when parsing body metadata', () => {
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': `# Orders Data Contract

    Status: active
    Owner: Data Platform
    Source of truth: warehouse catalog orders table
    Last reviewed: 2026-06-01
    Review after: 2026-12-01
    Provenance: example
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'missing-metadata'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts non-date review-after triggers in contract body metadata', () => {
  const root = makeRepo({
    'docs/repo-contracts/INDEX.md': '# Repo Contracts\n\n- [Design Tokens](design-tokens.md)\n',
    'docs/repo-contracts/design-tokens.md': `# Design Token Repo Contract

Status: active
Owner: Frontend Platform
Source of truth: design-system generated tokens package
Last reviewed: 2026-06-01
Review after: next design-system major version

## Validation

- Inspect: design-system release notes
- Test/check: token import snapshot
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checks supersession metadata after body review triggers', () => {
  const root = makeRepo({
    'docs/repo-contracts/INDEX.md': '# Repo Contracts\n\n- [Design Tokens](design-tokens.md)\n',
    'docs/repo-contracts/design-tokens.md': `# Design Token Repo Contract

Status: superseded
Owner: Frontend Platform
Source of truth: design-system generated tokens package
Last reviewed: 2026-06-01
Review after: next design-system major version

## Validation

- Inspect: design-system release notes
- Test/check: token import snapshot
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'missing-superseded-by'
      && warning.path === 'docs/repo-contracts/design-tokens.md'
    )));
    assert(!report.warnings.some((warning) => warning.code === 'invalid-review-after'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('merges unrelated frontmatter with contract body metadata', () => {
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': `---
title: Orders
---

# Orders Data Contract

Status: active
Owner: Data Platform
Source of truth: warehouse catalog orders table
Last reviewed: 2026-06-01
Review after: 2026-12-01

## Validation

- Inspect: warehouse catalog orders table
- Test/check: contract fixture replay
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('warns for stale metadata, missing metadata, missing indexes, and broken links', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [missing docs](/docs/missing.md).\n',
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n- [Missing](missing.md)\n',
    'docs/data-contracts/orders.md': '# Orders Data Contract\n',
    'docs/repo-contracts/upstream.md': `---
status: active
owner: Platform
source_of_truth: upstream repo
last_reviewed: 2026-01-01
review_after: 2026-02-01
provenance: manual audit
---

# Upstream Repo Contract
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const codes = report.warnings.map((warning) => warning.code);
    assert(codes.includes('broken-link'));
    assert(report.warnings.some((warning) => warning.message.includes('/docs/missing.md')));
    assert(codes.includes('missing-metadata'));
    assert(codes.includes('missing-repo-contract-index'));
    assert(codes.includes('stale-metadata'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('warns when load-bearing last_reviewed metadata is malformed', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog orders table
last_reviewed: yesterday
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

# Orders Data Contract
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => warning.code === 'invalid-last-reviewed'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores angle-bracket external links', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [external docs](<https://example.com/docs?ref=heb>).\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores protocol-relative external links', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [cdn](//cdn.example.com/lib.js).\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores internal links that normalize outside the repo root', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [escaped](/docs/../../outside.md).\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports case-only broken Markdown links on case-insensitive filesystems', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [Foo](docs/Foo.md).\n',
    'docs/foo.md': '# Foo\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'broken-link'
      && warning.path === 'README.md'
      && warning.message.includes('docs/Foo.md')
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts inline links with parenthesized titles', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [Guide](docs/guide.md (Guide)).\n',
    'docs/guide.md': '# Guide\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores markdown links inside inline code spans', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nUse `[missing](docs/missing.md)` syntax, then see [ok](docs/ok.md).\n',
    'docs/ok.md': '# OK\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores markdown links inside nested fenced examples', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': [
      '# Project',
      '',
      '````markdown',
      '```text',
      '[Missing](docs/missing.md)',
      '```',
      '````',
      '',
    ].join('\n'),
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(!report.warnings.some((warning) => warning.code === 'broken-link'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores markdown links inside list-contained fenced examples', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': [
      '# Project',
      '',
      '- Example:',
      '    ```markdown',
      '    [Missing](docs/missing.md)',
      '    ```',
      '',
    ].join('\n'),
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(!report.warnings.some((warning) => warning.code === 'broken-link'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores markdown links inside blockquoted fenced examples', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': [
      '# Project',
      '',
      '> ```markdown',
      '> [Missing](docs/missing.md)',
      '> ```',
      '',
    ].join('\n'),
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(!report.warnings.some((warning) => warning.code === 'broken-link'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts exact-case directory links but warns for case-only directory drift', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [docs](docs/) and [wrong case](Docs/).\n',
    'docs/guide.md': '# Guide\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const brokenLinks = report.warnings.filter((warning) => warning.code === 'broken-link');
    assert.equal(brokenLinks.length, 1);
    assert.equal(brokenLinks[0].message.includes('Docs/'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports always-on leakage on the matched marker line', () => {
  const root = makeRepo({
    'AGENTS.md': [
      '# Agent Instructions',
      '',
      'Keep this file short and route details elsewhere.',
      '',
      'Trigger conditions: when external data changes.',
    ].join('\n'),
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const warning = report.warnings.find((item) => item.code === 'always-on-leakage');
    assert.equal(warning?.line, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports plural optional-module headings in always-on files', () => {
  const root = makeRepo({
    'AGENTS.md': [
      '# Agent Instructions',
      '',
      'Keep this file short and route details elsewhere.',
      '',
      '## Data Contracts',
      '',
      'Optional-module detail belongs in routed docs.',
    ].join('\n'),
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const warning = report.warnings.find((item) => item.code === 'always-on-leakage');
    assert.equal(warning?.line, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports optional-module admission labels in always-on files', () => {
  const root = makeRepo({
    'AGENTS.md': [
      '# Agent Instructions',
      '',
      'Keep this file short and route details elsewhere.',
      '',
      'Trigger evidence: copied optional module criteria.',
      'Smaller control: a route would be enough.',
      'Validation: run a routed validator.',
      'Retirement: delete when no longer useful.',
    ].join('\n'),
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const warning = report.warnings.find((item) => item.code === 'always-on-leakage');
    assert.equal(warning?.line, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores non-load-bearing frontmatter metadata', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': `---
status: published
review_after: soon
---

# Project
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('warns when always-on files carry colon-marker optional detail or duplicate long guidance', () => {
  const duplicate = 'This exact long guidance belongs in one canonical file, not repeated across multiple always-on adapters.';
  const root = makeRepo({
    'AGENTS.md': `# Agent Instructions

Trigger conditions: when external data changes.
Source of truth: copied docs
Last reviewed: 2026-06-01

${duplicate}
`,
    'CLAUDE.md': `# Claude

${duplicate}
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const codes = report.warnings.map((warning) => warning.code);
    assert(codes.includes('always-on-leakage'));
    assert(codes.includes('duplicate-guidance'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('audits directory-backed always-on adapters', () => {
  const duplicate = 'This directory backed adapter guidance is too long to duplicate across multiple always-on rule files.';
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    '.cursor/rules/repo.mdc': `# Cursor Rules

Trigger conditions: copied optional detail.

${duplicate}
`,
    '.windsurf/rules/repo.md': `# Windsurf Rules

${duplicate}
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const codes = report.warnings.map((warning) => warning.code);
    assert.equal(report.summary.checkedAlwaysOnFiles, 3);
    assert(codes.includes('always-on-leakage'));
    assert(codes.includes('duplicate-guidance'));
    assert(report.warnings.some((warning) => warning.path === '.cursor/rules/repo.mdc'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checks links in directory-backed always-on adapters', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    '.cursor/rules/repo.mdc': '# Cursor Rules\n\nSee [missing](../../docs/missing.md).\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'broken-link'
      && warning.path === '.cursor/rules/repo.mdc'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('audits nested AGENTS.md files without treating fixtures as live instructions', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'packages/app/AGENTS.md': `# Package Instructions

Trigger conditions: copied optional detail.
`,
    'test/fixtures/example/AGENTS.md': `# Fixture Instructions

Trigger conditions: fixture detail.
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.checkedAlwaysOnFiles, 2);
    assert(report.warnings.some((warning) => (
      warning.code === 'always-on-leakage'
      && warning.path === 'packages/app/AGENTS.md'
    )));
    assert(!report.warnings.some((warning) => warning.path === 'test/fixtures/example/AGENTS.md'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('warns when plural ADR files are missing an index route', () => {
  const root = makeRepo({
    'docs/adrs/ADR-001.md': `---
status: active
owner: Platform
source_of_truth: architecture review
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner review
---

# ADR 001
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => warning.code === 'missing-adrs-index'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('treats uppercase Markdown extensions as routed artifacts', () => {
  const root = makeRepo({
    'docs/data-contracts/orders.MD': `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

# Orders
`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'missing-data-contract-index'
      && warning.path === 'docs/data-contracts'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('requires exact route-index link targets for load-bearing artifacts', () => {
  const metadata = `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

`;
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Backorders](backorders.md)\n',
    'docs/data-contracts/backorders.md': `${metadata}# Backorders\n`,
    'docs/data-contracts/orders.md': `${metadata}# Orders\n`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'unindexed-artifact'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not count hidden reference definitions as route-index entries', () => {
  const metadata = `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

`;
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n[orders]: orders.md\n',
    'docs/data-contracts/orders.md': `${metadata}# Orders\n`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'unindexed-artifact'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not count HTML-commented links as route-index entries', () => {
  const metadata = `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

`;
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n<!-- [Orders](orders.md) -->\n',
    'docs/data-contracts/orders.md': `${metadata}# Orders\n`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'unindexed-artifact'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not count indented code links as route-index entries', () => {
  const metadata = `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

`;
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n    - [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': `${metadata}# Orders\n`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'unindexed-artifact'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not count list-contained fenced code links as route-index entries', () => {
  const metadata = `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

`;
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': [
      '# Data Contracts',
      '',
      '- Example:',
      '    ```markdown',
      '    - [Orders](orders.md)',
      '    ```',
      '',
    ].join('\n'),
    'docs/data-contracts/orders.md': `${metadata}# Orders\n`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'unindexed-artifact'
      && warning.path === 'docs/data-contracts/orders.md'
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('counts visible nested-list routes in indexes', () => {
  const metadata = `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

`;
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- Current\n    - [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': `${metadata}# Orders\n`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(!report.warnings.some((warning) => warning.code === 'unindexed-artifact'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('counts visible reference-style routes in indexes', () => {
  const metadata = `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

`;
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders][orders]\n\n[orders]: orders.md\n',
    'docs/data-contracts/orders.md': `${metadata}# Orders\n`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(!report.warnings.some((warning) => warning.code === 'unindexed-artifact'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('counts visible shortcut reference routes in indexes', () => {
  const metadata = `---
status: active
owner: Data Platform
source_of_truth: warehouse catalog
last_reviewed: 2026-06-01
review_after: 2026-12-01
provenance: owner-reviewed fixture
---

`;
  const root = makeRepo({
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders]\n\n[Orders]: orders.md\n',
    'docs/data-contracts/orders.md': `${metadata}# Orders\n`,
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(!report.warnings.some((warning) => warning.code === 'unindexed-artifact'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('warns when visible reference-style links have no definition', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [Guide][guide].\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'broken-link'
      && warning.path === 'README.md'
      && warning.message.includes('[guide]')
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checks shortcut reference link targets', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [Guide].\n\n[Guide]: docs/missing.md\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'broken-link'
      && warning.path === 'README.md'
      && warning.message.includes('docs/missing.md')
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checks visible nested-list link targets', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\n- Docs\n    - [Guide](docs/missing.md)\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'broken-link'
      && warning.path === 'README.md'
      && warning.line === 4
      && warning.message.includes('docs/missing.md')
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checks visible list-continuation link targets', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\n- Routes:\n    [Guide](docs/missing.md)\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => (
      warning.code === 'broken-link'
      && warning.path === 'README.md'
      && warning.line === 4
      && warning.message.includes('docs/missing.md')
    )));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores links in list-contained indented code blocks', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\n- Routes:\n      [Guide](docs/missing.md)\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(!report.warnings.some((warning) => warning.code === 'broken-link'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('includes untracked non-ignored harness files in git repositories', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
  });

  try {
    execFileSync('git', ['-C', root, 'init', '-q']);
    execFileSync('git', ['-C', root, 'add', 'AGENTS.md']);
    write('docs/data-contracts/orders.md', '# Orders Data Contract\n', root);
    write('scratch-report.md', '# Scratch\n\nSee [missing](missing.md).\n', root);

    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const codes = report.warnings.map((warning) => warning.code);
    assert(codes.includes('missing-data-contract-index'));
    assert(codes.includes('missing-metadata'));
    assert(!report.warnings.some((warning) => warning.path === 'scratch-report.md'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keeps empty git repositories on the filtered git file list', () => {
  const root = makeRepo({
    'scratch-report.md': '# Scratch\n\nSee [missing](missing.md).\n',
  });

  try {
    execFileSync('git', ['-C', root, 'init', '-q']);

    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('skips tracked files deleted from the working tree', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'docs/data-contracts/INDEX.md': '# Data Contracts\n\n- [Orders](orders.md)\n',
    'docs/data-contracts/orders.md': '# Orders Data Contract\n',
  });

  try {
    execFileSync('git', ['-C', root, 'init', '-q']);
    execFileSync('git', ['-C', root, 'add', 'AGENTS.md', 'docs/data-contracts/INDEX.md', 'docs/data-contracts/orders.md']);
    rmSync(resolve(root, 'docs/data-contracts/orders.md'), { force: true });

    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert(report.warnings.some((warning) => warning.code === 'broken-link'));
    assert(!report.warnings.some((warning) => warning.path === 'docs/data-contracts/orders.md'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('handles reference-style links and balanced parentheses in inline links', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': [
      '# Project',
      '',
      'See [existing](docs/foo_(bar).md) and [missing][missing-ref].',
      '',
      '[missing-ref]: docs/missing_(route).md',
    ].join('\n'),
    'docs/foo_(bar).md': '# Existing\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const brokenLinks = report.warnings.filter((warning) => warning.code === 'broken-link');
    assert.equal(brokenLinks.length, 1);
    assert.equal(brokenLinks[0].message.includes('docs/missing_(route).md'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores footnote definitions when checking reference-style links', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nText[^1]\n\n[^1]: This is not a link.\n',
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    assert.equal(report.summary.warningCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports broken link lines correctly in CRLF markdown files', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': ['# Project', '', 'Intro text.', 'See [missing docs](docs/missing.md).'].join('\r\n'),
  });

  try {
    const report = runDoctor({ repo: root, date: '2026-06-10' });
    const warning = report.warnings.find((item) => item.code === 'broken-link' && item.path === 'README.md');
    assert.equal(warning?.line, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI json mode reports warnings but exits zero', () => {
  const root = makeRepo({
    'AGENTS.md': '# Agent Instructions\n',
    'README.md': '# Project\n\nSee [missing docs](docs/missing.md).\n',
  });

  try {
    const output = execFileSync(process.execPath, [doctorScript, '--repo', root, '--date', '2026-06-10', '--json'], {
      encoding: 'utf8',
    });
    const report = JSON.parse(output);
    assert.equal(report.mode, 'warning');
    assert.equal(report.summary.warningCount, 1);
    assert.equal(report.warnings[0].code, 'broken-link');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('decision memory warns above 1,000 physical lines with CRLF and a terminal newline', (t) => {
  const log = '# Decisions\r\n' + 'Notes\r\n'.repeat(999);
  const root = makeRepo({ 'docs/decisions.md': log });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(readDoctorJson(root).warnings, []);

  write('docs/decisions.md', log + 'One more note\r\n', root);
  const { mode, warnings } = readDoctorJson(root);
  assert.equal(mode, 'warning');
  assert.deepEqual(warnings.map(({ code, path }) => ({ code, path })), [
    { code: 'decision-log-length', path: 'docs/decisions.md' },
  ]);
});

test('decision memory recognizes visible same-file links before the records', (t) => {
  const root = makeRepo({
    'docs/decisions.md': decisionLog('- [Second][route]') + '\n[route]: ./decisions.md#adr-0782--use-green-folders\n',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(readDoctorJson(root).warnings, []);
});

for (const [description, index, afterRecords] of [
  ['inside a fence', '~~~markdown\n- [First](#d-781-use-blue-folders)\n~~~', ''],
  ['after the records', '', '\n- [First](#d-781-use-blue-folders)\n'],
  ['in another file', '- [First](../README.md#d-781-use-blue-folders)', ''],
  ['an image destination', '![Diagram](#d-781-use-blue-folders)', ''],
  ['plain text', 'This is plain text ](#d-781-use-blue-folders).', ''],
  ['to an unrelated section', '- [Background](#background)\n\n## Background', ''],
]) {
  test('decision memory warns when its only index links are ' + description, (t) => {
    const root = makeRepo({
      'README.md': '# Project\n',
      'docs/decisions.md': decisionLog(index) + afterRecords,
    });
    t.after(() => rmSync(root, { recursive: true, force: true }));

    const { warnings } = readDoctorJson(root);
    assert.deepEqual(warnings.map(({ code, path }) => ({ code, path })), [
      { code: 'decision-log-index', path: 'docs/decisions.md' },
    ]);
  });
}

test('decision memory reports the later real heading and first declaration location', (t) => {
  const id = 'D-' + 781;
  const root = makeRepo({
    'docs/decisions.md': decisionLog('- [First](#d-781-use-blue-folders)') + '\n## ' + id + '\n',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const { warnings } = readDoctorJson(root);
  assert.deepEqual(warnings.map(({ code, path, line }) => ({ code, path, line })), [
    { code: 'duplicate-decision-id', path: 'docs/decisions.md', line: 29 },
  ]);
  assert.ok(warnings[0].message.includes(id));
  assert.ok(warnings[0].message.includes('docs/decisions.md:5'));
});

test('decision memory preserves the split index checks and accepts a redirect shim', (t) => {
  const filename = 'D' + 782 + '-blue-folders.md';
  const root = makeRepo({
    'docs/decisions.md': '# Decisions\n\nSee the [decision index](adr/INDEX.md).\n',
    'docs/adr/INDEX.md': '# Decisions\n\n- [Blue folders](' + filename + ')\n',
    ['docs/adr/' + filename]: readFileSync(resolve(decisionFixtures, 'split-record.md'), 'utf8'),
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(readDoctorJson(root).warnings, []);

  write('docs/adr/INDEX.md', '# Decisions\n', root);
  assert.deepEqual(readDoctorJson(root).warnings.map(({ code }) => code), ['unindexed-artifact']);

  rmSync(resolve(root, 'docs/adr/INDEX.md'));
  assert.deepEqual(readDoctorJson(root).warnings.map(({ code }) => code).sort(), ['broken-link', 'missing-adr-index']);
});

test('decision memory compares exact IDs across both split directories and the single log', (t) => {
  const id = 'ADR-' + String(783).padStart(4, '0');
  const first = id + '-blue-folders.md';
  const later = id + '-green-folders.md';
  const distinct = 'ADR-' + 783 + '-yellow-folders.md';
  const record = readFileSync(resolve(decisionFixtures, 'split-record.md'), 'utf8');
  const root = makeRepo({
    ['docs/adr/' + first]: record,
    'docs/adr/INDEX.md': '# Decisions\n\n- [Blue folders](' + first + ')\n',
    ['docs/adrs/' + later]: record,
    ['docs/adrs/' + distinct]: record,
    'docs/adrs/INDEX.md': '# Decisions\n\n- [Green folders](' + later + ')\n- [Yellow folders](' + distinct + ')\n',
    'docs/decisions.md': '# Decisions\n\n## ' + id + ' ###\n',
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const { warnings } = readDoctorJson(root);
  assert.deepEqual(warnings.map(({ code, path, line }) => ({ code, path, line })), [
    { code: 'duplicate-decision-id', path: 'docs/adrs/' + later, line: undefined },
    { code: 'duplicate-decision-id', path: 'docs/decisions.md', line: 3 },
  ]);
  assert.ok(warnings.every(({ message }) => message.includes('docs/adr/' + first)));
});

function decisionLog(index) {
  return readFileSync(resolve(decisionFixtures, 'single-log.md'), 'utf8')
    .replaceAll('{{index}}', index)
    .replaceAll('{{short}}', 'D-' + 781)
    .replaceAll('{{adr}}', 'ADR-' + String(782).padStart(4, '0'));
}

function readDoctorJson(root) {
  return JSON.parse(execFileSync(process.execPath, [doctorScript, '--repo', root, '--date', '2026-06-10', '--json'], {
    encoding: 'utf8',
  }));
}

function makeRepo(files) {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-doctor-'));
  for (const [file, contents] of Object.entries(files)) {
    write(file, contents, root);
  }
  return root;
}

function write(file, contents, root) {
  const target = resolve(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
