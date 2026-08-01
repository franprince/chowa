---
name: chowa
description: >
  Chōwa coding harness skill — spec-driven pipeline (spec → plan → execute),
  git branching, commit workflows, PR creation, code quality verification,
  and model routing. Detects whether the current project is Chōwa's own
  source, a project that depends on Chōwa, or a project without it, and
  adapts its instructions accordingly.
---

# Chōwa Skill

Chōwa is a coding harness: a spec → plan → execute pipeline, atomic-commit
enforcement, and model routing. This skill's job is to apply Chōwa's
conventions when the current project actually uses Chōwa — never to recite
Chōwa's own internal dev workflow at a project that doesn't.

## Step 0: Detect which project this is

Check the current working directory before following anything below:

1. **Self-repo (dogfooding)** — `package.json` has `"name": "chowa"`, and
   `src/cli.ts` and `chowa.config.ts` exist. This is Chōwa's own source.
   Run its CLI from source: `bun run src/cli.ts <command>`.
2. **Consumer (installed dependency)** — `chowa` appears in
   `package.json` dependencies/devDependencies, or
   `node_modules/.bin/chowa` exists. Run the installed binary, matching the
   project's package manager: `npx chowa <command>` / `bunx chowa <command>`
   / `pnpm exec chowa <command>`.
3. **Not installed** — neither of the above. Chōwa isn't set up in this
   project. **Say that plainly and stop** — do not apply the workflow rules
   below as if they were in force. Check for the project's own conventions
   instead (e.g. `.agents/workflows/*.md`, `CONTRIBUTING.md`, an existing
   commit-message style in `git log`) and follow those. Only mention
   installing Chōwa (`npm install --save-dev chowa` / `bun add -d chowa`) if
   the user asks about it or brings up wanting this kind of workflow.

In modes 1 and 2, `chowa <command>` below means the invocation for the
detected mode (`bun run src/cli.ts <command>`, or `npx chowa <command>`,
respectively).

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

### 3. Remote Update Checks

Before starting work or committing, check the local branch is up to date:

```bash
chowa check-update
```

### 4. Commit Workflow & Messages

```bash
chowa commit
```

If Chōwa reports multiple clusters, commit each cluster separately. Commits
must follow Conventional Commits: `type(scope): concise imperative description`.

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
| `chowa sync-global` | (explicit only, self-repo mode) Sync this skill and workspace rules to `~/.gemini/config/` |

(Self-repo mode only, Chōwa's own internal build: `bun run check:imports`,
`bun test`, `bun run build`.)
