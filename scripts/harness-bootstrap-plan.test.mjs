import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildBootstrapPlan,
  parseArgs,
  renderMarkdownPlan,
  repoRoot,
  surveyRepository,
} from './harness-bootstrap-plan.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(testDir, '..', 'test', 'fixtures', 'bootstrap-planner');

test('surveys a small JavaScript repo and renders the review-ready plan contract', () => {
  const fixture = resolve(fixturesRoot, 'basic-js');
  const survey = surveyRepository(fixture);
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const markdown = renderMarkdownPlan(plan);

  assert.deepEqual(survey.instructionFiles, ['AGENTS.md']);
  assert.deepEqual(
    survey.commands.map((command) => command.command),
    ['npm ci\nnpm test', 'npm run build', 'npm run lint', 'npm test'],
  );
  assert.equal(plan.requiredCore.find((item) => item.id === 'thin-agent-entrypoint').status, 'present');
  assert.match(
    plan.requiredCore.find((item) => item.id === 'harness-validation').action,
    /canonical quality gate and CI or equivalent automation/,
  );
  assert.match(validationStepsText(plan), /wired into the repo's canonical quality gate and CI or equivalent automation/);
  assert.match(markdown, /## Review And Handoff Contract/);
  assert.match(markdown, /Planner/);
  assert.match(markdown, /Explicitly Rejected Modules/);
  assert(plan.rejectedModules.some((module) => (
    module.id === 'health-report'
    && module.rationale === 'Fewer than three health-report control signals were detected.'
  )));
  assert.match(markdown, /status: draft/);
  assert.match(markdown, /supersedes: none/);
  assert.match(markdown, /superseded_by: none/);
  assert(!plan.triggeredModules.some((module) => module.id === 'pr-workflow-metrics'));
  assert(plan.rejectedModules.some((module) => module.id === 'pr-workflow-metrics'));
});

test('counts automated harness-doctor as existing harness validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-validation-control-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node scripts/harness-doctor.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.harnessControls.includes('scripts/harness-doctor.mjs'));
    assert(survey.commands.some((command) => command.command === 'node scripts/harness-doctor.mjs'));
    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('scripts/harness-doctor.mjs'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts PowerShell file doctor commands as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-pwsh-validation-control-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.ps1'), 'Write-Output "ok"\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: windows-latest',
      '    steps:',
      '      - run: pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/harness-doctor.ps1',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('scripts/harness-doctor.ps1'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/harness-doctor.ps1'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not count bare doctor commands when the control lives under scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-bare-mismatch-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node harness-doctor.mjs',
      '      - run: harness-doctor',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');
    const typoRun = survey.ci.runCommands.find((run) => run.command === 'node harness-doctor.mjs');
    const bareRun = survey.ci.runCommands.find((run) => run.command === 'harness-doctor');

    assert.equal(typoRun.safe, false);
    assert.equal(bareRun.safe, false);
    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not count no-op harness-doctor help commands as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-noop-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node scripts/harness-doctor.mjs --help',
      '      - run: harness-doctor --version',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');
    const validationCommands = plan.validationSteps
      .map((step) => step.command)
      .filter(Boolean);

    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
    assert(!validationCommands.includes('node scripts/harness-doctor.mjs --help'));
    assert(!validationCommands.includes('harness-doctor --version'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not count package wrappers that forward no-op doctor args as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-forwarded-noop-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        doctor: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run doctor -- --help',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');
    const noOpRun = survey.ci.runCommands.find((run) => run.command === 'npm run doctor -- --help');
    const validationCommands = plan.validationSteps
      .map((step) => step.command)
      .filter(Boolean);

    assert.equal(noOpRun.safe, false);
    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
    assert(!validationCommands.includes('npm run doctor -- --help'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not emit stale package or make doctor wrappers without existing controls', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-stale-wrapper-validation-'));
  try {
    mkdirSync(resolve(tempRoot), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        doctor: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, 'Makefile'), [
      'doctor:',
      '\tnode scripts/harness-doctor.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');
    const commands = survey.commands.map((command) => command.command);

    assert.equal(harnessValidation.status, 'missing');
    assert(!commands.includes('npm run doctor'));
    assert(!commands.includes('make doctor'));
    assert(!validationStepsText(plan).includes('npm run doctor'));
    assert(!validationStepsText(plan).includes('make doctor'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('treats an unwired harness-doctor as partial validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-unwired-doctor-validation-'));
  try {
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
    assert.match(harnessValidation.action, /Wire the existing harness doctor or validator/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not credit root package doctor after cd into a package directory', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-cd-root-wrapper-mismatch-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'app'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        doctor: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, 'packages', 'app', 'package.json'), JSON.stringify({
      scripts: {
        test: 'echo ok',
      },
    }));
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: |',
      '          cd packages/app',
      '          npm run doctor',
      '      - working-directory: packages/app',
      '        run: npm run doctor',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');
    const doctorRuns = survey.ci.runCommands.filter((run) => run.command.includes('npm run doctor'));

    assert.equal(doctorRuns.length, 2);
    assert(doctorRuns.every((run) => run.safe === false));
    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolves cd before matching package-local harness-doctor controls', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-cd-package-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'app', 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'packages', 'app', 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: |',
      '          cd packages/app',
      '          node scripts/harness-doctor.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.harnessControls.includes('packages/app/scripts/harness-doctor.mjs'));
    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('packages/app/scripts/harness-doctor.mjs'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts workflow working-directory doctor commands as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-working-directory-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'app', 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'packages', 'app', 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - working-directory: packages/app',
      '        run: node scripts/harness-doctor.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');
    const doctorRun = survey.ci.runCommands.find((run) => run.command === 'node scripts/harness-doctor.mjs');

    assert.equal(doctorRun.safe, false);
    assert.match(doctorRun.inspectOnlyReason, /working-directory/);
    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('packages/app/scripts/harness-doctor.mjs'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: node scripts/harness-doctor.mjs'));
    assert(!validationStepsText(plan).includes('node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not count unsafe working-directory package wrappers as doctor automation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-working-directory-unsafe-wrapper-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'app', 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'packages', 'app', 'package.json'), JSON.stringify({
      scripts: {
        quality: 'node scripts/harness-doctor.mjs && kubectl apply -f k8s/prod.yaml',
      },
    }));
    writeFileSync(resolve(tempRoot, 'packages', 'app', 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - working-directory: packages/app',
      '        run: npm run quality',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');
    const qualityRun = survey.ci.runCommands.find((run) => run.command === 'npm run quality');

    assert.equal(qualityRun.safe, false);
    assert(qualityRun.packageScriptReason);
    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['packages/app/scripts/harness-doctor.mjs']);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not credit doctor paths that escape the repository from a package directory', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-escaping-path-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'app'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - working-directory: packages/app',
      '        run: node ../../../scripts/harness-doctor.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');
    const doctorRun = survey.ci.runCommands.find((run) => run.command === 'node ../../../scripts/harness-doctor.mjs');

    assert.equal(doctorRun.harnessValidationEvidence, undefined);
    assert.equal(doctorRun.harnessValidationSafe, undefined);
    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not credit a root harness-doctor after cd into a package directory', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-cd-root-mismatch-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'app'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: |',
      '          cd packages/app',
      '          node scripts/harness-doctor.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts workspace-selected package doctor scripts as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-workspace-wrapper-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'app', 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      private: true,
      workspaces: ['packages/*'],
    }));
    writeFileSync(resolve(tempRoot, 'packages', 'app', 'package.json'), JSON.stringify({
      name: 'app',
      scripts: {
        doctor: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, 'packages', 'app', 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run doctor --workspace app',
      '      - run: npm run doctor --workspace app --if-present',
      '      - run: npm run doctor -w app',
      '      - run: pnpm --filter app run doctor',
      '      - run: pnpm -F app run doctor',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('packages/app/scripts/harness-doctor.mjs'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run doctor --workspace app -> node scripts/harness-doctor.mjs'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run doctor --workspace app --if-present -> node scripts/harness-doctor.mjs'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run doctor -w app -> node scripts/harness-doctor.mjs'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: pnpm --filter app run doctor -> node scripts/harness-doctor.mjs'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: pnpm -F app run doctor -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not count stale automation commands that do not match an existing control', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-stale-automation-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'template-fitness.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node scripts/harness-doctor.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');
    const staleRun = survey.ci.runCommands.find((run) => run.command === 'node scripts/harness-doctor.mjs');

    assert.equal(staleRun.safe, false);
    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/template-fitness.mjs']);
    assert(!validationStepsText(plan).includes('node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts CI quality wrappers that run harness-doctor as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-wrapper-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        quality: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run quality',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.commands.some((command) => (
      command.command === 'npm run quality'
      && command.scriptBody === 'node scripts/harness-doctor.mjs'
    )));
    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run quality -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts CI package chains that delegate to package doctor scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-ci-package-chain-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        ci: 'npm run doctor',
        doctor: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run ci',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.ci.runCommands.some((run) => run.command === 'npm run ci' && run.safe));
    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run ci -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts flagged CI package wrappers that run harness-doctor', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-flagged-package-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        quality: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run quality --if-present',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run quality --if-present -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts CI package doctor scripts that run harness-doctor as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-package-script-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        doctor: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run doctor',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.commands.some((command) => (
      command.command === 'npm run doctor'
      && command.scriptBody === 'node scripts/harness-doctor.mjs'
    )));
    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run doctor -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps piped doctor CI commands inspect-only', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-piped-unsafe-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node scripts/harness-doctor.mjs | bash deploy.sh',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const run = survey.ci.runCommands.find((command) => command.source === '.github/workflows/quality.yml');
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(run.safe, false);
    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
    assert(!plan.validationSteps.some((step) => step.command?.includes('bash deploy.sh')));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts multiline CI quality wrappers that run harness-doctor as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-block-wrapper-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        quality: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: |',
      '          npm ci',
      '          npm run quality',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run quality -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts nested package quality wrappers that delegate to package doctor scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-nested-package-wrapper-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        quality: 'npm run doctor',
        doctor: 'node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run quality',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.commands.some((command) => (
      command.command === 'npm run doctor'
      && command.scriptBody === 'node scripts/harness-doctor.mjs'
    )));
    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run quality -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts wrapped quality scripts that run doctor tests before harness-doctor', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-mixed-wrapper-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.test.mjs'), 'console.log("test");\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        quality: 'node --test scripts/harness-doctor.test.mjs && node scripts/harness-doctor.mjs',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run quality',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: npm run quality -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not count harness-doctor tests as automated harness validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-test-only-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.test.mjs'), 'console.log("test");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node --test scripts/harness-doctor.test.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not count package quality scripts that only mention harness-doctor', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-echo-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        quality: 'echo "run harness-doctor manually"',
      },
    }, null, 2));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run quality',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.commands.some((command) => command.command === 'npm run quality'));
    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps mixed doctor and mutating CI blocks inspect-only', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-mixed-unsafe-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: |',
      '          node scripts/harness-doctor.mjs',
      '          kubectl apply -f k8s/prod.yaml',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const run = survey.ci.runCommands.find((command) => command.source === '.github/workflows/quality.yml');
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(run.safe, false);
    assert.match(run.inspectOnlyReason, /not a known-safe validation command|may mutate external state/);
    assert.equal(harnessValidation.status, 'partial');
    assert.deepEqual(harnessValidation.evidence, ['scripts/harness-doctor.mjs']);
    assert(!plan.validationSteps.some((step) => step.command?.includes('kubectl apply')));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not count workflow filenames as harness validators without scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-workflow-without-doctor-script-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'template-fitness.yml'), [
      'name: Template Fitness',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node scripts/harness-doctor.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.harnessControls.includes('.github/workflows/template-fitness.yml'));
    assert.equal(harnessValidation.status, 'missing');
    assert.deepEqual(harnessValidation.evidence, []);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not count non-runnable harness doctor docs or specs as validators', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-non-runnable-validation-'));
  try {
    mkdirSync(resolve(tempRoot, 'docs'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'tests'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'docs', 'README.md'), '# Docs\n');
    writeFileSync(resolve(tempRoot, 'docs', 'harness-doctor.md'), '# Manual doctor notes\n');
    writeFileSync(resolve(tempRoot, 'tests', 'harness-doctor.spec.mjs'), 'console.log("spec only");\n');

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.harnessControls.includes('docs/harness-doctor.md'));
    assert(survey.harnessControls.includes('tests/harness-doctor.spec.mjs'));
    assert.equal(harnessValidation.status, 'missing');
    assert.deepEqual(harnessValidation.evidence, []);
    assert.equal(survey.bootstrapState.status, 'fresh');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not treat substring harness-doctor wrapper names as safe validation commands', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-substring-wrapper-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'my-harness-doctor-wrapper.mjs'), 'console.log("wrapper");\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node scripts/my-harness-doctor-wrapper.mjs',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const wrapperRun = survey.ci.runCommands.find((run) => run.command === 'node scripts/my-harness-doctor-wrapper.mjs');
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert.equal(wrapperRun.safe, false);
    assert(!survey.commands.some((command) => command.command === 'node scripts/my-harness-doctor-wrapper.mjs'));
    assert.equal(harnessValidation.status, 'missing');
    assert.deepEqual(harnessValidation.evidence, []);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts CI Make quality targets that run harness-doctor as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-make-wrapper-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'Makefile'), [
      'quality:',
      '\tnode scripts/harness-doctor.mjs',
      '',
    ].join('\n'));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: make quality',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.commands.some((command) => (
      command.command === 'make quality'
      && command.scriptBody === 'node scripts/harness-doctor.mjs'
    )));
    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: make quality -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('counts CI Make doctor targets that run harness-doctor as automated validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-make-target-validation-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');
    writeFileSync(resolve(tempRoot, 'Makefile'), [
      'doctor:',
      '\tnode scripts/harness-doctor.mjs',
      '',
      'harness-doctor:',
      '\tnode scripts/harness-doctor.mjs',
      '',
    ].join('\n'));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'quality.yml'), [
      'name: Quality',
      'on: [pull_request]',
      'jobs:',
      '  check:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: make doctor',
      '      - run: make harness-doctor',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });
    const harnessValidation = plan.requiredCore.find((item) => item.id === 'harness-validation');

    assert(survey.commands.some((command) => (
      command.command === 'make doctor'
      && command.scriptBody === 'node scripts/harness-doctor.mjs'
    )));
    assert(survey.commands.some((command) => (
      command.command === 'make harness-doctor'
      && command.scriptBody === 'node scripts/harness-doctor.mjs'
    )));
    assert.equal(harnessValidation.status, 'present');
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: make doctor -> node scripts/harness-doctor.mjs'));
    assert(harnessValidation.evidence.includes('.github/workflows/quality.yml: make harness-doctor -> node scripts/harness-doctor.mjs'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('uses doctor-based harness evidence for update-mode detection', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-doctor-bootstrap-state-'));
  try {
    mkdirSync(resolve(tempRoot, 'docs'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'AGENTS.md'), '# Agent Instructions\n');
    writeFileSync(resolve(tempRoot, 'docs', 'README.md'), '# Docs\n');
    writeFileSync(resolve(tempRoot, 'scripts', 'harness-doctor.mjs'), 'console.log("ok");\n');

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-06-11' });

    assert.equal(survey.bootstrapState.status, 'bootstrapped');
    assert(survey.bootstrapState.evidence.includes('harness validation'));
    assert.equal(plan.operation, 'update');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('triggers contracts and runtime safety only when fixture evidence exists', () => {
  const fixture = resolve(fixturesRoot, 'data-service');
  const survey = surveyRepository(fixture);
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const triggeredIds = plan.triggeredModules.map((module) => module.id).sort();
  const rejectedIds = plan.rejectedModules.map((module) => module.id).sort();

  assert(triggeredIds.includes('data-contracts'));
  assert(triggeredIds.includes('internal-data-store-docs'));
  assert(triggeredIds.includes('runtime-safety'));
  assert(triggeredIds.includes('repo-contracts'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'k8s/service.yaml'));
  assert(rejectedIds.includes('url-context-map'));
  assert(plan.openQuestions.some((question) => question.includes('data/API/schema dependency')));
});

test('keeps unsafe CI run steps inspect-only instead of validation commands', () => {
  const fixture = resolve(fixturesRoot, 'unsafe-ci');
  const survey = surveyRepository(fixture);
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const markdown = renderMarkdownPlan(plan);
  const validationText = validationStepsText(plan);

  assert(survey.ci.runCommands.some((command) => command.command === 'terraform apply -auto-approve' && !command.safe));
  assert(survey.ci.runCommands.some((command) => command.command === 'npm ci && npm test && npm run deploy' && !command.safe));
  assert(!survey.commands.some((command) => command.command.includes('terraform apply')));
  assert(!survey.commands.some((command) => command.command.includes('npm run deploy')));
  assert(!survey.commands.some((command) => command.command.includes('build:deploy')));
  assert(survey.commands.some((command) => command.command === 'npm run build'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  assert(markdown.includes('CI command may mutate external state'));
  assert(!validationText.includes('Run detected validation candidate from .github/workflows/deploy.yml'));
  assert(validationText.includes('Inspect CI step from .github/workflows/deploy.yml'));
});

test('keeps harmless shell preludes in validation commands', () => {
  const fixture = resolve(fixturesRoot, 'ci-harmless-prelude');
  const survey = surveyRepository(fixture);

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'set -e\npython -m pytest'
    && run.safe
  )));
  assert(survey.commands.some((run) => run.command === 'set -e\npython -m pytest'));
});

test('triggers PR metrics only from review-marker evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'pr-metrics-evidence'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.prWorkflowMetricHints.some((hint) => hint.path === '.github/PULL_REQUEST_TEMPLATE.md'));
  assert(plan.triggeredModules.some((module) => module.id === 'pr-workflow-metrics'));
});

test('does not trigger PR metrics from ordinary review prose', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'plain-pr-template'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert.equal(survey.prWorkflowMetricHints.length, 0);
  assert(!plan.triggeredModules.some((module) => module.id === 'pr-workflow-metrics'));
});

test('does not treat website app directories as URL context maps', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-website-app-'));
  try {
    mkdirSync(resolve(tempRoot, 'website', 'src'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'website', 'src', 'App.js'), 'export default function App() { return null; }\n');

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.urlMapHints.some((hint) => hint.path.startsWith('website/')));
    assert(plan.rejectedModules.some((module) => module.id === 'url-context-map'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('uses conservative data heuristics for root schemas, migrations, and source models', () => {
  const rootSchema = surveyRepository(resolve(fixturesRoot, 'root-schema'));
  const rootPlan = buildBootstrapPlan(rootSchema, { date: '2026-05-28' });

  assert(rootSchema.dataHints.some((hint) => hint.path === 'openapi.yaml'));
  assert(rootSchema.internalDataStoreHints.some((hint) => hint.path === 'migrations/001_init.sql'));
  assert(rootPlan.triggeredModules.some((module) => module.id === 'data-contracts'));
  assert(rootPlan.triggeredModules.some((module) => module.id === 'internal-data-store-docs'));

  const sourceModels = surveyRepository(resolve(fixturesRoot, 'source-models'));
  const sourcePlan = buildBootstrapPlan(sourceModels, { date: '2026-05-28' });

  assert.equal(sourceModels.dataHints.length, 0);
  assert(sourcePlan.rejectedModules.some((module) => module.id === 'data-contracts'));
});

test('screens unsafe package bodies and top-level generated/runtime surfaces', () => {
  const unsafePackage = surveyRepository(resolve(fixturesRoot, 'unsafe-package-script'));
  const unsafePlan = buildBootstrapPlan(unsafePackage, { date: '2026-05-28' });

  assert(!unsafePackage.commands.some((command) => command.command === 'npm run build'));
  assert(!unsafePackage.commands.some((command) => command.command === 'npm run format'));
  assert(!unsafePackage.commands.some((command) => command.command === 'npm run check'));
  assert(unsafePackage.commands.some((command) => command.command === 'npm run format:check'));
  assert(unsafePackage.ci.runCommands.some((command) => command.command === 'npm run build' && !command.safe));
  assert(unsafePackage.ci.runCommands.some((command) => command.command === 'npm run check' && !command.safe));
  assert(!validationStepsText(unsafePlan).includes('npm run build'));
  assert(!validationStepsText(unsafePlan).includes('npm run check'));

  const nestedSurfaces = surveyRepository(resolve(fixturesRoot, 'nested-surfaces'));
  const nestedPlan = buildBootstrapPlan(nestedSurfaces, { date: '2026-05-28' });

  assert(nestedSurfaces.runtimeSafetyHints.some((hint) => hint.path === 'services/api/Dockerfile'));
  assert(nestedSurfaces.repoDependencyHints.some((hint) => hint.path === 'generated/client.ts'));
  assert(nestedSurfaces.repoDependencyHints.some((hint) => hint.path === 'vendor-contracts/schema.json'));
  assert(nestedPlan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  assert(nestedPlan.triggeredModules.some((module) => module.id === 'repo-contracts'));
});

test('detects modern Compose files as runtime surfaces', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'compose-file'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'compose.yaml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('honors packageManager declarations without lockfiles', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'declared-package-manager'));
  const commands = survey.commands.map((command) => command.command);

  assert.equal(survey.packageManager, 'pnpm');
  assert(commands.includes('pnpm test'));
  assert(commands.includes('pnpm run check'));
  assert(!commands.some((command) => command.startsWith('npm ')));
});

test('infers pnpm from workspace metadata before defaulting to npm', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-pnpm-workspace-manager-'));
  try {
    mkdirSync(resolve(tempRoot, 'packages', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({ private: true }));
    writeFileSync(resolve(tempRoot, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    writeFileSync(resolve(tempRoot, 'packages', 'api', 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const commands = survey.commands.map((command) => command.command);

    assert.equal(survey.packageManager, 'pnpm');
    assert(commands.includes('pnpm --dir packages/api test'));
    assert(!commands.includes('npm --prefix packages/api test'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('inherits pnpm from nested workspace metadata', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-nested-pnpm-workspace-'));
  try {
    mkdirSync(resolve(tempRoot, 'tools', 'pkg'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({ private: true }));
    writeFileSync(resolve(tempRoot, 'tools', 'pnpm-workspace.yaml'), 'packages:\n  - pkg\n');
    writeFileSync(resolve(tempRoot, 'tools', 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test',
      },
    }));
    writeFileSync(resolve(tempRoot, 'tools', 'pkg', 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const commands = survey.commands.map((command) => command.command);

    assert.equal(survey.packageManager, 'npm');
    assert(commands.includes('pnpm --dir tools test'));
    assert(commands.includes('pnpm --dir tools/pkg test'));
    assert(!commands.includes('npm --prefix tools test'));
    assert(!commands.includes('npm --prefix tools/pkg test'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('inherits nested package manager declarations and locks', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-nested-manager-metadata-'));
  try {
    mkdirSync(resolve(tempRoot, 'tools', 'pkg'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'apps', 'web'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({ private: true }));
    writeFileSync(resolve(tempRoot, 'tools', 'package.json'), JSON.stringify({ packageManager: 'yarn@4.0.0' }));
    writeFileSync(resolve(tempRoot, 'tools', 'pkg', 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test',
      },
    }));
    writeFileSync(resolve(tempRoot, 'apps', 'bun.lockb'), '');
    writeFileSync(resolve(tempRoot, 'apps', 'web', 'package.json'), JSON.stringify({
      scripts: {
        build: 'node --test',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const commands = survey.commands.map((command) => command.command);

    assert.equal(survey.packageManager, 'npm');
    assert(commands.includes('yarn --cwd tools/pkg test'));
    assert(commands.includes('bun --cwd apps/web run build'));
    assert(!commands.includes('npm --prefix tools/pkg test'));
    assert(!commands.includes('npm --prefix apps/web run build'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('honors nested npm lockfiles under non-npm roots', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-nested-npm-lock-'));
  try {
    mkdirSync(resolve(tempRoot, 'tools', 'app'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({ private: true }));
    writeFileSync(resolve(tempRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    writeFileSync(resolve(tempRoot, 'tools', 'app', 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test',
      },
    }));
    writeFileSync(resolve(tempRoot, 'tools', 'app', 'package-lock.json'), '{}');

    const survey = surveyRepository(tempRoot);
    const commands = survey.commands.map((command) => command.command);

    assert.equal(survey.packageManager, 'pnpm');
    assert(commands.includes('npm --prefix tools/app test'));
    assert(!commands.includes('pnpm --dir tools/app test'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('uses runnable scoped Yarn script commands', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-yarn-cwd-run-'));
  try {
    mkdirSync(resolve(tempRoot, 'packages', 'api'), { recursive: true });
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({ private: true }));
    writeFileSync(resolve(tempRoot, 'yarn.lock'), '');
    writeFileSync(resolve(tempRoot, 'packages', 'api', 'package.json'), JSON.stringify({
      scripts: {
        check: 'tsc --noEmit',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'jobs:',
      '  test:',
      '    steps:',
      '      - run: yarn --cwd packages/api run check',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);

    assert(survey.commands.some((run) => run.command === 'yarn --cwd packages/api run check'));
    assert(!survey.commands.some((run) => run.command === 'yarn --cwd packages/api check'));
    assert(survey.ci.runCommands.some((run) => run.command === 'yarn --cwd packages/api run check' && run.safe));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('includes hyphenated validation package scripts after safety screening', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'hyphenated-validation-scripts'));
  const commands = survey.commands.map((command) => command.command);

  assert(commands.includes('npm run test-ci'));
  assert(commands.includes('npm run type-check'));
  assert(!commands.includes('npm run lint-fix'));
  assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
});

test('includes dotted validation package scripts after safety screening', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-dotted-validation-scripts-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        'test.unit': 'node --test',
        'build.prod': 'node --test',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const commands = survey.commands.map((command) => command.command);

    assert(commands.includes('npm run test.unit'));
    assert(commands.includes('npm run build.prod'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('json CLI output is reusable by the future scaffolder surface', () => {
  const fixture = resolve(fixturesRoot, 'basic-js');
  const output = execFileSync(
    process.execPath,
    ['scripts/harness-bootstrap-plan.mjs', '--repo', fixture, '--json', '--date', '2026-05-28'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const plan = JSON.parse(output);

  assert.equal(plan.kind, 'harness-bootstrap-plan');
  assert.equal(plan.planArtifact.created, '2026-05-28');
  assert.equal(plan.survey.repoName, 'basic-js');
  assert(plan.requiredCore.some((item) => item.id === 'quality-gate'));
  assert(plan.validationSteps.some((step) => (
    step.text?.includes('future runs do not depend on human memory')
  )));
  assert(plan.reviewContract.some((item) => item.role === 'Reviewer'));
});

test('renders reusable commands for Windows paths and quoted CI arguments', () => {
  const quotedCi = surveyRepository(resolve(fixturesRoot, 'quoted-ci'));
  const quotedCommand = quotedCi.ci.runCommands.find((command) => command.source === '.github/workflows/ci.yml');
  assert.equal(quotedCommand.command, 'npm run test -- --grep "foo"');
  assert(quotedCi.commands.some((command) => command.command === 'npm run test -- --grep "foo"'));

  const basicSurvey = surveyRepository(resolve(fixturesRoot, 'basic-js'));
  const plan = buildBootstrapPlan(
    { ...basicSurvey, repoPath: 'C:\\Users\\Example Repo\\project' },
    { date: '2026-05-28' },
  );

  assert.match(plan.planArtifact.validationCommand, /--repo "C:\\Users\\Example Repo\\project"/);
  assert.match(plan.planArtifact.validationCommand, /node /);
  assert.match(plan.planArtifact.validationCommand, /scripts[\\/]harness-bootstrap-plan\.mjs/);
  assert.match(plan.planArtifact.validationCommand, /--date 2026-05-28/);
});

test('recognizes Gradle and Maven wrapper validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'java-wrapper-ci'));

  assert(survey.ci.runCommands.some((run) => run.command === './gradlew test' && run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === './mvnw test' && run.safe));
  assert(survey.commands.some((run) => run.command === './gradlew test'));
  assert(survey.commands.some((run) => run.command === './mvnw test'));
});

test('keeps workflow working-directory steps inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'working-directory-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const workingDirectories = survey.ci.runCommands
    .filter((run) => run.command === 'npm test')
    .map((run) => run.workingDirectory)
    .sort();
  const validationText = validationStepsText(plan);

  assert.deepEqual(workingDirectories, ['services/api', 'services/default', 'services/web']);
  assert(survey.ci.runCommands.every((run) => run.command !== 'npm test' || !run.safe));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
  assert(validationText.includes('working-directory services/api'));
  assert(validationText.includes('Inspect CI step from .github/workflows/ci.yml'));
});

test('does not fold workflow sibling keys into block run commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-block-sibling'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const blockCommand = survey.ci.runCommands.find((run) => run.multiline);

  assert.equal(blockCommand.command, 'npm ci\nnpm test');
  assert.equal(blockCommand.safe, true);
  assert(survey.commands.some((run) => run.command === 'npm ci\nnpm test'));
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
});

test('ignores action inputs named run', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-action-input-run'));

  assert(survey.ci.runCommands.some((run) => run.command === 'node --test'));
  assert(survey.commands.some((run) => run.command === 'node --test'));
  assert(!survey.ci.runCommands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
});

test('keeps unknown setup steps out of runtime-safety triggers', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'unknown-setup-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'pip install -r requirements.txt' && !run.safe));
  assert(survey.commands.some((run) => run.command === 'python -m pytest'));
  assert.equal(survey.runtimeSafetyHints.length, 0);
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps env-prefixed validation commands runnable', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'env-validation-ci'));

  assert(survey.ci.runCommands.some((run) => run.command === 'CI=true npm test' && run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'PYTHONWARNINGS=error pytest' && run.safe));
  assert(survey.commands.some((run) => run.command === 'CI=true npm test'));
  assert(survey.commands.some((run) => run.command === 'PYTHONWARNINGS=error pytest'));
});

test('uses package-only deploy authority as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-deploy-only'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "deploy" may mutate external state'
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "deploy-prod" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens npm lifecycle hooks before emitting validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-lifecycle-hook'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "deploy" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens prepare hooks before emitting delegated package commands', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-prepare-hooks-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        build: 'npm run prepare',
        prepare: 'node --test',
        preprepare: 'terraform apply -auto-approve',
      },
    }, null, 2));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm run build'));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "preprepare" may mutate external state'
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens install lifecycle hooks before emitting install commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'install-lifecycle-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'npm ci' && !run.safe));
  assert(!survey.commands.some((run) => run.command === 'npm ci'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('honors install commands that disable lifecycle scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-ignore-install-scripts-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        preinstall: 'terraform apply -auto-approve',
      },
    }));
    writeFileSync(resolve(tempRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'name: ci',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm ci --ignore-scripts',
      '      - run: pnpm install --ignore-scripts',
      '      - run: npm ci --ignore-scripts=false',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);

    for (const command of ['npm ci --ignore-scripts', 'pnpm install --ignore-scripts']) {
      assert(survey.ci.runCommands.some((run) => run.command === command && run.safe), command);
      assert(survey.commands.some((run) => run.command === command), command);
    }
    assert(survey.ci.runCommands.some((run) => (
      run.command === 'npm ci --ignore-scripts=false'
      && !run.safe
      && run.packageScriptReason.includes('preinstall')
    )));
    assert(!survey.commands.some((run) => run.command === 'npm ci --ignore-scripts=false'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens scoped install lifecycle hooks before emitting install commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'scoped-install-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm ci --prefix services/api'
    && !run.safe
    && run.packageScriptReason.includes('preinstall')
  )));
  assert(!survey.commands.some((run) => run.command === 'npm ci --prefix services/api'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens quoted scoped install lifecycle hooks before emitting package commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'quoted-scoped-install-lifecycle'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api v2/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens option-before scoped install lifecycle hooks', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'option-before-install'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm --prefix services/api ci'
    && !run.safe
    && run.packageScriptReason.includes('preinstall')
  )));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens trailing workspace commands before emitting CI validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'trailing-workspace-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm ci --workspace api'
    && !run.safe
    && run.packageScriptReason.includes('preinstall')
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm run build --workspace api'
    && !run.safe
    && run.packageScriptReason.includes('build')
  )));
  assert(!survey.commands.some((run) => run.command.includes('--workspace api')));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens workspace install lifecycle hooks before emitting install commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workspace-install-lifecycle'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of ['pnpm install', 'yarn install', 'npm ci --workspaces', 'npm ci --workspace web --workspace api']) {
    assert(survey.ci.runCommands.some((run) => (
      run.command === command
      && !run.safe
      && run.packageScriptReason.includes('preinstall')
    )));
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps piped validation commands inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'piped-validation-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'npm test | bash scripts/release.sh' && !run.safe));
  assert(!survey.commands.some((run) => run.command === 'npm test | bash scripts/release.sh'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses non-GitHub CI scripts for runtime-safety triggers', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'gitlab-runtime-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.source === '.gitlab-ci.yml' && run.command === 'terraform apply -auto-approve' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.gitlab-ci.yml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses generic CI list block scalars as commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'gitlab-list-block-scalar'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.source === '.gitlab-ci.yml'
    && run.command === 'terraform apply -auto-approve'
    && run.multiline
    && !run.safe
  )));
  assert(!survey.ci.runCommands.some((run) => run.command === '|' || run.command === '>'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.gitlab-ci.yml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses GitLab before and after scripts for runtime-safety triggers', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'gitlab-before-after-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.source === '.gitlab-ci.yml' && run.command === 'terraform apply -auto-approve' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.source === '.gitlab-ci.yml' && run.command === 'kubectl delete namespace preview' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.gitlab-ci.yml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('preserves GitLab before_script directory changes for script commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'gitlab-before-script-cd'));
  const command = survey.ci.runCommands.find((run) => run.source === '.gitlab-ci.yml' && run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert(survey.commands.some((run) => run.command === 'npm --prefix services/api test'));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
});

test('preserves GitLab scalar before_script cd for following script commands', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-gitlab-scalar-cd-'));
  try {
    mkdirSync(resolve(tempRoot, 'services', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      workspaces: ['services/*'],
    }));
    writeFileSync(resolve(tempRoot, 'services', 'api', 'package.json'), JSON.stringify({
      scripts: {
        test: 'terraform apply -auto-approve',
      },
    }));
    writeFileSync(resolve(tempRoot, '.gitlab-ci.yml'), [
      'test:',
      '  before_script: cd services/api',
      '  script: npm test',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
    const command = survey.ci.runCommands.find((run) => run.source === '.gitlab-ci.yml' && run.command === 'npm test');

    assert.equal(command.workingDirectory, 'services/api');
    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api/package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('detects root MCP configs as runtime surfaces', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'root-mcp-config'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.mcp.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('surveys nested package manifests for validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'nested-package'));
  const commands = survey.commands.map((run) => run.command);

  assert(survey.packageFiles.includes('services/api/package.json'));
  assert(commands.includes('npm --prefix services/api test'));
  assert(commands.includes('npm --prefix services/api run build'));
});

test('screens generated package commands from the repo root', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-generated-prefix-root-'));
  try {
    mkdirSync(resolve(tempRoot, 'services', 'api', 'services', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'services', 'api', 'package.json'), JSON.stringify({
      scripts: {
        test: 'npm publish',
      },
    }));
    writeFileSync(resolve(tempRoot, 'services', 'api', 'services', 'api', 'package.json'), JSON.stringify({
      scripts: {
        test: 'node --test',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm --prefix services/api test'));
    assert(survey.commands.some((run) => run.command === 'npm --prefix services/api/services/api test'));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'services/api/package.json'
      && hint.reason === 'package script "test" may mutate external state'
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('treats null package scripts metadata as absent', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'null-scripts-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.packageFiles.includes('package.json'));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
});

test('honors package managers declared by nested manifests', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'nested-package-manager'));
  const commands = survey.commands.map((run) => run.command);

  assert(commands.includes('pnpm --dir services/api test'));
  assert(!commands.includes('npm --prefix services/api test'));
});

test('screens nested package scripts before marking CI commands safe', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'nested-package-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm --prefix ./services/api run build'
    && !run.safe
    && run.packageScriptReason.includes('build')
  )));
  assert(!survey.commands.some((run) => run.command === 'npm --prefix ./services/api run build'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens trailing npm prefix package scripts before marking CI commands safe', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'trailing-prefix-package-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm run build --prefix services/api'
    && !run.safe
    && run.packageScriptReason.includes('build')
  )));
  assert(!survey.commands.some((run) => run.command === 'npm run build --prefix services/api'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens legacy prepublish lifecycle hooks before install commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'prepublish-lifecycle-ci'));

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm ci'
    && !run.safe
    && run.inspectOnlyReason.includes('prepublish')
  )));
  assert(!survey.commands.some((run) => run.command === 'npm ci'));
});

test('reports non-JavaScript package manifests in surveys', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'python-package'));

  assert.deepEqual(survey.packageFiles, ['pyproject.toml']);
});

test('detects top-level MCP directories as runtime surfaces', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'root-mcp-directory'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'mcp/server.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('detects nested MCP config files as runtime surfaces', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'nested-mcp-config'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.cursor/mcp.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('detects directory-backed instruction adapters', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'directory-instruction-adapters'));

  assert(survey.instructionFiles.includes('.cursor/rules'));
  assert(survey.instructionFiles.includes('.windsurf/rules'));
  assert(survey.harnessControls.includes('.cursor/rules/repo.mdc'));
  assert(survey.harnessControls.includes('.windsurf/rules/repo.md'));
});

test('keeps unsafe Makefile recipes out of validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'unsafe-make'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'make build'));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'make build'
    && !run.safe
    && run.inspectOnlyReason.includes('make target "build"')
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'make test'
    && !run.safe
    && run.inspectOnlyReason.includes('make target "test"')
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'make test deploy'
    && !run.safe
    && run.inspectOnlyReason.includes('make target "test"')
  )));
  assert(!survey.commands.some((run) => run.command === 'make test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "build" may mutate external state'
  )));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('propagates unsafe nested Make targets through recipes', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-nested-delegation'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'make test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "test" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens Make targets that delegate to unsafe package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-package-delegation'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'make test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'Makefile'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('treats unresolved authority make targets as unsafe', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-unresolved-authority-make-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'make test',
      },
    }));
    writeFileSync(resolve(tempRoot, 'Makefile'), 'test:\n\t$(MAKE) deploy\n');

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(!survey.commands.some((run) => run.command === 'make test'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'Makefile'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('uses unresolved authority make CI commands as runtime-safety evidence', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-unresolved-authority-make-ci-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'jobs:',
      '  deploy:',
      '    steps:',
      '      - run: make deploy',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(survey.ci.runCommands.some((run) => (
      run.command === 'make deploy'
      && !run.safe
      && run.inspectOnlyReason.includes('unresolved authority make target "deploy"')
      && run.makeTargetRuntimeSafetyReason.includes('unresolved authority make target "deploy"')
    )));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === '.github/workflows/ci.yml'
      && hint.reason.includes('unresolved authority make target "deploy"')
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('propagates unsafe recursive Make invocations through recipes', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'recursive-make-target'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'make check'));
  assert(!survey.commands.some((run) => run.command === 'make quality'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "check" may mutate external state'
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "quality" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens inline and multi-target Make recipes before emitting validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-inline-multitarget'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'make test'));
  assert(!survey.commands.some((run) => run.command === 'make build'));
  assert(!survey.commands.some((run) => run.command === 'make check'));
  assert(survey.commands.some((run) => run.command === 'make lint'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "test" may mutate external state'
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "build" may mutate external state'
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "check" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens lowercase makefile recipes before trusting CI make commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'lowercase-makefile-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'make test'
    && !run.safe
    && run.inspectOnlyReason.includes('make target "test"')
  )));
  assert(!survey.commands.some((run) => run.command === 'make test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'makefile'
    && hint.reason === 'make target "test" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens make options before deciding whether default targets are safe', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-option-default'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "deploy" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens make -f package wrappers through included makefiles', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-file-option-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'ci.mk'
    && hint.reason === 'make target "test" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens compact make -f package wrappers through included makefiles', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-compact-file-option-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'ops/deploy.mk'
    && hint.reason === 'make target "test" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens included Makefile targets in the caller directory', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-included-make-caller-'));
  try {
    mkdirSync(resolve(tempRoot, 'ops'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'make test',
      },
    }));
    writeFileSync(resolve(tempRoot, 'Makefile'), 'include ops/ci.mk\n');
    writeFileSync(resolve(tempRoot, 'ops', 'ci.mk'), 'test:\n\tterraform apply -auto-approve\n');

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'ops/ci.mk'
      && hint.reason === 'make target "test" may mutate external state'
    )));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens make -f recipes against the caller directory', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-file-caller-cwd-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'ops/ci.mk'
    && hint.reason === 'make target "test" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens env-prefixed package make targets', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-env-make-target'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "prod" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens deploy-named make targets before emitting package commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-deploy-target-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "deploy" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens dynamic and escaping makefile paths before trusting package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-unsafe-file-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens dynamic and escaping make directories before trusting package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-unsafe-directory-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens variable-dispatched validation scripts before emitting package commands', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-dynamic-dispatch-package-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'npm run $TARGET',
        check: 'make ${TARGET}',
        quality: 'npx $TOOL',
        coverage: 'npm exec $TOOL',
        lint: 'pnpm dlx $TOOL',
        build: 'turbo run $TARGET',
        typecheck: 'npm run $(echo deploy) -- --foo',
        'test:ci': 'make `echo deploy`',
        'test:e2e': 'npm run $1',
        validate: 'npm run unit -- --grep $TEST_NAME',
        unit: 'node --test',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(!survey.commands.some((run) => run.command === 'npm run quality'));
    assert(!survey.commands.some((run) => run.command === 'npm run coverage'));
    assert(!survey.commands.some((run) => run.command === 'npm run lint'));
    assert(!survey.commands.some((run) => run.command === 'npm run build'));
    assert(!survey.commands.some((run) => run.command === 'npm run typecheck'));
    assert(!survey.commands.some((run) => run.command === 'npm run test:ci'));
    assert(!survey.commands.some((run) => run.command === 'npm run test:e2e'));
    assert(survey.commands.some((run) => run.command === 'npm run validate'));
    for (const scriptName of ['test', 'check', 'quality', 'coverage', 'lint', 'build', 'typecheck', 'test:ci', 'test:e2e']) {
      assert(survey.runtimeSafetyHints.some((hint) => (
        hint.path === 'package.json'
        && hint.reason === `package script "${scriptName}" may mutate external state`
      )));
    }
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens bare make invocations through the default target', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'bare-make-default'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "test" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens bare make invocations through special and explicit defaults', () => {
  const special = surveyRepository(resolve(fixturesRoot, 'make-special-default'));
  const explicit = surveyRepository(resolve(fixturesRoot, 'make-explicit-default'));

  assert(!special.commands.some((run) => run.command === 'npm test'));
  assert(special.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "deploy" may mutate external state'
  )));
  assert(!explicit.commands.some((run) => run.command === 'npm test'));
  assert(explicit.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "deploy" may mutate external state'
  )));
});

test('screens nested Makefiles before emitting package validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'nested-unsafe-make'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm --prefix services/api run build'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'services/api/Makefile'
    && hint.reason === 'make target "build" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('includes safe nested Makefile validation targets', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'nested-safe-make'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.commands.some((run) => run.command === 'make -C services/api test'));
  assert(!plan.openQuestions.some((question) => question.includes('exact command')));
});

test('ignores non-Makefile include helpers without crashing', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-make-include-env-'));
  try {
    writeFileSync(resolve(tempRoot, 'Makefile'), [
      'include config.env',
      'test:',
      '\t@echo ok',
      '',
    ].join('\n'));
    writeFileSync(resolve(tempRoot, 'config.env'), 'FOO=bar\n');

    const survey = surveyRepository(tempRoot);

    assert(survey.commands.some((run) => run.command === 'make test'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens compact make directory options before emitting package commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'make-compact-directory-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'services/api/Makefile'
    && hint.reason === 'make target "test" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses slash Make targets and ignores commented recipes', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'slash-make-target'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'make release/prod'
    && !run.safe
    && run.inspectOnlyReason.includes('make target "release/prod"')
  )));
  assert(survey.commands.some((run) => run.command === 'make check'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Makefile'
    && hint.reason === 'make target "release/prod" may mutate external state'
  )));
  assert(!survey.runtimeSafetyHints.some((hint) => hint.reason.includes('make target "check"')));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps local Make formatter writes out of runtime-safety hints', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-make-local-write-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        check: 'make check',
      },
    }));
    writeFileSync(resolve(tempRoot, 'Makefile'), [
      'check:',
      '\tprettier --write .',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'make check'));
    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'Makefile'));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps CI Make formatter package writes out of runtime-safety hints', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-ci-make-local-write-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        check: 'make check',
      },
    }));
    writeFileSync(resolve(tempRoot, 'Makefile'), [
      'check:',
      '\tprettier --write .',
      '',
    ].join('\n'));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'jobs:',
      '  test:',
      '    steps:',
      '      - run: npm run check',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(survey.ci.runCommands.some((run) => (
      run.command === 'npm run check'
      && !run.safe
      && run.packageScriptReason.includes('package script "check"')
      && !run.packageScriptRuntimeSafetyReason
    )));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === '.github/workflows/ci.yml'));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps generic CI list-block Make formatter writes out of runtime-safety hints', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-generic-ci-make-local-write-'));
  try {
    writeFileSync(resolve(tempRoot, 'Makefile'), [
      'check:',
      '\tprettier --write .',
      '',
    ].join('\n'));
    writeFileSync(resolve(tempRoot, '.gitlab-ci.yml'), [
      'test:',
      '  script:',
      '    - |',
      '      make check',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(survey.ci.runCommands.some((run) => (
      run.command === 'make check'
      && !run.safe
      && run.inspectOnlyReason.includes('make target "check"')
      && !run.makeTargetRuntimeSafetyReason
    )));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === '.gitlab-ci.yml'));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'Makefile'));
    assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens package scripts that call runtime-surface files', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-runtime-surface'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'scripts/deploy.js'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('does not treat deploy-named tests as runtime surfaces', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'deploy-test-script'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.commands.some((run) => run.command === 'npm test'));
  assert.equal(survey.runtimeSafetyHints.length, 0);
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
});

