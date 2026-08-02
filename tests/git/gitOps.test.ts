import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitOps } from '../../src/git/gitOps.js';

/**
 * Covers the fallback GitOps gained for `getDiffAgainstBase` and
 * `getCommitHistory`: `git diff base...HEAD` / `git log base..HEAD` fail
 * outright when nothing named `base` exists as a *local* branch, which is
 * the normal state of a CI checkout — `actions/checkout` fetches the ref
 * under test, not every branch, so a base like `develop` exists only as
 * `origin/develop`. Both methods now retry against `origin/<base>` on
 * failure. Neither path had a test before this.
 */

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

/** `cwd` must exist before `execFileSync` can spawn anything in it. */
function initRepo(cwd: string): void {
  mkdirSync(cwd, { recursive: true });
  git(cwd, 'init', '-q', '-b', 'develop');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'user.name', 'Test');
}

describe('GitOps', () => {
  let root: string;
  let bare: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'chowa-gitops-'));
    bare = join(root, 'remote.git');
    git(root, 'init', '-q', '--bare', '-b', 'develop', bare);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('when the base branch exists locally', () => {
    const dir = () => join(root, 'local-checkout');

    beforeAll(() => {
      const cwd = dir();
      initRepo(cwd);
      git(cwd, 'commit', '--allow-empty', '-q', '-m', 'base commit on develop');
      git(cwd, 'checkout', '-q', '-b', 'feature');
      git(cwd, 'commit', '--allow-empty', '-q', '-m', 'feat: add widget');
    });

    it('getDiffAgainstBase resolves against the local ref without needing a remote', async () => {
      const gitOps = new GitOps(dir());

      await expect(gitOps.getDiffAgainstBase('develop')).resolves.toEqual(expect.any(String));
    });

    it('getCommitHistory returns the commits unique to the branch, oldest first', async () => {
      const gitOps = new GitOps(dir());

      const commits = await gitOps.getCommitHistory('develop');

      expect(commits).toHaveLength(1);
      expect(commits[0]!.message).toBe('feat: add widget');
    });
  });

  describe('when the base branch exists only as origin/<base> (typical CI checkout)', () => {
    const dir = () => join(root, 'ci-style-checkout');

    beforeAll(() => {
      // Populate the bare remote with a develop commit and a feature branch
      // that diverges from it.
      const seed = join(root, 'seed');
      initRepo(seed);
      git(seed, 'remote', 'add', 'origin', bare);
      git(seed, 'commit', '--allow-empty', '-q', '-m', 'base commit on develop');
      git(seed, 'push', '-q', 'origin', 'develop');
      git(seed, 'checkout', '-q', '-b', 'feature');
      git(seed, 'commit', '--allow-empty', '-q', '-m', 'fix: patch the widget');
      git(seed, 'push', '-q', 'origin', 'feature');

      // A normal (non-single-branch) clone checked out to `feature`: this is
      // what `actions/checkout` produces for a PR — `feature` is a real local
      // branch, `develop` exists only as the remote-tracking `origin/develop`.
      git(root, 'clone', '-q', bare, dir());
      git(dir(), 'checkout', '-q', 'feature');
      git(dir(), 'branch', '-D', 'develop');
    });

    it('has no local develop branch (sanity check on the fixture itself)', () => {
      expect(() => git(dir(), 'rev-parse', '--verify', 'refs/heads/develop')).toThrow();
      expect(git(dir(), 'rev-parse', '--verify', 'refs/remotes/origin/develop')).toMatch(/^[0-9a-f]{40}$/);
    });

    it('getDiffAgainstBase falls back to origin/<base> instead of throwing', async () => {
      const gitOps = new GitOps(dir());

      await expect(gitOps.getDiffAgainstBase('develop')).resolves.toEqual(expect.any(String));
    });

    it('getCommitHistory falls back to origin/<base> and still finds the branch commit', async () => {
      const gitOps = new GitOps(dir());

      const commits = await gitOps.getCommitHistory('develop');

      expect(commits).toHaveLength(1);
      expect(commits[0]!.message).toBe('fix: patch the widget');
    });
  });

  describe('when neither the local nor the remote base ref exists', () => {
    const dir = () => join(root, 'no-base-at-all');

    beforeAll(() => {
      const cwd = dir();
      initRepo(cwd);
      git(cwd, 'commit', '--allow-empty', '-q', '-m', 'only commit');
    });

    it('getDiffAgainstBase still rejects rather than silently returning nothing', async () => {
      const gitOps = new GitOps(dir());

      await expect(gitOps.getDiffAgainstBase('nonexistent')).rejects.toThrow();
    });
  });
});
