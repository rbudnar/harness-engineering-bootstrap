#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const requiredHeadings = [
  'Summary',
  'Template Changes',
  'Planner And Metadata',
  'Migration',
  'Validation',
  'Rollback',
];

const unreleasedTemplate = [
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
].join('\n');

export function prepareStableRelease(options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const bump = options.bump || 'patch';
  const date = options.date || new Date().toISOString().slice(0, 10);
  const notesOutput = options.notesOutput || '.release-notes.md';
  const versionPath = resolve(cwd, 'VERSION');
  const changelogPath = resolve(cwd, 'CHANGELOG.md');

  const currentVersion = readFileSync(versionPath, 'utf8').trim();
  assertStableVersion(currentVersion, 'VERSION');
  const nextVersion = bump === 'current' ? currentVersion : bumpVersion(currentVersion, bump);
  const tag = `v${nextVersion}`;
  const changelog = readFileSync(changelogPath, 'utf8');

  if (bump === 'current') {
    const unreleased = findOptionalReleaseSection(changelog, 'Unreleased');
    if (unreleased) assertUnreleasedIsEmpty(unreleased.body);
    const releaseSection = findReleaseSection(changelog, tag);
    assertReleaseSectionShape(releaseSection.body, tag);
    writeFileSync(resolve(cwd, notesOutput), ensureTrailingNewline(releaseSection.body.trim()));
    writeGitHubOutputs({ version: nextVersion, tag, notesPath: notesOutput, changed: false });
    return { version: nextVersion, tag, notesPath: notesOutput, changed: false };
  }

  const unreleased = findReleaseSection(changelog, 'Unreleased');
  assertReleaseSectionShape(unreleased.body, 'Unreleased');
  assertUnreleasedHasContent(unreleased.body);

  const nextHeading = `## ${tag} - ${date}`;
  const nextSection = `${nextHeading}\n\n${ensureTrailingNewline(unreleased.body.trim())}`;
  const updatedChangelog = [
    changelog.slice(0, unreleased.start),
    `${unreleasedTemplate}\n`,
    nextSection,
    changelog.slice(unreleased.end),
  ].join('');

  writeFileSync(versionPath, `${nextVersion}\n`);
  writeFileSync(changelogPath, updatedChangelog);
  writeFileSync(resolve(cwd, notesOutput), ensureTrailingNewline(unreleased.body.trim()));
  writeGitHubOutputs({ version: nextVersion, tag, notesPath: notesOutput, changed: true });
  return { version: nextVersion, tag, notesPath: notesOutput, changed: true };
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = version.split('.').map((value) => Number.parseInt(value, 10));
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  throw new Error(`Unsupported stable release bump: ${bump}. Use current, patch, or minor.`);
}

function assertStableVersion(version, label) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`${label} must be a stable numeric SemVer value such as 0.1.0.`);
  }
}

function findReleaseSection(changelog, releaseName) {
  const heading = releaseName === 'Unreleased'
    ? '## Unreleased'
    : `## ${releaseName} - `;
  const start = changelog.indexOf(heading);
  if (start === -1) throw new Error(`CHANGELOG.md must include "${heading.trim()}".`);

  const headingEnd = changelog.indexOf('\n', start);
  const bodyStart = headingEnd === -1 ? changelog.length : headingEnd + 1;
  const nextMatch = changelog.slice(bodyStart).match(/\r?\n## /);
  const end = nextMatch ? bodyStart + nextMatch.index : changelog.length;
  return {
    start,
    end,
    body: changelog.slice(bodyStart, end),
  };
}

function findOptionalReleaseSection(changelog, releaseName) {
  try {
    return findReleaseSection(changelog, releaseName);
  } catch (error) {
    if (error.message.includes('CHANGELOG.md must include')) return null;
    throw error;
  }
}

function assertReleaseSectionShape(body, releaseName) {
  for (const heading of requiredHeadings) {
    if (!body.includes(`### ${heading}`)) {
      throw new Error(`${releaseName} release notes must include "### ${heading}".`);
    }
  }
}

function assertUnreleasedHasContent(body) {
  if (!hasMeaningfulReleaseContent(body)) {
    throw new Error('CHANGELOG.md Unreleased section must contain release notes before a patch or minor release.');
  }
}

function assertUnreleasedIsEmpty(body) {
  if (hasMeaningfulReleaseContent(body)) {
    throw new Error('CHANGELOG.md Unreleased section must be empty before a current release.');
  }
}

function hasMeaningfulReleaseContent(body) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line && !line.startsWith('###') && !line.startsWith('<!--'));
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function writeGitHubOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = [
    `version=${values.version}`,
    `tag=${values.tag}`,
    `notes_path=${values.notesPath}`,
    `changed=${values.changed ? 'true' : 'false'}`,
  ];
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

function parseArgs(args) {
  const parsed = {
    bump: 'patch',
    date: undefined,
    notesOutput: '.release-notes.md',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--bump') {
      parsed.bump = requiredValue(args, index, arg);
      index += 1;
    } else if (arg === '--date') {
      parsed.date = requiredValue(args, index, arg);
      index += 1;
    } else if (arg === '--notes-output') {
      parsed.notesOutput = requiredValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function requiredValue(args, index, arg) {
  const value = args[index + 1];
  if (!value) throw new Error(`${arg} requires a value.`);
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = prepareStableRelease(args);
  process.stdout.write(`Prepared ${result.tag}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
