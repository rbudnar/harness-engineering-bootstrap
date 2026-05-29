#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

const dangerousCommandPatterns = [
  /\bterraform\s+apply\b/,
  /\bterraform\s+destroy\b/,
  /\bkubectl\s+(apply|delete|replace|rollout|scale|patch)\b/,
  /\bhelm\s+(upgrade|install|uninstall|delete|rollback)\b/,
  /\bnpm\s+publish\b/,
  /\bpnpm\s+publish\b/,
  /\byarn\s+npm\s+publish\b/,
  /\bbun\s+publish\b/,
  /\bgit\s+push\b/,
  /\bgh\s+release\b/,
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?[\w:-]*(deploy|publish|release)[\w:-]*\b/,
  /\baz\s+.+\b(create|delete|deploy|update)\b/,
  /\baws\s+.+\b(put|delete|create|deploy|publish|update)\b/,
  /\bgcloud\s+.+\b(deploy|delete|create|update)\b/,
  /\brm\s+-rf\b/,
  /\s--(fix|write)\b/,
];

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
    trigger: (survey) => survey.ci.files.some((path) => path.startsWith('.github/')),
    evidence: (survey) => sampleValues(survey.ci.files.filter((path) => path.startsWith('.github/'))),
    smallerControl:
      'Use local metrics only if the repo has little PR activity or no GitHub review loop.',
    validation:
      'Track a small marker set or scheduled summary only after PR workflow friction is visible.',
    rejection: 'No GitHub workflow files were detected.',
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
  const detectedInstructionFiles = instructionFiles.filter((path) => fileSet.has(path));
  const docs = collectDocs(allFiles);
  const packageManager = inferPackageManager(fileSet, packageJson);
  const packageScripts = collectPackageScripts(packageManifests, packageManager);
  const makeTargets = collectMakeTargets(root, fileSet);
  const ci = collectCi(root, allFiles, packageJson);
  const scriptFiles = allFiles.filter((path) => path.startsWith('scripts/')).sort();
  const harnessControls = collectHarnessControls(allFiles);
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
    packageFiles: packageManifests.map((manifest) => manifest.path),
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
    runtimeSafetyHints: collectRuntimeSafetyHints(allFiles, ci, packageManifests),
    planHints: collectPlanHints(allFiles),
    urlMapHints: collectUrlMapHints(allFiles),
    evidenceHints: collectEvidenceHints(allFiles),
    harnessControls,
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
    if (arg === '--help' || arg === '-h') {
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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function buildRequiredCore(survey) {
  const commandEvidence = survey.commands.map((command) => command.command);
  const hasDecisionMemory = survey.docs.hasDecisionMemory;

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
      status: survey.harnessControls.some((path) => /template-fitness|validate-harness|harness-audit/i.test(path))
        ? 'present'
        : 'missing',
      evidence: survey.harnessControls.filter((path) => /template-fitness|validate-harness|harness-audit/i.test(path)),
      action: survey.harnessControls.some((path) => /template-fitness|validate-harness|harness-audit/i.test(path))
        ? 'Keep harness validation wired into local checks or CI.'
        : 'Add a minimal harness validator only after the first required harness files exist.',
      smallerControl: 'Start with size/route checks before adding semantic validators.',
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
    : currentVersion === targetVersion
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

  return {
    applicable: true,
    status,
    currentVersion,
    targetVersion,
    suggestedBranch: `codex/heb-update-${slugify(targetVersion || date || planSlug)}`,
    releaseSource: 'Use GitHub releases/tags and CHANGELOG.md as the source of truth for template changes.',
    versionMetadata,
    steps: [
      'Start from a clean branch and keep the update as a reviewable PR, not an in-place edit on the default branch.',
      'Read the target release notes, CHANGELOG entry, and template diff before touching the consuming repo.',
      'Classify each upstream template change as already satisfied, applicable fix, intentionally rejected as bloat, or blocked by missing local trigger.',
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
    questions.push('Is CI intentionally absent, or should harness validation include adding a basic CI check?');
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

  if (resolve(root) === repoRoot && files.includes('VERSION')) {
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
  if (harnessControls.some((path) => /template-fitness|validate-harness|harness-audit/i.test(path))) {
    evidence.push('harness validation');
  }

  const status = evidence.length >= 3 ? 'bootstrapped' : 'fresh';
  const confidence = versionState.installedVersion
    ? 'high'
    : evidence.length >= 4
      ? 'high'
      : evidence.length >= 3
        ? 'medium'
        : 'low';

  return {
    status,
    confidence,
    evidence,
  };
}

function collectCi(root, files, packageJson = null) {
  const ciFiles = files.filter((path) => {
    const lower = path.toLowerCase();
    return lower.startsWith('.github/workflows/')
      || lower === 'jenkinsfile'
      || lower === '.gitlab-ci.yml'
      || lower === 'azure-pipelines.yml'
      || lower === 'bitbucket-pipelines.yml'
      || lower.startsWith('.circleci/');
  }).sort();

  const runCommands = [];
  for (const path of ciFiles) {
    const text = readText(root, path);
    if (path.toLowerCase().startsWith('.github/workflows/')) {
      runCommands.push(...collectWorkflowRunCommands(text, path, packageJson));
    } else {
      runCommands.push(...collectGenericCiRunCommands(text, path, packageJson));
    }
  }

  return {
    files: ciFiles,
    runCommands: dedupeObjects(runCommands, (item) => `${item.source}\0${item.workingDirectory ?? ''}\0${item.command}`),
  };
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

function collectPackageScripts(packageManifests, packageManager) {
  return packageManifests.flatMap((manifest) => (
    collectPackageScriptsFromManifest(manifest, packageManager)
  ));
}

function collectPackageScriptsFromManifest(manifest, packageManager) {
  const packageJson = manifest.json;
  if (!packageJson || typeof packageJson.scripts !== 'object') return [];

  return Object.entries(packageJson.scripts)
    .filter(([name]) => /(^|:)(test|build|lint|typecheck|check|quality|validate|coverage)(:|$)/i.test(name))
    .map(([name]) => {
      const command = packageScriptCommand(packageManager, name, manifest.directory);
      return {
        source: manifest.path,
        command,
        unsafeReason: unsafePackageScriptReason(command, packageJson),
      };
    })
    .filter((script) => !script.unsafeReason)
    .filter((script) => isSafeValidationCommand(script.command))
    .map(({ source, command }) => ({ source, command }));
}

function packageScriptCommand(packageManager, name, directory = '') {
  if (directory) return scopedPackageScriptCommand(packageManager, name, directory);
  if (packageManager === 'yarn') return `yarn ${name}`;
  if (packageManager === 'pnpm') return name === 'test' ? 'pnpm test' : `pnpm run ${name}`;
  if (packageManager === 'bun') return `bun run ${name}`;
  return name === 'test' ? 'npm test' : `npm run ${name}`;
}

function scopedPackageScriptCommand(packageManager, name, directory) {
  const path = quotePath(directory);
  if (packageManager === 'yarn') return `yarn --cwd ${path} ${name}`;
  if (packageManager === 'pnpm') return name === 'test' ? `pnpm --dir ${path} test` : `pnpm --dir ${path} run ${name}`;
  if (packageManager === 'bun') return `bun --cwd ${path} run ${name}`;
  return name === 'test' ? `npm --prefix ${path} test` : `npm --prefix ${path} run ${name}`;
}

function collectMakeTargets(root, fileSet) {
  if (!fileSet.has('Makefile')) return [];
  const text = readText(root, 'Makefile');
  return text.split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9_.-]+):(?!=)/)?.[1])
    .filter(Boolean)
    .filter((name) => /^(test|build|lint|check|quality|validate|coverage)$/i.test(name))
    .map((name) => ({ source: 'Makefile', command: `make ${name}` }));
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

function collectRuntimeSafetyHints(files, ci = { runCommands: [] }, packageManifests = []) {
  const fileHints = files.filter((path) => {
    const lower = path.toLowerCase();
    const name = basename(lower);
    return name === 'dockerfile'
      || name.startsWith('dockerfile.')
      || lower.includes('docker-compose')
      || lower.endsWith('.tf')
      || hasPathSegment(lower, 'terraform')
      || hasPathSegment(lower, 'k8s')
      || hasPathSegment(lower, 'helm')
      || hasPathSegment(lower, 'deploy')
      || hasPathSegment(lower, 'infra')
      || lower.endsWith('.env.example')
      || lower.endsWith('.env.sample')
      || lower.includes('/mcp')
      || lower === '.mcp.json'
      || lower === 'mcp.json'
      || hasPathSegment(lower, 'secrets');
  }).map((path) => ({ path, reason: 'deploy, credential, production, or tool-runtime surface' }));

  const commandHints = ci.runCommands
    .filter((command) => !command.safe && isRuntimeSafetyCommand(command))
    .map((command) => ({
      path: command.source,
      reason: `CI command may mutate external state: ${formatInlineValue(command.command)}`,
    }));

  const packageHints = collectPackageRuntimeSafetyHints(packageManifests);

  return dedupeObjects([...fileHints, ...commandHints, ...packageHints], (hint) => `${hint.path}\0${hint.reason}`);
}

function collectPackageRuntimeSafetyHints(packageManifests) {
  return packageManifests.flatMap((manifest) => {
    const packageJson = manifest.json;
    if (!packageJson || typeof packageJson.scripts !== 'object') return [];

    return Object.entries(packageJson.scripts)
      .filter(([name, body]) => isAuthorityPackageScript(name) || hasDangerousCommand(body))
      .map(([name]) => ({
        path: manifest.path,
        reason: `package script "${name}" may mutate external state`,
      }));
  });
}

function isRuntimeSafetyCommand(command) {
  return hasDangerousCommand(command.command) || Boolean(command.packageScriptReason);
}

function collectPlanHints(files) {
  return files.filter((path) => {
    const lower = path.toLowerCase();
    return lower.includes('/plans/')
      || lower.includes('/handoff')
      || lower.includes('/task-contract')
      || lower.includes('/tasks/');
  }).map((path) => ({ path, reason: 'plan, handoff, or task-contract surface' }));
}

function collectUrlMapHints(files) {
  return files.filter((path) => /(^|\/)llms(-full)?\.txt$/i.test(path) || /docs-site|site\/|\.vitepress\//i.test(path))
    .map((path) => ({ path, reason: 'remote-agent context map or docs site' }));
}

function collectEvidenceHints(files) {
  return files.filter((path) => /(^|\/)(evidence|source-pack|research)(\/|\.md$)/i.test(path))
    .map((path) => ({ path, reason: 'source-heavy research or evidence surface' }));
}

function collectWorkflowRunCommands(text, source, packageJson = null) {
  const lines = text.split(/\r?\n/);
  const commands = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)-?\s*run:\s*(.*)\s*$/);
    if (!match) continue;
    if (isWorkflowDefaultsRunKey(lines, index)) continue;

    const command = match[2].trim();
    const workingDirectory = findWorkflowWorkingDirectory(lines, index);
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

      const blockCommand = normalizeRunBlock(blockLines);
      if (blockCommand) {
        commands.push(classifyCiRunCommand(source, blockCommand, true, packageJson, { workingDirectory }));
      }
    } else {
      commands.push(classifyCiRunCommand(source, stripYamlQuotes(command), false, packageJson, { workingDirectory }));
    }
  }

  return commands;
}

