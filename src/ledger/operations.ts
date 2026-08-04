/**
 * Ledger Operations
 *
 * Pure functions over a Ledger — no filesystem, no subprocess, no
 * Claude-Code-specific assumptions. Callers (hooks, the sweep) own reading
 * and writing via store.ts; these functions only compute the next state.
 */

import { ledgerKey } from './store.js';
import type { Ledger, LedgerEntry, LedgerWindow } from './types.js';

/** A stalled entry that keeps getting re-stamped and re-swept without ever
 *  succeeding is left alone past this many attempts, rather than retried
 *  forever (see the spec's "quota still exhausted when the sweep fires"
 *  edge case). */
export const MAX_RESUME_ATTEMPTS = 3;

function withEntry(ledger: Ledger, key: string, entry: LedgerEntry): Ledger {
  return { entries: { ...ledger.entries, [key]: entry } };
}

/**
 * Opens (or re-opens) the ledger entry for a task.
 *
 * A second `SessionStart` on the same branch silently overwrites the
 * first — documented, intentional last-write-wins (branch-per-task is
 * Chōwa's existing convention, so two live sessions on one branch is
 * already an edge case in itself), not a bug to guard against here.
 */
export function openEntry(
  ledger: Ledger,
  entry: Pick<LedgerEntry, 'sessionId' | 'repoPath' | 'branch' | 'sessionName' | 'taskDescription' | 'startedAt'>,
): Ledger {
  const key = ledgerKey(entry.repoPath, entry.branch);
  return withEntry(ledger, key, {
    ...entry,
    status: 'open',
    resumeAttempts: 0,
  });
}

/**
 * Stamps the entry for `key` as quota-blocked. Works regardless of the
 * entry's current status — a previously `resumed` entry that hits quota
 * again on the same branch is stamped the same way as a fresh `open` one.
 * No-op (returns the ledger unchanged) if `key` isn't present, since a
 * `StopFailure` firing for a session `SessionStart` never opened (e.g. the
 * hook was installed mid-session) has nothing to stamp.
 *
 * `taskDescription`, when given, overwrites the entry's own — `SessionStart`
 * never has anything to put there, so the last thing the assistant said
 * before dying (`StopFailure`'s own `last_assistant_message`) is the only
 * real description of what was in flight the sweep can later hand back to
 * the resumed session instead of a bare "continue".
 */
export function stampQuota(
  ledger: Ledger,
  key: string,
  window: LedgerWindow,
  resetsAt: string,
  stampedAt: string = new Date().toISOString(),
  taskDescription?: string,
): Ledger {
  const existing = ledger.entries[key];
  if (!existing) return ledger;

  return withEntry(ledger, key, {
    ...existing,
    status: 'quota_blocked',
    blockedWindow: window,
    resetsAt,
    stampedAt,
    taskDescription: taskDescription ?? existing.taskDescription,
  });
}

/** Marks `key` as deliberately abandoned, permanently excluding it from
 *  every future sweep regardless of how it later dies. */
export function abandonEntry(ledger: Ledger, key: string, reason?: string): Ledger {
  const existing = ledger.entries[key];
  if (!existing) return ledger;

  return withEntry(ledger, key, {
    ...existing,
    status: 'abandoned',
    abandonReason: reason,
  });
}

/** Called immediately after a successful `tmux` spawn — not after the
 *  resumed session finishes — so a sweep that fires twice in a row cannot
 *  dispatch two sessions for the same entry (the second run no longer
 *  finds it `quota_blocked`). */
export function markResumed(ledger: Ledger, key: string): Ledger {
  const existing = ledger.entries[key];
  if (!existing) return ledger;

  return withEntry(ledger, key, {
    ...existing,
    status: 'resumed',
    resumeAttempts: existing.resumeAttempts + 1,
  });
}

/**
 * Selects entries eligible for the sweep to reopen. Both conditions must
 * hold — being "not marked success" is deliberately not sufficient (see
 * the spec's rationale): an entry must be explicitly `quota_blocked` for
 * *this exact window* (fixes the five_hour/seven_day confusion — a
 * seven_day-blocked entry is never picked up by a five_hour sweep, and
 * vice versa), and its own recorded reset time must have actually passed.
 */
export function eligibleForSweep(
  ledger: Ledger,
  window: LedgerWindow,
  now: Date = new Date(),
): readonly LedgerEntry[] {
  return Object.values(ledger.entries).filter(
    (entry) =>
      entry.status === 'quota_blocked' &&
      entry.blockedWindow === window &&
      entry.resetsAt !== undefined &&
      new Date(entry.resetsAt).getTime() <= now.getTime() &&
      entry.resumeAttempts < MAX_RESUME_ATTEMPTS,
  );
}
