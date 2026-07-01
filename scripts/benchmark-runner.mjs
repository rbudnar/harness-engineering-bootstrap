#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const taskManifestSchemaVersion = 'heb-benchmark-tasks.v1';
export const resultSchemaVersion = 'heb-benchmark-result.v1';

export const allowedCategories = new Set([
  'bug-fix',
  'feature-addition',
  'refactor',
  'docs-only',
  'ci-or-release',
  'domain-gotcha',
  'long-running-handoff',
  'review-only',
]);

export const allowedGuidanceNormalization = new Set([
  'none',
  'removed',
  'masked',
  'excluded',
  'explicit-comparator',
]);

const scriptPath = fileURLToPath(import.meta.url);
export const repoRoot = resolve(dirname(scriptPath), '..');

export function parseArgs(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = {
    command,
    manifest: null,
    task: null,
    variant: null,
    workspace: null,
    result: null,
    out: null,
    path: null,
    artifactsDir: null,
    force: false,
    help: command === '--help' || command === '-h' || !command,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--manifest') {
      options.manifest = requiredValue(rest, index, arg);
      index += 1;
    } else if (arg === '--task') {
      options.task = requiredValue(rest, index, arg);
      index += 1;
    } else if (arg === '--variant') {
      options.variant = requiredValue(rest, index, arg);
      index += 1;
    } else if (arg === '--workspace') {
      options.workspace = requiredValue(rest, index, arg);
      index += 1;
    } else if (arg === '--result') {
      options.result = requiredValue(rest, index, arg);
      index += 1;
    } else if (arg === '--out') {
      options.out = requiredValue(rest, index, arg);
      index += 1;
    } else if (arg === '--path') {
      options.path = requiredValue(rest, index, arg);
      index += 1;
    } else if (arg === '--artifacts-dir') {
      options.artifactsDir = requiredValue(rest, index, arg);
      index += 1;
    } else if (arg === '--force') {
      options.force = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

export function helpText() {
  return [
    'Usage:',
    '  node scripts/benchmark-runner.mjs validate --manifest <tasks.json>',
    '  node scripts/benchmark-runner.mjs prepare --manifest <tasks.json> --task <id> --variant <id> --workspace <dir> [--force]',
    '  node scripts/benchmark-runner.mjs record --manifest <tasks.json> --result <result.json> --out <results.jsonl> [--artifacts-dir <dir>]',
    '  node scripts/benchmark-runner.mjs validate-results --manifest <tasks.json> --out <results.jsonl> [--artifacts-dir <dir>]',
    '  node scripts/benchmark-runner.mjs hash-fixture --path <dir>',
    '',
    'The runner is intentionally adapter-light: it prepares pinned task workspaces and records manual or',
    'agent-adapter result rows without depending on one model vendor or hosted eval platform.',
  ].join('\n');
}

export function readManifest(manifestPath) {
  const absolutePath = resolve(manifestPath);
  const manifest = readJsonFile(absolutePath);
  validateManifest(manifest, dirname(absolutePath));
  return { manifest, manifestPath: absolutePath, manifestDir: dirname(absolutePath) };
}

export function validateManifest(manifest, manifestDir = process.cwd()) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Task manifest must be a JSON object.');
  }

  requireString(manifest, 'schema_version', errors);
  if (manifest.schema_version !== taskManifestSchemaVersion) {
    errors.push(`schema_version must be ${taskManifestSchemaVersion}.`);
  }
  requireString(manifest, 'suite_id', errors);
  optionalString(manifest, 'harness_version', errors);

  const variants = requireArray(manifest, 'variants', errors);
  const variantIds = new Set();
  variants.forEach((variant, index) => {
    validateObject(variant, `variants[${index}]`, errors);
    requireString(variant, 'id', errors, `variants[${index}].`);
    optionalString(variant, 'correction_policy', errors, `variants[${index}].`);
    if (variant.id) {
      if (variantIds.has(variant.id)) errors.push(`Duplicate variant id: ${variant.id}.`);
      variantIds.add(variant.id);
    }
    optionalStringArray(variant, 'overlay_paths', errors, `variants[${index}].`);
  });

  const tasks = requireArray(manifest, 'tasks', errors);
  const taskIds = new Set();
  tasks.forEach((task, index) => {
    validateTask(task, index, variantIds, taskIds, manifestDir, errors);
  });

  if (errors.length) throw new Error(`Invalid benchmark task manifest:\n- ${errors.join('\n- ')}`);
  return true;
}

