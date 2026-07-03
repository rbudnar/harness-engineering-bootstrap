#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    results: null,
    format: 'markdown',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--results') {
      options.results = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--format') {
      options.format = requiredValue(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['markdown', 'json'].includes(options.format)) {
    throw new Error('--format must be markdown or json.');
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
    '  node scripts/benchmark-summary.mjs --results <results.jsonl> [--format markdown|json]',
    '',
    'Summarizes HEB benchmark result rows into first-trial and repeated-subset tables.',
  ].join('\n');
}

export function readResultsFile(resultsPath) {
  const text = readFileSync(resolve(resultsPath), 'utf8');
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
      }
    });
}

export function summarizeRows(rows) {
  if (!Array.isArray(rows)) throw new Error('rows must be an array.');
  const firstTrialRows = rows.filter((row) => row.trial === 1);
  const repeatedRows = rows.filter((row) => Number.isInteger(row.trial) && row.trial > 1);

  return {
    rows: rows.length,
    first_trial: summarizeFirstTrial(firstTrialRows),
    repeated_subset: summarizeRepeated(repeatedRows),
  };
}

function summarizeFirstTrial(rows) {
  return summarizeByVariant(rows, (variantRows) => ({
    tasks: variantRows.length,
    success: countWhere(variantRows, (row) => row.success === true),
    first_pass_green: countWhere(variantRows, (row) => row.first_pass_green === true),
    route_hits: countWhere(variantRows, (row) => arrayLength(row.route_hits) > 0),
    stale_hits: sum(variantRows, (row) => arrayLength(row.stale_hits)),
    median_token_estimate: median(variantRows.map(tokenTotal).filter((value) => value !== null)),
    median_wall_time_seconds: median(variantRows.map((row) => numberOrNull(row.wall_time_seconds)).filter((value) => value !== null)),
  }));
}

function summarizeRepeated(rows) {
  return summarizeByVariant(rows, (variantRows) => ({
    repeated_trials: variantRows.length,
    success: countWhere(variantRows, (row) => row.success === true),
    same_family_stale_recurrence: countWhere(variantRows, (row) => arrayLength(row.stale_hits) > 0),
  }));
}

function summarizeByVariant(rows, summarize) {
  const output = {};
  for (const variant of unique(rows.map((row) => row.variant))) {
    output[variant] = summarize(rows.filter((row) => row.variant === variant));
  }
  return output;
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function sum(rows, project) {
  return rows.reduce((total, row) => total + project(row), 0);
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function tokenTotal(row) {
  const value = row.token_estimate;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value.total === 'number' && Number.isFinite(value.total)) return value.total;
  return null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

export function formatMarkdown(summary) {
  return [
    '# Benchmark Summary',
    '',
    `Rows: ${summary.rows}`,
    '',
    '## First-Trial Outcomes',
    '',
    '| Variant | Tasks | Success | First-pass green | Route hits | Stale hits | Median token estimate | Median wall time |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(summary.first_trial).map(([variant, data]) => (
      `| \`${variant}\` | ${data.tasks} | ${data.success}/${data.tasks} | ${data.first_pass_green}/${data.tasks} | ${data.route_hits}/${data.tasks} | ${data.stale_hits} | ${formatNumber(data.median_token_estimate)} | ${formatSeconds(data.median_wall_time_seconds)} |`
    )),
    '',
    '## Repeated Subset',
    '',
    '| Variant | Repeated trials | Success | Same-family stale recurrence |',
    '| --- | ---: | ---: | ---: |',
    ...Object.entries(summary.repeated_subset).map(([variant, data]) => (
      `| \`${variant}\` | ${data.repeated_trials} | ${data.success}/${data.repeated_trials} | ${data.same_family_stale_recurrence}/${data.repeated_trials} |`
    )),
  ].join('\n');
}

function formatNumber(value) {
  return value === null ? 'n/a' : value.toLocaleString('en-US');
}

function formatSeconds(value) {
  return value === null ? 'n/a' : `${formatNumber(value)}s`;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(helpText());
    return;
  }
  if (!options.results) throw new Error('--results is required.');

  const summary = summarizeRows(readResultsFile(options.results));
  if (options.format === 'json') {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(formatMarkdown(summary));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
