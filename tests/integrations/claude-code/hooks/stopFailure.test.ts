import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simpleGit } from 'simple-git';

import { main } from '../../../../src/integrations/claude-code/hooks/stopFailure.js';
import { readLedger, writeLedger } from '../../../../src/ledger/index.js';
import type { Ledger, LedgerEntry } from '../../../../src/ledger/types.js';
import type { UsageSnapshot } from '../../../../src/integrations/claude-code/quotaProbe.js';

const HOOK_ENTRY = resolve(import.meta.dirname, '../../../../src/integrations/claude-code/hooks/stopFailure.ts');

async function makeRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'chowa-stop-failure-'));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.name', 'Test');
  await git.addConfig('user.email', 'test@example.com');
  await git.checkoutLocalBranch('feat/x');
  await git.raw(['commit', '--allow-empty', '-m', 'init']);
  return dir;
}

function scratchLedgerPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chowa-stop-failure-ledger-'));
  return join(dir, 'sessions.json');
}

function openEntryFixture(repoPath: string, branch: string): LedgerEntry {
  return {
    sessionId: 'sess-abc',
    repoPath,
    branch,
    startedAt: '2026-08-04T00:00:00.000Z',
    status: 'open',
    resumeAttempts: 0,
  };
}

const usageSnapshot = (fiveHourUtilization: number, sevenDayUtilization: number): UsageSnapshot => ({
  subscriptionType: 'max',
  windows: new Map([
    ['five_hour', { utilization: fiveHourUtilization, resetsAt: new Date('2026-08-04T05:00:00.000Z') }],
    ['seven_day', { utilization: sevenDayUtilization, resetsAt: new Date('2026-08-10T00:00:00.000Z') }],
  ]),
});

describe('stopFailure hook — main()', () => {
  it('is a no-op for any error other than rate_limit', async () => {
    const repo = await makeRepo();
    const ledgerPath = scratchLedgerPath();
    const key = `${repo}#feat/x`;
    const ledger: Ledger = { entries: { [key]: openEntryFixture(repo, 'feat/x') } };
    writeLedger(ledger, { path: ledgerPath });

    await main(
      { session_id: 'sess-abc', cwd: repo, error: 'overloaded' },
      { ledgerOptions: { path: ledgerPath } },
    );

    expect(readLedger({ path: ledgerPath })).toEqual(ledger);
  });

  it('stamps the ledger entry with the tightest (highest-utilization) window on rate_limit', async () => {
    const repo = await makeRepo();
    const ledgerPath = scratchLedgerPath();
    const key = `${repo}#feat/x`;
    writeLedger({ entries: { [key]: openEntryFixture(repo, 'feat/x') } }, { path: ledgerPath });

    const probeUsage = async (): Promise<UsageSnapshot> => usageSnapshot(0.92, 0.4);

    await main(
      { session_id: 'sess-abc', cwd: repo, error: 'rate_limit' },
      { ledgerOptions: { path: ledgerPath }, probeUsage },
    );

    const entry = readLedger({ path: ledgerPath }).entries[key];
    expect(entry?.status).toBe('quota_blocked');
    expect(entry?.blockedWindow).toBe('five_hour');
    expect(entry?.resetsAt).toBe('2026-08-04T05:00:00.000Z');
  });

  it('records last_assistant_message as the task description', async () => {
    const repo = await makeRepo();
    const ledgerPath = scratchLedgerPath();
    const key = `${repo}#feat/x`;
    writeLedger({ entries: { [key]: openEntryFixture(repo, 'feat/x') } }, { path: ledgerPath });

    const probeUsage = async (): Promise<UsageSnapshot> => usageSnapshot(0.92, 0.4);

    await main(
      {
        session_id: 'sess-abc',
        cwd: repo,
        error: 'rate_limit',
        last_assistant_message: 'Was mid-refactor of the router module.',
      },
      { ledgerOptions: { path: ledgerPath }, probeUsage },
    );

    const entry = readLedger({ path: ledgerPath }).entries[key];
    expect(entry?.taskDescription).toBe('Was mid-refactor of the router module.');
  });

  it('picks seven_day when it is the tighter window', async () => {
    const repo = await makeRepo();
    const ledgerPath = scratchLedgerPath();
    const key = `${repo}#feat/x`;
    writeLedger({ entries: { [key]: openEntryFixture(repo, 'feat/x') } }, { path: ledgerPath });

    const probeUsage = async (): Promise<UsageSnapshot> => usageSnapshot(0.1, 0.85);

    await main(
      { session_id: 'sess-abc', cwd: repo, error: 'rate_limit' },
      { ledgerOptions: { path: ledgerPath }, probeUsage },
    );

    const entry = readLedger({ path: ledgerPath }).entries[key];
    expect(entry?.blockedWindow).toBe('seven_day');
  });

  it('is a no-op when there is no ledger entry for this key', async () => {
    const repo = await makeRepo();
    const ledgerPath = scratchLedgerPath();
    writeLedger({ entries: {} }, { path: ledgerPath });

    const probeUsage = async (): Promise<UsageSnapshot> => usageSnapshot(0.92, 0.4);

    await main(
      { session_id: 'sess-abc', cwd: repo, error: 'rate_limit' },
      { ledgerOptions: { path: ledgerPath }, probeUsage },
    );

    expect(readLedger({ path: ledgerPath })).toEqual({ entries: {} });
  });
});

describe('stopFailure hook — stdin protocol', () => {
  it('reads the payload from stdin and is a no-op for a non-rate_limit error', async () => {
    const repo = await makeRepo();
    const fakeHome = mkdtempSync(join(tmpdir(), 'chowa-stop-failure-home-'));

    const out = execFileSync('bun', ['run', HOOK_ENTRY], {
      input: JSON.stringify({ session_id: 'sess-abc', cwd: repo, error: 'authentication_failed' }),
      encoding: 'utf-8',
      env: { ...process.env, HOME: fakeHome },
    });

    expect(out).toBe('');
  });
});
