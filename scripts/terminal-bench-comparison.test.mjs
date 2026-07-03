import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
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
  const guidancePath = guided[guided.indexOf('--extra-instruction-path') + 1];
  assert(isAbsolute(guidancePath));
  assert(guidancePath.endsWith(join('test', 'fixtures', 'terminal-bench-comparison', 'heb-extra-instructions.md')));
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

test('preflight validates the guidance file for run readiness', () => {
  const options = parseArgs(['preflight', '--agent', 'oracle', '--guidance-file', 'missing.md']);
  const result = preflight(options, {
    env: {},
    fileExists: () => false,
    run: () => ({ status: 0, stdout: '0.17.0\n' }),
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /guidance file not found:/);
});

test('preflight honors Claude forced OAuth before API-key fallbacks', () => {
  const options = parseArgs(['preflight', '--agent', 'claude-code']);
  const result = preflight(options, {
    env: { CLAUDE_FORCE_OAUTH: '1', ANTHROPIC_API_KEY: '1' },
    fileExists: (path) => path.includes('heb-extra-instructions.md'),
    run: () => ({ status: 0, stdout: '0.17.0\n' }),
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /CLAUDE_FORCE_OAUTH enabled/);
});

test('preflight accepts Codex subscription auth by explicit auth json path', () => {
  const options = parseArgs(['preflight', '--agent', 'codex', '--model', 'gpt-5.5']);
  const result = preflight(options, {
    env: { CODEX_AUTH_JSON_PATH: '/tmp/auth.json' },
    fileExists: (path) => path === '/tmp/auth.json' || path.includes('heb-extra-instructions.md'),
    run: () => ({ status: 0, stdout: '0.17.0\n' }),
  });

  assert.equal(result.valid, true);
});

test('preflight validates explicit Codex auth-json path before API-key fallback', () => {
  const options = parseArgs(['preflight', '--agent', 'codex', '--model', 'gpt-5.5']);
  const result = preflight(options, {
    env: { OPENAI_API_KEY: '1', CODEX_AUTH_JSON_PATH: '/missing/auth.json' },
    fileExists: (path) => path.includes('heb-extra-instructions.md'),
    run: () => ({ status: 0, stdout: '0.17.0\n' }),
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /CODEX_AUTH_JSON_PATH is set/);
});

test('wsl preflight accepts forwarded Codex auth json path presence', () => {
  const options = parseArgs(['preflight', '--wsl', '--agent', 'codex', '--model', 'gpt-5.5']);
  const result = preflight(options, {
    env: {},
    fileExists: (path) => path.includes('heb-extra-instructions.md'),
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

test('wsl preflight does not treat false Codex auth-json flag as enabled', () => {
  const options = parseArgs(['preflight', '--wsl', '--agent', 'codex', '--model', 'gpt-5.5']);
  const result = preflight(options, {
    env: {},
    fileExists: (path) => path.includes('heb-extra-instructions.md'),
    run: (command, args) => {
      if (command === 'wsl.exe' && args[2].includes('harbor --version')) {
        return { status: 0, stdout: '0.17.0\n' };
      }
      if (command === 'wsl.exe') {
        return { status: 0, stdout: JSON.stringify({ CODEX_FORCE_AUTH_JSON: '0', CODEX_AUTH_JSON_PRESENT: '1' }) };
      }
      return { status: 1, stdout: '' };
    },
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /codex requires OPENAI_API_KEY/);
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
    mkdir: () => {
      throw new Error('dry-run should not create directories');
    },
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

test('wsl mode normalizes Harbor path arguments', () => {
  const options = parseArgs([
    'run',
    '--run-id',
    'dry',
    '--agent',
    'oracle',
    '--jobs-dir',
    'C:\\Users\\Rbudn\\heb-runs',
    '--guidance-file',
    '.\\test\\fixtures\\terminal-bench-comparison\\heb-extra-instructions.md',
    '--wsl',
  ]);

  const invocation = buildHarborInvocation(options, buildHarborArgs(options, { id: 'heb-guided', extraInstruction: true }));

  assert.match(invocation.args[2], /-o \/mnt\/c\/Users\/Rbudn\/heb-runs/);
  assert.match(invocation.args[2], /--extra-instruction-path \.\/test\/fixtures\/terminal-bench-comparison\/heb-extra-instructions\.md/);
  assert.doesNotMatch(invocation.args[2], /C:\\Users/);
});

test('wsl mode rejects WSL-only absolute output paths', () => {
  assert.throws(
    () => parseArgs(['run', '--agent', 'oracle', '--wsl', '--jobs-dir', '/tmp/heb-runs']),
    /--jobs-dir cannot be a WSL-only absolute path/,
  );
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

test('summarize accepts model-backed agents without restating model flag', () => {
  const options = parseArgs(['summarize', '--agent', 'codex', '--run-id', 'paired']);

  assert.equal(options.model, null);
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
        finished_at: '2026-07-03T12:01:00.000Z',
        n_total_trials: 0,
        stats: { n_completed_trials: 0, n_errored_trials: 0, n_running_trials: 0, n_pending_trials: 0, n_cancelled_trials: 0, evals: {} },
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

test('summarize rejects mismatched paired Harbor configs', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-terminal-bench-config-mismatch-'));
  const options = parseArgs([
    'summarize',
    '--jobs-dir',
    root,
    '--run-id',
    'paired',
    '--agent',
    'codex',
  ]);

  try {
    for (const [variant, model] of [['no-added-guidance', 'gpt-5.5'], ['heb-guided', 'gpt-5']]) {
      const job = join(root, `paired-${variant}`);
      mkdirSync(job, { recursive: true });
      writeFileSync(join(job, 'config.json'), `${JSON.stringify({
        n_attempts: 1,
        timeout_multiplier: 1,
        n_concurrent_trials: 1,
        agents: [{ name: 'codex', model_name: model, kwargs: { reasoning_effort: 'medium' } }],
        datasets: [{
          name: 'terminal-bench/terminal-bench-2',
          ref: 'sha256:dataset',
          task_names: ['terminal-bench/regex-log'],
        }],
        extra_instruction_paths: variant === 'heb-guided'
          ? ['test/fixtures/terminal-bench-comparison/heb-extra-instructions.md']
          : [],
      })}\n`);
      writeFileSync(join(job, 'result.json'), `${JSON.stringify({
        finished_at: '2026-07-03T12:01:00.000Z',
        n_total_trials: 0,
        stats: { n_completed_trials: 0, n_errored_trials: 0, n_running_trials: 0, n_pending_trials: 0, n_cancelled_trials: 0, evals: {} },
      })}\n`);
    }

    assert.throws(
      () => summarizeComparison(options, '0.17.0'),
      /paired Harbor configs differ for model/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('summarize rejects incomplete paired Harbor jobs', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-terminal-bench-missing-pair-'));
  const options = parseArgs([
    'summarize',
    '--jobs-dir',
    root,
    '--run-id',
    'paired',
    '--agent',
    'oracle',
  ]);
  const job = join(root, 'paired-no-added-guidance');
  mkdirSync(job, { recursive: true });

  try {
    writeFileSync(join(job, 'config.json'), `${JSON.stringify({
      n_attempts: 1,
      timeout_multiplier: 1,
      n_concurrent_trials: 1,
      agents: [{ name: 'oracle', model_name: null, kwargs: {} }],
      datasets: [{
        name: 'terminal-bench/terminal-bench-2',
        ref: 'sha256:dataset',
        task_names: ['terminal-bench/regex-log'],
      }],
      extra_instruction_paths: [],
    })}\n`);
    writeFileSync(join(job, 'result.json'), `${JSON.stringify({
      finished_at: '2026-07-03T12:01:00.000Z',
      n_total_trials: 0,
      stats: { n_completed_trials: 0, n_errored_trials: 0, n_running_trials: 0, n_pending_trials: 0, n_cancelled_trials: 0, evals: {} },
    })}\n`);

    assert.throws(
      () => summarizeComparison(options, '0.17.0'),
      /paired Harbor result missing for variants: heb-guided/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('summarize rejects unfinished Harbor result files', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-terminal-bench-unfinished-'));
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
        timeout_multiplier: 1,
        n_concurrent_trials: 1,
        agents: [{ name: 'oracle', model_name: null, kwargs: {} }],
        datasets: [{
          name: 'terminal-bench/terminal-bench-2',
          ref: 'sha256:dataset',
          task_names: ['terminal-bench/regex-log'],
        }],
        extra_instruction_paths: variant === 'heb-guided'
          ? ['test/fixtures/terminal-bench-comparison/heb-extra-instructions.md']
          : [],
      })}\n`);
      writeFileSync(join(job, 'result.json'), `${JSON.stringify({
        finished_at: variant === 'no-added-guidance' ? '2026-07-03T12:01:00.000Z' : null,
        n_total_trials: 2,
        stats: {
          n_completed_trials: variant === 'no-added-guidance' ? 2 : 1,
          n_errored_trials: 0,
          n_running_trials: variant === 'no-added-guidance' ? 0 : 1,
          n_pending_trials: 0,
          n_cancelled_trials: 0,
          evals: {},
        },
      })}\n`);
    }

    assert.throws(
      () => summarizeComparison(options, '0.17.0'),
      /paired Harbor result incomplete for variants: heb-guided/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('summarize rejects swapped guidance treatment configs', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-terminal-bench-guidance-mismatch-'));
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
    for (const [variant, extraInstructionPaths] of [
      ['no-added-guidance', ['test/fixtures/terminal-bench-comparison/heb-extra-instructions.md']],
      ['heb-guided', []],
    ]) {
      const job = join(root, `paired-${variant}`);
      mkdirSync(job, { recursive: true });
      writeFileSync(join(job, 'config.json'), `${JSON.stringify({
        n_attempts: 1,
        timeout_multiplier: 1,
        n_concurrent_trials: 1,
        agents: [{ name: 'oracle', model_name: null, kwargs: {} }],
        datasets: [{
          name: 'terminal-bench/terminal-bench-2',
          ref: 'sha256:dataset',
          task_names: ['terminal-bench/regex-log'],
        }],
        extra_instruction_paths: extraInstructionPaths,
      })}\n`);
      writeFileSync(join(job, 'result.json'), `${JSON.stringify({
        finished_at: '2026-07-03T12:01:00.000Z',
        n_total_trials: 0,
        stats: { n_completed_trials: 0, n_errored_trials: 0, n_running_trials: 0, n_pending_trials: 0, n_cancelled_trials: 0, evals: {} },
      })}\n`);
    }

    assert.throws(
      () => summarizeComparison(options, '0.17.0'),
      /no-added-guidance Harbor config unexpectedly has extra instructions/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('redacts OpenAI credentials from exception summaries', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-terminal-bench-redaction-'));
  const job = join(root, 'issue-70-live-no-added-guidance');
  const trial = join(job, 'regex-log__abc123');
  mkdirSync(trial, { recursive: true });

  try {
    writeFileSync(join(job, 'result.json'), `${JSON.stringify({
      n_total_trials: 1,
      stats: { n_completed_trials: 0, n_errored_trials: 1, evals: {} },
    })}\n`);
    writeFileSync(join(trial, 'result.json'), `${JSON.stringify({
      task_name: 'terminal-bench/regex-log',
      trial_name: 'regex-log__abc123',
      agent_info: {
        name: 'codex',
        version: '0.142.5',
        model_info: { name: 'gpt-5.5' },
      },
      verifier_result: { rewards: { reward: 0 } },
      exception_info: {
        exception_type: 'RuntimeError',
        exception_message: 'OPENAI_API_KEY=sk-proj-secretvalue api_key=sk-secretvalue access_token=oauth-access refresh_token=oauth-refresh id_token=oauth-id Bearer abc/def==',
      },
    })}\n`);

    const summary = summarizeJob(job, 'no-added-guidance');
    const message = summary.trials[0].exception_message;
    assert.match(message, /OPENAI_API_KEY=\[REDACTED\]/);
    assert.match(message, /api_key=\[REDACTED\]/);
    assert.match(message, /access_token=\[REDACTED\]/);
    assert.match(message, /refresh_token=\[REDACTED\]/);
    assert.match(message, /id_token=\[REDACTED\]/);
    assert.match(message, /Bearer \[REDACTED\]/);
    assert.doesNotMatch(message, /sk-proj-secretvalue|sk-secretvalue|oauth-access|oauth-refresh|oauth-id|abc\/def==/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
