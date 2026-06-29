#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentScript = fileURLToPath(import.meta.url);
export const repoRoot = resolve(dirname(currentScript), '..');
export const stickyMarker = '<!-- agent-inbox:v1 -->';
export const defaultStatusContext = 'agent-inbox-clean';
export const defaultAttentionLabel = 'agent-attention';

const prViewFields = [
  'number',
  'url',
  'state',
  'title',
  'isDraft',
  'reviewDecision',
  'mergeStateStatus',
  'statusCheckRollup',
  'latestReviews',
  'headRefOid',
  'headRefName',
  'baseRefName',
  'baseRefOid',
  'isCrossRepository',
  'labels',
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    repo: null,
    pr: null,
    json: false,
    format: 'summary',
    assertClean: false,
    refresh: false,
    updateComment: false,
    syncLabel: false,
    ensureLabel: false,
    publishStatus: false,
    ignoreChecks: [defaultStatusContext],
    allowPendingChecks: false,
    statusContext: defaultStatusContext,
    attentionLabel: defaultAttentionLabel,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') {
      index += 1;
      if (!argv[index]) throw new Error('--repo requires owner/name');
      options.repo = argv[index];
    } else if (arg === '--pr') {
      index += 1;
      if (!/^\d+$/.test(argv[index] ?? '')) throw new Error('--pr requires a pull request number');
      options.pr = Number(argv[index]);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--format') {
      index += 1;
      if (!argv[index]) throw new Error('--format requires summary or markdown');
      options.format = argv[index];
    } else if (arg === '--assert-clean') {
      options.assertClean = true;
    } else if (arg === '--refresh') {
      options.refresh = true;
    } else if (arg === '--update-comment') {
      options.updateComment = true;
    } else if (arg === '--sync-label') {
      options.syncLabel = true;
    } else if (arg === '--ensure-label') {
      options.ensureLabel = true;
    } else if (arg === '--publish-status') {
      options.publishStatus = true;
    } else if (arg === '--ignore-check') {
      index += 1;
      if (!argv[index]) throw new Error('--ignore-check requires a check name');
      options.ignoreChecks.push(argv[index]);
    } else if (arg === '--allow-pending-checks') {
      options.allowPendingChecks = true;
    } else if (arg === '--status-context') {
      index += 1;
      if (!argv[index]) throw new Error('--status-context requires a value');
      options.statusContext = argv[index];
      options.ignoreChecks.push(argv[index]);
    } else if (arg === '--attention-label') {
      index += 1;
      if (!argv[index]) throw new Error('--attention-label requires a label name');
      options.attentionLabel = argv[index];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['summary', 'markdown'].includes(options.format)) throw new Error('--format must be summary or markdown');
  if (options.refresh && options.assertClean) throw new Error('--refresh and --assert-clean are mutually exclusive');
  return options;
}

export function helpText() {
  return [
    'Usage: node scripts/pr-agent-inbox.mjs --pr <number> [--repo owner/name] [options]',
    '',
    'Computes the portable GitHub PR agent inbox state and optionally publishes it back to the PR.',
    '',
    'Common options:',
    '  --assert-clean          Exit nonzero when normalized clean=false.',
    '  --refresh               Publish state but exit zero for ordinary PR-attention findings.',
    '  --json                  Print the normalized JSON result.',
    '  --format markdown       Print the sticky inbox comment body.',
    '  --update-comment        Create or update the sticky PR comment.',
    '  --sync-label            Add/remove agent-attention from agent-actionable state.',
    '  --ensure-label          Create agent-attention if missing before syncing.',
    '  --publish-status        Publish agent-inbox-clean on the PR head SHA.',
    '  --ignore-check <name>   Ignore a check/status context during required-check classification.',
    '  --allow-pending-checks  Let pending required checks stay non-blocking for this run.',
  ].join('\n');
}

export class GhClient {
  constructor({ env = process.env, command = 'gh' } = {}) {
    this.env = env;
    this.command = command;
  }

