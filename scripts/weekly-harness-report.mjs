#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentScript = fileURLToPath(import.meta.url);
export const repoRoot = resolve(dirname(currentScript), '..');

export const defaultCheckSpecs = [
  {
    id: 'bootstrap-planner-tests',
    name: 'Bootstrap planner tests',
    command: [process.execPath, '--test', 'scripts/harness-bootstrap-plan.test.mjs'],
    display: 'node --test scripts/harness-bootstrap-plan.test.mjs',
  },
  {
    id: 'harness-doctor-tests',
    name: 'Harness doctor tests',
    command: [process.execPath, '--test', 'scripts/harness-doctor.test.mjs'],
    display: 'node --test scripts/harness-doctor.test.mjs',
  },
  {
    id: 'package-entrypoint-tests',
    name: 'Package entrypoint tests',
    command: [process.execPath, '--test', 'scripts/package-entrypoint.test.mjs'],
    display: 'node --test scripts/package-entrypoint.test.mjs',
  },
  {
    id: 'pr-agent-inbox-tests',
    name: 'PR agent inbox tests',
    command: [process.execPath, '--test', 'scripts/pr-agent-inbox.test.mjs'],
    display: 'node --test scripts/pr-agent-inbox.test.mjs',
  },
  {
    id: 'release-prep-tests',
    name: 'Release preparation tests',
    command: [process.execPath, '--test', 'scripts/prepare-stable-release.test.mjs'],
    display: 'node --test scripts/prepare-stable-release.test.mjs',
  },
  {
    id: 'scout-ledger-index-tests',
    name: 'Scout ledger index tests',
    command: [process.execPath, '--test', 'scripts/scout-ledger-index.test.mjs'],
    display: 'node --test scripts/scout-ledger-index.test.mjs',
  },
  {
    id: 'weekly-harness-report-tests',
    name: 'Weekly harness report tests',
    command: [process.execPath, '--test', 'scripts/weekly-harness-report.test.mjs'],
    display: 'node --test scripts/weekly-harness-report.test.mjs',
  },
  {
    id: 'template-fitness',
    name: 'Template fitness',
    command: [process.execPath, 'scripts/template-fitness.mjs'],
    display: 'node scripts/template-fitness.mjs',
  },
  {
    id: 'harness-doctor-json',
    name: 'Harness doctor',
    command: [process.execPath, 'scripts/harness-doctor.mjs', '--json'],
    display: 'node scripts/harness-doctor.mjs --json',
    parseDoctor: true,
  },
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    repo: repoRoot,
    outputDir: defaultOutputDir(),
    date: new Date().toISOString().slice(0, 10),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') {
      index += 1;
      if (!argv[index]) throw new Error('--repo requires a path');
      options.repo = resolve(argv[index]);
    } else if (arg === '--output-dir') {
      index += 1;
      if (!argv[index]) throw new Error('--output-dir requires a path');
      options.outputDir = argv[index];
    } else if (arg === '--date') {
      index += 1;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(argv[index] ?? '')) throw new Error('--date requires YYYY-MM-DD');
      options.date = argv[index];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function defaultOutputDir(env = process.env) {
  if (env.GITHUB_ACTIONS === 'true') return '.harness';
  return resolve(tmpdir(), 'heb-weekly-harness-report');
}

export function helpText() {
  return [
    'Usage: node scripts/weekly-harness-report.mjs [--repo <path>] [--output-dir <path>] [--date YYYY-MM-DD]',
    '',
    'Runs the HEB harness checks, writes a Markdown/JSON report, and records whether follow-up is needed.',
    'CI writes to .harness for artifact upload; local runs default to a temp directory unless --output-dir is set.',
    'The command exits zero so scheduled workflows can upload artifacts and notify before failing deliberately.',
  ].join('\n');
}

export function runCheck(spec, options = {}) {
  const runner = options.runner ?? spawnCheck;
  const started = Date.now();
  const result = runner(spec, options.repo ?? repoRoot);
  const finished = Date.now();

  return {
    id: spec.id,
    name: spec.name,
    command: spec.display,
    exitCode: normalizeExitCode(result),
    signal: result.signal ?? null,
    durationMs: result.durationMs ?? finished - started,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    parseDoctor: Boolean(spec.parseDoctor),
  };
}

export function spawnCheck(spec, root) {
  const [command, ...args] = spec.command;
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  });

  return {
    exitCode: normalizeExitCode(result),
    signal: result.signal ?? null,
    durationMs: Date.now() - started,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? result.error.message : ''),
  };
}

function normalizeExitCode(result) {
  if (Number.isInteger(result.exitCode)) return result.exitCode;
  if (Number.isInteger(result.status)) return result.status;
  if (result.signal || result.error) return 1;
  return 1;
}

