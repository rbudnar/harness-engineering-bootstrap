#!/usr/bin/env node
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function usage() {
  return `
Usage:
  node scripts/scout-ledger-index.mjs [--ledger <path>] [--out <path>] [--force]
                                     [--allow-parse-errors] [--print]

Purpose:
  Build a compact dedupe index from the scout JSONL ledger so automations can
  skip previously-reviewed resources without re-scanning the whole ledger.

Defaults:
  --ledger: tries common Codex automation-state locations (Windows + POSIX)
  --out:    <ledger basename>.index.json next to the ledger
`;
}

function parseArgs(argv) {
  const args = {
    ledger: null,
    out: null,
    force: false,
    allowParseErrors: false,
    print: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }

    if (arg === '--ledger') {
      if (!next) fail('--ledger requires a path.');
      else args.ledger = next;
      index += 1;
      continue;
    }

    if (arg === '--out') {
      if (!next) fail('--out requires a path.');
      else args.out = next;
      index += 1;
      continue;
    }

    if (arg === '--force') {
      args.force = true;
      continue;
    }

    if (arg === '--allow-parse-errors') {
      args.allowParseErrors = true;
      continue;
    }

    if (arg === '--print') {
      args.print = true;
      continue;
    }

    fail(`Unknown arg: ${arg}`);
  }

  return args;
}

function guessLedgerPaths() {
  const codexHome = process.env.CODEX_HOME || null;
  const home =
    process.env.USERPROFILE ||
    process.env.HOME ||
    process.env.HOMEPATH ||
    null;

  const candidates = [];

  if (process.env.HEBS_SCOUT_LEDGER) candidates.push(process.env.HEBS_SCOUT_LEDGER);

  if (codexHome) {
    candidates.push(join(codexHome, 'automation-state', 'harness-engineering-selective-adoption-scout.jsonl'));
    candidates.push(
      join(codexHome, 'automation-state', 'harness-engineering-selective-adoption-scout', 'ledger.jsonl'),
    );
  }

  if (home) {
    candidates.push(join(home, '.codex', 'automation-state', 'harness-engineering-selective-adoption-scout.jsonl'));
    candidates.push(
      join(home, '.codex', 'automation-state', 'harness-engineering-selective-adoption-scout', 'ledger.jsonl'),
    );
  }

  return candidates;
}

function defaultOutPath(ledgerPath) {
  const abs = resolve(ledgerPath);
  const dir = dirname(abs);
  const name = basename(abs);
  const ext = extname(name).toLowerCase();
  if (ext === '.jsonl') return join(dir, name.replace(/\.jsonl$/i, '.index.json'));
  return join(dir, `${name}.index.json`);
}

function stringOrNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  return String(value);
}

function safeCount(map) {
  return map ? Object.keys(map).length : 0;
}

async function buildIndex({ ledgerPath, allowParseErrors }) {
  const absLedgerPath = resolve(ledgerPath);
  const stat = statSync(absLedgerPath);

  const byKey = Object.create(null);
  const byUrl = Object.create(null);
  const outcomes = Object.create(null);
  const classifications = Object.create(null);

  let lineNumber = 0;
  let entryCount = 0;
  let parseErrors = 0;

  const stream = createReadStream(absLedgerPath, { encoding: 'utf8' });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const rawLine of reader) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (!line) continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      parseErrors += 1;
      if (!allowParseErrors) {
        throw new Error(`Ledger parse error at line ${lineNumber}: ${error.message}`);
      }
      continue;
    }

    entryCount += 1;
    const recommendationKey = stringOrNull(record.recommendation_key);
    const canonicalUrl = stringOrNull(record.canonical_url);
    const outcome = stringOrNull(record.outcome);
    const classification = stringOrNull(record.classification);

    if (outcome) outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    if (classification) classifications[classification] = (classifications[classification] ?? 0) + 1;

    if (recommendationKey) {
      byKey[recommendationKey] = {
        canonical_url: canonicalUrl,
        publication_or_update_date: stringOrNull(record.publication_or_update_date),
        target_section: stringOrNull(record.target_section),
        target_section_hash: stringOrNull(record.target_section_hash),
        classification,
        outcome,
        pr_url: stringOrNull(record.pr_url),
        issue_url: stringOrNull(record.issue_url),
        proposal_path: stringOrNull(record.proposal_path),
        run_date: stringOrNull(record.run_date),
        line: lineNumber,
      };
    }

    if (canonicalUrl) {
      const current = byUrl[canonicalUrl];
      if (!current) {
        byUrl[canonicalUrl] = {
          last_run_date: stringOrNull(record.run_date),
          last_publication_or_update_date: stringOrNull(record.publication_or_update_date),
          last_recommendation_key: recommendationKey,
          count: 1,
          last_line: lineNumber,
        };
      } else {
        current.last_run_date = stringOrNull(record.run_date) ?? current.last_run_date;
        current.last_publication_or_update_date =
          stringOrNull(record.publication_or_update_date) ?? current.last_publication_or_update_date;
        current.last_recommendation_key = recommendationKey ?? current.last_recommendation_key;
        current.count += 1;
        current.last_line = lineNumber;
      }
    }
  }

  return {
    schema_version: 1,
    built_at: new Date().toISOString(),
    ledger_path: absLedgerPath,
    ledger_size_bytes: stat.size,
    ledger_mtime_ms: stat.mtimeMs,
    counts: {
      entries: entryCount,
      parse_errors: parseErrors,
      recommendation_keys: safeCount(byKey),
      canonical_urls: safeCount(byUrl),
    },
    stats: {
      outcomes,
      classifications,
    },
    by_key: byKey,
    by_canonical_url: byUrl,
  };
}

function shouldWriteIndex(outPath, index, { force }) {
  if (force) return true;
  if (!existsSync(outPath)) return true;

  try {
    const existing = statSync(outPath);
    return existing.mtimeMs < index.ledger_mtime_ms;
  } catch {
    return true;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const ledger =
    args.ledger ??
    guessLedgerPaths().find((candidate) => {
      try {
        return existsSync(candidate) && statSync(candidate).isFile();
      } catch {
        return false;
      }
    });

  if (!ledger) {
    fail('No ledger path found. Pass --ledger <path> or set HEBS_SCOUT_LEDGER.');
    console.error(usage());
    return;
  }

  const out = resolve(args.out ?? defaultOutPath(ledger));

  let index;
  try {
    index = await buildIndex({ ledgerPath: ledger, allowParseErrors: args.allowParseErrors });
  } catch (error) {
    fail(String(error?.message ?? error));
    return;
  }

  if (!shouldWriteIndex(out, index, { force: args.force })) {
    if (args.print) console.log(JSON.stringify(index, null, 2));
    console.log(`Index up to date: ${out}`);
    return;
  }

  writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  if (args.print) console.log(JSON.stringify(index, null, 2));
  console.log(`Wrote index: ${out}`);

  if (index.counts.parse_errors && !args.allowParseErrors) {
    fail(`Ledger parse errors encountered: ${index.counts.parse_errors}`);
  }
}

await main();
