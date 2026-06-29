import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyzeInbox,
  defaultAttentionLabel,
  ensureLabel,
  fetchBranchProtection,
  fetchReviewThreads,
  parseArgs,
  publishStatus,
  renderMarkdown,
  syncAttentionLabel,
  updateStickyComment,
} from './pr-agent-inbox.mjs';

test('resolved review thread is clean', () => {
  const result = analyzeInbox(data({
    reviewThreads: [
      thread({ isResolved: true, body: 'resolved already' }),
    ],
  }));

  assert.equal(result.clean, true);
  assert.equal(result.agentAttention, false);
  assert.equal(result.statusState, 'success');
});

test('unresolved outdated review thread still blocks until resolved', () => {
  const result = analyzeInbox(data({
    reviewThreads: [
      thread({ isOutdated: true, body: 'please normalize this' }),
    ],
  }));

  assert.equal(result.clean, false);
  assert.equal(result.agentAttention, true);
  assert.equal(result.statusState, 'failure');
  assert.equal(result.items[0].kind, 'review_thread');
});

test('fetchReviewThreads unwraps gh GraphQL data responses', () => {
  const rows = fetchReviewThreads(fakeClient({
    responses: {
      graphql: {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [thread({ body: 'live thread' })],
              },
            },
          },
        },
      },
    },
  }), { owner: 'owner', name: 'repo', pr: 1 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].comments.nodes[0].body, 'live thread');
});

test('body-only requested changes block without inline threads', () => {
  const result = analyzeInbox(data({
    prView: {
      reviewDecision: 'CHANGES_REQUESTED',
      latestReviews: [
        { id: 'review-1', state: 'CHANGES_REQUESTED', body: 'Please fix the release note.', author: { login: 'reviewer' }, url: 'https://example/review' },
      ],
    },
    reviews: [
      { id: 1, state: 'CHANGES_REQUESTED', body: 'Please fix the release note.', user: { login: 'reviewer' }, html_url: 'https://example/review' },
    ],
  }));

  assert.equal(result.clean, false);
  assert.equal(result.agentAttention, true);
  assert.equal(result.items[0].kind, 'review_decision');
  assert.match(result.items[0].summary, /release note/);
});

test('requested-changes summary prefers active latest review over stale REST history', () => {
  const result = analyzeInbox(data({
    prView: {
      reviewDecision: 'CHANGES_REQUESTED',
      latestReviews: [
        { id: 'active-review', state: 'CHANGES_REQUESTED', body: 'Active blocker.', author: { login: 'reviewer-a' }, url: 'https://example/active' },
      ],
    },
    reviews: [
      { id: 1, state: 'CHANGES_REQUESTED', body: 'Stale blocker.', user: { login: 'reviewer-b' }, html_url: 'https://example/stale' },
      { id: 2, state: 'APPROVED', body: 'Approved now.', user: { login: 'reviewer-b' }, html_url: 'https://example/approve' },
    ],
  }));

  assert.match(result.items[0].summary, /Active blocker/);
  assert.equal(result.items[0].url, 'https://example/active');
});


test('review required is waiting, not agent attention, and not clean', () => {
  const result = analyzeInbox(data({
    prView: {
      reviewDecision: 'REVIEW_REQUIRED',
    },
  }));

  assert.equal(result.clean, false);
  assert.equal(result.agentAttention, false);
  assert.equal(result.statusState, 'pending');
  assert.equal(result.items[0].kind, 'review_required');
});

test('dirty merge state is agent-actionable', () => {
  const result = analyzeInbox(data({
    prView: {
      mergeStateStatus: 'DIRTY',
    },
  }));

  assert.equal(result.clean, false);
  assert.equal(result.agentAttention, true);
  assert.equal(result.items[0].kind, 'merge_state');
});

test('same-repo behind branch is agent-actionable merge-readiness work', () => {
  const result = analyzeInbox(data({
    prView: {
      mergeStateStatus: 'BEHIND',
      isCrossRepository: false,
    },
  }));

  assert.equal(result.clean, false);
  assert.equal(result.agentAttention, true);
  assert.equal(result.statusState, 'failure');
  assert.equal(result.items[0].id, 'merge-behind');
});

