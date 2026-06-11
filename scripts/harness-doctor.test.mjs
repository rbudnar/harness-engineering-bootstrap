import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderTextReport, runDoctor } from './harness-doctor.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const doctorScript = resolve(testDir, 'harness-doctor.mjs');

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