function validateTask(task, index, variantIds, taskIds, manifestDir, errors) {
  const prefix = `tasks[${index}].`;
  validateObject(task, `tasks[${index}]`, errors);
  requireString(task, 'id', errors, prefix);
  if (task.id) {
    if (taskIds.has(task.id)) errors.push(`Duplicate task id: ${task.id}.`);
    taskIds.add(task.id);
  }

  requireString(task, 'category', errors, prefix);
  if (task.category && !allowedCategories.has(task.category)) {
    errors.push(`${prefix}category must be one of: ${[...allowedCategories].join(', ')}.`);
  }

  requireString(task, 'prompt', errors, prefix);
  optionalString(task, 'episode', errors, prefix);
  optionalString(task, 'episode_stage', errors, prefix);
  optionalString(task, 'seeded_failure_family', errors, prefix);
  optionalStringArray(task, 'graders', errors, prefix);
  optionalStringArray(task, 'expected_routes', errors, prefix);
  optionalStringArray(task, 'excluded_requirements', errors, prefix);
  optionalStringArray(task, 'preexisting_guidance_files', errors, prefix);

  if (!task.guidance_normalization) errors.push(`${prefix}guidance_normalization is required.`);
  if (task.guidance_normalization && !allowedGuidanceNormalization.has(task.guidance_normalization)) {
    errors.push(
      `${prefix}guidance_normalization must be one of: ${[...allowedGuidanceNormalization].join(', ')}.`,
    );
  }

  const source = task.source;
  validateObject(source, `${prefix}source`, errors);
  if (source) {
    requireString(source, 'type', errors, `${prefix}source.`);
    requireString(source, 'revision', errors, `${prefix}source.`);
    if (source.type === 'fixture') {
      requireString(source, 'path', errors, `${prefix}source.`);
      if (source.path && !existsSync(resolve(manifestDir, source.path))) {
        errors.push(`${prefix}source.path does not exist: ${source.path}.`);
      }
      if (source.revision && !source.revision.startsWith('sha256:')) {
        errors.push(`${prefix}source.revision must be a sha256:<digest> fixture checksum.`);
      }
    } else if (source.type === 'git') {
      requireString(source, 'repo', errors, `${prefix}source.`);
    } else {
      errors.push(`${prefix}source.type must be fixture or git.`);
    }
  }

  const taskVariantIds = requireArray(task, 'variant_ids', errors, prefix);
  for (const variantId of taskVariantIds) {
    if (typeof variantId !== 'string') {
      errors.push(`${prefix}variant_ids entries must be strings.`);
    } else if (!variantIds.has(variantId)) {
      errors.push(`${prefix}variant_ids references unknown variant: ${variantId}.`);
    }
  }
}

