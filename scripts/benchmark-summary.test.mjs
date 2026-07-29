import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatMarkdown, summarizeRows } from './benchmark-summary.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const script = resolve(testDir, 'benchmark-summary.mjs');
const pilotResultsPath = resolve(testDir, '..', 'test', 'fixtures', 'benchmark-pilot-2026-07', 'results.jsonl');

function pilotRows() {
  return readFileSync(pilotResultsPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

test('summarizes first-trial pilot rows by variant', () => {
  const summary = summarizeRows(pilotRows());

  assert.equal(summary.rows, 24);
  assert.deepEqual(summary.first_trial['no-added-guidance'], {
    tasks: 10,
    success: 7,
    first_pass_green: 6,
    route_hits: 0,
    stale_hits: 3,
    median_token_estimate: 4750,
    median_wall_time_seconds: 340,
  });
  assert.deepEqual(summary.first_trial['heb-planned-core'], {
    tasks: 10,
    success: 8,
    first_pass_green: 6,
    route_hits: 10,
    stale_hits: 0,
    median_token_estimate: 6250,
    median_wall_time_seconds: 420,
  });
});

test('summarizes repeated pilot rows by variant', () => {
  const summary = summarizeRows(pilotRows());

  assert.deepEqual(summary.repeated_subset['no-added-guidance'], {
    repeated_trials: 2,
    success: 1,
    same_family_stale_recurrence: 1,
  });
  assert.deepEqual(summary.repeated_subset['heb-planned-core'], {
    repeated_trials: 2,
    success: 2,
    same_family_stale_recurrence: 0,
  });
});

test('renders the pilot summary table for PR bodies and reports', () => {
  const markdown = formatMarkdown(summarizeRows(pilotRows()));

  assert.match(markdown, /\| `no-added-guidance` \| 10 \| 7\/10 \| 6\/10 \| 0\/10 \| 3 \| 4,750 \| 340s \|/);
  assert.match(markdown, /\| `heb-planned-core` \| 2 \| 2\/2 \| 0\/2 \|/);
});

test('surfaces review-loop convergence metrics and correctness coverage', () => {
  const rows = [
    {
      trial: 1,
      variant: 'current-doctrine',
      success: true,
      first_pass_green: false,
      route_hits: [],
      stale_hits: [],
      token_estimate: { total: 10 },
      wall_time_seconds: 5,
      review_loop: {
        reviewed_heads: 5,
        remediation_heads: 4,
        same_family_recurrences: 3,
        rework_lines: 210,
        prompt_bytes: 70000,
        escaped_relevant_defects: 0,
        terminal_full_review: true,
        triggered_actions: [],
      },
    },
    {
      trial: 1,
      variant: 'revised-doctrine',
      success: true,
      first_pass_green: false,
      route_hits: [],
      stale_hits: [],
      token_estimate: { total: 10 },
      wall_time_seconds: 5,
      review_loop: {
        reviewed_heads: 3,
        remediation_heads: 2,
        same_family_recurrences: 1,
        rework_lines: 40,
        prompt_bytes: 42000,
        escaped_relevant_defects: 0,
        terminal_full_review: true,
        triggered_actions: ['design-mechanism-checkpoint'],
      },
    },
  ];

  const summary = summarizeRows(rows);
  const markdown = formatMarkdown(summary);

  assert.deepEqual(summary.review_convergence['revised-doctrine'], {
    rows: 1,
    median_reviewed_heads: 3,
    median_remediation_heads: 2,
    same_family_recurrences: 1,
    same_family_recurrences_measured_rows: 1,
    rework_lines: 40,
    rework_lines_measured_rows: 1,
    prompt_bytes: 42000,
    prompt_bytes_measured_rows: 1,
    escaped_relevant_defects: 0,
    escaped_relevant_defects_measured_rows: 1,
    terminal_full_review_rows: 1,
    triggered_action_rows: 1,
  });
  assert.match(markdown, /## Review-Loop Convergence/);
  assert.match(
    markdown,
    /\| `revised-doctrine` \| 1 \| 3 \| 2 \| 1 \| 40 \| 42000 \| 0 \| 1\/1 \| 1\/1 \|/,
  );
});

test('preserves unknown nullable review-loop totals and reports coverage', () => {
  const summary = summarizeRows([
    {
      trial: 1,
      variant: 'partial-telemetry',
      review_loop: {
        same_family_recurrences: 0,
        rework_lines: 4,
        prompt_bytes: 100,
        escaped_relevant_defects: 0,
        terminal_full_review: true,
        triggered_actions: [],
      },
    },
    {
      trial: 2,
      variant: 'partial-telemetry',
      review_loop: {
        same_family_recurrences: null,
        rework_lines: null,
        prompt_bytes: null,
        escaped_relevant_defects: null,
        terminal_full_review: null,
        triggered_actions: [],
      },
    },
  ]);

  const data = summary.review_convergence['partial-telemetry'];
  assert.equal(data.same_family_recurrences, null);
  assert.equal(data.rework_lines, null);
  assert.equal(data.prompt_bytes, null);
  assert.equal(data.escaped_relevant_defects, null);
  assert.equal(data.escaped_relevant_defects_measured_rows, 1);
  assert.match(
    formatMarkdown(summary),
    /\| `partial-telemetry` \| 2 \| n\/a \| n\/a \| n\/a \(1\/2 measured\) \| n\/a \(1\/2 measured\) \| n\/a \(1\/2 measured\) \| n\/a \(1\/2 measured\) \| 1\/2 \| 0\/2 \|/,
  );
});

test('surfaces model provenance warnings in summaries', () => {
  const summary = summarizeRows([
    {
      trial: 1,
      variant: 'heb-guided',
      success: true,
      first_pass_green: true,
      route_hits: [],
      stale_hits: [],
      token_estimate: { total: 10 },
      wall_time_seconds: 5,
      model: 'gpt-5.5',
      observed_model: null,
      model_routing_evidence: [],
      warnings: ['observed_model unavailable'],
    },
  ]);
  const markdown = formatMarkdown(summary);

  assert.deepEqual(summary.warnings, { 'observed_model unavailable': 1 });
  assert.deepEqual(summary.model_provenance['heb-guided'], {
    rows: 1,
    declared_models: ['gpt-5.5'],
    observed_models: [],
    routing_evidence_rows: 0,
    warning_rows: 1,
  });
  assert.match(markdown, /## Model Provenance/);
  assert.match(markdown, /\| `heb-guided` \| `gpt-5\.5` \| n\/a \| 0\/1 \| 1\/1 \|/);
  assert.match(markdown, /## Warnings/);
  assert.match(markdown, /\| observed_model unavailable \| 1 \|/);
});

test('derives model provenance gaps from row fields', () => {
  const summary = summarizeRows([
    {
      trial: 1,
      variant: 'historical-product-run',
      success: true,
      first_pass_green: true,
      route_hits: [],
      stale_hits: [],
      token_estimate: { total: 10 },
      wall_time_seconds: 5,
      model: 'gpt-5.5',
      warnings: [],
    },
    {
      trial: 2,
      variant: 'historical-product-run',
      success: true,
      first_pass_green: true,
      route_hits: [],
      stale_hits: [],
      token_estimate: { total: 12 },
      wall_time_seconds: 6,
      model: 'claude-fable-5',
      observed_model: 'claude-opus-4.8',
      model_routing_evidence: [],
      warnings: [],
    },
    {
      trial: 3,
      variant: 'historical-product-run',
      success: true,
      first_pass_green: true,
      route_hits: [],
      stale_hits: [],
      token_estimate: { total: 14 },
      wall_time_seconds: 7,
      model: 'codex-product',
      model_routing_evidence: ['trajectory metadata records routing path'],
      warnings: [],
    },
  ]);
  const markdown = formatMarkdown(summary);

  assert.deepEqual(summary.model_provenance['historical-product-run'], {
    rows: 3,
    declared_models: ['gpt-5.5', 'claude-fable-5', 'codex-product'],
    observed_models: ['claude-opus-4.8'],
    routing_evidence_rows: 1,
    warning_rows: 2,
  });
  assert.match(markdown, /\| `historical-product-run` \| `gpt-5\.5`, `claude-fable-5`, `codex-product` \| `claude-opus-4\.8` \| 1\/3 \| 2\/3 \|/);
});

test('does not render model provenance for unrelated warnings', () => {
  const summary = summarizeRows([
    {
      trial: 1,
      variant: 'manual',
      success: true,
      first_pass_green: true,
      route_hits: [],
      stale_hits: [],
      token_estimate: null,
      wall_time_seconds: null,
      warnings: ['token_estimate unavailable'],
    },
  ]);
  const markdown = formatMarkdown(summary);

  assert.equal(summary.model_provenance.manual.warning_rows, 0);
  assert.doesNotMatch(markdown, /## Model Provenance/);
  assert.match(markdown, /## Warnings/);
  assert.match(markdown, /\| token_estimate unavailable \| 1 \|/);
});

test('normalizes warning keys and escapes markdown table cells', () => {
  const summary = summarizeRows([
    {
      trial: 1,
      variant: 'manual',
      success: true,
      first_pass_green: true,
      route_hits: [],
      stale_hits: [],
      token_estimate: null,
      wall_time_seconds: null,
      warnings: [' token_estimate unavailable ', 'token_estimate unavailable'],
    },
    {
      trial: 2,
      variant: 'manual',
      success: true,
      first_pass_green: true,
      route_hits: [],
      stale_hits: [],
      token_estimate: null,
      wall_time_seconds: null,
      warnings: ['pipe | newline\nwarning'],
    },
  ]);
  const markdown = formatMarkdown(summary);

  assert.equal(summary.warnings['token_estimate unavailable'], 2);
  assert.match(markdown, /\| token_estimate unavailable \| 2 \|/);
  assert.match(markdown, /\| pipe \\\| newline warning \| 1 \|/);
});

test('does not count blank routing evidence as model provenance', () => {
  const summary = summarizeRows([
    {
      trial: 1,
      variant: 'hand-authored',
      success: true,
      first_pass_green: true,
      route_hits: [],
      stale_hits: [],
      token_estimate: null,
      wall_time_seconds: null,
      model: 'gpt-5.5',
      model_routing_evidence: [' '],
      warnings: [],
    },
  ]);
  const markdown = formatMarkdown(summary);

  assert.deepEqual(summary.model_provenance['hand-authored'], {
    rows: 1,
    declared_models: ['gpt-5.5'],
    observed_models: [],
    routing_evidence_rows: 0,
    warning_rows: 1,
  });
  assert.match(markdown, /\| `hand-authored` \| `gpt-5\.5` \| n\/a \| 0\/1 \| 1\/1 \|/);
});

test('CLI emits markdown summaries from JSONL rows', () => {
  const output = execFileSync(process.execPath, [
    script,
    '--results',
    pilotResultsPath,
  ], { encoding: 'utf8' });

  assert.match(output, /# Benchmark Summary/);
  assert.match(output, /Rows: 24/);
});
