/**
 * Skill installation for harnesses without a plugin system
 *
 * Claude Code installs Chōwa as a plugin — `/plugin marketplace add` and
 * `/plugin install` handle everything, and nothing here is involved. Gemini
 * and Antigravity have no equivalent, so they still need a file drop; this
 * is that, made explicit and scoped.
 *
 * Two things this must not regress, both from
 * `specs/2026-08-01-portable-global-skill-sync/`:
 *
 * 1. It runs only when the user asks for it. It used to be called from
 *    `handleCheckUpdate`, so every `commit`/`pr`/`check-update` silently
 *    rewrote two files under the user's home directory.
 * 2. The global rules file it writes must describe what actually holds —
 *    that Chōwa's conventions apply in projects set up for Chōwa — rather
 *    than asserting them as universal truth from a single invocation in a
 *    single project.
 *
 * The skill copied here is the *portable* one (`.agents/skills/chowa/`),
 * never the canonical Claude Code file: that one names
 * `${CLAUDE_PLUGIN_ROOT}`, which a harness with no plugin root would hand
 * to the model as a literal string.
 */

import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

// ---------------------------------------------------------------------------
// Supported targets
// ---------------------------------------------------------------------------

export interface AgentTarget {
  /** Directory under the user's home where this harness reads global config. */
  readonly configDir: readonly string[];
  /** Human-readable name for messages. */
  readonly label: string;
}

export const AGENT_TARGETS: Readonly<Record<string, AgentTarget>> = {
  gemini: { configDir: ['.gemini', 'config'], label: 'Gemini' },
};

export const SUPPORTED_AGENTS = Object.keys(AGENT_TARGETS);

export class UnknownAgentError extends Error {
  constructor(agent: string) {
    super(
      `Unknown agent "${agent}". Supported: ${SUPPORTED_AGENTS.join(', ')}. ` +
        `Claude Code doesn't use this command — install the plugin instead: ` +
        `/plugin marketplace add franprince/chowa`,
    );
    this.name = 'UnknownAgentError';
  }
}

export class SkillSourceNotFoundError extends Error {
  constructor(searched: readonly string[]) {
    super(
      `Could not find the portable skill (.agents/skills/chowa/SKILL.md). ` +
        `Searched upward from: ${searched.join(', ')}. ` +
        `This command needs a checkout of Chōwa's repository — the Claude Code ` +
        `plugin ships only the Claude Code skill.`,
    );
    this.name = 'SkillSourceNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export const PORTABLE_SKILL_RELATIVE = join('.agents', 'skills', 'chowa', 'SKILL.md');

/**
 * Walk up from each starting directory looking for the portable skill.
 *
 * Searching upward rather than from `cwd` alone means this works whether the
 * CLI was started from `src/cli.ts`, from the `tsc` output in `dist/`, or
 * from a subdirectory of the repo.
 */
export function resolvePortableSkillPath(
  startDirs: readonly string[],
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  for (const start of startDirs) {
    let current = start;
    for (;;) {
      const candidate = join(current, PORTABLE_SKILL_RELATIVE);
      if (exists(candidate)) return candidate;

      const parent = dirname(current);
      if (parent === current || parent === parse(current).root) break;
      current = parent;
    }
  }
  return undefined;
}

/**
 * Contents of the harness-level rules file.
 *
 * Deliberately conditional. An earlier version asserted that Chōwa's
 * conventions applied "across all projects" on the strength of one
 * invocation, which is how self-dev-only instructions ended up being recited
 * at an unrelated project.
 */
export function globalRulesContent(): string {
  return `# Global Chōwa Workspace Rules

- These conventions apply **only** in projects set up for Chōwa: Chōwa's own
  source, a project with a \`chowa.config.ts\`, \`chowa.config.js\`, or
  \`chowa.config.mjs\` at its root, \`chowa\` listed as a project dependency,
  an existing \`specs/INDEX.md\` following Chōwa's spec convention, or (for
  every project you personally work in) \`chowa always-on on\`. In any
  other project, follow that
  project's own conventions instead — do not apply the rules below.
- In a Chōwa project, use the \`chowa\` skill for branching, commit, PR,
  routing, and quality conventions.
- Never push directly to \`main\` or \`master\`. Work on dedicated branches
  and ask before creating PRs.
`;
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export interface InstallPaths {
  readonly skillSource: string;
  readonly skillDestination: string;
  readonly rulesDestination: string;
}

/**
 * Work out every path an install would touch, without touching any of them.
 * Kept separate from the filesystem writes so the decisions are testable and
 * so a caller can show the user what will change.
 */
export function planInstall(
  agent: string,
  homeDir: string,
  startDirs: readonly string[],
  exists: (path: string) => boolean = existsSync,
): InstallPaths {
  const target = AGENT_TARGETS[agent];
  if (!target) throw new UnknownAgentError(agent);

  const skillSource = resolvePortableSkillPath(startDirs, exists);
  if (!skillSource) throw new SkillSourceNotFoundError(startDirs);

  const configDir = join(homeDir, ...target.configDir);

  return {
    skillSource,
    skillDestination: join(configDir, 'skills', 'chowa', 'SKILL.md'),
    rulesDestination: join(configDir, 'AGENTS.md'),
  };
}