export function prepareWorkspace({ manifestPath, taskId, variantId, workspace, force = false, runner = spawnSync }) {
  const { manifest, manifestDir } = readManifest(manifestPath);
  const task = findTask(manifest, taskId);
  const variant = findVariant(manifest, variantId);
  if (!task.variant_ids.includes(variantId)) {
    throw new Error(`Task ${taskId} does not allow variant ${variantId}.`);
  }

  const target = resolve(workspace);
  assertSafeWorkspace(target);
  if (existsSync(target)) {
    const entries = readdirSync(target);
    if (entries.length && !force) throw new Error(`Workspace is not empty: ${target}. Use --force to replace it.`);
    if (entries.length) {
      const marker = join(target, '.heb-benchmark', 'task.json');
      if (!existsSync(marker)) {
        throw new Error(`Refusing to replace non-empty workspace without benchmark marker: ${target}.`);
      }
      rmSync(target, { recursive: true, force: true });
    }
  }
  mkdirSync(target, { recursive: true });

  const warnings = [];
  if (task.source.type === 'fixture') {
    const sourceRoot = resolve(manifestDir, task.source.path);
    const actualChecksum = hashDirectory(sourceRoot);
    if (actualChecksum !== task.source.revision) {
      throw new Error(`Fixture checksum mismatch for ${task.id}: expected ${task.source.revision}, got ${actualChecksum}.`);
    }
    copyContents(sourceRoot, target);
  } else {
    prepareGitSource(task.source, target, runner);
  }

  if (task.guidance_normalization === 'removed') {
    for (const guidanceFile of task.preexisting_guidance_files ?? []) {
      removeInside(target, guidanceFile);
    }
  } else if (task.guidance_normalization === 'masked') {
    warnings.push('guidance_normalization=masked is recorded but not modified by the runner.');
  }

  const appliedOverlays = [];
  for (const overlayPath of variant.overlay_paths ?? []) {
    const overlayRoot = resolve(manifestDir, overlayPath);
    if (!existsSync(overlayRoot)) throw new Error(`Variant overlay path does not exist: ${overlayPath}.`);
    copyContents(overlayRoot, target);
    appliedOverlays.push(overlayPath);
  }

  const metadataDir = join(target, '.heb-benchmark');
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(
    join(metadataDir, 'task.json'),
    `${JSON.stringify({
      schema_version: taskManifestSchemaVersion,
      suite_id: manifest.suite_id,
      task_id: task.id,
      variant: variant.id,
      source_revision: task.source.revision,
      applied_overlays: appliedOverlays,
      warnings,
    }, null, 2)}\n`,
  );

  return {
    workspace: target,
    suite_id: manifest.suite_id,
    task_id: task.id,
    variant: variant.id,
    source_revision: task.source.revision,
    applied_overlays: appliedOverlays,
    warnings,
  };
}

function prepareGitSource(source, target, runner) {
  const clone = runner('git', ['clone', '--no-checkout', source.repo, target], { encoding: 'utf8', shell: false });
  if (clone.status !== 0) throw new Error(`git clone failed: ${clone.stderr || clone.stdout || clone.error?.message}`);
  const checkout = runner('git', ['checkout', source.revision], { cwd: target, encoding: 'utf8', shell: false });
  if (checkout.status !== 0) {
    throw new Error(`git checkout ${source.revision} failed: ${checkout.stderr || checkout.stdout || checkout.error?.message}`);
  }
}

