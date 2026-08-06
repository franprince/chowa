#!/usr/bin/env bun
/**
 * Skill sync
 *
 * All three of chowa's skill files are generated:
 *
 * 1. Fetch `franprince/chowa-skill`'s shared workflow template (pinned to
 *    a commit SHA — see `fetchSharedTemplate.ts`) and render it keeping
 *    `shared` + `chowa-only` blocks, dropping `chowa-skill-only` ones.
 * 2. Splice the rendered sections into chowa's own document skeleton —
 *    the frontmatter, Step 0's chowa-specific signal list, and the fully
 *    chowa-only whole sections (Remote Update Checks, Model Routing,
 *    Subagent-Driven Development, Quota-Aware Session Auto-Resume, CLI
 *    Reference, and self-hosted's own Claude Code Bridge section) are
 *    chowa-local content that was never part of the shared template.
 * 3. `plugins/chowa/skills/chowa/SKILL.md` (canonical) and
 *    `.claude/skills/chowa/SKILL.md` (self-hosted) are both built this
 *    way, from the same rendered sections plugged into two different
 *    skeletons.
 * 4. `.agents/skills/chowa/SKILL.md` (portable) is then generated from
 *    the canonical text exactly as before: the invocation, mechanical
 *    sub-task delegation, subagent-driven-development, and quota-aware
 *    auto-resume regions are Claude-Code-specific and get swapped or
 *    dropped — none has a Gemini/Antigravity equivalent.
 *
 * Rather than maintain these by hand and let them drift — the failure
 * this whole distribution effort (and, upstream of it, the cross-repo
 * template) exists to fix — CI regenerates and diffs all three, so an
 * edit that isn't synced (here or in chowa-skill's own template) fails
 * the build.
 *
 * Usage:
 *   bun run scripts/sync-skill.ts          # write all three skill files
 *   bun run scripts/sync-skill.ts --check  # exit 1 if any would change
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { fetchSharedTemplate } from './fetchSharedTemplate.js';
import { renderVariant, extractSections, requireSection } from './renderSharedVariant.js';

const repoRoot = resolve(import.meta.dirname, '..');

export const CANONICAL_SKILL = join(repoRoot, 'plugins/chowa/skills/chowa/SKILL.md');
export const SELF_HOSTED_SKILL = join(repoRoot, '.claude/skills/chowa/SKILL.md');
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
    label: 'sdd',
    start: '<!-- chowa:sdd:start -->',
    end: '<!-- chowa:sdd:end -->',
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

/** Builds `plugins/chowa/skills/chowa/SKILL.md` from the rendered shared sections. */
export function buildCanonical(sections: ReadonlyMap<string, string>): string {
  const s = (title: string) => requireSection(sections, title);

  return `---
name: chowa
description: >
  Chōwa coding harness skill — spec-driven pipeline (spec → plan → execute),
  git branching, commit workflows, PR creation, code quality verification,
  and model routing. Detects whether the current project is Chōwa's own
  source, a project that opts into Chōwa's conventions, or an unrelated
  project, and adapts its instructions accordingly.
---

# Chōwa Skill

Chōwa is a coding harness: a spec → plan → execute pipeline, atomic-commit
enforcement, and model routing. This skill's job is to apply Chōwa's
conventions when the current project actually uses Chōwa — never to recite
Chōwa's own internal dev workflow at a project that doesn't.

That distinction matters more, not less, now that Chōwa ships as a plugin:
a plugin installed at user scope loads in **every** project, including ones
that have never heard of Chōwa. Installing the plugin says "I want Chōwa
available", not "impose this workflow everywhere". Step 0 is what keeps
those apart.

## Step 0: Detect which project this is

Check the current working directory — and your own persistent preference —
before following anything below:

1. **Self-repo (dogfooding)** — \`package.json\` has \`"name": "chowa"\`, and
   \`src/cli.ts\` exists. This is Chōwa's own source; run its CLI from source.
2. **Chōwa project** — any of the following holds:
   - a \`chowa.config.ts\`, \`chowa.config.js\`, or \`chowa.config.mjs\` exists at
     the project root;
   - \`chowa\` is listed in \`dependencies\` or \`devDependencies\` of the
     project's \`package.json\`;
   - \`specs/INDEX.md\` exists at the project root — the project already
     follows Chōwa's own spec → plan → execute convention by hand;
   - the user explicitly asks, in this conversation, to use Chōwa's
     conventions here — apply Mode 2 for the rest of the session, and
     mention once that \`chowa init\` would make it persist across sessions;
   - you have a personal always-on preference set: run \`chowa always-on\`
     with no argument to check. If enabled, treat *every* project as
     Mode 2, regardless of the project-level signals above — routing falls
     back to the built-in default policy in projects with no config of
     their own.
   The project has opted in, via any one of the above.
3. **Unrelated project** — none of the above. Say that plainly, **once per
   session, not on every subsequent turn** — then offer, a single time, to
   set the project up: \`chowa init\` (scaffolds a \`chowa.config.js\` for this
   project only) or \`chowa always-on on\` (applies Chōwa's workflow to every
   project you personally work in, from now on). If the user declines or
   doesn't respond, defer to the project's own conventions
   (\`CONTRIBUTING.md\`, \`.agents/workflows/*.md\`, or the commit style
   already visible in \`git log\`) for the rest of the session — don't ask
   again, and don't apply the workflow rules below as if they were in
   force.

Absent an onboarding acceptance, Mode 3 is still a stop, not a fallback. A
user working in an unrelated project who declines onboarding should not
have Chōwa's branching rules, spec pipeline, or commit conventions applied
to their work because a plugin happened to be installed globally.

### Running the CLI

\`chowa <command>\` throughout this document means the invocation for the
detected mode:

<!-- chowa:invocation:start -->
| Mode | Invocation |
|---|---|
| 1 — self-repo | \`bun run src/cli.ts <command>\` |
| 2 — Chōwa project | \`node "\${CLAUDE_PLUGIN_ROOT}/dist/cli.js" <command>\` |

Prefer \`bun "\${CLAUDE_PLUGIN_ROOT}/dist/cli.js"\` when \`bun\` is on \`PATH\`:
it reads a \`chowa.config.ts\` natively, whereas \`node\` needs >= 22.18 for
that (a \`chowa.config.js\` works on any version). If neither \`bun\` nor
\`node\` is available, say so and stop rather than guessing.
<!-- chowa:invocation:end -->

## Workflow Rules (modes 1 and 2 only)

### 1. Specification-Driven Pipeline (Spec → Plan → Execute)

${s('Specification-Driven Pipeline (Spec → Plan → Execute)')}

### 2. Branching & PR Workflow

${s('Branching & PR Workflow')}

### 3. Remote Update Checks

Before starting work or committing, check the local branch is up to date:

\`\`\`bash
chowa check-update
\`\`\`

### 4. Commit Workflow & Messages

${s('Commit Workflow & Messages')}

### 5. Code Quality & Build Verification

${s('Code Quality & Build Verification')}

### 6. Model Routing

\`\`\`bash
chowa route --kind <type> --complexity <level>
\`\`\`

- Kinds: \`mechanical\`, \`refactor\`, \`architecture\`, \`security\`, \`debug\`
- Complexity: \`low\`, \`medium\`, \`high\`

### 7. PR Description Generation

${s('PR Description Generation')}

<!-- chowa:delegation:start -->
### 8. Delegating Mechanical Sub-Tasks

${s('Delegating Mechanical Sub-Tasks')}
<!-- chowa:delegation:end -->

<!-- chowa:sdd:start -->
### 9. Executing Plans via Subagent-Driven Development

For an approved implementation plan with several mostly-independent tasks,
prefer executing Stage 3 through the \`superpowers:subagent-driven-development\`
skill, when the \`superpowers\` plugin is installed, rather than implementing
every task inline in this session: a fresh implementer subagent per task, a
review gate after each, and one whole-branch review at the end. Load it
explicitly (\`Skill\` tool, \`superpowers:subagent-driven-development\`) once
the plan is approved and you're ready to begin Stage 3.

This isn't a fit for every plan. Skip it — implement inline as before —
when tasks are tightly coupled (that skill's own guidance routes tightly
coupled work back to manual execution), the plan is small enough that
per-task subagent dispatch overhead isn't worth it, or the \`superpowers\`
plugin isn't installed. When it does fit, that skill's own ledger and
review-loop process takes over from here; this skill's spec → plan →
execute pipeline stays the outer frame — the plan it executes is still the
one written and approved under §1.
<!-- chowa:sdd:end -->

<!-- chowa:autoresume:start -->
### 10. Quota-Aware Session Auto-Resume

Chōwa tracks every session's lifecycle automatically via \`SessionStart\`/
\`StopFailure\` hooks — there is nothing for you to invoke. When a session
ends specifically because of a rate limit, it's stamped in a local ledger
(\`~/.chowa/sessions.json\`) with the window that blocked it and when that
window resets; a periodic sweep then resumes eligible sessions once quota
is back. This is transparent background bookkeeping — don't reference or
hand-edit the ledger file, and don't mention it to the user unless they
ask about it.
<!-- chowa:autoresume:end -->

## Chōwa CLI Reference

| Command | Description |
|---------|-------------|
| \`chowa check-update\` | Check if local branch is behind remote |
| \`chowa commit\` | Scan diff, split into atomic clusters |
| \`chowa route --kind <k> --complexity <c>\` | Resolve task to model |
| \`chowa pr --base <branch>\` | Generate PR description |
| \`chowa init\` | Scaffold a \`chowa.config.js\` for this project |
| \`chowa always-on [on\\|off]\` | Apply (or stop applying) Chōwa's workflow to every project, regardless of per-project signals; no argument checks current status |
| \`chowa install --agent <harness>\` | Install this skill for a harness without a plugin system (e.g. \`gemini\`) |
| \`chowa abandon [--reason <text>]\` | Stop tracking the current branch's session for auto-resume |
| \`chowa ledger status\` | List tracked sessions and their auto-resume state |
| \`chowa ledger sweep\` | Resume any sessions whose blocking quota window has reset (what the installed timer calls) |
| \`chowa ledger install\` | Install the systemd user timer that runs \`ledger sweep\` on a schedule (Linux only) |

Chōwa reads its routing policy from \`chowa.config.ts\`, \`chowa.config.js\`, or
\`chowa.config.mjs\` at the project root, falling back to a built-in default
when none exists. An explicit \`--config <path>\` that doesn't exist fails
loudly rather than falling back.

(Self-repo mode only, Chōwa's own internal build: \`bun run verify\`, or
\`bun test\` / \`bun run check:imports\` / \`bun run build\` / \`bun run lint\`
individually. \`bun run build:plugin\` rebuilds the bundled engine this
plugin ships — required on \`release/*\` branches, never committed on
\`develop\` or feature branches.)
`;
}

