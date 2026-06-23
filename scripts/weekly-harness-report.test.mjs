import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAbsolute } from 'node:path';
import { buildReport, defaultOutputDir, renderMarkdown, runCheck } from './weekly-harness-report.mjs';

test('clean checks produce a non-problem report', () => {
  const report = buildReport({
    date: '2026-06-23',
    repository: 'rbudnar/harness-engineering-bootstrap',
    commit: 'abc123',
    runUrl: 'https://github.com/rbudnar/harness-engineering-bootstrap/actions/runs/1',
    checkResults: [
      check({ id: 'template-fitness', name: 'Template fitness' }),
      check({
        id: 'harness-doctor-json',
        name: 'Harness doctor',
        parseDoctor: true,
        stdout: JSON.stringify({ summary: { warningCount: 0 }, warnings: [] }),
      }),
    ],
  });

  assert.equal(report.summary.hasProblems, false);
  assert.equal(report.summary.failedCheckCount, 0);
  assert.equal(report.summary.doctorWarningCount, 0);
  assert.match(renderMarkdown(report), /Status: No problems detected/);
});

test('failed checks are reported as problems without throwing', () => {
  const report = buildReport({
    date: '2026-06-23',
    checkResults: [
      check({ id: 'template-fitness', name: 'Template fitness', exitCode: 1, stderr: 'fitness failed' }),
      check({
        id: 'harness-doctor-json',
        name: 'Harness doctor',
        parseDoctor: true,
        stdout: JSON.stringify({ summary: { warningCount: 0 }, warnings: [] }),
      }),
    ],
  });

  assert.equal(report.summary.hasProblems, true);
  assert.equal(report.summary.failedCheckCount, 1);
  assert.match(renderMarkdown(report), /fitness failed/);
});

test('doctor warnings are reported as problems even when the command exits zero', () => {
  const report = buildReport({
    date: '2026-06-23',
    checkResults: [
      check({
        id: 'harness-doctor-json',
        name: 'Harness doctor',
        parseDoctor: true,
        stdout: JSON.stringify({
          summary: { warningCount: 1 },
          warnings: [
            {
              code: 'stale-metadata',
              path: 'docs/repo-contracts/example.md',
              message: 'review_after is stale.',
            },
          ],
        }),
      }),
    ],
  });

  assert.equal(report.summary.hasProblems, true);
  assert.equal(report.summary.doctorWarningCount, 1);
  assert.match(renderMarkdown(report), /stale-metadata/);
});

test('runCheck records command output from an injected runner', () => {
  const result = runCheck(
    {
      id: 'example',
      name: 'Example',
      display: 'node example.mjs',
    },
    {
      repo: process.cwd(),
      runner: () => ({
        exitCode: 0,
        durationMs: 12,
        stdout: 'ok',
      }),
    },
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'ok');
  assert.equal(result.durationMs, 12);
});

test('signal-terminated checks fail closed', () => {
  const result = runCheck(
    {
      id: 'signal',
      name: 'Signal',
      display: 'node signal.mjs',
    },
    {
      repo: process.cwd(),
      runner: () => ({
        status: null,
        signal: 'SIGTERM',
        stdout: '',
        stderr: '',
      }),
    },
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.signal, 'SIGTERM');

  const report = buildReport({
    date: '2026-06-23',
    checkResults: [result],
  });
  assert.equal(report.summary.hasProblems, true);
  assert.match(renderMarkdown(report), /failed \(1\)/);
});

test('default output stays in repo only for GitHub Actions artifacts', () => {
  assert.equal(defaultOutputDir({ GITHUB_ACTIONS: 'true' }), '.harness');

  const localOutput = defaultOutputDir({});
  assert.equal(isAbsolute(localOutput), true);
  assert(!localOutput.endsWith('.harness'));
});

function check(options = {}) {
  return {
    id: options.id ?? 'check',
    name: options.name ?? 'Check',
    command: options.command ?? 'node check.mjs',
    exitCode: options.exitCode ?? 0,
    durationMs: options.durationMs ?? 1,
    stdout: options.stdout ?? '',
    stderr: options.stderr ?? '',
    parseDoctor: Boolean(options.parseDoctor),
  };
}
