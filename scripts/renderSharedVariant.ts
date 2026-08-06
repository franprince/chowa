/**
 * Renders `franprince/chowa-skill`'s shared workflow template for a given
 * set of variants to keep. Mirrors `chowa-skill`'s own
 * `scripts/generate-skill.mjs`: substitutes marked regions in place
 * (rather than extracting and rejoining kept blocks) so the template's own
 * blank-line spacing between blocks survives untouched. Heading numbering
 * is deliberately NOT done here — chowa-skill numbers sequentially since
 * it keeps every section in template order, but chowa interleaves
 * template sections with its own local-only sections in a different
 * order, so only the consumer knows the right numbers.
 */

export type Variant = 'shared' | 'chowa-only' | 'chowa-skill-only';

const ALL_VARIANTS: readonly Variant[] = ['shared', 'chowa-only', 'chowa-skill-only'];

/**
 * Keeps the given variants (markers removed, content preserved in place)
 * and drops every other variant's blocks (markers and content both).
 *
 * Throws on an unrecognized variant tag or an unmatched start/end pair —
 * same fail-loud precedent as `sync-skill.ts`'s `applySwap()`: a template
 * edit that breaks the markers must not silently produce truncated or
 * misrendered output for either consumer.
 */
export function renderVariant(template: string, keep: readonly Variant[]): string {
  assertWellFormed(template);

  const markerIndex = template.indexOf('<!-- variant:');
  const body = markerIndex === -1 ? template : template.slice(markerIndex);
  const keepSet = new Set(keep);

  let result = body;
  for (const variant of ALL_VARIANTS) {
    if (keepSet.has(variant)) continue;
    result = result.replace(blockRegex(variant), '');
  }
  for (const variant of ALL_VARIANTS) {
    if (!keepSet.has(variant)) continue;
    result = result.replace(blockRegex(variant), '$1');
  }

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

function blockRegex(variant: Variant): RegExp {
  return new RegExp(`<!-- variant:${variant} -->\\n?([\\s\\S]*?)<!-- variant:end -->\\n?`, 'g');
}

function assertWellFormed(template: string): void {
  const starts = [...template.matchAll(/<!-- variant:(\S+) -->/g)];
  for (const [, tag] of starts) {
    if (tag !== 'end' && !ALL_VARIANTS.includes(tag as Variant)) {
      throw new Error(`Unrecognized variant tag "${tag}" in the shared template.`);
    }
  }
  const opens = starts.filter(([, tag]) => tag !== 'end').length;
  const closes = (template.match(/<!-- variant:end -->/g) ?? []).length;
  if (opens !== closes) {
    throw new Error(
      `Unmatched variant markers in the shared template: ${opens} start marker(s), ${closes} end marker(s).`,
    );
  }
}

/**
 * Splits a rendered body into its `### Title` sections, keyed by title
 * with the heading line itself stripped — each consumer supplies its own
 * numbered heading around the body it plugs in, since chowa and
 * chowa-skill number and order sections differently.
 */
export function extractSections(rendered: string): ReadonlyMap<string, string> {
  const sections = new Map<string, string>();
  const headingRe = /^### (.+)$/gm;
  const matches = [...rendered.matchAll(headingRe)];

  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][1];
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : rendered.length;
    sections.set(title, rendered.slice(start, end).trim());
  }

  return sections;
}

/**
 * Looks up a section by title, failing loudly if it's missing — a
 * heading rename in the shared template must break the build here, not
 * silently drop content from chowa's generated skill files.
 */
export function requireSection(sections: ReadonlyMap<string, string>, title: string): string {
  const content = sections.get(title);
  if (content === undefined) {
    throw new Error(
      `Shared template render is missing expected section "${title}" — ` +
        `has that heading changed in chowa-skill's templates/chowa-workflow.md?`,
    );
  }
  return content;
}