/**
 * The shared template's `chowa-only` content is written from canonical's
 * perspective (the `chowa <command>` plugin invocation, the
 * `chowa:chowa-mechanical` namespaced subagent). Self-hosted mode runs
 * from source instead, so the handful of sections that embed a literal
 * invocation need those swapped for their self-hosted equivalents — but
 * only the actual invocation instructions, not the bare `chowa commit`/
 * `chowa pr` shorthand this same content also uses as a plain reference
 * elsewhere in prose.
 */
function forSelfHosted(text: string): string {
  return text
    .replace(/```bash\nchowa commit\n```/, '```bash\nbun run src/cli.ts commit\n```')
    .replace(
      /```bash\nchowa pr --base <branch>\n```/,
      '```bash\nbun run src/cli.ts pr --base <branch>\n```',
    )
    .replace(
      /run `chowa route --kind\s+mechanical --complexity low` \(the same\s+profile\s+`chowa commit`\/`chowa pr`\s+already use\)/,
      'run `bun run src/cli.ts route --kind mechanical --complexity low` (the\nsame profile `chowa commit`/`chowa pr` already use)',
    )
    .replace('`chowa:chowa-mechanical`', '`chowa-mechanical`');
}

/** Builds `.claude/skills/chowa/SKILL.md` from the rendered shared sections. */
export function buildSelfHosted(sections: ReadonlyMap<string, string>): string {
  const s = (title: string) => forSelfHosted(requireSection(sections, title));

  return `---
name: chowa
description: >
  Chōwa coding harness skill — mandatory guidelines for spec-driven pipeline
  (spec → plan → execute), git branching, commit workflows, PR creation,
  code quality verification, architecture boundaries, and model routing.
  This repo is Chōwa's own source (dogfooding) — Claude Code should follow
  these conventions when making any non-trivial change here.
---

# Chōwa Skill (Self-Hosted, Claude Code)

Chōwa is installed in this workspace and is used to develop itself (dogfooding).
This is the Claude Code variant of \`.agents/skills/chowa/SKILL.md\`, wired up
through the \`ClaudeCodeBridge\` (\`src/integrations/claude-code/bridge.ts\`) and
the \`chowa claude-code-bridge\` CLI command.

> **This file is not the distributed skill.** It is project-local to Chōwa's
> own source and governs work in *this* repository only, which is why it can
> assume self-repo mode throughout. The skill users install lives at
> \`plugins/chowa/skills/chowa/SKILL.md\` and is the canonical one;
> \`.agents/skills/chowa/SKILL.md\` is generated from it by
> \`bun run sync:skill\`. Workflow changes meant for users belong in the
> canonical file, not here.

## Workflow Rules

When making changes to this codebase, **always follow these conventions**:

### 1. Specification-Driven Pipeline (Spec → Plan → Execute)

${s('Specification-Driven Pipeline (Spec → Plan → Execute)')}

### 2. Branching & PR Workflow

${s('Branching & PR Workflow')}

**\`release/*\` → \`main\` PRs in this repo routinely come back
\`CONFLICTING\`**: \`develop\` never carries \`plugins/chowa/dist/\` (see the CI
\`no-bundle-off-main\` job), so each release branch's own version bump and
freshly-built bundle collide with whatever \`main\` already has from the
*previous* release — every release branch from v0.2.1 through v0.5.0
needed this same fixup. Expect it, don't debug it as a surprise: \`git
merge origin/main\`, keep your branch's version number, rebuild
\`plugins/chowa/dist/\` fresh from the merged source (don't just pick one
side), then re-run \`bun run verify\` before pushing again.

### 3. Remote Update Checks

Before starting work or committing, check the local branch is up to date:

\`\`\`bash
bun run src/cli.ts check-update
\`\`\`

### 4. Commit Workflow & Messages

${s('Commit Workflow & Messages')}

### 5. Code Quality & Build Verification

${s('Code Quality & Build Verification')}

### 6. Model Routing

\`\`\`bash
bun run src/cli.ts route --kind <type> --complexity <level>
\`\`\`

- Kinds: \`mechanical\`, \`refactor\`, \`architecture\`, \`security\`, \`debug\`
- Complexity: \`low\`, \`medium\`, \`high\`

### 7. PR Description Generation

${s('PR Description Generation')}

### 8. Claude Code Bridge

For structured, non-interactive access to the same functionality (used by
tooling rather than a human at a terminal), pipe a JSON request into:

\`\`\`bash
bun run src/cli.ts claude-code-bridge
\`\`\`

Accepts \`{ action: 'call' | 'commit' | 'pr' | 'route' | 'models', ... }\` on
stdin and returns a \`ClaudeCodeResponse\` on stdout. See
\`src/integrations/claude-code/bridge.ts\` for the request/response shapes.

### 9. Delegating Mechanical Sub-Tasks

${s('Delegating Mechanical Sub-Tasks')}

### 10. Executing Plans via Subagent-Driven Development

For an approved implementation plan with several mostly-independent tasks,
prefer executing Stage 3 through the \`superpowers:subagent-driven-development\`
skill, when the \`superpowers\` plugin is installed, rather than implementing
every task inline in this session: a fresh implementer subagent per task, a
review gate after each, and one whole-branch review at the end. Load it
explicitly (\`Skill\` tool, \`superpowers:subagent-driven-development\`) once
the plan is approved and you're ready to begin Stage 3.

This isn't a fit for every plan. Skip it — implement inline as before —
when tasks are tightly coupled (that skill's own guidance routes tightly
coupled work back to manual execution), the plan is small enough that
per-task subagent dispatch overhead isn't worth it, or the \`superpowers\`
plugin isn't installed. When it does fit, that skill's own ledger and
review-loop process takes over from here; this skill's spec → plan →
execute pipeline stays the outer frame — the plan it executes is still the
one written and approved under §1.

### 11. Quota-Aware Session Auto-Resume

Chōwa tracks every session's lifecycle automatically via \`SessionStart\`/
\`StopFailure\` hooks — there is nothing for you to invoke. When a session
ends specifically because of a rate limit, it's stamped in a local ledger
(\`~/.chowa/sessions.json\`) with the window that blocked it and when that
window resets; a periodic sweep then resumes eligible sessions once quota
is back. This is transparent background bookkeeping — don't reference or
hand-edit the ledger file, and don't mention it to the user unless they
ask about it.

## Chōwa CLI Reference

| Command | Description |
|---------|-------------|
| \`bun run src/cli.ts check-update\` | Check if local branch is behind remote |
| \`bun run src/cli.ts commit\` | Scan diff, split into atomic clusters |
| \`bun run src/cli.ts route --kind <k> --complexity <c>\` | Resolve task to model |
| \`bun run src/cli.ts pr --base <branch>\` | Generate PR description |
| \`bun run src/cli.ts claude-code-bridge\` | JSON-in/JSON-out bridge for tooling |
| \`bun run src/cli.ts abandon [--reason <text>]\` | Stop tracking the current branch's session for auto-resume |
| \`bun run src/cli.ts ledger status\` | List tracked sessions and their auto-resume state |
| \`bun run src/cli.ts ledger sweep\` | Resume any sessions whose blocking quota window has reset |
| \`bun run src/cli.ts ledger install\` | Install the systemd user timer that runs \`ledger sweep\` on a schedule (Linux only) |
| \`bun run check:imports\` | Verify dependency boundaries |
| \`bun test\` | Run full test suite |
| \`bun run build\` | Compile TypeScript cleanly |
`;
}

