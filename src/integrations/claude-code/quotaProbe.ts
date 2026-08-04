/**
 * Quota Probe
 *
 * Asks a `claude` CLI process for its current subscription rate-limit
 * state via the `get_usage` control request, over the stream-json control
 * channel. Verified live during this feature's design: the probe is
 * answered without running a model turn, so it costs zero tokens
 * (`total_cost_usd: 0`, empty `model_usage`) and can be polled freely.
 *
 * `get_usage` is explicitly experimental — its SDK method is named
 * `..._DONT_RELY_ON_THIS_API_YET()` and its schema says the response shape
 * may change. Everything here parses defensively and throws a clear error
 * on an unrecognized shape rather than assuming quota is available.
 *
 * Dependencies flow one direction: integrations → core.
 */

import { spawn } from 'node:child_process';
import type { LedgerWindow } from '../../ledger/types.js';

export interface ProbedWindow {
  readonly utilization: number;
  readonly resetsAt: Date;
}

export interface UsageSnapshot {
  readonly subscriptionType: string | null;
  readonly windows: ReadonlyMap<LedgerWindow, ProbedWindow>;
}

const CONTROL_REQUEST = `${JSON.stringify({
  type: 'control_request',
  request_id: 'chowa_probe',
  request: { subtype: 'get_usage' },
})}\n`;

const RATE_LIMIT_KEYS: readonly LedgerWindow[] = ['five_hour', 'seven_day'];

export interface ProbeUsageOptions {
  readonly binary?: string;
  readonly timeoutMs?: number;
}

export async function probeUsage(options: ProbeUsageOptions = {}): Promise<UsageSnapshot> {
  const binary = options.binary ?? 'claude';
  const timeoutMs = options.timeoutMs ?? 60_000;

  const stdout = await runProbe(binary, timeoutMs);
  const payload = extractUsageResponse(stdout);
  return parseSnapshot(payload);
}

function runProbe(binary: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      ['-p', '--verbose', '--input-format', 'stream-json', '--output-format', 'stream-json'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Quota probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf-8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn '${binary}': ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (!out.trim()) {
        reject(new Error(`No output from '${binary}' (exit ${code}). stderr: ${err.trim()}`));
        return;
      }
      resolve(out);
    });

    child.stdin.write(CONTROL_REQUEST);
    child.stdin.end();
  });
}

function extractUsageResponse(stdout: string): Record<string, unknown> {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!isRecord(parsed) || parsed.type !== 'control_response') continue;
    const response = parsed.response;
    if (!isRecord(response)) continue;

    if (response.subtype === 'error') {
      throw new Error(`get_usage failed: ${String(response.error ?? 'unknown error')}`);
    }
    if (response.subtype === 'success' && isRecord(response.response)) {
      return response.response;
    }
  }
  throw new Error('No get_usage control_response found in output.');
}

function parseSnapshot(payload: Record<string, unknown>): UsageSnapshot {
  const windows = new Map<LedgerWindow, ProbedWindow>();
  const rateLimits = payload.rate_limits;

  if (isRecord(rateLimits)) {
    for (const key of RATE_LIMIT_KEYS) {
      const value = rateLimits[key];
      if (!isRecord(value)) continue;

      const utilization = value.utilization;
      const resetsAt = value.resets_at;
      if (typeof utilization !== 'number' || typeof resetsAt !== 'string') continue;

      const parsedDate = new Date(resetsAt);
      if (Number.isNaN(parsedDate.getTime())) continue;

      windows.set(key, { utilization, resetsAt: parsedDate });
    }
  }

  if (windows.size === 0) {
    throw new Error(
      'get_usage returned no parseable rate-limit windows — the experimental response shape may have changed.',
    );
  }

  return {
    subscriptionType: typeof payload.subscription_type === 'string' ? payload.subscription_type : null,
    windows,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
