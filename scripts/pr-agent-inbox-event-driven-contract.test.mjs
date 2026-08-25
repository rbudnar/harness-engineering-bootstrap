import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function assertExists(path) {
  assert.equal(existsSync(resolve(repoRoot, path)), true, `${path} must exist`);
}

function assertIncludes(text, needle, label = needle) {
  assert.ok(text.includes(needle), `expected ${label}`);
}

function assertNotIncludes(text, needle, label = needle) {
  assert.equal(text.includes(needle), false, `did not expect ${label}`);
}

function parseTopLevelScalar(workflowText, key) {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(workflowText);
  assert.ok(match, `expected top-level ${key}`);
  const raw = match[1].trim();
  return raw.startsWith('"') ? JSON.parse(raw) : raw.replace(/\s+#.*$/, '').trim();
}

function runSource(workflowText) {
  return workflowText
    .split(/\r?\n/)
    .filter((line) => /^\s+run:/.test(line) || /^\s{10,}\S/.test(line))
    .join('\n');
}

test('publisher workflow is event-driven and review events enter only through the signal workflow', () => {
  const publisher = read('.github/workflows/pr-agent-inbox.yml');
  assertExists('.github/workflows/pr-agent-inbox-signal.yml');

  assertNotIncludes(publisher, 'pull_request_review:', 'direct publisher pull_request_review trigger');
  assertNotIncludes(publisher, 'pull_request_review_comment:', 'direct publisher pull_request_review_comment trigger');
  assertNotIncludes(publisher, 'schedule:', 'Inbox polling schedule');
  assertNotIncludes(publisher, 'status:', 'status trigger');
  assertNotIncludes(publisher, 'check_run:', 'check_run trigger');
  assertNotIncludes(publisher, 'check_suite:', 'check_suite trigger');
  assertIncludes(publisher, 'workflow_run:', 'workflow_run admission');
  assertIncludes(publisher, 'workflows: [PR Agent Inbox Signal, Template Fitness]', 'exact admitted producer names');
  assertIncludes(publisher, 'types: [completed]', 'completed-only workflow_run admission');
});

test('signal workflow is a hosted zero-capability no-op carrying only anchored PR identity', () => {
  assertExists('.github/workflows/pr-agent-inbox-signal.yml');
  const signal = read('.github/workflows/pr-agent-inbox-signal.yml');

  assertIncludes(signal, 'name: PR Agent Inbox Signal');
  assert.equal(
    parseTopLevelScalar(signal, 'run-name'),
    'PR Agent Inbox Signal #${{ github.event.pull_request.number }}',
  );
  assert.equal(
    parseTopLevelScalar(signal, 'run-name').replace('${{ github.event.pull_request.number }}', '72'),
    'PR Agent Inbox Signal #72',
  );
  assertIncludes(signal, 'pull_request_review:');
  assertIncludes(signal, 'pull_request_review_comment:');
  assertIncludes(signal, 'permissions: {}');
  assertIncludes(signal, 'runs-on: ubuntu-latest');
  assertIncludes(signal, 'timeout-minutes: 1');
  assertIncludes(signal, 'run: true');
  assertNotIncludes(signal, 'actions/checkout', 'checkout in signal');
  assertNotIncludes(signal, 'actions/cache', 'cache in signal');
  assertNotIncludes(signal, 'actions/upload-artifact', 'artifact upload in signal');
  assertNotIncludes(signal, 'actions/download-artifact', 'artifact download in signal');
  assertNotIncludes(runSource(signal), '${{ github.event.', 'event interpolation in signal shell source');
  assertNotIncludes(signal, 'self-hosted', 'self-hosted runner in signal');
});

test('publisher workflow checks base authority before checkout and writes pending before mutable outputs', () => {
  const publisher = read('.github/workflows/pr-agent-inbox.yml');
  const script = read('scripts/pr-agent-inbox.mjs');
  const publisherJob = publisher.slice(publisher.indexOf('  agent-inbox:'));
  const revalidate = publisherJob.indexOf('- name: Revalidate post-queue base authority');
  const branchNameEquality = publisherJob.indexOf('test "$current_name" = "$DEFAULT_BRANCH_NAME"');
  const branchOidEquality = publisherJob.indexOf('test "$current_oid" = "$DEFAULT_BRANCH_OID"');
  const checkout = publisherJob.indexOf('- uses: actions/checkout@v4');
  const targetValidation = publisherJob.indexOf('--validate-target "$TARGET_PR"');

  assertIncludes(publisher, 'runs-on: ubuntu-latest', 'GitHub-hosted publisher');
  assertNotIncludes(publisher, 'self-hosted', 'self-hosted publisher runner');
  assertNotIncludes(publisher, 'rbudnar-linux', 'named persistent runner');
  assertIncludes(publisher, 'persist-credentials: false', 'checkout credentials disabled');
  assertIncludes(publisher, 'DEFAULT_BRANCH_NAME', 'route-time default branch name');
  assertIncludes(publisher, 'DEFAULT_BRANCH_OID', 'route-time default branch OID');
  assert.ok(revalidate >= 0, 'post-queue authority step must exist');
  assert.ok(branchNameEquality > revalidate, 'default branch name equality must be in the authority step');
  assert.ok(branchOidEquality > branchNameEquality, 'default branch OID equality must follow the name equality');
  assert.ok(checkout > branchOidEquality, 'both default branch equalities must pass before publisher checkout');
  assert.ok(targetValidation > checkout, 'the queued target must be revalidated after the base-owned checkout');
  assertNotIncludes(publisherJob, '--resolve-targets', 'all-target resolution in each matrix publisher job');
  assertIncludes(script, 'route-time default branch name/OID', 'post-queue default branch equality contract');
  assertIncludes(script, 'pending before comment label final status', 'pending-before-write ordering contract');
  assertIncludes(script, 'bounded stable reread', 'bounded stable reread contract');
});

test('canonical workflow_run producers require live ID path state equality and current PR admission', () => {
  const publisher = read('.github/workflows/pr-agent-inbox.yml');
  const script = read('scripts/pr-agent-inbox.mjs');

  assertIncludes(script, '.github/workflows/pr-agent-inbox-signal.yml', 'canonical signal path');
  assertIncludes(script, '.github/workflows/template-fitness.yml', 'canonical Template Fitness path');
  assertIncludes(script, '280258753', 'sealed Template Fitness workflow ID');
  assertIncludes(script, 'active', 'active workflow state check');
  assertIncludes(script, 'workflow_id', 'payload workflow ID equality');
  assertIncludes(script, 'workflow_run.path', 'payload workflow path equality');
  assertIncludes(script, 'PR Agent Inbox Signal #', 'anchored signal run-title parser');
  assertIncludes(script, 'current PR API state', 'current API admission after workflow_run');
  assertIncludes(publisher, 'PR Agent Inbox Signal', 'signal producer admitted by exact workflow_run');
  assertIncludes(publisher, 'Template Fitness', 'Template Fitness producer admitted by exact workflow_run');
});

test('manual and SHA-fallback recovery retain drafts, deduplicate, and fail closed above the bound', () => {
  const publisher = read('.github/workflows/pr-agent-inbox.yml');
  const script = read('scripts/pr-agent-inbox.mjs');

  assertIncludes(publisher, 'workflow_dispatch:', 'manual recovery entrypoint');
  assertIncludes(script, 'include drafts', 'draft PR retention contract');
  assertIncludes(script, 'converted_to_draft', 'draft transition admission');
  assertIncludes(script, '--limit 101', 'bounded open-PR probe');
  assertIncludes(script, 'more than 100', 'fail-closed fanout bound');
  assertIncludes(script, 'commit-to-open-PR fallback', 'SHA fallback contract');
  assertIncludes(script, 'deduplicate', 'deduplicated target admission');
});

test('coalesced same-PR runs rely on surviving current-state reread, not every wakeup executing', () => {
  const publisher = read('.github/workflows/pr-agent-inbox.yml');
  const docs = read('docs/repo-contracts/github-pr-agent-inbox.md');

  assertIncludes(publisher, 'concurrency:');
  assertIncludes(publisher, 'pr-agent-inbox-pr-${{', 'per-PR concurrency group');
  assertIncludes(publisher, 'cancel-in-progress: false');
  assertIncludes(docs, 'A running');
  assertIncludes(docs, 'B pending');
  assertIncludes(docs, 'C arriving');
  assertIncludes(docs, 'current-state reread');
});

test('publisher jobs retain exact identities, guards, and self-check ignore tuples', () => {
  const publisher = read('.github/workflows/pr-agent-inbox.yml');

  assertIncludes(publisher, "if: github.event_name != 'issue_comment' || github.event.issue.pull_request");
  assertIncludes(publisher, '  agent-inbox:\n    name: agent-inbox', 'static matrix job name');
  assertIncludes(publisher, '--ignore-check "PR Agent Inbox / resolve-targets"');
  assertIncludes(publisher, '--ignore-check "PR Agent Inbox / agent-inbox"');
  assertIncludes(publisher, '--ignore-check "PR Agent Inbox Signal / signal"');
});

test('harness contract owns Inbox wiring while allowing only the weekly-report schedule', () => {
  const templateFitnessWorkflow = read('.github/workflows/template-fitness.yml');
  const templateFitness = read('scripts/template-fitness.mjs');
  const weeklyReport = read('.github/workflows/weekly-harness-report.yml');

  assertIncludes(templateFitnessWorkflow, 'node --test scripts/pr-agent-inbox-event-driven-contract.test.mjs');
  assertIncludes(templateFitness, '.github/workflows/pr-agent-inbox.yml');
  assertIncludes(templateFitness, '.github/workflows/pr-agent-inbox-signal.yml');
  assertIncludes(templateFitness, 'docs/repo-contracts/github-pr-agent-inbox.md');
  assertIncludes(templateFitness, 'direct pull_request_review publisher trigger');
  assertIncludes(templateFitness, 'direct pull_request_review_comment publisher trigger');
  assertIncludes(templateFitness, 'Inbox schedule');
  assertIncludes(templateFitness, 'self-hosted');
  assertIncludes(weeklyReport, 'schedule:', 'Weekly Harness Report remains allowed to schedule');
});
