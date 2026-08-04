#!/usr/bin/env node
/**
 * SessionStart Hook
 *
 * Opens (or re-opens) a ledger entry the moment a Claude Code session
 * begins, keyed by branch. Reads its own session_id/cwd directly from the
 * hook's own stdin payload — no mtime guessing, confirmed available on
 * every hook invocation. A second SessionStart on the same branch
 * silently overwrites the first (see operations.ts's openEntry) —
 * intentional, documented last-write-wins, not a bug.
 */

import { simpleGit } from 'simple-git';
import { openEntry, readLedger, writeLedger } from '../../../ledger/index.js';
import type { LedgerStoreOptions } from '../../../ledger/index.js';
import { readHookStdin, runHookMain } from './hookRunner.js';

export interface SessionStartPayload {
  readonly session_id: string;
  readonly cwd: string;
}

export interface SessionStartDeps {
  readonly ledgerOptions?: LedgerStoreOptions;
}

export async function main(payload: SessionStartPayload, deps: SessionStartDeps = {}): Promise<void> {
  const { current: branch } = await simpleGit(payload.cwd).branch();

  const ledger = readLedger(deps.ledgerOptions);
  const updated = openEntry(ledger, {
    sessionId: payload.session_id,
    repoPath: payload.cwd,
    branch,
    startedAt: new Date().toISOString(),
  });
  writeLedger(updated, deps.ledgerOptions);
}

if (import.meta.main) {
  runHookMain('sessionStart', async () => {
    const raw = await readHookStdin();
    await main(JSON.parse(raw) as SessionStartPayload);
  });
}
