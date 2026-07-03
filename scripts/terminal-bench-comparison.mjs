#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), '..');

export const schemaVersion = 'heb-terminal-bench-comparison.v1';
export const defaultDataset = 'terminal-bench/terminal-bench-2';
export const defaultTasks = ['terminal-bench/regex-log'];
export const defaultJobsDir = '.heb-benchmark-runs/terminal-bench';
export const defaultGuidanceFile = 'test/fixtures/terminal-bench-comparison/heb-extra-instructions.md';
const defaultGuidanceFilePath = resolve(packageRoot, defaultGuidanceFile);

const variants = [
  { id: 'no-added-guidance', extraInstruction: false },
  { id: 'heb-guided', extraInstruction: true },
];

export function parseArgs(argv = process.argv.slice(2), now = new Date()) {
  const options = {
    command: 'run',
    dataset: defaultDataset,
    tasks: [],
    agent: 'claude-code',
    model: null,
    jobsDir: defaultJobsDir,
    out: null,
    runId: timestampRunId(now),
    guidanceFile: defaultGuidanceFile,
    timeoutMultiplier: '1',
    nConcurrent: '1',
    nAttempts: '1',
    agentKwargs: [],
    wsl: false,
    dryRun: false,
    skipPreflight: false,
    allowMissingAuth: false,
    help: false,
  };

  let index = 0;
  if (argv[0] && !argv[0].startsWith('-')) {
    options.command = argv[0];
    index = 1;
  }

  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dataset') {
      options.dataset = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--task') {
      options.tasks.push(requiredValue(argv, index, arg));
      index += 1;
    } else if (arg === '--agent') {
      options.agent = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--model') {
      options.model = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--jobs-dir') {
      options.jobsDir = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--out') {
      options.out = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--run-id') {
      options.runId = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--guidance-file') {
      options.guidanceFile = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--timeout-multiplier') {
      options.timeoutMultiplier = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--n-concurrent') {
      options.nConcurrent = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--n-attempts') {
      options.nAttempts = requiredValue(argv, index, arg);
      index += 1;
    } else if (arg === '--ak' || arg === '--agent-kwarg') {
      options.agentKwargs.push(requiredValue(argv, index, arg));
      index += 1;
    } else if (arg === '--wsl') {
      options.wsl = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-preflight') {
      options.skipPreflight = true;
    } else if (arg === '--allow-missing-auth') {
      options.allowMissingAuth = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['run', 'preflight', 'summarize'].includes(options.command)) {
    throw new Error('command must be run, preflight, or summarize.');
  }
  if (!options.tasks.length) options.tasks = [...defaultTasks];
  if (!options.model && options.agent === 'claude-code') {
    options.model = 'anthropic/claude-haiku-4-5';
  }
  if (!options.model && options.command !== 'summarize' && !['oracle', 'nop'].includes(options.agent)) {
    throw new Error('--model is required for model-backed agents other than the claude-code default.');
  }
  if (!options.out) options.out = join(options.jobsDir, `${options.runId}-summary.json`);
  rejectWslOnlyPaths(options);

  validatePositiveIntegerString(options.nConcurrent, '--n-concurrent');
  validatePositiveIntegerString(options.nAttempts, '--n-attempts');
  validatePositiveNumberString(options.timeoutMultiplier, '--timeout-multiplier');

  return options;
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function validatePositiveIntegerString(value, flag) {
  if (!/^[1-9]\d*$/.test(String(value))) throw new Error(`${flag} must be a positive integer.`);
}

