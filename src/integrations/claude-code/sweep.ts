/**
 * Sweep
 *
 * Invoked periodically (by a systemd user timer, via `chowa ledger sweep`)
 * to reopen sessions whose blocking quota window has since reset. Each
 * entry `eligibleForSweep` (ledger/operations.ts) is reopened in its own
 * detached `tmux` session running `claude --resume <id>` from the entry's
 * own recorded repo path — fully interactive, no `-p`, no
 * `--permission-mode`, never `--dangerously-skip-permissions`. A real TTY
 * sidesteps the headless-permission problem entirely; if the resumed
 * session needs a decision, it waits for a human, which is correct
 * behaviour here, not a defect.
 *
 * `eligibleForSweep` already compares each entry's own probe-captured
 * `resetsAt` against wall-clock `now` (see operations.ts) — so, unlike the
 * original plan sketch, there is no separate "resolve the current reset
 * time" step here: the timestamp captured at stamp time is the
 * authoritative one, and a resume dispatched too early (a stale probe, a
 * quota that moved) simply hits the wall again and re-stamps a corrected
 * `resetsAt`, bounded by `MAX_RESUME_ATTEMPTS`.
 *
 * `markResumed` is called immediately after a successful dispatch — not
 * after the resumed session finishes — so a sweep firing twice in a row
 * cannot double-dispatch the same entry (G8).
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  eligibleForSweep,
  ledgerKey,
  markResumed,
  readLedger,
  writeLedger,
} from '../../ledger/index.js';
import type { LedgerEntry, LedgerStoreOptions, LedgerWindow } from '../../ledger/index.js';

const WINDOWS: readonly LedgerWindow[] = ['five_hour', 'seven_day'];

/** Never a bare "continue" — see stopFailure.ts's own doc comment for why
 *  this is the fallback rather than the norm. */
export const FALLBACK_RESUME_MESSAGE =
  'Resuming a session interrupted by a quota limit. No task description was captured — check the transcript for what was in flight before continuing.';

/** A tmux session name can't contain `.`/`:`/whitespace; a short hash of
 *  the ledger key keeps it valid and unique without leaking the full path
 *  into a process list. */
export function tmuxSessionName(entry: LedgerEntry): string {
  const hash = createHash('sha1').update(ledgerKey(entry.repoPath, entry.branch)).digest('hex').slice(0, 12);
  return `chowa-resume-${hash}`;
}

export interface TmuxDispatch {
  readonly sessionName: string;
  readonly cwd: string;
  /** `tmux new-session ...` argv, opening the resumed session detached. */
  readonly newSessionArgs: readonly string[];
  /** `tmux send-keys ...` argv, typing the opening message and submitting it. */
  readonly sendKeysArgs: readonly string[];
}

/** Pure command construction — kept separate from the actual subprocess
 *  calls below so exact argv is assertable without running real tmux. */
export function buildDispatch(entry: LedgerEntry): TmuxDispatch {
  const sessionName = tmuxSessionName(entry);
  const message = entry.taskDescription ?? FALLBACK_RESUME_MESSAGE;

  return {
    sessionName,
    cwd: entry.repoPath,
    newSessionArgs: ['new-session', '-d', '-s', sessionName, 'claude', '--resume', entry.sessionId],
    sendKeysArgs: ['send-keys', '-t', sessionName, message, 'Enter'],
  };
}

function runTmux(args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tmux', [...args], { cwd, stdio: 'ignore' });
    child.on('error', (error) => reject(new Error(`Failed to spawn tmux: ${error.message}`)));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tmux ${args[0]} exited with code ${code}`));
    });
  });
}

/** Real dispatch: opens the detached session, gives `claude` a moment to
 *  boot its interactive input handling, then types the opening message. */
export async function dispatchResume(entry: LedgerEntry): Promise<void> {
  const dispatch = buildDispatch(entry);
  await runTmux(dispatch.newSessionArgs, dispatch.cwd);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await runTmux(dispatch.sendKeysArgs, dispatch.cwd);
}

export interface SweepDeps {
  readonly now?: Date;
  readonly ledgerOptions?: LedgerStoreOptions;
  readonly dispatch?: (entry: LedgerEntry) => Promise<void>;
}

export interface SweepResult {
  readonly resumed: readonly LedgerEntry[];
  /** Eligible entries whose dispatch failed — left `quota_blocked`, so the
   *  next sweep retries them (subject to the resume-attempts cap). */
  readonly failed: ReadonlyArray<{ readonly entry: LedgerEntry; readonly error: string }>;
}

export async function sweep(deps: SweepDeps = {}): Promise<SweepResult> {
  const now = deps.now ?? new Date();
  const dispatch = deps.dispatch ?? dispatchResume;

  let ledger = readLedger(deps.ledgerOptions);
  const resumed: LedgerEntry[] = [];
  const failed: Array<{ entry: LedgerEntry; error: string }> = [];

  for (const window of WINDOWS) {
    for (const entry of eligibleForSweep(ledger, window, now)) {
      try {
        await dispatch(entry);
        const key = ledgerKey(entry.repoPath, entry.branch);
        ledger = markResumed(ledger, key);
        resumed.push(ledger.entries[key]!);
      } catch (error) {
        failed.push({ entry, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  writeLedger(ledger, deps.ledgerOptions);
  return { resumed, failed };
}
