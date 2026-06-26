import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './harness-bootstrap-plan.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(testDir, '..', 'test', 'fixtures', 'bootstrap-planner');
test('package bin produces the same read-only plan as the direct planner script', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-bin-fixture-'));
  const packRoot = mkdtempSync(resolve(tmpdir(), 'heb-bin-pack-'));
  const installRoot = mkdtempSync(resolve(tmpdir(), 'heb-bin-install-'));

  try {
    cpSync(resolve(fixturesRoot, 'basic-js'), tempRoot, { recursive: true });
    const packed = JSON.parse(runNpm(['pack', '--json', '--pack-destination', packRoot], { cwd: repoRoot }));
    const tarballPath = resolve(packRoot, packed[0].filename);

    const args = ['--repo', tempRoot, '--json', '--date', '2026-05-28'];
    const direct = execFileSync(
      process.execPath,
      [resolve(repoRoot, 'scripts', 'harness-bootstrap-plan.mjs'), ...args],
      { encoding: 'utf8' },
    );
    runNpm(['install', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund', tarballPath]);
    const packaged = runInstalledBin(installRoot, args);

    assert.deepEqual(normalizePlannerOutput(JSON.parse(packaged)), normalizePlannerOutput(JSON.parse(direct)));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    rmSync(packRoot, { recursive: true, force: true });
    rmSync(installRoot, { recursive: true, force: true });
  }
});

test('package init subcommand matches direct bootstrap mode without writing target files', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'heb-bin-init-fixture-'));
  const packRoot = mkdtempSync(resolve(tmpdir(), 'heb-bin-init-pack-'));
  const installRoot = mkdtempSync(resolve(tmpdir(), 'heb-bin-init-install-'));

  try {
    cpSync(resolve(fixturesRoot, 'basic-js'), tempRoot, { recursive: true });
    const before = snapshotTree(tempRoot);
    const packed = JSON.parse(runNpm(['pack', '--json', '--pack-destination', packRoot], { cwd: repoRoot }));
    const tarballPath = resolve(packRoot, packed[0].filename);

    const directArgs = ['--repo', tempRoot, '--json', '--mode', 'bootstrap', '--date', '2026-05-28'];
    const initArgs = ['init', '--repo', tempRoot, '--json', '--date', '2026-05-28'];
    const direct = execFileSync(
      process.execPath,
      [resolve(repoRoot, 'scripts', 'harness-bootstrap-plan.mjs'), ...directArgs],
      { encoding: 'utf8' },
    );
    runNpm(['install', '--prefix', installRoot, '--ignore-scripts', '--no-audit', '--no-fund', tarballPath]);
    const packaged = runInstalledBin(installRoot, initArgs);
    const help = runInstalledBin(installRoot, ['--help']);

    assert.equal(JSON.parse(packaged).operation, 'bootstrap');
    assert.deepEqual(normalizePlannerOutput(JSON.parse(packaged)), normalizePlannerOutput(JSON.parse(direct)));
    assert.match(help, /^Usage: harness-bootstrap \[init\]/);
    assert.match(help, /Direct checkout: node scripts\/harness-bootstrap-plan\.mjs \[init\]/);
    assert.deepEqual(snapshotTree(tempRoot), before);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    rmSync(packRoot, { recursive: true, force: true });
    rmSync(installRoot, { recursive: true, force: true });
  }
});

