/**
 * Session Ledger Types
 *
 * A ledger entry records a task's session so it can be recognized as
 * quota-blocked and resumed later. Deliberately not a general task
 * tracker: no priorities, no dependencies, no "done" signal — an entry
 * leaves the sweep's attention only by being abandoned or aging out of
 * its eligibility window (see operations.ts).
 */

export type LedgerWindow = 'five_hour' | 'seven_day';

export type LedgerStatus = 'open' | 'quota_blocked' | 'abandoned' | 'resumed';

export interface LedgerEntry {
  readonly sessionId: string;
  /** Absolute path — `claude --resume` is directory-scoped. */
  readonly repoPath: string;
  readonly branch: string;
  readonly sessionName?: string;
  /** What to send on resume; falls back to last_assistant_message if unset. */
  readonly taskDescription?: string;
  readonly startedAt: string;
  readonly status: LedgerStatus;
  readonly blockedWindow?: LedgerWindow;
  /** ISO 8601, captured from the get_usage probe at stamp time. */
  readonly resetsAt?: string;
  readonly stampedAt?: string;
  readonly abandonReason?: string;
  /** Guards against re-stamping the same entry forever (see eligibleForSweep). */
  readonly resumeAttempts: number;
}

export interface Ledger {
  readonly entries: Readonly<Record<string, LedgerEntry>>;
}

export const EMPTY_LEDGER: Ledger = { entries: {} };