  json(args, options = {}) {
    const text = this.text(args, options);
    if (!text.trim()) return null;
    return JSON.parse(text);
  }

  text(args, options = {}) {
    const result = spawnSync(this.command, args, {
      cwd: options.cwd ?? process.cwd(),
      encoding: 'utf8',
      env: this.env,
      shell: false,
    });

    if (result.status !== 0) {
      if (options.allowError) return options.defaultValue ?? '';
      const stderr = result.stderr?.trim() || result.error?.message || `gh exited ${result.status}`;
      throw new Error(`gh ${args.join(' ')} failed: ${stderr}`);
    }

    return result.stdout ?? '';
  }
}

export function splitRepo(repo) {
  const match = /^([^/]+)\/([^/]+)$/.exec(repo ?? '');
  if (!match) throw new Error(`Repository must be owner/name, got: ${repo}`);
  return { owner: match[1], name: match[2] };
}

export function defaultRepo(client) {
  const repo = client.json(['repo', 'view', '--json', 'nameWithOwner']);
  if (!repo?.nameWithOwner) throw new Error('Could not infer repository; pass --repo owner/name');
  return repo.nameWithOwner;
}

export function fetchInboxData(client, options) {
  const repo = options.repo ?? defaultRepo(client);
  const { owner, name } = splitRepo(repo);
  const pr = options.pr;
  if (!pr) throw new Error('--pr is required');

  const prView = client.json([
    'pr',
    'view',
    String(pr),
    '--repo',
    repo,
    '--json',
    prViewFields.join(','),
  ]);

  const reviewThreads = fetchReviewThreads(client, { owner, name, pr });
  const reviews = fetchRestPages(client, `repos/${owner}/${name}/pulls/${pr}/reviews`);
  const branchProtection = prView?.baseRefName
    ? fetchBranchProtection(client, { owner, name, branch: prView.baseRefName })
    : null;

  return {
    repo,
    owner,
    name,
    pr,
    prView,
    reviewThreads,
    reviews,
    branchProtection,
  };
}

export function fetchReviewThreads(client, { owner, name, pr }) {
  const query = `
    query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          reviewThreads(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              isResolved
              isOutdated
              path
              line
              startLine
              comments(first: 1) {
                nodes {
                  id
                  url
                  body
                  path
                  line
                  originalLine
                  author { login }
                }
              }
            }
          }
        }
      }
    }
  `;

  const nodes = [];
  let cursor = null;
  for (;;) {
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
      '-F',
      `number=${pr}`,
    ];
    if (cursor) args.push('-f', `cursor=${cursor}`);

    const response = client.json(args);
    const page = response?.data?.repository?.pullRequest?.reviewThreads
      ?? response?.repository?.pullRequest?.reviewThreads;
    if (!page) return nodes;
    nodes.push(...(page.nodes ?? []));
    if (!page.pageInfo?.hasNextPage) return nodes;
    cursor = page.pageInfo.endCursor;
  }
}

export function fetchRestPages(client, path) {
  const rows = [];
  for (let page = 1; page <= 100; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const data = client.json(['api', `${path}${separator}per_page=100&page=${page}`]);
    if (!Array.isArray(data)) return rows;
    rows.push(...data);
    if (data.length < 100) return rows;
  }
  throw new Error(`Refusing to fetch more than 100 pages from ${path}`);
}

export function fetchBranchProtection(client, { owner, name, branch }) {
  const encodedBranch = encodeURIComponent(branch);
  try {
    return client.json(['api', `repos/${owner}/${name}/branches/${encodedBranch}/protection`]);
  } catch (error) {
    if (/Branch not protected.*HTTP 404|HTTP 404.*Branch not protected/i.test(error.message)) {
      const rules = fetchBranchRules(client, { owner, name, branch });
      if (rules === null) return null;
      return branchProtectionFromRules(rules);
    }
    return null;
  }
}

