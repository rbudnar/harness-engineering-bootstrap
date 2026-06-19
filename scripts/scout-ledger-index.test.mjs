import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const script = resolve(testDir, 'scout-ledger-index.mjs');

test('skips non-object JSON rows while indexing valid ledger entries', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'heb-scout-ledger-'));
  const ledger = resolve(root, 'ledger.jsonl');
  const out = resolve(root, 'ledger.index.json');

  writeFileSync(ledger, [
    'null',
    JSON.stringify({
      run_date: '2026-06-19',
      recommendation_key: '2026-06-18|dedupe|null-safe-ledger-index',
      canonical_url: 'https://arxiv.org/abs/2606.20529',
      outcome: 'accepted',
      classification: 'Add mechanical enforcement',
    }),
    '',
  ].join('\n'));

  try {
    execFileSync(process.execPath, [script, '--ledger', ledger, '--out', out], { encoding: 'utf8' });
    const index = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(index.counts.entries, 1);
    assert.equal(index.counts.skipped_non_object_rows, 1);
    assert.equal(index.by_key['2026-06-18|dedupe|null-safe-ledger-index'].canonical_url, 'https://arxiv.org/abs/2606.20529');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
