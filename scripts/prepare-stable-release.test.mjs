import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { prepareStableRelease } from './prepare-stable-release.mjs';

test('promotes Unreleased notes and bumps a patch release', () => {
  const root = makeReleaseRepo({
    version: '0.1.0',
    changelog: [
      '# Changelog',
      '',
      '## Unreleased',
      '',
      '### Summary',
      '',
      '- Automated stable release workflow.',
      '',
      '### Template Changes',
      '',
      '- Document release labels.',
      '',
      '### Planner And Metadata',
      '',
      '- Keep metadata fields visible.',
      '',
      '### Migration',
      '',
      '- No consumer migration.',
      '',
      '### Validation',
      '',
      '- `node --test scripts/prepare-stable-release.test.mjs`',
      '',
      '### Rollback',
      '',
      '- Revert the release commit.',
      '',
      '## v0.1.0 - 2026-05-30',
      '',
      '### Summary',
      '',
      '### Template Changes',
      '',
      '### Planner And Metadata',
      '',
      '### Migration',
      '',
      '### Validation',
      '',
      '### Rollback',
      '',
    ].join('\n'),
  });

  try {
    const result = prepareStableRelease({
      cwd: root,
      bump: 'patch',
      date: '2026-06-01',
      notesOutput: 'notes.md',
    });

    assert.deepEqual(result, {
      version: '0.1.1',
      tag: 'v0.1.1',
      notesPath: 'notes.md',
      changed: true,
    });
    assert.equal(readFileSync(resolve(root, 'VERSION'), 'utf8'), '0.1.1\n');
    const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /^## Unreleased/m);
    assert.match(changelog, /^## v0\.1\.1 - 2026-06-01/m);
    assert.match(changelog, /Automated stable release workflow/);
    assert.equal(readFileSync(resolve(root, 'notes.md'), 'utf8').includes('### Rollback'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uses the current version release notes without changing files', () => {
  const root = makeReleaseRepo({
    version: '0.1.0',
    changelog: [
      '# Changelog',
      '',
      '## v0.1.0 - 2026-05-30',
      '',
      '### Summary',
      '',
      '- First release.',
      '',
      '### Template Changes',
      '',
      '### Planner And Metadata',
      '',
      '### Migration',
      '',
      '### Validation',
      '',
      '### Rollback',
      '',
    ].join('\n'),
  });

  try {
    const result = prepareStableRelease({
      cwd: root,
      bump: 'current',
      date: '2026-06-01',
      notesOutput: 'notes.md',
    });

    assert.equal(result.version, '0.1.0');
    assert.equal(result.tag, 'v0.1.0');
    assert.equal(result.changed, false);
    assert.equal(readFileSync(resolve(root, 'VERSION'), 'utf8'), '0.1.0\n');
    assert.match(readFileSync(resolve(root, 'notes.md'), 'utf8'), /First release/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects empty Unreleased notes for bump releases', () => {
  const root = makeReleaseRepo({
    version: '0.1.0',
    changelog: [
      '# Changelog',
      '',
      '## Unreleased',
      '',
      '### Summary',
      '',
      '### Template Changes',
      '',
      '### Planner And Metadata',
      '',
      '### Migration',
      '',
      '### Validation',
      '',
      '### Rollback',
      '',
    ].join('\n'),
  });

  try {
    assert.throws(
      () => prepareStableRelease({ cwd: root, bump: 'minor', date: '2026-06-01' }),
      /Unreleased section must contain release notes/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeReleaseRepo({ version, changelog }) {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-stable-release-'));
  mkdirSync(root, { recursive: true });
  writeFileSync(resolve(root, 'VERSION'), `${version}\n`);
  writeFileSync(resolve(root, 'CHANGELOG.md'), `${changelog}\n`);
  return root;
}
