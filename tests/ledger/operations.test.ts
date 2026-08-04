import { describe, it, expect } from 'vitest';

import {
  MAX_RESUME_ATTEMPTS,
  abandonEntry,
  eligibleForSweep,
  markResumed,
  openEntry,
  stampQuota,
} from '../../src/ledger/operations.js';
import { ledgerKey } from '../../src/ledger/store.js';
import { EMPTY_LEDGER, type Ledger, type LedgerEntry } from '../../src/ledger/types.js';

const repoPath = '/home/fran/repo';
const branch = 'feat/x';
const key = ledgerKey(repoPath, branch);

function ledgerWith(entry: Partial<LedgerEntry> & Pick<LedgerEntry, 'status'>): Ledger {
  const base: LedgerEntry = {
    sessionId: 'sess-1',
    repoPath,
    branch,
    startedAt: '2026-08-04T00:00:00.000Z',
    resumeAttempts: 0,
    ...entry,
  };
  return { entries: { [key]: base } };
}

describe('openEntry', () => {
  it('opens a fresh entry with status open and zero resume attempts', () => {
    const ledger = openEntry(EMPTY_LEDGER, {
      sessionId: 'sess-1',
      repoPath,
      branch,
      startedAt: '2026-08-04T00:00:00.000Z',
    });

    expect(ledger.entries[key]).toMatchObject({
      status: 'open',
      resumeAttempts: 0,
      sessionId: 'sess-1',
    });
  });

  it('silently overwrites a prior entry on the same branch (documented last-write-wins)', () => {
    const first = openEntry(EMPTY_LEDGER, {
      sessionId: 'sess-1',
      repoPath,
      branch,
      startedAt: '2026-08-04T00:00:00.000Z',
    });
    const second = openEntry(first, {
      sessionId: 'sess-2',
      repoPath,
      branch,
      startedAt: '2026-08-04T01:00:00.000Z',
    });

    expect(Object.keys(second.entries)).toHaveLength(1);
    expect(second.entries[key]!.sessionId).toBe('sess-2');
  });
});

describe('stampQuota', () => {
  it('stamps an open entry as quota_blocked with the window and resetsAt', () => {
    const ledger = ledgerWith({ status: 'open' });
    const stamped = stampQuota(ledger, key, 'five_hour', '2026-08-04T05:00:00.000Z');

    expect(stamped.entries[key]).toMatchObject({
      status: 'quota_blocked',
      blockedWindow: 'five_hour',
      resetsAt: '2026-08-04T05:00:00.000Z',
    });
  });

  it('works on a previously resumed entry, not only a fresh open one', () => {
    const ledger = ledgerWith({ status: 'resumed', resumeAttempts: 1 });
    const stamped = stampQuota(ledger, key, 'seven_day', '2026-08-10T00:00:00.000Z');

    expect(stamped.entries[key]!.status).toBe('quota_blocked');
  });

  it('is a no-op when the key does not exist', () => {
    const stamped = stampQuota(EMPTY_LEDGER, key, 'five_hour', '2026-08-04T05:00:00.000Z');
    expect(stamped).toEqual(EMPTY_LEDGER);
  });

  it('records a task description when one is given (e.g. last_assistant_message)', () => {
    const ledger = ledgerWith({ status: 'open' });
    const stamped = stampQuota(
      ledger,
      key,
      'five_hour',
      '2026-08-04T05:00:00.000Z',
      undefined,
      'Was mid-refactor of the router module.',
    );

    expect(stamped.entries[key]!.taskDescription).toBe('Was mid-refactor of the router module.');
  });

  it('keeps the existing task description when none is given', () => {
    const ledger = ledgerWith({ status: 'open', taskDescription: 'original description' });
    const stamped = stampQuota(ledger, key, 'five_hour', '2026-08-04T05:00:00.000Z');

    expect(stamped.entries[key]!.taskDescription).toBe('original description');
  });
});

describe('abandonEntry', () => {
  it('marks an entry abandoned with a reason', () => {
    const ledger = ledgerWith({ status: 'quota_blocked' });
    const abandoned = abandonEntry(ledger, key, 'switched approach');

    expect(abandoned.entries[key]).toMatchObject({
      status: 'abandoned',
      abandonReason: 'switched approach',
    });
  });
});