interface GeneratedSkills {
  readonly canonical: string;
  readonly selfHosted: string;
  readonly portable: string;
}

export async function generateAll(
  fetchTemplate: () => Promise<string> = fetchSharedTemplate,
): Promise<GeneratedSkills> {
  const template = await fetchTemplate();
  const rendered = renderVariant(template, ['shared', 'chowa-only']);
  const sections = extractSections(rendered);

  const canonical = buildCanonical(sections);
  const selfHosted = buildSelfHosted(sections);
  const portable = toPortable(canonical);

  return { canonical, selfHosted, portable };
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const { canonical, selfHosted, portable } = await generateAll();

  const targets: readonly [label: string, path: string, content: string][] = [
    ['canonical', CANONICAL_SKILL, canonical],
    ['self-hosted', SELF_HOSTED_SKILL, selfHosted],
    ['portable', PORTABLE_SKILL, portable],
  ];

  if (checkOnly) {
    let outOfSync = false;
    for (const [label, path, content] of targets) {
      const current = readFileSync(path, 'utf-8');
      if (current !== content) {
        console.error(`❌ ${path} (${label}) is out of date with the generated content.`);
        outOfSync = true;
      }
    }
    if (outOfSync) {
      console.error('   Run: bun run sync:skill');
      process.exit(1);
    }
    console.log('✅ All three skill files are in sync with the shared template.');
    return;
  }

  for (const [label, path, content] of targets) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf-8');
    console.log(`✅ Wrote ${path} (${label}).`);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