test('screens package scripts that directly run runtime-surface files', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'direct-runtime-script-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens credential login package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'credential-login-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "check" may mutate external state'
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "quality" may mutate external state'
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "validate" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens mutating git and docker commands after global options', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'cli-global-option-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(!survey.commands.some((run) => run.command === 'npm run test:docker-host'));
  assert(!survey.commands.some((run) => run.command === 'npm run lint:docker-log'));
  assert(!survey.commands.some((run) => run.command === 'npm run check:aws'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality:git-worktree'));
  assert(!survey.commands.some((run) => run.command === 'npm run validate:pulumi'));
  assert(!survey.commands.some((run) => run.command === 'npm run build:config'));
  assert(!survey.commands.some((run) => run.command === 'npm run check:terraform'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality:helm'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens mutating gh commands after global options', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'gh-global-option-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
  assert(!survey.commands.some((run) => run.command === 'npm run lint'));
  assert(!survey.commands.some((run) => run.command === 'npm run build:pr'));
  assert(!survey.commands.some((run) => run.command === 'npm run check:comment'));
  assert(!survey.commands.some((run) => run.command === 'npm run coverage'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens Azure storage upload package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'azure-storage-upload-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "validate" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens write-by-default formatter package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'formatter-write-default-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(!survey.commands.some((run) => run.command === 'npm run coverage'));
  assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
});

test('screens quoted npm prefix package wrappers', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'quoted-prefix-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api v2/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps safe quoted scoped package paths as validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'quoted-safe-package'));

  assert(survey.commands.some((run) => run.command === 'npm --prefix "services/api v2" test'));
});

test('resolves safe sibling package prefixes from the caller package', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'nested-sibling-prefix'));

  assert(survey.commands.some((run) => run.command === 'npm --prefix packages/web run build'));
  assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/web/package.json'));
});

test('screens quoted scoped pnpm yarn and bun package paths', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'quoted-scoped-package-managers'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of [
    'pnpm --dir "services/api v2" run build',
    'yarn --cwd "services/api v2" run build',
    'bun --cwd "services/api v2" run build',
  ]) {
    assert(survey.ci.runCommands.some((run) => (
      run.command === command
      && !run.safe
      && run.packageScriptReason.includes('build')
    )));
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens package wrappers that change directories before child scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-wrapper-cwd'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens package wrappers that pushd before child scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-package-wrapper-pushd-'));
  try {
    mkdirSync(resolve(tempRoot, 'services', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'pushd services/api && npm test',
      },
    }));
    writeFileSync(resolve(tempRoot, 'services', 'api', 'package.json'), JSON.stringify({
      scripts: {
        test: 'terraform apply -auto-approve',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api/package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens package wrappers that change to parent directories before child scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-wrapper-parent-cd'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm --prefix packages/api test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens package wrappers that change to child directories before child scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-wrapper-child-cd'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm --prefix packages/app test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/app/tools/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens env chdir wrappers before emitting package commands', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-env-chdir-package-'));
  try {
    mkdirSync(resolve(tempRoot, 'services', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'env --chdir services/api npm test',
      },
    }, null, 2));
    writeFileSync(resolve(tempRoot, 'services', 'api', 'package.json'), JSON.stringify({
      scripts: {
        test: 'terraform apply -auto-approve',
      },
    }, null, 2));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens unsupported subshell directory wrappers before emitting package commands', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-subshell-cd-package-'));
  try {
    mkdirSync(resolve(tempRoot, 'services', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: '(cd services/api && npm test)',
      },
    }, null, 2));
    writeFileSync(resolve(tempRoot, 'services', 'api', 'package.json'), JSON.stringify({
      scripts: {
        test: 'terraform apply -auto-approve',
      },
    }, null, 2));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens package wrappers that run install lifecycle hooks', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-wrapper-install'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('detects committed env files as runtime-safety surfaces', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'env-file'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.env.local'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('does not treat example env files as runtime-safety surfaces', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'env-example-file'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert.equal(survey.runtimeSafetyHints.length, 0);
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
});

