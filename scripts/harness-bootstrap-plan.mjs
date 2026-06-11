#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templateVersion = readTemplateVersion();

const instructionFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursor/rules',
  '.windsurf/rules',
];

const ignoredDirectories = new Set([
  '.git',
  '.hg',
  '.svn',
  '.yarn',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.gradle',
  'target',
  'vendor',
  'fixtures',
  '__fixtures__',
]);

const packageFiles = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'poetry.lock',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Gemfile',
  'mix.exs',
  'composer.json',
];

const prioritySurveyPaths = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  'README.md',
  'CHANGELOG.md',
  'VERSION',
  'docs/README.md',
  'docs/harness-version.json',
  '.harness/harness-version.json',
  'harness-version.json',
  'docs/dogfooding.md',
  'docs/decisions.md',
  'scripts/check.sh',
  'scripts/template-fitness.mjs',
  'scripts/validate-harness.py',
  'scripts/validate-docs.py',
  '.github/workflows/template-fitness.yml',
];

const dangerousCommandPatterns = [
  /\bterraform\s+apply\b/,
  /\bterraform\s+destroy\b/,
  /\bpulumi\s+(up|destroy|cancel|refresh|import)\b/,
  /\bpulumi\s+config\s+(set|rm)\b/,
  /\bpulumi\s+state\s+(delete|rename|repair)\b/,
  /\bpulumi\s+stack\s+(init|rm)\b/,
  /\bkubectl\s+(apply|create|delete|replace|rollout|scale|patch|set|annotate|label|drain|taint|expose|autoscale)\b/,
  /\bhelm\s+(upgrade|install|uninstall|delete|rollback)\b/,
  /\bdocker\s+login\b/,
  /\bgh\s+auth\s+login\b/,
  /\bgh\s+pr\s+merge\b/,
  /\baz\s+login\b/,
  /\baz\s+[\w-]+\s+login\b/,
  /\bgcloud\s+auth\s+login\b/,
  /\baws\s+configure\b/,
  /\bnpm\s+(adduser|login)\b/,
  /\bpnpm\s+login\b/,
  /\byarn\s+npm\s+login\b/,
  /\bnpm\s+publish\b/,
  /\bpnpm\s+publish\b/,
  /\bnpm\s+(?:(?:--workspace|-w)(?:=|\s+)\S+\s+|--workspaces?\s+|-ws\s+)*publish\b/,
  /\bpnpm\s+(?:(?:--filter|-F)(?:=|\s+)\S+\s+|-r\s+|--recursive\s+|-w\s+|--workspace-root\s+)*publish\b/,
  /\byarn\s+npm\s+publish\b/,
  /\bbun\s+publish\b/,
  /\bdocker\s+push\b/,
  /\bdocker-compose\s+push\b/,
  /\bdocker\s+buildx\s+build\b.*\s--push(?:\s|=|$)/,
  /\bgit\s+push\b/,
  /\bgh\s+release\b/,
  /\b(npx|npm\s+exec|pnpm\s+(?:exec|dlx)|yarn\s+(?:exec|dlx)|bunx)\s+(semantic-release|release-it)\b/,
  /\b(npx|npm\s+exec|pnpm\s+(?:exec|dlx)|yarn\s+(?:exec|dlx)|bunx)\b.*\bchangeset\s+publish\b/,
  /(^|\s)(?:(?:pnpm|yarn|bun)\s+)?changeset\s+publish(?:\s|$)/,
  /(^|\s)(semantic-release|release-it)(\s|$)/,
  /\b(node|tsx?|python3?|bash|sh|pwsh|powershell)\s+\S*(deploy|release|publish|provision)[\w./\\-]*/i,
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?[\w:.-]*(deploy|publish|release)[\w:.-]*\b/,
  /\bnpm\s+(?:(?:--prefix|--workspace|-w)(?:=|\s+)\S+\s+|--workspaces?\s+|-ws\s+)*(run\s+)?[\w:.-]*(deploy|publish|release|provision)[\w:.-]*\b/,
  /\bpnpm\s+(?:(?:--filter|-f|--dir|-c)(?:=|\s+)\S+\s+|-r\s+|--recursive\s+|-w\s+|--workspace-root\s+)*(run\s+)?[\w:.-]*(deploy|publish|release|provision)[\w:.-]*\b/,
  /\byarn\s+(?:(?:--cwd|workspace)(?:=|\s+)\S+\s+)*(run\s+)?[\w:.-]*(deploy|publish|release|provision)[\w:.-]*\b/,
  /\bbun\s+(?:(?:--cwd)(?:=|\s+)\S+\s+)*run\s+[\w:.-]*(deploy|publish|release|provision)[\w:.-]*\b/,
  /\bazd\s+(up|deploy|provision|restore)\b/,
  /\baz\s+.+\b(create|delete|deploy|update|upload|import|set|purge|restore|start|stop|restart|scale|up)\b/,
  /\baws\s+(s3|s3api)\s+(sync|cp|mv|rm|rb|mb|put|delete|create|update)\b/,
  /\baws\s+.+\b(put|delete|create|deploy|publish|update)\b/,
  /\bgcloud\s+builds\s+submit\b/,
  /\bgcloud\s+.+\b(deploy|delete|create|update)\b/,
  /\bsupabase\s+db\s+push\b/,
  /\bprisma\s+(migrate\s+(deploy|dev|reset)|db\s+push)\b/,
  /\bdrizzle-kit\s+(push|migrate)\b/,
  /\bknex\s+migrate:(latest|up|down|rollback)\b/,
  /\bsequelize(-cli)?\s+db:migrate\b/,
  /\btypeorm\s+migration:(run|revert)\b/,
  /\balembic\s+(upgrade|downgrade)\b/,
  /\brails\s+db:(migrate|rollback)\b/,
  /\bpython3?\s+manage\.py\s+migrate\b/,
  /\bdiesel\s+migration\s+(run|redo|revert)\b/,
  /\bdotnet\s+ef\s+database\s+update\b/,
  /\bflyway\s+migrate\b/,
  /\bliquibase\s+update\b/,
  /\bdocker\s+compose\s+up\b.*(?:^|\s)-d(?:\s|$)/,
  /\brm\s+-rf\b/,
  /\bgo\s+fmt\b/,
  /\bcargo\s+fmt\b(?![^&|;]*\s--check\b)/,
  /\bblack\b(?![^&|;]*\s--check\b)/,
  /\bruff\s+format\b(?![^&|;]*\s--check\b)/,
  /\bruff\s+check\b.*\s--fix\b/,
  /\b(?:eslint|stylelint|prettier|biome|dprint)\b.*\s--(?:fix|write)\b/,
  /\b(?:prettier|gofmt|dprint|terraform\s+fmt)\b.*\s-w(?:\s|$)/,
  /\b(?:jest|vitest)\b.*(?:^|\s)(?:-u|--update(?:snapshot|s|-snapshot|-snapshots)?)(?:=|\s|$)/,
  /\bterraform\s+fmt\b(?![^&|;]*\s-check\b)/,
];

const localWorktreeWritePatterns = [
  /\bgo\s+fmt\b/,
  /\bcargo\s+fmt\b(?![^&|;]*\s--check\b)/,
  /\bblack\b(?![^&|;]*\s--check\b)/,
  /\bruff\s+format\b(?![^&|;]*\s--check\b)/,
  /\bruff\s+check\b.*\s--fix(?:=|\s|$)/,
  /\b(?:eslint|stylelint|prettier|biome|dprint)\b.*\s--(?:fix|write)(?:=|\s|$)/,
  /\b(prettier|gofmt|dprint|terraform\s+fmt)\b.*\s-w(?:\s|$)/,
  /\b(?:jest|vitest)\b.*(?:^|\s)(?:-u|--update(?:snapshot|s|-snapshot|-snapshots)?)(?:=|\s|$)/,
  /\bterraform\s+fmt\b(?![^&|;]*\s-check\b)/,
];

const validationScriptCommandNames = new Set([
  'build',
  'check',
  'coverage',
  'lint',
  'quality',
  'test',
  'typecheck',
  'validate',
]);

const cliOptionsWithValues = new Set([
  '-f',
  '-k',
  '-l',
  '-n',
  '--as',
  '--as-group',
  '--as-uid',
  '--ca-bundle',
  '--cache-dir',
  '--certificate-authority',
  '--client-certificate',
  '--client-key',
  '--cluster',
  '--config',
  '--context',
  '--cwd',
  '--endpoint-url',
  '--field-manager',
  '--host',
  '--git-dir',
  '--kubeconfig',
  '--log-level',
  '--namespace',
  '--output',
  '--profile',
  '--project',
  '--query',
  '--region',
  '--request-timeout',
  '--selector',
  '--server',
  '--token',
  '--user',
  '--work-tree',
]);

const moduleDefinitions = [
  {
    id: 'data-contracts',
    title: 'Data contracts',
    trigger: (survey) => survey.dataHints.length > 0,
    evidence: (survey) => samplePaths(survey.dataHints),
    smallerControl:
      'Use existing testing or architecture docs if the data is repo-local and the semantics are obvious.',
    validation:
      'Add or identify a contract check, fixture, schema validation, or review step that proves the data assumption.',
    rejection:
      'No external data, schema, SQL, API, model, or event-stream hint was detected.',
  },
  {
    id: 'repo-contracts',
    title: 'Repo contracts',
    trigger: (survey) => survey.repoDependencyHints.length > 0,
    evidence: (survey) => samplePaths(survey.repoDependencyHints),
    smallerControl:
      'Prefer README or architecture notes when the dependency is internal to one repo and already validated by tests.',
    validation:
      'Document the owning repo/artifact and add a compatibility check, version pin, or explicit review rule.',
    rejection: 'No workspace, submodule, generated-artifact, or cross-repo dependency hint was detected.',
  },
  {
    id: 'internal-data-store-docs',
    title: 'Internal data-store docs',
    trigger: (survey) => survey.internalDataStoreHints.length > 0,
    evidence: (survey) => samplePaths(survey.internalDataStoreHints),
    smallerControl:
      'Use code comments or tests first if there is no durable schema, migration, lock, queue, or persistence behavior.',
    validation:
      'Make migrations, locks, schema ownership, or persistence invariants discoverable from a routed doc or check.',
    rejection: 'No repo-owned persistence, migration, schema, or lock file hint was detected.',
  },
  {
    id: 'runtime-safety',
    title: 'Agent runtime safety docs',
    trigger: (survey) => survey.runtimeSafetyHints.length > 0,
    evidence: (survey) => sampleHintEvidence(survey.runtimeSafetyHints),
    smallerControl:
      'Keep ordinary local build/test instructions in the task router when no agents touch credentials, production, or deploy surfaces.',
    validation:
      'Define pre-action authorization, approval tiers, audit evidence, and a kill/rollback route for risky agent actions.',
    rejection: 'No deploy, infrastructure, secret, MCP, autonomous job, or production-surface hint was detected.',
  },
  {
    id: 'pr-workflow-metrics',
    title: 'GitHub/PR workflow metrics',
    trigger: (survey) => survey.prWorkflowMetricHints.length > 0,
    evidence: (survey) => sampleHintEvidence(survey.prWorkflowMetricHints),
    smallerControl:
      'Use local metrics only if the repo has little PR activity or no GitHub review loop.',
    validation:
      'Track a small marker set or scheduled summary only after PR workflow friction is visible.',
    rejection: 'No PR metrics, review-marker capture, or recurring PR-friction signal was detected.',
  },
  {
    id: 'long-running-handoff',
    title: 'Long-running handoff or task contracts',
    trigger: (survey) => survey.planHints.length > 0,
    evidence: (survey) => samplePaths(survey.planHints),
    smallerControl:
      'Use the active bootstrap plan header and progress log before creating a broader task-contract system.',
    validation:
      'A new session can resume from the plan without chat-history archaeology and without trusting stale claims.',
    rejection: 'No existing plan, handoff, task-contract, or multi-session work surface was detected.',
  },
  {
    id: 'url-context-map',
    title: 'URL-fetchable context map',
    trigger: (survey) => survey.urlMapHints.length > 0,
    evidence: (survey) => samplePaths(survey.urlMapHints),
    smallerControl:
      'Use docs/README.md routing first when agents already have local checkout access.',
    validation:
      'Remote agents can fetch current canonical context without loading private or stale material.',
    rejection: 'No llms.txt, llms-full.txt, docs site, or remote-agent bootstrap hint was detected.',
  },
  {
    id: 'evidence-packs',
    title: 'Evidence packs for source-heavy work',
    trigger: (survey) => survey.evidenceHints.length > 0,
    evidence: (survey) => samplePaths(survey.evidenceHints),
    smallerControl:
      'Use ordinary references or ADR citations when the repo is not doing repeated source-heavy research.',
    validation:
      'Claims include source, date, freshness expectation, and promotion/archive rules.',
    rejection: 'No repeated research, source-pack, citation, or evidence directory hint was detected.',
  },
  {
    id: 'health-report',
    title: 'Agent-readable health report',
    trigger: (survey) => healthControlEvidence(survey).length >= 3,
    evidence: (survey) => sampleValues(healthControlEvidence(survey)),
    smallerControl:
      'Use direct validator output until there are enough sensors that prioritization becomes useful.',
    validation:
      'The report summarizes current validator/metric actions instead of duplicating raw logs.',
    rejection: 'Fewer than three health-report control signals were detected.',
  },
  {
    id: 'code-search-adapter',
    title: 'Token-efficient code-search adapter',
    trigger: (survey) => survey.files.count >= 1500 || survey.files.truncated,
    evidence: (survey) => [`${survey.files.count}${survey.files.truncated ? '+' : ''} scanned files`],
    smallerControl:
      'Use rg plus selective reads while the repository is still small enough for cheap local search.',
    validation:
      'Measure reduced discovery time or token load before keeping a generated index.',
    rejection: 'The repo does not look large enough to need more than rg plus selective reads.',
  },
];

export function surveyRepository(inputPath, options = {}) {
  const root = resolve(inputPath || process.cwd());
  const stat = statSync(root);
  if (!stat.isDirectory()) throw new Error(`--repo must point to a directory: ${root}`);

  const files = walkFiles(root, { maxFiles: options.maxFiles ?? 5000 });
  const allFiles = files.paths;
  const fileSet = new Set(allFiles);

  const packageManifests = collectPackageManifests(root, allFiles);
  const rootPackageManifest = packageManifests.find((manifest) => manifest.path === 'package.json');
  const packageJson = rootPackageManifest?.json ?? null;
  const detectedInstructionFiles = detectInstructionFiles(allFiles, fileSet);
  const docs = collectDocs(allFiles);
  const packageManager = inferPackageManager(fileSet, packageJson);
  const unsafeMakeTargets = collectUnsafeMakeTargets(root, fileSet, packageManifests);
  const runtimeSafetyUnsafeMakeTargets = collectUnsafeMakeTargets(root, fileSet, packageManifests, { runtimeSafety: true });
  const harnessControls = collectHarnessControls(allFiles);
  const packageScripts = collectPackageScripts(packageManifests, packageManager, fileSet, unsafeMakeTargets, {
    incompleteScan: files.truncated,
    harnessControls,
  });
  const makeTargets = collectMakeTargets(root, fileSet, unsafeMakeTargets, { harnessControls });
  const makeRuntimeSafetyHints = collectMakeRuntimeSafetyHints(root, fileSet, packageManifests, runtimeSafetyUnsafeMakeTargets);
  const ci = collectCi(root, allFiles, packageManifests, unsafeMakeTargets, {
    harnessControls,
    incompleteScan: files.truncated,
    makeTargets,
    runtimeSafetyUnsafeMakeTargets,
  });
  const scriptFiles = allFiles.filter((path) => path.startsWith('scripts/')).sort();
  const prWorkflowMetricHints = collectPrWorkflowMetricHints(root, allFiles);
  const versionState = collectVersionState(root, allFiles);
  const bootstrapState = collectBootstrapState({
    instructionFiles: detectedInstructionFiles,
    docs,
    harnessControls,
    versionState,
  });

  const survey = {
    repoPath: root,
    repoName: basename(root),
    plannerVersion: templateVersion,
    bootstrapState,
    versionState,
    files: {
      count: files.count,
      truncated: files.truncated,
    },
    instructionFiles: detectedInstructionFiles,
    packageFiles: collectPackageFiles(allFiles),
    docs,
    ci,
    commands: collectCommands({ packageScripts, makeTargets, ci }),
    packageManager,
    packageScripts,
    makeTargets,
    scripts: scriptFiles,
    sourceRoots: collectSourceRoots(allFiles),
    dataHints: collectDataHints(allFiles),
    internalDataStoreHints: collectInternalDataStoreHints(allFiles),
    repoDependencyHints: collectRepoDependencyHints(allFiles, packageJson),
    runtimeSafetyHints: dedupeObjects(
      [
        ...collectRuntimeSafetyHints(allFiles, ci, packageManifests, runtimeSafetyUnsafeMakeTargets, { incompleteScan: files.truncated }),
        ...makeRuntimeSafetyHints,
      ],
      (hint) => `${hint.path}\0${hint.reason}`,
    ),
    planHints: collectPlanHints(allFiles),
    urlMapHints: collectUrlMapHints(allFiles),
    evidenceHints: collectEvidenceHints(allFiles),
    harnessControls,
    prWorkflowMetricHints,
  };

  return survey;
}

export function buildBootstrapPlan(survey, options = {}) {
  const date = options.date || new Date().toISOString().slice(0, 10);
  const planSlug = slugify(survey.repoName || 'repository');
  const targetVersion = options.targetVersion || templateVersion;
  const currentVersionOverride = options.currentVersion || null;
  const currentVersion = options.currentVersion || survey.versionState.installedVersion || null;
  const operation = resolveOperationMode(options.mode || 'auto', survey);
  const requiredCore = buildRequiredCore(survey);
  const modules = moduleDefinitions.map((definition) => {
    const triggered = definition.trigger(survey);
    return {
      id: definition.id,
      title: definition.title,
      status: triggered ? 'triggered' : 'rejected',
      evidence: triggered ? definition.evidence(survey) : [],
      smallerControl: definition.smallerControl,
      validation: definition.validation,
      rationale: triggered ? 'Detected trigger evidence in the repository survey.' : definition.rejection,
      retirement: 'Retire or weaken when the trigger disappears or a smaller existing control proves sufficient.',
    };
  });

  const validationSteps = buildValidationSteps(survey, {
    operation,
    targetVersion,
    currentVersionOverride,
    date,
  });
  const openQuestions = buildOpenQuestions(survey, requiredCore, modules);
  const updatePlan = buildUpdatePlan({
    survey,
    operation,
    currentVersion,
    targetVersion,
    date,
    planSlug,
  });
  const planKindSlug = operation === 'update' ? 'harness-update' : 'harness-bootstrap';

  return {
    schemaVersion: 1,
    kind: 'harness-bootstrap-plan',
    operation,
    plannerVersion: templateVersion,
    targetVersion,
    planArtifact: {
      status: 'draft',
      owner: 'human',
      created: date,
      updated: date,
      recommendedPath: `docs/plans/active/${date}-${planSlug}-${planKindSlug}.md`,
      localOnlyAlternative: `.harness/plans/${date}-${planSlug}-${planKindSlug}.md`,
      nextAction: operation === 'update'
        ? 'Review the update plan, confirm release notes and rollback path, then approve or reject template-update writes.'
        : 'Review this plan, resolve open questions, then approve or reject writes before implementation.',
      validationCommand: buildPlannerCommand(survey.repoPath, {
        operation,
        targetVersion,
        currentVersionOverride,
        date,
      }),
      stopCondition: 'Stop if repo drift changes the survey inputs, the plan is rejected, or implementation completes and records a baseline.',
      supersedes: null,
      supersededBy: null,
      retirement: 'Retire after the bootstrap PR records accepted controls, rejected optional modules, validation results, and known follow-up work.',
    },
    survey,
    requiredCore,
    triggeredModules: modules.filter((module) => module.status === 'triggered'),
    rejectedModules: modules.filter((module) => module.status === 'rejected'),
    updatePlan,
    reviewContract: buildReviewContract(),
    validationSteps,
    openQuestions,
  };
}

