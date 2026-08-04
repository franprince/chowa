/**
 * Hook Runner
 *
 * Shared plumbing for Claude Code hook entry points: read the JSON payload
 * from stdin, and never let a hook's own failure propagate as a non-zero
 * exit or an uncaught rejection — a broken ledger write must never block
 * or slow a session start.
 */

export function readHookStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf-8');
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

export function runHookMain(hookName: string, fn: () => Promise<void>): void {
  fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`chowa ${hookName} hook failed: ${message}\n`);
    process.exitCode = 0;
  });
}