function collectGenericCiRunCommands(text, source, packageJson = null) {
  const lines = text.split(/\r?\n/);
  const commands = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const shellMatch = line.match(/^\s*sh\s+['"](.+)['"]\s*$/);
    if (shellMatch) {
      commands.push(classifyCiRunCommand(source, shellMatch[1].trim(), false, packageJson));
      continue;
    }

    const keyMatch = line.match(/^\s*(?:-\s*)?(?:script|command):\s*(.*)\s*$/);
    if (!keyMatch) continue;

    const value = keyMatch[1].trim();
    if (/^[|>]/.test(value) || value === '') {
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

        const listCommand = nextLine.match(/^\s*-\s+(.+?)\s*$/)?.[1];
        if (listCommand) {
          commands.push(classifyCiRunCommand(source, stripYamlQuotes(listCommand.trim()), false, packageJson));
        } else {
          blockLines.push(nextLine);
        }
        index = nextIndex;
      }

      const blockCommand = normalizeRunBlock(blockLines);
      if (blockCommand) commands.push(classifyCiRunCommand(source, blockCommand, true, packageJson));
    } else {
      commands.push(classifyCiRunCommand(source, stripYamlQuotes(value), false, packageJson));
    }
  }

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
  for (let index = runIndex - 1; index >= 0; index -= 1) {
    const value = parseWorkflowWorkingDirectory(lines[index]);
    if (!value || !isDefaultsRunWorkingDirectory(lines, index)) continue;
    return value;
  }

  return null;
}