export function renderMarkdownPlan(plan) {
  const survey = plan.survey;
  const lines = [];

  lines.push('---');
  lines.push(`status: ${plan.planArtifact.status}`);
  lines.push(`owner: ${plan.planArtifact.owner}`);
  lines.push(`created: ${plan.planArtifact.created}`);
  lines.push(`updated: ${plan.planArtifact.updated}`);
  lines.push(`next_action: ${plan.planArtifact.nextAction}`);
  lines.push(`validation_command: ${plan.planArtifact.validationCommand}`);
  lines.push(`stop_condition: ${plan.planArtifact.stopCondition}`);
  lines.push(`supersedes: ${plan.planArtifact.supersedes ?? 'none'}`);
  lines.push(`superseded_by: ${plan.planArtifact.supersededBy ?? 'none'}`);
  lines.push(`retirement: ${plan.planArtifact.retirement}`);
  lines.push('---');
  lines.push('');
  lines.push(`# Harness Bootstrap Plan: ${survey.repoName}`);
  lines.push('');
  lines.push('## Plan Artifact');
  lines.push('');
  lines.push(`- Recommended repo-owned path: \`${plan.planArtifact.recommendedPath}\``);
  lines.push(`- Local-only alternative: \`${plan.planArtifact.localOnlyAlternative}\``);
  lines.push('- Write policy: this planner is read-only; do not write target-repo files until the plan is reviewed and accepted.');
  lines.push('- Resume rule: each execution turn reloads this plan, verifies repo drift, checks the next action, and records progress before handoff.');
  lines.push('');

  lines.push('## Survey Summary');
  lines.push('');
  lines.push(`- Repository path: \`${survey.repoPath}\``);
  lines.push(`- Files scanned: ${survey.files.count}${survey.files.truncated ? ' (truncated)' : ''}`);
  lines.push(`- Instruction files: ${formatList(survey.instructionFiles)}`);
  lines.push(`- Package files: ${formatList(survey.packageFiles)}`);
  lines.push(`- Documentation files: ${formatList(sampleValues(survey.docs.files, 12))}`);
  lines.push(`- CI files: ${formatList(survey.ci.files)}`);
  lines.push(`- Source roots: ${formatList(survey.sourceRoots)}`);
  lines.push(`- Existing harness controls: ${formatList(sampleValues(survey.harnessControls, 12))}`);
  lines.push('');

  lines.push('## Bootstrap State');
  lines.push('');
  lines.push(`- Operation: \`${plan.operation}\``);
  lines.push(`- Detected state: \`${survey.bootstrapState.status}\` (${survey.bootstrapState.confidence} confidence)`);
  lines.push(`- State evidence: ${formatList(survey.bootstrapState.evidence)}`);
  lines.push(`- Installed HEB version: ${survey.versionState.installedVersion ? `\`${survey.versionState.installedVersion}\`` : 'none detected'}`);
  lines.push(`- Version source: ${survey.versionState.source ? `\`${survey.versionState.source}\`` : 'none detected'}`);
  lines.push(`- Target HEB version: \`${plan.targetVersion}\``);
  lines.push('');

  if (plan.operation === 'update') {
    lines.push('## Template Update Plan');
    lines.push('');
    lines.push(`- Update status: \`${plan.updatePlan.status}\``);
    lines.push(`- Current version: ${plan.updatePlan.currentVersion ? `\`${plan.updatePlan.currentVersion}\`` : '`unversioned`'}`);
    lines.push(`- Target version: \`${plan.updatePlan.targetVersion}\``);
    lines.push(`- Suggested branch: \`${plan.updatePlan.suggestedBranch}\``);
    lines.push(`- Release source: ${plan.updatePlan.releaseSource}`);
    lines.push(`- Version metadata: ${plan.updatePlan.versionMetadata.action}`);
    lines.push(`- Metadata fields: ${formatList(plan.updatePlan.metadataFields)}`);
    lines.push('');
    lines.push('Upgrade steps:');
    for (const step of plan.updatePlan.steps) lines.push(`- ${step}`);
    lines.push('');
    lines.push('Rollback path:');
    for (const step of plan.updatePlan.rollback) lines.push(`- ${step}`);
    lines.push('');
  }

  lines.push('## Required Core');
  lines.push('');
  for (const item of plan.requiredCore) {
    lines.push(`- **${item.title}**: ${item.status}. ${item.action}`);
    lines.push(`  - Evidence: ${formatList(item.evidence)}`);
    lines.push(`  - Smaller control: ${item.smallerControl}`);
  }
  lines.push('');

  lines.push('## Triggered Optional Modules');
  lines.push('');
  if (!plan.triggeredModules.length) {
    lines.push('- None. Default to zero optional modules until trigger evidence appears.');
  } else {
    for (const item of plan.triggeredModules) {
      lines.push(`- **${item.title}** (${item.id})`);
      lines.push(`  - Evidence: ${formatList(item.evidence)}`);
      lines.push(`  - Smaller control: ${item.smallerControl}`);
      lines.push(`  - Validation: ${item.validation}`);
      lines.push(`  - Retirement: ${item.retirement}`);
    }
  }
  lines.push('');

  lines.push('## Explicitly Rejected Modules');
  lines.push('');
  for (const item of plan.rejectedModules) {
    lines.push(`- **${item.title}** (${item.id}): ${item.rationale}`);
  }
  lines.push('');

  lines.push('## Validation Steps');
  lines.push('');
  for (const step of plan.validationSteps) {
    if (typeof step === 'string') {
      lines.push(`- ${step}`);
    } else if (step.command) {
      lines.push(`- ${step.label}:`);
      lines.push('');
      lines.push('```bash');
      lines.push(step.command);
      lines.push('```');
      lines.push('');
    } else {
      lines.push(`- ${step.text}`);
    }
  }
  lines.push('');

  lines.push('## Open Questions');
  lines.push('');
  if (!plan.openQuestions.length) {
    lines.push('- None from static survey. Continue only after confirming the plan still matches the latest user request.');
  } else {
    for (const question of plan.openQuestions) lines.push(`- ${question}`);
  }
  lines.push('');

  lines.push('## Review And Handoff Contract');
  lines.push('');
  for (const item of plan.reviewContract) {
    lines.push(`- **${item.role}**: ${item.rule}`);
  }
  lines.push('');

  lines.push('## Progress Log');
  lines.push('');
  lines.push('| Date | Phase | Result | Next Action |');
  lines.push('|---|---|---|---|');
  lines.push(`| ${plan.planArtifact.created} | planner | Draft plan generated from read-only survey | Human/fresh reviewer approves, rejects, or asks for edits |`);
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export function parseArgs(args) {
  const parsed = {
    command: 'plan',
    repo: process.cwd(),
    json: false,
    date: undefined,
    mode: 'auto',
    targetVersion: undefined,
    currentVersion: undefined,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === 'init') {
      if (parsed.command !== 'plan') throw new Error('Only one command is supported: init.');
      parsed.command = 'init';
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--repo') {
      const next = args[i + 1];
      if (!next) throw new Error('--repo requires a directory path.');
      parsed.repo = next;
      i += 1;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--mode') {
      const next = args[i + 1];
      if (!next) throw new Error('--mode requires auto, bootstrap, or update.');
      if (!['auto', 'bootstrap', 'update'].includes(next)) throw new Error('--mode must be auto, bootstrap, or update.');
      parsed.mode = next;
      i += 1;
    } else if (arg === '--target-version') {
      const next = args[i + 1];
      if (!next) throw new Error('--target-version requires a version or tag.');
      parsed.targetVersion = next;
      i += 1;
    } else if (arg === '--current-version') {
      const next = args[i + 1];
      if (!next) throw new Error('--current-version requires a version or tag.');
      parsed.currentVersion = next;
      i += 1;
    } else if (arg === '--date') {
      const next = args[i + 1];
      if (!next) throw new Error('--date requires YYYY-MM-DD.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new Error('--date must use YYYY-MM-DD.');
      parsed.date = next;
      i += 1;
    } else if (arg === '--write' || arg.startsWith('--write=')) {
      throw new Error('--write is not implemented yet. This release is dry-run only; run without --write to print a review-ready plan.');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsed.command === 'init') {
    if (parsed.mode === 'update') throw new Error('init is for first-time dry-run bootstrap plans; use --mode update without init for updates.');
    parsed.mode = 'bootstrap';
  }

  return parsed;
}

function buildRequiredCore(survey) {
  const commandEvidence = survey.commands.map((command) => command.command);
  const hasDecisionMemory = survey.docs.hasDecisionMemory;
  const harnessValidationControls = survey.harnessControls.filter(isHarnessValidationControlPath);
  const harnessValidationAutomation = harnessValidationAutomationEvidence(survey, harnessValidationControls);
  const harnessValidationStatus = harnessValidationControls.length && harnessValidationAutomation.length
    ? 'present'
    : harnessValidationControls.length
      ? 'partial'
      : 'missing';

  return [
    {
      id: 'thin-agent-entrypoint',
      title: 'Thin cross-agent entry point',
      status: survey.instructionFiles.includes('AGENTS.md') ? 'present' : 'missing',
      evidence: survey.instructionFiles,
      action: survey.instructionFiles.includes('AGENTS.md')
        ? 'Keep AGENTS.md as the shared entry point and keep provider adapters thin.'
        : 'Create AGENTS.md as the single required always-on agent file before adding provider adapters.',
      smallerControl: 'Prefer one shared AGENTS.md route over copying policy into Claude, Gemini, Copilot, Cursor, or Windsurf files.',
    },
    {
      id: 'task-router',
      title: 'Task-routed docs map',
      status: survey.docs.hasDocsReadme ? 'present' : 'missing',
      evidence: survey.docs.hasDocsReadme ? ['docs/README.md'] : sampleValues(survey.docs.files, 5),
      action: survey.docs.hasDocsReadme
        ? 'Use docs/README.md as the first-read task router and keep deeper docs behind routes.'
        : 'Add docs/README.md as a compact task router instead of asking agents to read the whole docs tree.',
      smallerControl: 'If the repo has only a README and one or two tasks, keep the router compact and link existing docs instead of creating new manuals.',
    },
    {
      id: 'architecture',
      title: 'Architecture orientation',
      status: survey.docs.hasArchitecture ? 'present' : 'missing',
      evidence: survey.docs.architectureFiles,
      action: survey.docs.hasArchitecture
        ? 'Route architecture-changing tasks to the existing architecture document.'
        : 'Add the smallest architecture note that explains module boundaries, data flow, and non-obvious runtime behavior.',
      smallerControl: 'Use README sections first if the architecture is tiny and stable.',
    },
    {
      id: 'decision-memory',
      title: 'Decision memory',
      status: hasDecisionMemory ? 'present' : 'missing',
      evidence: survey.docs.decisionFiles,
      action: hasDecisionMemory
        ? 'Keep active decisions routable by area, path, and read-when trigger.'
        : 'Add docs/decisions.md or docs/adr/INDEX.md before relying on chat history for durable decisions.',
      smallerControl: 'Use one compact decisions file until decision count or body length justifies split ADR files.',
    },
    {
      id: 'testing-docs',
      title: 'Testing and validation docs',
      status: survey.docs.hasTesting ? 'present' : commandEvidence.length ? 'partial' : 'missing',
      evidence: survey.docs.testingFiles.length ? survey.docs.testingFiles : sampleValues(commandEvidence, 5),
      action: survey.docs.hasTesting
        ? 'Keep the test strategy current and link exact commands from the task router.'
        : 'Document the exact validation commands agents should run and when each one applies.',
      smallerControl: 'If commands are already obvious from package scripts or CI, document only the canonical quality gate.',
    },
    {
      id: 'ci-cd-docs',
      title: 'CI/CD docs',
      status: survey.docs.hasCiCd ? 'present' : survey.ci.files.length ? 'partial' : 'missing',
      evidence: survey.docs.ciCdFiles.length ? survey.docs.ciCdFiles : survey.ci.files,
      action: survey.docs.hasCiCd
        ? 'Route CI and release changes to the existing CI/CD documentation.'
        : 'Add CI/CD notes only for non-obvious workflows, required secrets, release gates, or deployment hazards.',
      smallerControl: 'For simple CI, link workflow files from docs/README.md before creating a separate manual.',
    },
    {
      id: 'human-guide',
      title: 'Human guide',
      status: survey.docs.hasHumanGuide ? 'present' : 'missing',
      evidence: survey.docs.humanGuideFiles,
      action: survey.docs.hasHumanGuide
        ? 'Keep human approval, provider-memory precedence, and escalation paths in the guide.'
        : 'Add a compact human guide when humans need approval rules, provider-memory precedence, or operating notes.',
      smallerControl: 'Use AGENTS.md plus docs/README.md when there are no human-only operating rules yet.',
    },
    {
      id: 'quality-gate',
      title: 'Deterministic quality gate',
      status: commandEvidence.some((command) => /quality|template-fitness|validate|check/i.test(command))
        ? 'present'
        : commandEvidence.length
          ? 'partial'
          : 'missing',
      evidence: sampleValues(commandEvidence, 8),
      action: commandEvidence.length
        ? 'Choose one exact command as the canonical quality gate and route specialized checks behind it.'
        : 'Define a runnable local validation command before adding harness ceremony.',
      smallerControl: 'Prefer an existing test/check script over a new wrapper until multiple checks need orchestration.',
    },
    {
      id: 'harness-validation',
      title: 'Harness validation',
      status: harnessValidationStatus,
      evidence: dedupe([...harnessValidationControls, ...harnessValidationAutomation]),
      action: harnessValidationStatus === 'present'
        ? 'Keep harness validation wired into the canonical quality gate and CI or equivalent automation so it runs without a human remembering it.'
        : harnessValidationControls.length
          ? 'Wire the existing harness doctor or validator into the canonical quality gate and CI or equivalent automation before accepting the bootstrap.'
          : 'Add a minimal warning-mode harness doctor or validator after the first required harness files exist, then wire it into the canonical quality gate and CI or equivalent automation before accepting the bootstrap.',
      smallerControl: 'Start with warning-mode size, route, link, and leakage checks before adding semantic validators; do not rely on manual reminders for recurring harness drift checks.',
    },
    {
      id: 'metrics-baseline',
      title: 'Minimal local metrics baseline',
      status: survey.harnessControls.some((path) => /metrics|health/i.test(path)) ? 'present' : 'missing',
      evidence: survey.harnessControls.filter((path) => /metrics|health/i.test(path)),
      action: survey.harnessControls.some((path) => /metrics|health/i.test(path))
        ? 'Use the latest metrics or health output during harness audits.'
        : 'Record a small baseline only after the core routes and checks exist.',
      smallerControl: 'Do not build PR metrics or scheduled reports until local metrics show useful signal.',
    },
  ];
}

function buildReviewContract() {
  return [
    {
      role: 'Planner',
      rule: 'May survey and draft the plan, but must name trigger evidence, smaller controls, explicit rejections, validation, stop condition, and open questions.',
    },
    {
      role: 'Executor',
      rule: 'Before writing files, reload the accepted plan, verify repo drift, confirm the next unchecked step, and keep changes scoped to that step.',
    },
    {
      role: 'Reviewer',
      rule: 'Challenge every optional module as bloat until evidence, smaller-control failure, and validation signal are present.',
    },
    {
      role: 'Closer',
      rule: 'Run the validation commands, record accepted gaps and rejected modules, update the progress log, and retire or supersede the plan.',
    },
  ];
}

function resolveOperationMode(mode, survey) {
  if (mode === 'bootstrap') return 'bootstrap';
  if (mode === 'update') return 'update';
  return survey.bootstrapState.status === 'bootstrapped' ? 'update' : 'bootstrap';
}

function buildUpdatePlan({ survey, operation, currentVersion, targetVersion, date, planSlug }) {
  if (operation !== 'update') {
    return {
      applicable: false,
      status: 'not-applicable',
      rationale: 'The repository does not look bootstrapped yet, so the first plan should establish the core harness before upgrade tracking.',
    };
  }

  const status = !currentVersion
    ? 'needs-version-baseline'
    : normalizeReleaseVersion(currentVersion) === normalizeReleaseVersion(targetVersion)
      ? 'already-current'
      : 'upgrade-available';

  const versionMetadata = currentVersion && survey.versionState.source
    ? {
        action: `Update \`${survey.versionState.source}\` after the upgrade is validated.`,
        path: survey.versionState.source,
      }
    : {
        action: 'Add `docs/harness-version.json` with the accepted current and target release metadata during the update PR.',
        path: 'docs/harness-version.json',
      };
  const metadataFields = [
    'templateVersion',
    'sourceRelease',
    'installedAt or updatedAt',
    'acceptedChanges',
    'rejectedChanges',
    'deferredChanges',
    'rollback',
    'validation',
  ];

  return {
    applicable: true,
    status,
    currentVersion,
    targetVersion,
    suggestedBranch: `codex/heb-update-${slugify(targetVersion || date || planSlug)}`,
    releaseSource: 'Use docs/releases.md, CHANGELOG.md, and the GitHub release/tag `v<VERSION>` as the source of truth for template changes.',
    versionMetadata,
    metadataFields,
    steps: [
      'Start from a clean branch and keep the update as a reviewable PR, not an in-place edit on the default branch.',
      'Read docs/releases.md, the target release notes, CHANGELOG entry, and template diff before touching the consuming repo.',
      'Classify each upstream template change as already satisfied, applicable fix, intentionally rejected as bloat, deferred, or blocked by missing local trigger.',
      'Apply only applicable fixes that preserve local repo decisions, adapters, validators, and deliberately absent optional modules.',
      'Update the version metadata only after validation passes and rejected/deferred template changes are recorded.',
      'Run the repo quality gate, the harness validator, this planner in update mode, and a fresh-context review before merge.',
    ],
    rollback: [
      'Prefer merging update work as one PR so rollback is a single `git revert <merge-sha>` plus normal validation.',
      'If the target release proves bad before merge, abandon the update branch and keep the existing version metadata unchanged.',
      'If rollback is needed after merge, revert the update PR, restore the previous version metadata, rerun validation, and record the rollback reason in the plan progress log or changelog.',
    ],
  };
}

function buildValidationSteps(survey, options = {}) {
  const steps = [
    {
      label: 'Run the read-only planner',
      command: buildPlannerCommand(survey.repoPath, options),
    },
    {
      label: 'Capture reusable machine output when needed',
      command: buildPlannerCommand(survey.repoPath, { ...options, json: true }),
    },
  ];

  for (const command of sampleValues(survey.commands, 6)) {
    steps.push({
      label: `Run detected validation candidate from ${command.source}`,
      command: command.command,
    });
  }

  const inspectOnly = survey.ci.runCommands.filter((command) => !command.safe);
  for (const command of sampleValues(inspectOnly, 4)) {
    steps.push({
      text: `Inspect CI step from ${command.source} before running manually; not listed as validation because ${command.inspectOnlyReason}.`,
    });
  }

  if (survey.harnessControls.includes('scripts/template-fitness.mjs')) {
    steps.push({ text: 'For this template repo, keep `node scripts/template-fitness.mjs` green.' });
  }

  steps.push({ text: 'Before accepting the bootstrap, verify the harness doctor or validator is wired into the repo\'s canonical quality gate and CI or equivalent automation so future runs do not depend on human memory.' });
  steps.push({ text: 'Get a fresh-context review before implementation and again before closing the bootstrap PR.' });

  return dedupeObjects(steps, (step) => step.command ? `${step.label}\0${step.command}` : step.text);
}

function buildOpenQuestions(survey, requiredCore, modules) {
  const questions = [];
  const missingCore = requiredCore.filter((item) => item.status === 'missing');
  const hasCanonicalQuality = survey.commands.some((command) => /quality|template-fitness|validate|check/i.test(command.command));

  if (!survey.commands.length) {
    questions.push('What exact command should agents run to validate ordinary changes in this repository?');
  } else if (!hasCanonicalQuality && survey.commands.length > 1) {
    questions.push('Which detected validation command should become the canonical quality gate?');
  }

  if (missingCore.length >= 4) {
    questions.push('Should the first implementation PR create all missing core routes, or split docs/checks into smaller PRs?');
  }

  if (modules.some((module) => module.id === 'data-contracts' && module.status === 'triggered')) {
    questions.push('Which detected data/API/schema dependency is most likely to cause wrong agent assumptions and should get the first contract?');
  }

  if (modules.some((module) => module.id === 'runtime-safety' && module.status === 'triggered')) {
    questions.push('Which agent actions require deterministic pre-action authorization before they touch deploy, secret, or production surfaces?');
  }

  if (!survey.ci.files.length) {
    questions.push('Is CI intentionally absent? If not, add a basic CI check that runs harness validation automatically; if yes, name the equivalent automated runner before accepting the bootstrap.');
  }

  return questions;
}

function collectDocs(files) {
  const docFiles = files.filter((path) => path.toLowerCase().endsWith('.md')).sort();
  const lowerSet = new Set(files.map((path) => path.toLowerCase()));

  const architectureFiles = docFiles.filter((path) => /(^|\/)(architecture|system|design)(\.md|\/)/i.test(path));
  const decisionFiles = docFiles.filter((path) => /(^|\/)(decisions|adr|adrs)(\.md|\/)/i.test(path));
  const testingFiles = docFiles.filter((path) => /(^|\/)(testing|tests|qa|quality)(\.md|\/)/i.test(path));
  const ciCdFiles = docFiles.filter((path) => /(^|\/)(ci|cd|ci-cd|release|deploy)(\.md|\/)/i.test(path));
  const humanGuideFiles = docFiles.filter((path) => /(^|\/)(human-guide|maintainer|contributing|operations)(\.md|\/)/i.test(path));

  return {
    files: docFiles,
    hasDocsReadme: lowerSet.has('docs/readme.md'),
    hasArchitecture: architectureFiles.length > 0,
    architectureFiles,
    hasDecisionMemory: decisionFiles.length > 0 || lowerSet.has('docs/adr/index.md'),
    decisionFiles,
    hasTesting: testingFiles.length > 0,
    testingFiles,
    hasCiCd: ciCdFiles.length > 0,
    ciCdFiles,
    hasHumanGuide: humanGuideFiles.length > 0,
    humanGuideFiles,
  };
}

function collectVersionState(root, files) {
  const jsonCandidates = [
    'docs/harness-version.json',
    '.harness/harness-version.json',
    'harness-version.json',
  ];

  for (const path of jsonCandidates) {
    if (!files.includes(path)) continue;
    const value = readJson(root, path);
    const installedVersion = value?.templateVersion || value?.version || value?.hebVersion || null;
    return {
      installedVersion,
      source: path,
      status: installedVersion ? 'versioned' : 'metadata-present-without-version',
      raw: value,
    };
  }

  if (files.includes('VERSION') && isTemplateRepository(files)) {
    const installedVersion = readText(root, 'VERSION').split(/\r?\n/)[0]?.trim() || null;
    return {
      installedVersion,
      source: 'VERSION',
      status: installedVersion ? 'versioned' : 'metadata-present-without-version',
      raw: null,
    };
  }

  const marker = findVersionMarker(root, files);
  if (marker) return marker;

  return {
    installedVersion: null,
    source: null,
    status: 'unversioned',
    raw: null,
  };
}

function isTemplateRepository(files) {
  return files.includes('templates/Harness Engineering Bootstrap.md')
    && files.includes('scripts/template-fitness.mjs');
}

function findVersionMarker(root, files) {
  const markdownFiles = files.filter((path) => path.toLowerCase().endsWith('.md')).slice(0, 40);
  for (const path of markdownFiles) {
    const text = readText(root, path);
    const match = text.match(/(?:harness-bootstrap-version|heb-version|heb_version)\s*[:=]\s*([0-9A-Za-z._/-]+)/i);
    if (match) {
      return {
        installedVersion: match[1],
        source: path,
        status: 'versioned',
        raw: null,
      };
    }
  }
  return null;
}

function collectBootstrapState({ instructionFiles, docs, harnessControls, versionState }) {
  const evidence = [];
  if (versionState.installedVersion || versionState.source) evidence.push(versionState.source || 'version metadata');
  if (instructionFiles.includes('AGENTS.md')) evidence.push('AGENTS.md');
  if (docs.hasDocsReadme) evidence.push('docs/README.md');
  if (docs.hasDecisionMemory) evidence.push('decision memory');
  if (docs.hasHumanGuide) evidence.push('human guide');
  if (harnessControls.some(isHarnessValidationControlPath)) {
    evidence.push('harness validation');
  }

  const hasHebSpecificEvidence = Boolean(
    versionState.installedVersion
      || versionState.source
      || harnessControls.some(isHarnessValidationControlPath),
  );
  const hasVersionMetadata = Boolean(versionState.installedVersion || versionState.source);
  const status = hasVersionMetadata || (hasHebSpecificEvidence && evidence.length >= 3) ? 'bootstrapped' : 'fresh';
  const confidence = versionState.installedVersion
    ? 'high'
    : status === 'bootstrapped' && evidence.length >= 4
      ? 'high'
      : status === 'bootstrapped'
        ? 'medium'
        : 'low';

  return {
    status,
    confidence,
    evidence,
  };
}

function collectCi(root, files, packageManifests = [], unsafeMakeTargets = new Set(), options = {}) {
  const ciFiles = files.filter((path) => {
    const lower = path.toLowerCase();
    return lower.startsWith('.github/workflows/')
      || lower === 'jenkinsfile'
      || lower === '.gitlab-ci.yml'
      || lower === 'azure-pipelines.yml'
      || lower === 'azure-pipelines.yaml'
      || lower === 'bitbucket-pipelines.yml'
      || lower.startsWith('.circleci/');
  }).sort();

  const runCommands = [];
  const ciOptions = {
    ...options,
    harnessValidationCommandsByCommand: harnessValidationCommandMapForCi(packageManifests, options.makeTargets ?? []),
    runtimeSafetyUnsafeMakeTargets: options.runtimeSafetyUnsafeMakeTargets ?? unsafeMakeTargets,
  };
  for (const path of ciFiles) {
    const text = readText(root, path);
    if (path.toLowerCase().startsWith('.github/workflows/')) {
      runCommands.push(...collectWorkflowRunCommands(text, path, packageManifests, unsafeMakeTargets, ciOptions));
    } else {
      runCommands.push(...collectGenericCiRunCommands(text, path, packageManifests, unsafeMakeTargets, ciOptions));
    }
  }

  return {
    files: ciFiles,
    runCommands: dedupeCiRunCommands(runCommands),
  };
}

function dedupeCiRunCommands(commands) {
  const byKey = new Map();
  for (const command of commands) {
    const key = `${command.source}\0${command.workingDirectory ?? ''}\0${command.command}`;
    const existing = byKey.get(key);
    if (!existing
      || (existing.safe && !command.safe)
      || (!existing.runtimeSafetyReason && command.runtimeSafetyReason)
      || (!existing.packageScriptReason && command.packageScriptReason)) {
      byKey.set(key, command);
    }
  }
  return [...byKey.values()];
}

function collectCommands({ packageScripts, makeTargets, ci }) {
  const commands = [];
  for (const script of packageScripts) commands.push(script);
  for (const target of makeTargets) commands.push(target);
  for (const run of ci.runCommands) {
    if (run.safe) commands.push({ source: run.source, command: run.command, multiline: run.multiline });
  }
  return dedupeObjects(commands, (item) => item.command).sort((a, b) => a.command.localeCompare(b.command));
}

function collectPackageManifests(root, files) {
  return files
    .filter((path) => path === 'package.json' || path.endsWith('/package.json'))
    .sort()
    .map((path) => ({
      path,
      directory: dirname(path) === '.' ? '' : dirname(path),
      json: readJson(root, path),
    }))
    .filter((manifest) => manifest.json && typeof manifest.json === 'object');
}

function collectPackageFiles(files) {
  return files
    .filter((path) => packageFiles.includes(basename(path)))
    .sort();
}

function collectPackageScripts(packageManifests, packageManager, fileSet = new Set(), unsafeMakeTargets = new Set(), options = {}) {
  return packageManifests.flatMap((manifest) => (
    collectPackageScriptsFromManifest(
      manifest,
      packageManagerForManifest(fileSet, manifest, packageManager, packageManifests),
      packageManifests,
      unsafeMakeTargets,
      options,
    )
  ));
}

function collectPackageScriptsFromManifest(manifest, packageManager, packageManifests = [], unsafeMakeTargets = new Set(), options = {}) {
  const packageJson = manifest.json;
  const scripts = packageScriptsObject(packageJson?.scripts);
  if (!scripts) return [];
  const hasExistingHarnessValidator = (body) => (
    isHarnessValidationScriptBody(body, options.harnessControls, manifest.directory)
  );

  return Object.entries(scripts)
    .filter(([name, body]) => isValidationScriptName(name) || hasExistingHarnessValidator(body))
    .map(([name]) => {
      const command = packageScriptCommand(packageManager, name, manifest.directory);
      return {
        source: manifest.path,
        command,
        scriptBody: String(scripts[name] ?? ''),
        unsafeReason: unsafePackageScriptReason(command, manifest, packageManifests, {
          unsafeMakeTargets,
          incompleteScan: options.incompleteScan,
          currentDirectory: '',
        }),
      };
    })
    .filter((script) => !script.unsafeReason)
    .filter((script) => isSafeValidationCommand(script.command) || hasExistingHarnessValidator(script.scriptBody))
    .map(({ source, command, scriptBody }) => ({ source, command, scriptBody }));
}

function packageScriptsObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function isValidationScriptName(name) {
  return /(^|[:._-])(test|build|lint|type[:._-]?check|check|quality|validate|coverage)([:._-]|$)/i.test(name);
}

function packageScriptCommand(packageManager, name, directory = '') {
  if (directory) return scopedPackageScriptCommand(packageManager, name, directory);
  if (packageManager === 'yarn') return name === 'test' ? 'yarn test' : `yarn run ${name}`;
  if (packageManager === 'pnpm') return name === 'test' ? 'pnpm test' : `pnpm run ${name}`;
  if (packageManager === 'bun') return `bun run ${name}`;
  return name === 'test' ? 'npm test' : `npm run ${name}`;
}

function scopedPackageScriptCommand(packageManager, name, directory) {
  const path = quotePath(directory);
  if (packageManager === 'yarn') return name === 'test' ? `yarn --cwd ${path} test` : `yarn --cwd ${path} run ${name}`;
  if (packageManager === 'pnpm') return name === 'test' ? `pnpm --dir ${path} test` : `pnpm --dir ${path} run ${name}`;
  if (packageManager === 'bun') return `bun --cwd ${path} run ${name}`;
  return name === 'test' ? `npm --prefix ${path} test` : `npm --prefix ${path} run ${name}`;
}

function collectMakeTargets(root, fileSet, unsafeTargets = collectUnsafeMakeTargets(root, fileSet), options = {}) {
  const targets = collectMakeTargetRecipes(root, fileSet);
  return targets
    .filter((target) => /^(test|build|lint|check|quality|validate|coverage)$/i.test(target.name)
      || isHarnessValidationScriptBody(target.recipe, options.harnessControls, target.directory))
    .filter((target) => !unsafeTargets.has(makeTargetKey(target.directory, target.name)))
    .map((target) => ({
      source: target.path,
      command: target.directory ? `make -C ${quotePath(target.directory)} ${target.name}` : `make ${target.name}`,
      scriptBody: target.recipe,
    }));
}

function collectMakeRuntimeSafetyHints(root, fileSet, packageManifests = [], unsafeTargets = null) {
  const targets = collectMakeTargetRecipes(root, fileSet, { includeIncludedMakefiles: true });
  const runtimeSafetyUnsafeTargets = unsafeTargets ?? unsafeMakeTargetKeys(targets, packageManifests, { runtimeSafety: true });
  return targets
    .filter((target) => runtimeSafetyUnsafeTargets.has(makeTargetKey(target.directory, target.name)))
    .map((target) => ({
      path: target.path,
      reason: `make target "${target.name}" may mutate external state`,
    }));
}

function collectUnsafeMakeTargets(root, fileSet, packageManifests = [], options = {}) {
  return unsafeMakeTargetKeys(collectMakeTargetRecipes(root, fileSet, { includeIncludedMakefiles: true }), packageManifests, options);
}

function collectMakeTargetRecipes(root, fileSet, options = {}) {
  const makefilePaths = [...fileSet]
    .filter((path) => isMakefilePath(path, options))
    .sort();
  const textByPath = new Map(makefilePaths.map((path) => [path, readText(root, path)]));
  const targets = makefilePaths.flatMap((path) => parseMakeTargetRecipes(textByPath.get(path), path));

  if (!options.includeIncludedMakefiles) return targets;

  const includedTargets = makefilePaths.flatMap((path) => {
    const callerDirectory = makefileDirectory(path);
    return collectIncludedMakefilePaths(path, textByPath, fileSet)
      .filter((includedPath) => textByPath.has(includedPath))
      .flatMap((includedPath) => parseMakeTargetRecipes(textByPath.get(includedPath), includedPath, { directory: callerDirectory }));
  });

  return [...targets, ...includedTargets];
}

function isMakefilePath(path, options = {}) {
  const name = basename(path).toLowerCase();
  return name === 'makefile'
    || name === 'gnumakefile'
    || (options.includeIncludedMakefiles && name.endsWith('.mk'));
}

function collectIncludedMakefilePaths(path, textByPath, fileSet, seen = new Set([path])) {
  const text = textByPath.get(path);
  if (!text) return [];

  const includedPaths = [];
  for (const includePath of parseMakeIncludePaths(text)) {
    const resolved = resolveMakeIncludePath(path, includePath, fileSet);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    includedPaths.push(resolved);
    includedPaths.push(...collectIncludedMakefilePaths(resolved, textByPath, fileSet, seen));
  }
  return dedupe(includedPaths);
}

function parseMakeIncludePaths(text) {
  return text.split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^\s*(?:-?include|sinclude)\s+(.+)$/);
      if (!match) return [];
      return match[1]
        .replace(/\s+#.*$/, '')
        .split(/\s+/)
        .map((value) => value.trim())
        .filter((value) => value && !/[*$%]/.test(value));
    });
}

function resolveMakeIncludePath(includerPath, includePath, fileSet) {
  if (/^(?:[A-Za-z]:|\/|\\\\|~)/.test(includePath)) return null;
  const baseDirectory = makefileDirectory(includerPath);
  const resolved = normalizePath(join(baseDirectory, includePath));
  return fileSet.has(resolved) ? resolved : null;
}

function makefileDirectory(path) {
  return dirname(path) === '.' ? '' : normalizePath(dirname(path));
}