function validatePositiveNumberString(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive number.`);
}

function rejectWslOnlyPaths(options) {
  if (!options.wsl) return;
  const fields = [
    ['--jobs-dir', options.jobsDir],
    ['--out', options.out],
  ];
  if (options.guidanceFile !== defaultGuidanceFile) fields.push(['--guidance-file', options.guidanceFile]);
  const rejected = fields.find(([, value]) => isWslOnlyAbsolutePath(value));
  if (!rejected) return;
  throw new Error(`${rejected[0]} cannot be a WSL-only absolute path when --wsl is run from Windows; use a relative path or Windows-readable path.`);
}

function isWslOnlyAbsolutePath(value) {
  return String(value || '').startsWith('/');
}

function timestampRunId(now) {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:]/g, '').replace('T', '-');
}

export function helpText() {
  return [
    'Usage:',
    '  node scripts/terminal-bench-comparison.mjs preflight [options]',
    '  node scripts/terminal-bench-comparison.mjs run [options]',
    '  node scripts/terminal-bench-comparison.mjs summarize --jobs-dir <dir> --run-id <id> [options]',
    '',
    'Runs a paired Harbor Terminal-Bench comparison:',
    '  1. no-added-guidance: task instruction only',
    '  2. heb-guided: same task plus --extra-instruction-path guidance',
    '',
    'Common options:',
    '  --dataset <id>              Default: terminal-bench/terminal-bench-2',
    '  --task <task-name>          Repeatable. Default: terminal-bench/regex-log',
    '  --agent <name>              Default: claude-code',
    '  --model <name>              Default for claude-code: anthropic/claude-haiku-4-5',
    '  --jobs-dir <path>           Default: .heb-benchmark-runs/terminal-bench',
    '  --out <path>                Default: <jobs-dir>/<run-id>-summary.json',
    '  --run-id <id>               Stable suffix for paired Harbor job names',
    '  --guidance-file <path>      Default: test/fixtures/terminal-bench-comparison/heb-extra-instructions.md',
    '  --timeout-multiplier <n>    Default: 1',
    '  --n-concurrent <n>          Default: 1',
    '  --n-attempts <n>            Default: 1',
    '  --ak <key=value>            Repeatable Harbor agent kwarg',
    '  --wsl                      Run Harbor through wsl.exe from Windows Node',
    '  --dry-run                  Print commands without running Harbor',
    '  --allow-missing-auth        Let preflight report missing auth without failing',
    '',
    'Codex subscription auth from Windows with --wsl: set CODEX_AUTH_JSON_PATH to a WSL-readable path and WSLENV=CODEX_AUTH_JSON_PATH.',
    'With --wsl, path options must be relative or Windows-readable because Node summarizes results from Windows.',
  ].join('\n');
}

export function preflight(options, {
  env = process.env,
  run = spawnSync,
  fileExists = existsSync,
} = {}) {
  const errors = [];
  const warnings = [];
  let harborVersion = null;

  const harborInvocation = buildHarborInvocation(options, ['--version']);
  const harbor = run(harborInvocation.command, harborInvocation.args, { encoding: 'utf8' });
  if (harbor.error) {
    errors.push(`harbor is not available on PATH: ${harbor.error.message}`);
  } else if (harbor.status !== 0) {
    errors.push(`harbor --version failed with exit ${harbor.status}.`);
  } else {
    harborVersion = String(harbor.stdout || harbor.stderr || '').trim() || null;
  }

  if (options.command !== 'summarize') {
    const guidancePath = guidanceFilePath(options);
    if (!fileExists(guidancePath)) {
      errors.push(`guidance file not found: ${guidancePath}`);
    }
  }

  const authEnv = options.wsl ? readWslCredentialPresence(run) : env;
  const authError = authPreflightError(options.agent, authEnv, fileExists);
  if (authError) {
    if (options.allowMissingAuth) warnings.push(authError);
    else errors.push(authError);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    harbor_version: harborVersion,
  };
}

function authPreflightError(agent, env, fileExists) {
  if (agent === 'claude-code') {
    if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.CLAUDE_CODE_OAUTH_TOKEN) return null;
    return [
      'claude-code requires ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or CLAUDE_CODE_OAUTH_TOKEN.',
      'Harbor does not use the normal ~/.claude login file unless a custom adapter copies it into the sandbox.',
    ].join(' ');
  }

  if (agent === 'codex') {
    const codexAuthPath = join(env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json');
    if (env.OPENAI_API_KEY) return null;
    if (env.CODEX_AUTH_JSON_PATH_PRESENT || (env.CODEX_AUTH_JSON_PATH && fileExists(env.CODEX_AUTH_JSON_PATH))) return null;
    if (truthy(env.CODEX_FORCE_AUTH_JSON) && (env.CODEX_AUTH_JSON_PRESENT || fileExists(codexAuthPath))) return null;
    return [
      'codex requires OPENAI_API_KEY, CODEX_AUTH_JSON_PATH, or CODEX_FORCE_AUTH_JSON=true with a refreshable Codex auth.json.',
      'A stale auth.json can still fail during Harbor execution.',
    ].join(' ');
  }

  if (agent === 'oracle' || agent === 'nop') return null;
  return `No credential preflight is defined for Harbor agent ${agent}; set the provider credentials required by that agent before running.`;
}

function readWslCredentialPresence(run) {
  const script = [
    'python3 - <<\'PY\'',
    'import json, os',
    'from pathlib import Path',
    'secret_keys = ["OPENAI_API_KEY","ANTHROPIC_API_KEY","ANTHROPIC_AUTH_TOKEN","CLAUDE_CODE_OAUTH_TOKEN","CODEX_AUTH_JSON_PATH"]',
    'boolean_keys = ["CLAUDE_FORCE_OAUTH","CODEX_FORCE_AUTH_JSON"]',
    'data = {key: "1" for key in secret_keys if os.environ.get(key)}',
    'for key in boolean_keys:',
    '    value = os.environ.get(key)',
    '    if value:',
    '        data[key] = value',
    'data["CODEX_AUTH_JSON_PRESENT"] = "1" if (Path(os.environ.get("CODEX_HOME", str(Path.home()/".codex")))/"auth.json").exists() else ""',
    'data["CODEX_AUTH_JSON_PATH_PRESENT"] = "1" if os.environ.get("CODEX_AUTH_JSON_PATH") and Path(os.environ["CODEX_AUTH_JSON_PATH"]).is_file() else ""',
    'print(json.dumps(data))',
    'PY',
  ].join('\n');
  const result = run('wsl.exe', ['bash', '-lc', script], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return {};
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return {};
  }
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

export function jobNameFor(options, variantId) {
  return `${sanitizeName(options.runId)}-${variantId}`;
}

export function buildHarborArgs(options, variant) {
  const args = [
    'run',
    '-d',
    options.dataset,
    '-a',
    options.agent,
  ];
  if (options.model) args.push('-m', options.model);
  args.push(
    '-n',
    String(options.nConcurrent),
    '-k',
    String(options.nAttempts),
    '-o',
    options.jobsDir,
    '--job-name',
    jobNameFor(options, variant.id),
    '--yes',
    '--timeout-multiplier',
    String(options.timeoutMultiplier),
  );

  for (const task of options.tasks) args.push('-i', task);
  for (const agentKwarg of options.agentKwargs) args.push('--ak', agentKwarg);
  if (variant.extraInstruction) args.push('--extra-instruction-path', guidanceFileForHarbor(options));
  return args;
}

function guidanceFileForHarbor(options) {
  return options.guidanceFile === defaultGuidanceFile ? defaultGuidanceFilePath : options.guidanceFile;
}

function guidanceFilePath(options) {
  return resolve(guidanceFileForHarbor(options));
}

export function buildHarborInvocation(options, harborArgs) {
  if (!options.wsl) return { command: 'harbor', args: harborArgs };
  const cwd = windowsPathToWsl(process.cwd());
  const wslHarborArgs = normalizeHarborPathArgsForWsl(harborArgs);
  return {
    command: 'wsl.exe',
    args: ['bash', '-lc', `cd ${shellQuote(cwd)} && ${commandLine('harbor', wslHarborArgs)}`],
  };
}

function windowsPathToWsl(path) {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(path);
  if (!match) return path.replaceAll('\\', '/');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

function normalizeHarborPathArgsForWsl(args) {
  const pathFlags = new Set(['-o', '--extra-instruction-path']);
  const normalized = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    normalized.push(arg);
    if (pathFlags.has(arg) && index + 1 < args.length) {
      normalized.push(windowsPathToWsl(args[index + 1]));
      index += 1;
    }
  }
  return normalized;
}

function sanitizeName(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
}

export function commandLine(command, args) {
  return [command, ...args].map(shellQuote).join(' ');
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@+-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\"'\"'")}'`;
}