export function normalizeResultRow(rawResult, manifest, { artifactsDir = null } = {}) {
  if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)) {
    throw new Error('Result input must be a JSON object.');
  }

  const task = findTask(manifest, rawResult.task_id);
  const variant = findVariant(manifest, rawResult.variant);
  if (!task.variant_ids.includes(variant.id)) {
    throw new Error(`Task ${task.id} does not allow variant ${variant.id}.`);
  }

  const warnings = new Set(Array.isArray(rawResult.warnings) ? rawResult.warnings.map(String) : []);
  const artifactPaths = normalizeArtifactPaths(rawResult.artifact_paths, artifactsDir, warnings);
  const startedAt = nullableIso(rawResult.started_at, 'started_at');
  const finishedAt = nullableIso(rawResult.finished_at, 'finished_at');
  const wallTimeSeconds = nullableNonNegativeNumber(rawResult.wall_time_seconds, 'wall_time_seconds')
    ?? computeWallTimeSeconds(startedAt, finishedAt);

  const runConfig = normalizeRunConfig(rawResult.run_config);
  const tokenEstimate = normalizeTokenEstimate(rawResult.token_estimate);
  const costEstimate = normalizeCostEstimate(rawResult.cost_estimate);
  if (runConfig === null) warnings.add('run_config unavailable');
  if (tokenEstimate === null) warnings.add('token_estimate unavailable');
  if (costEstimate === null) warnings.add('cost_estimate unavailable');
  if (!artifactPaths.transcript && !artifactPaths.trace) warnings.add('transcript_or_trace artifact unavailable');

  const row = {
    schema_version: resultSchemaVersion,
    run_id: requiredStringValue(rawResult.run_id, 'run_id'),
    task_id: task.id,
    trial: requiredPositiveInteger(rawResult.trial, 'trial'),
    repo: task.source.repo ?? task.source.path,
    source_revision: task.source.revision,
    variant: variant.id,
    harness_version: stringOrNull(rawResult.harness_version) ?? manifest.harness_version ?? null,
    agent_surface: requiredStringValue(rawResult.agent_surface, 'agent_surface'),
    model: stringOrNull(rawResult.model),
    tool_version: stringOrNull(rawResult.tool_version),
    run_config: runConfig,
    started_at: startedAt,
    finished_at: finishedAt,
    success: nullableBoolean(rawResult.success, 'success'),
    first_pass_green: nullableBoolean(rawResult.first_pass_green, 'first_pass_green'),
    tests_passed: nullableBoolean(rawResult.tests_passed, 'tests_passed'),
    validator_passed: nullableBoolean(rawResult.validator_passed, 'validator_passed'),
    route_hits: stringArray(rawResult.route_hits, 'route_hits'),
    stale_hits: stringArray(rawResult.stale_hits, 'stale_hits'),
    unnecessary_reads: stringArray(rawResult.unnecessary_reads, 'unnecessary_reads'),
    docs_cited: stringArray(rawResult.docs_cited, 'docs_cited'),
    commands_run: commandArray(rawResult.commands_run),
    files_read: stringArray(rawResult.files_read, 'files_read'),
    files_modified: stringArray(rawResult.files_modified, 'files_modified'),
    human_touches: nullableNonNegativeInteger(rawResult.human_touches, 'human_touches'),
    retry_loops: nullableNonNegativeInteger(rawResult.retry_loops, 'retry_loops'),
    token_estimate: tokenEstimate,
    cost_estimate: costEstimate,
    wall_time_seconds: wallTimeSeconds,
    artifact_paths: artifactPaths,
    notes: stringOrNull(rawResult.notes),
    warnings: [...warnings].sort(),
  };

  validateResultRow(row, manifest, { artifactsDir });
  return row;
}