function parseMakeTargetRecipes(text, path, options = {}) {
  const targets = [];
  let currentTargets = [];
  let explicitDefaultTarget = null;
  const directory = options.directory ?? makefileDirectory(path);

  for (const line of text.split(/\r?\n/)) {
    const defaultGoalMatch = line.match(/^\.DEFAULT_GOAL\s*(?::=|\?=|\+=|=)\s*([^\s#]+)/);
    if (defaultGoalMatch) {
      explicitDefaultTarget = defaultGoalMatch[1];
      currentTargets = [];
      continue;
    }

    const match = line.match(/^([^\s:=#][^:=#]*?)\s*:(?!=)\s*(.*)$/);
    if (match) {
      const { prerequisites, recipe } = splitMakeRuleTail(match[2]);
      currentTargets = match[1].trim().split(/\s+/).filter(Boolean).map((name) => ({
        name,
        prerequisites,
        recipe,
        path,
        directory,
      }));
      targets.push(...currentTargets);
      continue;
    }

    if (currentTargets.length && /^\s+/.test(line)) {
      const recipeLine = line.trim();
      if (recipeLine.startsWith('#')) continue;
      for (const target of currentTargets) {
        target.recipe = `${target.recipe}\n${recipeLine}`.trim();
      }
    } else if (line.trim() && !line.startsWith('#')) {
      currentTargets = [];
    }
  }

  return targets.map((target) => ({ ...target, explicitDefaultTarget }));
}

function splitMakeRuleTail(tail) {
  const separatorIndex = tail.indexOf(';');
  const prerequisiteText = separatorIndex >= 0 ? tail.slice(0, separatorIndex) : tail;
  const recipe = separatorIndex >= 0 ? tail.slice(separatorIndex + 1).trim() : '';
  return {
    prerequisites: prerequisiteText.split(/\s+/).map((value) => value.trim()).filter(Boolean),
    recipe: recipe.startsWith('#') ? '' : recipe,
  };
}

function unsafeMakeTargetKeys(targets, packageManifests = [], options = {}) {
  const byKey = new Map(targets.map((target) => [makeTargetKey(target.directory, target.name), target]));
  const firstTargetByDirectory = new Map();
  const hasUnsafeCommand = options.runtimeSafety ? hasRuntimeSafetyDangerousCommand : hasDangerousCommand;
  for (const target of targets) {
    const directory = normalizePackageDirectory(target.directory || '');
    if (target.explicitDefaultTarget) {
      firstTargetByDirectory.set(directory, target.explicitDefaultTarget);
      continue;
    }
    if (!firstTargetByDirectory.has(directory) && !isSpecialMakeTarget(target.name)) firstTargetByDirectory.set(directory, target.name);
  }
  const unsafe = new Set();
  let changed = true;

  while (changed) {
    changed = false;
    for (const target of targets) {
      const key = makeTargetKey(target.directory, target.name);
      if (unsafe.has(key)) continue;
      if (
        isAuthorityMakeTargetName(target.name)
        || hasUnsafeCommand(target.recipe)
        || unsafePackageScriptReason(
          target.recipe,
          packageManifestForCommand(target.recipe, packageManifests, target.directory),
          packageManifests,
          { unsafeMakeTargets: unsafe, currentDirectory: target.directory, runtimeSafety: options.runtimeSafety },
        )
        || (target.directory && unsafePackageScriptReason(
          target.recipe,
          packageManifestForCommand(target.recipe, packageManifests, ''),
          packageManifests,
          { unsafeMakeTargets: unsafe, currentDirectory: '', runtimeSafety: options.runtimeSafety },
        ))
        || unsafeMakeTargetReasonFromDirectory(target.recipe, unsafe, target.directory)
        || (target.directory && unsafeMakeTargetReasonFromDirectory(target.recipe, unsafe, ''))
        || target.prerequisites.some((name) => unsafe.has(makeTargetKey(target.directory, name)) || isUnsafeMakePrerequisite(name, target.directory, byKey, new Set(), options))
      ) {
        unsafe.add(key);
        changed = true;
      }
    }

    for (const [directory, targetName] of firstTargetByDirectory) {
      const targetKey = makeTargetKey(directory, targetName);
      const defaultKey = makeDefaultTargetKey(directory);
      if (unsafe.has(targetKey) && !unsafe.has(defaultKey)) {
        unsafe.add(defaultKey);
        changed = true;
      }
    }
  }

  return unsafe;
}

function isUnsafeMakePrerequisite(name, directory, byKey, seen = new Set(), options = {}) {
  const key = makeTargetKey(directory, name);
  const target = byKey.get(key);
  if (!target || seen.has(key)) return false;
  seen.add(key);
  const hasUnsafeCommand = options.runtimeSafety ? hasRuntimeSafetyDangerousCommand : hasDangerousCommand;
  return isAuthorityMakeTargetName(target.name)
    || hasUnsafeCommand(target.recipe)
    || target.prerequisites.some((prerequisite) => isUnsafeMakePrerequisite(prerequisite, target.directory, byKey, seen, options));
}

function isAuthorityMakeTargetName(name) {
  return /(^|[:._-])(deploy|release|publish|provision)([:._-]|$)/i.test(name);
}

function makeTargetKey(directory, target) {
  return `${normalizePackageDirectory(directory || '')}\0${target}`;
}

function makeDefaultTargetKey(directory) {
  return `${normalizePackageDirectory(directory || '')}\0`;
}

function isSpecialMakeTarget(name) {
  return name.startsWith('.');
}

function collectSourceRoots(files) {
  const candidates = ['src', 'app', 'lib', 'packages', 'services', 'apps', 'frontend', 'backend', 'server', 'client'];
  return candidates.filter((dir) => files.some((path) => path === dir || path.startsWith(`${dir}/`)));
}

function collectDataHints(files) {
  return files.filter((path) => {
    const lower = path.toLowerCase();
    const name = basename(lower);
    return lower.endsWith('.sql')
      || lower.endsWith('.graphql')
      || lower.endsWith('.proto')
      || lower.endsWith('.avsc')
      || lower.endsWith('.parquet')
      || lower.endsWith('.dbml')
      || name.startsWith('openapi.')
      || name.startsWith('swagger.')
      || name.startsWith('schema.')
      || hasPathSegment(lower, 'schemas');
  }).map((path) => ({ path, reason: 'data/schema/API semantics' }));
}

function collectInternalDataStoreHints(files) {
  return files.filter((path) => {
    const lower = path.toLowerCase();
    return hasPathSegment(lower, 'migrations')
      || hasPathSegment(lower, 'prisma')
      || hasPathSegment(lower, 'locks')
      || lower.endsWith('/schema.prisma')
      || lower.endsWith('.sqlite')
      || lower.endsWith('.sqlite3')
      || (lower.endsWith('.sql') && (hasPathSegment(lower, 'db') || hasPathSegment(lower, 'database')));
  }).map((path) => ({ path, reason: 'repo-owned persistence semantics' }));
}

function collectRepoDependencyHints(files, packageJson) {
  const hints = files.filter((path) => {
    const lower = path.toLowerCase();
    return lower === '.gitmodules'
      || lower === 'pnpm-workspace.yaml'
      || lower === 'go.work'
      || lower === 'turbo.json'
      || lower === 'nx.json'
      || hasPathSegment(lower, 'generated')
      || hasPathSegment(lower, 'vendor-contracts');
  }).map((path) => ({ path, reason: 'workspace, generated artifact, or cross-repo dependency' }));

  if (packageJson && packageJson.workspaces) {
    hints.push({ path: 'package.json', reason: 'package workspaces' });
  }

  return dedupeObjects(hints, (item) => item.path);
}

function collectRuntimeSafetyHints(files, ci = { runCommands: [] }, packageManifests = [], unsafeMakeTargets = new Set(), options = {}) {
  const fileHints = files
    .filter(isRuntimeSurfacePath)
    .map((path) => ({ path, reason: 'deploy, credential, production, or tool-runtime surface' }));

  const commandHints = ci.runCommands
    .filter((command) => !command.safe && isRuntimeSafetyCommand(command))
    .map((command) => ({
      path: command.source,
      reason: command.runtimeSafetyReason
        ?? command.makeTargetRuntimeSafetyReason
        ?? `CI command may mutate external state: ${formatInlineValue(command.command)}`,
    }));

  const packageHints = collectPackageRuntimeSafetyHints(packageManifests, unsafeMakeTargets, options);

  return dedupeObjects([...fileHints, ...commandHints, ...packageHints], (hint) => `${hint.path}\0${hint.reason}`);
}

function collectPrWorkflowMetricHints(root, files) {
  return files
    .filter(isPrWorkflowMetricCandidatePath)
    .flatMap((path) => prWorkflowMetricHintsForFile(root, path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function isPrWorkflowMetricCandidatePath(path) {
  const lower = path.toLowerCase();
  const name = basename(lower);
  return lower.includes('harness-metrics')
    || lower.includes('pr-metrics')
    || lower.includes('pull-request-metrics')
    || lower.includes('pr-workflow')
    || name === 'pull_request_template.md'
    || lower.startsWith('.github/pull_request_template/')
    || (lower.startsWith('.github/workflows/') && /metrics|harness-audit|harness-health|review/.test(lower));
}

function prWorkflowMetricHintsForFile(root, path) {
  const text = readText(root, path);
  const lower = text.toLowerCase();
  const hints = [];

  if (/\b(gh\s+pr|reviewthreads|pulls\/|pull_request_review)\b/i.test(text)) {
    hints.push({ path, reason: 'PR review/comment metrics are parsed or queried' });
  }
  if (/\b(no harness issue observed|harness issue observed|pr observation|review marker|observation boxes?)\b/i.test(text)) {
    hints.push({ path, reason: 'PR review markers or observation boxes are captured' });
  }
  if (/(harness|pr|pull request).{0,40}(metrics|trend|history|health)/i.test(text)
    || /(metrics|trend|history|health).{0,40}(harness|pr|pull request)/i.test(text)) {
    hints.push({ path, reason: 'PR or harness metrics signal is documented' });
  }
  if (path.toLowerCase().startsWith('.github/workflows/')
    && /\b(harness-metrics|pr-metrics|pull-request-metrics|harness-audit|harness-health)\b/.test(lower)) {
    hints.push({ path, reason: 'workflow runs harness or PR metrics tooling' });
  }

  return dedupeObjects(hints, (hint) => `${hint.path}\0${hint.reason}`);
}

function collectPackageRuntimeSafetyHints(packageManifests, unsafeMakeTargets = new Set(), options = {}) {
  return packageManifests.flatMap((manifest) => {
    const packageJson = manifest.json;
    const scripts = packageScriptsObject(packageJson?.scripts);
    if (!scripts) return [];

    return Object.entries(scripts)
      .filter(([name, body]) => (
        isAuthorityPackageScript(name)
        || hasRuntimeSafetyDangerousCommand(body)
        || unsafePackageScriptReason(
          packageScriptCommand('npm', name, manifest.directory),
          manifest,
          packageManifests,
          { unsafeMakeTargets, incompleteScan: options.incompleteScan, runtimeSafety: true, currentDirectory: '' },
        )
      ))
      .map(([name]) => ({
        path: manifest.path,
        reason: `package script "${name}" may mutate external state`,
      }));
  });
}

function isRuntimeSafetyCommand(command) {
  return hasRuntimeSafetyDangerousCommand(command.command)
    || Boolean(command.packageScriptRuntimeSafetyReason)
    || Boolean(command.makeTargetRuntimeSafetyReason)
    || Boolean(command.runtimeSafetyReason);
}

function hasRuntimeSafetyDangerousCommand(command) {
  return splitShellCommandParts(String(command ?? ''))
    .flatMap(splitShellPipelineParts)
    .some((part) => {
      const inspectedPart = stripPackageCommandPrefix(part);
      return hasDangerousCommand(inspectedPart) && !isLocalWorktreeWriteCommand(inspectedPart);
    });
}

function hasUnresolvedDynamicDispatchCommand(command) {
  return splitShellCommandParts(String(command ?? ''))
    .flatMap(splitShellPipelineParts)
    .some(hasUnresolvedDynamicDispatchPart);
}

function hasUnresolvedDynamicDispatchPart(part) {
  if (hasCommandSubstitution(part)) return true;

  const rawWords = shellWords(part);
  if (hasEnvChdirOption(rawWords) || hasUnsupportedSubshellSyntax(part)) return true;

  const wrapperPayload = shellWrapperPayload(part);
  if (wrapperPayload !== null) {
    return !isStaticShellWrapperPayload(wrapperPayload)
      || hasUnresolvedDynamicDispatchCommand(wrapperPayload);
  }

  const words = shellWords(stripPackageCommandPrefix(part));
  if (!words.length) return false;
  if (hasShellVariable(words[0]) && !isEnvironmentAssignment(words[0])) return true;
  if (isMakeCommandWord(words[0])) return makeInvocationHasDynamicTarget(words);
  if (packageManagerHasDynamicScriptTarget(words)) return true;
  if (packageManagerHasDynamicExecutorTarget(words)) return true;
  if (taskRunnerHasDynamicTarget(part)) return true;
  if (words[0]?.toLowerCase() === 'npx') return hasDynamicNpxCommand(words);
  return false;
}

function makeInvocationHasDynamicTarget(words) {
  const invocation = makeInvocationFromCommandPart(words.join(' '));
  return invocation?.targets.some(hasShellVariable) ?? false;
}

function packageManagerHasDynamicScriptTarget(words) {
  const manager = words[0]?.toLowerCase();
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return false;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word || word === '--') return false;
    if (lower === 'run' || lower === 'run-script') return hasShellVariable(words[index + 1]);
    if (lower === 'test') return false;
    if (word.startsWith('-')) {
      if (packageOptionConsumesNext(word, manager)) index += 1;
      continue;
    }
    if (['add', 'ci', 'dlx', 'exec', 'install', 'npm', 'remove', 'x'].includes(lower)) return false;
    return hasShellVariable(word);
  }
  return false;
}

function packageManagerHasDynamicExecutorTarget(words) {
  const startIndex = packageExecutorOptionStart(words);
  if (startIndex == null) return false;
  for (let index = startIndex; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word) continue;
    if (word === '--') return words.slice(index + 1).some(hasShellVariable);
    if (lower === '-c' || lower === '--call') return words.slice(index + 1).some(hasShellVariable);
    if (lower?.startsWith('--call=')) return hasShellVariable(word.slice('--call='.length))
      || words.slice(index + 1).some(hasShellVariable);
    if (word.startsWith('-')) {
      if (packageExecutorOptionConsumesNext(word) && words[index + 1]) index += 1;
      continue;
    }
    return hasShellVariable(word);
  }
  return false;
}

function taskRunnerHasDynamicTarget(part) {
  const invocation = taskRunnerInvocation(part);
  if (!invocation) return false;
  return invocation.words.slice(1).some(hasShellVariable);
}

function hasDynamicNpxCommand(words) {
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (!word || word === '--') return false;
    if (word.startsWith('-')) {
      if (['-p', '--package'].includes(word.toLowerCase())) index += 1;
      continue;
    }
    return hasShellVariable(word);
  }
  return false;
}

function hasShellVariable(value) {
  return /(^|[^\\])(?:\$(?:[A-Za-z_][A-Za-z0-9_]*|\d+|[#@*?$!-]|\{[^}]+\}|\([^)]+\))|%[A-Za-z_][A-Za-z0-9_]*%)/.test(String(value ?? ''));
}

function hasCommandSubstitution(value) {
  return /(^|[^\\])(?:`|\$\()/.test(String(value ?? ''));
}

function isLocalWorktreeWriteCommand(part) {
  const lower = String(part ?? '').toLowerCase();
  return localWorktreeWritePatterns.some((pattern) => pattern.test(lower))
    || hasTerraformFmtWriteCommand(part);
}

function isDeploymentScriptPath(path) {
  const name = basename(path);
  if (/\.(test|spec)\.[^.]+$/i.test(name)) return false;
  const stem = name.replace(/\.[^.]+$/, '');
  if (!/^(deploy|release|publish|provision)([-_.].*)?$/i.test(stem)) return false;
  const directory = dirname(path);
  return directory === '.'
    || hasPathSegment(path, 'scripts')
    || hasPathSegment(path, 'bin')
    || hasPathSegment(path, 'ops')
    || hasPathSegment(path, 'ci')
    || hasPathSegment(path, 'deploy')
    || hasPathSegment(path, 'release')
    || hasPathSegment(path, 'infra')
    || hasPathSegment(path, '.github')
    || hasPathSegment(path, '.gitlab')
    || hasPathSegment(path, '.circleci');
}

function collectPlanHints(files) {
  return files.filter((path) => {
    const lower = path.toLowerCase();
    return isPlanOrHandoffPath(lower);
  }).map((path) => ({ path, reason: 'plan, handoff, or task-contract surface' }));
}

function isPlanOrHandoffPath(path) {
  return path.startsWith('docs/plans/')
    || path.startsWith('docs/tasks/')
    || path.startsWith('docs/handoff')
    || path.startsWith('docs/task-contract')
    || path.startsWith('.harness/plans/')
    || path.startsWith('.harness/tasks/')
    || path.startsWith('.harness/handoff')
    || path.startsWith('.harness/task-contract')
    || path.startsWith('.omc/plans/')
    || path.startsWith('plans/')
    || /(^|\/)(handoff|task-contract)([-_.\/]|$)/i.test(path);
}

function collectUrlMapHints(files) {
  return files.filter((path) => /(^|\/)llms(-full)?\.txt$/i.test(path) || isDocsSitePath(path))
    .map((path) => ({ path, reason: 'remote-agent context map or docs site' }));
}

function isDocsSitePath(path) {
  return /(^|\/)(docs-site|site)(\/|$)/i.test(path) || /(^|\/)\.vitepress\//i.test(path);
}

function collectEvidenceHints(files) {
  return files.filter((path) => /(^|\/)(evidence|source-pack|research)(\/|\.md$)/i.test(path))
    .map((path) => ({ path, reason: 'source-heavy research or evidence surface' }));
}

function collectWorkflowRunCommands(text, source, packageManifests = [], unsafeMakeTargets = new Set(), options = {}) {
  const lines = text.split(/\r?\n/);
  const commands = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const usesMatch = line.match(/^(\s*)-?\s*uses:\s*(.*)\s*$/);
    if (usesMatch) {
      const action = stripYamlQuotes(usesMatch[2].trim());
      const metadataReason = workflowStepMetadataRuntimeSafetyReason(lines, index, action);
      if (isRuntimeSafetyAction(action) || metadataReason) commands.push(classifyWorkflowUsesStep(source, action, metadataReason));
      continue;
    }

    const match = line.match(/^(\s*)-?\s*run:\s*(.*)\s*$/);
    if (!match) continue;
    if (isWorkflowDefaultsRunKey(lines, index)) continue;
    if (isWorkflowActionInputRunKey(lines, index)) continue;

    const command = match[2].trim();
    const workingDirectory = findWorkflowWorkingDirectory(lines, index);
    const runtimeSafetyReason = workflowStepMetadataRuntimeSafetyReason(lines, index);
    if (/^[|>]/.test(command) || command === '') {
      const blockLines = [];
      const baseIndent = indentation(line);
      let blockIndent = null;

      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex];
        if (!nextLine.trim()) {
          if (blockLines.length) blockLines.push('');
          continue;
        }
        const nextIndent = indentation(nextLine);
        if (nextIndent <= baseIndent) break;
        if (blockIndent === null) blockIndent = nextIndent;
        if (nextIndent < blockIndent) break;
        blockLines.push(nextLine);
        index = nextIndex;
      }

      const blockCommand = normalizeRunBlock(blockLines, { folded: command.startsWith('>') });
      if (blockCommand) {
        commands.push(classifyCiRunCommand(source, blockCommand, true, packageManifests, {
          workingDirectory,
          runtimeSafetyReason,
          unsafeMakeTargets,
          harnessControls: options.harnessControls,
          harnessValidationCommandsByCommand: options.harnessValidationCommandsByCommand,
          makeTargets: options.makeTargets,
          runtimeSafetyUnsafeMakeTargets: options.runtimeSafetyUnsafeMakeTargets,
          incompleteScan: options.incompleteScan,
        }));
      }
    } else {
      commands.push(classifyCiRunCommand(source, stripYamlQuotes(command), false, packageManifests, {
        workingDirectory,
        runtimeSafetyReason,
        unsafeMakeTargets,
        harnessControls: options.harnessControls,
        harnessValidationCommandsByCommand: options.harnessValidationCommandsByCommand,
        makeTargets: options.makeTargets,
        runtimeSafetyUnsafeMakeTargets: options.runtimeSafetyUnsafeMakeTargets,
        incompleteScan: options.incompleteScan,
      }));
    }
  }

  return commands;
}

function workflowStepMetadataRuntimeSafetyReason(lines, stepIndex, action = '') {
  const { start, end } = workflowStepBounds(lines, stepIndex);
  const metadata = [];
  for (let nextIndex = start; nextIndex < end; nextIndex += 1) {
    const line = lines[nextIndex];
    if (!line.trim()) continue;
    metadata.push(line.trim());
  }

  const text = metadata.join('\n');
  if (/\$\{\{\s*secrets\./i.test(text)) return 'GitHub workflow step references secrets';
  if (/(^|\n)secrets:\s*inherit(?:\s*(?:#.*)?)?$/im.test(text)) return 'GitHub workflow step inherits secrets';
  if (workflowInheritedSecretText(lines, stepIndex)) return 'GitHub workflow step inherits secrets';
  if (/docker\/build-push-action/i.test(action)) {
    const pushMatch = text.match(/(^|\n)push:\s*("[^"]+"|'[^']+'|[^\s#},]+)/i)
      ?? text.match(/\{[^}]*\bpush:\s*("[^"]+"|'[^']+'|[^\s#},]+)/i);
    if (pushMatch) {
      const pushValue = stripYamlQuotes((pushMatch[2] ?? pushMatch[1]).trim()).toLowerCase();
      if (!['false', 'no', 'off', '0'].includes(pushValue)) return 'GitHub workflow step pushes Docker images';
    }
  }
  return null;
}

function workflowInheritedSecretText(lines, stepIndex) {
  return workflowInheritedScopeSecretText(lines, stepIndex);
}

function workflowInheritedScopeSecretText(lines, stepIndex) {
  const topLevelEnv = scopeBlockSecretText(lines, 0, lines.length, 0);
  if (topLevelEnv) return topLevelEnv;

  const jobStart = findWorkflowJobStart(lines, stepIndex);
  const jobBounds = findWorkflowJobBounds(lines, stepIndex);
  const jobChildIndent = directChildIndent(lines, jobStart, jobBounds.end);
  return jobChildIndent === null ? null : scopeBlockSecretText(lines, jobStart + 1, jobBounds.end, jobChildIndent);
}

function scopeBlockSecretText(lines, start, end, blockIndent) {
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (indentation(line) !== blockIndent) continue;
    const envMatch = line.match(/^\s*env:\s*(.*)$/);
    const secretsMatch = line.match(/^\s*secrets:\s*(.*)$/);
    if (!envMatch && !secretsMatch) continue;
    const inlineValue = (envMatch?.[1] ?? secretsMatch?.[1] ?? '').trim();
    if (/\$\{\{\s*secrets\./i.test(inlineValue)) return inlineValue;
    if (secretsMatch && inlineValue && !['{}', '[]'].includes(inlineValue)) return inlineValue;
    if (inlineValue) continue;

    const blockLines = [];
    for (let blockIndex = index + 1; blockIndex < end; blockIndex += 1) {
      const blockLine = lines[blockIndex];
      if (!blockLine.trim()) continue;
      if (indentation(blockLine) <= blockIndent) break;
      blockLines.push(blockLine);
    }
    const blockText = blockLines.join('\n');
    const match = blockText.match(/\$\{\{\s*secrets\./i);
    if (match) return match[0];
    if (secretsMatch && blockText.trim()) return blockText.trim();
  }
  return null;
}

function directChildIndent(lines, parentIndex, end) {
  const parentIndent = indentation(lines[parentIndex] ?? '');
  for (let index = parentIndex + 1; index < end; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const currentIndent = indentation(line);
    if (currentIndent <= parentIndent) return null;
    return currentIndent;
  }
  return null;
}

function workflowStepBounds(lines, index) {
  const currentIndent = indentation(lines[index]);
  let start = index;
  for (let previousIndex = index; previousIndex >= 0; previousIndex -= 1) {
    const line = lines[previousIndex];
    if (!line.trim()) continue;
    const lineIndent = indentation(line);
    if (lineIndent <= currentIndent && /^\s*-\s+/.test(line)) {
      start = previousIndex;
      break;
    }
    if (lineIndent < currentIndent) break;
  }

  const stepIndent = indentation(lines[start]);
  let end = lines.length;
  for (let nextIndex = start + 1; nextIndex < lines.length; nextIndex += 1) {
    const line = lines[nextIndex];
    if (!line.trim()) continue;
    const lineIndent = indentation(line);
    if (lineIndent < stepIndent || (lineIndent === stepIndent && /^\s*-\s+/.test(line))) {
      end = nextIndex;
      break;
    }
  }

  return { start, end };
}

function classifyWorkflowUsesStep(source, action, metadataReason = null) {
  const reason = metadataReason ?? `GitHub Action may mutate external state: ${action}`;
  return {
    source,
    command: `uses: ${action}`,
    multiline: false,
    workingDirectory: null,
    packageScriptReason: null,
    safe: false,
    inspectOnlyReason: reason,
    runtimeSafetyReason: metadataReason ?? `GitHub Action may mutate external state: ${formatInlineValue(action)}`,
  };
}

function isRuntimeSafetyAction(action) {
  return /(^|[-_/])(auth|credential|credentials|deploy|login|publish|release)([-_/@]|$)/i.test(action);
}

function collectGenericCiRunCommands(text, source, packageManifests = [], unsafeMakeTargets = new Set(), options = {}) {
  const lines = text.split(/\r?\n/);
  const commands = [];
  const carriesShellPhaseDirectory = isGitLabCiSource(source);
  const ciOptions = (extra = {}) => ({
    ...extra,
    unsafeMakeTargets,
    harnessControls: options.harnessControls,
    harnessValidationCommandsByCommand: options.harnessValidationCommandsByCommand,
    makeTargets: options.makeTargets,
    runtimeSafetyUnsafeMakeTargets: options.runtimeSafetyUnsafeMakeTargets,
    incompleteScan: options.incompleteScan,
  });
  let shellPhaseWorkingDirectory = null;
  let shellPhaseIndent = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      carriesShellPhaseDirectory
      && shellPhaseIndent !== null
      && line.trim()
      && indentation(line) < shellPhaseIndent
    ) {
      shellPhaseWorkingDirectory = null;
      shellPhaseIndent = null;
    }

    const namedShellBlockMatch = line.match(/^\s*(?:sh|bat|powershell|pwsh)\s*(?:\(|\s).*?\bscript\s*:\s*(['"]{3})\s*$/);
    if (namedShellBlockMatch) {
      const blockLines = [];
      const quote = namedShellBlockMatch[1];
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex];
        index = nextIndex;
        if (nextLine.trim().startsWith(quote)) break;
        blockLines.push(nextLine);
      }

      const blockCommand = normalizeRunBlock(blockLines);
      if (blockCommand) commands.push(classifyCiRunCommand(source, blockCommand, true, packageManifests, ciOptions()));
      continue;
    }

    const namedShellInlineMatch = line.match(/^\s*(?:sh|bat|powershell|pwsh)\s*(?:\(|\s).*?\bscript\s*:\s*(['"])(.*?)\1/);
    if (namedShellInlineMatch) {
      commands.push(classifyCiRunCommand(source, namedShellInlineMatch[2].trim(), false, packageManifests, ciOptions()));
      continue;
    }

    const tripleShellMatch = line.match(/^\s*(?:sh|bat|powershell|pwsh)\s+(['"]{3})\s*$/);
    if (tripleShellMatch) {
      const blockLines = [];
      const quote = tripleShellMatch[1];
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex];
        index = nextIndex;
        if (nextLine.trim() === quote) break;
        blockLines.push(nextLine);
      }

      const blockCommand = normalizeRunBlock(blockLines);
      if (blockCommand) commands.push(classifyCiRunCommand(source, blockCommand, true, packageManifests, ciOptions()));
      continue;
    }

    const shellMatch = line.match(/^\s*(?:sh|bat|powershell|pwsh)\s+['"](.+)['"]\s*$/);
    if (shellMatch) {
      commands.push(classifyCiRunCommand(source, shellMatch[1].trim(), false, packageManifests, ciOptions()));
      continue;
    }

    const keyMatch = line.match(/^\s*(?:-\s*)?(run|script|before_script|after_script|inline[-_]?script|command|bash|powershell|pwsh):\s*(.*)\s*$/i);
    if (!keyMatch) continue;

    const keyName = keyMatch[1].toLowerCase();
    const value = keyMatch[2].trim();
    const phaseCarriesDirectory = carriesShellPhaseDirectory && ['before_script', 'script'].includes(keyName);
    const contextualWorkingDirectory = findGenericSameStepWorkingDirectory(lines, index)
      ?? findGenericPreviousSameStepWorkingDirectory(lines, index)
      ?? findGenericWorkingDirectory(lines, index)
      ?? (phaseCarriesDirectory ? shellPhaseWorkingDirectory : null);
    const inlineCommands = parseInlineCommandArray(value);
    if (inlineCommands) {
      let inlineWorkingDirectory = contextualWorkingDirectory;
      for (const inlineCommand of inlineCommands) {
        const command = stripYamlQuotes(inlineCommand);
        const changedDirectory = finalWorkingDirectoryFromShellCommand(command, inlineWorkingDirectory);
        if (changedDirectory !== null) {
          inlineWorkingDirectory = changedDirectory;
          if (phaseCarriesDirectory) {
            shellPhaseWorkingDirectory = changedDirectory;
            shellPhaseIndent = indentation(line);
          }
          commands.push(classifyCiRunCommand(source, command, false, packageManifests, ciOptions()));
        } else {
          commands.push(classifyCiRunCommand(source, command, false, packageManifests, ciOptions({
            workingDirectory: inlineWorkingDirectory,
          })));
        }
      }
      continue;
    }

    if (/^[|>]/.test(value) || value === '') {
      const blockLines = [];
      const nestedCommands = [];
      let blockWorkingDirectory = contextualWorkingDirectory;
      const baseIndent = indentation(line);
      let blockIndent = null;

      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex];
        if (!nextLine.trim()) {
          if (blockLines.length) blockLines.push('');
          continue;
        }

        const nextIndent = indentation(nextLine);
        if (nextIndent <= baseIndent) break;
        if (blockIndent === null) blockIndent = nextIndent;

        const siblingWorkingDirectory = parseGenericWorkingDirectory(nextLine);
        if (nextIndent < blockIndent) {
          if (siblingWorkingDirectory) {
            blockWorkingDirectory = siblingWorkingDirectory;
          } else if (/^\s*(?:displayName|name|when|condition|environment|env|no_output_timeout):\s*/.test(nextLine)) {
            // Same-step metadata after a block scalar, not shell text.
          }
          index = nextIndex;
          continue;
        }

        const listCommand = nextLine.match(/^\s*-\s+(.+?)\s*$/)?.[1];
        if (listCommand) {
          const command = stripYamlQuotes(listCommand.trim());
          if (/^[|>]/.test(command)) {
            const listBlockLines = [];
            const listCommandIndent = indentation(nextLine);
            let listBlockIndent = null;

            for (let listIndex = nextIndex + 1; listIndex < lines.length; listIndex += 1) {
              const listBlockLine = lines[listIndex];
              if (!listBlockLine.trim()) {
                if (listBlockLines.length) listBlockLines.push('');
                continue;
              }

              const listBlockLineIndent = indentation(listBlockLine);
              if (listBlockLineIndent <= listCommandIndent) break;
              if (listBlockIndent === null) listBlockIndent = listBlockLineIndent;
              if (listBlockLineIndent < listBlockIndent) break;
              listBlockLines.push(listBlockLine);
              index = listIndex;
              nextIndex = listIndex;
            }

            const blockCommand = normalizeRunBlock(listBlockLines, { folded: command.startsWith('>') });
            if (blockCommand) {
              commands.push(classifyCiRunCommand(source, blockCommand, true, packageManifests, ciOptions({
                workingDirectory: blockWorkingDirectory,
              })));
              const changedDirectory = finalWorkingDirectoryFromShellCommand(blockCommand, blockWorkingDirectory);
              if (changedDirectory !== null) {
                blockWorkingDirectory = changedDirectory;
                if (phaseCarriesDirectory) {
                  shellPhaseWorkingDirectory = changedDirectory;
                  shellPhaseIndent = indentation(line);
                }
              }
            }
          } else {
            const changedDirectory = finalWorkingDirectoryFromShellCommand(command, blockWorkingDirectory);
            if (changedDirectory !== null) {
              blockWorkingDirectory = changedDirectory;
              if (phaseCarriesDirectory) {
                shellPhaseWorkingDirectory = changedDirectory;
                shellPhaseIndent = indentation(line);
              }
              commands.push(classifyCiRunCommand(source, command, false, packageManifests, ciOptions()));
            } else {
              commands.push(classifyCiRunCommand(source, command, false, packageManifests, ciOptions({
                workingDirectory: blockWorkingDirectory,
              })));
            }
          }
        } else if (siblingWorkingDirectory) {
          const nestedWorkingDirectory = nextLine.match(/^\s*working[-_]directory:\s*(.+?)\s*$/)?.[1];
          if (nestedWorkingDirectory) {
            blockWorkingDirectory = stripYamlQuotes(nestedWorkingDirectory.trim());
          } else {
            blockWorkingDirectory = siblingWorkingDirectory;
          }
        } else if (/^\s*command:\s*/.test(nextLine)) {
          const nestedCommand = nextLine.match(/^\s*command:\s*(.*?)\s*$/)?.[1]?.trim();
          if (/^[|>]/.test(nestedCommand) || nestedCommand === '') {
            const commandBlockLines = [];
            const commandIndent = indentation(nextLine);
            let commandBlockIndent = null;

            for (let commandIndex = nextIndex + 1; commandIndex < lines.length; commandIndex += 1) {
              const commandLine = lines[commandIndex];
              if (!commandLine.trim()) {
                if (commandBlockLines.length) commandBlockLines.push('');
                continue;
              }

              const commandLineIndent = indentation(commandLine);
              if (commandLineIndent <= commandIndent) break;
              if (commandBlockIndent === null) commandBlockIndent = commandLineIndent;
              if (commandLineIndent < commandBlockIndent) break;
              commandBlockLines.push(commandLine);
              index = commandIndex;
              nextIndex = commandIndex;
            }

            const blockCommand = normalizeRunBlock(commandBlockLines);
            if (blockCommand) nestedCommands.push({ command: blockCommand, multiline: true });
          } else if (nestedCommand) {
            nestedCommands.push({ command: stripYamlQuotes(nestedCommand), multiline: false });
          }
        } else if (/^\s*(?:name|when|environment|no_output_timeout):\s*/.test(nextLine)) {
          // CI mapping metadata, not shell text.
        } else {
          blockLines.push(nextLine);
        }
        index = nextIndex;
      }

      let nestedWorkingDirectory = blockWorkingDirectory;
      for (const nestedCommand of nestedCommands) {
        commands.push(classifyCiRunCommand(source, nestedCommand.command, nestedCommand.multiline, packageManifests, ciOptions({
          workingDirectory: nestedWorkingDirectory,
        })));
        const changedDirectory = finalWorkingDirectoryFromShellCommand(nestedCommand.command, nestedWorkingDirectory);
        if (changedDirectory !== null) {
          nestedWorkingDirectory = changedDirectory;
          if (phaseCarriesDirectory) {
            shellPhaseWorkingDirectory = changedDirectory;
            shellPhaseIndent = indentation(line);
          }
        }
      }

      const blockCommand = normalizeRunBlock(blockLines);
      if (blockCommand) {
        commands.push(classifyCiRunCommand(source, blockCommand, true, packageManifests, ciOptions({
          workingDirectory: nestedWorkingDirectory,
        })));
        const changedDirectory = finalWorkingDirectoryFromShellCommand(blockCommand, nestedWorkingDirectory);
        if (changedDirectory !== null && phaseCarriesDirectory) {
          shellPhaseWorkingDirectory = changedDirectory;
          shellPhaseIndent = indentation(line);
        }
      }
    } else {
      const command = stripYamlQuotes(value);
      commands.push(classifyCiRunCommand(source, command, false, packageManifests, ciOptions({
        workingDirectory: contextualWorkingDirectory,
      })));
      const changedDirectory = finalWorkingDirectoryFromShellCommand(command, contextualWorkingDirectory);
      if (changedDirectory !== null && phaseCarriesDirectory) {
        shellPhaseWorkingDirectory = changedDirectory;
        shellPhaseIndent = indentation(line);
      }
    }
  }

  return commands;
}

function isGitLabCiSource(source) {
  return /(^|\/)\.?gitlab-ci\.ya?ml$/i.test(normalizePath(source));
}

function findGenericWorkingDirectory(lines, runIndex) {
  const runIndent = indentation(lines[runIndex]);
  for (let index = runIndex - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const currentIndent = indentation(line);
    if (currentIndent >= runIndent) continue;

    const workingDirectory = parseGenericWorkingDirectory(line);
    if (workingDirectory) return workingDirectory;
    if (currentIndent === 2 && /^\s{2}[\w-]+:\s*$/.test(line)) break;
    if (currentIndent === 0 || /^jobs:\s*$/.test(line)) break;
  }

  return null;
}

function findGenericSameStepWorkingDirectory(lines, runIndex) {
  const runIndent = indentation(lines[runIndex]);
  let nestedIndent = null;

  for (let index = runIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const currentIndent = indentation(line);
    if (currentIndent <= runIndent) break;
    if (nestedIndent === null) nestedIndent = currentIndent;
    if (currentIndent < nestedIndent) break;

    const workingDirectory = parseGenericWorkingDirectory(line);
    if (workingDirectory) return workingDirectory;
  }

  return null;
}

function findGenericPreviousSameStepWorkingDirectory(lines, runIndex) {
  const runIndent = indentation(lines[runIndex]);

  for (let index = runIndex - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const currentIndent = indentation(line);
    if (currentIndent < runIndent) break;
    if (currentIndent > runIndent) continue;

    const workingDirectory = parseGenericWorkingDirectory(line);
    if (workingDirectory) return workingDirectory;
    if (/^\s*-\s+/.test(line)) break;
  }

  return null;
}

function parseGenericWorkingDirectory(line) {
  const match = line.match(/^\s*(?:-\s*)?working[-_]?directory:\s*(.+?)\s*$/i);
  if (!match) return null;
  return stripYamlQuotes(match[1].trim());
}

function parseInlineCommandArray(value) {
  if (!/^\[.*\]$/.test(value)) return null;
  const commands = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (const character of value.slice(1, -1)) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === '\\' && quote) {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ',') {
      const command = current.trim();
      if (command) commands.push(command);
      current = '';
      continue;
    }

    current += character;
  }

  const command = current.trim();
  if (command) commands.push(command);
  return commands;
}

function findWorkflowWorkingDirectory(lines, runIndex) {
  const bounds = findWorkflowStepBounds(lines, runIndex);

  for (let index = bounds.start; index < bounds.end; index += 1) {
    if (index === runIndex) continue;
    const line = lines[index];
    if (!line.trim()) continue;
    if (indentation(line) > bounds.keyIndent) continue;

    const value = parseWorkflowWorkingDirectory(line);
    if (value) return value;
  }

  return findWorkflowDefaultWorkingDirectory(lines, runIndex);
}

function isWorkflowDefaultsRunKey(lines, runIndex) {
  if (!/^\s*run:\s*$/.test(lines[runIndex])) return false;
  const runIndent = indentation(lines[runIndex]);

  for (let index = runIndex - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const currentIndent = indentation(line);
    if (currentIndent < runIndent && /^\s*defaults:\s*$/.test(line)) return true;
    if (currentIndent < runIndent) return false;
  }

  return false;
}

function isWorkflowActionInputRunKey(lines, runIndex) {
  const runIndent = indentation(lines[runIndex]);

  for (let index = runIndex - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const currentIndent = indentation(line);
    if (currentIndent >= runIndent) continue;
    return /^\s*with:\s*$/.test(line);
  }

  return false;
}

function findWorkflowStepBounds(lines, runIndex) {
  const runLine = lines[runIndex];
  const runIndent = indentation(runLine);
  const runStartsStep = /^\s*-\s*run:/.test(runLine);
  let start = runIndex;
  let stepIndent = runIndent;

  if (!runStartsStep) {
    for (let index = runIndex - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line.trim()) continue;

      const currentIndent = indentation(line);
      if (currentIndent < runIndent && /^\s*-\s+/.test(line)) {
        start = index;
        stepIndent = currentIndent;
        break;
      }
      if (currentIndent + 2 < runIndent) break;
    }
  }

  let end = lines.length;
  for (let index = runIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const currentIndent = indentation(line);
    if (currentIndent < stepIndent || (currentIndent === stepIndent && /^\s*-\s+/.test(line))) {
      end = index;
      break;
    }
  }

  return {
    start,
    end,
    keyIndent: runStartsStep ? runIndent + 2 : runIndent,
  };
}

function parseWorkflowWorkingDirectory(line) {
  const match = line.match(/^\s*(?:-\s*)?working-directory:\s*(.+?)\s*$/);
  if (!match) return null;
  return stripYamlQuotes(match[1].trim());
}

function findWorkflowDefaultWorkingDirectory(lines, runIndex) {
  const jobBounds = findWorkflowJobBounds(lines, runIndex);
  for (let index = jobBounds.start; index < jobBounds.end; index += 1) {
    const value = parseWorkflowWorkingDirectory(lines[index]);
    if (!value || !isDefaultsRunWorkingDirectory(lines, index)) continue;
    return value;
  }

  return findWorkflowTopLevelDefaultWorkingDirectory(lines);
}

function findWorkflowJobBounds(lines, runIndex) {
  const start = findWorkflowJobStart(lines, runIndex);
  const startIndent = indentation(lines[start] ?? '');
  let end = lines.length;

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const currentIndent = indentation(line);
    if (currentIndent <= startIndent && !/^jobs:\s*$/.test(line)) {
      end = index;
      break;
    }
  }

  return { start, end };
}

function findWorkflowJobStart(lines, runIndex) {
  for (let index = runIndex - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (isWorkflowJobKey(lines, index)) return index;
    if (indentation(line) === 0 && /^jobs:\s*$/.test(line)) return index;
  }

  return 0;
}

function isWorkflowJobKey(lines, index) {
  const line = lines[index];
  const currentIndent = indentation(line);
  if (!/^\s*[\w.-]+:\s*$/.test(line) || currentIndent === 0) return false;
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previousLine = lines[previousIndex];
    if (!previousLine.trim()) continue;
    if (indentation(previousLine) < currentIndent) return /^jobs:\s*$/.test(previousLine);
  }
  return false;
}

function findWorkflowTopLevelDefaultWorkingDirectory(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const value = parseWorkflowWorkingDirectory(lines[index]);
    if (!value || !isDefaultsRunWorkingDirectory(lines, index, 0)) continue;
    return value;
  }

  return null;
}

function isDefaultsRunWorkingDirectory(lines, workingDirectoryIndex, expectedDefaultsIndent = null) {
  const workingDirectoryIndent = indentation(lines[workingDirectoryIndex]);
  let runIndent = null;

  for (let index = workingDirectoryIndex - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const currentIndent = indentation(line);
    if (runIndent === null) {
      if (currentIndent < workingDirectoryIndent && /^\s*run:\s*$/.test(line)) {
        runIndent = currentIndent;
      } else if (currentIndent < workingDirectoryIndent) {
        return false;
      }
      continue;
    }

    if (currentIndent < runIndent && /^\s*defaults:\s*$/.test(line)) {
      return expectedDefaultsIndent === null || currentIndent === expectedDefaultsIndent;
    }
    if (currentIndent < runIndent) return false;
  }

  return false;
}

function collectHarnessControls(files) {
  return files.filter((path) => {
    const lower = path.toLowerCase();
    return isInstructionFilePath(lower)
      || lower === 'docs/dogfooding.md'
      || lower.includes('/harness')
      || lower.includes('/decisions')
      || lower.includes('/adr/')
      || lower.includes('/contracts/')
      || lower.includes('/agent-runtime')
      || lower.includes('/human-guide')
      || lower.includes('template-fitness')
      || lower.includes('validate-harness')
      || lower.includes('harness-metrics')
      || lower.includes('harness-doctor')
      || lower.includes('harness-health');
  }).sort();
}

function detectInstructionFiles(files, fileSet) {
  return instructionFiles.filter((path) => fileSet.has(path) || files.some((file) => file.startsWith(`${path}/`)));
}

function isInstructionFilePath(path) {
  return instructionFiles.some((file) => {
    const lower = file.toLowerCase();
    return path === lower || path.startsWith(`${lower}/`);
  });
}

function walkFiles(root, options) {
  const paths = [];
  const seen = new Set();
  const maxFiles = options.maxFiles ?? 5000;
  let truncated = false;

  function addPath(path) {
    if (seen.has(path)) return;
    seen.add(path);
    paths.push(path);
  }

  for (const path of [...prioritySurveyPaths, ...packageFiles]) {
    const fullPath = join(root, path);
    try {
      if (existsSync(fullPath) && statSync(fullPath).isFile()) addPath(path);
    } catch {
      // Ignore unreadable priority paths; the normal walk has the same tolerance.
    }
  }

  function walk(dir) {
    if (paths.length >= maxFiles) {
      truncated = true;
      return;
    }

    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries.filter((item) => item.isFile())) {
      if (paths.length >= maxFiles) {
        truncated = true;
        return;
      }

      const fullPath = join(dir, entry.name);
      addPath(normalizePath(relative(root, fullPath)));
    }

    for (const entry of entries.filter((item) => item.isDirectory())) {
      if (paths.length >= maxFiles) {
        truncated = true;
        return;
      }

      if (!ignoredDirectories.has(entry.name)) walk(join(dir, entry.name));
    }
  }

  walk(root);

  return {
    paths: paths.sort(),
    count: paths.length,
    truncated,
  };
}

function readJson(root, path) {
  if (!existsSync(join(root, path))) return null;
  try {
    return JSON.parse(readFileSync(join(root, path), 'utf8'));
  } catch {
    return null;
  }
}

function readText(root, path) {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    return '';
  }
}

function readTemplateVersion() {
  try {
    if (!existsSync(join(repoRoot, 'templates', 'Harness Engineering Bootstrap.md'))
      || !existsSync(join(repoRoot, 'scripts', 'template-fitness.mjs'))) {
      return '0.0.0';
    }
    return readFileSync(join(repoRoot, 'VERSION'), 'utf8').split(/\r?\n/)[0]?.trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function inferPackageManager(fileSet, packageJson = null) {
  const declaredPackageManager = packageManagerFromDeclaration(packageJson);
  if (declaredPackageManager) return declaredPackageManager;

  if (fileSet.has('pnpm-lock.yaml') || fileSet.has('pnpm-workspace.yaml')) return 'pnpm';
  if (fileSet.has('yarn.lock')) return 'yarn';
  if (fileSet.has('bun.lock') || fileSet.has('bun.lockb')) return 'bun';
  return 'npm';
}

function packageManagerForManifest(fileSet, manifest, fallback, packageManifests = []) {
  const declaredPackageManager = packageManagerFromDeclaration(manifest.json);
  if (declaredPackageManager) return declaredPackageManager;

  const directory = manifest.directory;
  if (directory) {
    const ancestorPackageManager = packageManagerFromAncestor(fileSet, packageManifests, directory);
    if (ancestorPackageManager) return ancestorPackageManager;
  }

  return fallback;
}

function packageManagerFromAncestor(fileSet, packageManifests, directory) {
  const manifestsByDirectory = new Map(packageManifests.map((manifest) => [manifest.directory, manifest]));
  let current = normalizePackageDirectory(directory);
  while (current) {
    const declaredPackageManager = packageManagerFromDeclaration(manifestsByDirectory.get(current)?.json);
    if (declaredPackageManager) return declaredPackageManager;
    const lockPackageManager = packageManagerFromDirectoryMetadata(fileSet, current);
    if (lockPackageManager) return lockPackageManager;
    const parent = dirname(current);
    current = parent === '.' || parent === current ? '' : parent;
  }
  return packageManagerFromDirectoryMetadata(fileSet, '');
}

function packageManagerFromDirectoryMetadata(fileSet, directory) {
  const prefix = directory ? `${directory}/` : '';
  if (fileSet.has(`${prefix}pnpm-lock.yaml`) || fileSet.has(`${prefix}pnpm-workspace.yaml`)) return 'pnpm';
  if (fileSet.has(`${prefix}yarn.lock`)) return 'yarn';
  if (fileSet.has(`${prefix}bun.lock`) || fileSet.has(`${prefix}bun.lockb`)) return 'bun';
  if (fileSet.has(`${prefix}package-lock.json`) || fileSet.has(`${prefix}npm-shrinkwrap.json`)) return 'npm';
  return null;
}

function packageManagerFromDeclaration(packageJson = null) {
  const declaredPackageManager = typeof packageJson?.packageManager === 'string'
    ? packageJson.packageManager.toLowerCase()
    : '';

  if (declaredPackageManager.startsWith('pnpm@')) return 'pnpm';
  if (declaredPackageManager.startsWith('yarn@')) return 'yarn';
  if (declaredPackageManager.startsWith('bun@')) return 'bun';
  if (declaredPackageManager.startsWith('npm@')) return 'npm';
  return null;
}

function normalizeReleaseVersion(version) {
  return String(version ?? '')
    .trim()
    .replace(/^refs\/tags\//i, '')
    .replace(/^v(?=\d)/i, '');
}

function samplePaths(items, limit = 5) {
  return sampleValues(dedupe(items.map((item) => item.path)), limit);
}

function sampleHintEvidence(items, limit = 5) {
  return sampleValues(dedupe(items.map((item) => `${item.path} (${item.reason})`)), limit);
}

function healthControlEvidence(survey) {
  return survey.harnessControls.filter((path) => (
    isHarnessValidationControlPath(path)
    || /harness-metrics|harness-health|health-report/i.test(path)
  ));
}

function isHarnessValidationControlPath(path) {
  const value = String(path ?? '').replace(/\\/g, '/');
  if (value.toLowerCase().startsWith('.github/workflows/')) return false;
  return isHarnessValidationExecutableWord(value);
}

function harnessValidationAutomationEvidence(survey, harnessValidationControls = survey.harnessControls?.filter(isHarnessValidationControlPath) ?? []) {
  const commandsByCommand = new Map(survey.commands.map((command) => [command.command, command]));
  const evidence = [];

  for (const run of survey.ci.runCommands.filter(hasHarnessValidationAutomationEvidence)) {
    if (Array.isArray(run.harnessValidationEvidence)) {
      evidence.push(...run.harnessValidationEvidence);
      continue;
    }
    evidence.push(...harnessValidationEvidenceForRun(
      run.source,
      run.command,
      commandsByCommand,
      harnessValidationControls,
    ));
  }

  return dedupe(evidence);
}

function hasHarnessValidationAutomationEvidence(command) {
  if (command.safe) return true;
  return Boolean(
    command.workingDirectory
    && command.harnessValidationSafe
    && Array.isArray(command.harnessValidationEvidence)
    && !command.packageScriptReason
    && !command.packageScriptRuntimeSafetyReason
    && !command.makeTargetRuntimeSafetyReason
    && !command.runtimeSafetyReason
    && command.inspectOnlyReason?.startsWith('it declares working-directory '),
  );
}

function harnessValidationEvidenceForRun(source, command, commandsByCommand, harnessValidationControls = [], baseDirectory = '') {
  const evidence = [];
  let currentDirectory = normalizePackageDirectory(baseDirectory || '');

  for (const part of splitShellCommandParts(command)) {
    const cdCommand = inspectCdCommand(part, currentDirectory);
    if (cdCommand.isCd) {
      if (cdCommand.unsafeReason) return dedupe(evidence);
      currentDirectory = cdCommand.directory;
      continue;
    }

    if (isHarnessValidationCommand(part) && harnessValidationCommandMatchesControl(part, harnessValidationControls, currentDirectory)) {
      evidence.push(`${source}: ${formatInlineValue(part)}`);
      continue;
    }

    const wrapped = wrappedCommandForPart(part, commandsByCommand, currentDirectory);
    const wrappedDirectory = wrappedCommandBaseDirectory(wrapped, currentDirectory);
    const wrappedValidationParts = wrapped?.scriptBody
      ? harnessValidationCommandParts(
        wrapped.scriptBody,
        commandsByCommand,
        new Set([part]),
        harnessValidationControls,
        wrappedDirectory,
      )
      : [];
    if (wrappedValidationParts.length && hasNoOpForwardedPackageScriptArgs(part)) continue;
    for (const wrappedPart of wrappedValidationParts) {
      evidence.push(`${source}: ${formatInlineValue(part)} -> ${formatInlineValue(wrappedPart)}`);
    }
  }

  return dedupe(evidence);
}

function isSafeHarnessValidationCommand(source, command, commandsByCommand, harnessValidationControls = [], baseDirectory = '') {
  let hasHarnessValidationPart = false;
  let currentDirectory = normalizePackageDirectory(baseDirectory || '');

  for (const part of splitShellCommandParts(command)) {
    const cdCommand = inspectCdCommand(part, currentDirectory);
    if (cdCommand.isCd) {
      if (cdCommand.unsafeReason) return false;
      currentDirectory = cdCommand.directory;
      continue;
    }
    if (isHarmlessShellPrelude(part)) continue;

    const partEvidence = harnessValidationEvidenceForRun(source, part, commandsByCommand, harnessValidationControls, currentDirectory);
    if (partEvidence.length) {
      hasHarnessValidationPart = true;
      continue;
    }

    if (isSafeValidationCommandPart(part)) continue;
    return false;
  }

  return hasHarnessValidationPart;
}

function isHarnessValidationCommand(command) {
  return isHarnessValidationExecutableWord(harnessValidationCommandPayloadWord(command));
}

function harnessValidationCommandPayloadWord(command) {
  return harnessValidationCommandPayload(command)?.word ?? null;
}

function harnessValidationCommandPayload(command) {
  const value = String(command ?? '');
  if (/(^|\s)--test(?:\s|$)|\.test\./i.test(value)) return null;
  if (hasShellPipeline(value) || /(^|[^&])&(?!&)/.test(value)) return null;
  const wrapperPayload = shellWrapperPayload(value);
  if (wrapperPayload !== null) return harnessValidationCommandPayload(wrapperPayload);

  const packageExecutorPayload = packageExecutorPayloads(value)
    .map((payload) => harnessValidationCommandPayload(payload))
    .find(Boolean);
  if (packageExecutorPayload) return packageExecutorPayload;

  const words = shellWords(stripPackageCommandPrefix(value));
  if (!words.length) return null;
  const commandWord = words[0]?.toLowerCase();

  if (isHarnessValidationExecutableWord(commandWord)) {
    if (hasHarnessValidationNoOpArgument(words.slice(1))) return null;
    return { word: words[0], index: 0 };
  }
  if (!isHarnessValidationRunner(commandWord)) return null;

  return harnessValidationRunnerPayload(words);
}

function isHarnessValidationScriptBody(body, harnessValidationControls = null, baseDirectory = '') {
  return harnessValidationCommandParts(
    body,
    new Map(),
    new Set(),
    harnessValidationControls,
    baseDirectory,
  ).length > 0;
}

function isHarnessValidationRunner(word) {
  return ['node', 'tsx', 'ts-node', 'python', 'python3', 'bash', 'sh', 'pwsh', 'powershell'].includes(String(word ?? '').toLowerCase());
}

function harnessValidationRunnerPayloadWord(words) {
  return harnessValidationRunnerPayload(words)?.word ?? null;
}

function harnessValidationRunnerPayload(words) {
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (!word || word === '--') continue;
    if (isHarnessValidationNoOpArgument(word)) return null;
    if (runnerPayloadOption(word) && words[index + 1]) {
      if (hasHarnessValidationNoOpArgument(words.slice(index + 2))) return null;
      return { word: stripYamlQuotes(words[index + 1]), index: index + 1 };
    }
    if (runnerOptionConsumesNext(word) && words[index + 1]) {
      index += 1;
      continue;
    }
    if (String(word).startsWith('-')) continue;
    if (hasHarnessValidationNoOpArgument(words.slice(index + 1))) return null;
    return { word: stripYamlQuotes(word), index };
  }
  return null;
}

function hasHarnessValidationNoOpArgument(args) {
  return args.some((arg) => isHarnessValidationNoOpArgument(arg));
}

function isHarnessValidationNoOpArgument(arg) {
  const lower = stripYamlQuotes(String(arg ?? '')).toLowerCase();
  return [
    '--help',
    '-h',
    '/help',
    '/?',
    '-?',
    'help',
    '--version',
    'version',
  ].includes(lower);
}

function runnerPayloadOption(option) {
  return ['-file', '/file'].includes(String(option ?? '').toLowerCase());
}

function runnerOptionConsumesNext(option) {
  const lower = String(option ?? '').toLowerCase();
  if (lower.includes('=')) return false;
  return [
    '-r',
    '--require',
    '--loader',
    '--import',
    '--experimental-loader',
    '--conditions',
    '--env-file',
    '-c',
    '-lc',
    '-command',
    '/command',
    '-configurationname',
    '/configurationname',
    '-encodedcommand',
    '/encodedcommand',
    '-executionpolicy',
    '/executionpolicy',
    '-inputformat',
    '/inputformat',
    '-outputformat',
    '/outputformat',
    '-workingdirectory',
    '/workingdirectory',
  ].includes(lower);
}

function isHarnessValidationExecutableWord(word) {
  const value = stripYamlQuotes(String(word ?? '')).replace(/\\/g, '/').toLowerCase();
  const name = value.split('/').pop() ?? '';
  return /^(template-fitness|validate-harness|harness-audit|harness-doctor)(?:\.(?:mjs|cjs|js|ts|py|sh|ps1|cmd|bat))?$/.test(name);
}

function harnessValidationCommandMatchesControl(command, harnessValidationControls = [], currentDirectory = '') {
  const payloadWord = harnessValidationCommandPayloadWord(command);
  return harnessValidationPayloadMatchesControl(payloadWord, harnessValidationControls, currentDirectory);
}

function harnessValidationPayloadMatchesControl(payloadWord, harnessValidationControls = [], currentDirectory = '') {
  if (!payloadWord || !harnessValidationControls.length) return false;
  const payloadPath = normalizeHarnessValidationPayloadPath(payloadWord);
  const payloadName = payloadPath.split('/').pop() ?? '';
  const directToolName = payloadName.replace(/\.(?:mjs|cjs|js|ts|py|sh|ps1|cmd|bat)$/i, '');
  const payloadIsPath = payloadPath.includes('/') || payloadPath.startsWith('.');
  const payloadCandidates = harnessValidationPayloadPathCandidates(payloadPath, payloadIsPath, currentDirectory);

  return harnessValidationControls.some((control) => {
    const controlPath = normalizeHarnessValidationPayloadPath(control);
    const controlName = controlPath.split('/').pop() ?? '';
    const controlToolName = controlName.replace(/\.(?:mjs|cjs|js|ts|py|sh|ps1|cmd|bat)$/i, '');
    return payloadCandidates.includes(controlPath)
      || (!payloadIsPath && directToolName === controlToolName);
  });
}

function harnessValidationPayloadPathCandidates(payloadPath, payloadIsPath, currentDirectory = '') {
  const normalizedDirectory = normalizePackageDirectory(currentDirectory || '');
  if (!payloadIsPath || !normalizedDirectory || !isRelativeHarnessValidationPayloadPath(payloadPath)) {
    return [payloadPath];
  }
  if (cdTargetEscapesRepo(payloadPath, normalizedDirectory)) return [];
  return [resolvePackageDirectory(payloadPath, normalizedDirectory)];
}

function isRelativeHarnessValidationPayloadPath(payloadPath) {
  return !/^(?:[a-z]:|\/|\/\/|~)/i.test(payloadPath);
}

function normalizeHarnessValidationPayloadPath(value) {
  return stripYamlQuotes(String(value ?? ''))
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .toLowerCase();
}

function harnessValidationCommandParts(command, commandsByCommand = new Map(), visited = new Set(), harnessValidationControls = null, baseDirectory = '') {
  const parts = [];
  let currentDirectory = normalizePackageDirectory(baseDirectory || '');
  for (const part of splitShellCommandParts(command)) {
    const cdCommand = inspectCdCommand(part, currentDirectory);
    if (cdCommand.isCd) {
      if (cdCommand.unsafeReason) return parts;
      currentDirectory = cdCommand.directory;
      continue;
    }

    if (isHarnessValidationCommand(part)
      && (!harnessValidationControls || harnessValidationCommandMatchesControl(part, harnessValidationControls, currentDirectory))) {
      parts.push(part);
      continue;
    }

    const wrapped = wrappedCommandForPart(part, commandsByCommand, currentDirectory);
    if (!wrapped?.scriptBody || visited.has(part)) continue;
    visited.add(part);
    const wrappedParts = harnessValidationCommandParts(
      wrapped.scriptBody,
      commandsByCommand,
      visited,
      harnessValidationControls,
      wrappedCommandBaseDirectory(wrapped, currentDirectory),
    );
    if (wrappedParts.length && hasNoOpForwardedPackageScriptArgs(part)) continue;
    parts.push(...wrappedParts);
  }
  return parts;
}

function wrappedCommandForPart(part, commandsByCommand, currentDirectory = '') {
  const scriptName = packageScriptNameFromCommand(part);
  if (scriptName && hasPackageWrapperContext(part, currentDirectory)) {
    for (const candidate of packageScriptWrapperCommandCandidates(part, currentDirectory)) {
      const wrapped = commandsByCommand.get(candidate);
      if (wrapped) return wrapped;
    }
    return null;
  }

  const exact = commandsByCommand.get(part);
  if (exact) return exact;

  for (const candidate of packageScriptWrapperCommandCandidates(part, currentDirectory)) {
    const wrapped = commandsByCommand.get(candidate);
    if (wrapped) return wrapped;
  }

  return null;
}

function wrappedCommandBaseDirectory(wrapped, fallbackDirectory = '') {
  if (wrapped?.directory !== undefined && wrapped.directory !== null) {
    return normalizePackageDirectory(wrapped.directory || '');
  }
  if (wrapped?.source && /(^|[/\\])package\.json$/i.test(wrapped.source)) {
    const directory = normalizePackageDirectory(dirname(wrapped.source));
    return directory === '.' ? '' : directory;
  }
  return normalizePackageDirectory(fallbackDirectory || '');
}

function hasPackageWrapperContext(part, currentDirectory = '') {
  return Boolean(normalizePackageDirectoryOrRoot(currentDirectory || ''))
    || scopedPackageDirectoryValues(part).length > 0
    || packageWorkspacesFromCommand(part).length > 0;
}

function packageScriptWrapperCommandCandidates(part, currentDirectory = '') {
  const scriptName = packageScriptNameFromCommand(part);
  if (!scriptName) return [];

  const words = shellWords(stripPackageCommandPrefix(part));
  const manager = words[0]?.toLowerCase();
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return [];

  const workspaces = packageWorkspacesFromCommand(part);
  if (workspaces.length) {
    return workspaces.flatMap((workspace) => (
      packageScriptWorkspaceCommandAliasesForSelector(manager, scriptName, workspace)
    ));
  }

  const directories = scopedPackageDirectoryValues(part);
  const currentScope = normalizePackageDirectoryOrRoot(currentDirectory || '');
  const scopes = directories.length ? directories : [currentScope];
  const candidates = scopes.map((directory) => packageScriptCommand(manager, scriptName, directory));
  if (manager === 'yarn' && scriptName !== 'test' && !directories.length && !currentScope) {
    candidates.push(`yarn ${scriptName}`);
  }
  return candidates;
}

function harnessValidationCommandMapForCi(packageManifests = [], makeTargets = []) {
  const commandsByCommand = packageScriptCommandsByCommand(packageManifests);
  for (const target of makeTargets) {
    if (target?.command) commandsByCommand.set(target.command, target);
  }
  return commandsByCommand;
}

function packageScriptCommandsByCommand(packageManifests = []) {
  const commandsByCommand = new Map();
  const managers = ['npm', 'pnpm', 'yarn', 'bun'];

  for (const manifest of packageManifests) {
    const scripts = packageScriptsObject(manifest?.json?.scripts);
    if (!scripts) continue;
    for (const [name, body] of Object.entries(scripts)) {
      for (const manager of managers) {
        const command = packageScriptCommand(manager, name, manifest.directory);
        commandsByCommand.set(command, {
          source: manifest.path,
          command,
          scriptBody: String(body ?? ''),
        });
        for (const alias of packageScriptWorkspaceCommandAliases(manager, name, manifest)) {
          commandsByCommand.set(alias, {
            source: manifest.path,
            command: alias,
            scriptBody: String(body ?? ''),
          });
        }
        if (manager === 'yarn' && name !== 'test' && !manifest.directory) {
          const yarnCommand = `yarn ${name}`;
          commandsByCommand.set(yarnCommand, {
            source: manifest.path,
            command: yarnCommand,
            scriptBody: String(body ?? ''),
          });
        }
      }
    }
  }

  return commandsByCommand;
}

function packageScriptWorkspaceCommandAliases(packageManager, name, manifest) {
  const selectors = packageScriptWorkspaceSelectors(manifest);
  if (!selectors.length) return [];

  return selectors.flatMap((selector) => packageScriptWorkspaceCommandAliasesForSelector(packageManager, name, selector));
}

function packageScriptWorkspaceCommandAliasesForSelector(packageManager, name, selector) {
  const value = quotePath(selector);
  if (packageManager === 'npm') {
    return name === 'test'
      ? [
        `npm test --workspace ${value}`,
        `npm test --workspace=${value}`,
        `npm test -w ${value}`,
        `npm test -w=${value}`,
        `npm --workspace ${value} test`,
        `npm --workspace=${value} test`,
        `npm -w ${value} test`,
        `npm -w=${value} test`,
      ]
      : [
        `npm run ${name} --workspace ${value}`,
        `npm run ${name} --workspace=${value}`,
        `npm run ${name} -w ${value}`,
        `npm run ${name} -w=${value}`,
        `npm --workspace ${value} run ${name}`,
        `npm --workspace=${value} run ${name}`,
        `npm -w ${value} run ${name}`,
        `npm -w=${value} run ${name}`,
      ];
  }
  if (packageManager === 'pnpm') {
    return name === 'test'
      ? [
        `pnpm --filter ${value} test`,
        `pnpm --filter=${value} test`,
        `pnpm -F ${value} test`,
        `pnpm -F=${value} test`,
      ]
      : [
        `pnpm --filter ${value} run ${name}`,
        `pnpm --filter=${value} run ${name}`,
        `pnpm -F ${value} run ${name}`,
        `pnpm -F=${value} run ${name}`,
      ];
  }
  if (packageManager === 'yarn') {
    return name === 'test'
      ? [`yarn workspace ${value} test`]
      : [
        `yarn workspace ${value} run ${name}`,
        `yarn workspace ${value} ${name}`,
      ];
  }
  return [];
}

function packageScriptWorkspaceSelectors(manifest) {
  if (!manifest?.directory) return [];
  return dedupe([
    manifest.json?.name,
    manifest.directory,
    basename(manifest.directory),
  ].filter(Boolean));
}

function sampleValues(items, limit = 5) {
  return [...items].slice(0, limit);
}

function formatList(items) {
  if (!items || !items.length) return 'none detected';
  return items.map((item) => `\`${formatInlineValue(item)}\``).join(', ');
}

function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

function quotePath(path) {
  const value = String(path);
  if (!/[\s\\'"$&|;<>(){}\[\]*?!#~`]/.test(value)) return value;
  return `"${value.replace(/(["$`])/g, '\\$1')}"`;
}

function buildPlannerCommand(repoPath, options = {}) {
  const plannerPath = join(repoRoot, 'scripts', 'harness-bootstrap-plan.mjs');
  const parts = [
    'node',
    quotePath(plannerPath),
    '--repo',
    quotePath(repoPath),
  ];

  if (options.operation === 'update') {
    parts.push('--mode', 'update');
    if (options.targetVersion) parts.push('--target-version', quotePath(options.targetVersion));
    if (options.currentVersionOverride) parts.push('--current-version', quotePath(options.currentVersionOverride));
  } else if (options.operation === 'bootstrap') {
    parts.push('--mode', 'bootstrap');
  }

  if (options.json) parts.push('--json');
  if (options.date) parts.push('--date', options.date);

  return parts.join(' ');
}

function formatInlineValue(value) {
  return String(value).replace(/\s*\r?\n\s*/g, ' && ');
}

function slugify(value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'repository';
}

function stripYamlQuotes(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function indentation(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function normalizeRunBlock(lines, options = {}) {
  const nonEmpty = lines.filter((line) => line.trim());
  if (!nonEmpty.length) return '';

  const minIndent = Math.min(...nonEmpty.map((line) => indentation(line)));
  const normalizedLines = lines
    .map((line) => line.slice(Math.min(minIndent, line.length)).trim())
    .filter((line) => line && !line.startsWith('#'));
  return normalizedLines.join(options.folded ? ' ' : '\n');
}

function classifyCiRunCommand(source, command, multiline, packageManifests = [], options = {}) {
  const workingDirectory = options.workingDirectory ?? null;
  const runtimeSafetyReason = options.runtimeSafetyReason ?? null;
  const unsafeMakeTargets = options.unsafeMakeTargets ?? new Set();
  const runtimeSafetyUnsafeMakeTargets = options.runtimeSafetyUnsafeMakeTargets ?? unsafeMakeTargets;
  const workingDirectoryReason = workingDirectory
    ? `it declares working-directory ${formatInlineValue(workingDirectory)}; inspect and run from that directory manually`
    : null;
  const makeTargetReason = unsafeMakeTargetReason(command, unsafeMakeTargets, workingDirectory);
  const makeTargetRuntimeSafetyReason = unsafeMakeTargetReason(command, runtimeSafetyUnsafeMakeTargets, workingDirectory);
  const packageManifest = packageManifestForCommand(command, packageManifests, workingDirectory);
  const packageScriptReason = unsafePackageScriptReason(command, packageManifest, packageManifests, {
    unsafeMakeTargets,
    incompleteScan: options.incompleteScan,
    currentDirectory: workingDirectory ?? '',
  });
  const packageScriptRuntimeSafetyReason = unsafePackageScriptReason(command, packageManifest, packageManifests, {
    unsafeMakeTargets: runtimeSafetyUnsafeMakeTargets,
    incompleteScan: options.incompleteScan,
    currentDirectory: workingDirectory ?? '',
    runtimeSafety: true,
  });
  const harnessValidationEvidence = harnessValidationEvidenceForRun(
    source,
    command,
    options.harnessValidationCommandsByCommand ?? harnessValidationCommandMapForCi(packageManifests, options.makeTargets ?? []),
    options.harnessControls ?? [],
    workingDirectory ?? '',
  );
  const harnessValidationSafe = isSafeHarnessValidationCommand(
    source,
    command,
    options.harnessValidationCommandsByCommand ?? harnessValidationCommandMapForCi(packageManifests, options.makeTargets ?? []),
    options.harnessControls ?? [],
    workingDirectory ?? '',
  );
  const incompleteScanReason = options.incompleteScan && commandNeedsCompleteScan(command)
    ? 'it depends on package, workspace, or make targets that may be omitted by the truncated repository scan'
    : null;
  const safeValidationCommand = isSafeValidationCommand(command);
  const safe = !workingDirectoryReason
    && !runtimeSafetyReason
    && !makeTargetReason
    && !packageScriptReason
    && !incompleteScanReason
    && (
      (safeValidationCommand && !hasHarnessValidationCommandText(command))
      || harnessValidationSafe
    );
  return {
    source,
    command,
    multiline,
    workingDirectory,
    packageScriptReason,
    packageScriptRuntimeSafetyReason,
    makeTargetRuntimeSafetyReason,
    runtimeSafetyReason,
    safe,
    ...(harnessValidationEvidence.length ? { harnessValidationEvidence } : {}),
    ...(harnessValidationSafe ? { harnessValidationSafe } : {}),
    inspectOnlyReason: safe
      ? null
      : workingDirectoryReason
        || runtimeSafetyReason
        || makeTargetReason
        || packageScriptReason
        || incompleteScanReason
        || 'it is not a known-safe validation command or it may mutate external state',
  };
}

function hasHarnessValidationCommandText(command) {
  return harnessValidationCommandParts(command).length > 0;
}

function packageScriptRunsHarnessValidation(command, packageManifest, packageManifests = [], currentDirectory = '') {
  const scriptName = packageScriptNameFromCommand(command);
  if (!scriptName) return false;
  const commandsByCommand = packageScriptCommandsByCommand(packageManifests);

  for (const targetManifest of packageScriptManifestsForCommand(
    command,
    packageManifest,
    packageManifests,
    currentDirectory,
  )) {
    const scripts = packageScriptsObject(targetManifest?.json?.scripts);
    if (!scripts || !Object.hasOwn(scripts, scriptName)) continue;
    if (harnessValidationCommandParts(
      scripts[scriptName],
      commandsByCommand,
      new Set([command]),
    ).length) return true;
  }

  return false;
}

function makeTargetRunsHarnessValidation(command, makeTargets = []) {
  const targetsByCommand = new Map(makeTargets.map((target) => [target.command, target]));
  return splitShellCommandParts(command).some((part) => {
    const target = targetsByCommand.get(part);
    return target?.scriptBody && isHarnessValidationScriptBody(target.scriptBody);
  });
}

function unsafeMakeTargetReason(command, unsafeMakeTargets, baseDirectory = '') {
  return unsafeMakeTargetReasonFromDirectory(command, unsafeMakeTargets, baseDirectory);
}

function unsafeMakeTargetReasonFromDirectory(command, unsafeMakeTargets, baseDirectory = '') {
  let currentDirectory = normalizePackageDirectory(baseDirectory || '');
  for (const part of splitShellCommandParts(command)) {
    const cdCommand = inspectCdCommand(part, currentDirectory);
    if (cdCommand.isCd) {
      if (cdCommand.unsafeReason) return cdCommand.unsafeReason;
      currentDirectory = cdCommand.directory;
      continue;
    }

    const invocation = makeInvocationFromCommandPart(part, currentDirectory);
    if (!invocation) continue;
    if (invocation.unsafeReason) return invocation.unsafeReason;
    const targetDirectories = makeInvocationTargetDirectories(invocation);
    const defaultDirectory = targetDirectories.find((directory) => (
      !invocation.targets.length && unsafeMakeTargets.has(makeDefaultTargetKey(directory))
    ));
    if (defaultDirectory !== undefined) {
      const location = defaultDirectory ? ` in ${formatInlineValue(defaultDirectory)}` : '';
      return `it calls the default make target${location} whose recipe may mutate external state`;
    }
    const targetMatch = invocation.targets.flatMap((target) => (
      targetDirectories.map((directory) => ({ target, directory }))
    )).find((candidate) => unsafeMakeTargets.has(makeTargetKey(candidate.directory, candidate.target)));
    if (targetMatch) {
      const location = targetMatch.directory ? ` in ${formatInlineValue(targetMatch.directory)}` : '';
      const { target } = targetMatch;
      return `it calls make target "${target}"${location} whose recipe may mutate external state`;
    }
    const authorityTarget = invocation.targets.find((target) => isAuthorityMakeTargetName(target));
    if (authorityTarget) {
      return `it calls unresolved authority make target "${authorityTarget}"; inspect before running`;
    }
  }

  return null;
}

function makeInvocationTargetDirectories(invocation) {
  return dedupe([invocation.directory, ...(invocation.makefileDirectories ?? [])].map((directory) => normalizePackageDirectory(directory || '')));
}

function makeInvocationFromCommandPart(part, currentDirectory = '') {
  const words = shellWords(stripPackageCommandPrefix(part));
  if (!isMakeCommandWord(words[0])) return null;

  let directory = normalizePackageDirectory(currentDirectory || '');
  const makefileDirectories = [];
  const targets = [];
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (word === '-C' || word === '--directory') {
      const next = words[index + 1];
      if (next) {
        const inspectedDirectory = inspectMakeDirectoryOption(next, directory);
        if (inspectedDirectory.unsafeReason) return { directory, targets, unsafeReason: inspectedDirectory.unsafeReason };
        directory = inspectedDirectory.directory;
        index += 1;
      }
      continue;
    }

    const compactDirectoryMatch = word.match(/^-C(.+)$/);
    if (compactDirectoryMatch) {
      const inspectedDirectory = inspectMakeDirectoryOption(compactDirectoryMatch[1], directory);
      if (inspectedDirectory.unsafeReason) return { directory, targets, unsafeReason: inspectedDirectory.unsafeReason };
      directory = inspectedDirectory.directory;
      continue;
    }

    const directoryMatch = word.match(/^--directory=(.+)$/);
    if (directoryMatch) {
      const inspectedDirectory = inspectMakeDirectoryOption(directoryMatch[1], directory);
      if (inspectedDirectory.unsafeReason) return { directory, targets, unsafeReason: inspectedDirectory.unsafeReason };
      directory = inspectedDirectory.directory;
      continue;
    }

    if (word === '-f' || word === '--file' || word === '--makefile') {
      const next = words[index + 1];
      if (next) {
        const inspectedMakefile = inspectMakefileOption(next, directory);
        if (inspectedMakefile.unsafeReason) return { directory, targets, unsafeReason: inspectedMakefile.unsafeReason };
        makefileDirectories.push(inspectedMakefile.directory);
        index += 1;
      }
      continue;
    }

    const compactMakefileOptionMatch = word.match(/^-f(.+)$/);
    if (compactMakefileOptionMatch) {
      const inspectedMakefile = inspectMakefileOption(compactMakefileOptionMatch[1], directory);
      if (inspectedMakefile.unsafeReason) return { directory, targets, unsafeReason: inspectedMakefile.unsafeReason };
      makefileDirectories.push(inspectedMakefile.directory);
      continue;
    }

    const makefileMatch = word.match(/^(?:--file|--makefile)=(.+)$/);
    if (makefileMatch) {
      const inspectedMakefile = inspectMakefileOption(makefileMatch[1], directory);
      if (inspectedMakefile.unsafeReason) return { directory, targets, unsafeReason: inspectedMakefile.unsafeReason };
      makefileDirectories.push(inspectedMakefile.directory);
      continue;
    }

    if (makeOptionConsumesNext(word)) {
      if (words[index + 1]) index += 1;
      continue;
    }

    if (makeOptionHasInlineValue(word)) continue;

    if (word.startsWith('-') || word.includes('=')) continue;
    targets.push(word);
  }

  return { directory, makefileDirectories: dedupe(makefileDirectories), targets };
}

function inspectMakeDirectoryOption(value, currentDirectory) {
  const directory = stripYamlQuotes(String(value ?? '').trim());
  if (!isStaticRelativeDirectory(directory)) {
    return {
      directory: normalizePackageDirectory(currentDirectory || ''),
      unsafeReason: 'it changes make directory through a dynamic or non-relative path',
    };
  }
  if (cdTargetEscapesRepo(directory, currentDirectory)) {
    return {
      directory: normalizePackageDirectory(currentDirectory || ''),
      unsafeReason: 'it changes make directory outside the surveyed repository',
    };
  }
  return {
    directory: resolvePackageDirectory(directory, currentDirectory),
    unsafeReason: null,
  };
}

function inspectMakefileOption(value, currentDirectory) {
  const file = stripYamlQuotes(String(value ?? '').trim());
  if (!isStaticRelativeDirectory(file)) {
    return {
      directory: normalizePackageDirectory(currentDirectory || ''),
      unsafeReason: 'it uses a dynamic or non-relative makefile path',
    };
  }
  if (cdTargetEscapesRepo(file, currentDirectory)) {
    return {
      directory: normalizePackageDirectory(currentDirectory || ''),
      unsafeReason: 'it uses a makefile path outside the surveyed repository',
    };
  }
  return {
    directory: makefileDirectoryForOption(file, currentDirectory),
    unsafeReason: null,
  };
}

function makefileDirectoryForOption(value, currentDirectory) {
  const normalized = normalizePackageDirectory(value);
  const makefileDirectory = dirname(normalized);
  if (makefileDirectory === '.') return normalizePackageDirectory(currentDirectory || '');
  return resolvePackageDirectory(makefileDirectory, currentDirectory);
}

function makeOptionConsumesNext(option) {
  const raw = String(option ?? '');
  const lower = String(option ?? '').toLowerCase();
  return [
    '-f',
    '--file',
    '--makefile',
    '-j',
    '--jobs',
    '-l',
    '--load-average',
    '--max-load',
    '-o',
    '--old-file',
    '--assume-old',
    '--what-if',
    '--new-file',
    '--assume-new',
    '--eval',
  ].includes(lower)
    || raw === '-I'
    || raw === '-W';
}

function makeOptionHasInlineValue(option) {
  const raw = String(option ?? '');
  const lower = raw.toLowerCase();
  return /^-(?:[fjlo]\S+|I\S+|W\S+)/.test(raw)
    || /^(--file|--makefile|--directory|--include-dir|--jobs|--load-average|--max-load|--old-file|--assume-old|--what-if|--new-file|--assume-new|--eval)=/.test(lower);
}

function isMakeCommandWord(word) {
  return ['make', '$(MAKE)', '${MAKE}'].includes(String(word ?? '').replace(/^[@+-]+/, ''));
}

function makeTargetsFromCommandPart(part) {
  return makeInvocationFromCommandPart(part)?.targets ?? [];
}

function isSafeValidationCommand(command) {
  if (hasShellPipeline(command)) return false;

  const parts = splitShellCommandParts(command);
  if (!parts.length) return false;

  let hasValidationPart = false;
  for (const part of parts) {
    if (workingDirectoryFromCdCommand(part)) continue;
    if (isHarmlessShellPrelude(part)) continue;
    if (!isSafeValidationCommandPart(part)) return false;
    hasValidationPart = true;
  }
  return hasValidationPart;
}

function hasDangerousCommand(command) {
  return splitShellCommandParts(String(command ?? ''))
    .flatMap(splitShellPipelineParts)
    .some((part) => {
      const inspectedPart = stripPackageCommandPrefix(part);
      return !isSafeValidationCommandPart(part)
        && (
          hasDangerousCliVerb(inspectedPart)
          || hasDangerousPackageManagerCommand(inspectedPart)
          || hasDangerousPackageExecutorPayload(inspectedPart)
          || hasDangerousReleaseToolCommand(inspectedPart)
          || hasDangerousForwardedPackageScriptArgs(inspectedPart)
          || hasDangerousAwsCommand(inspectedPart)
          || hasDangerousCloudCommand(inspectedPart)
          || hasDangerousDockerCommand(inspectedPart)
          || hasDangerousGitCommand(inspectedPart)
          || hasDangerousGhCommand(inspectedPart)
          || hasDangerousHttpCommand(inspectedPart)
          || hasDangerousRmCommand(inspectedPart)
          || hasTerraformFmtWriteCommand(inspectedPart)
          || hasDangerousForwardedTarget(inspectedPart)
          || hasDangerousTaskTarget(inspectedPart)
          || dangerousCommandPatterns.some((pattern) => pattern.test(inspectedPart.toLowerCase()))
          || commandPartReferencesRuntimeSurface(inspectedPart)
        );
    });
}

function hasDangerousCliVerb(part) {
  const words = shellWords(part).map((word) => word.toLowerCase());
  let commandIndex = 0;
  if (['npx', 'bunx'].includes(words[commandIndex])) {
    commandIndex = skipPackageExecutorOptions(words, commandIndex + 1);
  } else {
    commandIndex = packageManagerExecCommandIndex(words)
      ?? packageManagerShimCommandIndex(words)
      ?? packageManagerRunPayloadCommandIndex(words)
      ?? commandIndex;
  }
  const command = words[commandIndex];
  const args = words.slice(commandIndex + 1);
  const mutatingVerbs = {
    kubectl: new Set(['apply', 'create', 'delete', 'replace', 'rollout', 'scale', 'patch', 'set', 'annotate', 'label', 'drain', 'taint', 'expose', 'autoscale', 'exec']),
    helm: new Set(['upgrade', 'install', 'uninstall', 'delete', 'rollback']),
    pulumi: new Set(['up', 'destroy', 'cancel', 'refresh', 'import']),
    terraform: new Set(['apply', 'destroy', 'import', 'taint', 'untaint', 'force-unlock']),
    serverless: new Set(['deploy', 'remove', 'rollback']),
    sls: new Set(['deploy', 'remove', 'rollback']),
    sam: new Set(['deploy', 'delete']),
    cdk: new Set(['deploy', 'destroy']),
    amplify: new Set(['publish']),
    heroku: new Set(['container:push', 'deploy:jar', 'deploy:war']),
    vercel: new Set(['deploy']),
    fly: new Set(['deploy']),
    netlify: new Set(['deploy']),
    wrangler: new Set(['deploy', 'publish']),
    firebase: new Set(['deploy']),
    railway: new Set(['up']),
  };
  if (!mutatingVerbs[command]) return false;
  const verbs = stripCliGlobalOptions(args, command);
  if (command === 'vercel' && !verbs.length) return !isCliInfoOnly(args);
  if (command === 'firebase') return verbs.some((verb) => verb.split(':').includes('deploy'));
  return verbs.some((verb) => mutatingVerbs[command].has(verb));
}

function packageManagerExecCommandIndex(words) {
  const manager = words[0]?.toLowerCase();
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return null;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word || word === '--') return null;
    if (word.startsWith('-')) {
      if (packageManagerOptionConsumesNext(word, manager) && words[index + 1]) index += 1;
      continue;
    }
    if (manager === 'npm' && ['exec', 'x'].includes(lower)) return skipPackageExecutorOptions(words, index + 1);
    if (['pnpm', 'yarn'].includes(manager) && ['exec', 'dlx'].includes(lower)) {
      return skipPackageExecutorOptions(words, index + 1);
    }
    if (manager === 'bun' && lower === 'x') return skipPackageExecutorOptions(words, index + 1);
    return null;
  }
  return null;
}

function isCliInfoOnly(args) {
  return args.length > 0 && args.every((arg) => ['-h', '--help', '-v', '--version'].includes(String(arg ?? '').toLowerCase()));
}

function hasDangerousPackageManagerCommand(part) {
  const words = shellWords(part);
  const manager = words[0]?.toLowerCase();
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return false;

  const args = packageManagerArgsAfterOptions(words, 1, manager);
  const command = args[0]?.toLowerCase();
  if (!command) return false;
  if (manager === 'yarn' && command === 'npm') {
    const yarnNpmCommand = packageManagerArgsAfterOptions(args, 1, 'npm')[0]?.toLowerCase();
    return ['login', 'publish'].includes(yarnNpmCommand);
  }
  if (manager === 'npm' && command === 'dist-tag') {
    const distTagCommand = packageManagerArgsAfterOptions(args, 1, manager)[0]?.toLowerCase();
    return ['add', 'rm', 'remove'].includes(distTagCommand);
  }
  const mutatingCommands = {
    npm: new Set(['access', 'adduser', 'deprecate', 'login', 'owner', 'publish', 'team', 'token', 'unpublish', 'version']),
    pnpm: new Set(['login', 'publish', 'version']),
    yarn: new Set(['publish', 'version']),
    bun: new Set(['publish']),
  };
  return Boolean(mutatingCommands[manager]?.has(command));
}

function packageManagerArgsAfterOptions(words, startIndex, manager = words[0]?.toLowerCase()) {
  const args = [];
  for (let index = startIndex; index < words.length; index += 1) {
    const word = words[index];
    if (!word) continue;
    if (word === '--') {
      args.push(...words.slice(index + 1));
      break;
    }
    if (word.startsWith('-')) {
      if (packageManagerOptionConsumesNext(word, manager) && words[index + 1]) index += 1;
      continue;
    }
    args.push(word);
  }
  return args;
}

function packageManagerOptionConsumesNext(option, manager = '') {
  const lower = option.toLowerCase();
  if (lower.includes('=')) return false;
  if (manager === 'pnpm' && lower === '-w') return false;
  if (['-c', '-f'].includes(lower)) return manager === 'pnpm';
  if (lower.startsWith('--config.')) return true;
  return [
    '-w',
    '--access',
    '--cache',
    '--config',
    '--cwd',
    '--dir',
    '--filter',
    '--otp',
    '--prefix',
    '--registry',
    '--tag',
    '--userconfig',
    '--workspace',
  ].includes(lower);
}

function hasDangerousTaskTarget(part) {
  return packageScriptNamesFromTaskRunnerCommand(part).some(isAuthorityPackageScript);
}

function hasDangerousForwardedTarget(part) {
  return /(?:^|\s)--target(?:=|\s+)(?:deploy|release|publish|provision)(?:\b|[:._-])/i.test(String(part ?? ''));
}

function taskRunnerInvocation(part) {
  const words = shellWords(stripPackageCommandPrefix(part));
  const lower = words.map((word) => word.toLowerCase());
  let index = 0;

  if (['npx', 'bunx'].includes(lower[index])) {
    index = skipPackageExecutorOptions(words, index + 1);
  } else {
    index = packageManagerExecCommandIndex(words) ?? packageManagerShimCommandIndex(words) ?? index;
  }

  if (!['nx', 'turbo', 'moon', 'lage'].includes(lower[index])) return null;
  return { runner: lower[index], words: words.slice(index) };
}

function packageManagerShimCommandIndex(words) {
  const manager = words[0]?.toLowerCase();
  if (!['pnpm', 'yarn', 'bun'].includes(manager)) return null;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word || word === '--') return null;
    if (word.startsWith('-')) {
      if (packageManagerOptionConsumesNext(word, manager) && words[index + 1]) index += 1;
      continue;
    }
    if (['add', 'ci', 'dlx', 'exec', 'install', 'publish', 'remove', 'run', 'test'].includes(lower)) return null;
    return index;
  }
  return null;
}

function packageManagerRunPayloadCommandIndex(words) {
  const manager = words[0]?.toLowerCase();
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return null;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word || word === '--') return null;
    if (word.startsWith('-')) {
      if (packageManagerOptionConsumesNext(word, manager) && words[index + 1]) index += 1;
      continue;
    }
    if (['run', 'run-script'].includes(lower)) return words[index + 1] ? index + 1 : null;
    return null;
  }
  return null;
}

function skipPackageExecutorOptions(words, startIndex) {
  let index = startIndex;
  while (index < words.length && words[index]?.startsWith('-')) {
    const option = words[index].toLowerCase();
    if (!option.includes('=') && packageExecutorOptionConsumesNext(option) && words[index + 1]) index += 2;
    else index += 1;
  }
  return index;
}

function hasDangerousPackageExecutorPayload(part) {
  return packageExecutorPayloads(part).some((payload) => hasDangerousCommand(payload));
}

function packageExecutorPayloads(part) {
  const words = shellWords(stripPackageCommandPrefix(part));
  const startIndex = packageExecutorOptionStart(words);
  if (startIndex == null) return [];

  for (let index = startIndex; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word) continue;
    if (word === '--') return [words.slice(index + 1).join(' ')].filter(Boolean);
    if (lower === '-c' || lower === '--call') return [words.slice(index + 1).join(' ')].filter(Boolean);
    if (lower.startsWith('--call=')) return [[word.slice('--call='.length), ...words.slice(index + 1)].join(' ')].filter(Boolean);
    if (word.startsWith('-') && packageExecutorOptionConsumesNext(word) && words[index + 1]) index += 1;
    else if (!word.startsWith('-')) return [words.slice(index).join(' ')].filter(Boolean);
  }
  return [];
}

