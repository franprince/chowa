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

For all feature requests and non-trivial changes, follow this 3-stage
lifecycle:

1. **Stage 1: Specification (`spec.md`)** — problem statement, goals,
   non-goals, input/output schemas, edge cases, and acceptance criteria.
   Get explicit user approval before Stage 2.
2. **Stage 2: Implementation Plan (`implementation_plan.md`)** — files to
   modify/create, component boundaries, test plan. Get explicit user
   approval before writing code.
3. **Persistence** — write both files to `specs/<YYYY-MM-DD>-<slug>/`,
   never as loose root-level files, and add a row to `specs/INDEX.md`
   (create that layout if the project doesn't have one yet). Root-level
   `spec.md`/`implementation_plan.md` get overwritten by the next feature's
   docs with no record of what was approved — that's how intent drifts
   across iterations.
4. **Stage 3: Execution & Verification** — implement the approved plan
   (code + tests), then verify with the project's own quality gates (see
   the Code Quality & Build Verification section below). Always ask the
   user if they want a Pull Request opened after committing on a new
   feature branch.

### 2. Branching & PR Workflow

- Always create a new branch for features/fixes/tasks — never work or push
  directly on `main` or `master`.
- If the project uses a `develop` branch: `fix/*`, `feat/*`, `docs/*`,
  `chore/*` etc. branch from `develop` and PR against `develop`; `release/*`
  and `hotfix/*` branch from `develop` (a `hotfix/*` may branch from `main`
  when patching a live incident) and PR from there to `main`. If the
  project has no `develop` branch, branch from and PR against `main`
  directly. Never push or PR straight to `main`/`master` outside that flow.
- Always ask the user if they want a PR opened, whenever creating a new
  branch and committing.
- After opening a PR, check whether it's actually mergeable against its
  base (`gh pr view <n> --json mergeable,mergeStateStatus`) — don't treat
  "the PR exists" as "the PR is ready." A base branch that moved since you
  branched (especially `develop` → `main` on a `release/*`/`hotfix/*` PR)
  can leave it `CONFLICTING` with no error at creation time, and CI may
  not even run until it's resolved. If so, merge the base branch into your
  branch locally, resolve, push, and re-verify before calling the PR done.

**`release/*` → `main` PRs in this repo routinely come back
`CONFLICTING`**: `develop` never carries `plugins/chowa/dist/` (see the CI
`no-bundle-off-main` job), so each release branch's own version bump and
freshly-built bundle collide with whatever `main` already has from the
*previous* release — every release branch from v0.2.1 through v0.5.0
needed this same fixup. Expect it, don't debug it as a surprise: `git
merge origin/main`, keep your branch's version number, rebuild
`plugins/chowa/dist/` fresh from the merged source (don't just pick one
side), then re-run `bun run verify` before pushing again.

### 3. Remote Update Checks

Before starting work or committing, check the local branch is up to date:

```bash
bun run src/cli.ts check-update
```

### 4. Commit Workflow & Messages

```bash
bun run src/cli.ts commit
```

Chōwa clusters the diff by file, which is a heuristic, not a verdict: if
two reported clusters are one logical change (a doc and the index row
pointing at it, a function and its test), commit them together. Splitting
them would produce a commit that doesn't stand on its own.
Commits must follow Conventional Commits: `type(scope): concise imperative
description`.

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`, `style`, `revert`
- Scope: whatever the project uses (check recent `git log`, or an existing
  `commitlint`/similar config).
In Chōwa's own repo the scopes are `core`, `adapters`, `router`, `git`,
`cli`, `integrations`.

### 5. Code Quality & Build Verification

Before committing, run the *project's own* test/lint/build scripts —
typically something like `test`, `lint`, `build` in its `package.json`
`scripts`, or whatever the project's own tooling is. This workflow's own
conventions (model routing, commit-splitting, or their absence) don't
replace a project's own quality gates.

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

Whether the body comes from `chowa pr` or you write it directly, close
every PR with this line, on its own, after everything else:

```
調和 (Chōwa) — spec → plan → execute, verified before merge
```

