import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  buildHarborArgs,
  buildHarborInvocation,
  commandLine,
  defaultDataset,
  jobNameFor,
  parseArgs,
  preflight,
  runComparison,
  summarizeComparison,
  summarizeJob,
} from './terminal-bench-comparison.mjs';

test('builds paired Harbor commands with guidance only on the HEB variant', () => {
  const options = parseArgs([
    'run',
    '--run-id',
    'issue-70-live',
    '--task',
    'terminal-bench/regex-log',
    '--ak',
    'max_turns=20',
  ], new Date('2026-07-03T12:00:00Z'));

  assert.equal(options.dataset, defaultDataset);
  assert.equal(options.model, 'anthropic/claude-haiku-4-5');

  const noGuidance = buildHarborArgs(options, { id: 'no-added-guidance', extraInstruction: false });
  const guided = buildHarborArgs(options, { id: 'heb-guided', extraInstruction: true });

  assert.deepEqual(noGuidance.slice(0, 7), [
    'run',
    '-d',
    'terminal-bench/terminal-bench-2',
    '-a',
    'claude-code',
    '-m',
    'anthropic/claude-haiku-4-5',
  ]);
  assert(noGuidance.includes('terminal-bench/regex-log'));
  assert(!noGuidance.includes('--extra-instruction-path'));
  assert(guided.includes('--extra-instruction-path'));
  assert(guided.includes('test/fixtures/terminal-bench-comparison/heb-extra-instructions.md'));
  assert.equal(jobNameFor(options, 'heb-guided'), 'issue-70-live-heb-guided');
});