export function fetchBranchRules(client, { owner, name, branch }) {
  const encodedBranch = encodeURIComponent(branch);
  try {
    return fetchRestPages(client, `repos/${owner}/${name}/rules/branches/${encodedBranch}`);
  } catch {
    return null;
  }
}

export function branchProtectionFromRules(rules) {
  const contexts = new Set();
  let requiredPullRequestReviews = null;
  let requiredConversationResolution = null;

  for (const rule of Array.isArray(rules) ? rules : []) {
    const parameters = rule.parameters ?? {};
    if (rule.type === 'required_status_checks') {
      for (const check of parameters.required_status_checks ?? []) {
        const context = check.context ?? check.name;
        if (context) contexts.add(context);
      }
      for (const context of parameters.contexts ?? []) {
        if (context) contexts.add(context);
      }
    }
    if (rule.type === 'pull_request') {
      if ((parameters.required_approving_review_count ?? 0) > 0
        || parameters.require_code_owner_review
        || parameters.require_last_push_approval
        || (parameters.required_reviewers ?? []).length > 0) {
        requiredPullRequestReviews = parameters;
      }
      if (parameters.required_review_thread_resolution) {
        requiredConversationResolution = { enabled: true };
      }
    }
  }

  return {
    required_status_checks: { contexts: [...contexts] },
    required_pull_request_reviews: requiredPullRequestReviews,
    required_conversation_resolution: requiredConversationResolution,
  };
}

export function analyzeInbox(data, options = {}) {
  const ignoreChecks = normalizeIgnoreChecks(options.ignoreChecks ?? [defaultStatusContext]);
  const items = [];
  const prView = data.prView ?? {};

  for (const thread of data.reviewThreads ?? []) {
    if (thread.isResolved) continue;
    const firstComment = thread.comments?.nodes?.[0] ?? {};
    items.push(item({
      kind: 'review_thread',
      severity: 'blocking',
      agentActionable: true,
      id: thread.id,
      author: firstComment.author?.login ?? null,
      url: firstComment.url ?? prView.url,
      summary: summarize(firstComment.body || `Unresolved review thread${thread.isOutdated ? ' (outdated)' : ''}`),
    }));
  }

  if (prView.reviewDecision === 'CHANGES_REQUESTED') {
    const review = latestReviewWithState(prView.latestReviews, 'CHANGES_REQUESTED') ?? latestReviewWithState(data.reviews, 'CHANGES_REQUESTED');
    items.push(item({
      kind: 'review_decision',
      severity: 'blocking',
      agentActionable: true,
      id: review?.id ?? 'changes-requested',
      author: review?.user?.login ?? review?.author?.login ?? null,
      url: review?.html_url ?? review?.url ?? prView.url,
      summary: summarize(review?.body || 'Active requested-changes review'),
    }));
  } else if (prView.reviewDecision === 'REVIEW_REQUIRED') {
    items.push(item({
      kind: 'review_required',
      severity: 'waiting',
      agentActionable: false,
      id: 'review-required',
      url: prView.url,
      summary: 'Waiting on required human review',
    }));
  }

  if (prView.isDraft) {
    items.push(item({
      kind: 'draft',
      severity: 'waiting',
      agentActionable: false,
      id: 'draft-pr',
      url: prView.url,
      summary: 'Pull request is still a draft',
    }));
  }

  addMergeStateItem(items, prView);
  addCheckItems(items, prView, data.branchProtection, { ignoreChecks, allowPendingChecks: options.allowPendingChecks });

  const agentAttention = items.some((entry) => entry.agentActionable && entry.severity === 'blocking');
  const clean = items.length === 0;
  const statusState = clean ? 'success' : (agentAttention ? 'failure' : 'pending');

  return {
    kind: 'pr-agent-inbox',
    repo: data.repo,
    pr: prView.number ?? data.pr,
    url: prView.url ?? null,
    title: prView.title ?? null,
    headRefOid: prView.headRefOid ?? null,
    headRefName: prView.headRefName ?? null,
    baseRefName: prView.baseRefName ?? null,
    clean,
    agentAttention,
    statusState,
    statusDescription: statusDescription({ clean, agentAttention, items }),
    items,
    checks: checkSummary(items),
    nativeProtection: nativeProtectionSummary(data.branchProtection),
  };
}