function packageExecutorOptionStart(words) {
  const manager = words[0]?.toLowerCase();
  if (['npx', 'bunx'].includes(manager)) return 1;
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return null;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word || word === '--') return null;
    if (word.startsWith('-')) {
      if (packageManagerOptionConsumesNext(word, manager) && words[index + 1]) index += 1;
      continue;
    }
    if (manager === 'npm' && ['exec', 'x'].includes(lower)) return index + 1;
    if (['pnpm', 'yarn'].includes(manager) && ['exec', 'dlx'].includes(lower)) return index + 1;
    if (manager === 'bun' && lower === 'x') return index + 1;
    return null;
  }
  return null;
}

function packageExecutorOptionConsumesNext(option) {
  const lower = String(option ?? '').toLowerCase();
  if (lower.includes('=')) return false;
  if (lower.startsWith('--config.')) return true;
  return [
    '-c',
    '-p',
    '-w',
    '--cache',
    '--call',
    '--config',
    '--cwd',
    '--dir',
    '--filter',
    '--package',
    '--prefix',
    '--registry',
    '--tag',
    '--userconfig',
    '--workspace',
  ].includes(lower);
}

function hasDangerousReleaseToolCommand(part) {
  const words = shellWords(stripPackageCommandPrefix(part)).map((word) => stripYamlQuotes(word).toLowerCase());
  const commandIndex = releaseToolCommandIndex(words);
  if (commandIndex == null) return false;
  const command = words[commandIndex];
  if (['semantic-release', 'release-it'].includes(command)) return true;
  return command === 'changeset' && words[commandIndex + 1] === 'publish';
}

