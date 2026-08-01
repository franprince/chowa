/**
 * Git Operations Wrapper
 *
 * Thin wrapper around `simple-git` for actual git CLI operations.
 * Core logic (diffSplitter, commitMessage, prDescription) never calls
 * git directly — they take structured data in and return strings out.
 * This module is the only place that touches the file system / git CLI.
 */

import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';

import type { CommitInfo } from './types.js';

// ---------------------------------------------------------------------------
// GitOps class
// ---------------------------------------------------------------------------

export class GitOps {
  private readonly git: SimpleGit;

  constructor(workingDir?: string) {
    this.git = simpleGit(workingDir);
  }

  /**
   * Get the working tree diff (unstaged changes).
   * Equivalent to `git diff`.
   */
  async getDiff(): Promise<string> {
    return this.git.diff();
  }

  /**
   * Get the staged diff.
   * Equivalent to `git diff --cached`.
   */
  async getStagedDiff(): Promise<string> {
    return this.git.diff(['--cached']);
  }

  /**
   * Get the diff between the current branch and a base branch.
   * Equivalent to `git diff base...HEAD`.
   */
  async getDiffAgainstBase(baseBranch: string): Promise<string> {
    return this.git.diff([`${baseBranch}...HEAD`]);
  }

  /**
   * Stage specific files.
   */
  async stageFiles(files: readonly string[]): Promise<void> {
    await this.git.add([...files]);
  }

  /**
   * Create a commit with the given message.
   * @returns The commit hash.
   */
  async commit(message: string): Promise<string> {
    const result = await this.git.commit(message);
    return result.commit;
  }

  /**
   * Get the commit history between a base branch and HEAD.
   * Returns commits in chronological order (oldest first).
   */
  async getCommitHistory(baseBranch: string): Promise<CommitInfo[]> {
    const log = await this.git.log({ from: baseBranch, to: 'HEAD' });

    const commits: CommitInfo[] = [];
    for (const entry of log.all) {
      const diff = await this.git.diff([`${entry.hash}^`, entry.hash]);
      commits.push({
        hash: entry.hash,
        message: entry.message,
        diff,
      });
    }

    return commits.reverse(); // oldest first
  }

  /**
   * Get the current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    const result = await this.git.branch();
    return result.current;
  }

  /**
   * Check if the working tree is clean (no uncommitted changes).
   */
  async isClean(): Promise<boolean> {
    const status = await this.git.status();
    return status.isClean();
  }

  /**
   * Fetch updates from remote and check if local branch is behind remote.
   */
  async checkRemoteUpdates(
    remote = 'origin',
    baseBranch?: string,
  ): Promise<{ behindCount: number; aheadCount: number; remoteBranch: string }> {
    const currentBranch = await this.getCurrentBranch();
    const targetRemoteBranch = `${remote}/${baseBranch ?? currentBranch}`;

    try {
      await this.git.fetch(remote);
      const revList = await this.git.raw([
        'rev-list',
        '--left-right',
        '--count',
        `HEAD...${targetRemoteBranch}`,
      ]);
      const [aheadStr, behindStr] = revList.trim().split(/\s+/);

      return {
        aheadCount: parseInt(aheadStr ?? '0', 10),
        behindCount: parseInt(behindStr ?? '0', 10),
        remoteBranch: targetRemoteBranch,
      };
    } catch {
      return {
        aheadCount: 0,
        behindCount: 0,
        remoteBranch: targetRemoteBranch,
      };
    }
  }
}