export function validateResultRow(row, manifest, { artifactsDir = null } = {}) {
  const errors = [];
  if (row.schema_version !== resultSchemaVersion) errors.push(`schema_version must be ${resultSchemaVersion}.`);
  if (!manifest.tasks.some((task) => task.id === row.task_id)) errors.push(`Unknown task_id: ${row.task_id}.`);
  const task = manifest.tasks.find((entry) => entry.id === row.task_id);
  if (!manifest.variants.some((variant) => variant.id === row.variant)) errors.push(`Unknown variant: ${row.variant}.`);
  if (task && !task.variant_ids.includes(row.variant)) {
    errors.push(`Task ${row.task_id} does not allow variant ${row.variant}.`);
  }
  for (const field of ['run_id', 'task_id', 'variant', 'agent_surface']) {
    if (!row[field] || typeof row[field] !== 'string') errors.push(`${field} is required.`);
  }
  for (const field of ['repo', 'source_revision']) {
    if (!row[field] || typeof row[field] !== 'string') errors.push(`${field} is required.`);
  }
  if (task) {
    const expectedRepo = task.source.repo ?? task.source.path;
    if (row.repo !== expectedRepo) errors.push(`repo must match task source: ${expectedRepo}.`);
    if (row.source_revision !== task.source.revision) {
      errors.push('source_revision must match task source revision.');
    }
  }
  for (const field of ['model', 'tool_version', 'harness_version', 'notes']) {
    if (row[field] !== null && row[field] !== undefined && typeof row[field] !== 'string') {
      errors.push(`${field} must be a string or null when present.`);
    }
  }
  if (!Number.isInteger(row.trial) || row.trial < 1) errors.push('trial must be a positive integer.');
  try {
    nullableIso(row.started_at, 'started_at');
  } catch (error) {
    errors.push(error.message);
  }
  try {
    nullableIso(row.finished_at, 'finished_at');
  } catch (error) {
    errors.push(error.message);
  }
  try {
    nullableNonNegativeNumber(row.wall_time_seconds, 'wall_time_seconds');
  } catch (error) {
    errors.push(error.message);
  }
  try {
    nullableNonNegativeInteger(row.human_touches, 'human_touches');
  } catch (error) {
    errors.push(error.message);
  }
  try {
    nullableNonNegativeInteger(row.retry_loops, 'retry_loops');
  } catch (error) {
    errors.push(error.message);
  }
  for (const field of ['success', 'first_pass_green', 'tests_passed', 'validator_passed']) {
    if (row[field] !== null && typeof row[field] !== 'boolean') errors.push(`${field} must be boolean or null.`);
  }
  if (row.run_config !== null && (typeof row.run_config !== 'object' || Array.isArray(row.run_config))) {
    errors.push('run_config must be an object or null.');
  }
  try {
    normalizeRunConfig(row.run_config);
  } catch (error) {
    errors.push(error.message);
  }
  try {
    normalizeTokenEstimate(row.token_estimate);
  } catch (error) {
    errors.push(error.message);
  }
  try {
    normalizeCostEstimate(row.cost_estimate);
  } catch (error) {
    errors.push(error.message);
  }
  for (const field of ['route_hits', 'stale_hits', 'unnecessary_reads', 'docs_cited', 'files_read', 'files_modified']) {
    if (!Array.isArray(row[field]) || row[field].some((value) => typeof value !== 'string')) {
      errors.push(`${field} must be an array of strings.`);
    }
  }
  try {
    commandArray(row.commands_run);
  } catch (error) {
    errors.push(error.message);
  }
  if (row.warnings !== undefined && (!Array.isArray(row.warnings) || row.warnings.some((value) => typeof value !== 'string'))) {
    errors.push('warnings must be an array of strings when present.');
  }
  try {
    normalizeArtifactPaths(row.artifact_paths, artifactsDir, new Set());
  } catch (error) {
    errors.push(error.message);
  }
  if (errors.length) throw new Error(`Invalid benchmark result row:\n- ${errors.join('\n- ')}`);
  return true;
}

export function appendResult({ manifestPath, resultPath, outPath, artifactsDir = null }) {
  const { manifest } = readManifest(manifestPath);
  const row = normalizeResultRow(readJsonFile(resolve(resultPath)), manifest, { artifactsDir });
  const absoluteOut = resolve(outPath);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  appendFileSync(absoluteOut, `${JSON.stringify(row)}\n`);
  return { out: absoluteOut, row };
}

export function validateResultsFile({ manifestPath, outPath, artifactsDir = null }) {
  const { manifest } = readManifest(manifestPath);
  const text = readFileSync(resolve(outPath), 'utf8');
  const rows = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const row = JSON.parse(line);
      validateResultRow(row, manifest, { artifactsDir });
      rows.push(row);
    } catch (error) {
      errors.push(`line ${index + 1}: ${error.message}`);
    }
  });
  if (errors.length) throw new Error(`Invalid benchmark result file:\n- ${errors.join('\n- ')}`);
  return { rows: rows.length };
}