test('unknown merge state is waiting and not clean', () => {
  const result = analyzeInbox(data({
    prView: {
      mergeStateStatus: 'UNKNOWN',
    },
  }));

  assert.equal(result.clean, false);
  assert.equal(result.agentAttention, false);
  assert.equal(result.statusState, 'pending');
});

test('unstable merge state does not block when only optional checks are failing', () => {
  const result = analyzeInbox(data({
    prView: {
      mergeStateStatus: 'UNSTABLE',
      statusCheckRollup: [
        { name: 'Optional experiment', conclusion: 'FAILURE' },
      ],
    },
    branchProtection: {
      required_status_checks: { contexts: [] },
    },
  }));

  assert.equal(result.clean, true);
  assert.equal(result.agentAttention, false);
});

test('blocked merge state does not self-deadlock on ignored inbox status', () => {
  const result = analyzeInbox(data({
    prView: {
      mergeStateStatus: 'BLOCKED',
      statusCheckRollup: [
        { name: 'agent-inbox-clean', state: 'PENDING' },
      ],
    },
    branchProtection: {
      required_status_checks: { contexts: ['agent-inbox-clean'] },
    },
  }), {
    ignoreChecks: ['agent-inbox-clean'],
    allowPendingChecks: true,
  });

  assert.equal(result.clean, true);
  assert.equal(result.statusState, 'success');
});

test('has-hooks merge state is mergeable and does not block by itself', () => {
  const result = analyzeInbox(data({
    prView: {
      mergeStateStatus: 'HAS_HOOKS',
      statusCheckRollup: [],
    },
  }));

  assert.equal(result.clean, true);
  assert.equal(result.agentAttention, false);
  assert.equal(result.statusState, 'success');
});

test('failed required check blocks and inbox check is ignored', () => {
  const result = analyzeInbox(data({
    prView: {
      statusCheckRollup: [
        { name: 'Template Fitness', conclusion: 'FAILURE', detailsUrl: 'https://example/check' },
        { name: 'agent-inbox-clean', conclusion: 'FAILURE' },
      ],
    },
    branchProtection: {
      required_status_checks: {
        contexts: ['Template Fitness', 'agent-inbox-clean'],
      },
    },
  }));

  assert.equal(result.clean, false);
  assert.equal(result.agentAttention, true);
  assert.deepEqual(result.checks.failed, ['Template Fitness']);
});

test('required workflow slash job contexts match split check rollup names', () => {
  const result = analyzeInbox(data({
    prView: {
      statusCheckRollup: [
        { workflowName: 'Template Fitness', name: 'template-fitness', conclusion: 'FAILURE' },
      ],
    },
    branchProtection: {
      required_status_checks: {
        contexts: ['Template Fitness / template-fitness'],
      },
    },
  }));

  assert.equal(result.clean, false);
  assert.equal(result.agentAttention, true);
  assert.deepEqual(result.checks.failed, ['template-fitness']);
});

test('fallback required-check scan treats non-inbox failures as required', () => {
  const result = analyzeInbox(data({
    prView: {
      statusCheckRollup: [
        { name: 'Template Fitness', conclusion: 'FAILURE' },
        { workflowName: 'PR Agent Inbox', name: 'Agent inbox', conclusion: 'FAILURE' },
      ],
    },
    branchProtection: null,
  }), {
    ignoreChecks: ['agent-inbox-clean', 'PR Agent Inbox', 'Agent inbox'],
  });

  assert.equal(result.clean, false);
  assert.deepEqual(result.checks.failed, ['Template Fitness']);
});

test('unprotected branch metadata treats optional failed checks as optional', () => {
  const branchProtection = fetchBranchProtection({
    json(args) {
      if (args.at(-1).includes('/rules/branches/')) return [];
      throw new Error('gh api repos/o/r/branches/feature/protection failed: gh: Branch not protected (HTTP 404)');
    },
  }, { owner: 'o', name: 'r', branch: 'feature' });

  const result = analyzeInbox(data({
    prView: {
      statusCheckRollup: [
        { name: 'Optional experiment', conclusion: 'FAILURE' },
      ],
    },
    branchProtection,
  }));

  assert.equal(result.clean, true);
  assert.equal(result.nativeProtection.available, true);
});

