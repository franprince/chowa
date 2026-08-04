import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simpleGit } from 'simple-git';

import { main } from '../../../../src/integrations/claude-code/hooks/sessionStart.js';
import { readLedger } from '../../../../src/ledger/index.js';

const HOOK_ENTRY = resolve(import.meta.dirname, '../../../../src/integrations/claude-code/hooks/sessionStart.ts');

async function makeRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'chowa-session-start-'));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.name', 'Test');
  await git.addConfig('user.email', 'test@example.com');
  await git.checkoutLocalBranch('feat/x');
  await git.raw(['commit', '--allow-empty', '-m', 'init']);
  return dir;
}

function scratchLedgerPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chowa-session-start-ledger-'));
  return join(dir, 'sessions.json');
}

describe('sessionStart hook — main()', () => {
  it('opens a ledger entry keyed by repo path and current branch', async () => {
    const repo = await makeRepo();
    const ledgerPath = scratchLedgerPath();

    await main(
      { session_id: 'sess-abc', cwd: repo },
      { ledgerOptions: { path: ledgerPath } },
    );

    const ledger = readLedger({ path: ledgerPath });
    const entry = ledger.entries[`${repo}#feat/x`];
    expect(entry).toBeDefined();
    expect(entry?.sessionId).toBe('sess-abc');
    expect(entry?.status).toBe('open');
    expect(entry?.resumeAttempts).toBe(0);
  });

  it('overwrites a prior entry on the same branch (last write wins)', async () => {
    const repo = await makeRepo();
    const ledgerPath = scratchLedgerPath();

    await main({ session_id: 'sess-1', cwd: repo }, { ledgerOptions: { path: ledgerPath } });
    await main({ session_id: 'sess-2', cwd: repo }, { ledgerOptions: { path: ledgerPath } });

    const ledger = readLedger({ path: ledgerPath });
    expect(ledger.entries[`${repo}#feat/x`]?.sessionId).toBe('sess-2');
  });
});

describe('sessionStart hook — stdin protocol', () => {
  it('reads the payload from stdin and writes to the real ledger path under HOME', async () => {
    const repo = await makeRepo();
    const fakeHome = mkdtempSync(join(tmpdir(), 'chowa-session-start-home-'));

    execFileSync('bun', ['run', HOOK_ENTRY], {
      input: JSON.stringify({ session_id: 'sess-stdin', cwd: repo }),
      encoding: 'utf-8',
      env: { ...process.env, HOME: fakeHome },
    });

    const ledger = readLedger({ path: join(fakeHome, '.chowa', 'sessions.json') });
    expect(ledger.entries[`${repo}#feat/x`]?.sessionId).toBe('sess-stdin');
  });

  it('exits cleanly and logs to stderr when the ledger write fails, never blocking session start', async () => {
    const repo = await makeRepo();
    const fakeHome = mkdtempSync(join(tmpdir(), 'chowa-session-start-forcedfail-'));
    // A plain file where the ledger's directory should be forces
    // writeLedger's mkdirSync(..., { recursive: true }) to throw.
    writeFileSync(join(fakeHome, '.chowa'), 'not a directory', 'utf-8');

    const result = spawnSync('bun', ['run', HOOK_ENTRY], {
      input: JSON.stringify({ session_id: 'sess-fail', cwd: repo }),
      encoding: 'utf-8',
      env: { ...process.env, HOME: fakeHome },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('chowa sessionStart hook failed');
  });
});