test('detects deployment-oriented script filenames', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'deploy-script-filename'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'scripts/deploy.sh'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('does not flag ordinary release-named source files as runtime surfaces', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'domain-release-file'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert.equal(survey.runtimeSafetyHints.length, 0);
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
});

test('does not treat application task source folders as handoff plans', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'app-task-folder'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert.equal(survey.planHints.length, 0);
  assert(plan.rejectedModules.some((module) => module.id === 'long-running-handoff'));
});

test('parses inline non-GitHub CI script arrays into individual commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'inline-ci-array'));
  const commands = survey.ci.runCommands.map((run) => run.command);

  assert(commands.includes('npm ci'));
  assert(commands.includes('npm test'));
  assert(commands.includes('npm run test -- --grep "foo"'));
  assert(commands.includes('terraform apply -auto-approve'));
  assert(survey.ci.runCommands.some((run) => run.command === 'terraform apply -auto-approve' && !run.safe));
  assert(!commands.some((command) => command.includes('[')));
});

test('preserves directory context across generic CI script arrays', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'generic-ci-cd-array'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const testCommand = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(testCommand.workingDirectory, 'services/api');
  assert.equal(testCommand.safe, false);
  assert.match(testCommand.packageScriptReason, /pretest/);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses CircleCI run steps for runtime-safety triggers', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'circleci-runtime'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const commands = survey.ci.runCommands.map((run) => run.command);

  assert(commands.includes('pytest'));
  assert(commands.includes('python -m pytest'));
  assert(survey.commands.some((run) => run.command === 'pytest'));
  assert(survey.commands.some((run) => run.command === 'python -m pytest'));
  assert(survey.ci.runCommands.some((run) => run.command === 'terraform apply -auto-approve' && !run.safe));
  assert(!commands.includes('|'));
  assert(!commands.some((command) => command.includes('name:')));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.circleci/config.yml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps generic CI mapping working-directory commands inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'circleci-working-directory'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert.match(command.packageScriptReason, /package script "test"/);
  assert.match(command.packageScriptReason, /pretest/);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps generic CI job working-directory commands inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'circleci-job-working-directory'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert.match(command.packageScriptReason, /pretest/);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps generic CI block working-directory commands inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'circleci-block-working-directory'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert.match(command.packageScriptReason, /pretest/);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens root scripts delegated to prefixed package commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'delegated-prefix-package'));

  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api/package.json'));
});

