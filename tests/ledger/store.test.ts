import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defaultLedgerPath, ledgerKey, readLedger, writeLedger } from '../../src/ledger/store.js';
import type { Ledger, LedgerEntry } from '../../src/ledger/types.js';

function scratchPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chowa-ledger-'));
  return join(dir, 'sessions.json');
}

const sampleEntry: LedgerEntry = {
  sessionId: 'sess-1',
  repoPath: '/home/fran/repo',
  branch: 'feat/x',
  startedAt: '2026-08-04T00:00:00.000Z',
  status: 'open',
  resumeAttempts: 0,
};

describe('ledgerKey', () => {
  it('combines repoPath and branch deterministically', () => {
    expect(ledgerKey('/repo', 'feat/x')).toBe('/repo#feat/x');
  });
});

describe('readLedger', () => {
  it('returns an empty ledger when the file does not exist', () => {
    const path = scratchPath();
    expect(readLedger({ path })).toEqual({ entries: {} });
  });

  it('reads back a previously written ledger', () => {
    const path = scratchPath();
    const ledger: Ledger = { entries: { 'k': sampleEntry } };
    writeLedger(ledger, { path });

    expect(readLedger({ path })).toEqual(ledger);
  });

  it('throws on invalid JSON rather than silently returning an empty ledger', () => {
    const path = scratchPath();
    writeFileSync(path, 'not json', 'utf-8');

    expect(() => readLedger({ path })).toThrow(/not valid JSON/);
  });

  it('throws on JSON that does not match the ledger shape', () => {
    const path = scratchPath();
    writeFileSync(path, JSON.stringify({ entries: { k: { sessionId: 123 } } }), 'utf-8');

    expect(() => readLedger({ path })).toThrow(/does not match the expected shape/);
  });
});

describe('writeLedger', () => {
  it('creates parent directories that do not exist yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chowa-ledger-'));
    const path = join(dir, 'nested', 'deeper', 'sessions.json');
    const ledger: Ledger = { entries: { 'k': sampleEntry } };

    writeLedger(ledger, { path });

    expect(existsSync(path)).toBe(true);
    expect(readLedger({ path })).toEqual(ledger);
  });

  it('never leaves a stray temp file behind after a successful write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chowa-ledger-'));
    const path = join(dir, 'sessions.json');

    writeLedger({ entries: { 'k': sampleEntry } }, { path });

    const files = readdirSync(dir);
    expect(files).toEqual(['sessions.json']);
  });

  it('overwrites the previous content rather than merging', () => {
    const path = scratchPath();
    writeLedger({ entries: { 'a': sampleEntry } }, { path });
    writeLedger({ entries: { 'b': sampleEntry } }, { path });

    expect(readLedger({ path })).toEqual({ entries: { 'b': sampleEntry } });
  });
});

describe('defaultLedgerPath', () => {
  it('lives under the home directory, not the repo', () => {
    const path = defaultLedgerPath();

    expect(path).toContain('.chowa');
    expect(path.endsWith('sessions.json')).toBe(true);
  });
});