test('README documents the current GitHub package-bin command state', () => {
  const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');

  assert.match(readme, /`v0\.1\.0` tag predates `package\.json`/);
  assert.match(readme, /github:rbudnar\/harness-engineering-bootstrap#main/);
  assert.match(
    readme,
    /npm exec --yes --package "github:rbudnar\/harness-engineering-bootstrap#main" -- harness-bootstrap init -- --repo/,
  );
  assert.match(readme, /replace `#main` with that tag/);
  assert.doesNotMatch(
    readme,
    /--package=github:rbudnar\/harness-engineering-bootstrap#vX\.Y\.Z -c "harness-bootstrap init --repo/,
  );
  assert.doesNotMatch(readme, /github:rbudnar\/harness-engineering-bootstrap#v0\.1\.0/);
});

test('package includes the warning-mode harness doctor script', () => {
  const packRoot = mkdtempSync(resolve(tmpdir(), 'heb-bin-doctor-pack-'));

  try {
    const packed = JSON.parse(runNpm(['pack', '--dry-run', '--json', '--pack-destination', packRoot], { cwd: repoRoot }));
    const paths = packed[0].files.map((file) => file.path);

    assert(paths.includes('scripts/harness-doctor.mjs'));
  } finally {
    rmSync(packRoot, { recursive: true, force: true });
  }
});

test('normalizes quoted and unquoted planner validation commands', () => {
  const output = normalizePlannerOutput({
    quoted: 'node "C:\\work dir\\heb\\scripts\\harness-bootstrap-plan.mjs" --repo target',
    singleQuoted: "node '/home/runner/work/heb/scripts/harness-bootstrap-plan.mjs' --repo target",
    unquoted: 'node /home/runner/work/heb/scripts/harness-bootstrap-plan.mjs --repo target',
  });

  assert.deepEqual(output, {
    quoted: 'node "<package>/scripts/harness-bootstrap-plan.mjs" --repo target',
    singleQuoted: 'node "<package>/scripts/harness-bootstrap-plan.mjs" --repo target',
    unquoted: 'node "<package>/scripts/harness-bootstrap-plan.mjs" --repo target',
  });
});

test('quotes shell args for npm exec command strings', () => {
  const pathWithSpace = process.platform === 'win32' ? 'C:\\Users\\First Last\\repo' : "/tmp/first last/repo";
  const quoted = shellArg(pathWithSpace);
  assert.match(quoted, /^["']/);
  assert.match(quoted, /["']$/);
  assert.match(quoted, /first.last/i);
});

function runNpm(args, options = {}) {
  if (process.platform !== 'win32') {
    return execFileSync('npm', args, { encoding: 'utf8', ...options });
  }

  return execFileSync(process.execPath, [npmCliPath(), ...args], { encoding: 'utf8', ...options });
}

function shellArg(value) {
  if (process.platform === 'win32') {
    return `"${slashPath(value).replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function slashPath(path) {
  return path.replace(/\\/g, '/');
}

function runInstalledBin(installRoot, args) {
  const command = resolve(
    installRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'harness-bootstrap.cmd' : 'harness-bootstrap',
  );
  if (!existsSync(command)) throw new Error(`Package bin was not installed at ${command}`);

  if (process.platform === 'win32') {
    return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'call', command, ...args], {
      encoding: 'utf8',
    });
  }
  return execFileSync(command, args, { encoding: 'utf8' });
}

function snapshotTree(root, prefix = '') {
  return readdirSync(resolve(root, prefix))
    .sort((left, right) => left.localeCompare(right))
    .flatMap((entry) => {
      const relativePath = prefix ? `${prefix}/${entry}` : entry;
      const absolutePath = resolve(root, relativePath);
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) return [`${relativePath}/`, ...snapshotTree(root, relativePath)];
      return [`${relativePath}:${stats.size}:${fileHash(absolutePath)}`];
    });
}

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function npmCliPath() {
  const candidates = [
    resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    resolve(dirname(dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Could not find npm CLI. Checked: ${candidates.join(', ')}`);
  return found;
}

function normalizePlannerOutput(value) {
  if (Array.isArray(value)) return value.map((item) => normalizePlannerOutput(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizePlannerOutput(item)]),
    );
  }
  if (typeof value !== 'string') return value;

  return value.replace(
    /node (?:"[^"]*scripts[\\/]+harness-bootstrap-plan\.mjs"|'[^']*scripts[\\/]+harness-bootstrap-plan\.mjs'|[^\s"']*scripts[\\/]+harness-bootstrap-plan\.mjs)/g,
    'node "<package>/scripts/harness-bootstrap-plan.mjs"',
  );
}