function releaseToolCommandIndex(words) {
  const manager = words[0]?.toLowerCase();
  if (['npx', 'bunx'].includes(manager)) return skipPackageExecutorOptions(words, 1);
  const execCommandIndex = packageManagerExecCommandIndex(words);
  if (execCommandIndex != null) return execCommandIndex;
  if (['pnpm', 'yarn', 'bun'].includes(manager) && words[1] === 'changeset') return 1;
  return 0;
}

function hasDangerousForwardedPackageScriptArgs(part) {
  const args = forwardedPackageScriptArgs(part);
  if (!args.length) return false;
  const text = args.join(' ');
  return /(?:^|\s)--push(?:=|\s|$)/i.test(text)
    || hasWriteModeFlag(args)
    || hasDangerousForwardedTarget(text)
    || dangerousCommandPatterns.some((pattern) => pattern.test(text.toLowerCase()));
}

function forwardedPackageScriptArgs(part) {
  const words = shellWords(stripPackageCommandPrefix(part));
  const separatorIndex = words.indexOf('--');
  if (separatorIndex < 0 || separatorIndex >= words.length - 1) return [];
  const lower = words.slice(0, separatorIndex).map((word) => word.toLowerCase());
  const manager = lower[0];
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return [];
  if (lower.some((word) => ['exec', 'dlx'].includes(word))) return [];
  if (lower.includes('run') || lower.includes('run-script')) return words.slice(separatorIndex + 1);
  return lower.some((word) => validationScriptCommandNames.has(word))
    ? words.slice(separatorIndex + 1)
    : [];
}