test('preflight names missing model-agent auth without printing secrets', () => {
  const options = parseArgs(['preflight']);
  const result = preflight(options, {
    env: {},
    fileExists: () => true,
    run: () => ({ status: 0, stdout: '0.17.0\n' }),
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /claude-code requires ANTHROPIC_API_KEY/);
  assert.doesNotMatch(result.errors.join('\n'), /sk-ant|Bearer/);
});

test('preflight allows oracle and nop without provider credentials', () => {
  const options = parseArgs(['preflight', '--agent', 'oracle']);
  const result = preflight(options, {
    env: {},
    fileExists: () => true,
    run: () => ({ status: 0, stdout: '0.17.0\n' }),
  });

  assert.equal(result.valid, true);
  assert.equal(result.harbor_version, '0.17.0');
});

test('preflight accepts Codex subscription auth by explicit auth json path', () => {
  const options = parseArgs(['preflight', '--agent', 'codex', '--model', 'gpt-5.5']);
  const result = preflight(options, {
    env: { CODEX_AUTH_JSON_PATH: '/tmp/auth.json' },
    fileExists: (path) => path === '/tmp/auth.json',
    run: () => ({ status: 0, stdout: '0.17.0\n' }),
  });

  assert.equal(result.valid, true);
});

test('wsl preflight accepts forwarded Codex auth json path presence', () => {
  const options = parseArgs(['preflight', '--wsl', '--agent', 'codex', '--model', 'gpt-5.5']);
  const result = preflight(options, {
    env: {},
    fileExists: () => false,
    run: (command, args) => {
      if (command === 'wsl.exe' && args[2].includes('harbor --version')) {
        return { status: 0, stdout: '0.17.0\n' };
      }
      if (command === 'wsl.exe') {
        return { status: 0, stdout: JSON.stringify({ CODEX_AUTH_JSON_PATH_PRESENT: '1' }) };
      }
      return { status: 1, stdout: '' };
    },
  });

  assert.equal(result.valid, true);
});

test('summarizes Harbor job reward exception and token telemetry', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-terminal-bench-summary-'));
  const job = join(root, 'issue-70-live-no-added-guidance');
  const trial = join(job, 'regex-log__abc123');
  mkdirSync(trial, { recursive: true });

  try {
    writeFileSync(join(job, 'result.json'), `${JSON.stringify({
      started_at: '2026-07-03T12:00:00.000Z',
      finished_at: '2026-07-03T12:01:00.000Z',
      n_total_trials: 1,
      stats: {
        n_completed_trials: 1,
        n_errored_trials: 0,
        evals: {
          'claude-code__terminal-bench': {
            metrics: [{ mean: 1 }],
          },
        },
        n_input_tokens: 10,
        n_cache_tokens: 2,
        n_output_tokens: 5,
        cost_usd: 0.01,
      },
    })}\n`);
    writeFileSync(join(trial, 'result.json'), `${JSON.stringify({
      task_name: 'terminal-bench/regex-log',
      trial_name: 'regex-log__abc123',
      task_id: { ref: 'sha256:task' },
      task_checksum: 'sha256:checksum',
      agent_info: {
        name: 'claude-code',
        version: '2.1.199',
        model_info: { name: 'claude-haiku-4-5', provider: 'anthropic' },
      },
      agent_result: {
        n_input_tokens: 10,
        n_cache_tokens: 2,
        n_output_tokens: 5,
        cost_usd: 0.01,
      },
      verifier_result: { rewards: { reward: 1 } },
      exception_info: null,
      started_at: '2026-07-03T12:00:00.000Z',
      finished_at: '2026-07-03T12:00:30.000Z',
      agent_execution: {
        started_at: '2026-07-03T12:00:05.000Z',
        finished_at: '2026-07-03T12:00:20.000Z',
      },
      verifier: {
        started_at: '2026-07-03T12:00:21.000Z',
        finished_at: '2026-07-03T12:00:25.000Z',
      },
    })}\n`);

    const summary = summarizeJob(job, 'no-added-guidance');
    assert.equal(summary.mean_reward, 1);
    assert.equal(summary.success_count, 1);
    assert.equal(summary.exception_count, 0);
    assert.equal(summary.input_tokens, 10);
    assert.equal(summary.trials[0].wall_time_seconds, 30);
    assert.equal(summary.trials[0].agent_execution_seconds, 15);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('summarizes Codex token usage from raw event log when Harbor metrics are null', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-terminal-bench-codex-summary-'));
  const job = join(root, 'issue-70-live-no-added-guidance');
  const trial = join(job, 'regex-log__abc123');
  const agentDir = join(trial, 'agent');
  mkdirSync(agentDir, { recursive: true });

  try {
    writeFileSync(join(job, 'result.json'), `${JSON.stringify({
      n_total_trials: 1,
      stats: {
        n_completed_trials: 1,
        n_errored_trials: 0,
        evals: { codex: { metrics: [{ mean: 1 }] } },
      },
    })}\n`);
    writeFileSync(join(trial, 'result.json'), `${JSON.stringify({
      task_name: 'terminal-bench/regex-log',
      trial_name: 'regex-log__abc123',
      agent_info: {
        name: 'codex',
        version: '0.142.5',
        model_info: { name: 'gpt-5.5' },
      },
      agent_result: {
        n_input_tokens: null,
        n_cache_tokens: null,
        n_output_tokens: null,
        cost_usd: null,
      },
      verifier_result: { rewards: { reward: 1 } },
      exception_info: null,
    })}\n`);
    writeFileSync(join(agentDir, 'codex.txt'), [
      'diagnostic line',
      JSON.stringify({
        type: 'turn.completed',
        usage: {
          input_tokens: 41927,
          cached_input_tokens: 18944,
          output_tokens: 2017,
          reasoning_output_tokens: 1081,
        },
      }),
      '',
    ].join('\n'));

    const summary = summarizeJob(job, 'no-added-guidance');
    assert.equal(summary.input_tokens, 41927);
    assert.equal(summary.cache_tokens, 18944);
    assert.equal(summary.output_tokens, 2017);
    assert.equal(summary.reasoning_tokens, 1081);
    assert.equal(summary.trials[0].reasoning_tokens, 1081);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dry-run returns the exact paired commands without running Harbor', () => {
  const options = parseArgs([
    'run',
    '--run-id',
    'dry',
    '--agent',
    'oracle',
    '--dry-run',
  ]);

  const result = runComparison(options, {
    run: () => {
      throw new Error('harbor should not run');
    },
    mkdir: () => {},
    writeFile: () => {},
  });

  assert.equal(result.dry_run, true);
  assert.equal(result.commands.length, 2);
  assert.match(result.commands[0].command, /harbor run/);
  assert.match(commandLine('harbor', buildHarborArgs(options, { id: 'heb-guided', extraInstruction: true })), /--extra-instruction-path/);
});

test('wsl mode wraps Harbor in a bash command for Windows orchestration', () => {
  const options = parseArgs([
    'run',
    '--run-id',
    'dry',
    '--agent',
    'oracle',
    '--wsl',
  ]);

  const invocation = buildHarborInvocation(options, buildHarborArgs(options, { id: 'heb-guided', extraInstruction: true }));

  assert.equal(invocation.command, 'wsl.exe');
  assert.deepEqual(invocation.args.slice(0, 2), ['bash', '-lc']);
  assert.match(invocation.args[2], /harbor run/);
  assert.match(invocation.args[2], /--extra-instruction-path/);
});

test('wsl preflight reads credential presence from WSL without exposing values', () => {
  const options = parseArgs(['preflight', '--wsl']);
  const calls = [];
  const result = preflight(options, {
    env: {},
    fileExists: () => true,
    run: (command, args) => {
      calls.push([command, args]);
      if (command === 'wsl.exe' && args[2].includes('harbor --version')) {
        return { status: 0, stdout: '0.17.0\n' };
      }
      if (command === 'wsl.exe') {
        return { status: 0, stdout: JSON.stringify({ ANTHROPIC_API_KEY: '1' }) };
      }
      return { status: 1, stdout: '' };
    },
  });

  assert.equal(result.valid, true);
  assert.equal(calls[0][0], 'wsl.exe');
  assert.equal(result.harbor_version, '0.17.0');
});

test('summarizes both paired jobs into a comparison object', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-terminal-bench-comparison-'));
  const options = parseArgs([
    'summarize',
    '--jobs-dir',
    root,
    '--run-id',
    'paired',
    '--agent',
    'oracle',
  ]);

  try {
    for (const variant of ['no-added-guidance', 'heb-guided']) {
      const job = join(root, `paired-${variant}`);
      mkdirSync(job, { recursive: true });
      writeFileSync(join(job, 'config.json'), `${JSON.stringify({
        n_attempts: 2,
        timeout_multiplier: 0.35,
        n_concurrent_trials: 3,
        agents: [{ name: 'oracle', model_name: null }],
        datasets: [{
          name: 'terminal-bench/terminal-bench-2',
          task_names: ['terminal-bench/regex-log'],
        }],
        extra_instruction_paths: variant === 'heb-guided'
          ? ['test/fixtures/terminal-bench-comparison/heb-extra-instructions.md']
          : [],
      })}\n`);
      writeFileSync(join(job, 'result.json'), `${JSON.stringify({
        n_total_trials: 0,
        stats: { n_completed_trials: 0, n_errored_trials: 0, evals: {} },
      })}\n`);
    }

    const summary = summarizeComparison(options, '0.17.0');
    assert.equal(summary.schema_version, 'heb-terminal-bench-comparison.v1');
    assert.equal(summary.harbor_version, '0.17.0');
    assert.equal(summary.timeout_multiplier, 0.35);
    assert.equal(summary.n_concurrent, 3);
    assert.equal(summary.n_attempts, 2);
    assert.deepEqual(Object.keys(summary.comparison), ['no-added-guidance', 'heb-guided']);

    const encoded = JSON.stringify(summary);
    assert.equal(JSON.parse(encoded).dataset, 'terminal-bench/terminal-bench-2');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