test('ruleset-only branch metadata is honored after classic protection 404', () => {
  const branchProtection = fetchBranchProtection({
    json(args) {
      if (args.at(-1).includes('/rules/branches/')) {
        return [
          {
            type: 'pull_request',
            parameters: {
              required_approving_review_count: 1,
              required_review_thread_resolution: true,
            },
          },
          {
            type: 'required_status_checks',
            parameters: {
              required_status_checks: [{ context: 'Template Fitness' }],
            },
          },
        ];
      }
      throw new Error('gh api repos/o/r/branches/main/protection failed: gh: Branch not protected (HTTP 404)');
    },
  }, { owner: 'o', name: 'r', branch: 'main' });

  const result = analyzeInbox(data({
    prView: {
      statusCheckRollup: [
        { name: 'Template Fitness', conclusion: 'FAILURE' },
        { name: 'Optional experiment', conclusion: 'FAILURE' },
      ],
    },
    branchProtection,
  }));

  assert.equal(result.nativeProtection.requiredReviews, true);
  assert.equal(result.nativeProtection.requiredConversationResolution, true);
  assert.equal(result.clean, false);
  assert.deepEqual(result.checks.failed, ['Template Fitness']);
});

test('classic branch protection is merged with ruleset-only required checks', () => {
  const branchProtection = fetchBranchProtection({
    json(args) {
      const path = args.at(-1);
      if (path.includes('/protection')) {
        return {
          required_status_checks: { contexts: [] },
          required_pull_request_reviews: { required_approving_review_count: 1 },
        };
      }
      if (path.includes('/rules/branches/')) {
        return [
          {
            type: 'required_status_checks',
            parameters: {
              required_status_checks: [{ context: 'Template Fitness' }],
            },
          },
          {
            type: 'pull_request',
            parameters: {
              required_review_thread_resolution: true,
            },
          },
        ];
      }
      return [];
    },
  }, { owner: 'o', name: 'r', branch: 'main' });

  const result = analyzeInbox(data({
    prView: {
      statusCheckRollup: [
        { name: 'Template Fitness', conclusion: 'FAILURE' },
      ],
    },
    branchProtection,
  }));

  assert.equal(result.nativeProtection.requiredReviews, true);
  assert.equal(result.nativeProtection.requiredConversationResolution, true);
  assert.equal(result.clean, false);
  assert.deepEqual(result.checks.failed, ['Template Fitness']);
});

test('ruleset branch metadata is paginated before required checks are trusted', () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    type: 'deletion',
    parameters: { index },
  }));
  const branchProtection = fetchBranchProtection({
    json(args) {
      const path = args.at(-1);
      if (path.includes('/protection')) {
        throw new Error('gh api repos/o/r/branches/main/protection failed: gh: Branch not protected (HTTP 404)');
      }
      const page = Number(new URL(`https://example.test/${path}`).searchParams.get('page'));
      if (page === 1) return firstPage;
      if (page === 2) {
        return [
          {
            type: 'required_status_checks',
            parameters: {
              required_status_checks: [{ context: 'Template Fitness' }],
            },
          },
        ];
      }
      return [];
    },
  }, { owner: 'o', name: 'r', branch: 'main' });

  const result = analyzeInbox(data({
    prView: {
      statusCheckRollup: [
        { name: 'Template Fitness', conclusion: 'FAILURE' },
      ],
    },
    branchProtection,
  }));

  assert.equal(result.clean, false);
  assert.deepEqual(result.checks.failed, ['Template Fitness']);
});

test('unavailable branch protection metadata keeps fail-closed check fallback', () => {
  const branchProtection = fetchBranchProtection({
    json() {
      throw new Error('gh api repos/o/r/branches/main/protection failed: gh: Resource not accessible by integration (HTTP 403)');
    },
  }, { owner: 'o', name: 'r', branch: 'main' });

  const result = analyzeInbox(data({
    prView: {
      statusCheckRollup: [
        { name: 'Optional maybe required', conclusion: 'FAILURE' },
      ],
    },
    branchProtection,
  }));

  assert.equal(branchProtection, null);
  assert.equal(result.clean, false);
  assert.deepEqual(result.checks.failed, ['Optional maybe required']);
});