function isDefaultsRunWorkingDirectory(lines, workingDirectoryIndex) {
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

    if (currentIndent < runIndent && /^\s*defaults:\s*$/.test(line)) return true;
    if (currentIndent < runIndent) return false;
  }

  return false;
}

function collectHarnessControls(files) {
  return files.filter((path) => {
    const lower = path.toLowerCase();
    return instructionFiles.map((file) => file.toLowerCase()).includes(lower)
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
      || lower.includes('harness-health');
  }).sort();
}

function walkFiles(root, options) {
  const paths = [];
  const maxFiles = options.maxFiles ?? 5000;
  let truncated = false;

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

    for (const entry of entries) {
      if (paths.length >= maxFiles) {
        truncated = true;
        return;
      }

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) walk(fullPath);
      } else if (entry.isFile()) {
        paths.push(normalizePath(relative(root, fullPath)));
      }
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
    return readFileSync(join(repoRoot, 'VERSION'), 'utf8').split(/\r?\n/)[0]?.trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function inferPackageManager(fileSet, packageJson = null) {
  const declaredPackageManager = typeof packageJson?.packageManager === 'string'
    ? packageJson.packageManager.toLowerCase()
    : '';

  if (declaredPackageManager.startsWith('pnpm@')) return 'pnpm';
  if (declaredPackageManager.startsWith('yarn@')) return 'yarn';
  if (declaredPackageManager.startsWith('bun@')) return 'bun';
  if (declaredPackageManager.startsWith('npm@')) return 'npm';

  if (fileSet.has('pnpm-lock.yaml')) return 'pnpm';
  if (fileSet.has('yarn.lock')) return 'yarn';
  if (fileSet.has('bun.lock') || fileSet.has('bun.lockb')) return 'bun';
  return 'npm';
}

