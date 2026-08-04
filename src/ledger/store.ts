/**
 * Ledger Store
 *
 * Reads and writes the ledger as a single JSON file outside the repo
 * (default `~/.chowa/sessions.json`), so it's never accidentally committed
 * and survives the repo being re-cloned. Writes are atomic: write to a
 * temp file in the same directory, then rename over the target — rename
 * is atomic on the same filesystem, so a concurrent reader never observes
 * a partial write. Given how infrequently this file is written (only on
 * SessionStart/StopFailure/sweep events), that's sufficient without a
 * lock file or per-entry sharding.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { EMPTY_LEDGER, type Ledger, type LedgerEntry } from './types.js';

const ledgerEntrySchema = z.object({
  sessionId: z.string(),
  repoPath: z.string(),
  branch: z.string(),
  sessionName: z.string().optional(),
  taskDescription: z.string().optional(),
  startedAt: z.string(),
  status: z.enum(['open', 'quota_blocked', 'abandoned', 'resumed']),
  blockedWindow: z.enum(['five_hour', 'seven_day']).optional(),
  resetsAt: z.string().optional(),
  stampedAt: z.string().optional(),
  abandonReason: z.string().optional(),
  resumeAttempts: z.number().int().nonnegative(),
}) satisfies z.ZodType<LedgerEntry>;

const ledgerSchema = z.object({
  entries: z.record(z.string(), ledgerEntrySchema),
}) satisfies z.ZodType<Ledger>;

export interface LedgerStoreOptions {
  readonly path?: string;
}

export function defaultLedgerPath(): string {
  return join(homedir(), '.chowa', 'sessions.json');
}

/** Returns an empty ledger when the file doesn't exist yet — no separate
 *  "initialize" step needed. Throws on a present-but-malformed file rather
 *  than silently discarding it, per the project's own fail-loudly convention. */
export function readLedger(options: LedgerStoreOptions = {}): Ledger {
  const path = options.path ?? defaultLedgerPath();

  if (!existsSync(path)) {
    return EMPTY_LEDGER;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(
      `Ledger at "${path}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = ledgerSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Ledger at "${path}" does not match the expected shape: ${result.error.message}`);
  }

  return result.data;
}

export function writeLedger(ledger: Ledger, options: LedgerStoreOptions = {}): void {
  const path = options.path ?? defaultLedgerPath();
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });

  const tempPath = join(dir, `.sessions.json.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tempPath, JSON.stringify(ledger, null, 2), 'utf-8');
  renameSync(tempPath, path);
}

export function ledgerKey(repoPath: string, branch: string): string {
  return `${repoPath}#${branch}`;
}