function addMergeStateItem(items, prView) {
  const state = prView.mergeStateStatus;
  if (!state || state === 'CLEAN') return;

  if (state === 'DIRTY') {
    items.push(item({
      kind: 'merge_state',
      severity: 'blocking',
      agentActionable: true,
      id: `merge-${state.toLowerCase()}`,
      url: prView.url,
      summary: `Merge state is ${state}`,
    }));
    return;
  }

  if (state === 'BEHIND' && !prView.isCrossRepository) {
    items.push(item({
      kind: 'merge_state',
      severity: 'blocking',
      agentActionable: true,
      id: 'merge-behind',
      url: prView.url,
      summary: 'Branch is behind the base branch',
    }));
    return;
  }

  if (state === 'UNSTABLE' || state === 'BLOCKED' || state === 'HAS_HOOKS') return;

  items.push(item({
    kind: 'merge_state',
    severity: 'waiting',
    agentActionable: false,
    id: `merge-${String(state).toLowerCase()}`,
    url: prView.url,
    summary: `Merge state is ${state}; refresh or GitHub mergeability may still be pending`,
  }));
}

function addCheckItems(items, prView, branchProtection, options) {
  const checks = Array.isArray(prView.statusCheckRollup) ? prView.statusCheckRollup : [];
  const requiredNames = requiredCheckNames(branchProtection);
  const requiredKnown = requiredNames !== null;

  for (const check of checks) {
    const name = checkName(check);
    if (!name || shouldIgnoreCheck(check, options.ignoreChecks)) continue;
    if (requiredKnown && !requiredNames.has(name)) continue;

    const state = checkState(check);
    if (state === 'success' || state === 'skipped' || state === 'neutral') continue;
    if (state === 'pending' && options.allowPendingChecks) continue;

    const blocking = state !== 'pending';
    items.push(item({
      kind: 'required_check',
      severity: blocking ? 'blocking' : 'waiting',
      agentActionable: blocking,
      id: name,
      url: check.detailsUrl ?? check.targetUrl ?? check.url ?? prView.url,
      summary: `${requiredKnown ? 'Required' : 'Potentially required'} check ${name} is ${state}`,
    }));
  }
}

export function renderMarkdown(result) {
  const status = result.clean ? 'Clean' : (result.agentAttention ? 'Agent attention needed' : 'Waiting');
  const lines = [
    stickyMarker,
    '# PR Agent Inbox',
    '',
    `Status: ${status}`,
    `PR: #${result.pr}`,
  ];

  if (result.headRefOid) lines.push(`Head: ${result.headRefOid}`);
  lines.push(`Inbox state: ${result.statusState}`);
  lines.push(`Agent attention: ${result.agentAttention ? 'yes' : 'no'}`);

  lines.push('', '## Items', '');
  if (!result.items.length) {
    lines.push('- None');
  } else {
    for (const entry of result.items) {
      const tag = entry.agentActionable ? 'agent' : 'waiting';
      const link = entry.url ? ` ([link](${entry.url}))` : '';
      lines.push(`- [${entry.severity}/${tag}] ${entry.summary}${link}`);
    }
  }

  lines.push('', '## Native GitHub Gates', '');
  lines.push(`- Required reviews: ${formatBoolean(result.nativeProtection.requiredReviews)}`);
  lines.push(`- Required conversation resolution: ${formatBoolean(result.nativeProtection.requiredConversationResolution)}`);
  if (result.nativeProtection.available === false) {
    lines.push('- Branch protection metadata unavailable to this token or branch.');
  }

  return `${lines.join('\n')}\n`;
}