function samplePaths(items, limit = 5) {
  return sampleValues(dedupe(items.map((item) => item.path)), limit);
}

function sampleHintEvidence(items, limit = 5) {
  return sampleValues(dedupe(items.map((item) => `${item.path} (${item.reason})`)), limit);
}

function healthControlEvidence(survey) {
  return survey.harnessControls.filter((path) => /template-fitness|validate-harness|harness-audit|harness-metrics|harness-health|health-report/i.test(path));
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

function normalizeRunBlock(lines) {
  const nonEmpty = lines.filter((line) => line.trim());
  if (!nonEmpty.length) return '';

  const minIndent = Math.min(...nonEmpty.map((line) => indentation(line)));
  return lines
    .map((line) => line.slice(Math.min(minIndent, line.length)).trim())
    .filter((line) => line && !line.startsWith('#'))
    .join('\n');
}

function classifyCiRunCommand(source, command, multiline, packageJson = null, options = {}) {
  const workingDirectory = options.workingDirectory ?? null;
  const workingDirectoryReason = workingDirectory
    ? `it declares working-directory ${formatInlineValue(workingDirectory)}; inspect and run from that directory manually`
    : null;
  const packageScriptReason = unsafePackageScriptReason(command, packageJson);
  const safe = !workingDirectoryReason && !packageScriptReason && isSafeValidationCommand(command);
  return {
    source,
    command,
    multiline,
    workingDirectory,
    packageScriptReason,
    safe,
    inspectOnlyReason: safe
      ? null
      : workingDirectoryReason || packageScriptReason || 'it is not a known-safe validation command or it may mutate external state',
  };
}

function isSafeValidationCommand(command) {
  if (hasShellPipeline(command)) return false;

  const parts = splitShellCommandParts(command);
  if (!parts.length) return false;

  return parts.every(isSafeValidationCommandPart);
}

function hasDangerousCommand(command) {
  return splitShellCommandParts(String(command ?? ''))
    .some((part) => dangerousCommandPatterns.some((pattern) => pattern.test(part.toLowerCase())));
}

function unsafePackageScriptReason(command, packageJson) {
  if (!packageJson || typeof packageJson.scripts !== 'object') return null;

  for (const part of splitShellCommandParts(command)) {
    for (const lifecycleScript of installLifecycleScriptNames(part, packageJson.scripts)) {
      const unsafeLifecycleScript = findUnsafePackageScript(lifecycleScript, packageJson.scripts);
      if (unsafeLifecycleScript) {
        return `it may run install lifecycle "${lifecycleScript}" whose dependency chain "${unsafeLifecycleScript.chain.join(' -> ')}" may mutate external state`;
      }
    }

    const scriptName = packageScriptNameFromCommand(part);
    if (!scriptName || !Object.hasOwn(packageJson.scripts, scriptName)) continue;
    const unsafeScript = findUnsafePackageScript(scriptName, packageJson.scripts);
    if (unsafeScript) {
      return `it calls package script "${scriptName}" whose dependency chain "${unsafeScript.chain.join(' -> ')}" may mutate external state`;
    }
  }

  return null;
}

function installLifecycleScriptNames(command, scripts) {
  if (!isInstallCommand(command)) return [];
  return [
    'preinstall',
    'install',
    'postinstall',
    'preprepare',
    'prepare',
    'postprepare',
  ].filter((name) => Object.hasOwn(scripts, name));
}

function isInstallCommand(command) {
  const trimmed = command.trim().toLowerCase();
  return /^(npm\s+ci|npm\s+install|pnpm\s+install|yarn\s+install|bun\s+install)\b/.test(trimmed);
}

function findUnsafePackageScript(scriptName, scripts, chain = []) {
  if (!Object.hasOwn(scripts, scriptName)) return null;
  if (chain.includes(scriptName)) return null;

  const nextChain = [...chain, scriptName];
  for (const lifecycleScript of lifecycleScriptNames(scriptName, scripts)) {
    const unsafeLifecycleScript = findUnsafePackageScript(lifecycleScript, scripts, nextChain);
    if (unsafeLifecycleScript) return unsafeLifecycleScript;
  }

  const body = String(scripts[scriptName] ?? '');
  if (hasDangerousCommand(body)) return { scriptName, chain: nextChain };

  for (const part of splitShellCommandParts(body)) {
    const childScript = packageScriptNameFromCommand(part);
    if (!childScript) continue;
    const unsafeScript = findUnsafePackageScript(childScript, scripts, nextChain);
    if (unsafeScript) return unsafeScript;
  }

  return null;
}

function lifecycleScriptNames(scriptName, scripts) {
  if (/^(pre|post)/i.test(scriptName)) return [];
  return [`pre${scriptName}`, `post${scriptName}`].filter((name) => Object.hasOwn(scripts, name));
}

function isAuthorityPackageScript(name) {
  return /(^|:)(deploy|release|publish|provision)(:|$)/i.test(name);
}

function packageScriptNameFromCommand(command) {
  const trimmed = command.trim();

  const npmPrefixRun = trimmed.match(/^npm\s+--prefix\s+\S+\s+run\s+([\w:-]+)/i);
  if (npmPrefixRun) return npmPrefixRun[1];

  const npmPrefixTest = trimmed.match(/^npm\s+--prefix\s+\S+\s+test\b/i);
  if (npmPrefixTest) return 'test';

  const pnpmDirRun = trimmed.match(/^pnpm\s+--dir\s+\S+\s+run\s+([\w:-]+)/i);
  if (pnpmDirRun) return pnpmDirRun[1];

  const pnpmDirTest = trimmed.match(/^pnpm\s+--dir\s+\S+\s+test\b/i);
  if (pnpmDirTest) return 'test';

  const yarnCwd = trimmed.match(/^yarn\s+--cwd\s+\S+\s+(?:run\s+)?([\w:-]+)/i);
  if (yarnCwd && !['add', 'install', 'remove'].includes(yarnCwd[1].toLowerCase())) return yarnCwd[1];

  const bunCwdRun = trimmed.match(/^bun\s+--cwd\s+\S+\s+run\s+([\w:-]+)/i);
  if (bunCwdRun) return bunCwdRun[1];

  const run = trimmed.match(/^(?:npm|pnpm|bun)\s+run\s+([\w:-]+)/i);
  if (run) return run[1];

  const test = trimmed.match(/^(?:npm|pnpm|yarn|bun)\s+test\b/i);
  if (test) return 'test';

  const yarn = trimmed.match(/^yarn\s+(?:run\s+)?([\w:-]+)/i);
  if (yarn && !['add', 'install', 'remove'].includes(yarn[1].toLowerCase())) return yarn[1];

  const direct = trimmed.match(/^(?:pnpm|bun)\s+([\w:-]+)/i);
  if (direct && !['add', 'install', 'remove'].includes(direct[1].toLowerCase())) return direct[1];

  return null;
}

function splitShellCommandParts(command) {
  return command
    .split(/\r?\n|&&|\|\||;/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasShellPipeline(command) {
  return /(^|[^|])\|(?!\|)/.test(String(command ?? ''));
}

function isSafeValidationCommandPart(part) {
  const lower = part.toLowerCase();
  if (dangerousCommandPatterns.some((pattern) => pattern.test(lower))) return false;

  const validationPatterns = [
    /\b(node\s+--test|npm\s+test|pnpm\s+test|yarn\s+test|bun\s+test)\b/,
    /\bnpm\s+--prefix\s+\S+\s+(test|run\s+[\w:-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:-]*)\b/,
    /\bpnpm\s+--dir\s+\S+\s+(test|run\s+[\w:-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:-]*)\b/,
    /\byarn\s+--cwd\s+\S+\s+[\w:-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:-]*\b/,
    /\bbun\s+--cwd\s+\S+\s+run\s+[\w:-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:-]*\b/,
    /\b(npm|pnpm|yarn|bun)\s+run\s+[\w:-]*(test|build|lint|typecheck|check|quality|validate|coverage)[\w:-]*\b/,
    /\b(npm|pnpm|yarn|bun)\s+(build|lint|typecheck|check|validate)\b/,
    /\b(pytest|python\s+-m\s+pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test)\b/,
    /\b(make)\s+(test|build|lint|check|quality|validate|coverage)\b/,
    /\b(terraform\s+validate|terraform\s+fmt\s+-check)\b/,
    /\b(template-fitness|validate-harness|harness-audit)\b/,
    /\bnpm\s+ci\b/,
    /\bpnpm\s+install\b/,
    /\byarn\s+install\b/,
  ];

  return validationPatterns.some((pattern) => pattern.test(lower));
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
  console.log(`Usage: node scripts/harness-bootstrap-plan.mjs [--repo <path>] [--json] [--date YYYY-MM-DD]

Read-only survey and bootstrap plan generator.

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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

export { repoRoot };
