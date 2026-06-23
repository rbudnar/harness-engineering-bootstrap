#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
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

const repoSkillRootPaths = ['.agents/skills'];
const allowedSkillFrontmatterFields = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const skillNameCharactersPattern = /^[\p{L}\p{N}-]+$/u;
const uppercaseSkillNamePattern = /[\p{Lu}\p{Lt}]/u;
const yamlTypedPlainScalarPattern = /^(?:[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?|true|false|null|~)$/i;

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

function hasExactChildFile(dir, expectedName) {
  return readdirSync(dir, { withFileTypes: true })
    .some((entry) => entry.isFile() && entry.name === expectedName);
}

function listSkillPackages(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (!entry.isDirectory()) return [];
      const packageDir = join(dir, entry.name);
      const skillFile = join(packageDir, 'SKILL.md');
      return [{
        packageDir,
        skillFile: hasExactChildFile(packageDir, 'SKILL.md') ? skillFile : null,
      }];
    })
    .sort((left, right) => left.packageDir.localeCompare(right.packageDir));
}

function listRepoSkillPackages() {
  return repoSkillRootPaths.flatMap((skillRootPath) => {
    const skillRoot = absolute(skillRootPath);
    if (!existsSync(skillRoot)) return [];
    if (!statSync(skillRoot).isDirectory()) {
      fail(`${skillRootPath} must be a directory when repo-local skills are present.`);
      return [];
    }
    return listSkillPackages(skillRoot);
  }).sort();
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

function hasMarkdownRoute(text, targetPath) {
  const escapedTarget = targetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inlineLinkPattern = new RegExp(`\\]\\((?:\\./)?${escapedTarget}(?:#[^)]+)?\\)`, 'i');
  const referenceLinkPattern = new RegExp(`^\\s*\\[[^\\]]+\\]:\\s*(?:\\./)?${escapedTarget}(?:#\\S+)?\\s*$`, 'i');
  return findMarkdownLineIndex(text, (line) => (
    inlineLinkPattern.test(line) || referenceLinkPattern.test(line)
  )) !== -1;
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
  const measurementReferencePath = 'templates/references/measurement-layer.md';
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
  if (!hasMarkdownRoute(template, 'references/measurement-layer.md')) {
    fail(`${templatePath} must route deeper measurement-layer detail to ${measurementReferencePath}.`);
  }
  if (!exists(measurementReferencePath)) {
    fail(`${measurementReferencePath} must exist when measurement detail is routed out of the main template.`);
  } else {
    const measurementReference = read(measurementReferencePath);
    if (!measurementReference.includes('## Admission Gate') || !measurementReference.includes('## Optional Regression Eval')) {
      fail(`${measurementReferencePath} must preserve measurement admission and optional eval guidance.`);
    }
  }

  const checklistItems = (getSection(template, '## Bootstrap Checklist').match(/^- \[ \]/gm) ?? []).length;
  const triggeredModules = countTriggeredModuleBullets(template);

  metric('\nTemplate shape:');
  metric(`- ${templatePath}: ${templateLines} lines (warn at 1800, fail above 2000)`);
  metric(`- bootstrap checklist items: ${checklistItems} (warn above 90, fail above 100)`);
  if (triggeredModules === null) {
    fail('Could not count triggered-module bullets; restore "Triggered modules:" and "## Core Principles" before relying on this metric.');
  } else {
    metric(`- triggered-module bullets: ${triggeredModules} (limit 30)`);
  }

  if (templateLines > 2000) {
    fail(`${templatePath} has ${templateLines} lines; budget is 2000. Split, tighten, or justify the budget change.`);
  } else if (templateLines > 1800) {
    warn(`${templatePath} has ${templateLines} lines and is approaching the 2000-line bloat budget.`);
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

  checkPackageMetadata(version);
}

function checkPackageMetadata(version) {
  if (!exists('package.json')) {
    fail('package.json is required for the packaged planner entrypoint.');
    return;
  }

  let packageJson;
  try {
    packageJson = JSON.parse(read('package.json'));
  } catch (error) {
    fail(`package.json must be valid JSON: ${error.message}`);
    return;
  }

  metric(`- package.json: ${packageJson.version || 'missing version'} (bin ${packageJson.bin?.['harness-bootstrap'] || 'missing'})`);

  if (packageJson.version !== version) {
    fail(`package.json version ${packageJson.version || '<missing>'} must match VERSION ${version}.`);
  }
  if (packageJson.name !== '@rbudnar/harness-engineering-bootstrap') {
    fail('package.json name must stay @rbudnar/harness-engineering-bootstrap until a distribution issue changes it.');
  }
  if (packageJson.private !== true) {
    fail('package.json must stay private while npm registry publishing is unsupported.');
  }
  const publishGuard = packageJson.scripts?.prepublishOnly || '';
  if (!publishGuard.includes('npm registry publishing is unsupported') || !publishGuard.includes('process.exit(1)')) {
    fail('package.json must keep a prepublishOnly guard that blocks unsupported npm registry publishing.');
  }
  if (packageJson.bin?.['harness-bootstrap'] !== 'scripts/harness-bootstrap-plan.mjs') {
    fail('package.json must expose harness-bootstrap as scripts/harness-bootstrap-plan.mjs.');
  }
  if (
    !packageJson.files?.includes('scripts/harness-bootstrap-plan.mjs') ||
    !packageJson.files?.includes('scripts/template-fitness.mjs') ||
    !packageJson.files?.includes('templates/') ||
    !packageJson.files?.includes('VERSION')
  ) {
    fail('package.json files must include the planner script, template-fitness script, templates/, and VERSION for GitHub package-spec execution.');
  }
  if (listRepoSkillPackages().length && !packageJson.files?.includes('.agents/skills/')) {
    fail('package.json files must include .agents/skills/ when repo-local skills are present.');
  }

  const readme = read('README.md');
  if (!readme.includes('harness-bootstrap init --repo')) {
    fail('README.md must document the dry-run harness-bootstrap init package entrypoint.');
  }
  if (!readme.includes('`--write` is intentionally unsupported')) {
    fail('README.md must document that package write mode is intentionally unsupported.');
  }
}

function isEscapedDoubleQuote(value, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function parseQuotedYamlScalar(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  let cursor = 1;
  let scalar = '';

  while (cursor < trimmed.length) {
    const char = trimmed[cursor];
    if (char === quote) {
      if (quote === "'" && trimmed[cursor + 1] === "'") {
        scalar += "'";
        cursor += 2;
        continue;
      }
      if (quote === '"' && isEscapedDoubleQuote(trimmed, cursor)) {
        scalar += char;
        cursor += 1;
        continue;
      }

      const suffix = trimmed.slice(cursor + 1).trim();
      if (suffix && !suffix.startsWith('#')) return { valid: false, value: '', quoted: true };
      return { valid: true, value: scalar, quoted: true };
    }

    scalar += char;
    cursor += 1;
  }

  return { valid: false, value: '', quoted: true };
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#')) return { valid: true, value: '', quoted: false };

  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return parseQuotedYamlScalar(trimmed);
  if (trimmed.endsWith('"') || trimmed.endsWith("'")) return { valid: false, value: '', quoted: false };

  const commentIndex = trimmed.search(/\s#/);
  const withoutComment = commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex).trimEnd();
  if (/:($|\s)/.test(withoutComment)) return { valid: false, value: '', quoted: false };
  return { valid: true, value: withoutComment, quoted: false };
}

function isYamlTypedPlainScalar(parsedScalar) {
  return !parsedScalar.quoted && yamlTypedPlainScalarPattern.test(parsedScalar.value);
}

function parseSimpleFrontmatter(text) {
  const lines = markdownLines(text);
  if (lines[0] !== '---') return null;

  const end = lines.findIndex((line, index) => index > 0 && line === '---');
  if (end === -1) return null;

  const fields = {};
  const fieldKinds = {};
  const invalidLines = [];
  let activeMap = null;
  const frontmatterLines = lines.slice(1, end);

  for (let offset = 0; offset < frontmatterLines.length; offset += 1) {
    const line = frontmatterLines[offset];
    const lineNumber = offset + 2;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    if (/^\s/.test(line)) {
      if (!activeMap) {
        invalidLines.push(lineNumber);
        continue;
      }

      const nestedMatch = line.match(/^\s+([A-Za-z0-9_.-]+):\s*(.*)$/);
      if (!nestedMatch) {
        invalidLines.push(lineNumber);
        continue;
      }

      const nestedKey = nestedMatch[1];
      if (Object.hasOwn(fields[activeMap], nestedKey)) {
        invalidLines.push(lineNumber);
        continue;
      }

      const nestedScalar = parseYamlScalar(nestedMatch[2]);
      if (!nestedScalar.valid) {
        invalidLines.push(lineNumber);
        continue;
      }

      fields[activeMap][nestedKey] = nestedScalar.value;
      continue;
    }

    activeMap = null;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      invalidLines.push(lineNumber);
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (Object.hasOwn(fields, key)) {
      invalidLines.push(lineNumber);
      continue;
    }

    const blockScalar = value.match(/^([|>])(?:[+-]?\d*|\d+[+-]?)$/);
    if (blockScalar) {
      const blockLines = [];
      let blockIndent = null;

      while (offset + 1 < frontmatterLines.length) {
        const nextLine = frontmatterLines[offset + 1];
        if (!nextLine.trim()) {
          blockLines.push('');
          offset += 1;
          continue;
        }

        const indentMatch = nextLine.match(/^(\s+)/);
        if (!indentMatch) break;

        const indent = indentMatch[1].length;
        blockIndent ??= indent;
        blockLines.push(nextLine.slice(Math.min(blockIndent, nextLine.length)));
        offset += 1;
      }

      fields[key] = blockScalar[1] === '>' ? blockLines.join(' ').replace(/\s+/g, ' ').trim() : blockLines.join('\n').trim();
      fieldKinds[key] = 'scalar';
    } else if (value) {
      const scalar = parseYamlScalar(value);
      if (!scalar.valid || isYamlTypedPlainScalar(scalar)) {
        invalidLines.push(lineNumber);
      }

      fields[key] = scalar.value;
      fieldKinds[key] = 'scalar';
    } else {
      fields[key] = {};
      fieldKinds[key] = 'map';
      activeMap = key;
    }
  }

  return { fields, fieldKinds, invalidLines, body: lines.slice(end + 1).join('\n') };
}

function characterCount(value) {
  return Array.from(value).length;
}

function normalizeSkillName(value) {
  return value.normalize('NFKC');
}

function requireSkillScalar(parsed, displayPath, fieldName) {
  if (!Object.hasOwn(parsed.fields, fieldName)) return null;
  if (parsed.fieldKinds[fieldName] !== 'scalar') {
    fail(`${displayPath} frontmatter "${fieldName}" must be a scalar string.`);
    return null;
  }
  return parsed.fields[fieldName].trim();
}

function checkSkillStandards() {
  const skillPackages = listRepoSkillPackages();

  metric('\nRepo-local skills:');

  if (!skillPackages.length) {
    metric('- none found; optional skills remain absent');
    return;
  }

  for (const { packageDir, skillFile } of skillPackages) {
    const displayPath = skillFile ? relative(repoRoot, skillFile) : `${relative(repoRoot, packageDir)}/`;

    metric(`- ${displayPath}`);

    if (!skillFile) {
      fail(`${displayPath} must include an uppercase SKILL.md file.`);
      continue;
    }

    const parentDir = basename(dirname(skillFile));
    const parsed = parseSimpleFrontmatter(readFileSync(skillFile, 'utf8'));

    if (!parsed) {
      fail(`${displayPath} must start with YAML frontmatter delimited by "---".`);
      continue;
    }

    if (parsed.invalidLines.length) {
      fail(`${displayPath} has unsupported or duplicate frontmatter syntax on line(s): ${parsed.invalidLines.join(', ')}.`);
    }

    for (const fieldName of Object.keys(parsed.fields)) {
      if (!allowedSkillFrontmatterFields.has(fieldName)) {
        fail(`${displayPath} has unsupported frontmatter field "${fieldName}"; use "metadata" for extension data.`);
      }
    }

    const name = requireSkillScalar(parsed, displayPath, 'name');
    const normalizedName = name ? normalizeSkillName(name) : null;
    const normalizedParentDir = normalizeSkillName(parentDir);
    const description = requireSkillScalar(parsed, displayPath, 'description');

    if (!name) {
      fail(`${displayPath} must include a frontmatter "name" field.`);
    } else {
      if (
        characterCount(normalizedName) > 64 ||
        !skillNameCharactersPattern.test(normalizedName) ||
        uppercaseSkillNamePattern.test(normalizedName) ||
        normalizedName.startsWith('-') ||
        normalizedName.endsWith('-') ||
        normalizedName.includes('--')
      ) {
        fail(`${displayPath} has invalid skill name "${name}"; use Unicode lowercase letters, numbers, and hyphens only.`);
      }
      if (normalizedName !== normalizedParentDir) {
        fail(`${displayPath} frontmatter name "${name}" must match parent directory "${parentDir}".`);
      }
    }

    if (!description) {
      fail(`${displayPath} must include a non-empty frontmatter "description" field.`);
    } else if (characterCount(description) > 1024) {
      fail(`${displayPath} description is ${characterCount(description)} characters; limit is 1024.`);
    }

    const license = requireSkillScalar(parsed, displayPath, 'license');
    if (Object.hasOwn(parsed.fields, 'license') && !license) {
      fail(`${displayPath} frontmatter "license" must be non-empty when provided.`);
    }

    const compatibility = requireSkillScalar(parsed, displayPath, 'compatibility');
    if (Object.hasOwn(parsed.fields, 'compatibility')) {
      if (!compatibility) {
        fail(`${displayPath} frontmatter "compatibility" must be non-empty when provided.`);
      } else if (characterCount(compatibility) > 500) {
        fail(`${displayPath} compatibility is ${characterCount(compatibility)} characters; limit is 500.`);
      }
    }

    if (Object.hasOwn(parsed.fields, 'metadata')) {
      if (parsed.fieldKinds.metadata !== 'map' || Array.isArray(parsed.fields.metadata)) {
        fail(`${displayPath} frontmatter "metadata" must be a key-value mapping.`);
      } else {
        for (const [key, value] of Object.entries(parsed.fields.metadata)) {
          if (!key.trim() || typeof value !== 'string') {
            fail(`${displayPath} frontmatter "metadata" must map string keys to string values.`);
          }
        }
      }
    }

    const allowedTools = requireSkillScalar(parsed, displayPath, 'allowed-tools');
    if (Object.hasOwn(parsed.fields, 'allowed-tools') && !allowedTools) {
      fail(`${displayPath} frontmatter "allowed-tools" must be a non-empty space-separated string when provided.`);
    }

    if (!parsed.body.trim()) {
      fail(`${displayPath} must include Markdown instructions after the frontmatter.`);
    }
  }
}

function checkReleasePolicy() {
  metric('\nRelease policy:');

  const requiredFiles = ['docs/releases.md', 'CHANGELOG.md', 'README.md', '.github/workflows/template-fitness.yml', '.github/workflows/stable-release.yml'];
  for (const path of requiredFiles) {
    if (exists(path)) metric(`- ${path}: present`);
    else fail(`${path} is required for the HEB release contract.`);
  }

  if (
    !exists('docs/releases.md') ||
    !exists('CHANGELOG.md') ||
    !exists('README.md') ||
    !exists('.github/workflows/template-fitness.yml') ||
    !exists('.github/workflows/stable-release.yml') ||
    !exists('VERSION')
  ) return;

  const version = read('VERSION').trim();
  const tag = `v${version}`;
  const releasePolicy = read('docs/releases.md');
  const releasePolicyAnchors = [
    '`VERSION` contains the numeric SemVer value without a leading `v`',
    '`package.json` uses the same numeric version when package metadata is present',
    '`private: true` and `prepublishOnly` block unsupported npm registry publishing',
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
    'node --test scripts/harness-doctor.test.mjs',
    'node --test scripts/package-entrypoint.test.mjs',
    'node --test scripts/prepare-stable-release.test.mjs',
    'node --test scripts/weekly-harness-report.test.mjs',
    'node scripts/template-fitness.mjs',
    'node scripts/harness-doctor.mjs',
    'node scripts/harness-bootstrap-plan.mjs --repo . --mode update --target-version v<VERSION>',
  ];

  for (const text of releasePolicyAnchors) {
    if (!releasePolicy.includes(text)) fail(`docs/releases.md must include release-policy anchor: ${text}`);
  }

  const stableReleaseWorkflow = read('.github/workflows/stable-release.yml');
  const templateFitnessWorkflow = read('.github/workflows/template-fitness.yml');
  const templateFitnessWorkflowAnchors = [
    'node --test scripts/harness-doctor.test.mjs',
    'node --test scripts/weekly-harness-report.test.mjs',
    'node scripts/harness-doctor.mjs',
  ];
  for (const text of templateFitnessWorkflowAnchors) {
    if (!templateFitnessWorkflow.includes(text)) fail(`.github/workflows/template-fitness.yml must include template-fitness safety anchor: ${text}`);
  }

  const stableWorkflowAnchors = [
    'pull_request_target:',
    'github.event.pull_request.merged == true',
    "github.event.pull_request.base.ref == github.event.repository.default_branch",
    'PR_MERGE_SHA: ${{ github.event.pull_request.merge_commit_sha }}',
    "DEFAULT_BRANCH: ${{ github.event.repository.default_branch }}",
    'persist-credentials: false',
    'git fetch "$PUSH_REMOTE" "$DEFAULT_BRANCH" --tags --force',
    'RELEASE_SOURCE=FETCH_HEAD',
    'EXPECTED_TAG="v$EXPECTED_VERSION"',
    'TAG_BELONGS_TO_RELEASE',
    'Default branch already advanced to expected release tag',
    'git merge-base --is-ancestor "$SOURCE_REF" "$TAG_TARGET"',
    'git merge-base --is-ancestor "$TAG_TARGET" "$FETCHED_HEAD"',
    'Default branch moved from triggering merge',
    'git checkout --detach "$RELEASE_SOURCE"',
    'git rev-list -n 1 "$CURRENT_TAG"',
    'not completed release commit',
    'UNRELEASED_HAS_CONTENT',
    'RELEASE_TYPE=current',
    'node --test scripts/harness-doctor.test.mjs',
    'node --test scripts/package-entrypoint.test.mjs',
    'node --test scripts/weekly-harness-report.test.mjs',
    'node scripts/harness-doctor.mjs',
    'node scripts/prepare-stable-release.mjs',
    'git add VERSION CHANGELOG.md package.json',
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

function checkWeeklyHarnessReporting() {
  metric('\nWeekly harness reporting:');

  const requiredFiles = [
    'scripts/weekly-harness-report.mjs',
    'scripts/weekly-harness-report.test.mjs',
    '.github/workflows/weekly-harness-report.yml',
  ];
  for (const path of requiredFiles) {
    if (exists(path)) metric(`- ${path}: present`);
    else fail(`${path} is required for scheduled HEB dogfooding reports.`);
  }

  if (!requiredFiles.every((path) => exists(path))) return;

  const workflow = read('.github/workflows/weekly-harness-report.yml');
  const workflowAnchors = [
    'schedule:',
    "cron: '20 13 * * 1'",
    'issues: write',
    'node scripts/weekly-harness-report.mjs',
    'actions/upload-artifact@v4',
    'Weekly Harness Report',
    'Harness problems detected by weekly report',
    "steps.report.outputs.has_problems == 'true'",
    'exit 1',
  ];
  for (const text of workflowAnchors) {
    if (!workflow.includes(text)) fail(`.github/workflows/weekly-harness-report.yml must include weekly-report anchor: ${text}`);
  }

  const script = read('scripts/weekly-harness-report.mjs');
  const scriptAnchors = [
    'node scripts/template-fitness.mjs',
    'node scripts/harness-doctor.mjs --json',
    'weekly-harness-report.json',
    'weekly-harness-report.md',
    'has_problems=',
  ];
  for (const text of scriptAnchors) {
    if (!script.includes(text)) fail(`scripts/weekly-harness-report.mjs must include weekly-report anchor: ${text}`);
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
  checkWeeklyHarnessReporting();
  checkSkillStandards();

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
