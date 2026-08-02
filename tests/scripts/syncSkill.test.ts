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
        'trailing prose',
      ].join('\n');

      const portable = toPortable(canonical);

      expect(portable).not.toContain('CLAUDE-CODE-ONLY CONTENT');
      expect(portable).toContain('# Heading');
      expect(portable).toContain('trailing prose');
    });

    it('leaves everything outside the markers byte-identical', () => {
      const canonical = readFileSync(CANONICAL_SKILL, 'utf-8');
      const start = canonical.indexOf('<!-- chowa:invocation:start -->');
      const end = canonical.indexOf('<!-- chowa:invocation:end -->');

      const portable = toPortable(canonical);

      expect(portable.slice(0, start)).toBe(canonical.slice(0, start));
      expect(portable.endsWith(canonical.slice(end + '<!-- chowa:invocation:end -->'.length))).toBe(
        true,
      );
    });

    it('never leaks ${CLAUDE_PLUGIN_ROOT} into the portable copy', () => {
      // The whole point of the swap: a harness with no plugin root cannot
      // resolve that placeholder, and would run a literal path.
      const canonical = readFileSync(CANONICAL_SKILL, 'utf-8');

      expect(canonical).toContain('CLAUDE_PLUGIN_ROOT');
      expect(toPortable(canonical)).not.toContain('CLAUDE_PLUGIN_ROOT');
    });

    it('throws rather than passing the canonical text through when markers are missing', () => {
      expect(() => toPortable('# No markers here\n')).toThrow(/missing the .* markers/);
    });

    it('throws when the markers are inverted', () => {
      const inverted = ['<!-- chowa:invocation:end -->', '<!-- chowa:invocation:start -->'].join(
        '\n',
      );

      expect(() => toPortable(inverted)).toThrow(/before/);
    });
  });

  it('the committed portable skill matches what the canonical one generates', () => {
    // Same guarantee CI enforces, kept here so a local `bun test` catches the
    // drift this whole effort exists to prevent.
    const expected = toPortable(readFileSync(CANONICAL_SKILL, 'utf-8'));

    expect(readFileSync(PORTABLE_SKILL, 'utf-8')).toBe(expected);
  });
});
