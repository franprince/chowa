import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  toPortable,
  buildCanonical,
  buildSelfHosted,
  generateAll,
  CANONICAL_SKILL,
  SELF_HOSTED_SKILL,
  PORTABLE_SKILL,
} from '../../scripts/sync-skill.js';
import { extractSections } from '../../scripts/renderSharedVariant.js';

/**
 * A minimal fixture covering every section title chowa's skeletons pull
 * from the shared template, tagged like the real
 * `templates/chowa-workflow.md` — small enough to read at a glance, but
 * enough to exercise the real splice path without a network call.
 */
const FIXTURE_TEMPLATE = [
  '<!-- variant:shared -->',
  '## Workflow Rules',
  '<!-- variant:end -->',
  '<!-- variant:shared -->',
  '### Specification-Driven Pipeline (Spec → Plan → Execute)',
  '',
  'spec pipeline body',
  '<!-- variant:end -->',
  '<!-- variant:shared -->',
  '### Branching & PR Workflow',
  '',
  'branching body',
  '<!-- variant:end -->',
  '<!-- variant:chowa-only -->',
  '### Commit Workflow & Messages',
  '',
  '```bash',
  'chowa commit',
  '```',
  '<!-- variant:end -->',
  '<!-- variant:shared -->',
  '### Code Quality & Build Verification',
  '',
  'quality body',
  '<!-- variant:end -->',
  '<!-- variant:chowa-only -->',
  '### PR Description Generation',
  '',
  '```bash',
  'chowa pr --base <branch>',
  '```',
  '<!-- variant:end -->',
  '<!-- variant:chowa-only -->',
  '### Delegating Mechanical Sub-Tasks',
  '',
  'run `chowa route --kind',
  'mechanical --complexity low` (the same',
  'profile `chowa commit`/`chowa pr`',
  'already use) then `chowa:chowa-mechanical`.',
  '<!-- variant:end -->',
  '<!-- variant:chowa-skill-only -->',
  '### Delegation Guidance',
  '',
  'dropped for chowa entirely',
  '<!-- variant:end -->',
].join('\n');

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

  describe('buildCanonical / buildSelfHosted', () => {
    const sections = extractSections(
      // Fixture is written already keeping shared+chowa-only (no
      // chowa-skill-only content to strip), so this mirrors what
      // renderVariant(template, ['shared', 'chowa-only']) would return.
      FIXTURE_TEMPLATE.replace(
        /<!-- variant:chowa-skill-only -->[\s\S]*?<!-- variant:end -->\n?/g,
        '',
      ).replace(/<!-- variant:(?:shared|chowa-only) -->\n?([\s\S]*?)<!-- variant:end -->\n?/g, '$1'),
    );

    it('splices rendered sections into the canonical skeleton', () => {
      const canonical = buildCanonical(sections);

      expect(canonical).toContain('spec pipeline body');
      expect(canonical).toContain('branching body');
      expect(canonical).toContain('chowa commit');
      expect(canonical).not.toContain('dropped for chowa entirely');
      // chowa-local content, never part of the template:
      expect(canonical).toContain('### 3. Remote Update Checks');
      expect(canonical).toContain('### 6. Model Routing');
      expect(canonical).toContain('Quota-Aware Session Auto-Resume');
    });

    it('rewrites self-hosted invocations to run from source, not the plugin', () => {
      const selfHosted = buildSelfHosted(sections);

      expect(selfHosted).toContain('bun run src/cli.ts commit');
      expect(selfHosted).not.toMatch(/```bash\nchowa commit\n```/);
      expect(selfHosted).toContain('bun run src/cli.ts pr --base <branch>');
      expect(selfHosted).toContain('bun run src/cli.ts route --kind mechanical --complexity low');
      expect(selfHosted).toContain('`chowa-mechanical`');
      expect(selfHosted).not.toContain('chowa:chowa-mechanical');
      // the self-hosted-only release/main CONFLICTING note survives:
      expect(selfHosted).toContain('routinely come back');
    });

    it('throws when the shared render is missing a section chowa expects', () => {
      const incomplete = new Map(sections);
      incomplete.delete('Commit Workflow & Messages');

      expect(() => buildCanonical(incomplete)).toThrow(/missing expected section/);
    });
  });

  describe('generateAll', () => {
    it('fetches, renders, and splices into all three skill files without touching the network', async () => {
      const fetchTemplate = async () => FIXTURE_TEMPLATE;

      const { canonical, selfHosted, portable } = await generateAll(fetchTemplate);

      expect(canonical).toContain('spec pipeline body');
      expect(selfHosted).toContain('bun run src/cli.ts commit');
      // portable drops the whole delegation region (Claude-Code-only):
      expect(portable).not.toContain('Delegating Mechanical Sub-Tasks');
      expect(portable).not.toContain('chowa-mechanical');
    });

    it('propagates a fetch failure clearly rather than generating partial output', async () => {
      const fetchTemplate = async () => {
        throw new Error('network error: boom');
      };

      await expect(generateAll(fetchTemplate)).rejects.toThrow(/boom/);
    });
  });

  it('SELF_HOSTED_SKILL points at the self-hosted skill path', () => {
    expect(SELF_HOSTED_SKILL).toMatch(/\.claude\/skills\/chowa\/SKILL\.md$/);
  });
});