function hasDangerousAwsCommand(part) {
  const words = shellWords(part).map((word) => word.toLowerCase());
  if (words[0] !== 'aws') return false;
  const args = stripCliGlobalOptions(words.slice(1));
  const [service, operation] = args;
  if ((service === 's3' || service === 's3api') && ['sync', 'cp', 'mv', 'rm', 'rb', 'mb', 'put', 'delete', 'create', 'update'].includes(operation)) {
    return true;
  }
  return args.some((word) => ['put', 'delete', 'create', 'deploy', 'publish', 'update'].includes(word));
}

function hasDangerousCloudCommand(part) {
  const words = shellWords(part).map((word) => stripYamlQuotes(word).toLowerCase());
  const command = words[0];
  const args = stripCliGlobalOptions(words.slice(1), command);

  if (command === 'az') return hasDangerousAzureCommand(args);
  if (command === 'gcloud') return hasDangerousGcloudCommand(args);
  if (command === 'gsutil') return hasDangerousGsutilCommand(args);
  if (command === 'supabase') return hasDangerousSupabaseCommand(args);
  return false;
}

function hasDangerousAzureCommand(args) {
  if (args.some((word) => [
    'build',
    'config-zip',
    'create',
    'delete',
    'deploy',
    'import',
    'purge',
    'restore',
    'restart',
    'scale',
    'set',
    'start',
    'stop',
    'update',
    'upload',
    'up',
  ].includes(word))) {
    return true;
  }

  return (['webapp', 'functionapp'].includes(args[0]) && args[1] === 'deployment')
    || (args[0] === 'acr' && args[1] === 'build')
    || (args[0] === 'containerapp' && args[1] === 'up');
}

function hasDangerousGcloudCommand(args) {
  if (args[0] === 'builds' && args[1] === 'submit') return true;
  if (args[0] === 'storage' && ['cp', 'mv', 'rm', 'rsync'].includes(args[1])) return true;
  return args.some((word) => ['create', 'delete', 'deploy', 'submit', 'update'].includes(word));
}

function hasDangerousGsutilCommand(args) {
  return ['acl', 'cors', 'cp', 'iam', 'lifecycle', 'mb', 'mv', 'notification', 'rb', 'rm', 'rsync', 'setmeta']
    .includes(args[0]);
}

function hasDangerousSupabaseCommand(args) {
  return (args[0] === 'db' && args[1] === 'push')
    || (args[0] === 'functions' && args[1] === 'deploy')
    || (args[0] === 'secrets' && ['set', 'unset'].includes(args[1]));
}

function hasDangerousDockerCommand(part) {
  const words = shellWords(part).map((word) => word.toLowerCase());
  if (words[0] === 'docker-compose') {
    const args = stripCliGlobalOptions(words.slice(1), 'docker');
    return hasDangerousComposeCommand(args, words);
  }
  if (words[0] !== 'docker') return false;
  const args = stripCliGlobalOptions(words.slice(1), 'docker');
  if (['push', 'login'].includes(args[0])) return true;
  if (args[0] === 'image' && args[1] === 'push') return true;
  if (args[0] === 'manifest' && args[1] === 'push') return true;
  if (args[0] === 'compose' && hasDangerousComposeCommand(args.slice(1), words)) return true;
  if (args[0] === 'build') return words.some(isDockerPushOption) || hasDockerPublishingOutput(words);
  if (args[0] !== 'buildx') return false;
  if (args[1] === 'imagetools' && args[2] === 'create') return true;
  return ['build', 'bake'].includes(args[1])
    && (words.some(isDockerPushOption) || hasDockerPublishingOutput(words));
}

function hasDangerousComposeCommand(args, words = args) {
  const command = firstComposeCommand(args);
  return ['push', 'up'].includes(command)
    || (command === 'build' && words.some(isDockerPushOption));
}

function isDockerPushOption(word) {
  return word === '--push' || word.startsWith('--push=');
}

function hasDockerPublishingOutput(args) {
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]?.toLowerCase() ?? '';
    if (word === '--output' || word === '-o') {
      if (isDockerPublishingOutputValue(args[index + 1])) return true;
      index += 1;
      continue;
    }
    if (word.startsWith('--output=') && isDockerPublishingOutputValue(word.slice('--output='.length))) return true;
    if (word.startsWith('-o=') && isDockerPublishingOutputValue(word.slice('-o='.length))) return true;
  }
  return false;
}

function isDockerPublishingOutputValue(value) {
  const fields = String(value ?? '').toLowerCase().split(',');
  return fields.includes('type=registry')
    || (fields.includes('type=image') && fields.includes('push=true'));
}

function firstComposeCommand(args) {
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (!word || word === '--') continue;
    if (word.startsWith('-')) {
      if (composeOptionConsumesNext(word) && args[index + 1]) index += 1;
      continue;
    }
    return word;
  }
  return null;
}

function composeOptionConsumesNext(option) {
  const lower = option.toLowerCase();
  if (lower.includes('=')) return false;
  return ['-f', '-p', '--ansi', '--env-file', '--file', '--parallel', '--profile', '--project-directory', '--project-name'].includes(lower);
}

function hasDangerousGitCommand(part) {
  const words = shellWords(part).map((word) => word.toLowerCase());
  if (words[0] !== 'git') return false;
  const args = stripCliGlobalOptions(words.slice(1), 'git');
  return args[0] === 'push';
}

function hasDangerousGhCommand(part) {
  const words = shellWords(part).map((word) => word.toLowerCase());
  if (words[0] !== 'gh') return false;
  const args = stripCliGlobalOptions(words.slice(1), 'gh');
  if (args[0] === 'api') {
    const apiIndex = words.indexOf('api', 1);
    return hasDangerousGhApiCommand(words.slice(apiIndex + 1));
  }
  if (args[0] === 'auth' && args[1] === 'login') return true;
  if (args[0] === 'release') return true;

  const mutatingVerbs = {
    issue: new Set(['create', 'comment', 'edit', 'close', 'reopen', 'delete', 'transfer', 'pin', 'unpin', 'lock', 'unlock']),
    pr: new Set(['create', 'merge', 'comment', 'review', 'ready', 'close', 'reopen', 'edit', 'lock', 'unlock']),
    workflow: new Set(['run', 'enable', 'disable']),
    run: new Set(['cancel', 'delete', 'rerun']),
    repo: new Set(['create', 'delete', 'edit', 'rename', 'archive', 'unarchive', 'fork', 'sync']),
    secret: new Set(['set', 'delete', 'remove']),
    variable: new Set(['set', 'delete', 'remove']),
    label: new Set(['create', 'edit', 'delete']),
    gist: new Set(['create', 'edit', 'delete']),
    codespace: new Set(['create', 'delete', 'stop', 'rebuild']),
    project: new Set(['create', 'edit', 'delete', 'close', 'reopen', 'item-add', 'item-edit', 'item-delete', 'field-create', 'field-delete']),
  };
  return Boolean(mutatingVerbs[args[0]]?.has(args[1]));
}

function hasDangerousGhApiCommand(args) {
  let method = null;
  let hasFieldWrite = false;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (word === '--method' || word === '-x') {
      method = args[index + 1] ?? method;
      index += 1;
      continue;
    }
    if (word.startsWith('--method=')) {
      method = word.slice('--method='.length);
      continue;
    }
    if (word.startsWith('-x') && word.length > 2) {
      method = word.slice(2);
      continue;
    }
    if (['-f', '-F', '--field', '--raw-field', '--input'].includes(word)
      || word.startsWith('-f=')
      || word.startsWith('-F=')
      || word.startsWith('--field=')
      || word.startsWith('--raw-field=')
      || word.startsWith('--input=')) {
      hasFieldWrite = true;
    }
  }

  const normalizedMethod = method?.toLowerCase();
  return ['post', 'put', 'patch', 'delete'].includes(normalizedMethod) || (!normalizedMethod && hasFieldWrite);
}

function hasDangerousHttpCommand(part) {
  const words = shellWords(part);
  const command = words[0]?.toLowerCase();
  if (command === 'curl') return hasDangerousCurlCommand(words.slice(1));
  if (command === 'wget') return hasDangerousWgetCommand(words.slice(1));
  return false;
}

function hasDangerousCurlCommand(args) {
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    const lower = word.toLowerCase();
    if (['-x', '--request'].includes(lower)) {
      if (isHttpWriteMethod(args[index + 1])) return true;
      index += 1;
      continue;
    }
    if (lower.startsWith('-x') && lower.length > 2 && isHttpWriteMethod(lower.slice(2))) return true;
    if (lower.startsWith('--request=') && isHttpWriteMethod(lower.slice('--request='.length))) return true;
    if ([
      '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--json',
      '--form', '--form-string', '--upload-file',
    ].includes(lower) || ['-F', '-T'].includes(word)) return true;
    if (/^-(?:d|F|T).+/.test(word)) return true;
    if (/^--(?:data|data-raw|data-binary|data-urlencode|json|form|form-string|upload-file)=/.test(lower)) return true;
  }
  return false;
}

function hasDangerousWgetCommand(args) {
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    const lower = word.toLowerCase();
    if (lower === '--method') {
      if (isHttpWriteMethod(args[index + 1])) return true;
      index += 1;
      continue;
    }
    if (lower.startsWith('--method=') && isHttpWriteMethod(lower.slice('--method='.length))) return true;
    if ([
      '--post-data', '--post-file', '--body-data', '--body-file',
    ].includes(lower)) return true;
    if (/^--(?:post-data|post-file|body-data|body-file)=/.test(lower)) return true;
  }
  return false;
}

function hasDangerousRmCommand(part) {
  const words = shellWords(part).map((word) => word.toLowerCase());
  if (words[0] !== 'rm') return false;

  let recursive = false;
  let force = false;
  for (const word of words.slice(1)) {
    if (word === '--') break;
    if (word === '--recursive') recursive = true;
    if (word === '--force') force = true;
    if (/^-[^-]/.test(word)) {
      const flags = word.slice(1);
      recursive ||= /[rR]/.test(flags);
      force ||= flags.includes('f');
    }
  }
  return recursive && force;
}

function hasTerraformFmtWriteCommand(part) {
  const words = shellWords(part).map((word) => word.toLowerCase());
  if (words[0] !== 'terraform') return false;
  const commandIndex = terraformSubcommandIndex(words);
  if (words[commandIndex] !== 'fmt') return false;

  let checkMode = null;
  let writeMode = null;
  for (const arg of words.slice(commandIndex + 1)) {
    if (arg === '-check' || arg === '--check') checkMode = true;
    if (arg.startsWith('-check=') || arg.startsWith('--check=')) {
      checkMode = parseTerraformBoolean(arg.split('=')[1]);
    }
    if (arg.startsWith('-write=') || arg.startsWith('--write=')) {
      writeMode = parseTerraformBoolean(arg.split('=')[1]);
    }
  }

  return checkMode !== true && writeMode !== false;
}

function terraformSubcommandIndex(words) {
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (!word || word === '--') return index;
    if (word.startsWith('-')) {
      if (!word.includes('=') && cliOptionConsumesNext(word, 'terraform') && words[index + 1] && !words[index + 1].startsWith('-')) {
        index += 1;
      }
      continue;
    }
    return index;
  }
  return words.length;
}

function parseTerraformBoolean(value) {
  if (['true', '1', 'yes'].includes(value)) return true;
  if (['false', '0', 'no'].includes(value)) return false;
  return null;
}

function isHttpWriteMethod(value) {
  return ['post', 'put', 'patch', 'delete'].includes(String(value ?? '').toLowerCase());
}

function firstCliVerb(args, command = '') {
  return stripCliGlobalOptions(args, command)[0] ?? null;
}

function stripCliGlobalOptions(args, command = '') {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (!word.startsWith('-')) {
      result.push(word);
      continue;
    }

    if (word === '--') {
      result.push(...args.slice(index + 1));
      break;
    }

    if (!word.includes('=') && cliOptionConsumesNext(word, command) && args[index + 1] && !args[index + 1].startsWith('-')) {
      index += 1;
    }
  }
  return result;
}

function cliOptionConsumesNext(option, command = '') {
  const lower = option.toLowerCase();
  if (command === 'pulumi' && ['-s', '--stack'].includes(lower)) return true;
  if (command === 'git' && lower === '-c') return true;
  if (command === 'helm'
    && ['--kube-context', '--registry-config', '--repository-cache', '--repository-config'].includes(lower)) {
    return true;
  }
  if (command === 'docker' && ['-h', '--host'].includes(lower)) return true;
  if (command === 'terraform' && lower === '-chdir') return true;
  if (command === 'gh'
    && ['-R', '--repo', '--hostname'].some((candidate) => lower === candidate.toLowerCase())) {
    return true;
  }
  return cliOptionsWithValues.has(lower);
}

function commandPartReferencesRuntimeSurface(part) {
  return part
    .split(/\s+/)
    .map((token) => stripYamlQuotes(token.trim()).replace(/^\.?[\\/]+/, ''))
    .filter(Boolean)
    .filter((token) => token.includes('/') || token.includes('\\') || token.startsWith('.') || /\.[A-Za-z0-9]+$/.test(token))
    .some((token) => isRuntimeSurfacePath(normalizePath(token)));
}

function unsafePackageScriptReason(command, packageManifest, packageManifests = [], options = {}) {
  let currentDirectory = options.currentDirectory ?? packageManifest?.directory ?? null;
  for (const part of splitShellCommandParts(command)) {
    const cdCommand = inspectCdCommand(part, currentDirectory);
    if (cdCommand.isCd) {
      if (cdCommand.unsafeReason) return cdCommand.unsafeReason;
      currentDirectory = cdCommand.directory;
      continue;
    }
    const scopedDirectoryReason = unsafeScopedPackageDirectoryReason(part, currentDirectory);
    if (scopedDirectoryReason) return scopedDirectoryReason;
    if (hasUnresolvedDynamicDispatchPart(part)) {
      return 'it dispatches through an unresolved shell variable; inspect before running';
    }

    const partManifest = packageManifestForCommand(part, packageManifests, currentDirectory) ?? packageManifest;
    for (const lifecycleManifest of installLifecycleManifestsForCommand(part, partManifest, packageManifests)) {
      const lifecycleScripts = packageScriptsObject(lifecycleManifest.json?.scripts);
      if (!lifecycleScripts) continue;
      for (const lifecycleScript of installLifecycleScriptNames(part, lifecycleScripts)) {
        const unsafeLifecycleScript = findUnsafePackageScript(lifecycleScript, lifecycleScripts, [], {
          manifest: lifecycleManifest,
          packageManifests,
          unsafeMakeTargets: options.unsafeMakeTargets,
          incompleteScan: options.incompleteScan,
          runtimeSafety: options.runtimeSafety,
        });
        if (unsafeLifecycleScript) {
          return `it may run install lifecycle "${lifecycleScript}" whose dependency chain "${unsafeLifecycleScript.chain.join(' -> ')}" may mutate external state`;
        }
      }
    }

    const scriptName = packageScriptNameFromCommand(part);
    if (!scriptName) continue;
    for (const targetManifest of packageScriptManifestsForCommand(part, partManifest, packageManifests, currentDirectory)) {
      const targetScripts = packageScriptsObject(targetManifest?.json?.scripts);
      if (!targetScripts || !Object.hasOwn(targetScripts, scriptName)) continue;
      const unsafeScript = findUnsafePackageScript(scriptName, targetScripts, [], {
        manifest: targetManifest,
        packageManifests,
        unsafeMakeTargets: options.unsafeMakeTargets,
        incompleteScan: options.incompleteScan,
        runtimeSafety: options.runtimeSafety,
      });
      if (unsafeScript) {
        return `it calls package script "${scriptName}" whose dependency chain "${unsafeScript.chain.join(' -> ')}" may mutate external state`;
      }
    }
  }

  return null;
}

function packageJsonForCommand(command, packageManifests, workingDirectory = null) {
  return packageManifestForCommand(command, packageManifests, workingDirectory)?.json ?? null;
}

