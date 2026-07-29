#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_PROVENANCE_WARNING_PREFIXES = [
  'observed_model ',
  'model_routing_evidence ',
];

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
    review_convergence: summarizeReviewConvergence(rows),
    model_provenance: summarizeModelProvenance(rows),
    warnings: summarizeWarnings(rows),
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

function summarizeModelProvenance(rows) {
  return summarizeByVariant(rows, (variantRows) => ({
    rows: variantRows.length,
    declared_models: unique(variantRows.map((row) => row.model)),
    observed_models: unique(variantRows.map((row) => row.observed_model)),
    routing_evidence_rows: countWhere(variantRows, (row) => nonEmptyStringArrayLength(row.model_routing_evidence) > 0),
    warning_rows: countWhere(variantRows, hasModelProvenanceGap),
  }));
}

function summarizeReviewConvergence(rows) {
  return summarizeByVariant(
    rows.filter((row) => row.review_loop && typeof row.review_loop === 'object'),
    (variantRows) => ({
      rows: variantRows.length,
      median_reviewed_heads: median(
        variantRows
          .map((row) => numberOrNull(row.review_loop.reviewed_heads))
          .filter((value) => value !== null),
      ),
      median_remediation_heads: median(
        variantRows
          .map((row) => numberOrNull(row.review_loop.remediation_heads))
          .filter((value) => value !== null),
      ),
      same_family_recurrences: sum(
        variantRows,
        (row) => numberOrNull(row.review_loop.same_family_recurrences) ?? 0,
      ),
      rework_lines: sum(
        variantRows,
        (row) => numberOrNull(row.review_loop.rework_lines) ?? 0,
      ),
      prompt_bytes: sum(
        variantRows,
        (row) => numberOrNull(row.review_loop.prompt_bytes) ?? 0,
      ),
      escaped_relevant_defects: sum(
        variantRows,
        (row) => numberOrNull(row.review_loop.escaped_relevant_defects) ?? 0,
      ),
      terminal_full_review_rows: countWhere(
        variantRows,
        (row) => row.review_loop.terminal_full_review === true,
      ),
      triggered_action_rows: countWhere(
        variantRows,
        (row) => nonEmptyStringArrayLength(row.review_loop.triggered_actions) > 0,
      ),
    }),
  );
}

function summarizeWarnings(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (!Array.isArray(row.warnings)) continue;
    for (const warning of row.warnings) {
      if (typeof warning !== 'string') continue;
      const key = warning.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

function summarizeByVariant(rows, summarize) {
  const output = {};
  for (const variant of unique(rows.map((row) => row.variant))) {
    output[variant] = summarize(rows.filter((row) => row.variant === variant));
  }
  return output;
}

function unique(values) {
  return [...new Set(values.map(normalizedString).filter((value) => value !== null))];
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

function hasModelProvenanceGap(row) {
  if (hasModelProvenanceWarning(row)) return true;
  const declaredModel = normalizedString(row.model);
  if (declaredModel === null) return false;
  const observedModel = normalizedString(row.observed_model);
  if (observedModel === null) return nonEmptyStringArrayLength(row.model_routing_evidence) === 0;
  return declaredModel !== observedModel && nonEmptyStringArrayLength(row.model_routing_evidence) === 0;
}

function hasModelProvenanceWarning(row) {
  if (!Array.isArray(row.warnings)) return false;
  return row.warnings.some((warning) => (
    typeof warning === 'string'
    && MODEL_PROVENANCE_WARNING_PREFIXES.some((prefix) => warning.trim().startsWith(prefix))
  ));
}

function normalizedString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nonEmptyStringArrayLength(value) {
  if (!Array.isArray(value)) return 0;
  return value.filter((entry) => typeof entry === 'string' && entry.trim()).length;
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
    ...formatReviewConvergence(summary),
    ...formatModelProvenance(summary),
    ...formatWarnings(summary),
  ].join('\n');
}

function formatReviewConvergence(summary) {
  const entries = Object.entries(summary.review_convergence);
  if (!entries.length) return [];

  return [
    '',
    '## Review-Loop Convergence',
    '',
    '| Variant | Rows | Median reviewed heads | Median remediation heads | Same-family recurrences | Rework lines | Prompt bytes | Escaped relevant defects | Terminal full review | Triggered action rows |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...entries.map(([variant, data]) => (
      `| \`${variant}\` | ${data.rows} | ${formatNumber(data.median_reviewed_heads)} | ${formatNumber(data.median_remediation_heads)} | ${data.same_family_recurrences} | ${data.rework_lines} | ${data.prompt_bytes} | ${data.escaped_relevant_defects} | ${data.terminal_full_review_rows}/${data.rows} | ${data.triggered_action_rows}/${data.rows} |`
    )),
  ];
}

function formatModelProvenance(summary) {
  const entries = Object.entries(summary.model_provenance)
    .filter(([, data]) => data.declared_models.length || data.observed_models.length || data.routing_evidence_rows || data.warning_rows);
  if (!entries.length) return [];

  return [
    '',
    '## Model Provenance',
    '',
    '| Variant | Declared models | Observed models | Routing evidence rows | Warning rows |',
    '| --- | --- | --- | ---: | ---: |',
    ...entries.map(([variant, data]) => (
      `| \`${variant}\` | ${formatList(data.declared_models)} | ${formatList(data.observed_models)} | ${data.routing_evidence_rows}/${data.rows} | ${data.warning_rows}/${data.rows} |`
    )),
  ];
}

function formatWarnings(summary) {
  const entries = Object.entries(summary.warnings);
  if (!entries.length) return [];

  return [
    '',
    '## Warnings',
    '',
    '| Warning | Rows |',
    '| --- | ---: |',
    ...entries.map(([warning, count]) => `| ${formatTableText(warning)} | ${count} |`),
  ];
}

function formatList(values) {
  return values.length ? values.map((value) => `\`${formatTableText(value)}\``).join(', ') : 'n/a';
}

function formatTableText(value) {
  return String(value).replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
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
