import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadPolicy, DEFAULT_POLICY } from '../../src/router/loadPolicy.js';

const fixturesDir = resolve(import.meta.dirname, '../fixtures');
const validConfigPath = join(fixturesDir, 'chowa-config-valid.config.ts');
const invalidConfigPath = join(fixturesDir, 'chowa-config-invalid.config.ts');

describe('loadPolicy', () => {
  it('loads a RoutingPolicy from a real config file', async () => {
    const policy = await loadPolicy({ configPath: validConfigPath });

    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0]!.target).toEqual({
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      fallbacks: [{ provider: 'anthropic', model: 'claude-haiku' }],
    });
    expect(policy.defaultTarget).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4.6' });
  });

  it('falls back to the built-in default policy when no config exists at the default location', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'chowa-loadpolicy-'));

    const policy = await loadPolicy({ cwd: emptyDir });

    expect(policy).toEqual(DEFAULT_POLICY);
  });

  it('throws when an explicitly-requested --config path does not exist', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'chowa-loadpolicy-'));

    await expect(
      loadPolicy({ cwd: emptyDir, configPath: 'does-not-exist.config.ts' }),
    ).rejects.toThrow(/Config file not found/);
  });

  it('throws a descriptive error when the config file has an invalid shape', async () => {
    await expect(loadPolicy({ configPath: invalidConfigPath })).rejects.toThrow(
      /Invalid chowa\.config\.ts.*"routing"/s,
    );
  });
});