test('screens env-prefixed delegated package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'env-prefixed-delegated-package'));

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
});

test('screens env-prefixed mutating package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'env-prefixed-mutating-cli-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens cross-env-shell mutating package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'cross-env-shell-mutating-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens shell and env wrapped package script chains', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-shell-wrapped-package-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        check: 'sh -c "npm test"',
        lint: 'env -u FOO npm test',
        test: 'npm run deploy',
        deploy: 'firebase deploy',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(!survey.commands.some((run) => run.command === 'npm run lint'));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "check" may mutate external state'
    )));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "lint" may mutate external state'
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens package executor aliases before trusting validation scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-package-executor-aliases-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'npm x wrangler deploy',
        check: 'bun x wrangler deploy',
      },
    }));

    const survey = surveyRepository(tempRoot);

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.reason === 'package script "test" may mutate external state'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.reason === 'package script "check" may mutate external state'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens package executor payloads after value-taking options', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-package-executor-options-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'npx --registry https://registry.npmjs.org wrangler deploy',
        check: 'npm exec --workspace api wrangler deploy',
      },
    }));

    const survey = surveyRepository(tempRoot);

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.reason === 'package script "test" may mutate external state'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.reason === 'package script "check" may mutate external state'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens workspace delegated package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workspace-delegated-package'));

  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/api/package.json'));
});

