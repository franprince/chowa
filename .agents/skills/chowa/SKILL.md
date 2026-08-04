---
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

1. **Self-repo (dogfooding)** — `package.json` has `"name": "chowa"`, and
   `src/cli.ts` exists. This is Chōwa's own source; run its CLI from source.
2. **Chōwa project** — any of the following holds:
   - a `chowa.config.ts`, `chowa.config.js`, or `chowa.config.mjs` exists at
     the project root;
   - `chowa` is listed in `dependencies` or `devDependencies` of the
     project's `package.json`;
   - `specs/INDEX.md` exists at the project root — the project already
     follows Chōwa's own spec → plan → execute convention by hand;
   - the user explicitly asks, in this conversation, to use Chōwa's
     conventions here — apply Mode 2 for the rest of the session, and
     mention once that `chowa init` would make it persist across sessions;
   - you have a personal always-on preference set: run `chowa always-on`
     with no argument to check. If enabled, treat *every* project as
     Mode 2, regardless of the project-level signals above — routing falls
     back to the built-in default policy in projects with no config of
     their own.
   The project has opted in, via any one of the above.
3. **Unrelated project** — none of the above. Say that plainly, **once per
   session, not on every subsequent turn** — then offer, a single time, to
   set the project up: `chowa init` (scaffolds a `chowa.config.js` for this
   project only) or `chowa always-on on` (applies Chōwa's workflow to every
   project you personally work in, from now on). If the user declines or
   doesn't respond, defer to the project's own conventions
   (`CONTRIBUTING.md`, `.agents/workflows/*.md`, or the commit style
   already visible in `git log`) for the rest of the session — don't ask
   again, and don't apply the workflow rules below as if they were in
   force.

Absent an onboarding acceptance, Mode 3 is still a stop, not a fallback. A
user working in an unrelated project who declines onboarding should not
have Chōwa's branching rules, spec pipeline, or commit conventions applied
to their work because a plugin happened to be installed globally.

### Running the CLI

`chowa <command>` throughout this document means the invocation for the
detected mode:

| Mode | Invocation |
|---|---|
| 1 — self-repo | `bun run src/cli.ts <command>` |
| 2 — Chōwa project | `chowa <command>` |

In mode 2, `chowa` is whatever this harness was given when the skill was
installed — typically the bundled engine at
`~/.gemini/config/skills/chowa/dist/cli.js`, run with `bun` when it is on
`PATH` and `node` otherwise. `bun` reads a `chowa.config.ts` natively;
`node` needs >= 22.18 for that, though a `chowa.config.js` works on any
version. If neither runtime is available, say so and stop rather than
guessing.

## Workflow Rules (modes 1 and 2 only)

### 1. Specification-Driven Pipeline (Spec → Plan → Execute)

For all feature requests and non-trivial changes, follow this 3-stage lifecycle:

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
   (code + tests), then verify with the project's own quality gates
   (see §5). Always ask the user if they want a Pull Request opened after
   committing on a new feature branch.

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

### 3. Remote Update Checks

Before starting work or committing, check the local branch is up to date:

```bash
chowa check-update
```

### 4. Commit Workflow & Messages

```bash
chowa commit
```

Chōwa clusters the diff by file, which is a heuristic, not a verdict: if two
reported clusters are one logical change (a doc and the index row pointing
at it, a function and its test), commit them together. Splitting them would
produce a commit that doesn't stand on its own. Commits must follow
Conventional Commits: `type(scope): concise imperative description`.

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`, `style`, `revert`
- Scope: whatever the project uses (check recent `git log`, or an existing
  `commitlint`/similar config); in Chōwa's own repo the scopes are `core`,
  `adapters`, `router`, `git`, `cli`, `integrations`.

### 5. Code Quality & Build Verification

Before committing, run the *project's own* test/lint/build scripts (its
`package.json` `scripts` — typically something like `test`, `lint`,
`build`). Chōwa's model routing and commit-splitting don't replace a
project's own quality gates.

### 6. Model Routing

```bash
chowa route --kind <type> --complexity <level>
```

- Kinds: `mechanical`, `refactor`, `architecture`, `security`, `debug`
- Complexity: `low`, `medium`, `high`

### 7. PR Description Generation

```bash
chowa pr --base <branch>
```





## Chōwa CLI Reference

| Command | Description |
|---------|-------------|
| `chowa check-update` | Check if local branch is behind remote |
| `chowa commit` | Scan diff, split into atomic clusters |
| `chowa route --kind <k> --complexity <c>` | Resolve task to model |
| `chowa pr --base <branch>` | Generate PR description |
| `chowa init` | Scaffold a `chowa.config.js` for this project |
| `chowa always-on [on\|off]` | Apply (or stop applying) Chōwa's workflow to every project, regardless of per-project signals; no argument checks current status |
| `chowa install --agent <harness>` | Install this skill for a harness without a plugin system (e.g. `gemini`) |
| `chowa abandon [--reason <text>]` | Stop tracking the current branch's session for auto-resume |
| `chowa ledger status` | List tracked sessions and their auto-resume state |
| `chowa ledger sweep` | Resume any sessions whose blocking quota window has reset (what the installed timer calls) |
| `chowa ledger install` | Install the systemd user timer that runs `ledger sweep` on a schedule (Linux only) |

Chōwa reads its routing policy from `chowa.config.ts`, `chowa.config.js`, or
`chowa.config.mjs` at the project root, falling back to a built-in default
when none exists. An explicit `--config <path>` that doesn't exist fails
loudly rather than falling back.

(Self-repo mode only, Chōwa's own internal build: `bun run verify`, or
`bun test` / `bun run check:imports` / `bun run build` / `bun run lint`
individually. `bun run build:plugin` rebuilds the bundled engine this
plugin ships — required on `release/*` branches, never committed on
`develop` or feature branches.)
