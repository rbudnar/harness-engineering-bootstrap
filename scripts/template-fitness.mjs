#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const alwaysOnFiles = [
  { path: 'AGENTS.md', maxLines: 80, maxBytes: 4000, required: true },
  { path: 'CLAUDE.md', maxLines: 40, maxBytes: 2000, adapter: true },
  { path: 'GEMINI.md', maxLines: 40, maxBytes: 2000, adapter: true },
  { path: '.github/copilot-instructions.md', maxLines: 40, maxBytes: 2000, adapter: true },
  { path: '.cursor/rules', maxLines: 40, maxBytes: 2000, adapter: true },
  { path: '.windsurf/rules', maxLines: 40, maxBytes: 2000, adapter: true },
];

const anchors = [
  {
    path: 'README.md',
    text: 'Do not copy every optional module by default',
    reason: 'consumer repos must not cargo-cult optional modules',
  },
  {
    path: 'templates/Harness Engineering Bootstrap.md',
    text: 'This bootstrap document is intentionally more detailed than the files it creates',
    reason: 'the template may be detailed while generated harness files stay thin',
  },
  {
    path: 'templates/Harness Engineering Bootstrap.md',
    text: 'Default to zero optional modules',
    reason: 'optional modules need evidence before admission',
  },
  {
    path: 'templates/Harness Engineering Bootstrap.md',
    text: 'Retire or weaken when',
    reason: 'controls need an exit condition',
  },
  {
    path: 'docs/dogfooding.md',
    text: 'Rejection is a useful outcome',
    reason: 'daily automation must be allowed to say no',
  },
  {
    path: 'docs/dogfooding.md',
    text: 'Template rule changes must keep this dogfooding harness current in the same PR',
    reason: 'template changes must update the dogfooding contract when they change repo best practices',
  },
  {
    path: 'templates/Harness Engineering Bootstrap.md',
    text: 'If review finds two issues in the same defect family',
    reason: 'same-family review churn must become a modeled fix',
  },
  {
    path: 'docs/dogfooding.md',
    text: 'one defect family',
    reason: 'this repo must dogfood same-family review churn escalation',
  },
];

const suggestionClassifications = [
  'Reduce context',
  'Improve routing',
  'Add mechanical enforcement',
  'Clarify trigger/retirement criteria',
  'Reject as bloat',
];

const failures = [];
const warnings = [];
const metrics = [];

function absolute(path) {
  return join(repoRoot, path);
}

function read(path) {
  return readFileSync(absolute(path), 'utf8');
}

function readAlwaysOn(path) {
  const target = absolute(path);
  const stat = statSync(target);

  if (!stat.isDirectory()) {
    return { text: readFileSync(target, 'utf8'), fileCount: 1 };
  }

  const files = listFiles(target);
  const text = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  return { text, fileCount: files.length };
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(child);
      if (entry.isFile()) return [child];
      return [];
    })
    .sort();
}

function exists(path) {
  return existsSync(absolute(path));
}

function lineCount(text) {
  if (!text.length) return 0;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
  if (!normalized.length) return 0;
  return normalized.split('\n').length;
}