export function summarizeJob(jobDir, variantId) {
  const jobResultPath = join(jobDir, 'result.json');
  if (!existsSync(jobResultPath)) {
    return {
      variant: variantId,
      job_name: basename(jobDir),
      result_path: jobResultPath,
      missing_result: true,
      trials: [],
    };
  }

  const jobResult = JSON.parse(readFileSync(jobResultPath, 'utf8'));
  const trials = readdirSync(jobDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(jobDir, entry.name, 'result.json'))
    .filter((trialPath) => existsSync(trialPath))
    .map((trialPath) => summarizeTrial(trialPath));

  const exceptionCount = trials.filter((trial) => trial.exception_type).length;
  const successCount = trials.filter((trial) => trial.reward === 1 && !trial.exception_type).length;

  return {
    variant: variantId,
    job_name: basename(jobDir),
    result_path: jobResultPath,
    started_at: jobResult.started_at || null,
    finished_at: jobResult.finished_at || null,
    n_trials: jobResult.n_total_trials ?? trials.length,
    n_completed_trials: jobResult.stats?.n_completed_trials ?? null,
    n_errored_trials: jobResult.stats?.n_errored_trials ?? exceptionCount,
    mean_reward: firstMetricMean(jobResult),
    success_count: successCount,
    exception_count: exceptionCount,
    input_tokens: jobResult.stats?.n_input_tokens ?? sumNullable(trials, 'input_tokens'),
    cache_tokens: jobResult.stats?.n_cache_tokens ?? sumNullable(trials, 'cache_tokens'),
    output_tokens: jobResult.stats?.n_output_tokens ?? sumNullable(trials, 'output_tokens'),
    reasoning_tokens: sumNullable(trials, 'reasoning_tokens'),
    cost_usd: jobResult.stats?.cost_usd ?? sumNullable(trials, 'cost_usd'),
    trials,
  };
}

