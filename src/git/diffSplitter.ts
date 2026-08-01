/**
 * Diff Splitter
 *
 * Parses a unified diff and groups hunks into logically-related clusters,
 * each representing one atomic commit.
 *
 * v1 strategy: group by file path. A clear extension point
 * (ClusterStrategy interface) exists for smarter hunk-level clustering.
 *
 * This is a pure function — no git CLI calls, fully testable with fixtures.
 */

import type { DiffHunk, DiffCluster, ClusterStrategy } from './types.js';

// ---------------------------------------------------------------------------
// Diff parser
// ---------------------------------------------------------------------------

/**
 * Parse a unified diff string into individual hunks.
 * Handles standard `diff --git` format.
 */
export function parseDiff(rawDiff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = rawDiff.split('\n');

  let currentFile: string | null = null;
  let hunkStart = -1;
  let hunkLines: string[] = [];
  let oldStart = 0;
  let oldLines = 0;
  let newStart = 0;
  let newLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Detect file path from diff header
    // Handles: diff --git a/path b/path
    const diffMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (diffMatch) {
      // Flush any pending hunk
      if (currentFile && hunkStart >= 0 && hunkLines.length > 0) {
        hunks.push({
          filePath: currentFile,
          oldStart,
          oldLines,
          newStart,
          newLines,
          content: hunkLines.join('\n'),
        });
      }
      currentFile = diffMatch[2]!;
      hunkStart = -1;
      hunkLines = [];
      continue;
    }

    // Also handle --- and +++ for renamed/new/deleted files
    const minusMatch = line.match(/^--- (?:a\/)?(.+)$/);
    if (minusMatch && minusMatch[1] !== '/dev/null') {
      // File being modified (old version)
      continue;
    }

    const plusMatch = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
    if (plusMatch && plusMatch[1] !== '/dev/null') {
      currentFile = plusMatch[1]!;
      continue;
    }

    // Detect hunk header: @@ -old,count +new,count @@
    const hunkHeaderMatch = line.match(
      /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/,
    );
    if (hunkHeaderMatch) {
      // Flush previous hunk if any
      if (currentFile && hunkStart >= 0 && hunkLines.length > 0) {
        hunks.push({
          filePath: currentFile,
          oldStart,
          oldLines,
          newStart,
          newLines,
          content: hunkLines.join('\n'),
        });
      }

      oldStart = parseInt(hunkHeaderMatch[1]!, 10);
      oldLines = parseInt(hunkHeaderMatch[2] ?? '1', 10);
      newStart = parseInt(hunkHeaderMatch[3]!, 10);
      newLines = parseInt(hunkHeaderMatch[4] ?? '1', 10);
      hunkStart = i;
      hunkLines = [line];
      continue;
    }

    // Accumulate hunk content
    if (hunkStart >= 0) {
      hunkLines.push(line);
    }
  }

  // Flush final hunk
  if (currentFile && hunkStart >= 0 && hunkLines.length > 0) {
    hunks.push({
      filePath: currentFile,
      oldStart,
      oldLines,
      newStart,
      newLines,
      content: hunkLines.join('\n'),
    });
  }

  return hunks;
}

// ---------------------------------------------------------------------------
// File-based clustering strategy (v1 default)
// ---------------------------------------------------------------------------

export class FileBasedClusterStrategy implements ClusterStrategy {
  readonly name = 'file-based';

  cluster(hunks: readonly DiffHunk[]): DiffCluster[] {
    const fileGroups = new Map<string, DiffHunk[]>();

    for (const hunk of hunks) {
      const existing = fileGroups.get(hunk.filePath);
      if (existing) {
        existing.push(hunk);
      } else {
        fileGroups.set(hunk.filePath, [hunk]);
      }
    }

    let clusterIndex = 0;
    const clusters: DiffCluster[] = [];

    for (const [filePath, fileHunks] of fileGroups) {
      clusters.push({
        id: `cluster-${clusterIndex++}`,
        files: [filePath],
        hunks: fileHunks,
      });
    }

    return clusters;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split a raw unified diff into logically-related clusters.
 *
 * @param rawDiff - A unified diff string (e.g. output of `git diff`)
 * @param strategy - Clustering strategy. Defaults to file-based grouping.
 * @returns An array of DiffClusters, each representing one atomic commit.
 */
export function splitDiff(
  rawDiff: string,
  strategy: ClusterStrategy = new FileBasedClusterStrategy(),
): DiffCluster[] {
  if (!rawDiff.trim()) {
    return [];
  }

  const hunks = parseDiff(rawDiff);
  return strategy.cluster(hunks);
}