test('unavailable ruleset metadata keeps fail-closed check fallback', () => {
  const branchProtection = fetchBranchProtection({
    json(args) {
      const path = args.at(-1);
      if (path.includes('/protection')) {
        return { required_status_checks: { contexts: [] } };
      }
      throw new Error('gh api repos/o/r/rules/branches/main failed: gh: Resource not accessible by integration (HTTP 403)');
    },
  }, { owner: 'o', name: 'r', branch: 'main' });

  const result = analyzeInbox(data({
    prView: {
      statusCheckRollup: [
        { name: 'Optional maybe required', conclusion: 'FAILURE' },
      ],
    },
    branchProtection,
  }));

  assert.equal(branchProtection, null);
  assert.equal(result.clean, false);
  assert.deepEqual(result.checks.failed, ['Optional maybe required']);
});

test('pending checks block locally unless allow-pending-checks is set', () => {
  const blocked = analyzeInbox(data({
    prView: {
      statusCheckRollup: [{ name: 'Template Fitness', status: 'IN_PROGRESS' }],
    },
    branchProtection: {
      required_status_checks: { contexts: ['Template Fitness'] },
    },
  }));

  const allowed = analyzeInbox(data({
    prView: {
      statusCheckRollup: [{ name: 'Template Fitness', status: 'IN_PROGRESS' }],
    },
    branchProtection: {
      required_status_checks: { contexts: ['Template Fitness'] },
    },
  }), { allowPendingChecks: true });

  assert.equal(blocked.clean, false);
  assert.equal(blocked.statusState, 'pending');
  assert.equal(allowed.clean, true);
});

test('branch protection metadata records native review gates', () => {
  const result = analyzeInbox(data({
    branchProtection: {
      required_pull_request_reviews: { required_approving_review_count: 1 },
      required_conversation_resolution: { enabled: true },
    },
  }));

  assert.equal(result.nativeProtection.requiredReviews, true);
  assert.equal(result.nativeProtection.requiredConversationResolution, true);
});

