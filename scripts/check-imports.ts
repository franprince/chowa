#!/usr/bin/env bun

/**
 * Import Boundary Checker
 *
 * Scans src/core/, src/adapters/, src/router/, src/git/ for any imports
 * from src/integrations/. Exits with code 1 if violations are found.
 *
 * Run: bun run check:imports
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
      } else if (entry.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist — skip
  }

  return files;
}

let violations = 0;

for (const dirName of protectedDirs) {
  const dir = resolve(srcDir, dirName);
  const files = getAllTsFiles(dir);

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (forbiddenPattern.test(line)) {
        const relativePath = file.replace(resolve(import.meta.dirname, '..'), '');
        console.error(`❌ ${relativePath}:${i + 1}: ${line.trim()}`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} boundary violation(s) found.`);
  console.error('Core modules must not import from src/integrations/.');
  process.exit(1);
} else {
  console.log('✅ No boundary violations found.');
}