export function buildReport({
  checkResults,
  date,
  repository = process.env.GITHUB_REPOSITORY ?? null,
  runUrl = githubRunUrl(),
  commit = process.env.GITHUB_SHA ?? null,
}) {
  const checks = checkResults.map((check) => ({
    ...check,
    passed: check.exitCode === 0,
    stdoutTail: tail(check.stdout),
    stderrTail: tail(check.stderr),
  }));

  const doctorCheck = checks.find((check) => check.parseDoctor);
  const doctor = parseDoctorReport(doctorCheck);
  const failedChecks = checks.filter((check) => !check.passed);
  const doctorWarningCount = doctor.report?.summary?.warningCount ?? null;
  const hasDoctorWarnings = Number.isFinite(doctorWarningCount) && doctorWarningCount > 0;
  const hasProblems = failedChecks.length > 0 || hasDoctorWarnings || Boolean(doctor.error);

  return {
    kind: 'heb-weekly-harness-report',
    generated_at: new Date().toISOString(),
    date,
    repository,
    commit,
    run_url: runUrl,
    summary: {
      hasProblems,
      failedCheckCount: failedChecks.length,
      doctorWarningCount,
      doctorParseError: doctor.error,
    },
    checks,
    doctor: doctor.report,
  };
}

export function renderMarkdown(report) {
  const status = report.summary.hasProblems ? 'Problems detected' : 'No problems detected';
  const lines = [
    '# Weekly Harness Report',
    '',
    `Status: ${status}`,
    `Date: ${report.date}`,
  ];

  if (report.repository) lines.push(`Repository: ${report.repository}`);
  if (report.commit) lines.push(`Commit: ${report.commit}`);
  if (report.run_url) lines.push(`Workflow run: ${report.run_url}`);

  lines.push(
    '',
    '## Checks',
    '',
    '| Check | Status | Duration | Command |',
    '|---|---:|---:|---|',
  );

  for (const check of report.checks) {
    const checkStatus = check.passed ? 'ok' : `failed (${check.exitCode})`;
    lines.push(`| ${escapeCell(check.name)} | ${checkStatus} | ${formatDuration(check.durationMs)} | \`${escapeCell(check.command)}\` |`);
  }

  lines.push('', '## Harness Doctor', '');
  if (report.summary.doctorParseError) {
    lines.push(`- Doctor JSON parse error: ${report.summary.doctorParseError}`);
  } else if (Number.isFinite(report.summary.doctorWarningCount)) {
    lines.push(`- Warnings: ${report.summary.doctorWarningCount}`);
  } else {
    lines.push('- Warnings: unknown');
  }

  if (report.doctor?.warnings?.length) {
    lines.push('', '### Warnings', '');
    for (const warning of report.doctor.warnings) {
      const location = warning.line ? `${warning.path}:${warning.line}` : warning.path;
      lines.push(`- [${warning.code}] ${location} - ${warning.message}`);
    }
  }

  const failedChecks = report.checks.filter((check) => !check.passed);
  if (failedChecks.length) {
    lines.push('', '## Failed Check Output', '');
    for (const check of failedChecks) {
      lines.push(`### ${check.name}`, '');
      if (check.stderrTail) {
        lines.push('```text', check.stderrTail, '```', '');
      }
      if (check.stdoutTail) {
        lines.push('```text', check.stdoutTail, '```', '');
      }
      if (!check.stderrTail && !check.stdoutTail) lines.push('- No output captured.', '');
    }
  }

  lines.push('', '## Next Action', '');
  if (report.summary.hasProblems) {
    lines.push('- Inspect the failed checks or doctor warnings in this report.');
    lines.push('- The scheduled workflow should create or update the harness problem issue before marking the run failed.');
  } else {
    lines.push('- No action needed.');
  }

  return `${lines.join('\n')}\n`;
}

export function writeReport(report, options = {}) {
  const outputDir = resolve(options.repo ?? repoRoot, options.outputDir ?? '.harness');
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = resolve(outputDir, 'weekly-harness-report.json');
  const mdPath = resolve(outputDir, 'weekly-harness-report.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}

export function writeGitHubOutputs(report, paths) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `has_problems=${report.summary.hasProblems ? 'true' : 'false'}`,
    `report_json=${slash(relative(process.cwd(), paths.jsonPath))}`,
    `report_md=${slash(relative(process.cwd(), paths.mdPath))}`,
    '',
  ].join('\n'));
}

function parseDoctorReport(check) {
  if (!check || check.exitCode !== 0) return { report: null, error: null };
  try {
    return { report: JSON.parse(check.stdout), error: null };
  } catch (error) {
    return { report: null, error: error.message };
  }
}

function tail(text, maxLines = 40) {
  const lines = String(text || '').trimEnd().split(/\r?\n/).filter(Boolean);
  return lines.slice(-maxLines).join('\n');
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) return 'unknown';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function githubRunUrl() {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!server || !repo || !runId) return null;
  return `${server}/${repo}/actions/runs/${runId}`;
}

function slash(path) {
  return path.replace(/\\/g, '/');
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

  const checkResults = defaultCheckSpecs.map((spec) => runCheck(spec, { repo: options.repo }));
  const report = buildReport({ checkResults, date: options.date });
  const paths = writeReport(report, options);
  writeGitHubOutputs(report, paths);
  console.log(renderMarkdown(report));
}

if (process.argv[1] && resolve(process.argv[1]) === currentScript) {
  main();
}
