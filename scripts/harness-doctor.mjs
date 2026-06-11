#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentScript = fileURLToPath(import.meta.url);
export const repoRoot = resolve(dirname(currentScript), '..');

const ignoredDirectories = new Set([
  '.git',
  '.hg',
  '.svn',
  '.yarn',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
]);

const alwaysOnFileNames = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);

const requiredMetadataFields = [
  'status',
  'owner',
  'source_of_truth',
  'last_reviewed',
  'review_after',
  'provenance',
];

const optionalMetadataFields = [
  'supersedes',
  'superseded_by',
];

const statusValues = new Set(['active', 'draft', 'deprecated', 'superseded']);
const bodyMetadataFields = new Set([...requiredMetadataFields, ...optionalMetadataFields]);

export function runDoctor(options = {}) {
  const root = resolve(options.repo ?? process.cwd());
  const asOf = parseDateOnly(options.date ?? today());
  if (!asOf) throw new Error(`Invalid audit date: ${options.date}`);
  const files = listRepositoryFiles(root);
  const targetSets = buildRepositoryTargetSets(files);
  const markdownFiles = files.filter((file) => extname(file).toLowerCase() === '.md');
  const alwaysOnFiles = listAlwaysOnAuditFiles(files);
  const linkFiles = [...new Set([...markdownFiles, ...alwaysOnFiles])].sort();
  const warnings = [];
  const observations = [];

  checkRequiredRoutes({ root, files, warnings, observations });
  checkMarkdownLinks({ root, markdownFiles: linkFiles, targetSets, warnings });
  checkDurableMetadata({ root, markdownFiles, warnings, asOf });
  checkAlwaysOnLeakage({ root, files: alwaysOnFiles, warnings });
  checkDuplicateAlwaysOnGuidance({ root, files: alwaysOnFiles, warnings });

  return {
    mode: 'warning',
    repo: root,
    asOf: formatDate(asOf),
    summary: {
      warningCount: warnings.length,
      checkedMarkdownFiles: markdownFiles.length,
      checkedAlwaysOnFiles: alwaysOnFiles.length,
    },
    warnings: sortFindings(warnings),
    observations: observations.sort((left, right) => left.code.localeCompare(right.code)),
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    repo: process.cwd(),
    json: false,
    date: today(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--repo') {
      index += 1;
      if (!argv[index]) throw new Error('--repo requires a path');
      options.repo = argv[index];
    } else if (arg === '--date') {
      index += 1;
      if (!argv[index]) throw new Error('--date requires YYYY-MM-DD');
      options.date = argv[index];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function main() {
  let options;
  try {
    options = parseArgs();
  } catch (error) {
    console.error(error.message);
    console.error(helpText());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(helpText());
    return;
  }

  const report = runDoctor(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(renderTextReport(report));
}

function helpText() {
  return [
    'Usage: node scripts/harness-doctor.mjs [--repo <path>] [--date YYYY-MM-DD] [--json]',
    '',
    'Warning-mode audit for load-bearing harness memory surfaces.',
    'Reports freshness, metadata, route, link, duplicate-guidance, and always-on leakage warnings.',
    'The command exits 0 when warnings are present; reserve failure promotion for a later low-noise audit cycle.',
  ].join('\n');
}

export function renderTextReport(report) {
  const lines = [
    'Harness doctor audit',
    '====================',
    `Mode: ${report.mode}`,
    `Repo: ${report.repo}`,
    `As of: ${report.asOf}`,
    '',
    'Summary:',
    `- Warnings: ${report.summary.warningCount}`,
    `- Markdown files checked: ${report.summary.checkedMarkdownFiles}`,
    `- Always-on files checked: ${report.summary.checkedAlwaysOnFiles}`,
  ];

  if (report.observations.length) {
    lines.push('', 'Observations:');
    for (const observation of report.observations) {
      lines.push(`- [${observation.code}] ${observation.message}`);
    }
  }

  if (!report.warnings.length) {
    lines.push('', 'OK: no actionable warnings.');
    return lines.join('\n');
  }

  lines.push('', 'Warnings:');
  for (const warning of report.warnings) {
    const location = warning.line ? `${warning.path}:${warning.line}` : warning.path;
    lines.push(`- [${warning.code}] ${location} - ${warning.message}`);
    if (warning.action) lines.push(`  Action: ${warning.action}`);
  }

  return lines.join('\n');
}

function checkRequiredRoutes({ root, files, warnings, observations }) {
  const routeDirs = [
    {
      dir: 'docs/data-contracts',
      index: 'docs/data-contracts/INDEX.md',
      code: 'missing-data-contract-index',
      message: 'data contracts exist without docs/data-contracts/INDEX.md.',
      action: 'Add the index route or remove untriggered contract files.',
    },
    {
      dir: 'docs/repo-contracts',
      index: 'docs/repo-contracts/INDEX.md',
      code: 'missing-repo-contract-index',
      message: 'repo contracts exist without docs/repo-contracts/INDEX.md.',
      action: 'Add the index route or remove untriggered contract files.',
    },
    {
      dir: 'docs/adr',
      index: 'docs/adr/INDEX.md',
      code: 'missing-adr-index',
      message: 'split ADR files exist without docs/adr/INDEX.md.',
      action: 'Add the index route before relying on split decision memory.',
    },
    {
      dir: 'docs/adrs',
      index: 'docs/adrs/INDEX.md',
      code: 'missing-adrs-index',
      message: 'split ADR files exist without docs/adrs/INDEX.md.',
      action: 'Add the index route before relying on split decision memory.',
    },
  ];

  for (const route of routeDirs) {
    const dirFiles = files.filter((file) => file.startsWith(`${route.dir}/`) && file.endsWith('.md'));
    const nonIndexFiles = dirFiles.filter((file) => file !== route.index);
    if (!nonIndexFiles.length) continue;
    observations.push({
      code: `${route.dir}-count`,
      message: `${route.dir} has ${nonIndexFiles.length} routed artifact(s).`,
    });
    if (!files.includes(route.index)) {
      warnings.push({
        code: route.code,
        path: route.dir,
        message: route.message,
        action: route.action,
      });
      continue;
    }

    const indexText = readText(root, route.index);
    const indexedTargets = new Set(
      extractMarkdownLinks(indexText)
        .map((link) => resolveInternalLinkTarget({ root, fromFile: route.index, href: link.href }))
        .filter(Boolean),
    );
    for (const artifact of nonIndexFiles) {
      if (!indexedTargets.has(artifact)) {
        warnings.push({
          code: 'unindexed-artifact',
          path: artifact,
          message: `load-bearing artifact is not mentioned from ${route.index}.`,
          action: 'Add a compact route in the index or move the file out of the routed artifact directory.',
        });
      }
    }
  }
}

function checkMarkdownLinks({ root, markdownFiles, targetSets, warnings }) {
  for (const file of markdownFiles) {
    const text = readText(root, file);
    const links = extractMarkdownLinks(text);
    for (const link of links) {
      if (link.missingReference) {
        warnings.push({
          code: 'broken-link',
          path: file,
          line: link.line,
          message: `reference-style link has no definition: [${link.label}]`,
          action: 'Add a matching reference definition or convert the route to an inline link.',
        });
        continue;
      }
      const resolved = resolveInternalLinkTarget({ root, fromFile: file, href: link.href });
      if (!resolved) continue;
      if (!targetSets.files.has(resolved) && !targetSets.directories.has(resolved)) {
        warnings.push({
          code: 'broken-link',
          path: file,
          line: link.line,
          message: `internal link target does not exist: ${link.href}`,
          action: `Fix the link or add the routed file: ${resolved}`,
        });
      }
    }
  }
}

function buildRepositoryTargetSets(files) {
  const directories = new Set();
  for (const file of files) {
    const parts = file.split('/');
    parts.pop();
    for (let index = 1; index <= parts.length; index += 1) {
      directories.add(parts.slice(0, index).join('/'));
    }
  }
  return {
    files: new Set(files),
    directories,
  };
}

function checkDurableMetadata({ root, markdownFiles, warnings, asOf }) {
  for (const file of markdownFiles) {
    const text = readText(root, file);
    const metadata = parseFrontmatter(text) ?? parseBodyMetadata(text);
    const metadataRequired = requiresDurableMetadata(file);

    if (metadataRequired && !metadata) {
      warnings.push({
        code: 'missing-metadata',
        path: file,
        message: 'load-bearing durable artifact is missing lifecycle metadata.',
        action: `Add frontmatter fields: ${[...requiredMetadataFields, ...optionalMetadataFields].join(', ')}.`,
      });
      continue;
    }

    if (!metadata) continue;

    const normalized = normalizeMetadata(metadata.fields);
    if (!metadataRequired) continue;

    for (const field of requiredMetadataFields) {
      if (!hasValue(normalized[field])) {
        warnings.push({
          code: 'missing-metadata-field',
          path: file,
          line: metadata.lineByField[field] ?? 1,
          message: `load-bearing durable artifact is missing "${field}" metadata.`,
          action: 'Add the field or move the artifact out of a load-bearing contract/decision directory.',
        });
      }
    }

    if (hasValue(normalized.status) && !statusValues.has(String(normalized.status).toLowerCase())) {
      warnings.push({
        code: 'unknown-status',
        path: file,
        line: metadata.lineByField.status ?? 1,
        message: `metadata status "${normalized.status}" is not one of: ${[...statusValues].join(', ')}.`,
        action: 'Use a known lifecycle status or update the local doctor policy deliberately.',
      });
    }

    if (hasValue(normalized.last_reviewed) && !parseDateOnly(normalized.last_reviewed)) {
      warnings.push({
        code: 'invalid-last-reviewed',
        path: file,
        line: metadata.lineByField.last_reviewed ?? 1,
        message: `last_reviewed is not YYYY-MM-DD: ${normalized.last_reviewed}`,
        action: 'Use a date-only value so freshness metadata can be audited deterministically.',
      });
    }

    if (hasValue(normalized.review_after)) {
      const reviewAfter = parseDateOnly(normalized.review_after);
      if (!reviewAfter && metadata.kind === 'body') {
        continue;
      }
      if (!reviewAfter) {
        warnings.push({
          code: 'invalid-review-after',
          path: file,
          line: metadata.lineByField.review_after ?? 1,
          message: `review_after is not YYYY-MM-DD: ${normalized.review_after}`,
          action: 'Use a date-only value so stale durable memory can be audited deterministically.',
        });
      } else if (reviewAfter < asOf) {
        warnings.push({
          code: 'stale-metadata',
          path: file,
          line: metadata.lineByField.review_after ?? 1,
          message: `review_after ${formatDate(reviewAfter)} is before audit date ${formatDate(asOf)}.`,
          action: 'Re-review the source of truth, update the date, or retire/supersede the artifact.',
        });
      }
    }

    if (String(normalized.status).toLowerCase() === 'superseded' && !hasValue(normalized.superseded_by)) {
      warnings.push({
        code: 'missing-superseded-by',
        path: file,
        line: metadata.lineByField.status ?? 1,
        message: 'superseded artifact does not name superseded_by.',
        action: 'Point to the replacement artifact or explain why none exists.',
      });
    }
  }
}

function checkAlwaysOnLeakage({ root, files, warnings }) {
  const lineLeakagePatterns = [
    /^##\s+(Data Contract|Repo Contract|Evidence Pack|Agent Runtime Safety)\b/i,
    /^###\s+Compact Example\b/i,
    /\bTrigger conditions:\s*/i,
  ];
  const windowLeakagePattern = /\bSource of truth:\s*[\s\S]{0,160}\bLast reviewed:\s*/i;

  for (const file of files) {
    const text = readText(root, file);
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const window = lines.slice(index, index + 6).join('\n');
      const leaks = lineLeakagePatterns.some((pattern) => pattern.test(line))
        || (/\bSource of truth:\s*/i.test(line) && windowLeakagePattern.test(window));
      if (!leaks) continue;
      warnings.push({
        code: 'always-on-leakage',
        path: file,
        line: index + 1,
        message: 'always-on instructions appear to include optional-module detail instead of a route.',
        action: 'Move details into routed docs or a skill; keep always-on files as short entry points.',
      });
      break;
    }
  }
}

function checkDuplicateAlwaysOnGuidance({ root, files, warnings }) {
  const occurrences = new Map();
  for (const file of files) {
    const text = readText(root, file);
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim().replace(/\s+/g, ' ');
      if (line.length < 80) continue;
      if (/^```/.test(line)) continue;
      if (!occurrences.has(line)) occurrences.set(line, []);
      occurrences.get(line).push({ file, line: index + 1 });
    }
  }

  for (const [line, hits] of occurrences.entries()) {
    const uniqueFiles = new Set(hits.map((hit) => hit.file));
    if (uniqueFiles.size < 2) continue;
    const first = hits[0];
    warnings.push({
      code: 'duplicate-guidance',
      path: first.file,
      line: first.line,
      message: `long guidance line is duplicated across always-on files: "${line.slice(0, 96)}${line.length > 96 ? '...' : ''}"`,
      action: 'Keep the full guidance in AGENTS.md or routed docs and make adapters point back to it.',
    });
  }
}

function listAlwaysOnAuditFiles(files) {
  return files.filter(isAlwaysOnAuditFile).sort();
}

function isAlwaysOnAuditFile(file) {
  if (file.startsWith('test/fixtures/') || file.includes('/test/fixtures/')) return false;
  const parts = file.split('/');
  const name = parts.at(-1);
  if (alwaysOnFileNames.has(name)) return true;
  if (file === '.github/copilot-instructions.md' || file.endsWith('/.github/copilot-instructions.md')) return true;
  if (file.startsWith('.cursor/rules/') || file.includes('/.cursor/rules/')) return true;
  if (file.startsWith('.windsurf/rules/') || file.includes('/.windsurf/rules/')) return true;
  return false;
}

function listRepositoryFiles(root) {
  const gitFiles = listGitFiles(root);
  if (gitFiles) return gitFiles;
  return walkFiles(root).map((file) => slash(relative(root, file))).sort();
}

function listGitFiles(root) {
  try {
    const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const untracked = execFileSync('git', ['-C', root, 'ls-files', '-z', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = [
      ...tracked.split('\0').filter(Boolean).map(slash).filter((file) => existsSync(resolve(root, file))),
      ...untracked.split('\0').filter(Boolean).map(slash).filter(shouldAuditUntrackedFile),
    ].sort();
    return files.length ? files : null;
  } catch {
    return null;
  }
}

function shouldAuditUntrackedFile(file) {
  const normalized = slash(file);
  return normalized.startsWith('docs/')
    || normalized.startsWith('templates/')
    || normalized.startsWith('.agents/')
    || isAlwaysOnAuditFile(normalized)
    || ['README.md', 'CHANGELOG.md', 'REFERENCES.md'].includes(normalized);
}

function walkFiles(root, prefix = '') {
  const dir = prefix ? join(root, prefix) : root;
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirectories.has(entry.name)) return [];
    const child = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(root, join(prefix, entry.name));
    if (entry.isFile()) return [child];
    return [];
  });
}

function requiresDurableMetadata(file) {
  const normalized = slash(file);
  if (normalized.endsWith('/INDEX.md')) return false;
  if (/^docs\/data-contracts\/.+\.md$/i.test(normalized)) return true;
  if (/^docs\/repo-contracts\/.+\.md$/i.test(normalized)) return true;
  if (/^docs\/adr\/.+\.md$/i.test(normalized)) return true;
  if (/^docs\/adrs\/.+\.md$/i.test(normalized)) return true;
  return false;
}

function extractMarkdownLinks(text) {
  const links = [];
  const referenceDefinitions = new Map();
  const linkLines = [];
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  let inFence = false;
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      offset += line.length + 1;
      continue;
    }
    if (!inFence) {
      const linkLine = maskInlineCodeSpans(line);
      const definition = parseReferenceDefinition(linkLine, offset, lineIndex + 1);
      if (definition) referenceDefinitions.set(normalizeReferenceLabel(definition.label), definition);
      linkLines.push({ line: linkLine, offset, lineNumber: lineIndex + 1, isReferenceDefinition: Boolean(definition) });
    }
    offset += line.length + 1;
  }

  for (const item of linkLines) {
    if (item.isReferenceDefinition) continue;
    links.push(...extractInlineLinks(item.line, item.offset, item.lineNumber));
    links.push(...extractReferenceUsageLinks(item.line, item.offset, item.lineNumber, referenceDefinitions));
  }
  return links;
}

function maskInlineCodeSpans(line) {
  let masked = '';
  let codeFence = '';
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '`') {
      let end = index + 1;
      while (end < line.length && line[end] === '`') end += 1;
      const run = line.slice(index, end);
      if (!codeFence) {
        codeFence = run;
      } else if (run === codeFence) {
        codeFence = '';
      }
      masked += ' '.repeat(run.length);
      index = end - 1;
      continue;
    }
    masked += codeFence ? ' ' : line[index];
  }
  return masked;
}

function parseReferenceDefinition(line, lineOffset, lineNumber) {
  const match = /^\s{0,3}\[([^\]\n]+)]:\s*(.*)$/.exec(line);
  if (!match) return null;
  if (match[1].startsWith('^')) return null;
  const destination = parseLinkDestination(match[2]);
  if (!destination) return null;
  const column = line.indexOf(destination.href, line.indexOf(']:') + 2);
  return {
    label: match[1],
    href: destination.href,
    index: lineOffset + Math.max(column, 0),
    line: lineNumber,
  };
}

function extractReferenceUsageLinks(line, lineOffset, lineNumber, referenceDefinitions) {
  const links = [];
  const pattern = /(!?)\[([^\]\n]+)\]\[([^\]\n]*)\]/g;
  let match;
  while ((match = pattern.exec(line))) {
    if (match[1]) continue;
    const label = normalizeReferenceLabel(match[3] || match[2]);
    const definition = referenceDefinitions.get(label);
    if (!definition) {
      links.push({
        href: '',
        missingReference: true,
        label: match[3] || match[2],
        index: lineOffset + match.index,
        line: lineNumber,
      });
      continue;
    }
    links.push({ href: definition.href, index: lineOffset + match.index, line: lineNumber });
  }
  return links;
}

