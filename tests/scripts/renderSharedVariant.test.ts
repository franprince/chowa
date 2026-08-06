import { describe, it, expect } from 'vitest';

import { renderVariant, extractSections, requireSection } from '../../scripts/renderSharedVariant.js';

describe('renderSharedVariant', () => {
  describe('renderVariant', () => {
    it('keeps shared and chowa-only blocks, drops chowa-skill-only', () => {
      const template = [
        '<!-- variant:shared -->',
        'shared line',
        '<!-- variant:end -->',
        '<!-- variant:chowa-only -->',
        'chowa-only line',
        '<!-- variant:end -->',
        '<!-- variant:chowa-skill-only -->',
        'chowa-skill-only line',
        '<!-- variant:end -->',
      ].join('\n');

      const rendered = renderVariant(template, ['shared', 'chowa-only']);

      expect(rendered).toContain('shared line');
      expect(rendered).toContain('chowa-only line');
      expect(rendered).not.toContain('chowa-skill-only line');
    });

    it('keeps shared and chowa-skill-only blocks, drops chowa-only', () => {
      const template = [
        '<!-- variant:shared -->',
        'shared line',
        '<!-- variant:end -->',
        '<!-- variant:chowa-only -->',
        'chowa-only line',
        '<!-- variant:end -->',
        '<!-- variant:chowa-skill-only -->',
        'chowa-skill-only line',
        '<!-- variant:end -->',
      ].join('\n');

      const rendered = renderVariant(template, ['shared', 'chowa-skill-only']);

      expect(rendered).toContain('shared line');
      expect(rendered).toContain('chowa-skill-only line');
      expect(rendered).not.toContain('chowa-only line');
    });

    it('keeps shared-only when only shared is requested', () => {
      const template = [
        '<!-- variant:shared -->',
        'shared line',
        '<!-- variant:end -->',
        '<!-- variant:chowa-only -->',
        'chowa-only line',
        '<!-- variant:end -->',
      ].join('\n');

      const rendered = renderVariant(template, ['shared']);

      expect(rendered).toBe('shared line');
    });

    it('preserves in-place spacing rather than rejoining kept blocks', () => {
      const template = [
        '<!-- variant:shared -->',
        'first paragraph',
        '<!-- variant:end -->',
        '<!-- variant:chowa-only -->',
        'dropped paragraph',
        '<!-- variant:end -->',
        '<!-- variant:shared -->',
        'second paragraph',
        '<!-- variant:end -->',
      ].join('\n');

      const rendered = renderVariant(template, ['shared']);

      expect(rendered).toBe('first paragraph\nsecond paragraph');
    });

    it('drops any content before the first variant marker (the template\'s own leading doc comment)', () => {
      const template = [
        '<!-- a maintainer-facing explanatory comment, not tagged content -->',
        '<!-- variant:shared -->',
        'kept content',
        '<!-- variant:end -->',
      ].join('\n');

      const rendered = renderVariant(template, ['shared']);

      expect(rendered).toBe('kept content');
      expect(rendered).not.toContain('maintainer-facing');
    });

    it('throws on an unrecognized variant tag', () => {
      const template = '<!-- variant:bogus -->\nx\n<!-- variant:end -->';

      expect(() => renderVariant(template, ['shared'])).toThrow(/Unrecognized variant tag/);
    });

    it('throws on unmatched variant markers', () => {
      const template = '<!-- variant:shared -->\nx\n<!-- variant:shared -->\ny\n<!-- variant:end -->';

      expect(() => renderVariant(template, ['shared'])).toThrow(/Unmatched variant markers/);
    });
  });

  describe('extractSections', () => {
    it('splits a rendered body into titled sections, heading line stripped', () => {
      const rendered = [
        '## Workflow Rules',
        '',
        '### First Section',
        '',
        'first body',
        '',
        '### Second Section',
        '',
        'second body',
      ].join('\n');

      const sections = extractSections(rendered);

      expect(sections.get('First Section')).toBe('first body');
      expect(sections.get('Second Section')).toBe('second body');
    });

    it('returns an empty map when there are no ### headings', () => {
      const sections = extractSections('just prose, no headings');

      expect(sections.size).toBe(0);
    });
  });

  describe('requireSection', () => {
    it('returns the section content when present', () => {
      const sections = new Map([['Title', 'body']]);

      expect(requireSection(sections, 'Title')).toBe('body');
    });

    it('throws a clear error when the section is missing', () => {
      const sections = new Map([['Other Title', 'body']]);

      expect(() => requireSection(sections, 'Missing Title')).toThrow(/missing expected section "Missing Title"/);
    });
  });
});