test('screens pnpm and yarn workspace delegated package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workspace-selector-package'));

  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/api/package.json'));
});

test('treats pnpm workspace-root flag as boolean while screening scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-pnpm-workspace-root-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        preinstall: 'terraform apply -auto-approve',
        deploy: 'gh release create v1.0.0',
        test: 'pnpm -w run deploy',
        check: 'pnpm -w install',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens every pnpm filter before trusting delegated scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'pnpm-multiple-filter-workspaces'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'pnpm test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/unsafe/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('stops parsing workspace options after package argument separator', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workspace-arg-separator-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of [
    'npm test -- --workspace api',
    'npm test -- --prefix services/api',
    'pnpm test -- --recursive',
  ]) {
    assert(survey.ci.runCommands.some((run) => (
      run.command === command
      && !run.safe
      && run.packageScriptReason.includes('package script "test"')
    )));
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens workspace-wide and equals selector delegated scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workspace-selector-edge-package'));

  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run coverage'));
  assert(!survey.commands.some((run) => run.command === 'npm run lint'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
  assert(!survey.commands.some((run) => run.command === 'npm run test:ci'));
  assert(!survey.commands.some((run) => run.command === 'npm run typecheck'));
  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/api/package.json'));
});

test('prefers exact workspace package names over directory basenames', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'ambiguous-workspace-selector'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm run build --workspace api'
    && !run.safe
    && run.packageScriptReason.includes('package script "build"')
  )));
  assert(!survey.commands.some((run) => run.command === 'npm run build --workspace api'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/backend/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens compact pnpm filter package scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-pnpm-compact-filter-'));
  try {
    mkdirSync(resolve(tempRoot, 'packages', 'unsafe'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: { build: 'pnpm -Funsafe run build' },
      workspaces: ['packages/*'],
    }, null, 2));
    writeFileSync(resolve(tempRoot, 'packages', 'unsafe', 'package.json'), JSON.stringify({
      name: 'unsafe',
      scripts: { build: 'terraform apply -auto-approve' },
    }, null, 2));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'pnpm run build'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/unsafe/package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens compact pnpm directory package scripts outside repo', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-pnpm-compact-dir-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: { build: 'pnpm -C../outside run build' },
    }, null, 2));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'pnpm run build'));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "build" may mutate external state'
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens delegated authority package scripts by name', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'delegated-authority-workspace'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'pnpm test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'packages/api/package.json'
    && hint.reason === 'package script "deploy:staging" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens npm all-workspace alias delegated package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workspace-alias-package'));

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'packages/api/package.json'
    && hint.reason === 'package script "test" may mutate external state'
  )));
});

test('screens npm all-workspace scripts that include the root workspace', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workspace-include-root-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "test" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens Yarn foreach workspace delegated package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'yarn-foreach-workspace-package'));

  assert(!survey.commands.some((run) => run.command === 'yarn build'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/api/package.json'));
});

test('keeps singular npm workspace commands scoped to one manifest', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'singular-workspace-package'));
  const command = survey.ci.runCommands.find((run) => run.command === 'npm run build --workspace web');

  assert.equal(command.safe, true);
  assert(survey.commands.some((run) => run.command === 'npm run build --workspace web'));
});

