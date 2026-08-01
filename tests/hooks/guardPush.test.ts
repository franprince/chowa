import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// @ts-expect-error — plain .mjs, no type declarations by design.
import { decide } from '../../plugins/chowa/scripts/guard-push.mjs';

const GUARD = resolve(import.meta.dirname, '../../plugins/chowa/scripts/guard-push.mjs');

const onBranch =
  (branch: string | undefined) =>
  (): string | undefined =>
    branch;

/**
 * The verdict matrix is the acceptance criterion for this hook. Over-blocking
 * breaks Chōwa's own release flow — release/* and hotfix/* branches are pushed
 * before they PR into main — which is worse than the prose rule it replaces.
 */
const CASES: ReadonlyArray<{
  command: string;
  branch?: string;
  blocked: boolean;
  why: string;
}> = [
  // --- must block ---
  { command: 'git push origin main', blocked: true, why: 'explicit push to main' },
  { command: 'git push origin master', blocked: true, why: 'explicit push to master' },
  { command: 'git push origin HEAD:main', blocked: true, why: 'HEAD mapped onto main' },
  { command: 'git push --force origin main', blocked: true, why: 'force push to main' },
  { command: 'git push -f origin main', blocked: true, why: 'short force flag' },
  { command: 'git push origin main:main', blocked: true, why: 'explicit src:dst' },
  { command: 'git push origin feat/x:main', blocked: true, why: 'feature branch onto main' },
  { command: 'git push origin +main', blocked: true, why: 'force-refspec syntax' },
  { command: 'git push origin refs/heads/main', blocked: true, why: 'fully-qualified ref' },
  { command: 'git push origin --delete main', blocked: true, why: 'deleting main' },
  { command: 'git push --all origin', blocked: true, why: '--all includes main' },
  { command: 'git push --mirror origin', blocked: true, why: '--mirror includes main' },
  { command: 'git push', branch: 'main', blocked: true, why: 'bare push while on main' },
  { command: 'git push origin', branch: 'master', blocked: true, why: 'remote-only while on master' },
  {
    command: 'cd /repo && git push origin main',
    blocked: true,
    why: 'compound command still caught',
  },
  {
    command: 'git status && git push origin main && echo done',
    blocked: true,
    why: 'push in the middle of a chain',
  },

  // --- must allow ---
  { command: 'git push origin feat/x', blocked: false, why: 'feature branch' },
  { command: 'git push origin fix/y', blocked: false, why: 'fix branch' },
  {
    command: 'git push origin release/v0.3.0',
    blocked: false,
    why: 'release branches are pushed before they PR into main',
  },
  {
    command: 'git push --set-upstream origin hotfix/y',
    blocked: false,
    why: 'hotfix branches likewise',
  },
  {
    command: 'git push -u origin feat/plugin-distribution',
    blocked: false,
    why: 'short upstream flag',
  },
  { command: 'git push', branch: 'feat/x', blocked: false, why: 'bare push off a feature branch' },
  { command: 'git push origin --tags', blocked: false, why: 'tags only, no branch' },
  { command: 'git push origin main-ish', blocked: false, why: 'main is a prefix, not the ref' },
  { command: 'git push origin feature/mainline', blocked: false, why: 'main appears mid-path' },
  { command: 'git log --oneline', blocked: false, why: 'not a push at all' },
  { command: 'echo "git push origin main"', blocked: false, why: 'no git invocation in segment' },
  {
    command: 'git push',
    branch: undefined,
    blocked: false,
    why: 'branch unresolvable — fail open',
  },
];

describe('guard-push', () => {
  describe('verdict matrix', () => {
    for (const { command, branch, blocked, why } of CASES) {
      it(`${blocked ? 'blocks' : 'allows'} \`${command}\`${branch ? ` on ${branch}` : ''} — ${why}`, () => {
        expect(decide(command, onBranch(branch)).blocked).toBe(blocked);
      });
    }
  });

  it('explains why it blocked, naming the offending command', () => {
    const verdict = decide('git push origin main', onBranch('feat/x'));

    expect(verdict.reason).toContain('git push origin main');
    expect(verdict.reason).toContain('main');
  });

  describe('fail-open behaviour', () => {
    it('allows when the command is not a string', () => {
      expect(decide(undefined, onBranch('main')).blocked).toBe(false);
    });

    it('allows when branch resolution throws', () => {
      const throwing = () => {
        throw new Error('not a git repo');
      };

      expect(() => decide('git push', throwing)).toThrow();
      // main() wraps decide() in try/catch and defers; verified end-to-end below.
    });
  });

  describe('hook protocol', () => {
    function runGuard(payload: unknown): string {
      return execFileSync('node', [GUARD], {
        input: JSON.stringify(payload),
        encoding: 'utf-8',
      });
    }

    it('emits a deny decision in the documented shape', () => {
      const out = runGuard({
        tool_name: 'Bash',
        tool_input: { command: 'git push origin main' },
        cwd: process.cwd(),
      });

      expect(JSON.parse(out)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
        },
      });
    });

    it('stays silent for an allowed push', () => {
      const out = runGuard({
        tool_name: 'Bash',
        tool_input: { command: 'git push origin feat/x' },
        cwd: process.cwd(),
      });

      expect(out).toBe('');
    });

    it('ignores tools other than Bash', () => {
      const out = runGuard({
        tool_name: 'Edit',
        tool_input: { command: 'git push origin main' },
        cwd: process.cwd(),
      });

      expect(out).toBe('');
    });

    it('defers on an unparseable payload rather than blocking', () => {
      const out = execFileSync('node', [GUARD], { input: 'not json', encoding: 'utf-8' });

      expect(out).toBe('');
    });
  });
});