function byteCount(text) {
  return Buffer.byteLength(text, 'utf8');
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function metric(message) {
  metrics.push(message);
}

function isFenceBoundary(line) {
  return /^\s*(```|~~~)/.test(line);
}

function markdownLines(text) {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function findMarkdownLineIndex(text, predicate, startAt = 0) {
  const lines = markdownLines(text);
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isFenceBoundary(line)) {
      inFence = !inFence;
      continue;
    }
    if (index >= startAt && !inFence && predicate(line)) return index;
  }

  return -1;
}

function checkAlwaysOn() {
  let totalLines = 0;
  let totalBytes = 0;
  const forbiddenAlwaysOnPatterns = [
    { pattern: /^## Phase \d+\b/m, label: 'template phase sections' },
    { pattern: /^## Bootstrap Checklist\b/m, label: 'the bootstrap checklist' },
    { pattern: /^## References\b/m, label: 'reference lists' },
  ];

  metric('Always-on instruction files:');

  for (const file of alwaysOnFiles) {
    if (!exists(file.path)) {
      if (file.required) fail(`${file.path} is required as the thin repo entrypoint.`);
      continue;
    }

    const { text, fileCount } = readAlwaysOn(file.path);
    const lines = lineCount(text);
    const bytes = byteCount(text);
    totalLines += lines;
    totalBytes += bytes;

    const fileLabel = fileCount === 1 ? file.path : `${file.path} (${fileCount} files)`;
    metric(`- ${fileLabel}: ${lines} lines, ${bytes} bytes (limit ${file.maxLines} lines, ${file.maxBytes} bytes)`);

    if (lines > file.maxLines) {
      fail(`${file.path} has ${lines} lines; limit is ${file.maxLines}. Move detail behind a route.`);
    }
    if (bytes > file.maxBytes) {
      fail(`${file.path} has ${bytes} bytes; limit is ${file.maxBytes}. Move detail behind a route.`);
    }
    if (file.adapter && !text.includes('AGENTS.md')) {
      fail(`${file.path} must point to AGENTS.md instead of becoming a separate source of truth.`);
    }

    for (const forbidden of forbiddenAlwaysOnPatterns) {
      if (forbidden.pattern.test(text)) {
        fail(`${file.path} includes ${forbidden.label}; keep that content in the template or routed docs, not always-on guidance.`);
      }
    }
  }

  metric(`- total: ${totalLines} lines, ${totalBytes} bytes (limit 160 lines, 8000 bytes)`);

  if (totalLines > 160) fail(`Always-on guidance totals ${totalLines} lines; limit is 160.`);
  if (totalBytes > 8000) fail(`Always-on guidance totals ${totalBytes} bytes; limit is 8000.`);
}

function checkAnchors() {
  metric('\nAnti-bloat anchors:');

  for (const anchor of anchors) {
    if (!exists(anchor.path)) {
      fail(`${anchor.path} is missing; cannot verify anchor: ${anchor.reason}.`);
      continue;
    }

    const text = read(anchor.path);
    if (!text.includes(anchor.text)) {
      fail(`${anchor.path} is missing anti-bloat anchor "${anchor.text}" (${anchor.reason}).`);
    } else {
      metric(`- ${anchor.path}: ${anchor.reason}`);
    }
  }
}

function countTriggeredModuleBullets(template) {
  const lines = markdownLines(template);
  const start = findMarkdownLineIndex(template, (line) => line.trim() === 'Triggered modules:');
  const end = findMarkdownLineIndex(template, (line) => line.trim() === '## Core Principles', start + 1);
  if (start === -1 || end === -1 || end <= start) return null;

  return lines.slice(start + 1, end).filter((line) => /^- /.test(line)).length;
}

function checkTemplateShape() {
  const templatePath = 'templates/Harness Engineering Bootstrap.md';
  const readmePath = 'README.md';
  const dogfoodPath = 'docs/dogfooding.md';

  if (!exists(templatePath)) {
    fail(`${templatePath} is missing.`);
    return;
  }

  const template = read(templatePath);
  const templateLines = lineCount(template);
  const requiredTemplateSections = ['## Bootstrap Checklist', '## Core Principles'];

  for (const section of requiredTemplateSections) {
    const count = headingCount(template, section);
    if (count !== 1) {
      fail(`${templatePath} must include exactly one "${section}" section for template-shape validation.`);
    }
  }

  if (findMarkdownLineIndex(template, (line) => line.trim() === 'Triggered modules:') === -1) {
    fail(`${templatePath} must include "Triggered modules:" before Core Principles for template-shape validation.`);
  }

  const checklistItems = (getSection(template, '## Bootstrap Checklist').match(/^- \[ \]/gm) ?? []).length;
  const triggeredModules = countTriggeredModuleBullets(template);

  metric('\nTemplate shape:');
  metric(`- ${templatePath}: ${templateLines} lines (warn at 2100, fail above 2300)`);
  metric(`- bootstrap checklist items: ${checklistItems} (warn above 90, fail above 100)`);
  if (triggeredModules === null) {
    fail('Could not count triggered-module bullets; restore "Triggered modules:" and "## Core Principles" before relying on this metric.');
  } else {
    metric(`- triggered-module bullets: ${triggeredModules} (limit 30)`);
  }

  if (templateLines > 2300) {
    fail(`${templatePath} has ${templateLines} lines; budget is 2300. Split, tighten, or justify the budget change.`);
  } else if (templateLines > 2100) {
    warn(`${templatePath} has ${templateLines} lines and is approaching the 2300-line bloat budget.`);
  }

  if (checklistItems > 100) {
    fail(`Bootstrap checklist has ${checklistItems} items; limit is 100. Consolidate or route lower-level checks.`);
  } else if (checklistItems > 90) {
    warn(`Bootstrap checklist has ${checklistItems} items and is close to the 100-item bloat budget.`);
  }

  if (triggeredModules !== null && triggeredModules > 30) {
    fail(`Triggered modules list has ${triggeredModules} bullets; limit is 30. Merge or reject low-evidence modules.`);
  }

  for (const [path, limit] of [[readmePath, 120], [dogfoodPath, 120]]) {
    if (!exists(path)) continue;
    const lines = lineCount(read(path));
    metric(`- ${path}: ${lines} lines (limit ${limit})`);
    if (lines > limit) fail(`${path} has ${lines} lines; limit is ${limit}. Keep repo guidance routable.`);
  }
}

function checkReleaseMarker() {
  metric('\nRelease marker:');

  if (!exists('VERSION')) {
    fail('VERSION is required as the template release marker.');
    return;
  }

  const version = read('VERSION').trim();
  metric(`- VERSION: ${version || 'empty'} (semver-like)`);

  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    fail('VERSION must contain a semver-like value such as 0.1.0 or 0.1.0-beta.1.');
  }
}

function checkReleasePolicy() {
  metric('\nRelease policy:');

  const requiredFiles = ['docs/releases.md', 'CHANGELOG.md', 'README.md', '.github/workflows/stable-release.yml'];
  for (const path of requiredFiles) {
    if (exists(path)) metric(`- ${path}: present`);
    else fail(`${path} is required for the HEB release contract.`);
  }

  if (
    !exists('docs/releases.md') ||
    !exists('CHANGELOG.md') ||
    !exists('README.md') ||
    !exists('.github/workflows/stable-release.yml') ||
    !exists('VERSION')
  ) return;

  const version = read('VERSION').trim();
  const tag = `v${version}`;
  const releasePolicy = read('docs/releases.md');
  const releasePolicyAnchors = [
    '`VERSION` contains the numeric SemVer value without a leading `v`',
    'Git tags and GitHub releases use `v<VERSION>`',
    '## Pre-1.0 Semantics',
    '## Release Notes',
    '## Bootstrapped Repository Metadata',
    '`templateVersion`',
    '`sourceRelease`',
    '`acceptedChanges`',
    '`rejectedChanges`',
    '`rollback`',
    'release:current',
    'release:patch',
    'release:minor',
    'HEB_RELEASE_DEPLOY_KEY',
    'node --test scripts/harness-bootstrap-plan.test.mjs',
    'node --test scripts/prepare-stable-release.test.mjs',
    'node scripts/template-fitness.mjs',
    'node scripts/harness-bootstrap-plan.mjs --repo . --mode update --target-version v<VERSION>',
  ];

  for (const text of releasePolicyAnchors) {
    if (!releasePolicy.includes(text)) fail(`docs/releases.md must include release-policy anchor: ${text}`);
  }

  const stableReleaseWorkflow = read('.github/workflows/stable-release.yml');
  const stableWorkflowAnchors = [
    "github.event.pull_request.base.ref == github.event.repository.default_branch",
    "DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}",
    'persist-credentials: false',
    'git fetch "$PUSH_REMOTE" "$DEFAULT_BRANCH" --tags --force',
    'Default branch already advanced to release tag',
    'Default branch moved from triggering merge',
    'git checkout --detach FETCH_HEAD',
    'git rev-list -n 1 "$CURRENT_TAG"',
    'not completed release commit',
    'UNRELEASED_HAS_CONTENT',
    'RELEASE_TYPE=current',
    'node scripts/prepare-stable-release.mjs',
    'git diff --cached --quiet',
  ];
  for (const text of stableWorkflowAnchors) {
    if (!stableReleaseWorkflow.includes(text)) fail(`.github/workflows/stable-release.yml must include stable-release safety anchor: ${text}`);
  }

  if (!read('README.md').includes('[Release policy](docs/releases.md)')) {
    fail('README.md must link to docs/releases.md.');
  }

  const changelog = read('CHANGELOG.md');
  const releaseSectionPattern = new RegExp(`(?:^|\\r?\\n)## ${escapeRegExp(tag)} - \\d{4}-\\d{2}-\\d{2}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`);
  const releaseSection = changelog.match(releaseSectionPattern)?.[1] || '';

  if (!releaseSection) {
    fail(`CHANGELOG.md must include a release section for ${tag}.`);
    return;
  }

  for (const heading of ['Summary', 'Template Changes', 'Planner And Metadata', 'Migration', 'Validation', 'Rollback']) {
    if (!releaseSection.includes(`### ${heading}`)) {
      fail(`CHANGELOG.md release ${tag} must include "### ${heading}".`);
    }
  }
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArgs(args) {
  const suggestionPaths = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--suggestion') {
      const next = args[i + 1];
      if (!next) fail('--suggestion requires a file path.');
      else suggestionPaths.push(next);
      i += 1;
    } else {
      suggestionPaths.push(arg);
    }
  }

  return { suggestionPaths };
}

function getSection(text, heading) {
  const lines = markdownLines(text);
  const normalizedHeading = heading.toLowerCase();
  const start = findMarkdownLineIndex(text, (line) => line.trim().toLowerCase() === normalizedHeading);
  if (start === -1) return '';

  const end = findMarkdownLineIndex(text, (line) => /^##\s+/.test(line), start + 1);
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

function headingCount(text, heading) {
  const normalizedHeading = heading.toLowerCase();
  const lines = markdownLines(text);
  let inFence = false;
  let count = 0;

  for (const line of lines) {
    if (isFenceBoundary(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.trim().toLowerCase() === normalizedHeading) count += 1;
  }

  return count;
}

function checkSuggestion(path) {
  const absPath = resolve(repoRoot, path);
  const displayPath = relative(repoRoot, absPath) || path;

  if (!existsSync(absPath)) {
    fail(`Suggestion file not found: ${path}`);
    return;
  }

  const text = readFileSync(absPath, 'utf8');
  const classificationValue = getSection(text, '## Classification').trim().toLowerCase().replace(/\s+/g, ' ');
  const canonicalClassification = suggestionClassifications.find(
    (classification) => classification.toLowerCase() === classificationValue,
  );

  metric(`\nSuggestion: ${displayPath}`);

  const classificationHeadingCount = headingCount(text, '## Classification');
  if (classificationHeadingCount === 0) {
    fail(`${displayPath} must include "## Classification".`);
    if (/recommendations|acceptance category|proposed diff target/im.test(text)) {
      fail(`${displayPath} looks like a scout digest. Split it into one proposal per recommendation using docs/dogfooding.md.`);
    }
  } else if (classificationHeadingCount > 1) {
    fail(`${displayPath} must include exactly one "## Classification" section.`);
  } else if (!canonicalClassification) {
    fail(`${displayPath} must include exactly one classification: ${suggestionClassifications.join(', ')}.`);
  } else {
    metric(`- classification: ${canonicalClassification}`);
  }

  const requiredSections = [
    '## Evidence',
    '## Smaller Control',
    '## Validation',
    '## Retirement',
  ];

  for (const section of requiredSections) {
    const count = headingCount(text, section);
    if (count === 0) {
      fail(`${displayPath} must include "${section}".`);
    } else if (count > 1) {
      fail(`${displayPath} must include exactly one "${section}" section.`);
    } else if (!getSection(text, section).trim()) {
      fail(`${displayPath} must include content under "${section}".`);
    }
  }

  const isRejection = canonicalClassification?.toLowerCase() === 'reject as bloat';
  const predictionHeadingCount = headingCount(text, '## Prediction');
  if (predictionHeadingCount > 1) {
    fail(`${displayPath} must include no more than one "## Prediction" section.`);
  }

  if (canonicalClassification && !isRejection) {
    if (predictionHeadingCount === 0) {
      fail(`${displayPath} must include "## Prediction" for accepted suggestions.`);
    } else if (!getSection(text, '## Prediction').trim()) {
      fail(`${displayPath} must include content under "## Prediction".`);
    }
  }
}

function main() {
  const { suggestionPaths } = parseArgs(process.argv.slice(2));

  checkAlwaysOn();
  checkAnchors();
  checkTemplateShape();
  checkReleaseMarker();
  checkReleasePolicy();

  for (const suggestionPath of suggestionPaths) {
    checkSuggestion(suggestionPath);
  }

  console.log('Template fitness audit');
  console.log('======================');
  console.log(metrics.join('\n'));

  if (warnings.length) {
    console.log('\nWarnings:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  if (failures.length) {
    console.error('\nFailures:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('\nOK: template fitness checks passed.');
}

main();
