/**
 * Git Module Types
 *
 * Structured data types for git operations.
 * These are the inputs/outputs of the pure functions in the git module —
 * actual git CLI invocation lives in gitOps.ts.
 */

// ---------------------------------------------------------------------------
// Diff types
// ---------------------------------------------------------------------------

/** A single hunk from a unified diff. */
export interface DiffHunk {
  /** File path this hunk belongs to. */
  readonly filePath: string;

  /** Starting line in the old file. */
  readonly oldStart: number;

  /** Number of lines in the old file. */
  readonly oldLines: number;

  /** Starting line in the new file. */
  readonly newStart: number;

  /** Number of lines in the new file. */
  readonly newLines: number;

  /** Raw hunk content (including +/- prefixes). */
  readonly content: string;
}

/**
 * A cluster of logically related hunks that should form one atomic commit.
 */
export interface DiffCluster {
  /** Unique identifier for this cluster. */
  readonly id: string;

  /** Files touched by this cluster. */
  readonly files: readonly string[];

  /** Hunks in this cluster. */
  readonly hunks: readonly DiffHunk[];

  /** Commit message (populated after generation). */
  description?: string;
}

// ---------------------------------------------------------------------------
// Commit types
// ---------------------------------------------------------------------------

/** Information about a single commit. */
export interface CommitInfo {
  /** Commit hash. */
  readonly hash: string;

  /** Full commit message. */
  readonly message: string;

  /** Diff content for this commit. */
  readonly diff: string;
}

// ---------------------------------------------------------------------------
// PR Description
// ---------------------------------------------------------------------------

/**
 * PR type, derived from the branch-flow convention:
 * `release/*` / `hotfix/*` → `release`, everything else → `standard`.
 */
export type PRType = 'standard' | 'release';

/** Structured PR description with all sections. */
export interface PRDescription {
  /** PR type derived from the current branch name. */
  readonly type: PRType;

  /** High-level summary of the PR. */
  readonly summary: string;

  /** List of changes derived from atomic commit messages. */
  readonly changes: readonly string[];

  /** Testing notes and instructions. */
  readonly testing: string;

  /** Breaking changes section (omitted if none). */
  readonly breakingChanges?: string;

  /** Rollout/rollback plan — present only when `type === 'release'`. */
  readonly rolloutPlan?: string;
}

// ---------------------------------------------------------------------------
// Clustering strategy (extension point)
// ---------------------------------------------------------------------------

/**
 * Strategy interface for grouping hunks into clusters.
 * The default implementation groups by file path.
 * Future implementations can do smarter hunk-level clustering
 * (e.g. by analyzing import graphs, semantic similarity, etc.)
 */
export interface ClusterStrategy {
  readonly name: string;
  cluster(hunks: readonly DiffHunk[]): DiffCluster[];
}
