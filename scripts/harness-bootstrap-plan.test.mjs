import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildBootstrapPlan,
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

test('honors packageManager declarations without lockfiles', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'declared-package-manager'));
  const commands = survey.commands.map((command) => command.command);

  assert.equal(survey.packageManager, 'pnpm');
  assert(commands.includes('pnpm test'));
  assert(commands.includes('pnpm run check'));
  assert(!commands.some((command) => command.startsWith('npm ')));
});

test('includes hyphenated validation package scripts after safety screening', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'hyphenated-validation-scripts'));
  const commands = survey.commands.map((command) => command.command);

  assert(commands.includes('npm run test-ci'));
  assert(commands.includes('npm run type-check'));
  assert(!commands.includes('npm run lint-fix'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
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

test('keeps unknown setup steps out of runtime-safety triggers', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'unknown-setup-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'pip install -r requirements.txt' && !run.safe));
  assert(survey.commands.some((run) => run.command === 'python -m pytest'));
  assert.equal(survey.runtimeSafetyHints.length, 0);
  assert(plan.rejectedModules.some((module) => module.id === 'runtime-safety'));
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

test('screens install lifecycle hooks before emitting install commands', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'install-lifecycle-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'npm ci' && !run.safe));
  assert(!survey.commands.some((run) => run.command === 'npm ci'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
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

  for (const command of ['pnpm install', 'yarn install', 'npm ci --workspaces']) {
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

test('parses GitLab before and after scripts for runtime-safety triggers', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'gitlab-before-after-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.source === '.gitlab-ci.yml' && run.command === 'terraform apply -auto-approve' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.source === '.gitlab-ci.yml' && run.command === 'kubectl delete namespace preview' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === '.gitlab-ci.yml'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
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

test('screens package scripts that call runtime-surface files', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'package-runtime-surface'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'scripts/deploy.js'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens package scripts that directly run runtime-surface files', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'direct-runtime-script-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run build'));
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
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('screens write-by-default formatter package scripts', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'formatter-write-default-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
  assert(!survey.commands.some((run) => run.command === 'npm run validate'));
  assert(!survey.commands.some((run) => run.command === 'npm run coverage'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
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

test('screens quoted scoped pnpm yarn and bun package paths', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'quoted-scoped-package-managers'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  for (const command of [
    'pnpm --dir "services/api v2" run build',
    'yarn --cwd "services/api v2" build',
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
  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('keeps formatter short write flags inspect-only', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'formatter-write-flag'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(survey.runtimeSafetyHints.some((hint) => hint.path === 'package.json'));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
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

test('uses direct release CLIs as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'semantic-release-ci'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(survey.ci.runCommands.some((run) => run.command === 'npx semantic-release' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'npm exec release-it' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'pnpm exec semantic-release' && !run.safe));
  assert(survey.ci.runCommands.some((run) => run.command === 'semantic-release' && !run.safe));
  assert(survey.runtimeSafetyHints.some((hint) => (
    hint.path === '.github/workflows/ci.yml'
    && hint.reason.includes('semantic-release')
  )));
  assert(plan.triggeredModules.some((module) => module.id === 'runtime-safety'));
});

test('uses task-runner deploy targets as runtime-safety evidence', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'target-deploy-package'));
  const plan = buildBootstrapPlan(survey, { date: '2026-05-28' });

  assert(!survey.commands.some((run) => run.command === 'npm run check'));
  assert(!survey.commands.some((run) => run.command === 'npm test'));
  assert(!survey.commands.some((run) => run.command === 'npm run quality'));
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
  assert.match(markdown, /## Template Update Plan/);
  assert.match(markdown, /--mode update --target-version 0\.2\.0/);
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
  assert.match(plan.planArtifact.validationCommand, /--mode update --target-version 0\.2\.0/);
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

  assert.equal(survey.versionState.installedVersion, '0.1.0');
  assert(survey.harnessControls.includes('scripts/template-fitness.mjs'));
  assert(survey.commands.some((command) => command.command === 'node --test scripts/harness-bootstrap-plan.test.mjs'));
  assert(validationStepsText(plan).includes('node scripts/template-fitness.mjs'));
  assert.equal(plan.requiredCore.find((item) => item.id === 'quality-gate').status, 'present');
  assert(plan.requiredCore.some((item) => item.id === 'harness-validation' && item.status === 'present'));
});

test('scans root metadata before truncating large repository walks', () => {
  const survey = surveyRepository(resolve(fixturesRoot, 'truncated-root-files'), { maxFiles: 2 });

  assert.equal(survey.files.truncated, true);
  assert.deepEqual(survey.instructionFiles, ['AGENTS.md']);
  assert(survey.packageFiles.includes('package.json'));
  assert(survey.commands.some((run) => run.command === 'npm test'));
});

function validationStepsText(plan) {
  return plan.validationSteps.map((step) => step.command ?? step.text ?? String(step)).join('\n');
}
