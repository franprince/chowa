import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Boundary Enforcement Test
 *
 * Ensures the one-way dependency rule holds:
 *   integrations → core/adapters/router/git (allowed)
 *   core/adapters/router/git → integrations (FORBIDDEN)
 *
 * Scans all .ts files in src/core/, src/adapters/, src/router/, src/git/
 * for any import from src/integrations/.
 */

describe('dependency boundary', () => {
  const srcDir = resolve(import.meta.dirname, '../src');

  const protectedDirs = ['core', 'adapters', 'router', 'git'];
  const forbiddenPattern = /from\s+['"].*integrations/;

  function getAllTsFiles(dir: string): string[] {
    const files: string[] = [];

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          files.push(...getAllTsFiles(fullPath));
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory might not exist yet — that's fine
    }

    return files;
  }

  for (const dirName of protectedDirs) {
    it(`should not have imports from integrations in src/${dirName}/`, () => {
      const dir = resolve(srcDir, dirName);
      const files = getAllTsFiles(dir);
      const violations: string[] = [];

      for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          if (forbiddenPattern.test(line)) {
            const relativePath = file.replace(srcDir, 'src');
            violations.push(`${relativePath}:${i + 1}: ${line.trim()}`);
          }
        }
      }

      expect(
        violations,
        `Found ${violations.length} forbidden import(s) from integrations:\n${violations.join('\n')}`,
      ).toHaveLength(0);
    });
  }

  it('should allow src/client.ts to not import from integrations', () => {
    const clientPath = resolve(srcDir, 'client.ts');
    const content = readFileSync(clientPath, 'utf-8');

    expect(forbiddenPattern.test(content)).toBe(false);
  });
});