function normalizeReferenceLabel(label) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function extractInlineLinks(line, lineOffset, lineNumber) {
  const links = [];
  let searchIndex = 0;

  while (searchIndex < line.length) {
    const marker = line.indexOf('](', searchIndex);
    if (marker < 0) break;
    const parsed = parseInlineLinkDestination(line, marker + 2);
    if (!parsed) {
      searchIndex = marker + 2;
      continue;
    }
    links.push({ href: parsed.href.trim(), index: lineOffset + marker + 2, line: lineNumber });
    searchIndex = parsed.end + 1;
  }

  return links;
}

function parseLinkDestination(rest) {
  const text = rest.trimStart();
  if (!text) return null;
  if (text.startsWith('<')) {
    const end = text.indexOf('>');
    if (end < 0) return null;
    return { href: text.slice(0, end + 1) };
  }
  const match = /^\S+/.exec(text);
  return match ? { href: match[0] } : null;
}

function parseInlineLinkDestination(line, start) {
  if (line[start] === '<') {
    const closeAngle = line.indexOf('>', start + 1);
    if (closeAngle < 0) return null;
    const closeParen = line.indexOf(')', closeAngle + 1);
    if (closeParen < 0) return null;
    return { href: line.slice(start, closeAngle + 1), end: closeParen };
  }

  let depth = 0;
  let href = '';
  for (let index = start; index < line.length; index += 1) {
    const char = line[index];
    if (char === '\\' && index + 1 < line.length) {
      href += char + line[index + 1];
      index += 1;
      continue;
    }
    if (char === '(') {
      depth += 1;
      href += char;
      continue;
    }
    if (char === ')') {
      if (depth === 0) return { href, end: index };
      depth -= 1;
      href += char;
      continue;
    }
    href += char;
  }

  return null;
}

