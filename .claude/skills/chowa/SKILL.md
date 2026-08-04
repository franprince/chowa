---
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
This is the Claude Code variant of `.agents/skills/chowa/SKILL.md`, wired up
through the `ClaudeCodeBridge` (`src/integrations/claude-code/bridge.ts`) and
the `chowa claude-code-bridge` CLI command.

> **This file is not the distributed skill.** It is project-local to Chōwa's
> own source and governs work in *this* repository only, which is why it can
> assume self-repo mode throughout. The skill users install lives at
> `plugins/chowa/skills/chowa/SKILL.md` and is the canonical one;
> `.agents/skills/chowa/SKILL.md` is generated from it by
> `bun run sync:skill`. Workflow changes meant for users belong in the
> canonical file, not here.

## Workflow Rules

When making changes to this codebase, **always follow these conventions**:

### 1. Specification-Driven Pipeline (Spec → Plan → Execute)

For all feature requests and non-trivial changes, always follow this 3-stage lifecycle:

1. **Stage 1: Specification (`spec.md`)** — problem statement, goals, non-goals,
   affected interfaces, edge cases, acceptance criteria. Get explicit user
   approval before Stage 2.
2. **Stage 2: Implementation Plan (`implementation_plan.md`)** — files to
   modify/create, component boundaries, test plan. Get explicit user approval
   before writing code.
3. **Persistence** — write both files to `specs/<YYYY-MM-DD>-<slug>/`, never
   as loose root-level files, and add a row to `specs/INDEX.md`. Root-level
   `spec.md`/`implementation_plan.md` get overwritten by the next feature's
   docs with no record of what was approved — that's how intent drifts
   across iterations. See `specs/INDEX.md` for the exact convention and
   status values.
3. **Stage 3: Execution & Verification** — implement the approved plan
   (code + tests), then verify with `bun test`, `bun run check:imports`, and
   `bun run build`. Ask the user before opening a PR.

### 2. Branching & PR Workflow

- Always create a new branch for features/fixes/tasks — never work or push
  directly on `main` or `master`.
- **Branch flow** (unless the user explicitly says otherwise):
  - `fix/*`, `feat/*`, `docs/*`, `chore/*` etc. branch from `develop`, PR
    **against `develop`**.
  - `release/*` and `hotfix/*` branch from `develop` (a `hotfix/*` may branch
    from `main` when patching a live incident) and PR **from there to
    `main`**.
  - Never PR or push directly to `main`/`master` outside of a `release/*` or
    `hotfix/*` branch.
- Always create a PR against the target base branch; ask the user first.

### 3. Remote Update Checks

Before starting work or committing, check the local branch is up to date:

```bash
bun run src/cli.ts check-update
```

### 4. Commit Workflow & Messages

```bash
bun run src/cli.ts commit
```

If Chōwa reports multiple clusters, commit each cluster separately. Commits
must follow Conventional Commits: `type(scope): concise imperative description`.

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`, `style`, `revert`
- Scopes: `core`, `adapters`, `router`, `git`, `cli`, `integrations`

### 5. Code Quality & Build Verification

Before committing: `bun test`, `bun run check:imports`, `bun run build`.

### 6. Model Routing

```bash
bun run src/cli.ts route --kind <type> --complexity <level>
```

- Kinds: `mechanical`, `refactor`, `architecture`, `security`, `debug`
- Complexity: `low`, `medium`, `high`

### 7. PR Description Generation

```bash
bun run src/cli.ts pr --base <branch>
```

### 8. Claude Code Bridge

For structured, non-interactive access to the same functionality (used by
tooling rather than a human at a terminal), pipe a JSON request into:

```bash
bun run src/cli.ts claude-code-bridge
```

Accepts `{ action: 'call' | 'commit' | 'pr' | 'route' | 'models', ... }` on
stdin and returns a `ClaudeCodeResponse` on stdout. See
`src/integrations/claude-code/bridge.ts` for the request/response shapes.

### 9. Delegating Mechanical Sub-Tasks

Not every step of a live pipeline needs the primary session's model. A
sub-task qualifies for delegation only if, before delegating, you can state
exactly what the correct output looks like (or exactly what mechanical rule
to apply) — renames, formatting passes, boilerplate scaffolding, and the
same shape of work `chowa commit`/`chowa pr` already delegate on your
behalf (a rigid, checkable output generated from an already fully-specified
input). If any part of "what should this become" is still an open design
question, don't delegate — handle it inline.

Skip delegation for trivial one-line edits — the round-trip costs more than
it saves. Delegate only when the mechanical work is large or repetitive
enough (a multi-file rename sweep, a repo-wide formatting pass) that
running it on a cheaper model is worth a subagent call.

To delegate, first resolve the target model — run
`bun run src/cli.ts route --kind mechanical --complexity low` (the same
profile `chowa commit`/`chowa pr` already use) and read `target.model` from
its JSON output. Then invoke the `Agent` tool with `chowa-mechanical` as the
subagent and that resolved value as an explicit `model:` override — this
takes precedence over whatever the subagent definition's own frontmatter
pins, so the actual model always reflects the live routing policy
(`chowa.config.ts`) rather than a value hardcoded in the subagent file. Ask
it to report back a structured summary of exactly what changed — not just
"done" — so you don't need to re-read every touched file yourself. If the
user has asked you to handle a specific step directly, that overrides
delegation for that step only. If the subagent hits something needing
judgment mid-task, expect it to stop and hand back rather than deciding on
its own.

## Chōwa CLI Reference

| Command | Description |
|---------|-------------|
| `bun run src/cli.ts check-update` | Check if local branch is behind remote |
| `bun run src/cli.ts commit` | Scan diff, split into atomic clusters |
| `bun run src/cli.ts route --kind <k> --complexity <c>` | Resolve task to model |
| `bun run src/cli.ts pr --base <branch>` | Generate PR description |
| `bun run src/cli.ts claude-code-bridge` | JSON-in/JSON-out bridge for tooling |
| `bun run check:imports` | Verify dependency boundaries |
| `bun test` | Run full test suite |
| `bun run build` | Compile TypeScript cleanly |
