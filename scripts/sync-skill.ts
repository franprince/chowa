#!/usr/bin/env bun
/**
 * Skill sync
 *
 * `plugins/chowa/skills/chowa/SKILL.md` is the canonical skill. Harnesses
 * without a plugin system (Gemini, Antigravity) read
 * `.agents/skills/chowa/SKILL.md` instead, which must say the same thing
 * with three exceptions, each Claude-Code-specific and marked accordingly:
 * the invocation section (names `${CLAUDE_PLUGIN_ROOT}`), the mechanical
 * sub-task delegation section (names the `Agent` tool and a subagent), and
 * the quota-aware auto-resume section (names the `SessionStart`/
 * `StopFailure` hooks) — none has a Gemini/Antigravity equivalent.
 *
 * Rather than maintain two documents and let them drift — the failure this
 * whole distribution effort exists to fix — the portable copy is generated
 * from the canonical one, with only the marked regions swapped. CI
 * regenerates and diffs, so an edit to the canonical file that isn't synced
 * fails the build.
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

interface RegionSwap {
  /** Used only in error messages, to say which region is missing/inverted. */
  readonly label: string;
  readonly start: string;
  readonly end: string;
  /** Replacement text for the portable copy; '' removes the region entirely. */
  readonly replacement: string;
}

const REGION_SWAPS: readonly RegionSwap[] = [
  {
    label: 'invocation',
    start: '<!-- chowa:invocation:start -->',
    end: '<!-- chowa:invocation:end -->',
    replacement: PORTABLE_INVOCATION,
  },
  {
    label: 'delegation',
    start: '<!-- chowa:delegation:start -->',
    end: '<!-- chowa:delegation:end -->',
    // No Agent-tool/subagent equivalent on Gemini/Antigravity — omit the
    // section entirely rather than ship a dangling half-instruction.
    replacement: '',
  },
  {
    label: 'autoresume',
    start: '<!-- chowa:autoresume:start -->',
    end: '<!-- chowa:autoresume:end -->',
    // No hooks.json equivalent on Gemini/Antigravity — omit entirely.
    replacement: '',
  },
];

/**
 * Swap every marked region for its portable equivalent, in order.
 *
 * Throws rather than silently passing the canonical text through if a
 * region's markers are missing — a rename that loses them would otherwise
 * ship Claude-Code-only instructions to a harness that can't act on them.
 */
export function toPortable(canonical: string): string {
  const swapped = REGION_SWAPS.reduce((text, swap) => applySwap(text, swap), canonical);
  // An empty-replacement swap leaves the blank line on each side of the
  // stripped markers intact; two such regions back-to-back (delegation
  // immediately followed by autoresume) stack those into a visible run of
  // blank lines. Collapsing 3+ consecutive newlines to a single blank line
  // is safe here — nothing in this file relies on more than one.
  return swapped.replace(/\n{3,}/g, '\n\n');
}

function applySwap(text: string, swap: RegionSwap): string {
  const start = text.indexOf(swap.start);
  const end = text.indexOf(swap.end);

  if (start === -1 || end === -1) {
    throw new Error(
      `Canonical skill is missing the ${swap.label} region markers ` +
        `(${swap.start} / ${swap.end}) — cannot generate the portable copy ` +
        `without knowing which region is Claude-Code-specific.`,
    );
  }
  if (end < start) {
    throw new Error(
      `Canonical skill has ${swap.label}'s end marker before its start marker.`,
    );
  }

  return text.slice(0, start) + swap.replacement + text.slice(end + swap.end.length);
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