export function hashDirectory(root) {
  const absoluteRoot = resolve(root);
  const files = collectFiles(absoluteRoot);
  const hash = createHash('sha256');
  for (const file of files) {
    const rel = slash(relative(absoluteRoot, file));
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function collectFiles(root, prefix = '') {
  const absolute = resolve(root, prefix);
  return readdirSync(absolute)
    .sort((left, right) => left.localeCompare(right))
    .flatMap((entry) => {
      const relativePath = prefix ? join(prefix, entry) : entry;
      const child = resolve(root, relativePath);
      const stats = statSync(child);
      if (stats.isDirectory()) return collectFiles(root, relativePath);
      return [child];
    });
}

function copyContents(sourceRoot, targetRoot) {
  for (const entry of readdirSync(sourceRoot)) {
    cpSync(resolve(sourceRoot, entry), resolve(targetRoot, entry), { recursive: true });
  }
}

function removeInside(root, relativePath) {
  const target = resolve(root, relativePath);
  if (!isInside(root, target)) throw new Error(`Refusing to remove outside workspace: ${relativePath}.`);
  rmSync(target, { recursive: true, force: true });
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read JSON ${path}: ${error.message}`);
  }
}

function findTask(manifest, taskId) {
  const task = manifest.tasks.find((entry) => entry.id === taskId);
  if (!task) throw new Error(`Unknown task id: ${taskId}.`);
  return task;
}

function findVariant(manifest, variantId) {
  const variant = manifest.variants.find((entry) => entry.id === variantId);
  if (!variant) throw new Error(`Unknown variant id: ${variantId}.`);
  return variant;
}

function validateObject(value, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(`${label} must be an object.`);
}

function requireArray(object, field, errors, prefix = '') {
  const value = object?.[field];
  if (!Array.isArray(value)) {
    errors.push(`${prefix}${field} must be an array.`);
    return [];
  }
  return value;
}

function requireString(object, field, errors, prefix = '') {
  if (typeof object?.[field] !== 'string' || !object[field].trim()) errors.push(`${prefix}${field} is required.`);
}

function optionalString(object, field, errors, prefix = '') {
  if (object?.[field] !== undefined && object[field] !== null && typeof object[field] !== 'string') {
    errors.push(`${prefix}${field} must be a string when present.`);
  }
}

function optionalStringArray(object, field, errors, prefix = '') {
  if (object?.[field] === undefined) return;
  if (!Array.isArray(object[field]) || object[field].some((value) => typeof value !== 'string')) {
    errors.push(`${prefix}${field} must be an array of strings when present.`);
  }
}

function requiredStringValue(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  return value;
}

function requiredPositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer.`);
  return value;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return String(value);
  return value;
}

function stringArray(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return value;
}

function commandArray(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('commands_run must be an array.');
  return value.map((entry, index) => {
    if (typeof entry === 'string') return { command: entry, exit_code: null, duration_ms: null };
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`commands_run[${index}] must be a string or object.`);
    }
    return {
      command: requiredStringValue(entry.command, `commands_run[${index}].command`),
      exit_code: nullableInteger(entry.exit_code, `commands_run[${index}].exit_code`),
      duration_ms: nullableNonNegativeNumber(entry.duration_ms, `commands_run[${index}].duration_ms`),
    };
  });
}

function nullableBoolean(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean or null.`);
  return value;
}

function nullableInteger(value, field) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value)) throw new Error(`${field} must be an integer or null.`);
  return value;
}

function nullableNonNegativeInteger(value, field) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer or null.`);
  return value;
}

function nullableNumber(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(`${field} must be a number or null.`);
  return value;
}