function resolveInternalLinkTarget({ root, fromFile, href }) {
  const target = normalizeInternalLinkTarget(href);
  if (!target) return null;
  const absolute = target.rootRelative
    ? resolve(root, target.path.replace(/^\/+/, ''))
    : resolve(root, dirname(fromFile), target.path);
  const resolved = slash(relative(root, absolute));
  if (!resolved || resolved === '..' || resolved.startsWith('../')) return null;
  return resolved;
}

function normalizeInternalLinkTarget(rawHref) {
  let href = rawHref.trim();
  if (!href || href.startsWith('#')) return null;
  if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1);
  if (href.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  href = href.split(/\s+(?=["'])/)[0];
  const withoutAnchor = href.split('#')[0].split('?')[0];
  if (!withoutAnchor) return null;
  try {
    return { path: decodeURIComponent(withoutAnchor), rootRelative: withoutAnchor.startsWith('/') };
  } catch {
    return { path: withoutAnchor, rootRelative: withoutAnchor.startsWith('/') };
  }
}

function parseFrontmatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.findIndex((line, index) => index > 0 && line === '---');
  if (end < 0) return null;
  const fields = {};
  const lineByField = {};
  for (let index = 1; index < end; index += 1) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    const key = normalizeFieldName(match[1]);
    fields[key] = unquote(match[2].trim());
    lineByField[key] = index + 1;
  }
  return { fields, lineByField, kind: 'frontmatter' };
}

function parseBodyMetadata(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const fields = {};
  const lineByField = {};
  let validationLine = null;
  let inFence = false;
  let inHeaderMetadata = true;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^\s*(```|~~~)/.test(lines[index])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^##\s+Validation\b/i.test(line)) validationLine = index + 1;
    if (/^##\s+/.test(line)) inHeaderMetadata = false;
    if (!inHeaderMetadata) continue;
    const match = /^([A-Za-z][A-Za-z -]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = normalizeFieldName(match[1]);
    if (!bodyMetadataFields.has(key)) continue;
    fields[key] = unquote(match[2].trim());
    lineByField[key] = index + 1;
  }

  if (!Object.keys(fields).length) return null;
  if (!hasValue(fields.provenance) && validationLine) {
    fields.provenance = 'validation section';
    lineByField.provenance = validationLine;
  }
  return { fields, lineByField, kind: 'body' };
}

function normalizeMetadata(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [normalizeFieldName(key), value]),
  );
}

function normalizeFieldName(name) {
  return name.replace(/[\s-]+/g, '_').toLowerCase();
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim().toLowerCase() !== 'none';
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseDateOnly(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function readText(root, file) {
  return readFileSync(resolve(root, file), 'utf8');
}

function sortFindings(findings) {
  return [...findings].sort((left, right) => (
    left.path.localeCompare(right.path)
    || (left.line ?? 0) - (right.line ?? 0)
    || left.code.localeCompare(right.code)
  ));
}

function slash(path) {
  return path.split(sep).join('/');
}

if (process.argv[1] && resolve(process.argv[1]) === currentScript) {
  main();
}