test('keeps npm short workspace validation selectors runnable', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-npm-short-workspace-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'api'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'pkg'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
    }));
    writeFileSync(resolve(tempRoot, 'packages', 'api', 'package.json'), JSON.stringify({
      name: 'api',
      scripts: {
        test: 'node --test',
      },
    }));
    writeFileSync(resolve(tempRoot, 'packages', 'pkg', 'package.json'), JSON.stringify({
      name: '@scope/pkg',
      scripts: {
        build: 'node --test',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'name: ci',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm test -w packages/api',
      '      - run: npm run build -w @scope/pkg',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);

    for (const command of ['npm test -w packages/api', 'npm run build -w @scope/pkg']) {
      assert(survey.ci.runCommands.some((run) => run.command === command && run.safe), command);
      assert(survey.commands.some((run) => run.command === command), command);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens every npm workspace selector before emitting CI commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'multi-workspace-selector'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test --workspace safe --workspace unsafe');

  assert.equal(command.safe, false);
  assert(!survey.commands.some((run) => run.command === 'npm test --workspace safe --workspace unsafe'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/unsafe/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('resolves explicit package prefixes relative to the caller package', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'relative-prefix-package'));

  assert(!survey.commands.some((run) => run.command === 'npm --prefix services/web run build'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api/package.json'));
});

test('screens equals-form scoped package commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'equals-scoped-package'));

  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api/package.json'));
});

test('treats Docker registry pushes as inspect-only commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'docker-push-command'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'docker push ghcr.io/example/app' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'docker image push ghcr.io/example/app' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'docker -H tcp://daemon:2375 push ghcr.io/example/app' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'docker manifest push ghcr.io/example/app:latest' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'docker buildx build --output=type=registry ghcr.io/example/app:latest .' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'docker buildx build --output type=registry ghcr.io/example/app:latest .' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'docker buildx build --output=type=image,push=true,name=ghcr.io/example/app:latest .' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'docker buildx build -o type=image,push=true,name=ghcr.io/example/app:latest .' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'docker buildx imagetools create -t ghcr.io/example/app:latest ghcr.io/example/app@sha256:abc123' && !run.safe));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('docker manifest push ghcr.io/example/app:latest')
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('docker buildx build --output=type=registry ghcr.io/example/app:latest .')
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('docker buildx build --output=type=image,push=true,name=ghcr.io/example/app:latest .')
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('docker buildx imagetools create -t ghcr.io/example/app:latest ghcr.io/example/app@sha256:abc123')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('detects workspace-scoped publish commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workspace-publish-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of ['npm --workspace api publish', 'npm --workspaces publish', 'pnpm -r publish', 'pnpm -w publish']) {
    assert(survey.ci.runCommands.some((run) => run.command === command && !run.safe));
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.github/workflows/ci.yml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens npm force publish package scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-npm-force-publish-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        build: 'npm -f publish',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm run build'));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "build" may mutate external state'
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('detects scoped package deploy commands without manifests', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-scoped-deploy-no-manifest-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'name: deploy',
      'jobs:',
      '  deploy:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm --workspace app run deploy',
      '      - run: pnpm --filter=api run deploy',
      '      - run: npm --prefix=app run deploy',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    for (const command of [
      'npm --workspace app run deploy',
      'pnpm --filter=api run deploy',
      'npm --prefix=app run deploy',
    ]) {
      assert(survey.ci.runCommands.some((run) => run.command === command && !run.safe));
      assert(!survey.commands.some((run) => run.command === command));
    }
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.github/workflows/ci.yml'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('treats Docker Compose pushes as inspect-only commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'docker-compose-push-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens Docker build push variants in package scripts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-docker-build-push-package-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'docker buildx bake --push',
        build: 'docker compose build --push',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(!survey.commands.some((run) => run.command === 'npm run build'));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "test" may mutate external state'
    )));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "build" may mutate external state'
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens package manager publish commands after global options', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-manager-option-publish'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of [
    'npm run build',
    'npm run check',
    'npm run lint',
    'npm run quality',
    'npm run typecheck',
    'npm run validate',
    'npm run coverage',
    'npm test',
  ]) {
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps formatter short write flags inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'formatter-write-flag'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps snapshot update package scripts inspect-only', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-snapshot-update-package-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'jest --updateSnapshot',
        check: 'vitest -u',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps Terraform fmt writes inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'terraform-fmt-write-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps CI formatter package writes out of runtime-safety hints', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-ci-formatter-local-write-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        check: 'prettier . --write',
      },
    }));
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'jobs:',
      '  test:',
      '    steps:',
      '      - run: npm run check',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(survey.ci.runCommands.some((run) => (
      run.command === 'npm run check'
      && !run.safe
      && run.packageScriptReason.includes('package script "check"')
    )));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === '.github/workflows/ci.yml'));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps destructive rm flag variants inspect-only', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-rm-flag-variants-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'rm -fr dist',
        check: 'rm -r -f dist',
        quality: 'rm -rfv dist',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(!survey.commands.some((run) => run.command === 'npm run quality'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('treats terraform fmt check=false as a local write', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-terraform-fmt-check-false-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        check: 'terraform fmt -check=false',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('uses mutating kubectl commands as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'kubectl-create-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'kubectl create namespace preview' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('kubectl create namespace preview')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses mutating kubectl commands with global flags as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'kubectl-global-flag-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'kubectl -n prod delete namespace preview' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('kubectl -n prod delete namespace preview')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps kubectl exec package scripts inspect-only', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-kubectl-exec-package-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: "kubectl exec api-pod -- sh -c 'touch /tmp/agent'",
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "test" may mutate external state'
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('uses AWS S3 writes as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'aws-s3-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'aws s3 sync dist s3://example-bucket' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('aws s3 sync dist s3://example-bucket')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens cloud deploy and storage package scripts', () => {
  const dangerousCommands = [
    'az webapp deployment source config-zip --src app.zip',
    'az functionapp deployment source config-zip --src app.zip',
    'az acr build --registry registry --image app:latest .',
    'gcloud storage cp app.zip gs://example-bucket/app.zip',
    'gsutil cp app.zip gs://example-bucket/app.zip',
    'supabase functions deploy api',
    'docker build --push -t example/app:latest .',
  ];

  for (const command of dangerousCommands) {
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-cloud-write-package-'));
    try {
      writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
        scripts: {
          check: command,
        },
      }));

      const survey = surveyRepository(tempRoot);

      assert(!survey.commands.some((run) => run.command === 'npm run check'), command);
      assert(survey.runtimeSafetyHints.some((hint) => (
        hint.path === 'package.json'
        && hint.reason === 'package script "check" may mutate external state'
      )), command);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test('uses mutating commands with boolean global flags as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'boolean-global-flags-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'kubectl --insecure-skip-tls-verify apply -f k8s/service.yaml' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'aws --no-cli-pager s3 sync dist s3://example-bucket' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.github/workflows/ci.yml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses release actions as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-release-action'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'uses: softprops/action-gh-release@v2' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('softprops/action-gh-release@v2')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses credential actions as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-credential-action'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'uses: aws-actions/configure-aws-credentials@v4' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'uses: azure/login@v2' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'uses: docker/login-action@v3' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.github/workflows/ci.yml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses workflow step metadata as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-metadata-runtime'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'uses: docker/build-push-action@v6'
    && !run.safe
    && run.runtimeSafetyReason === 'GitHub workflow step pushes Docker images'
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm test'
    && !run.safe
    && run.runtimeSafetyReason === 'GitHub workflow step references secrets'
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm run build'
    && !run.safe
    && run.runtimeSafetyReason === 'GitHub workflow step references secrets'
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command.includes('docker buildx build')
    && !run.safe
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'git push origin main'
    && !run.safe
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('Docker images')
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('secrets')
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('docker buildx build')
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('git push origin main')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses inline Docker push metadata as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-inline-docker-push'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'uses: docker/build-push-action@v6'
    && !run.safe
    && run.runtimeSafetyReason === 'GitHub workflow step pushes Docker images'
  )));
  assert(survey.runtimeSafetyHints.some((hint) => hint.reason.includes('Docker images')));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses inherited workflow secrets as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-inherited-secrets'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm test'
    && !run.safe
    && run.runtimeSafetyReason === 'GitHub workflow step inherits secrets'
  )));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses inline inherited workflow secrets as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-inline-inherited-secrets'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm test'
    && !run.safe
    && run.runtimeSafetyReason === 'GitHub workflow step inherits secrets'
  )));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses reusable workflow inherited secrets as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-reusable-inherited-secrets'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'uses: org/repo/.github/workflows/bootstrap.yml@v1'
    && !run.safe
    && run.runtimeSafetyReason === 'GitHub workflow step inherits secrets'
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('secrets')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses reusable workflow secrets before uses as runtime-safety evidence', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-reusable-secrets-before-uses-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'name: CI',
      'on:',
      '  pull_request:',
      'jobs:',
      '  delegated:',
      '    secrets: inherit',
      '    uses: org/repo/.github/workflows/bootstrap.yml@v1',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(survey.ci.runCommands.some((run) => (
      run.command === 'uses: org/repo/.github/workflows/bootstrap.yml@v1'
      && !run.safe
      && run.runtimeSafetyReason === 'GitHub workflow step inherits secrets'
    )));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.github/workflows/ci.yml'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('uses post-steps inherited workflow secrets as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-post-steps-secrets'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm test'
    && !run.safe
    && run.runtimeSafetyReason === 'GitHub workflow step inherits secrets'
  )));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('preserves unsafe workflow metadata when duplicate run commands exist', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-duplicate-unsafe'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const npmTestRuns = survey.ci.runCommands.filter((run) => run.command === 'npm test');

  assert.equal(npmTestRuns.length, 1);
  assert.equal(npmTestRuns[0].safe, false);
  assert.equal(npmTestRuns[0].runtimeSafetyReason, 'GitHub workflow step references secrets');
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('secrets')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps cd preamble validation blocks as CI commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-cd-preamble'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'cd backend\npython -m pytest'
    && run.safe
  )));
  assert(survey.commands.some((run) => run.command === 'cd backend\npython -m pytest'));
  assert(!plan.openQuestions.some((question) => question.includes('exact command')));
});

test('keeps unknown cd preamble validation blocks inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-unknown-cd-preamble'));

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'cd "$SERVICE_DIR"\nnpm test'
    && !run.safe
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'cd ../service\nnpm test'
    && !run.safe
  )));
  assert(!survey.commands.some((run) => run.command.includes('$SERVICE_DIR')));
  assert(!survey.commands.some((run) => run.command.includes('../service')));
});

test('screens package scripts that cd outside the surveyed repo', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-escaping-cd'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps escaping scoped package commands inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-escaping-scoped-package'));

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm --prefix ../sibling test'
    && !run.safe
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'pnpm --dir $TARGET run check'
    && !run.safe
  )));
  assert(!survey.commands.some((run) => run.command.includes('../sibling')));
  assert(!survey.commands.some((run) => run.command.includes('$TARGET')));
});

