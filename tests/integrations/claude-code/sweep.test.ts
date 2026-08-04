import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildDispatch, sweep, tmuxSessionName, FALLBACK_RESUME_MESSAGE } from '../../../src/integrations/claude-code/sweep.js';
import { readLedger, writeLedger, ledgerKey } from '../../../src/ledger/index.js';
import type { Ledger, LedgerEntry } from '../../../src/ledger/types.js';

function scratchLedgerPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chowa-sweep-'));
  return join(dir, 'sessions.json');
}

function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    sessionId: 'sess-abc',
    repoPath: '/home/fran/repo',
    branch: 'feat/x',
    startedAt: '2026-08-04T00:00:00.000Z',
    status: 'quota_blocked',
    blockedWindow: 'five_hour',
    resetsAt: '2026-08-04T05:00:00.000Z',
    resumeAttempts: 0,
    ...overrides,
  };
}

describe('tmuxSessionName', () => {
  it('is deterministic and free of characters tmux rejects in session names', () => {
    const entry = makeEntry();
    const name = tmuxSessionName(entry);

    expect(name).toBe(tmuxSessionName(entry));
    expect(name).toMatch(/^chowa-resume-[0-9a-f]{12}$/);
  });

  it('differs for different repo/branch keys', () => {
    const a = tmuxSessionName(makeEntry({ branch: 'feat/x' }));
    const b = tmuxSessionName(makeEntry({ branch: 'feat/y' }));

    expect(a).not.toBe(b);
  });
});

describe('buildDispatch', () => {
  it('builds the exact new-session and send-keys argv for an entry with a task description', () => {
    const entry = makeEntry({ taskDescription: 'Was mid-refactor of the router module.' });
    const dispatch = buildDispatch(entry);

    expect(dispatch.cwd).toBe('/home/fran/repo');
    expect(dispatch.newSessionArgs).toEqual([
      'new-session',
      '-d',
      '-s',
      dispatch.sessionName,
      'claude',
      '--resume',
      'sess-abc',
    ]);
    expect(dispatch.sendKeysArgs).toEqual([
      'send-keys',
      '-t',
      dispatch.sessionName,
      'Was mid-refactor of the router module.',
      'Enter',
    ]);
  });

  it('falls back to a descriptive message, never a bare "continue", when no task description was captured', () => {
    const dispatch = buildDispatch(makeEntry({ taskDescription: undefined }));

    expect(dispatch.sendKeysArgs).toContain(FALLBACK_RESUME_MESSAGE);
    expect(dispatch.sendKeysArgs).not.toContain('continue');
  });
});

describe('sweep', () => {
  const now = new Date('2026-08-04T06:00:00.000Z');

  it('dispatches and marks resumed an eligible entry', async () => {
    const ledgerPath = scratchLedgerPath();
    const key = ledgerKey('/home/fran/repo', 'feat/x');
    writeLedger({ entries: { [key]: makeEntry() } }, { path: ledgerPath });

    const dispatched: LedgerEntry[] = [];
    const result = await sweep({
      now,
      ledgerOptions: { path: ledgerPath },
      dispatch: async (entry) => {
        dispatched.push(entry);
      },
    });

    expect(dispatched).toHaveLength(1);
    expect(result.resumed).toHaveLength(1);
    expect(result.failed).toHaveLength(0);

    const entry = readLedger({ path: ledgerPath }).entries[key];
    expect(entry?.status).toBe('resumed');
    expect(entry?.resumeAttempts).toBe(1);
  });

  it('leaves ineligible entries untouched and does not dispatch them', async () => {
    const ledgerPath = scratchLedgerPath();
    const key = ledgerKey('/home/fran/repo', 'feat/x');
    const notYetReset = makeEntry({ resetsAt: '2026-08-04T07:00:00.000Z' });
    writeLedger({ entries: { [key]: notYetReset } }, { path: ledgerPath });

    const dispatched: LedgerEntry[] = [];
    const result = await sweep({
      now,
      ledgerOptions: { path: ledgerPath },
      dispatch: async (entry) => {
        dispatched.push(entry);
      },
    });

    expect(dispatched).toHaveLength(0);
    expect(result.resumed).toHaveLength(0);
    expect(readLedger({ path: ledgerPath }).entries[key]).toEqual(notYetReset);
  });

  it('leaves a failed dispatch quota_blocked for retry on the next sweep', async () => {
    const ledgerPath = scratchLedgerPath();
    const key = ledgerKey('/home/fran/repo', 'feat/x');
    writeLedger({ entries: { [key]: makeEntry() } }, { path: ledgerPath });

    const result = await sweep({
      now,
      ledgerOptions: { path: ledgerPath },
      dispatch: async () => {
        throw new Error('tmux not found');
      },
    });

    expect(result.resumed).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.error).toContain('tmux not found');

    const entry = readLedger({ path: ledgerPath }).entries[key];
    expect(entry?.status).toBe('quota_blocked');
    expect(entry?.resumeAttempts).toBe(0);
  });

  it('is idempotent: a second sweep does not re-dispatch an already-resumed entry', async () => {
    const ledgerPath = scratchLedgerPath();
    const key = ledgerKey('/home/fran/repo', 'feat/x');
    writeLedger({ entries: { [key]: makeEntry() } }, { path: ledgerPath });

    const dispatched: LedgerEntry[] = [];
    const dispatch = async (entry: LedgerEntry): Promise<void> => {
      dispatched.push(entry);
    };

    await sweep({ now, ledgerOptions: { path: ledgerPath }, dispatch });
    await sweep({ now, ledgerOptions: { path: ledgerPath }, dispatch });

    expect(dispatched).toHaveLength(1);
  });

  it('sweeps both windows independently in one pass', async () => {
    const ledgerPath = scratchLedgerPath();
    const fiveHourKey = ledgerKey('/home/fran/repo-a', 'feat/x');
    const sevenDayKey = ledgerKey('/home/fran/repo-b', 'feat/y');
    const ledger: Ledger = {
      entries: {
        [fiveHourKey]: makeEntry({ repoPath: '/home/fran/repo-a' }),
        [sevenDayKey]: makeEntry({
          repoPath: '/home/fran/repo-b',
          branch: 'feat/y',
          blockedWindow: 'seven_day',
          resetsAt: '2026-08-03T00:00:00.000Z',
        }),
      },
    };
    writeLedger(ledger, { path: ledgerPath });

    const dispatched: LedgerEntry[] = [];
    const result = await sweep({
      now,
      ledgerOptions: { path: ledgerPath },
      dispatch: async (entry) => {
        dispatched.push(entry);
      },
    });

    expect(dispatched).toHaveLength(2);
    expect(result.resumed).toHaveLength(2);
  });
});