function summarizeTrial(trialPath) {
  const result = JSON.parse(readFileSync(trialPath, 'utf8'));
  const reward = result.verifier_result?.rewards?.reward;
  const agent = result.agent_info || {};
  const model = agent.model_info || {};
  const codexUsage = agent.name === 'codex' ? readCodexUsageFallback(trialPath) : null;

  return {
    trial_name: result.trial_name || basename(resolve(trialPath, '..')),
    task_name: result.task_name || null,
    task_ref: result.task_id?.ref || null,
    task_checksum: result.task_checksum || null,
    agent: agent.name || null,
    agent_version: agent.version || null,
    model: model.name || null,
    provider: model.provider || null,
    reward: typeof reward === 'number' ? reward : null,
    exception_type: result.exception_info?.exception_type || null,
    exception_message: result.exception_info?.exception_message ? redactMessage(result.exception_info.exception_message) : null,
    input_tokens: numberOrNull(result.agent_result?.n_input_tokens) ?? numberOrNull(codexUsage?.input_tokens),
    cache_tokens: numberOrNull(result.agent_result?.n_cache_tokens) ?? numberOrNull(codexUsage?.cached_input_tokens),
    output_tokens: numberOrNull(result.agent_result?.n_output_tokens) ?? numberOrNull(codexUsage?.output_tokens),
    reasoning_tokens: numberOrNull(codexUsage?.reasoning_output_tokens),
    cost_usd: numberOrNull(result.agent_result?.cost_usd),
    started_at: result.started_at || null,
    finished_at: result.finished_at || null,
    wall_time_seconds: secondsBetween(result.started_at, result.finished_at),
    agent_execution_seconds: secondsBetween(result.agent_execution?.started_at, result.agent_execution?.finished_at),
    verifier_seconds: secondsBetween(result.verifier?.started_at, result.verifier?.finished_at),
  };
}