function packageManifestForCommand(command, packageManifests, workingDirectory = null) {
  const explicitDirectory = packageDirectoryFromCommand(command);
  if (explicitDirectory) {
    const normalizedDirectory = resolvePackageDirectory(explicitDirectory, workingDirectory);
    const manifest = packageManifests.find((item) => item.directory === normalizedDirectory);
    if (manifest) return manifest;
  }

  const workspace = packageWorkspaceFromCommand(command);
  if (workspace) {
    const manifest = packageManifestForWorkspace(workspace, packageManifests);
    if (manifest) return manifest;
  }

  if (workingDirectory) {
    const normalizedDirectory = normalizePackageDirectory(workingDirectory);
    const manifest = packageManifests.find((item) => item.directory === normalizedDirectory);
    if (manifest) return manifest;
  }

  return packageManifests.find((item) => item.path === 'package.json') ?? null;
}

function normalizePackageDirectory(directory) {
  return normalizePath(directory)
    .replace(/^\.\/+/, '')
    .replace(/\/\.$/, '')
    .replace(/\/$/, '');
}

function normalizePackageDirectoryOrRoot(directory) {
  const normalized = normalizePackageDirectory(directory);
  return normalized === '.' ? '' : normalized;
}

function normalizePnpmWorkspaceSelector(selector) {
  return stripYamlQuotes(selector)
    .trim()
    .replace(/^\.\.\.\^?/, '')
    .replace(/\^?\.\.\.$/, '');
}

function packageManifestForWorkspace(workspace, packageManifests) {
  const normalizedWorkspace = normalizePackageDirectory(workspace);
  const workspaceBasename = basename(normalizedWorkspace);
  return packageManifests.find((item) => item.json?.name === workspace)
    ?? packageManifests.find((item) => item.json?.name === normalizedWorkspace)
    ?? packageManifests.find((item) => item.directory === normalizedWorkspace)
    ?? packageManifests.find((item) => item.directory && basename(item.directory) === workspace)
    ?? packageManifests.find((item) => item.directory && basename(item.directory) === workspaceBasename)
    ?? null;
}

function resolvePackageDirectory(directory, baseDirectory = null) {
  const normalizedDirectory = normalizePackageDirectory(directory);
  if (!baseDirectory) return normalizedDirectory === '.' ? '' : normalizedDirectory;
  if (/^(?:[A-Za-z]:|\/|\\\\|~)/.test(normalizedDirectory)) return normalizedDirectory;

  const parts = [
    ...normalizePackageDirectory(baseDirectory).split('/').filter(Boolean),
    ...normalizedDirectory.split('/').filter(Boolean),
  ];
  const resolved = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join('/');
}

function packageDirectoryFromCommand(command) {
  const trimmed = stripPackageCommandPrefix(command);
  const words = shellWords(trimmed);
  const manager = words[0]?.toLowerCase();
  const scopedOptions = {
    npm: ['--prefix'],
    pnpm: ['--dir', '-C'],
    yarn: ['--cwd'],
    bun: ['--cwd'],
  }[manager] ?? [];
  const explicitDirectory = packageOptionValue(words, scopedOptions);
  if (explicitDirectory) return stripYamlQuotes(explicitDirectory.trim());

  const trailingNpmPrefix = npmTrailingPrefixDirectory(words);
  if (trailingNpmPrefix) return trailingNpmPrefix;

  return null;
}

function npmTrailingPrefixDirectory(words) {
  if (words[0]?.toLowerCase() !== 'npm') return null;
  const activeWords = wordsBeforePackageArgSeparator(words);
  for (let index = 1; index < activeWords.length; index += 1) {
    const word = activeWords[index];
    const lower = word.toLowerCase();
    if (lower === '--prefix') return activeWords[index + 1] ? stripYamlQuotes(activeWords[index + 1]) : null;
    if (lower.startsWith('--prefix=')) return stripYamlQuotes(word.slice('--prefix='.length));
  }
  return null;
}

function packageWorkspaceFromCommand(command) {
  return packageWorkspacesFromCommand(command)[0] ?? null;
}

function packageWorkspacesFromCommand(command) {
  const trimmed = stripPackageCommandPrefix(command);
  const words = shellWords(trimmed);
  const manager = words[0]?.toLowerCase();

  if (manager === 'npm') {
    const npmWorkspaces = packageOptionValues(words, ['--workspace', '-w']);
    if (npmWorkspaces.length) return npmWorkspaces;
  }

  if (manager === 'pnpm') {
    const pnpmFilters = packageOptionValues(words, ['--filter', '-F']);
    if (pnpmFilters.length) return pnpmFilters.map((filter) => normalizePnpmWorkspaceSelector(filter));
  }

  const yarnWorkspace = trimmed.match(/^yarn\s+workspace\s+("[^"]+"|'[^']+'|\S+)/i);
  if (yarnWorkspace) return [stripYamlQuotes(yarnWorkspace[1].trim())];

  return [];
}

function installLifecycleScriptNames(command, scripts) {
  if (!isInstallCommand(command)) return [];
  if (installCommandDisablesLifecycleScripts(command)) return [];
  const scriptMap = packageScriptsObject(scripts);
  if (!scriptMap) return [];
  return [
    'preinstall',
    'install',
    'postinstall',
    'prepublish',
    'preprepare',
    'prepare',
    'postprepare',
  ].filter((name) => Object.hasOwn(scriptMap, name));
}

function installCommandDisablesLifecycleScripts(command) {
  const words = shellWords(stripPackageCommandPrefix(command));
  const manager = words[0]?.toLowerCase();
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return false;

  for (const word of words.slice(1)) {
    const lower = word.toLowerCase();
    if (lower === '--') break;
    if (lower === '--ignore-scripts') return true;
    if (lower.startsWith('--ignore-scripts=')) {
      return !['false', '0', 'no', 'off'].includes(lower.slice('--ignore-scripts='.length));
    }
  }
  return false;
}

function installLifecycleManifestsForCommand(command, packageManifest, packageManifests) {
  if (!isInstallCommand(command)) return [];
  const selectedWorkspaces = packageWorkspacesFromCommand(command);
  if (selectedWorkspaces.length) {
    const selectedManifests = selectedWorkspaces
      .map((workspace) => packageManifestForWorkspace(workspace, packageManifests))
      .filter(Boolean);
    if (selectedManifests.length === selectedWorkspaces.length) {
      return dedupeObjects(selectedManifests, (manifest) => manifest.path);
    }
    const workspaceManifests = packageManifests.filter((manifest) => manifest.path !== 'package.json' && packageScriptsObject(manifest.json?.scripts));
    return workspaceManifests.length ? workspaceManifests : [packageManifest].filter(Boolean);
  }
  if (!isWorkspaceInstallCommand(command, packageManifest, packageManifests)) return [packageManifest].filter(Boolean);
  return packageManifests.filter((manifest) => packageScriptsObject(manifest.json?.scripts));
}

function isWorkspaceInstallCommand(command, packageManifest, packageManifests) {
  if (!packageManifest || packageManifests.length <= 1) return false;
  const lower = command.trim().toLowerCase();
  if (packageManifest.path !== 'package.json') return false;
  return /(?:^|\s)--workspaces(?:\s|=|$)/.test(lower)
    || /^(pnpm|yarn)\s+install\b/.test(lower)
    || (/^npm\s+(ci|install)\b/.test(lower) && Boolean(packageManifest.json?.workspaces));
}

function isInstallCommand(command) {
  const trimmed = stripPackageCommandPrefix(command).toLowerCase();
  return isPackageInstallCommand(trimmed)
    || /^(npm\s+ci|npm\s+install|pnpm\s+install|yarn\s+install|bun\s+install)\b/.test(trimmed)
    || /^npm\s+(?:(?:--prefix|--workspace|-w)(?:=|\s+)\S+|--workspaces?)\s+(ci|install)\b/.test(trimmed)
    || /^pnpm\s+(?:(?:--dir|-C|--filter|-F)(?:=|\s+)\S+)\s+install\b/.test(trimmed)
    || /^yarn\s+--cwd(?:=|\s+)\S+\s+install\b/.test(trimmed)
    || /^bun\s+--cwd(?:=|\s+)\S+\s+install\b/.test(trimmed);
}

function isPackageInstallCommand(command) {
  const words = shellWords(command);
  const manager = words[0]?.toLowerCase();
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return false;

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word || word === '--') continue;
    if (packageOptionConsumesNext(word, manager)) {
      index += 1;
      continue;
    }
    if (word.startsWith('-')) continue;
    if (manager === 'npm') return lower === 'ci' || lower === 'install';
    return lower === 'install';
  }
  return false;
}

function findUnsafePackageScript(scriptName, scripts, chain = [], context = {}) {
  const scriptMap = packageScriptsObject(scripts);
  if (!scriptMap || !Object.hasOwn(scriptMap, scriptName)) return null;
  const manifestPath = context.manifest?.path ?? 'package.json';
  const visitKey = `${manifestPath}\0${scriptName}`;
  if (context.visited?.has(visitKey)) return null;

  const nextVisited = new Set(context.visited ?? []);
  nextVisited.add(visitKey);
  const nextChain = [...chain, scriptName];
  for (const lifecycleScript of lifecycleScriptNames(scriptName, scriptMap)) {
    const unsafeLifecycleScript = findUnsafePackageScript(lifecycleScript, scriptMap, nextChain, {
      ...context,
      visited: nextVisited,
    });
    if (unsafeLifecycleScript) return unsafeLifecycleScript;
  }

  const body = String(scriptMap[scriptName] ?? '');
  if (isAuthorityPackageScript(scriptName)) return { scriptName, chain: nextChain };
  if (context.runtimeSafety ? hasRuntimeSafetyDangerousCommand(body) : hasDangerousCommand(body)) return { scriptName, chain: nextChain };
  if (hasUnresolvedDynamicDispatchCommand(body)) return { scriptName, chain: nextChain };
  if (context.incompleteScan && commandNeedsCompleteScan(body)) return { scriptName, chain: nextChain };
  if (unsafeMakeTargetReasonFromDirectory(body, context.unsafeMakeTargets ?? new Set(), context.manifest?.directory)) return { scriptName, chain: nextChain };

  let currentDirectory = context.manifest?.directory ?? null;
  for (const part of splitShellCommandParts(body)) {
    const cdCommand = inspectCdCommand(part, currentDirectory);
    if (cdCommand.isCd) {
      if (cdCommand.unsafeReason) return { scriptName, chain: nextChain };
      currentDirectory = cdCommand.directory;
      continue;
    }
    if (unsafeScopedPackageDirectoryReason(part, currentDirectory)) return { scriptName, chain: nextChain };

    const partManifest = packageManifestForCommand(part, context.packageManifests ?? [], currentDirectory) ?? context.manifest;
    const wrapperPayload = shellWrapperPayload(part);
    if (wrapperPayload !== null) {
      if (!isStaticShellWrapperPayload(wrapperPayload)) return { scriptName, chain: nextChain };
      const unsafeWrappedCommand = unsafePackageScriptReason(wrapperPayload, partManifest, context.packageManifests ?? [], {
        unsafeMakeTargets: context.unsafeMakeTargets,
        incompleteScan: context.incompleteScan,
        currentDirectory,
        runtimeSafety: context.runtimeSafety,
      });
      if (unsafeWrappedCommand) return { scriptName, chain: nextChain };
      if (context.incompleteScan && commandNeedsCompleteScan(wrapperPayload)) return { scriptName, chain: nextChain };
      continue;
    }

    for (const lifecycleManifest of installLifecycleManifestsForCommand(part, partManifest, context.packageManifests ?? [])) {
      const lifecycleScripts = packageScriptsObject(lifecycleManifest.json?.scripts);
      if (!lifecycleScripts) continue;
      for (const lifecycleScript of installLifecycleScriptNames(part, lifecycleScripts)) {
        const unsafeLifecycleScript = findUnsafePackageScript(lifecycleScript, lifecycleScripts, nextChain, {
          ...context,
          manifest: lifecycleManifest,
          visited: nextVisited,
        });
        if (unsafeLifecycleScript) return unsafeLifecycleScript;
      }
    }

    const taskRunnerChildScripts = packageScriptNamesFromTaskRunnerCommand(part);
    if (taskRunnerChildScripts.length) {
      const unsafeTaskRunnerScript = findUnsafeTaskRunnerPackageScript(taskRunnerChildScripts, part, nextChain, {
        ...context,
        currentDirectory,
        visited: nextVisited,
      });
      if (unsafeTaskRunnerScript) return unsafeTaskRunnerScript;
    }

    const childScripts = packageScriptNamesFromAggregatorCommand(part);
    const directChildScript = packageScriptNameFromCommand(part);
    if (directChildScript) childScripts.push(directChildScript);
    if (!childScripts.length) continue;
    for (const childScript of dedupe(childScripts)) {
      for (const childManifest of packageScriptManifestsForCommand(part, partManifest ?? context.manifest, context.packageManifests ?? [], currentDirectory)) {
        const targetScripts = packageScriptsObject(childManifest?.json?.scripts) ?? scriptMap;
        const expandedScripts = expandPackageScriptSelector(childScript, targetScripts);
        if (!expandedScripts.length && isAuthorityPackageScript(childScript)) return { scriptName: childScript, chain: [...nextChain, childScript] };
        for (const expandedScript of expandedScripts) {
          const unsafeScript = findUnsafePackageScript(expandedScript, targetScripts, nextChain, {
            ...context,
            manifest: childManifest,
            visited: nextVisited,
          });
          if (unsafeScript) return unsafeScript;
        }
      }
    }
  }

  return null;
}

function findUnsafeTaskRunnerPackageScript(childScripts, command, chain, context = {}) {
  for (const childScript of dedupe(childScripts)) {
    let resolvedScript = false;
    for (const childManifest of taskRunnerPackageScriptManifestsForCommand(command, context.packageManifests ?? [], context.currentDirectory)) {
      const targetScripts = packageScriptsObject(childManifest?.json?.scripts);
      const expandedScripts = expandPackageScriptSelector(childScript, targetScripts);
      for (const expandedScript of expandedScripts) {
        resolvedScript = true;
        const visitKey = `${childManifest.path}\0${expandedScript}`;
        if (context.visited?.has(visitKey)) continue;
        const unsafeScript = findUnsafePackageScript(expandedScript, targetScripts, chain, {
          ...context,
          manifest: childManifest,
          visited: context.visited,
        });
        if (unsafeScript) return unsafeScript;
      }
    }
    if (!resolvedScript) return { scriptName: childScript, chain: [...chain, childScript] };
  }
  return null;
}

function commandNeedsCompleteScan(command) {
  let currentDirectory = '';
  for (const part of splitShellCommandParts(command)) {
    const cdCommand = inspectCdCommand(part, currentDirectory);
    if (cdCommand.isCd) {
      if (cdCommand.unsafeReason) return true;
      currentDirectory = cdCommand.directory;
      continue;
    }

    const stripped = stripPackageCommandPrefix(part);
    if (packageDirectoryFromCommand(stripped)
      || packageWorkspacesFromCommand(stripped).length
      || hasWorkspaceWidePackageCommand(stripped)) {
      return true;
    }

    if (currentDirectory && (packageScriptNameFromCommand(stripped) || isInstallCommand(stripped))) return true;

    const makeInvocation = makeInvocationFromCommandPart(stripped, currentDirectory);
    if (makeInvocation?.unsafeReason) return true;
    if (makeInvocation) return true;
  }
  return false;
}

function hasWorkspaceWidePackageCommand(command) {
  const lower = stripPackageCommandPrefix(command).toLowerCase();
  return /(?:^|\s)npm\s+.*(?:--workspaces|-ws)(?:\s|=|$)/.test(lower)
    || /(?:^|\s)pnpm\s+.*(?:-r|--recursive)(?:\s|=|$)/.test(lower)
    || /(?:^|\s)yarn\s+workspaces\s+foreach\b/.test(lower);
}

function packageScriptManifestsForCommand(command, fallbackManifest, packageManifests = [], workingDirectory = null) {
  if (packageScriptNamesFromTaskRunnerCommand(command).length) {
    const manifests = taskRunnerPackageScriptManifestsForCommand(command, packageManifests, workingDirectory);
    if (manifests.length) return manifests;
  }

  if (isAllWorkspacePackageScriptCommand(command, fallbackManifest, packageManifests)) {
    const words = shellWords(stripPackageCommandPrefix(command));
    const rootManifest = packageManifests.find((manifest) => manifest.path === 'package.json') ?? fallbackManifest;
    const workspaceManifests = packageManifests.filter((manifest) => manifest.path !== 'package.json' && packageScriptsObject(manifest.json?.scripts));
    const manifests = hasNpmIncludeWorkspaceRoot(words)
      ? [rootManifest, ...workspaceManifests]
      : workspaceManifests;
    const uniqueManifests = dedupeObjects(manifests.filter(Boolean), (manifest) => manifest.path);
    return uniqueManifests.length ? uniqueManifests : [fallbackManifest].filter(Boolean);
  }

  const workspaces = packageWorkspacesFromCommand(command);
  if (workspaces.length) {
    const targetWorkspaceManifests = workspaces
      .map((workspace) => packageManifestForWorkspace(workspace, packageManifests))
      .filter(Boolean);
    if (targetWorkspaceManifests.length === workspaces.length) {
      return dedupeObjects(targetWorkspaceManifests, (manifest) => manifest.path);
    }
    const workspaceManifests = packageManifests.filter((manifest) => manifest.path !== 'package.json' && packageScriptsObject(manifest.json?.scripts));
    return workspaceManifests.length ? workspaceManifests : [fallbackManifest].filter(Boolean);
  }

  const targetManifest = packageManifestForCommand(command, packageManifests, workingDirectory) ?? fallbackManifest;
  return [targetManifest].filter(Boolean);
}

function taskRunnerPackageScriptManifestsForCommand(command, packageManifests = [], workingDirectory = null) {
  const targetScripts = packageScriptNamesFromTaskRunnerCommand(command);
  if (!targetScripts.length) return [];
  const targetManifest = packageManifestForCommand(command, packageManifests, workingDirectory);
  const manifests = packageManifests.filter((manifest) => {
    const scripts = packageScriptsObject(manifest.json?.scripts);
    return scripts && targetScripts.some((scriptName) => Object.hasOwn(scripts, scriptName));
  });
  const allScriptManifests = packageManifests.filter((manifest) => packageScriptsObject(manifest.json?.scripts));
  return dedupeObjects([
    ...manifests,
    ...allScriptManifests,
    targetManifest,
  ].filter(Boolean), (manifest) => manifest.path);
}

function isAllWorkspacePackageScriptCommand(command, packageManifest, packageManifests) {
  if (!packageManifest || packageManifests.length <= 1) return false;
  const words = shellWords(stripPackageCommandPrefix(command));
  return hasNpmAllWorkspaces(words)
    || hasPnpmRecursive(words)
    || Boolean(yarnWorkspacesForeachScriptName(stripPackageCommandPrefix(command)));
}

function lifecycleScriptNames(scriptName, scripts) {
  const scriptMap = packageScriptsObject(scripts);
  if (!scriptMap) return [];
  if (isPackageLifecycleHookScript(scriptName, scriptMap)) return [];
  return [`pre${scriptName}`, `post${scriptName}`].filter((name) => Object.hasOwn(scriptMap, name));
}

function isPackageLifecycleHookScript(scriptName, scriptMap) {
  for (const prefix of ['pre', 'post']) {
    if (!scriptName.startsWith(prefix)) continue;
    const baseName = scriptName.slice(prefix.length);
    if (baseName && Object.hasOwn(scriptMap, baseName)) return true;
  }
  return false;
}

function isAuthorityPackageScript(name) {
  return /(^|[:._-])(deploy|release|publish|provision)([:._-]|$)/i.test(name);
}

function packageScriptNamesFromAggregatorCommand(command) {
  const words = shellWords(stripPackageCommandPrefix(command));
  const aggregator = words[0]?.toLowerCase();
  if (!['npm-run-all', 'run-s', 'run-p'].includes(aggregator)) return [];

  const scripts = [];
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (!word || word === '--') continue;
    if (word.startsWith('-')) {
      if (aggregatorOptionConsumesNext(word) && words[index + 1]) index += 1;
      continue;
    }
    scripts.push(word);
  }
  return scripts;
}

function packageScriptNamesFromTaskRunnerCommand(command) {
  const invocation = taskRunnerInvocation(command);
  if (!invocation) return [];
  const { runner, words } = invocation;
  const lower = words.map((word) => word.toLowerCase());

  if (runner === 'nx') {
    const targets = [
      ...taskRunnerOptionValues(words, ['--target', '--targets', '-t']),
      ...nxRunTargets(words, lower),
      ...nxPositionalTargets(words, lower),
    ].flatMap(splitTaskRunnerTargets);
    return dedupe(targets.map(canonicalTaskRunnerTarget).filter(validPackageScriptName));
  }

  const runIndex = lower.indexOf('run');
  if (runIndex < 0) return dedupe(taskRunnerShorthandTargets(runner, words, lower));
  return dedupe(taskRunnerPositionalTargets(words.slice(runIndex + 1)));
}

function nxRunTargets(words, lower) {
  const runIndex = lower.indexOf('run');
  if (runIndex < 0) return [];
  const target = targetFromProjectTarget(words[runIndex + 1]);
  return target ? [target] : [];
}

function nxPositionalTargets(words, lower) {
  if (lower.includes('run')) return [];
  const command = words[1];
  const normalizedCommand = command?.toLowerCase();
  if (!command || command.startsWith('-')) return [];
  if (['affected', 'connect', 'daemon', 'exec', 'format', 'generate', 'graph', 'init', 'list', 'migrate', 'release', 'repair', 'report', 'reset', 'run-many', 'show', 'sync', 'view-logs'].includes(normalizedCommand)) return [];
  return [command];
}

function taskRunnerShorthandTargets(runner, words, lower) {
  if (runner !== 'turbo') return [];
  const commandIndex = firstTaskRunnerPositionalIndex(words);
  if (commandIndex == null) return [];
  const command = lower[commandIndex];
  if (!command || turboReservedCommands.has(command)) return [];
  return taskRunnerPositionalTargets(words.slice(1));
}

function firstTaskRunnerPositionalIndex(words) {
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (!word || word === '--') return null;
    if (word.startsWith('-')) {
      if (taskRunnerOptionConsumesNext(word) && words[index + 1]) index += 1;
      continue;
    }
    return index;
  }
  return null;
}

const turboReservedCommands = new Set([
  'bin',
  'completion',
  'daemon',
  'generate',
  'info',
  'init',
  'link',
  'login',
  'logout',
  'ls',
  'prune',
  'query',
  'telemetry',
  'unlink',
]);

function taskRunnerPositionalTargets(words) {
  const targets = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (!word || word === '--') break;
    if (word.startsWith('-')) {
      if (taskRunnerOptionConsumesNext(word) && words[index + 1]) index += 1;
      continue;
    }
    const target = canonicalTaskRunnerTarget(word);
    if (validPackageScriptName(target)) targets.push(target);
  }
  return targets;
}

function taskRunnerOptionValues(words, options) {
  const normalizedOptions = options.map((option) => option.toLowerCase());
  const values = [];
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (word === '--') break;
    const lower = word.toLowerCase();
    const option = normalizedOptions.find((candidate) => lower === candidate || lower.startsWith(`${candidate}=`));
    if (!option) continue;
    if (lower.includes('=')) {
      values.push(word.slice(option.length + 1));
      continue;
    }
    if (words[index + 1]) {
      values.push(words[index + 1]);
      index += 1;
    }
  }
  return values;
}

function splitTaskRunnerTargets(value) {
  return String(value ?? '').split(',').map((target) => target.trim()).filter(Boolean);
}

function targetFromProjectTarget(value) {
  const text = stripYamlQuotes(String(value ?? '').trim());
  if (!text.includes(':')) return null;
  return text.split(':')[1] ?? null;
}

function canonicalTaskRunnerTarget(value) {
  let target = stripYamlQuotes(String(value ?? '').trim());
  if (target.includes('#')) target = target.split('#').pop();
  if (target.includes(':')) target = target.split(':')[1] ?? target;
  return canonicalPackageScriptName(target);
}

function taskRunnerOptionConsumesNext(option) {
  const lower = String(option ?? '').toLowerCase();
  if (lower.includes('=')) return false;
  return [
    '-c',
    '-p',
    '-t',
    '--cache-dir',
    '--configuration',
    '--concurrency',
    '--cwd',
    '--exclude',
    '--filter',
    '--output-logs',
    '--parallel',
    '--project',
    '--projects',
    '--runner',
    '--scope',
    '--target',
    '--targets',
  ].includes(lower);
}