test('screens cd preamble package scripts in their changed directory', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-cd-unsafe-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'cd services/api\nnpm test'
    && !run.safe
    && run.packageScriptReason.includes('package script "test"')
  )));
  assert(!survey.commands.some((run) => run.command === 'cd services/api\nnpm test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens cd preamble package scripts when only nested manifests exist', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-cd-nested-only-unsafe-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'cd services/api\nnpm test'
    && !run.safe
    && run.packageScriptReason.includes('package script "test"')
  )));
  assert(!survey.commands.some((run) => run.command === 'cd services/api\nnpm test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses direct release CLIs as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'semantic-release-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'npx semantic-release' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npx "semantic-release"' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npm exec release-it' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'pnpm exec "semantic-release"' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'pnpm exec semantic-release' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npm exec -- changeset publish' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npx --yes changeset publish' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'changeset publish' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'pnpm changeset publish' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'yarn changeset publish' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'bun changeset publish' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'semantic-release' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('semantic-release')
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('changeset publish')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses direct deploy CLIs as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'direct-deploy-cli-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'vercel deploy --prod' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'vercel --prod' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npx vercel --prod' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'fly deploy' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npx wrangler deploy' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npx --call "wrangler deploy"' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npm exec -c "wrangler deploy"' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'pnpm dlx firebase deploy' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'firebase hosting:channel:deploy preview' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'azd up --no-prompt' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'az acr login --name example' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'gcloud builds submit --tag gcr.io/project/app' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'serverless deploy --stage prod' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'serverless remove --stage prod' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'sls deploy' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'sls remove' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'sam deploy' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'sam delete' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'cdk deploy' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'cdk destroy' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'amplify publish' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'heroku container:push web' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'supabase db push' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'az webapp up' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.github/workflows/ci.yml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps HTTP writes with curl write-output as runtime-safety evidence', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-curl-write-output-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'name: webhook',
      'jobs:',
      '  ping:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: curl -X POST --write-out "%{http_code}" https://example.invalid/hook',
      "      - run: curl --json '{\"event\":\"ping\"}' https://example.invalid/hook",
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(survey.ci.runCommands.some((run) => (
      run.command === 'curl -X POST --write-out "%{http_code}" https://example.invalid/hook'
      && !run.safe
    )));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === '.github/workflows/ci.yml'
      && hint.reason.includes('curl -X POST --write-out')
    )));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === '.github/workflows/ci.yml'
      && hint.reason.includes('curl --json')
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens package-manager exec commands after manager options', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-manager-exec-options'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of [
    'npm run build',
    'npm run check',
    'npm run lint',
  ]) {
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens deploy subcommands and piped write commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'deploy-subcommand-pipeline-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of [
    'npm run build',
    'npm run check',
    'npm run lint',
  ]) {
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses HTTP write hooks as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'http-write-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of [
    'npm run build',
    'npm run check',
    'npm run lint',
    'npm run validate',
  ]) {
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses database migration CLIs as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'migration-cli-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of [
    'npm run build',
    'npm run check',
    'npm run lint',
    'npm run quality',
    'npm run typecheck',
    'npm run validate',
  ]) {
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm ci'
    && !run.safe
    && run.packageScriptReason.includes('postinstall')
  )));
  assert(!survey.commands.some((run) => run.command === 'npm ci'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses task-runner deploy targets as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'target-deploy-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(!survey.commands.some((run) => run.command === 'npm run typecheck'));
  assert(!survey.commands.some((run) => run.command === 'npm run lint'));
  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(!survey.commands.some((run) => run.command === 'npm run coverage'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "check" may mutate external state'
  )));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'package.json'
    && hint.reason === 'package script "test" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('ignores task-runner filter and project names when detecting deploy targets', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-task-runner-filter-name-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        build: 'turbo run build --filter deploy',
        check: 'nx run deploy:build',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(survey.commands.some((run) => run.command === 'npm run build'));
    assert(survey.commands.some((run) => run.command === 'npm run check'));
    assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens Nx positional targets before emitting package wrappers', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-nx-positional-target-'));
  try {
    mkdirSync(resolve(tempRoot, 'packages', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
      scripts: {
        test: 'nx test api',
      },
    }));
    writeFileSync(resolve(tempRoot, 'packages', 'api', 'package.json'), JSON.stringify({
      name: 'api',
      scripts: {
        test: 'terraform apply -auto-approve',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/api/package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens Turborepo shorthand targets before emitting package wrappers', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-turbo-shorthand-target-'));
  try {
    mkdirSync(resolve(tempRoot, 'packages', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
      scripts: {
        build: 'pnpm turbo build',
      },
    }));
    writeFileSync(resolve(tempRoot, 'packages', 'api', 'package.json'), JSON.stringify({
      name: 'api',
      scripts: {
        build: 'semantic-release',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm run build'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/api/package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens package-manager task-runner shims and pnpm directory aliases', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-manager-task-runner-shim'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of [
    'pnpm build',
    'pnpm run check',
    'pnpm run lint',
    'pnpm test',
  ]) {
    assert(!survey.commands.some((run) => run.command === command));
  }
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'services/api/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens package-manager deployment binary shims', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-package-manager-deploy-shim-'));
  try {
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        build: 'yarn wrangler deploy',
        check: 'yarn run wrangler deploy',
      },
    }));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert(!survey.commands.some((run) => run.command === 'npm run build'));
    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens task-runner workspace targets before emitting validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'task-runner-workspace-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.commands.some((run) => run.command === 'npm --prefix packages/web test'));
  assert(!survey.commands.some((run) => run.command === 'npm --prefix packages/api test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'packages/api/package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens package script aggregators before emitting validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'script-aggregator-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run coverage'));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run lint'));
  assert(!survey.commands.some((run) => run.command === 'npm run build'));
  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps forwarded deploy targets inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'forwarded-target-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm run build -- --target deploy'
    && !run.safe
  )));
  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm run build -- --push'
    && !run.safe
  )));
  assert(!survey.commands.some((run) => run.command === 'npm run build -- --target deploy'));
  assert(!survey.commands.some((run) => run.command === 'npm run build -- --push'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps forwarded package write flags inspect-only', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-forwarded-write-flags-'));
  try {
    mkdirSync(resolve(tempRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(resolve(tempRoot, '.github', 'workflows', 'ci.yml'), [
      'name: ci',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm run lint -- --fix',
      '      - run: yarn lint --fix',
      '      - run: npm run format -- --write',
      '      - run: npm test -- --updateSnapshot',
      '      - run: npm test -- -u',
      '      - run: npm test -- -w',
      '',
    ].join('\n'));

    const survey = surveyRepository(tempRoot);

    for (const command of [
      'npm run lint -- --fix',
      'yarn lint --fix',
      'npm run format -- --write',
      'npm test -- --updateSnapshot',
      'npm test -- -u',
      'npm test -- -w',
    ]) {
      assert(survey.ci.runCommands.some((run) => run.command === command && !run.safe));
      assert(!survey.commands.some((run) => run.command === command));
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('screens env-prefixed Yarn foreach workspace scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'env-yarn-foreach-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'yarn run check'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'packages/api/package.json'
    && hint.reason === 'package script "build" may mutate external state'
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps validation-looking shell text inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'validation-token-noise-ci'));

  assert(survey.ci.runCommands.some((run) => run.command === 'echo npm test' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npm test & ./scripts/provision-preview.sh' && !run.safe));
  assert(!survey.commands.some((run) => run.command === 'echo npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm test & ./scripts/provision-preview.sh'));
});

test('parses Azure shell shortcut steps for runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'azure-shell-shortcut'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'kubectl apply -f k8s/service.yaml' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'azure-pipelines.yml'
    && hint.reason.includes('kubectl apply -f k8s/service.yaml')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses Azure inlineScript tasks for runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'azure-inline-script-task'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'az deployment group create --resource-group rg --template-file infra/main.bicep' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'azure-pipelines.yml'
    && hint.reason.includes('az deployment group create')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses Azure .yaml pipelines for runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'azure-yaml-pipeline'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.files.includes('azure-pipelines.yaml'));
  assert(survey.ci.runCommands.some((run) => run.command === 'terraform apply -auto-approve' && !run.safe));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('honors generic CI workingDirectory declared before scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'azure-preceding-working-directory'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert.match(command.packageScriptReason, /pretest/);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('honors Azure same-step workingDirectory for scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'azure-working-directory'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert.match(command.packageScriptReason, /pretest/);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('honors Azure same-step workingDirectory after block scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'azure-block-working-directory'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert.match(command.packageScriptReason, /pretest/);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses Jenkins Windows and PowerShell shell steps', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'jenkins-windows-shells'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const commands = survey.ci.runCommands.map((run) => run.command);

  assert(commands.includes('kubectl apply -f k8s/service.yaml'));
  assert(commands.includes('kubectl create namespace preview'));
  assert(commands.includes('terraform apply -auto-approve'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Jenkinsfile'
    && hint.reason.includes('kubectl apply -f k8s/service.yaml')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses Jenkins triple-quoted shell steps', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'jenkins-triple-shell'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'terraform apply -auto-approve' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Jenkinsfile'
    && hint.reason.includes('terraform apply -auto-approve')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('parses Jenkins named script wrappers', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'jenkins-named-script-wrapper'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'terraform apply -auto-approve' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === 'Jenkinsfile'
    && hint.reason.includes('terraform apply -auto-approve')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps workflow default working-directory scoped to its job', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-default-scope'));
  const rootCommand = survey.ci.runCommands.find((run) => run.command === 'npm test' && !run.workingDirectory);

  assert(survey.ci.runCommands.some((run) => (
    run.command === 'npm test'
    && run.workingDirectory === 'services/api'
    && !run.safe
  )));
  assert(rootCommand);
  assert.equal(rootCommand.safe, true);
});

test('honors workflow-level default working-directory', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-default-top-level'));
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
});

test('honors job default working-directory declared after steps', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-default-after-steps'));
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert.match(command.packageScriptReason, /pretest/);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
});

test('honors workflow-level default working-directory declared after jobs', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-top-default-after-jobs'));
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
});

test('honors four-space workflow-level default working-directory', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'workflow-four-space-default'));
  const command = survey.ci.runCommands.find((run) => run.command === 'npm test');

  assert.equal(command.workingDirectory, 'services/api');
  assert.equal(command.safe, false);
  assert.match(command.packageScriptReason, /pretest/);
  assert(!survey.commands.some((run) => run.command === 'npm test'));
});

test('preserves Yarn colon-named validation scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'yarn-colon-script'));

  assert(survey.commands.some((run) => run.command === 'yarn run test:unit'));
  assert(survey.commands.some((run) => run.command === 'yarn run typecheck:ci'));
  assert(survey.commands.some((run) => run.command === 'yarn run test-ci'));
  assert(survey.commands.some((run) => run.command === 'yarn run quality'));
});

test('keeps safe Terraform package wrappers as validation commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'terraform-validation-package'));
  const commands = survey.commands.map((run) => run.command);

  assert(commands.includes('npm run validate'));
  assert(commands.includes('npm run check:fmt'));
  assert(!survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
});

test('keeps Pulumi deployments inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'pulumi-validation-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.ci.runCommands.some((run) => run.command === 'pulumi --stack prod up --yes' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'pulumi -s prod destroy --yes' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'Pulumi.yaml'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/deploy.yml'
    && hint.reason.includes('pulumi --stack prod up --yes')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  assert(!validationStepsText(plan).includes('Run detected validation candidate from package.json'));
});

