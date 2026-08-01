import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { splitDiff, parseDiff } from '../../src/git/diffSplitter.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixturesDir = resolve(import.meta.dirname, '../fixtures');
const mixedDiff = readFileSync(resolve(fixturesDir, 'sample-diff-mixed.patch'), 'utf-8');
const singleDiff = readFileSync(resolve(fixturesDir, 'sample-diff-single.patch'), 'utf-8');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseDiff', () => {
  it('should parse hunks from a mixed diff', () => {
    const hunks = parseDiff(mixedDiff);

    expect(hunks.length).toBeGreaterThanOrEqual(2);
    const filePaths = [...new Set(hunks.map((h) => h.filePath))];
    expect(filePaths).toContain('README.md');
    expect(filePaths).toContain('src/utils/format.ts');
  });

  it('should parse hunk line numbers correctly', () => {
    const hunks = parseDiff(singleDiff);

    expect(hunks.length).toBeGreaterThanOrEqual(1);
    expect(hunks[0]!.oldStart).toBe(1);
    expect(hunks[0]!.oldLines).toBe(8);
    expect(hunks[0]!.newStart).toBe(1);
    expect(hunks[0]!.newLines).toBe(12);
  });

  it('should preserve hunk content', () => {
    const hunks = parseDiff(singleDiff);

    expect(hunks[0]!.content).toContain('formatDate');
    expect(hunks[0]!.content).toContain('formatCurrency');
  });

  it('should return empty array for empty input', () => {
    const hunks = parseDiff('');
    expect(hunks).toHaveLength(0);
  });
});

describe('splitDiff', () => {
  it('should split mixed diff into separate clusters by file', () => {
    const clusters = splitDiff(mixedDiff);

    expect(clusters).toHaveLength(2);

    const readmeCluster = clusters.find((c) => c.files.includes('README.md'));
    const utilsCluster = clusters.find((c) => c.files.includes('src/utils/format.ts'));

    expect(readmeCluster).toBeDefined();
    expect(utilsCluster).toBeDefined();

    expect(readmeCluster!.id).not.toBe(utilsCluster!.id);
  });

  it('should produce one cluster for a single-file diff', () => {
    const clusters = splitDiff(singleDiff);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.files).toContain('src/utils/format.ts');
  });

  it('should return empty array for empty diff', () => {
    const clusters = splitDiff('');
    expect(clusters).toHaveLength(0);
  });

  it('should return empty array for whitespace-only diff', () => {
    const clusters = splitDiff('   \n\n   ');
    expect(clusters).toHaveLength(0);
  });

  it('should assign unique IDs to each cluster', () => {
    const clusters = splitDiff(mixedDiff);
    const ids = clusters.map((c) => c.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});