function nullableIso(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be an ISO timestamp or null.`);
  return value;
}

function computeWallTimeSeconds(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null;
  return Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000));
}

function normalizeArtifactPaths(value, artifactsDir, warnings) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('artifact_paths must be an object.');
  const output = {};
  const root = artifactsDir ? resolve(artifactsDir) : null;
  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;
    if (typeof rawValue !== 'string') throw new Error(`artifact_paths.${key} must be a string.`);
    const resolved = root ? (isAbsolute(rawValue) ? resolve(rawValue) : resolve(root, rawValue)) : null;
    if (root && !isInside(root, resolved)) {
      throw new Error(`artifact_paths.${key} is outside artifacts_dir: ${rawValue}.`);
    }
    if (root && !existsSync(resolved)) warnings.add(`artifact_paths.${key} does not exist`);
    output[key] = rawValue;
  }
  return output;
}

function normalizeRunConfig(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('run_config must be an object or null.');
  const output = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === undefined) continue;
    if (
      rawValue === null ||
      typeof rawValue === 'string' ||
      typeof rawValue === 'number' ||
      typeof rawValue === 'boolean' ||
      (Array.isArray(rawValue) && rawValue.every((entry) => typeof entry === 'string'))
    ) {
      output[key] = rawValue;
      continue;
    }
    throw new Error(`run_config.${key} must be a scalar, null, or array of strings.`);
  }
  return output;
}

function normalizeTokenEstimate(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return { unit: 'tokens', input: null, output: null, total: nonNegativeNumber(value, 'token_estimate') };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('token_estimate must be a non-negative number, object, or null.');
  }
  const input = nullableNonNegativeNumber(value.input, 'token_estimate.input');
  const output = nullableNonNegativeNumber(value.output, 'token_estimate.output');
  let total = nullableNonNegativeNumber(value.total, 'token_estimate.total');
  if (total === null && input !== null && output !== null) total = input + output;
  if (input === null && output === null && total === null) {
    throw new Error('token_estimate must include input, output, or total when present.');
  }
  return {
    unit: typeof value.unit === 'string' && value.unit.trim() ? value.unit : 'tokens',
    input,
    output,
    total,
  };
}

function normalizeCostEstimate(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return { currency: 'USD', amount: nonNegativeNumber(value, 'cost_estimate') };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('cost_estimate must be a non-negative number, object, or null.');
  }
  const amount = nullableNonNegativeNumber(value.amount, 'cost_estimate.amount');
  if (amount === null) throw new Error('cost_estimate.amount is required when cost_estimate is present.');
  return {
    currency: typeof value.currency === 'string' && value.currency.trim() ? value.currency : 'USD',
    amount,
  };
}

function nullableNonNegativeNumber(value, field) {
  if (value === undefined || value === null) return null;
  return nonNegativeNumber(value, field);
}

function nonNegativeNumber(value, field) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return value;
}

function assertSafeWorkspace(workspace) {
  const normalized = resolve(workspace);
  const disallowed = [repoRoot, dirname(repoRoot), resolve(repoRoot, '.worktrees')];
  if (disallowed.some((path) => normalized === path)) throw new Error(`Unsafe workspace path: ${workspace}.`);
}

function isInside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function slash(path) {
  return path.replace(/\\/g, '/');
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(helpText());
    return;
  }

  if (options.command === 'validate') {
    if (!options.manifest) throw new Error('validate requires --manifest.');
    const { manifest } = readManifest(options.manifest);
    console.log(JSON.stringify({ valid: true, suite_id: manifest.suite_id, tasks: manifest.tasks.length }, null, 2));
    return;
  }

  if (options.command === 'prepare') {
    for (const flag of ['manifest', 'task', 'variant', 'workspace']) {
      if (!options[flag]) throw new Error(`prepare requires --${flag.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.`);
    }
    console.log(JSON.stringify(prepareWorkspace({
      manifestPath: options.manifest,
      taskId: options.task,
      variantId: options.variant,
      workspace: options.workspace,
      force: options.force,
    }), null, 2));
    return;
  }

  if (options.command === 'record') {
    if (!options.manifest || !options.result || !options.out) throw new Error('record requires --manifest, --result, and --out.');
    const recorded = appendResult({
      manifestPath: options.manifest,
      resultPath: options.result,
      outPath: options.out,
      artifactsDir: options.artifactsDir,
    });
    console.log(JSON.stringify({ recorded: true, out: recorded.out, row: recorded.row }, null, 2));
    return;
  }

  if (options.command === 'validate-results') {
    if (!options.manifest || !options.out) throw new Error('validate-results requires --manifest and --out.');
    console.log(JSON.stringify(validateResultsFile({
      manifestPath: options.manifest,
      outPath: options.out,
      artifactsDir: options.artifactsDir,
    }), null, 2));
    return;
  }

  if (options.command === 'hash-fixture') {
    if (!options.path) throw new Error('hash-fixture requires --path.');
    console.log(hashDirectory(options.path));
    return;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