test('detects existing bootstraps and emits versioned update guidance', () => {
  const fixture = resolve(fixturesRoot, 'existing-bootstrapped');
  const survey = surveyRepository(fixture);
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28', targetVersion: '0.2.0' });
  const markdown = renderMarkdownPlan(plan);

  assert.equal(survey.bootstrapState.status, 'bootstrapped');
  assert.equal(survey.versionState.installedVersion, '0.1.0');
  assert.equal(plan.operation, 'update');
  assert.equal(plan.updatePlan.status, 'upgrade-available');
  assert.equal(plan.updatePlan.targetVersion, '0.2.0');
  assert(plan.updatePlan.releaseSource.includes('docs/releases.md'));
  assert(plan.updatePlan.metadataFields.includes('sourceRelease'));
  assert(plan.updatePlan.metadataFields.includes('rejectedChanges'));
  assert.match(markdown, /## Template Update Plan/);
  assert.match(markdown, /--mode update --target-version 0\.2\.0/);
  assert.match(markdown, /Metadata fields:/);
  assert.match(markdown, /docs\/releases\.md/);
  assert.match(markdown, /Rollback path/);
  assert.match(markdown, /docs\/harness-version\.json/);
});

test('treats explicit version metadata as an update signal', () => {
  const fixture = resolve(fixturesRoot, 'metadata-only-bootstrapped');
  const survey = surveyRepository(fixture);
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28', targetVersion: '0.2.0' });

  assert.equal(survey.bootstrapState.status, 'bootstrapped');
  assert.equal(survey.bootstrapState.confidence, 'high');
  assert.equal(survey.versionState.installedVersion, '0.1.0');
  assert.equal(plan.operation, 'update');
  assert.equal(plan.updatePlan.status, 'upgrade-available');
});

test('normalizes v-prefixed target release tags for update comparison', () => {
  const fixture = resolve(fixturesRoot, 'existing-bootstrapped');
  const survey = surveyRepository(fixture);
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28', targetVersion: 'v0.1.0' });

  assert.equal(plan.operation, 'update');
  assert.equal(plan.updatePlan.status, 'already-current');
});

test('supports explicit update mode for unversioned bootstraps', () => {
  const fixture = resolve(fixturesRoot, 'unversioned-bootstrapped');
  const output = execFileSync(
    process.execPath,
    [
      'scripts/harness-bootstrap-plan.mjs',
      '--repo',
      fixture,
      '--json',
      '--mode',
      'update',
      '--target-version',
      '0.2.0',
      '--date',
      '2026-05-28',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const plan = JSON.parse(output);

  assert.equal(plan.operation, 'update');
  assert.equal(plan.updatePlan.status, 'needs-version-baseline');
  assert.equal(plan.updatePlan.versionMetadata.path, 'docs/harness-version.json');
  assert(plan.updatePlan.metadataFields.includes('acceptedChanges'));
  assert(plan.updatePlan.metadataFields.includes('validation'));
  assert.match(plan.planArtifact.validationCommand, /--mode update --target-version 0\.2\.0/);
  assert.match(plan.planArtifact.validationCommand, /--date 2026-05-28/);
});

test('parses init as a dry-run bootstrap command', () => {
  const parsed = parseArgs(['init', '--repo', 'target', '--json', '--date', '2026-05-28']);

  assert.equal(parsed.command, 'init');
  assert.equal(parsed.mode, 'bootstrap');
  assert.equal(parsed.repo, 'target');
  assert.equal(parsed.json, true);
});

test('rejects write mode until a future scaffolder issue authorizes it', () => {
  assert.throws(
    () => parseArgs(['init', '--repo', 'target', '--write']),
    /--write is not implemented yet/,
  );
  assert.throws(
    () => parseArgs(['--repo', 'target', '--write=true']),
    /--write is not implemented yet/,
  );
});

test('keeps init separate from update mode', () => {
  assert.throws(
    () => parseArgs(['init', '--mode', 'update']),
    /init is for first-time dry-run bootstrap plans/,
  );
});

test('init subcommand emits a bootstrap plan without target writes', () => {
  const fixture = resolve(fixturesRoot, 'existing-bootstrapped');
  const output = execFileSync(
    process.execPath,
    [
      'scripts/harness-bootstrap-plan.mjs',
      'init',
      '--repo',
      fixture,
      '--json',
      '--date',
      '2026-05-28',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const plan = JSON.parse(output);

  assert.equal(plan.operation, 'bootstrap');
  assert.match(plan.planArtifact.validationCommand, /--mode bootstrap/);
});

test('does not mistake an application VERSION file for HEB metadata', () => {
  const fixture = resolve(fixturesRoot, 'app-version');
  const survey = surveyRepository(fixture);
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28', targetVersion: '0.2.0' });

  assert.equal(survey.bootstrapState.status, 'bootstrapped');
  assert.equal(survey.versionState.installedVersion, null);
  assert.equal(survey.versionState.source, null);
  assert.equal(plan.operation, 'update');
  assert.equal(plan.updatePlan.status, 'needs-version-baseline');
});

test('copied planner helpers do not trust application VERSION files', () => {
  const source = resolve(fixturesRoot, 'app-version');
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-copied-planner-'));
  try {
    cpSync(source, tempRoot, { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    copyFileSync(resolve(repoRoot, 'scripts', 'harness-bootstrap-plan.mjs'), resolve(tempRoot, 'scripts', 'harness-bootstrap-plan.mjs'));

    const output = execFileSync(
      process.execPath,
      [
        resolve(tempRoot, 'scripts', 'harness-bootstrap-plan.mjs'),
        '--repo',
        tempRoot,
        '--json',
        '--target-version',
        '0.2.0',
        '--date',
        '2026-05-28',
      ],
      { cwd: tempRoot, encoding: 'utf8' },
    );
    const plan = JSON.parse(output);

    assert.equal(plan.survey.versionState.installedVersion, null);
    assert.equal(plan.survey.versionState.source, null);
    assert.equal(plan.operation, 'update');
    assert.equal(plan.updatePlan.status, 'needs-version-baseline');

    const defaultOutput = execFileSync(
      process.execPath,
      [
        resolve(tempRoot, 'scripts', 'harness-bootstrap-plan.mjs'),
        '--repo',
        tempRoot,
        '--json',
        '--date',
        '2026-05-28',
      ],
      { cwd: tempRoot, encoding: 'utf8' },
    );
    const defaultPlan = JSON.parse(defaultOutput);

    assert.equal(defaultPlan.plannerVersion, '0.0.0');
    assert.equal(defaultPlan.targetVersion, '0.0.0');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('detects VERSION in separate template checkouts', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-template-checkout-'));
  try {
    mkdirSync(resolve(tempRoot, 'templates'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'scripts'), { recursive: true });
    copyFileSync(resolve(repoRoot, 'VERSION'), resolve(tempRoot, 'VERSION'));
    copyFileSync(
      resolve(repoRoot, 'templates', 'Harness Engineering Bootstrap.md'),
      resolve(tempRoot, 'templates', 'Harness Engineering Bootstrap.md'),
    );
    copyFileSync(resolve(repoRoot, 'scripts', 'template-fitness.mjs'), resolve(tempRoot, 'scripts', 'template-fitness.mjs'));

    const survey = surveyRepository(tempRoot);
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28', targetVersion: '0.2.0' });
    const currentVersion = readFileSync(resolve(repoRoot, 'VERSION'), 'utf8').trim();

    assert.equal(survey.versionState.installedVersion, currentVersion);
    assert.equal(survey.versionState.source, 'VERSION');
    assert.equal(plan.operation, 'update');
    assert.equal(plan.updatePlan.status, 'upgrade-available');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('does not treat generic docs as an existing HEB bootstrap', () => {
  const fixture = resolve(fixturesRoot, 'generic-docs-harness');
  const survey = surveyRepository(fixture);
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28', targetVersion: '0.2.0' });

  assert.equal(survey.bootstrapState.status, 'fresh');
  assert.equal(plan.operation, 'bootstrap');
});

test('the current template repository is a supported survey target', () => {
  const survey = surveyRepository(repoRoot);
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });
  const currentVersion = readFileSync(resolve(repoRoot, 'VERSION'), 'utf8').trim();

  assert.equal(survey.versionState.installedVersion, currentVersion);
  assert(survey.harnessControls.includes('scripts/template-fitness.mjs'));
  assert(survey.commands.some((command) => command.command === 'node --test scripts/harness-bootstrap-plan.test.mjs'));
  assert(validationStepsText(plan).includes('node scripts/template-fitness.mjs'));
  assert(validationStepsText(plan).includes('--date 2026-05-28'));
  assert.equal(plan.requiredCore.find((item) => item.id === 'quality-gate').status, 'present');
  assert(plan.requiredCore.some((item) => item.id === 'harness-validation' && item.status === 'present'));
});

test('scans root metadata before truncating large repository walks', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'truncated-root-files'), { maxFiles: 2 });

  assert.equal(survey.files.truncated, true);
  assert.deepEqual(survey.instructionFiles, ['AGENTS.md']);
  assert.equal(survey.docs.hasDocsReadme, true);
  assert.equal(survey.versionState.installedVersion, '0.1.0');
  assert(survey.packageFiles.includes('package.json'));
  assert(survey.commands.some((run) => run.command === 'npm test'));
});

test('ignores committed Yarn caches before truncating large repository walks', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-yarn-cache-'));
  try {
    mkdirSync(resolve(tempRoot, '.yarn', 'cache'), { recursive: true });
    mkdirSync(resolve(tempRoot, 'packages', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      workspaces: ['packages/*'],
    }));
    writeFileSync(resolve(tempRoot, 'packages', 'api', 'package.json'), JSON.stringify({
      name: 'api',
      scripts: {
        test: 'node --test',
      },
    }));
    for (let index = 0; index < 5005; index += 1) {
      writeFileSync(resolve(tempRoot, '.yarn', 'cache', `pkg-${index}.zip`), '');
    }

    const survey = surveyRepository(tempRoot);

    assert.equal(survey.files.truncated, false);
    assert(survey.packageFiles.includes('packages/api/package.json'));
    assert(survey.commands.some((run) => run.command === 'npm --prefix packages/api test'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps delegated commands inspect-only when large repository walks truncate', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-truncated-delegation-'));
  try {
    mkdirSync(resolve(tempRoot, 'services', 'api'), { recursive: true });
    writeFileSync(resolve(tempRoot, 'a.txt'), 'x');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'make -C services/api test',
      },
    }));
    writeFileSync(resolve(tempRoot, 'services', 'api', 'Makefile'), 'test:\n\tterraform apply -auto-approve\n');

    const survey = surveyRepository(tempRoot, { maxFiles: 2 });
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert.equal(survey.files.truncated, true);
    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('keeps Make commands inspect-only when large repository walks truncate', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-truncated-make-'));
  try {
    writeFileSync(resolve(tempRoot, 'a.txt'), 'x');
    writeFileSync(resolve(tempRoot, 'package.json'), JSON.stringify({
      scripts: {
        test: 'make test',
        check: 'make -f ci.mk check',
      },
    }));
    writeFileSync(resolve(tempRoot, 'Makefile'), 'test:\n\tterraform apply -auto-approve\n');
    writeFileSync(resolve(tempRoot, 'ci.mk'), 'check:\n\tterraform apply -auto-approve\n');

    const survey = surveyRepository(tempRoot, { maxFiles: 2 });
    const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

    assert.equal(survey.files.truncated, true);
    assert(!survey.commands.some((run) => run.command === 'npm test'));
    assert(!survey.commands.some((run) => run.command === 'npm run check'));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "test" may mutate external state'
    )));
    assert(survey.runtimeSafetyHints.some((hint) => (
      hint.path === 'package.json'
      && hint.reason === 'package script "check" may mutate external state'
    )));
    assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

function validationStepsText(plan) {
  return plan.validationSteps.map((step) => step.command ?? step.text ?? String(step)).join('\n');
}
