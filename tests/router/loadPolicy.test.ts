import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  loadPolicy,
  findConfigPath,
  describeImportFailure,
  CONFIG_CANDIDATES,
  DEFAULT_POLICY,
} from '../../src/router/loadPolicy.js';

const fixturesDir = resolve(import.meta.dirname, '../fixtures');
const validConfigPath = join(fixturesDir, 'chowa-config-valid.config.ts');
const validJsConfigPath = join(fixturesDir, 'chowa-config-valid.config.js');
const invalidConfigPath = join(fixturesDir, 'chowa-config-invalid.config.ts');

/** Build a scratch dir containing the given `chowa.config.*` filenames. */
function scratchDirWith(...candidates: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'chowa-loadpolicy-'));
  for (const candidate of candidates) {
    const source = candidate.endsWith('.ts') ? validConfigPath : validJsConfigPath;
    copyFileSync(source, join(dir, candidate));
  }
  return dir;
}

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
      /Invalid Chōwa config.*"routing"/s,
    );
  });

  describe('config file discovery', () => {
    it('loads a plain-JavaScript config when no .ts config exists', async () => {
      const policy = await loadPolicy({ cwd: scratchDirWith('chowa.config.js') });

      expect(policy.rules[0]!.target).toEqual({
        provider: 'openai',
        model: 'gpt-from-js-config',
      });
      expect(policy.defaultTarget).toEqual({ provider: 'local', model: 'llama-from-js-config' });
    });

    it('loads a .mjs config when it is the only candidate', async () => {
      const policy = await loadPolicy({ cwd: scratchDirWith('chowa.config.mjs') });

      expect(policy.defaultTarget).toEqual({ provider: 'local', model: 'llama-from-js-config' });
    });

    it('prefers .ts over .js when a project has both', async () => {
      const dir = scratchDirWith('chowa.config.ts', 'chowa.config.js');

      expect(findConfigPath(dir)).toBe(join(dir, 'chowa.config.ts'));

      const policy = await loadPolicy({ cwd: dir });
      expect(policy.rules[0]!.target.provider).toBe('gemini');
    });

    it('reports no config path when the directory has none', () => {
      expect(findConfigPath(mkdtempSync(join(tmpdir(), 'chowa-loadpolicy-')))).toBeUndefined();
    });

    it('probes .ts before .js before .mjs', () => {
      expect(CONFIG_CANDIDATES).toEqual([
        'chowa.config.ts',
        'chowa.config.js',
        'chowa.config.mjs',
      ]);
    });

    it('still honours an explicit --config pointing at a .js file', async () => {
      const policy = await loadPolicy({ configPath: validJsConfigPath });

      expect(policy.rules[0]!.target.model).toBe('gpt-from-js-config');
    });

    it('does not fall back to discovery when an explicit --config is missing', async () => {
      // A project that *has* a usable chowa.config.js must still fail loudly
      // when --config names something that isn't there, rather than quietly
      // loading the discovered file. Regression guard on
      // specs/2026-08-01-routing-config-wiring/.
      const dir = scratchDirWith('chowa.config.js');

      await expect(loadPolicy({ cwd: dir, configPath: 'does-not-exist.config.ts' })).rejects.toThrow(
        /Config file not found/,
      );
    });
  });

  describe('import failure reporting', () => {
    // A runtime without TypeScript type stripping can't be reproduced from
    // inside this process, so the mapping is asserted against the cause such
    // a runtime actually emits.
    it('explains how to recover when the runtime cannot import TypeScript', () => {
      const message = describeImportFailure(
        'Unknown file extension ".ts" for /project/chowa.config.ts',
        '/project/chowa.config.ts',
      );

      expect(message).toMatch(/cannot import TypeScript directly/);
      expect(message).toMatch(/Node >= 22\.18/);
      expect(message).toMatch(/chowa\.config\.js/);
    });

    it('passes any other failure through unchanged', () => {
      const message = describeImportFailure('boom', '/project/chowa.config.ts');

      expect(message).toBe('Failed to load config file at "/project/chowa.config.ts": boom');
    });
  });
});