Never the default Claude Code attribution trailer — this replaces it, it
doesn't sit alongside it.

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
sub-task qualifies for delegation only if, before delegating, you can
state exactly what the correct output looks like (or exactly what
mechanical rule to apply) — renames, formatting passes, boilerplate
scaffolding, and the same shape of work `chowa commit`/`chowa pr` already
delegate on your behalf (a rigid, checkable output generated from an
already fully-specified input). If any part of "what should this become"
is still an open design question, don't delegate — handle it inline.

Skip delegation for trivial one-line edits — the round-trip costs more
than it saves. Delegate only when the mechanical work is large or
repetitive enough (a multi-file rename sweep, a repo-wide formatting pass)
that running it on a cheaper model is worth a subagent call.

To delegate, first resolve the target model — run `bun run src/cli.ts route --kind mechanical --complexity low` (the
same profile `chowa commit`/`chowa pr` already use) and read `target.model` from its JSON output. Then invoke the
`Agent` tool with `chowa-mechanical` as the subagent and that
resolved value as an explicit `model:` override — this takes precedence
over whatever the subagent definition's own frontmatter pins, so the
actual model always reflects the live routing policy (`chowa.config.ts`)
rather than a value hardcoded in the subagent file.
Ask it to report back a structured summary of exactly what changed — not
just "done" — so you don't need to re-read every touched file yourself. If
the user has asked you to handle a specific step directly, that overrides
delegation for that step only. If the subagent hits something needing
judgment mid-task, expect it to stop and hand back rather than deciding on
its own.

### 10. Executing Plans via Subagent-Driven Development

For an approved implementation plan with several mostly-independent tasks,
prefer executing Stage 3 through the `superpowers:subagent-driven-development`
skill, when the `superpowers` plugin is installed, rather than implementing
every task inline in this session: a fresh implementer subagent per task, a
review gate after each, and one whole-branch review at the end. Load it
explicitly (`Skill` tool, `superpowers:subagent-driven-development`) once
the plan is approved and you're ready to begin Stage 3.

This isn't a fit for every plan. Skip it — implement inline as before —
when tasks are tightly coupled (that skill's own guidance routes tightly
coupled work back to manual execution), the plan is small enough that
per-task subagent dispatch overhead isn't worth it, or the `superpowers`
plugin isn't installed. When it does fit, that skill's own ledger and
review-loop process takes over from here; this skill's spec → plan →
execute pipeline stays the outer frame — the plan it executes is still the
one written and approved under §1.

### 11. Quota-Aware Session Auto-Resume

Chōwa tracks every session's lifecycle automatically via `SessionStart`/
`StopFailure` hooks — there is nothing for you to invoke. When a session
ends specifically because of a rate limit, it's stamped in a local ledger
(`~/.chowa/sessions.json`) with the window that blocked it and when that
window resets; a periodic sweep then resumes eligible sessions once quota
is back. This is transparent background bookkeeping — don't reference or
hand-edit the ledger file, and don't mention it to the user unless they
ask about it.

## Chōwa CLI Reference

| Command | Description |
|---------|-------------|
| `bun run src/cli.ts check-update` | Check if local branch is behind remote |
| `bun run src/cli.ts commit` | Scan diff, split into atomic clusters |
| `bun run src/cli.ts route --kind <k> --complexity <c>` | Resolve task to model |
| `bun run src/cli.ts pr --base <branch>` | Generate PR description |
| `bun run src/cli.ts claude-code-bridge` | JSON-in/JSON-out bridge for tooling |
| `bun run src/cli.ts abandon [--reason <text>]` | Stop tracking the current branch's session for auto-resume |
| `bun run src/cli.ts ledger status` | List tracked sessions and their auto-resume state |
| `bun run src/cli.ts ledger sweep` | Resume any sessions whose blocking quota window has reset |
| `bun run src/cli.ts ledger install` | Install the systemd user timer that runs `ledger sweep` on a schedule (Linux only) |
| `bun run check:imports` | Verify dependency boundaries |
| `bun test` | Run full test suite |
| `bun run build` | Compile TypeScript cleanly |
