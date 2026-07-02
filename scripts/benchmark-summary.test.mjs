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

test('CLI emits markdown summaries from JSONL rows', () => {
  const output = execFileSync(process.execPath, [
    script,
    '--results',
    pilotResultsPath,
  ], { encoding: 'utf8' });

  assert.match(output, /# Benchmark Summary/);
  assert.match(output, /Rows: 24/);
});
