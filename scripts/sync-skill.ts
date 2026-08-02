#!/usr/bin/env bun
/**
 * Skill sync
 *
 * `plugins/chowa/skills/chowa/SKILL.md` is the canonical skill. Harnesses
 * without a plugin system (Gemini, Antigravity) read
 * `.agents/skills/chowa/SKILL.md` instead, which must say the same thing
 * with one exception: the invocation section, which is Claude-Code-specific
 * because it names `${CLAUDE_PLUGIN_ROOT}`.
 *
 * Rather than maintain two documents and let them drift — the failure this
 * whole distribution effort exists to fix — the portable copy is generated
 * from the canonical one, with only the marked invocation region swapped.
 * CI regenerates and diffs, so an edit to the canonical file that isn't
 * synced fails the build.
 *
 * Usage:
 *   bun run scripts/sync-skill.ts          # write .agents/skills/chowa/SKILL.md
 *   bun run scripts/sync-skill.ts --check  # exit 1 if it would change
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

export const CANONICAL_SKILL = join(repoRoot, 'plugins/chowa/skills/chowa/SKILL.md');
export const PORTABLE_SKILL = join(repoRoot, '.agents/skills/chowa/SKILL.md');

const START_MARKER = '<!-- chowa:invocation:start -->';
const END_MARKER = '<!-- chowa:invocation:end -->';

/**
 * The invocation section for harnesses that have no plugin root to resolve.
 * Mode numbering matches the canonical file's Step 0.
 */
const PORTABLE_INVOCATION = `| Mode | Invocation |
|---|---|
| 1 — self-repo | \`bun run src/cli.ts <command>\` |
| 2 — Chōwa project | \`chowa <command>\` |

In mode 2, \`chowa\` is whatever this harness was given when the skill was
installed — typically the bundled engine at
\`~/.gemini/config/skills/chowa/dist/cli.js\`, run with \`bun\` when it is on
\`PATH\` and \`node\` otherwise. \`bun\` reads a \`chowa.config.ts\` natively;
\`node\` needs >= 22.18 for that, though a \`chowa.config.js\` works on any
version. If neither runtime is available, say so and stop rather than
guessing.`;

/**
 * Swap the marked invocation region for the portable one.
 *
 * Throws rather than silently passing the canonical text through if the
 * markers are missing — a rename that loses them would otherwise ship
 * `${CLAUDE_PLUGIN_ROOT}` instructions to a harness that cannot resolve it.
 */
export function toPortable(canonical: string): string {
  const start = canonical.indexOf(START_MARKER);
  const end = canonical.indexOf(END_MARKER);

  if (start === -1 || end === -1) {
    throw new Error(
      `Canonical skill is missing the ${START_MARKER} / ${END_MARKER} markers — ` +
        `cannot generate the portable copy without knowing which region is ` +
        `Claude-Code-specific.`,
    );
  }
  if (end < start) {
    throw new Error(`Canonical skill has ${END_MARKER} before ${START_MARKER}.`);
  }

  const head = canonical.slice(0, start);
  const tail = canonical.slice(end + END_MARKER.length);

  return `${head}${PORTABLE_INVOCATION}${tail}`;
}

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const canonical = readFileSync(CANONICAL_SKILL, 'utf-8');
  const portable = toPortable(canonical);

  if (checkOnly) {
    const current = readFileSync(PORTABLE_SKILL, 'utf-8');
    if (current !== portable) {
      console.error(
        `❌ ${PORTABLE_SKILL} is out of date with the canonical skill.\n` +
          `   Run: bun run sync:skill`,
      );
      process.exit(1);
    }
    console.log('✅ Portable skill is in sync with the canonical skill.');
    return;
  }

  mkdirSync(dirname(PORTABLE_SKILL), { recursive: true });
  writeFileSync(PORTABLE_SKILL, portable, 'utf-8');
  console.log(`✅ Wrote ${PORTABLE_SKILL} from the canonical skill.`);
}

if (import.meta.main) {
  main();
}