export function renderSummary(result) {
  const status = result.clean ? 'clean' : (result.agentAttention ? 'agent-attention' : 'waiting');
  return `PR #${result.pr}: ${status} (${result.statusState})`;
}

export function publishStatus(client, result, options = {}) {
  if (!result.headRefOid) throw new Error('Cannot publish status without headRefOid');
  const context = options.statusContext ?? defaultStatusContext;
  const targetUrl = options.targetUrl ?? githubRunUrl() ?? result.url ?? undefined;
  const currentStatus = latestStatusForContext(client, result.repo, result.headRefOid, context);
  if (currentStatus?.state === result.statusState && currentStatus.description === result.statusDescription) {
    return { skipped: true };
  }
  const args = [
    'api',
    '-X',
    'POST',
    `repos/${result.repo}/statuses/${result.headRefOid}`,
    '-f',
    `state=${result.statusState}`,
    '-f',
    `context=${context}`,
    '-f',
    `description=${result.statusDescription}`,
  ];
  if (targetUrl) args.push('-f', `target_url=${targetUrl}`);
  client.json(args);
  return { skipped: false };
}

export function updateStickyComment(client, result) {
  const comments = fetchRestPages(client, `repos/${result.repo}/issues/${result.pr}/comments`);
  const body = renderMarkdown(result);
  const existing = comments.filter(isOwnedStickyComment).at(-1);
  if (existing) {
    client.json([
      'api',
      '-X',
      'PATCH',
      `repos/${result.repo}/issues/comments/${existing.id}`,
      '-f',
      `body=${body}`,
    ]);
  } else {
    client.json([
      'api',
      '-X',
      'POST',
      `repos/${result.repo}/issues/${result.pr}/comments`,
      '-f',
      `body=${body}`,
    ]);
  }
}

function isOwnedStickyComment(comment) {
  const body = String(comment.body ?? '');
  const author = String(comment.user?.login ?? '');
  return body.includes(stickyMarker)
    && body.includes('# PR Agent Inbox')
    && (author === 'github-actions[bot]' || author === 'github-actions');
}

export function ensureLabel(client, repo, label = defaultAttentionLabel) {
  client.json([
    'api',
    '-X',
    'POST',
    `repos/${repo}/labels`,
    '-f',
    `name=${label}`,
    '-f',
    'color=d73a4a',
    '-f',
    'description=Agent-actionable PR inbox item',
  ], { allowError: true, defaultValue: '{}' });
}

export function syncAttentionLabel(client, result, label = defaultAttentionLabel) {
  if (result.agentAttention) {
    client.json([
      'api',
      '-X',
      'POST',
      `repos/${result.repo}/issues/${result.pr}/labels`,
      '-f',
      `labels[]=${label}`,
    ]);
  } else {
    client.text([
      'api',
      '-X',
      'DELETE',
      `repos/${result.repo}/issues/${result.pr}/labels/${encodeURIComponent(label)}`,
    ], { allowError: true, defaultValue: '' });
  }
}

export function writeGitHubOutputs(result) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `clean=${result.clean ? 'true' : 'false'}`,
    `agent_attention=${result.agentAttention ? 'true' : 'false'}`,
    `status_state=${result.statusState}`,
    '',
  ].join('\n'));
}

function item({ kind, severity, agentActionable, id, author = null, url = null, summary }) {
  return { kind, severity, agentActionable, id, author, url, summary };
}

function latestReviewWithState(reviews = [], state) {
  return [...(reviews ?? [])].reverse().find((review) => review.state === state || review.state === state.replace('_', ''));
}

function requiredCheckNames(branchProtection) {
  if (!branchProtection) return null;
  const statusChecks = branchProtection.required_status_checks;
  if (!statusChecks) return new Set();
  const names = [
    ...(statusChecks.contexts ?? []),
    ...(statusChecks.checks ?? []).map((check) => check.context).filter(Boolean),
  ];
  return new Set(names);
}

