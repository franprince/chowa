import { describe, it, expect } from 'vitest';

import { planTimerInstall } from '../../../src/integrations/systemd/timer.js';

describe('planTimerInstall', () => {
  it('places both unit files under ~/.config/systemd/user', () => {
    const plan = planTimerInstall({ homeDir: '/home/fran', execCommand: 'node /opt/chowa/cli.js ledger sweep' });

    expect(plan.serviceUnitPath).toBe('/home/fran/.config/systemd/user/chowa-resume-sweep.service');
    expect(plan.timerUnitPath).toBe('/home/fran/.config/systemd/user/chowa-resume-sweep.timer');
  });

  it('embeds the given exec command verbatim in the service unit', () => {
    const plan = planTimerInstall({
      homeDir: '/home/fran',
      execCommand: 'node /opt/chowa/cli.js ledger sweep',
    });

    expect(plan.serviceUnitContent).toContain('ExecStart=node /opt/chowa/cli.js ledger sweep');
    expect(plan.serviceUnitContent).toContain('Type=oneshot');
  });

  it('defaults to a 5 minute interval and sets Persistent=true', () => {
    const plan = planTimerInstall({ homeDir: '/home/fran', execCommand: 'x' });

    expect(plan.timerUnitContent).toContain('OnBootSec=5min');
    expect(plan.timerUnitContent).toContain('OnUnitActiveSec=5min');
    expect(plan.timerUnitContent).toContain('Persistent=true');
    expect(plan.timerUnitContent).toContain('WantedBy=timers.target');
  });

  it('honors a custom interval', () => {
    const plan = planTimerInstall({ homeDir: '/home/fran', execCommand: 'x', intervalMinutes: 15 });

    expect(plan.timerUnitContent).toContain('OnBootSec=15min');
    expect(plan.timerUnitContent).toContain('OnUnitActiveSec=15min');
  });

  it('returns the exact post-install systemctl argv, in order', () => {
    const plan = planTimerInstall({ homeDir: '/home/fran', execCommand: 'x' });

    expect(plan.postInstallCommands).toEqual([
      ['systemctl', '--user', 'daemon-reload'],
      ['systemctl', '--user', 'enable', '--now', 'chowa-resume-sweep.timer'],
    ]);
  });
});
