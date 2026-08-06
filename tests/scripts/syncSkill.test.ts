import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { toPortable, CANONICAL_SKILL, PORTABLE_SKILL } from '../../scripts/sync-skill.js';

describe('sync-skill', () => {
  describe('toPortable', () => {
    it('replaces the marked invocation region', () => {
      const canonical = [
        '# Heading',
        '<!-- chowa:invocation:start -->',
        'CLAUDE-CODE-ONLY CONTENT',
        '<!-- chowa:invocation:end -->',
        '<!-- chowa:delegation:start -->',
        'DELEGATION CONTENT',
        '<!-- chowa:delegation:end -->',
        '<!-- chowa:sdd:start -->',
        'SDD CONTENT',
        '<!-- chowa:sdd:end -->',
        '<!-- chowa:autoresume:start -->',
        'AUTORESUME CONTENT',
        '<!-- chowa:autoresume:end -->',
        'trailing prose',
      ].join('\n');

      const portable = toPortable(canonical);

      expect(portable).not.toContain('CLAUDE-CODE-ONLY CONTENT');
      expect(portable).toContain('# Heading');
      expect(portable).toContain('trailing prose');
    });

    it('removes the marked delegation region entirely', () => {
      const canonical = [
        '# Heading',
        '<!-- chowa:invocation:start -->',
        'INVOCATION CONTENT',
        '<!-- chowa:invocation:end -->',
        '### 8. Delegating Mechanical Sub-Tasks',
        '<!-- chowa:delegation:start -->',
        'Use the Agent tool with the chowa-mechanical subagent.',
        '<!-- chowa:delegation:end -->',
        '<!-- chowa:sdd:start -->',
        'SDD CONTENT',
        '<!-- chowa:sdd:end -->',
        '<!-- chowa:autoresume:start -->',
        'AUTORESUME CONTENT',
        '<!-- chowa:autoresume:end -->',
        'trailing prose',
      ].join('\n');

      const portable = toPortable(canonical);

      expect(portable).not.toContain('Agent tool');
      expect(portable).not.toContain('chowa-mechanical');
      expect(portable).toContain('# Heading');
      expect(portable).toContain('trailing prose');
    });

    it('removes the marked sdd region entirely', () => {
      const canonical = [
        '# Heading',
        '<!-- chowa:invocation:start -->',
        'INVOCATION CONTENT',
        '<!-- chowa:invocation:end -->',
        '<!-- chowa:delegation:start -->',
        'DELEGATION CONTENT',
        '<!-- chowa:delegation:end -->',
        '### 9. Executing Plans via Subagent-Driven Development',
        '<!-- chowa:sdd:start -->',
        'Use the superpowers:subagent-driven-development skill.',
        '<!-- chowa:sdd:end -->',
        '<!-- chowa:autoresume:start -->',
        'AUTORESUME CONTENT',
        '<!-- chowa:autoresume:end -->',
        'trailing prose',
      ].join('\n');

      const portable = toPortable(canonical);

      expect(portable).not.toContain('subagent-driven-development');
      expect(portable).not.toContain('superpowers');
      expect(portable).toContain('# Heading');
      expect(portable).toContain('trailing prose');
    });

    it('removes the marked autoresume region entirely', () => {
      const canonical = [
        '# Heading',
        '<!-- chowa:invocation:start -->',
        'INVOCATION CONTENT',
        '<!-- chowa:invocation:end -->',
        '<!-- chowa:delegation:start -->',
        'DELEGATION CONTENT',
        '<!-- chowa:delegation:end -->',
        '<!-- chowa:sdd:start -->',
        'SDD CONTENT',
        '<!-- chowa:sdd:end -->',
        '### 10. Quota-Aware Session Auto-Resume',
        '<!-- chowa:autoresume:start -->',
        'Tracked via SessionStart/StopFailure hooks.',
        '<!-- chowa:autoresume:end -->',
        'trailing prose',
      ].join('\n');

      const portable = toPortable(canonical);

      expect(portable).not.toContain('SessionStart');
      expect(portable).not.toContain('StopFailure');
      expect(portable).toContain('# Heading');
      expect(portable).toContain('trailing prose');
    });

    it('collapses the blank-line runoff left by three adjacent stripped regions', () => {
      // delegation, sdd, and autoresume sit back-to-back in the canonical
      // file, each surrounded by a blank line; stripping all three in
      // sequence used to leave a growing run of consecutive blank lines
      // behind (one per side of each region) rather than the single blank
      // line a normal section break gets.
      const canonical = [
        '<!-- chowa:invocation:start -->',
        'INVOCATION CONTENT',
        '<!-- chowa:invocation:end -->',
        '',
        '### 7. PR Description Generation',
        '',
        '```bash',
        'chowa pr --base <branch>',
        '```',
        '',
        '<!-- chowa:delegation:start -->',
        'DELEGATION CONTENT',
        '<!-- chowa:delegation:end -->',
        '',
        '<!-- chowa:sdd:start -->',
        'SDD CONTENT',
        '<!-- chowa:sdd:end -->',
        '',
        '<!-- chowa:autoresume:start -->',
        'AUTORESUME CONTENT',
        '<!-- chowa:autoresume:end -->',
        '',
        '## Chōwa CLI Reference',
      ].join('\n');

      const portable = toPortable(canonical);

      expect(portable).not.toMatch(/\n{3,}/);
      expect(portable.endsWith(
        ['### 7. PR Description Generation', '', '```bash', 'chowa pr --base <branch>', '```', '', '## Chōwa CLI Reference'].join(
          '\n',
        ),
      )).toBe(true);
    });

    it('leaves everything outside the markers byte-identical', () => {
      const canonical = readFileSync(CANONICAL_SKILL, 'utf-8');
      const start = canonical.indexOf('<!-- chowa:invocation:start -->');
      const autoresumeEnd = canonical.indexOf('<!-- chowa:autoresume:end -->');

      const portable = toPortable(canonical);

      expect(portable.slice(0, start)).toBe(canonical.slice(0, start));
      expect(
        portable.endsWith(canonical.slice(autoresumeEnd + '<!-- chowa:autoresume:end -->'.length)),
      ).toBe(true);
    });

    it('never leaks ${CLAUDE_PLUGIN_ROOT} into the portable copy', () => {
      // The whole point of the swap: a harness with no plugin root cannot
      // resolve that placeholder, and would run a literal path.
      const canonical = readFileSync(CANONICAL_SKILL, 'utf-8');

      expect(canonical).toContain('CLAUDE_PLUGIN_ROOT');
      expect(toPortable(canonical)).not.toContain('CLAUDE_PLUGIN_ROOT');
    });

    it('never leaks the Agent tool or chowa-mechanical subagent into the portable copy', () => {
      // Gemini/Antigravity has no Agent-tool/subagent equivalent — the whole
      // delegation section must be absent, not just half-translated.
      const canonical = readFileSync(CANONICAL_SKILL, 'utf-8');

      expect(canonical).toContain('chowa:chowa-mechanical');
      expect(toPortable(canonical)).not.toContain('chowa-mechanical');
    });

    it('never leaks the subagent-driven-development mention into the portable copy', () => {
      // Gemini/Antigravity has no Agent-tool/subagent equivalent, same as
      // the mechanical-delegation section — the whole section must be
      // absent, not just half-translated.
      const canonical = readFileSync(CANONICAL_SKILL, 'utf-8');

      expect(canonical).toContain('subagent-driven-development');
      expect(toPortable(canonical)).not.toContain('subagent-driven-development');
    });

    it('never leaks the SessionStart/StopFailure hooks into the portable copy', () => {
      // Gemini/Antigravity has no Claude-Code-hook equivalent — the whole
      // auto-resume section must be absent, not just half-translated.
      const canonical = readFileSync(CANONICAL_SKILL, 'utf-8');

      expect(canonical).toContain('StopFailure');
      const portable = toPortable(canonical);
      expect(portable).not.toContain('SessionStart');
      expect(portable).not.toContain('StopFailure');
    });

    it('throws rather than passing the canonical text through when markers are missing', () => {
      expect(() => toPortable('# No markers here\n')).toThrow(/missing the .* region markers/);
    });

    it('throws when the invocation markers are inverted', () => {
      const inverted = [
        '<!-- chowa:invocation:end -->',
        '<!-- chowa:invocation:start -->',
      ].join('\n');

      expect(() => toPortable(inverted)).toThrow(/before/);
    });

    it('throws when the delegation markers are missing', () => {
      const missingDelegation = [
        '<!-- chowa:invocation:start -->',
        'x',
        '<!-- chowa:invocation:end -->',
      ].join('\n');

      expect(() => toPortable(missingDelegation)).toThrow(/delegation region markers/);
    });

    it('throws when the sdd markers are missing', () => {
      const missingSdd = [
        '<!-- chowa:invocation:start -->',
        'x',
        '<!-- chowa:invocation:end -->',
        '<!-- chowa:delegation:start -->',
        'y',
        '<!-- chowa:delegation:end -->',
      ].join('\n');

      expect(() => toPortable(missingSdd)).toThrow(/sdd region markers/);
    });

    it('throws when the autoresume markers are missing', () => {
      const missingAutoresume = [
        '<!-- chowa:invocation:start -->',
        'x',
        '<!-- chowa:invocation:end -->',
        '<!-- chowa:delegation:start -->',
        'y',
        '<!-- chowa:delegation:end -->',
        '<!-- chowa:sdd:start -->',
        'z',
        '<!-- chowa:sdd:end -->',
      ].join('\n');

      expect(() => toPortable(missingAutoresume)).toThrow(/autoresume region markers/);
    });
  });

  it('the committed portable skill matches what the canonical one generates', () => {
    // Same guarantee CI enforces, kept here so a local `bun test` catches the
    // drift this whole effort exists to prevent.
    const expected = toPortable(readFileSync(CANONICAL_SKILL, 'utf-8'));

    expect(readFileSync(PORTABLE_SKILL, 'utf-8')).toBe(expected);
  });
});