function readCodexUsageFallback(trialPath) {
  const logPath = join(resolve(trialPath, '..'), 'agent', 'codex.txt');
  if (!existsSync(logPath)) return null;
  let lastUsage = null;
  for (const line of readFileSync(logPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed);
      if (event.type === 'turn.completed' && event.usage && typeof event.usage === 'object') {
        lastUsage = event.usage;
      }
    } catch {
      // Ignore non-JSON diagnostic lines in Codex output.
    }
  }
  return lastUsage;
}

function firstMetricMean(jobResult) {
  const evals = Object.values(jobResult.stats?.evals || {});
  for (const entry of evals) {
    const mean = entry.metrics?.find((metric) => typeof metric.mean === 'number')?.mean;
    if (typeof mean === 'number') return mean;
  }
  return null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sumNullable(rows, field) {
  const values = rows.map((row) => row[field]).filter((value) => typeof value === 'number');
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function secondsBetween(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return null;
  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return null;
  return Math.round((finished - started) / 1000);
}

function redactMessage(message) {
  const redacted = String(message)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/sk-proj-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/("?(?:accessToken|refreshToken|access_token|refresh_token|id_token|CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY|api_key)"?\s*[:=]\s*)[^,}\s]+/g, '$1[REDACTED]');
  return redacted.length > 1200 ? `${redacted.slice(0, 1200)} ... [truncated]` : redacted;
}

export function summarizeComparison(options, harborVersion = null) {
  const jobDirs = variants.map((variant) => resolve(options.jobsDir, jobNameFor(options, variant.id)));
  const jobs = variants.map((variant, index) => summarizeJob(jobDirs[index], variant.id));
  const metadata = comparisonMetadataFromJobConfigs(options, jobDirs);
  return {
    schema_version: schemaVersion,
    generated_at: new Date().toISOString(),
    dataset: metadata.dataset,
    tasks: metadata.tasks,
    agent: metadata.agent,
    model: metadata.model,
    harbor_version: harborVersion,
    timeout_multiplier: metadata.timeoutMultiplier,
    n_concurrent: metadata.nConcurrent,
    n_attempts: metadata.nAttempts,
    guidance_file: metadata.guidanceFile,
    variants: jobs,
    comparison: Object.fromEntries(jobs.map((job) => [
      job.variant,
      {
        trials: job.n_trials ?? job.trials.length,
        successes: job.success_count ?? 0,
        exceptions: job.exception_count ?? 0,
        mean_reward: job.mean_reward ?? null,
        input_tokens: job.input_tokens ?? null,
        output_tokens: job.output_tokens ?? null,
        reasoning_tokens: job.reasoning_tokens ?? null,
        cost_usd: job.cost_usd ?? null,
      },
    ])),
  };
}

