import { describe, it, expect } from 'vitest';
import { join } from 'node:path';

import {
  planInstall,
  resolvePortableSkillPath,
  globalRulesContent,
  UnknownAgentError,
  SkillSourceNotFoundError,
  SUPPORTED_AGENTS,
  PORTABLE_SKILL_RELATIVE,
} from '../../src/integrations/install.js';

/** Filesystem stub: only the listed paths exist. */
const only =
  (...paths: readonly string[]) =>
  (path: string): boolean =>
    paths.includes(path);

const HOME = join('/home', 'someone');

describe('install', () => {
  describe('resolvePortableSkillPath', () => {
    it('finds the skill in the starting directory', () => {
      const expected = join('/repo', PORTABLE_SKILL_RELATIVE);

      expect(resolvePortableSkillPath(['/repo'], only(expected))).toBe(expected);
    });

    it('walks upward to find it from a nested directory', () => {
      const expected = join('/repo', PORTABLE_SKILL_RELATIVE);

      expect(resolvePortableSkillPath(['/repo/src/deep/nested'], only(expected))).toBe(expected);
    });

    it('tries each starting directory in order', () => {
      const expected = join('/elsewhere', PORTABLE_SKILL_RELATIVE);

      expect(resolvePortableSkillPath(['/nothing/here', '/elsewhere'], only(expected))).toBe(
        expected,
      );
    });

    it('returns undefined rather than looping forever when nothing exists', () => {
      expect(resolvePortableSkillPath(['/a/b/c'], () => false)).toBeUndefined();
    });

    it('finds the real skill in this repo from the module directory', () => {
      // Not a stub: proves the upward search actually works on disk, which is
      // what the CLI relies on.
      expect(resolvePortableSkillPath([import.meta.dirname])).toMatch(/\.agents/);
    });
  });

  describe('planInstall', () => {
    const skill = join('/repo', PORTABLE_SKILL_RELATIVE);

    it('maps gemini to its config directory', () => {
      const plan = planInstall('gemini', HOME, ['/repo'], only(skill));

      expect(plan.skillSource).toBe(skill);
      expect(plan.skillDestination).toBe(
        join(HOME, '.gemini', 'config', 'skills', 'chowa', 'SKILL.md'),
      );
      expect(plan.rulesDestination).toBe(join(HOME, '.gemini', 'config', 'AGENTS.md'));
    });

    it('rejects an unknown agent and names the supported ones', () => {
      expect(() => planInstall('emacs', HOME, ['/repo'], only(skill))).toThrow(UnknownAgentError);

      try {
        planInstall('emacs', HOME, ['/repo'], only(skill));
      } catch (error) {
        expect((error as Error).message).toContain(SUPPORTED_AGENTS[0]!);
        // Claude Code users should be redirected, not silently served.
        expect((error as Error).message).toContain('plugin marketplace add');
      }
    });

    it('fails clearly when no checkout of the portable skill is around', () => {
      expect(() => planInstall('gemini', HOME, ['/repo'], () => false)).toThrow(
        SkillSourceNotFoundError,
      );
    });

    it('copies the portable skill, never the Claude Code one', () => {
      const plan = planInstall('gemini', HOME, ['/repo'], only(skill));

      // The canonical skill names ${CLAUDE_PLUGIN_ROOT}, which a harness with
      // no plugin root would hand to the model as a literal string.
      expect(plan.skillSource).toContain('.agents');
      expect(plan.skillSource).not.toContain('plugins/chowa/skills');
    });
  });

  describe('globalRulesContent', () => {
    const content = globalRulesContent();

    it('scopes the rules to projects actually set up for Chōwa', () => {
      // Regression guard on specs/2026-08-01-portable-global-skill-sync/ G3:
      // this file used to assert Chōwa's conventions as universal truth on the
      // strength of one invocation in one project.
      expect(content).toMatch(/only.*projects set up for Chōwa/s);
      expect(content).toMatch(/chowa\.config/);
      expect(content).toMatch(/follow that\s+project's own conventions instead/s);
    });

    it('still carries the push rule', () => {
      expect(content).toMatch(/[Nn]ever push directly to/);
    });

    it('makes no claim about applying across all projects', () => {
      expect(content).not.toMatch(/all projects/i);
    });

    it('mentions the always-on preference as an explicit, personal opt-in', () => {
      expect(content).toMatch(/chowa always-on/);
    });
  });
});