function checkName(check) {
  return check.name ?? check.context ?? check.workflowName ?? null;
}

function shouldIgnoreCheck(check, ignoreChecks) {
  const names = [
    checkName(check),
    check.workflowName,
    check.context,
    check.name,
    check.checkSuite?.workflowRun?.workflow?.name,
  ].filter(Boolean).map(normalizeCheckName);

  return names.some((name) => ignoreChecks.has(name));
}

function normalizeIgnoreChecks(values) {
  return new Set((values ?? []).flatMap((value) => [
    normalizeCheckName(value),
    normalizeCheckName(`${value} / Agent inbox`),
  ]));
}

function normalizeCheckName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function checkState(check) {
  const raw = String(check.conclusion ?? check.state ?? check.status ?? '').toUpperCase();
  if (['SUCCESS', 'PASSED'].includes(raw)) return 'success';
  if (['SKIPPED'].includes(raw)) return 'skipped';
  if (['NEUTRAL'].includes(raw)) return 'neutral';
  if (['FAILURE', 'FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(raw)) {
    return raw.toLowerCase().replace(/_/g, '-');
  }
  if (['PENDING', 'QUEUED', 'REQUESTED', 'WAITING', 'IN_PROGRESS', 'EXPECTED'].includes(raw)) return 'pending';
  if (raw === 'COMPLETED') return check.conclusion ? checkState({ conclusion: check.conclusion }) : 'success';
  return raw ? raw.toLowerCase().replace(/_/g, '-') : 'pending';
}

function checkSummary(items) {
  return {
    failed: items.filter((entry) => entry.kind === 'required_check' && entry.severity === 'blocking').map((entry) => entry.id),
    pending: items.filter((entry) => entry.kind === 'required_check' && entry.severity === 'waiting').map((entry) => entry.id),
  };
}

function nativeProtectionSummary(branchProtection) {
  if (!branchProtection) {
    return {
      available: false,
      requiredReviews: null,
      requiredConversationResolution: null,
    };
  }

  return {
    available: true,
    requiredReviews: Boolean(branchProtection.required_pull_request_reviews),
    requiredConversationResolution: Boolean(branchProtection.required_conversation_resolution?.enabled),
  };
}

function latestStatusForContext(client, repo, ref, context) {
  const statuses = client.json(['api', `repos/${repo}/commits/${ref}/statuses`], {
    allowError: true,
    defaultValue: '[]',
  });
  if (!Array.isArray(statuses)) return null;
  const normalizedContext = normalizeCheckName(context);
  return statuses.find((status) => normalizeCheckName(status.context) === normalizedContext) ?? null;
}

function statusDescription({ clean, agentAttention, items }) {
  if (clean) return 'PR agent inbox is clean';
  if (agentAttention) return `${items.filter((entry) => entry.agentActionable).length} agent-actionable item(s)`;
  return 'PR is waiting on non-agent state';
}

function summarize(text, max = 120) {
  const singleLine = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!singleLine) return 'No summary available';
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, max - 3)}...`;
}

function formatBoolean(value) {
  if (value === null || value === undefined) return 'unknown';
  return value ? 'yes' : 'no';
}

function githubRunUrl() {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!server || !repo || !runId) return null;
  return `${server}/${repo}/actions/runs/${runId}`;
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

  const client = new GhClient();
  let result;
  try {
    const data = fetchInboxData(client, options);
    result = analyzeInbox(data, options);

    if (options.ensureLabel) ensureLabel(client, result.repo, options.attentionLabel);
    if (options.updateComment) updateStickyComment(client, result);
    if (options.syncLabel) syncAttentionLabel(client, result, options.attentionLabel);
    if (options.publishStatus) publishStatus(client, result, options);
    writeGitHubOutputs(result);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.format === 'markdown') {
    console.log(renderMarkdown(result));
  } else {
    console.log(renderSummary(result));
  }

  if (options.assertClean && !result.clean) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === currentScript) {
  main();
}
