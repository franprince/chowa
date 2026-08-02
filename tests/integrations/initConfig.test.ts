import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  planInit,
  defaultConfigFileContents,
  ConfigAlreadyExistsError,
} from '../../src/integrations/initConfig.js';
import { loadPolicy, DEFAULT_POLICY } from '../../src/router/loadPolicy.js';

describe('initConfig', () => {
  const dirs: string[] = [];

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'chowa-init-'));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (dirs.length > 0) {
      rmSync(dirs.pop()!, { recursive: true, force: true });
    }
  });

  describe('planInit', () => {
    it('targets chowa.config.js in an empty directory', () => {
      const dir = tempDir();

      expect(planInit(dir).targetPath).toBe(join(dir, 'chowa.config.js'));
    });

    it('refuses when a config already exists, naming it', () => {
      const dir = tempDir();
      const existing = join(dir, 'chowa.config.js');
      writeFileSync(existing, 'export default { routing: { rules: [], defaultTarget: {} } };');

      expect(() => planInit(dir)).toThrow(ConfigAlreadyExistsError);

      try {
        planInit(dir);
        expect.unreachable();
      } catch (error) {
        expect((error as ConfigAlreadyExistsError).existingPath).toBe(existing);
      }
    });
  });

  describe('defaultConfigFileContents', () => {
    it('round-trips through the real loader as DEFAULT_POLICY', async () => {
      const dir = tempDir();
      writeFileSync(join(dir, 'chowa.config.js'), defaultConfigFileContents());

      const policy = await loadPolicy({ cwd: dir });

      expect(policy).toEqual(DEFAULT_POLICY);
    });
  });
});
