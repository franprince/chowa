#!/usr/bin/env node
/**
 * StopFailure Hook
 *
 * Stamps the ledger entry for this session as quota-blocked when — and
 * only when — the session died specifically from a rate-limit error.
 * Confirmed against the shipped Claude Code binary's own schema: `error`
 * is a closed enum of exactly ten values, and `rate_limit` is one of
 * them — distinguishable from every other failure mode (`overloaded`,
 * `server_error`, `max_output_tokens`, ...) with no text-matching. Any
 * other `error` value is a no-op; this hook only ever acts on quota.
 *
 * The payload doesn't identify *which* window (`five_hour`/`seven_day`)
 * blocked the session, so this probes `get_usage` (zero-token) at stamp
 * time to find the window currently at the highest utilization and its
 * exact `resets_at`, rather than trusting the free-text `error_details`.
 */

import { simpleGit } from 'simple-git';
import { ledgerKey, readLedger, stampQuota, writeLedger } from '../../../ledger/index.js';
import type { LedgerStoreOptions } from '../../../ledger/index.js';
import type { LedgerWindow } from '../../../ledger/types.js';
import { probeUsage, type ProbedWindow, type UsageSnapshot } from '../quotaProbe.js';
import { readHookStdin, runHookMain } from './hookRunner.js';

type StopFailureErrorReason =
  | 'authentication_failed'
  | 'oauth_org_not_allowed'
  | 'billing_error'
  | 'rate_limit'
  | 'overloaded'
  | 'invalid_request'
  | 'model_not_found'
  | 'server_error'
  | 'unknown'
  | 'max_output_tokens';

export interface StopFailurePayload {
  readonly session_id: string;
  readonly cwd: string;
  readonly error: StopFailureErrorReason;
}

function tightestWindow(snapshot: UsageSnapshot): { name: LedgerWindow; window: ProbedWindow } | null {
  let tightest: { name: LedgerWindow; window: ProbedWindow } | null = null;
  for (const [name, window] of snapshot.windows) {
    if (!tightest || window.utilization > tightest.window.utilization) {
      tightest = { name, window };
    }
  }
  return tightest;
}

export interface StopFailureDeps {
  readonly probeUsage?: typeof probeUsage;
  readonly ledgerOptions?: LedgerStoreOptions;
}

export async function main(payload: StopFailurePayload, deps: StopFailureDeps = {}): Promise<void> {
  if (payload.error !== 'rate_limit') return;

  const { current: branch } = await simpleGit(payload.cwd).branch();
  const key = ledgerKey(payload.cwd, branch);

  const probe = deps.probeUsage ?? probeUsage;
  const snapshot = await probe();
  const tightest = tightestWindow(snapshot);
  if (!tightest) return;

  const ledger = readLedger(deps.ledgerOptions);
  const updated = stampQuota(ledger, key, tightest.name, tightest.window.resetsAt.toISOString());
  writeLedger(updated, deps.ledgerOptions);
}

if (import.meta.main) {
  runHookMain('stopFailure', async () => {
    const raw = await readHookStdin();
    await main(JSON.parse(raw) as StopFailurePayload);
  });
}