function comparisonMetadataFromJobConfigs(options, jobDirs) {
  const configs = jobDirs.map((jobDir) => readJsonIfExists(join(jobDir, 'config.json'))).filter(Boolean);
  assertComparableJobConfigs(configs);
  const firstConfig = configs[0] || {};
  const guidedConfig = configs.find((config) => Array.isArray(config.extra_instruction_paths) && config.extra_instruction_paths.length) || {};
  const firstDataset = firstConfig.datasets?.[0] || {};
  const firstAgent = firstConfig.agents?.[0] || {};

  return {
    dataset: firstDataset.name || options.dataset,
    tasks: firstDataset.task_names || options.tasks,
    agent: firstAgent.name || options.agent,
    model: firstAgent.model_name ?? options.model,
    timeoutMultiplier: numberOrDefault(firstConfig.timeout_multiplier, Number(options.timeoutMultiplier)),
    nConcurrent: numberOrDefault(firstConfig.n_concurrent_trials, Number(options.nConcurrent)),
    nAttempts: numberOrDefault(firstConfig.n_attempts, Number(options.nAttempts)),
    guidanceFile: guidedConfig.extra_instruction_paths?.[0] || options.guidanceFile,
  };
}

function assertComparableJobConfigs(configs) {
  if (configs.length < 2) return;
  const baseline = comparableConfigFields(configs[0]);
  for (const config of configs.slice(1)) {
    const candidate = comparableConfigFields(config);
    for (const field of Object.keys(baseline)) {
      if (stableJson(baseline[field]) !== stableJson(candidate[field])) {
        throw new Error(`paired Harbor configs differ for ${field}; refusing to summarize mismatched comparison.`);
      }
    }
  }
}

function comparableConfigFields(config) {
  const dataset = config.datasets?.[0] || {};
  const agent = config.agents?.[0] || {};
  return {
    dataset: dataset.name ?? null,
    dataset_version: dataset.version ?? null,
    dataset_ref: dataset.ref ?? null,
    task_names: dataset.task_names ?? [],
    agent: agent.name ?? null,
    model: agent.model_name ?? null,
    agent_kwargs: agent.kwargs ?? {},
    timeout_multiplier: config.timeout_multiplier ?? null,
    n_concurrent_trials: config.n_concurrent_trials ?? null,
    n_attempts: config.n_attempts ?? null,
  };
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = stableValue(value[key]);
  return sorted;
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function numberOrDefault(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function runComparison(options, {
  run = spawnSync,
  mkdir = mkdirSync,
  writeFile = writeFileSync,
} = {}) {
  mkdir(resolve(options.jobsDir), { recursive: true });
  const commands = variants.map((variant) => ({
    variant: variant.id,
    args: buildHarborArgs(options, variant),
  }));

  if (options.dryRun) {
    return {
      dry_run: true,
      commands: commands.map((entry) => ({
        variant: entry.variant,
        command: invocationCommandLine(buildHarborInvocation(options, entry.args)),
      })),
    };
  }

  for (const entry of commands) {
    const invocation = buildHarborInvocation(options, entry.args);
    const result = run(invocation.command, invocation.args, { stdio: 'inherit', env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`harbor failed for ${entry.variant} with exit ${result.status}.`);
    }
  }

  const preflightResult = preflight({ ...options, command: 'summarize', allowMissingAuth: true });
  const summary = summarizeComparison(options, preflightResult.harbor_version);
  const outPath = resolve(options.out);
  mkdir(resolve(outPath, '..'), { recursive: true });
  writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function invocationCommandLine(invocation) {
  return commandLine(invocation.command, invocation.args);
}

function assertReadablePath(path, label) {
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  if (!statSync(path).isFile()) throw new Error(`${label} must be a file: ${path}`);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(helpText());
    return;
  }

  if (options.command === 'preflight') {
    const result = preflight(options);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
    return;
  }

  if (options.command === 'summarize') {
    const result = preflight({ ...options, command: 'summarize', allowMissingAuth: true });
    const summary = summarizeComparison(options, result.harbor_version);
    const outPath = resolve(options.out);
    mkdirSync(resolve(outPath, '..'), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  assertReadablePath(guidanceFilePath(options), 'guidance file');
  if (!options.skipPreflight && !options.dryRun) {
    const result = preflight(options);
    if (!result.valid) {
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
      return;
    }
  }

  const result = runComparison(options);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
