/**
 * Systemd User Timer
 *
 * Generates the `.service`/`.timer` unit pair that periodically invokes
 * `chowa ledger sweep`. Systemd-specific and Linux-only — deliberately
 * kept out of `src/integrations/claude-code/`, since it has nothing to do
 * with Claude Code's own hook system and would run the same way
 * regardless of which harness stamped the ledger.
 *
 * Pure content generation only (mirrors the existing `planInstall`/
 * `planInit` split elsewhere in `src/integrations/`) — actually writing
 * the unit files and running `systemctl --user enable --now` is the CLI
 * command's job, not this module's, so this stays fully unit-testable
 * without touching the real filesystem or a real systemd user session.
 */

import { join } from 'node:path';

const UNIT_NAME = 'chowa-resume-sweep';

export interface PlanTimerInstallOptions {
  readonly homeDir: string;
  /** Already-resolved absolute command systemd should run — e.g.
   *  `node /home/user/.claude/plugins/chowa/dist/cli.js ledger sweep`.
   *  Resolving *what* that path is belongs to the CLI layer (it already
   *  knows how to locate its own installed location); this module only
   *  ever sees the final string. */
  readonly execCommand: string;
  /** How often the timer fires, and the systemd unit's own randomized
   *  boot delay. Frequent enough to catch a reset promptly; cheap enough
   *  that firing often costs nothing (`chowa ledger sweep` is a pure
   *  in-memory filter over the ledger — no probe, no network). */
  readonly intervalMinutes?: number;
}

export interface TimerInstallPlan {
  readonly serviceUnitPath: string;
  readonly timerUnitPath: string;
  readonly serviceUnitContent: string;
  readonly timerUnitContent: string;
  /** Commands to run after writing the unit files, in order. */
  readonly postInstallCommands: readonly (readonly string[])[];
}

export function planTimerInstall(options: PlanTimerInstallOptions): TimerInstallPlan {
  const interval = options.intervalMinutes ?? 5;
  const unitDir = join(options.homeDir, '.config', 'systemd', 'user');

  const serviceUnitContent = [
    '[Unit]',
    'Description=Chōwa quota-aware session auto-resume sweep',
    '',
    '[Service]',
    'Type=oneshot',
    `ExecStart=${options.execCommand}`,
    '',
  ].join('\n');

  const timerUnitContent = [
    '[Unit]',
    'Description=Periodically run the Chōwa auto-resume sweep',
    '',
    '[Timer]',
    `OnBootSec=${interval}min`,
    `OnUnitActiveSec=${interval}min`,
    // Catches up on a missed tick after the machine was off — the whole
    // reason this is a systemd timer and not `at`/`cron` (Resolved
    // Question 3 in the spec).
    'Persistent=true',
    '',
    '[Install]',
    'WantedBy=timers.target',
    '',
  ].join('\n');

  return {
    serviceUnitPath: join(unitDir, `${UNIT_NAME}.service`),
    timerUnitPath: join(unitDir, `${UNIT_NAME}.timer`),
    serviceUnitContent,
    timerUnitContent,
    postInstallCommands: [
      ['systemctl', '--user', 'daemon-reload'],
      ['systemctl', '--user', 'enable', '--now', `${UNIT_NAME}.timer`],
    ],
  };
}
