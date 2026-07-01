import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  hashDirectory,
  normalizeResultRow,
  prepareWorkspace,
  readManifest,
  resultSchemaVersion,
} from './benchmark-runner.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const script = resolve(testDir, 'benchmark-runner.mjs');
const fixtureRoot = resolve(testDir, '..', 'test', 'fixtures', 'benchmark-runner');
const manifestPath = resolve(fixtureRoot, 'tasks.valid.json');
const sourceRepo = resolve(fixtureRoot, 'source-repo');

test('validates the fixture manifest and pins the fixture checksum', () => {
  const output = execFileSync(process.execPath, [script, 'validate', '--manifest', manifestPath], { encoding: 'utf8' });
  const parsed = JSON.parse(output);

  assert.equal(parsed.valid, true);
  assert.equal(parsed.suite_id, 'issue-52-smoke');
  assert.equal(parsed.tasks, 1);

  const { manifest } = readManifest(manifestPath);
  assert.equal(manifest.tasks[0].source.revision, hashDirectory(sourceRepo));
});

test('gitattributes pins benchmark fixture line endings for checksum portability', () => {
  const attributes = readFileSync(resolve(testDir, '..', '.gitattributes'), 'utf8');

  assert.match(attributes, /test\/fixtures\/benchmark-runner\/\*\* text eol=lf/);
});

test('prepares a clean no-guidance workspace from the pinned fixture', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-benchmark-prepare-'));
  const workspace = resolve(root, 'workspace');

  try {
    const result = prepareWorkspace({
      manifestPath,
      taskId: 'docs-only-fixture-001',
      variantId: 'no-added-guidance',
      workspace,
    });

    assert.equal(result.task_id, 'docs-only-fixture-001');
    assert.equal(result.variant, 'no-added-guidance');
    assert.equal(existsSync(resolve(workspace, 'README.md')), true);
    assert.equal(existsSync(resolve(workspace, 'AGENTS.md')), false);
    assert.equal(existsSync(resolve(workspace, '.heb-benchmark', 'task.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('applies a variant overlay after guidance normalization', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-benchmark-overlay-'));
  const workspace = resolve(root, 'workspace');

  try {
    prepareWorkspace({
      manifestPath,
      taskId: 'docs-only-fixture-001',
      variantId: 'static-minimal-agents',
      workspace,
    });

    const agents = readFileSync(resolve(workspace, 'AGENTS.md'), 'utf8');
    assert.match(agents, /Minimal Fixture Instructions/);
    assert.doesNotMatch(agents, /Fixture Agent Notes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('force prepare refuses to delete an unmarked non-empty workspace', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-benchmark-force-'));
  const workspace = resolve(root, 'workspace');
  mkdirSync(workspace);
  writeFileSync(resolve(workspace, 'user-file.txt'), 'do not remove\n');

  try {
    assert.throws(() => prepareWorkspace({
      manifestPath,
      taskId: 'docs-only-fixture-001',
      variantId: 'no-added-guidance',
      workspace,
      force: true,
    }), /Refusing to replace non-empty workspace without benchmark marker/);
    assert.equal(readFileSync(resolve(workspace, 'user-file.txt'), 'utf8'), 'do not remove\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('records partial telemetry as JSONL with warnings instead of failing', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-benchmark-record-'));
  const resultPath = resolve(root, 'manual-result.json');
  const outPath = resolve(root, 'results.jsonl');

  writeFileSync(resultPath, `${JSON.stringify({
    run_id: '2026-07-01-smoke',
    task_id: 'docs-only-fixture-001',
    trial: 1,
    variant: 'static-minimal-agents',
    agent_surface: 'manual-adapter',
    model: null,
    tool_version: 'local',
    started_at: '2026-07-01T20:00:00.000Z',
    finished_at: '2026-07-01T20:02:00.000Z',
    success: true,
    first_pass_green: true,
    tests_passed: true,
    validator_passed: null,
    commands_run: [
      { command: 'npm test', exit_code: 0, duration_ms: 1000 },
    ],
    files_modified: ['README.md'],
    human_touches: 0,
    retry_loops: 0,
    notes: 'Manual smoke row.',
  }, null, 2)}\n`);

  try {
    execFileSync(process.execPath, [
      script,
      'record',
      '--manifest',
      manifestPath,
      '--result',
      resultPath,
      '--out',
      outPath,
      '--artifacts-dir',
      root,
    ], { encoding: 'utf8' });

    const rows = readFileSync(outPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].schema_version, resultSchemaVersion);
    assert.equal(rows[0].wall_time_seconds, 120);
    assert.deepEqual(rows[0].token_estimate, null);
    assert(rows[0].warnings.includes('run_config unavailable'));
    assert(rows[0].warnings.includes('token_estimate unavailable'));
    assert(rows[0].warnings.includes('cost_estimate unavailable'));
    assert(rows[0].warnings.includes('transcript_or_trace artifact unavailable'));

    const validation = JSON.parse(execFileSync(process.execPath, [
      script,
      'validate-results',
      '--manifest',
      manifestPath,
      '--out',
      outPath,
      '--artifacts-dir',
      root,
    ], { encoding: 'utf8' }));
    assert.equal(validation.rows, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('normalizes run configuration and numeric token and cost estimates', () => {
  const { manifest } = readManifest(manifestPath);
  const row = normalizeResultRow({
    run_id: 'telemetry',
    task_id: 'docs-only-fixture-001',
    trial: 1,
    variant: 'static-minimal-agents',
    agent_surface: 'manual-adapter',
    run_config: {
      context_window: '128k',
      reasoning_effort: 'medium',
      mcp_servers: [],
      timeout_minutes: 30,
    },
    token_estimate: { unit: 'provider_tokens', input: 10, output: 5 },
    cost_estimate: { currency: 'USD', amount: 0.01 },
  }, manifest);

  assert.deepEqual(row.token_estimate, {
    unit: 'provider_tokens',
    input: 10,
    output: 5,
    total: 15,
  });
  assert.deepEqual(row.cost_estimate, { currency: 'USD', amount: 0.01 });
  assert.equal(row.run_config.timeout_minutes, 30);
});

test('rejects invalid telemetry and artifact path traversal', () => {
  const { manifest } = readManifest(manifestPath);
  const base = {
    run_id: 'bad-telemetry',
    task_id: 'docs-only-fixture-001',
    trial: 1,
    variant: 'static-minimal-agents',
    agent_surface: 'manual-adapter',
  };

  assert.throws(() => normalizeResultRow({
    ...base,
    token_estimate: 'lots',
  }, manifest), /token_estimate must be a non-negative number/);

  assert.throws(() => normalizeResultRow({
    ...base,
    artifact_paths: { transcript: '..\\outside.log' },
  }, manifest, { artifactsDir: resolve(tmpdir(), 'heb-benchmark-artifacts') }), /outside artifacts_dir/);
});

test('rejects result rows for variants not allowed by the task', () => {
  const { manifest } = readManifest(manifestPath);

  assert.throws(() => normalizeResultRow({
    run_id: 'bad-variant',
    task_id: 'docs-only-fixture-001',
    trial: 1,
    variant: 'missing',
    agent_surface: 'manual-adapter',
  }, manifest), /Unknown variant id: missing/);
});