function expandPackageScriptSelector(selector, scripts) {
  const scriptMap = packageScriptsObject(scripts);
  if (!scriptMap) return [];
  if (!/[*?]/.test(selector)) return Object.hasOwn(scriptMap, selector) ? [selector] : [];
  const pattern = new RegExp(`^${escapeRegExp(selector).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`);
  return Object.keys(scriptMap).filter((name) => pattern.test(name));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aggregatorOptionConsumesNext(option) {
  return !option.includes('=') && ['-c', '--config', '-l', '--label', '-n', '--max-parallel'].includes(option.toLowerCase());
}

function packageScriptNameFromCommand(command) {
  const trimmed = stripPackageCommandPrefix(command);
  const words = shellWords(trimmed);
  const manager = words[0]?.toLowerCase();

  if (manager === 'npm' && hasNpmAllWorkspaces(words)) {
    const scriptName = scriptNameAfterPackageOptions(words, 1, ['ci', 'install']);
    if (scriptName) return scriptName;
  }

  if (manager === 'pnpm' && hasPnpmRecursive(words)) {
    const scriptName = scriptNameAfterPackageOptions(words, 1, ['add', 'ci', 'install', 'remove']);
    if (scriptName) return scriptName;
  }

  if (manager === 'npm' && words[1]?.toLowerCase() === 'run') {
    const scriptName = scriptNameAfterPackageOptions(words, 2, ['ci', 'install']);
    if (scriptName) return scriptName;
  }

  if (manager === 'npm') {
    const npmScriptName = scriptNameAfterPackageOptions(words, 1, ['ci', 'install']);
    if (npmScriptName) return npmScriptName;

    const prefixScriptName = npmPrefixScriptNameFromWords(words);
    if (prefixScriptName) return prefixScriptName;

    const scopedScriptName = scopedPackageScriptNameFromWords(words, ['ci', 'install']);
    if (scopedScriptName) return scopedScriptName;
  }

  if (manager === 'pnpm') {
    const scopedScriptName = scopedPackageScriptNameFromWords(words, ['add', 'ci', 'dlx', 'exec', 'install', 'remove']);
    if (scopedScriptName) return scopedScriptName;
  }

  if (manager === 'yarn') {
    const scopedScriptName = scopedPackageScriptNameFromWords(words, ['add', 'dlx', 'exec', 'install', 'npm', 'remove']);
    if (scopedScriptName) return scopedScriptName;
  }

  if (manager === 'bun') {
    const scopedScriptName = scopedPackageScriptNameFromWords(words, ['add', 'install', 'remove', 'x']);
    if (scopedScriptName) return scopedScriptName;
  }

  const npmAllWorkspaceRun = trimmed.match(/^npm\s+--workspaces(?:=(?:true|1))?\s+(?:run\s+)?([\w:.-]+)/i);
  if (npmAllWorkspaceRun && !['ci', 'install'].includes(npmAllWorkspaceRun[1].toLowerCase())) {
    return npmAllWorkspaceRun[1] === 'test' ? 'test' : npmAllWorkspaceRun[1];
  }

  const pnpmRecursiveRun = trimmed.match(/^pnpm\s+(?:-r|--recursive)\s+(?:run\s+)?([\w:.-]+)/i);
  if (pnpmRecursiveRun && !['add', 'install', 'remove'].includes(pnpmRecursiveRun[1].toLowerCase())) {
    return pnpmRecursiveRun[1] === 'test' ? 'test' : pnpmRecursiveRun[1];
  }

  const yarnForeachRun = yarnWorkspacesForeachScriptName(trimmed);
  if (yarnForeachRun) return yarnForeachRun;

  const trailingNpmWorkspaceRun = trimmed.match(/^npm\s+run\s+([\w:.-]+)\b.*(?:--workspace|-w)(?:=|\s+)\S+/i);
  if (trailingNpmWorkspaceRun) return trailingNpmWorkspaceRun[1];

  const trailingNpmWorkspaceTest = trimmed.match(/^npm\s+test\b.*(?:--workspace|-w)(?:=|\s+)\S+/i);
  if (trailingNpmWorkspaceTest) return 'test';

  const npmWorkspaceRun = trimmed.match(/^npm\s+(?:--workspace|-w)(?:=|\s+)\S+\s+run\s+([\w:.-]+)/i);
  if (npmWorkspaceRun) return npmWorkspaceRun[1];

  const npmWorkspaceTest = trimmed.match(/^npm\s+(?:--workspace|-w)(?:=|\s+)\S+\s+test\b/i);
  if (npmWorkspaceTest) return 'test';

  const pnpmFilterRun = trimmed.match(/^pnpm\s+(?:--filter|-F)(?:=|\s+)\S+\s+run\s+([\w:.-]+)/i);
  if (pnpmFilterRun) return pnpmFilterRun[1];

  const pnpmFilterDirect = trimmed.match(/^pnpm\s+(?:--filter|-F)(?:=|\s+)\S+\s+([\w:.-]+)/i);
  if (pnpmFilterDirect && !['add', 'install', 'remove'].includes(pnpmFilterDirect[1].toLowerCase())) {
    return pnpmFilterDirect[1] === 'test' ? 'test' : pnpmFilterDirect[1];
  }

  const yarnWorkspaceRun = trimmed.match(/^yarn\s+workspace\s+\S+\s+(?:run\s+)?([\w:.-]+)/i);
  if (yarnWorkspaceRun && !['add', 'install', 'remove'].includes(yarnWorkspaceRun[1].toLowerCase())) {
    return yarnWorkspaceRun[1];
  }

  const npmPrefixRun = trimmed.match(/^npm\s+--prefix(?:=|\s+)\S+\s+run\s+([\w:.-]+)/i);
  if (npmPrefixRun) return npmPrefixRun[1];

  const npmPrefixTest = trimmed.match(/^npm\s+--prefix(?:=|\s+)\S+\s+test\b/i);
  if (npmPrefixTest) return 'test';

  const trailingNpmPrefixRun = trimmed.match(/^npm\s+run\s+([\w:.-]+)\b.*(?:\s|^)--prefix(?:=|\s+)\S+/i);
  if (trailingNpmPrefixRun) return trailingNpmPrefixRun[1];

  const trailingNpmPrefixTest = trimmed.match(/^npm\s+test\b.*(?:\s|^)--prefix(?:=|\s+)\S+/i);
  if (trailingNpmPrefixTest) return 'test';

  const pnpmDirRun = trimmed.match(/^pnpm\s+(?:--dir|-C)(?:=|\s+)\S+\s+run\s+([\w:.-]+)/i);
  if (pnpmDirRun) return pnpmDirRun[1];

  const pnpmDirTest = trimmed.match(/^pnpm\s+(?:--dir|-C)(?:=|\s+)\S+\s+test\b/i);
  if (pnpmDirTest) return 'test';

  const yarnCwd = trimmed.match(/^yarn\s+--cwd(?:=|\s+)\S+\s+(?:run\s+)?([\w:.-]+)/i);
  if (yarnCwd && !['add', 'install', 'remove'].includes(yarnCwd[1].toLowerCase())) return yarnCwd[1];

  const bunCwdRun = trimmed.match(/^bun\s+--cwd(?:=|\s+)\S+\s+run\s+([\w:.-]+)/i);
  if (bunCwdRun) return bunCwdRun[1];

  const run = trimmed.match(/^(?:npm|pnpm|bun)\s+run\s+([\w:.-]+)/i);
  if (run) return run[1];

  const test = trimmed.match(/^(?:npm|pnpm|yarn|bun)\s+test\b/i);
  if (test) return 'test';

  const yarn = trimmed.match(/^yarn\s+(?:run\s+)?([\w:.-]+)/i);
  if (yarn && !['add', 'install', 'remove'].includes(yarn[1].toLowerCase())) return yarn[1];

  const direct = trimmed.match(/^(?:pnpm|bun)\s+([\w:.-]+)/i);
  if (direct && !['add', 'install', 'remove'].includes(direct[1].toLowerCase())) return direct[1];

  return null;
}

function npmPrefixScriptNameFromWords(words) {
  const activeWords = wordsBeforePackageArgSeparator(words);
  const prefixIndex = activeWords.findIndex((word) => {
    const lower = word.toLowerCase();
    return lower === '--prefix' || lower.startsWith('--prefix=');
  });
  if (prefixIndex < 0) return null;
  const commandIndex = activeWords[prefixIndex].includes('=') ? prefixIndex + 1 : prefixIndex + 2;
  const command = activeWords[commandIndex]?.toLowerCase();
  if (command === 'test') return 'test';
  if (command === 'run') {
    const scriptName = activeWords[commandIndex + 1];
    return validPackageScriptName(scriptName) ? canonicalPackageScriptName(scriptName) : null;
  }
  return null;
}

function scopedPackageScriptNameFromWords(words, blockedCommands = []) {
  const manager = words[0]?.toLowerCase();
  const activeWords = wordsBeforePackageArgSeparator(words);
  const scopedOptions = {
    npm: ['--prefix', '--workspace', '-w'],
    pnpm: ['--dir', '-C', '--filter', '-F', '-w', '--workspace-root'],
    yarn: ['--cwd'],
    bun: ['--cwd'],
  }[manager] ?? [];

  if (!activeWords.some((word) => packageOptionMatches(word, scopedOptions, manager))) return null;
  return scriptNameAfterPackageOptions(activeWords, 1, blockedCommands);
}

function packageOptionMatches(word, options, manager = '') {
  const lower = String(word ?? '').toLowerCase();
  const normalizedOptions = options.map((option) => option.toLowerCase());
  return normalizedOptions.some((option) => lower === option || lower.startsWith(`${option}=`))
    || compactPackageShortOptionValue(word, normalizedOptions, manager) !== null;
}

function hasNpmAllWorkspaces(words) {
  const activeWords = wordsBeforePackageArgSeparator(words);
  return words[0]?.toLowerCase() === 'npm'
    && activeWords.some((word) => isNpmAllWorkspacesOption(word));
}

function hasNpmIncludeWorkspaceRoot(words) {
  if (words[0]?.toLowerCase() !== 'npm') return false;
  return wordsBeforePackageArgSeparator(words).some((word) => {
    const lower = String(word ?? '').toLowerCase();
    if (lower === '--include-workspace-root') return true;
    if (!lower.startsWith('--include-workspace-root=')) return false;
    return !['false', '0', 'no', 'off'].includes(lower.slice('--include-workspace-root='.length));
  });
}

function isNpmAllWorkspacesOption(word) {
  return /^--(?:workspaces|ws)(?:=(?:true|1))?$/i.test(String(word ?? ''))
    || String(word ?? '').toLowerCase() === '-ws';
}

function hasPnpmRecursive(words) {
  const activeWords = wordsBeforePackageArgSeparator(words);
  return words[0]?.toLowerCase() === 'pnpm'
    && activeWords.some((word) => ['-r', '--recursive'].includes(word.toLowerCase()));
}

function wordsBeforePackageArgSeparator(words) {
  const separatorIndex = words.indexOf('--');
  return separatorIndex < 0 ? words : words.slice(0, separatorIndex);
}

function packageOptionValue(words, options) {
  return packageOptionValues(words, options)[0] ?? null;
}

function packageOptionValues(words, options) {
  const manager = words[0]?.toLowerCase();
  const normalizedOptions = options.map((option) => option.toLowerCase());
  const values = [];
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (word === '--') break;
    const lower = word.toLowerCase();
    const option = normalizedOptions.find((candidate) => lower === candidate || lower.startsWith(`${candidate}=`));
    if (!option) {
      const compactValue = compactPackageShortOptionValue(word, normalizedOptions, manager);
      if (compactValue !== null) values.push(compactValue);
      continue;
    }
    if (lower.includes('=')) {
      values.push(word.slice(option.length + 1));
      continue;
    }
    if (words[index + 1]) {
      values.push(words[index + 1]);
      index += 1;
    }
  }
  return values;
}

function compactPackageShortOptionValue(word, normalizedOptions, manager = '') {
  const lower = String(word ?? '').toLowerCase();
  const compactOptions = {
    pnpm: ['-f', '-c'],
  }[manager] ?? [];
  const option = compactOptions.find((candidate) => (
    normalizedOptions.includes(candidate)
    && lower.startsWith(candidate)
    && lower.length > candidate.length
    && lower[candidate.length] !== '='
  ));
  return option ? String(word).slice(option.length) : null;
}

function scriptNameAfterPackageOptions(words, startIndex, blockedCommands = []) {
  const manager = words[0]?.toLowerCase();
  const blocked = new Set(blockedCommands.map((command) => command.toLowerCase()));
  for (let index = startIndex; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word) continue;
    if (word === '--') continue;
    if (lower === 'run' || lower === 'run-script') {
      const scriptName = words[index + 1];
      return validPackageScriptName(scriptName) ? canonicalPackageScriptName(scriptName) : null;
    }
    if (lower === 'test') return 'test';
    if (word.startsWith('-')) {
      if (packageOptionConsumesNext(word, manager)) index += 1;
      continue;
    }
    if (blocked.has(lower) || !validPackageScriptName(word)) return null;
    return canonicalPackageScriptName(word);
  }
  return null;
}

function packageOptionConsumesNext(option, manager = '') {
  const lower = option.toLowerCase();
  if (option.includes('=')) return false;
  if (manager === 'pnpm' && lower === '-w') return false;
  return [
    '-F',
    '-C',
    '-w',
    '--cwd',
    '--dir',
    '--filter',
    '--prefix',
    '--workspace',
  ].some((candidate) => lower === candidate.toLowerCase());
}

function validPackageScriptName(name) {
  return /^[\w:.-]+$/.test(name ?? '');
}

function canonicalPackageScriptName(name) {
  return name === 'test' ? 'test' : name;
}

function stripPackageCommandPrefix(command) {
  const words = shellWords(command);
  let index = 0;
  if (words[index]?.toLowerCase() === 'cross-env-shell') {
    return stripPackageCommandPrefix(words.slice(index + 1).join(' '));
  }
  if (words[index]?.toLowerCase() === 'cross-env') {
    index += 1;
    while (isEnvironmentAssignment(words[index])) index += 1;
  } else if (words[index]?.toLowerCase() === 'env') {
    index = envPayloadIndex(words, index + 1);
  }
  while (isEnvironmentAssignment(words[index])) index += 1;
  if (words[index] === '--') index += 1;
  return index > 0 ? words.slice(index).join(' ') : String(command ?? '').trim();
}

function envPayloadIndex(words, startIndex) {
  let index = startIndex;
  while (index < words.length) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word) return index;
    if (word === '--') return index + 1;
    if (isEnvironmentAssignment(word)) {
      index += 1;
      continue;
    }
    if (['-i', '--ignore-environment', '-0', '--null'].includes(lower)) {
      index += 1;
      continue;
    }
    if (['-u', '--unset', '-C', '--chdir', '-S', '--split-string'].includes(lower) && words[index + 1]) {
      index += 2;
      continue;
    }
    if (/^-u.+/.test(word) || lower.startsWith('--unset=')) {
      index += 1;
      continue;
    }
    return index;
  }
  return index;
}

function hasEnvChdirOption(words) {
  if (words[0]?.toLowerCase() !== 'env') return false;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word || word === '--') return false;
    if (isEnvironmentAssignment(word)) continue;
    if (lower === '-c' || lower === '--chdir' || lower.startsWith('--chdir=')) return true;
    if (lower === '-s' || lower === '--split-string' || lower === '-u' || lower === '--unset') {
      if (words[index + 1]) index += 1;
      continue;
    }
    if (['-i', '--ignore-environment', '-0', '--null'].includes(lower) || /^-u.+/.test(word) || lower.startsWith('--unset=')) continue;
    return false;
  }
  return false;
}

function isEnvironmentAssignment(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(word ?? '');
}

function shellWrapperPayload(part) {
  const words = shellWords(stripPackageCommandPrefix(part));
  const shell = words[0]?.toLowerCase();
  if (!['sh', 'bash', 'pwsh', 'powershell'].includes(shell)) return null;

  for (let index = 1; index < words.length; index += 1) {
    const lower = words[index]?.toLowerCase();
    if (['-c', '/c', '-command', '/command'].includes(lower)) {
      const payload = words[index + 1];
      return payload ? String(payload) : '';
    }
    if (['-lc', '-ec'].includes(lower)) {
      const payload = words[index + 1];
      return payload ? String(payload) : '';
    }
    if (lower?.startsWith('-c') && lower.length > 2) return words[index].slice(2);
  }

  return null;
}

function isStaticShellWrapperPayload(payload) {
  const text = String(payload ?? '').trim();
  return Boolean(text) && !/[$`]/.test(text);
}

function yarnWorkspacesForeachScriptName(command) {
  const words = shellWords(command);
  const lower = words.map((word) => word.toLowerCase());
  if (lower[0] !== 'yarn' || lower[1] !== 'workspaces' || lower[2] !== 'foreach') return null;

  const runIndex = lower.indexOf('run', 3);
  if (runIndex < 0) return null;

  const scriptName = words[runIndex + 1];
  if (!scriptName || !/^[\w:.-]+$/.test(scriptName)) return null;
  if (['add', 'install', 'remove'].includes(scriptName.toLowerCase())) return null;
  return scriptName === 'test' ? 'test' : scriptName;
}

function workingDirectoryFromCdCommand(command) {
  return resolvedWorkingDirectoryFromCdCommand(command, '');
}

function resolvedWorkingDirectoryFromCdCommand(command, currentDirectory = '') {
  const result = inspectCdCommand(command, currentDirectory);
  return result.isCd && !result.unsafeReason ? result.directory : null;
}

function finalWorkingDirectoryFromShellCommand(command, currentDirectory = '') {
  let workingDirectory = normalizePackageDirectory(currentDirectory || '');
  let changed = false;
  for (const part of splitShellCommandParts(command)) {
    const cdCommand = inspectCdCommand(part, workingDirectory);
    if (!cdCommand.isCd) continue;
    if (cdCommand.unsafeReason) return null;
    workingDirectory = cdCommand.directory;
    changed = true;
  }
  return changed ? workingDirectory : null;
}

function inspectCdCommand(command, currentDirectory = '') {
  const trimmed = command.trim();
  if (/^popd\b/i.test(trimmed)) {
    return {
      isCd: true,
      directory: null,
      unsafeReason: 'it changes directory through a shell directory stack',
    };
  }
  const match = trimmed.match(/^(?:cd|pushd)\s+("[^"]+"|'[^']+'|[^;&|]+)\s*$/i);
  if (!match) {
    if (/^pushd\b/i.test(trimmed)) {
      return {
        isCd: true,
        directory: null,
        unsafeReason: 'it changes directory through an unsupported pushd form',
      };
    }
    return { isCd: false, directory: null, unsafeReason: null };
  }
  const directory = stripYamlQuotes(match[1].trim());
  if (!isStaticRelativeDirectory(directory)) {
    return {
      isCd: true,
      directory: null,
      unsafeReason: 'it changes directory through a dynamic or non-relative path',
    };
  }
  if (cdTargetEscapesRepo(directory, currentDirectory)) {
    return {
      isCd: true,
      directory: null,
      unsafeReason: 'it changes directory outside the surveyed repository',
    };
  }
  return {
    isCd: true,
    directory: resolvePackageDirectory(directory, currentDirectory),
    unsafeReason: null,
  };
}

function isStaticRelativeDirectory(directory) {
  const normalized = normalizePath(directory).trim();
  return Boolean(normalized)
    && !/^(?:[A-Za-z]:|\/|\\\\|~)/.test(normalized)
    && !/[$%{}*?`]/.test(normalized);
}

function cdTargetEscapesRepo(directory, currentDirectory = '') {
  const parts = [
    ...normalizePackageDirectory(currentDirectory || '').split('/').filter(Boolean),
    ...normalizePackageDirectory(directory).split('/').filter(Boolean),
  ];
  let depth = 0;
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      if (depth === 0) return true;
      depth -= 1;
      continue;
    }
    depth += 1;
  }
  return false;
}

function splitShellCommandParts(command) {
  return normalizeShellContinuations(command)
    .split(/\r?\n|&&|\|\||;/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasUnsupportedSubshellSyntax(command) {
  const text = String(command ?? '').trim();
  return text.startsWith('(') || text.endsWith(')');
}

function splitShellPipelineParts(command) {
  const parts = [];
  let current = '';
  let quote = null;
  const text = String(command ?? '');
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '|' && text[index - 1] !== '|' && text[index + 1] !== '|') {
      const part = current.trim();
      if (part) parts.push(part);
      current = '';
      continue;
    }
    current += character;
  }
  const part = current.trim();
  if (part) parts.push(part);
  return parts;
}

function normalizeShellContinuations(command) {
  return String(command ?? '').replace(/\\\s*\r?\n\s*/g, ' ');
}

function shellWords(command) {
  return String(command ?? '').match(/"[^"]+"|'[^']+'|\S+/g)?.map(stripYamlQuotes) ?? [];
}

function hasShellPipeline(command) {
  return /(^|[^|])\|(?!\|)/.test(String(command ?? ''));
}

function isHarmlessShellPrelude(part) {
  const words = shellWords(part).map((word) => word.toLowerCase());
  if (words[0] !== 'set' || words.length < 2) return false;

  let sawSafeOption = false;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (/^-[eux]+$/.test(word)) {
      sawSafeOption = true;
      continue;
    }
    if (word === '-o' && words[index + 1] === 'pipefail') {
      sawSafeOption = true;
      index += 1;
      continue;
    }
    if (/^-[eux]*o$/.test(word) && words[index + 1] === 'pipefail') {
      sawSafeOption = true;
      index += 1;
      continue;
    }
    return false;
  }

  return sawSafeOption;
}

function isRuntimeSurfacePath(path) {
  const lower = path.toLowerCase();
  const name = basename(lower);
  return name === 'dockerfile'
    || name.startsWith('dockerfile.')
    || lower.includes('docker-compose')
    || name === 'compose.yaml'
    || name === 'compose.yml'
    || lower.endsWith('.tf')
    || hasPathSegment(lower, 'terraform')
    || name === 'pulumi.yaml'
    || /^pulumi\..+\.ya?ml$/.test(name)
    || hasPathSegment(lower, 'k8s')
    || hasPathSegment(lower, 'helm')
    || hasPathSegment(lower, 'deploy')
    || isDeploymentScriptPath(lower)
    || hasPathSegment(lower, 'infra')
    || name === '.env'
    || (name.startsWith('.env.') && !isExampleEnvFileName(name))
    || lower.endsWith('.env')
    || hasPathSegment(lower, 'mcp')
    || name === '.mcp.json'
    || name === 'mcp.json'
    || lower === '.mcp.json'
    || lower === 'mcp.json'
    || hasPathSegment(lower, 'secrets');
}

function isExampleEnvFileName(name) {
  return /\.(example|sample|template|dist)$/i.test(name);
}

function isSafeValidationCommandPart(part) {
  if (hasEnvChdirOption(shellWords(part)) || hasUnsupportedSubshellSyntax(part)) return false;
  const normalizedPart = stripPackageCommandPrefix(part);
  const lower = normalizedPart.toLowerCase();
  if (isHarnessValidationNoOpCommandPart(normalizedPart)) return false;
  if (hasNoOpForwardedPackageScriptArgs(normalizedPart)) return false;
  if (dangerousCommandPatterns.some((pattern) => pattern.test(lower))) return false;
  if (hasDangerousRmCommand(normalizedPart) || hasTerraformFmtWriteCommand(normalizedPart)) return false;
  if (hasPackageValidationWriteFlags(normalizedPart)) return false;
  if (hasDangerousForwardedTarget(normalizedPart)) return false;
  if (hasDangerousForwardedPackageScriptArgs(normalizedPart)) return false;
  if (commandPartReferencesRuntimeSurface(normalizedPart)) return false;
  if (/(^|[^&])&(?!&)/.test(lower)) return false;
  if (unsafeScopedPackageDirectoryReason(normalizedPart)) return false;
  if (isHarnessValidationCommand(normalizedPart)) return true;

  const validationPatterns = [
    /^node\s+--test(?:\s+.*)?$/,
    /^(npm|pnpm|yarn|bun)\s+test(?:\s+.*)?$/,
    /^npm\s+--prefix(?:=|\s+)("[^"]+"|'[^']+'|\S+)\s+(test|run\s+[\w:.-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:.-]*)(?:\s+.*)?$/,
    /^pnpm\s+(?:--dir|-c)(?:=|\s+)("[^"]+"|'[^']+'|\S+)\s+(test|run\s+[\w:.-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:.-]*)(?:\s+.*)?$/,
    /^yarn\s+--cwd(?:=|\s+)("[^"]+"|'[^']+'|\S+)\s+(?:run\s+)?[\w:.-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:.-]*(?:\s+.*)?$/,
    /^bun\s+--cwd(?:=|\s+)("[^"]+"|'[^']+'|\S+)\s+run\s+[\w:.-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:.-]*(?:\s+.*)?$/,
    /^(npm|pnpm|yarn|bun)\s+run\s+[\w:.-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:.-]*(?:\s+.*)?$/,
    /^(npm|pnpm|yarn|bun)\s+(build|lint|typecheck|check|validate)(?:\s+.*)?$/,
    /^(pytest|python\s+-m\s+pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test|(?:\.\/|\.\\)?mvnw(?:\.cmd)?\s+test|(?:\.\/|\.\\)?gradlew(?:\.bat)?\s+test)(?:\s+.*)?$/,
    /^make\s+(test|build|lint|check|quality|validate|coverage)(?:\s+\w+=\S+)?$/,
    /^(terraform\s+validate|terraform\s+fmt\s+-check)(?:\s+.*)?$/,
    /^npm\s+ci(?:\s+.*)?$/,
    /^pnpm\s+install(?:\s+.*)?$/,
    /^yarn\s+install(?:\s+.*)?$/,
  ];

  return validationPatterns.some((pattern) => pattern.test(lower));
}

function isHarnessValidationNoOpCommandPart(part) {
  const words = shellWords(part);
  if (!words.length || !hasHarnessValidationNoOpArgument(words)) return false;
  const commandWord = words[0]?.toLowerCase();
  if (isHarnessValidationExecutableWord(commandWord)) return true;
  if (!isHarnessValidationRunner(commandWord)) return false;
  return words.some((word) => isHarnessValidationExecutableWord(stripYamlQuotes(word)));
}

function hasNoOpForwardedPackageScriptArgs(part) {
  return hasHarnessValidationNoOpArgument(forwardedPackageScriptArgs(part));
}

function hasPackageValidationWriteFlags(command) {
  const words = shellWords(command);
  const manager = words[0]?.toLowerCase();
  const scriptIndex = packageValidationScriptIndex(words);
  if (scriptIndex == null) return false;

  const args = words.slice(scriptIndex + 1);
  return hasWriteModeFlag(args, { manager });
}

function packageValidationScriptIndex(words) {
  const manager = words[0]?.toLowerCase();
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return null;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const lower = word?.toLowerCase();
    if (!word || word === '--') return null;
    if (word.startsWith('-')) {
      if (packageManagerOptionConsumesNext(word, manager) && words[index + 1]) index += 1;
      continue;
    }
    if (['run', 'run-script'].includes(lower)) return words[index + 1] ? index + 1 : null;
    return validationScriptCommandNames.has(canonicalPackageScriptName(lower))
      || /[\w:.-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:.-]*/.test(lower)
      ? index
      : null;
  }
  return null;
}

function hasWriteModeFlag(args, options = {}) {
  let afterPackageArgSeparator = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const lower = String(arg ?? '').toLowerCase();
    if (lower === '--') {
      afterPackageArgSeparator = true;
      continue;
    }
    if (!afterPackageArgSeparator && options.manager === 'npm' && isNpmWorkspaceSelectorArg(lower)) {
      if (!lower.includes('=') && args[index + 1]) index += 1;
      continue;
    }
    if (lower === '-w'
      || lower === '-u'
      || lower === '--fix'
      || lower === '--update'
      || lower === '--updatesnapshot'
      || lower === '--update-snapshot'
      || lower === '--update-snapshots'
      || lower === '--write'
      || lower.startsWith('--fix=')
      || lower.startsWith('--update=')
      || lower.startsWith('--updatesnapshot=')
      || lower.startsWith('--update-snapshot=')
      || lower.startsWith('--update-snapshots=')
      || lower.startsWith('--write=')) return true;
  }
  return false;
}

function isNpmWorkspaceSelectorArg(lower) {
  return lower === '-w'
    || lower === '--workspace'
    || lower.startsWith('-w=')
    || lower.startsWith('--workspace=');
}

function unsafeScopedPackageDirectoryReason(command, currentDirectory = '') {
  const directories = scopedPackageDirectoryValues(command);
  if (!directories.length) return null;
  const unsafeDirectory = directories.find((directory) => (
    !isStaticRelativeDirectory(directory) || cdTargetEscapesRepo(directory, currentDirectory)
  ));
  if (!unsafeDirectory) return null;
  return 'it uses a dynamic or out-of-repo package directory option';
}

function scopedPackageDirectoryValues(command) {
  const words = shellWords(stripPackageCommandPrefix(command));
  const manager = words[0]?.toLowerCase();
  const scopedOptions = {
    npm: ['--prefix'],
    pnpm: ['--dir', '-C'],
    yarn: ['--cwd'],
    bun: ['--cwd'],
  }[manager] ?? [];

  return packageOptionValues(words, scopedOptions).map((value) => stripYamlQuotes(value));
}

function hasPathSegment(path, segment) {
  return path === segment || path.startsWith(`${segment}/`) || path.includes(`/${segment}/`);
}

function dedupe(items) {
  return [...new Set(items)];
}

function dedupeObjects(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function printHelp() {
  console.log(`Usage: harness-bootstrap [init] [--repo <path>] [--json] [--date YYYY-MM-DD]
Direct checkout: node scripts/harness-bootstrap-plan.mjs [init] [--repo <path>] [--json] [--date YYYY-MM-DD]

Read-only survey and bootstrap plan generator.

Commands:
  init                Print a first-time bootstrap plan. Dry-run only; --write is not implemented.

Options:
  --repo <path>       Repository to survey. Defaults to the current directory.
  --json              Emit machine-readable JSON instead of markdown.
  --mode <mode>       auto, bootstrap, or update. Defaults to auto.
  --target-version V  Target HEB release/tag for update planning.
  --current-version V Override detected installed HEB version.
  --date YYYY-MM-DD   Override the plan date for reproducible output.
  -h, --help          Show this help.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const survey = surveyRepository(args.repo);
  const plan = buildBootstrapPlan(survey, {
    date: args.date,
    mode: args.mode,
    targetVersion: args.targetVersion,
    currentVersion: args.currentVersion,
  });
  process.stdout.write(args.json ? `${JSON.stringify(plan, null, 2)}\n` : renderMarkdownPlan(plan));
}

if (isDirectCliRun()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

function isDirectCliRun() {
  if (!process.argv[1]) return false;

  const modulePath = fileURLToPath(import.meta.url);
  const argvPath = resolve(process.argv[1]);
  if (import.meta.url === pathToFileURL(argvPath).href) return true;

  try {
    return realpathSync(modulePath) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

export { repoRoot };