describe('markResumed', () => {
  it('sets status to resumed and increments resumeAttempts', () => {
    const ledger = ledgerWith({ status: 'quota_blocked', resumeAttempts: 0 });
    const resumed = markResumed(ledger, key);

    expect(resumed.entries[key]).toMatchObject({ status: 'resumed', resumeAttempts: 1 });
  });
});

describe('eligibleForSweep', () => {
  const now = new Date('2026-08-04T06:00:00.000Z');

  it('selects an entry stamped quota_blocked whose window has passed', () => {
    const ledger = ledgerWith({
      status: 'quota_blocked',
      blockedWindow: 'five_hour',
      resetsAt: '2026-08-04T05:00:00.000Z',
    });

    expect(eligibleForSweep(ledger, 'five_hour', now)).toHaveLength(1);
  });

  it('excludes a five_hour-blocked entry from a seven_day sweep (the weekly/session bug)', () => {
    const ledger = ledgerWith({
      status: 'quota_blocked',
      blockedWindow: 'five_hour',
      resetsAt: '2026-08-04T05:00:00.000Z',
    });

    expect(eligibleForSweep(ledger, 'seven_day', now)).toHaveLength(0);
  });

  it('excludes a seven_day-blocked entry from a five_hour sweep', () => {
    const ledger = ledgerWith({
      status: 'quota_blocked',
      blockedWindow: 'seven_day',
      resetsAt: '2026-08-04T05:00:00.000Z',
    });

    expect(eligibleForSweep(ledger, 'five_hour', now)).toHaveLength(0);
  });

  it('excludes an entry whose reset time has not passed yet', () => {
    const ledger = ledgerWith({
      status: 'quota_blocked',
      blockedWindow: 'five_hour',
      resetsAt: '2026-08-04T07:00:00.000Z', // after `now`
    });

    expect(eligibleForSweep(ledger, 'five_hour', now)).toHaveLength(0);
  });

  it('includes an entry exactly at its reset time (boundary is inclusive)', () => {
    const ledger = ledgerWith({
      status: 'quota_blocked',
      blockedWindow: 'five_hour',
      resetsAt: now.toISOString(),
    });

    expect(eligibleForSweep(ledger, 'five_hour', now)).toHaveLength(1);
  });

  it('excludes entries not stamped quota_blocked, regardless of any other status', () => {
    for (const status of ['open', 'abandoned', 'resumed'] as const) {
      const ledger = ledgerWith({
        status,
        blockedWindow: 'five_hour',
        resetsAt: '2026-08-04T05:00:00.000Z',
      });
      expect(eligibleForSweep(ledger, 'five_hour', now)).toHaveLength(0);
    }
  });

  it('excludes an abandoned entry even if it was quota_blocked and past its window', () => {
    const blocked = ledgerWith({
      status: 'quota_blocked',
      blockedWindow: 'five_hour',
      resetsAt: '2026-08-04T05:00:00.000Z',
    });
    const abandoned = abandonEntry(blocked, key, 'no longer needed');

    expect(eligibleForSweep(abandoned, 'five_hour', now)).toHaveLength(0);
  });

  it('excludes an entry that has hit the resume-attempts cap', () => {
    const ledger = ledgerWith({
      status: 'quota_blocked',
      blockedWindow: 'five_hour',
      resetsAt: '2026-08-04T05:00:00.000Z',
      resumeAttempts: MAX_RESUME_ATTEMPTS,
    });

    expect(eligibleForSweep(ledger, 'five_hour', now)).toHaveLength(0);
  });

  it('includes an entry just below the resume-attempts cap', () => {
    const ledger = ledgerWith({
      status: 'quota_blocked',
      blockedWindow: 'five_hour',
      resetsAt: '2026-08-04T05:00:00.000Z',
      resumeAttempts: MAX_RESUME_ATTEMPTS - 1,
    });

    expect(eligibleForSweep(ledger, 'five_hour', now)).toHaveLength(1);
  });
});