test('markdown includes sticky marker and stable sections', () => {
  const markdown = renderMarkdown(analyzeInbox(data({
    reviewThreads: [thread({ body: 'Fix this thing' })],
  })));

  assert.match(markdown, /<!-- agent-inbox:v1 -->/);
  assert.match(markdown, /# PR Agent Inbox/);
  assert.match(markdown, /Fix this thing/);
});

test('assert-clean is parsed as normalized clean assertion', () => {
  const options = parseArgs(['--pr', '60', '--assert-clean', '--allow-pending-checks']);
  assert.equal(options.pr, 60);
  assert.equal(options.assertClean, true);
  assert.equal(options.allowPendingChecks, true);
});

test('label sync adds and removes based on agentAttention', () => {
  const client = fakeClient();
  syncAttentionLabel(client, { repo: 'owner/repo', pr: 1, agentAttention: true }, defaultAttentionLabel);
  syncAttentionLabel(client, { repo: 'owner/repo', pr: 1, agentAttention: false }, defaultAttentionLabel);

  assert.deepEqual(client.calls.map((call) => call.args.slice(0, 5)), [
    ['api', '-X', 'POST', 'repos/owner/repo/issues/1/labels', '-f'],
    ['api', '-X', 'DELETE', 'repos/owner/repo/issues/1/labels/agent-attention'],
  ]);
});

test('label provisioning is idempotent for already-existing labels', () => {
  const client = fakeClient();
  ensureLabel(client, 'owner/repo', defaultAttentionLabel);

  assert.equal(client.calls[0].options.allowError, true);
  assert.deepEqual(client.calls[0].args.slice(0, 4), ['api', '-X', 'POST', 'repos/owner/repo/labels']);
});

test('status publishing writes durable state to the PR head commit', () => {
  const client = fakeClient();
  publishStatus(client, {
    repo: 'owner/repo',
    pr: 1,
    url: 'https://github.com/owner/repo/pull/1',
    headRefOid: 'abc123',
    statusState: 'failure',
    statusDescription: '1 agent-actionable item(s)',
  });

  const post = client.calls.find((call) => call.args.includes('repos/owner/repo/statuses/abc123'));
  assert.ok(post);
  assert.deepEqual(post.args.slice(0, 4), ['api', '-X', 'POST', 'repos/owner/repo/statuses/abc123']);
  assert.ok(post.args.includes('state=failure'));
  assert.ok(post.args.includes('context=agent-inbox-clean'));
});

test('status publishing skips unchanged head status', () => {
  const client = fakeClient({
    responses: {
      'repos/owner/repo/commits/abc123/statuses': [
        { context: 'agent-inbox-clean', state: 'success', description: 'PR agent inbox is clean' },
      ],
    },
  });

  const outcome = publishStatus(client, {
    repo: 'owner/repo',
    pr: 1,
    url: 'https://github.com/owner/repo/pull/1',
    headRefOid: 'abc123',
    statusState: 'success',
    statusDescription: 'PR agent inbox is clean',
  });

  assert.deepEqual(outcome, { skipped: true });
  assert.equal(client.calls.some((call) => call.args.includes('repos/owner/repo/statuses/abc123')), false);
});

test('sticky comment updates only the owned inbox report', () => {
  const client = fakeClient({
    responses: {
      'repos/owner/repo/issues/1/comments?per_page=100&page=1': [
        { id: 11, body: '<!-- agent-inbox:v1 -->\nordinary comment', user: { login: 'reviewer' } },
        { id: 12, body: '<!-- agent-inbox:v1 -->\n# PR Agent Inbox\nold report', user: { login: 'github-actions[bot]' } },
        { id: 13, body: '<!-- agent-inbox:v1 -->\n# PR Agent Inbox\nnewer report', user: { login: 'github-actions[bot]' } },
      ],
    },
  });

  updateStickyComment(client, {
    repo: 'owner/repo',
    pr: 1,
    clean: true,
    agentAttention: false,
    statusState: 'success',
    items: [],
    nativeProtection: {},
  });

  const patch = client.calls.find((call) => call.args.includes('repos/owner/repo/issues/comments/13'));
  assert.ok(patch);
  assert.equal(client.calls.some((call) => call.args.includes('repos/owner/repo/issues/comments/11')), false);
  assert.equal(client.calls.some((call) => call.args.includes('repos/owner/repo/issues/comments/12')), false);
});

function data(overrides = {}) {
  return {
    repo: 'owner/repo',
    pr: 60,
    prView: {
      number: 60,
      url: 'https://github.com/owner/repo/pull/60',
      title: 'Example PR',
      isDraft: false,
      reviewDecision: null,
      mergeStateStatus: 'CLEAN',
      statusCheckRollup: [],
      latestReviews: [],
      headRefOid: 'abc123',
      headRefName: 'feature',
      baseRefName: 'main',
      ...(overrides.prView ?? {}),
    },
    reviewThreads: overrides.reviewThreads ?? [],
    reviewComments: overrides.reviewComments ?? [],
    issueComments: overrides.issueComments ?? [],
    reviews: overrides.reviews ?? [],
    branchProtection: Object.hasOwn(overrides, 'branchProtection') ? overrides.branchProtection : {
      required_status_checks: { contexts: [] },
    },
  };
}

function thread(overrides = {}) {
  return {
    id: overrides.id ?? 'thread-1',
    isResolved: overrides.isResolved ?? false,
    isOutdated: overrides.isOutdated ?? false,
    comments: {
      nodes: [
        {
          id: 'comment-1',
          url: 'https://example/thread',
          body: overrides.body ?? 'Please fix this.',
          author: { login: 'reviewer' },
        },
      ],
    },
  };
}

function fakeClient({ responses = {} } = {}) {
  return {
    calls: [],
    json(args, callOptions = {}) {
      this.calls.push({ method: 'json', args, options: callOptions });
      const key = args.includes('graphql') ? 'graphql' : args.at(-1);
      if (Object.hasOwn(responses, key)) return responses[key];
      return {};
    },
    text(args, callOptions = {}) {
      this.calls.push({ method: 'text', args, options: callOptions });
      return '';
    },
  };
}
