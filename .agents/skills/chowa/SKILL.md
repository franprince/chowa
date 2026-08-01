---
name: chowa
description: >
  Chōwa coding harness skill — mandatory guidelines for spec-driven pipeline
  (spec → plan → execute), git branching, commit workflows, PR creation,
  code quality verification, architecture boundaries, and model routing.
---

# Chōwa Skill (Self-Hosted)

Chōwa is installed in this workspace and is used to develop itself (dogfooding).

## Workflow Rules

When making changes to this codebase, **always follow these conventions**:

### 1. Specification-Driven Pipeline (Spec → Plan → Execute)

For all feature requests and non-trivial changes, always follow this 3-stage lifecycle:

1. **Stage 1: Specifications (`spec.md`)**:
   - Always start by creating a specification artifact (`spec.md` or `specifications.md`).
   - Define problem statement, goals, non-goals, input/output schemas, edge cases, and acceptance criteria.
   - Confirm alignment with the user before proceeding to planning.

2. **Stage 2: Implementation Plan (`implementation_plan.md`)**:
   - Once specs are done, create the technical `implementation_plan.md` artifact.
   - Detail architectural changes, files to modify/create, component boundaries, and verification plan.
   - Set `RequestFeedback: true` and obtain explicit user approval before writing code.

3. **Stage 3: Execution & Verification**:
   - Execute the approved plan (implementing code & unit tests).
   - Verify changes using `bun test`, `bun run check:imports`, and `bun run build`.
   - **Always ask the user** if they want to create a Pull Request (with PR description and all) after committing on a new feature branch.

### 2. Branching & PR Workflow

- **Always create a new branch** for new features, fixes, or tasks before making changes (never work or push directly on `main`, `master`, or `develop`).
- **Never push directly to `main`, `master`, or `develop`**.
- Always create a **Pull Request (PR)** against the target base branch (`develop` or `main`).
- **Always ask the user** if they want to create a PR (with PR description and all) whenever creating a new branch and committing.

### 3. Remote Update Checks & Global Sync

- Before starting work or committing, check if the local branch is up to date with the remote (which also syncs global config):
  ```bash
  bun run src/cli.ts check-update
  ```

### 4. Commit Workflow & Messages

- Run Chōwa's diff splitter to check if changes should be split into atomic commits:
  ```bash
  bun run src/cli.ts commit
  ```
- If Chōwa reports multiple clusters, **commit each cluster separately** as an atomic commit.
- All commits **must** follow Conventional Commits format:
  ```
  type(scope): concise imperative description
  ```
- Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`, `style`, `revert`.
- Valid scopes: `core`, `adapters`, `router`, `git`, `cli`, `integrations`.

### 5. Code Quality & Build Verification

Before committing changes, verify quality and safety:
- Run `bun test` to ensure all tests pass.
- Run `bun run check:imports` to verify one-way dependency boundaries (`integrations → core`, never reverse).
- Run `bun run build` to verify TypeScript compiles cleanly.

### 6. Model Routing

Check which model Chōwa recommends for a task:
```bash
bun run src/cli.ts route --kind <type> --complexity <level>
```
- Task kinds: `mechanical`, `refactor`, `architecture`, `security`, `debug`
- Complexity: `low`, `medium`, `high`

### 7. PR Description Generation

Generate PR descriptions from commit history:
```bash
bun run src/cli.ts pr --base <branch>
```

## Chōwa CLI Reference

| Command | Description |
|---------|-------------|
| `bun run src/cli.ts check-update` | Check if local branch is behind remote & sync global rules |
| `bun run src/cli.ts sync-global` | Sync local skill & rules to ~/.gemini/config/ |
| `bun run src/cli.ts commit` | Scan diff, split into atomic clusters |
| `bun run src/cli.ts route --kind <k> --complexity <c>` | Resolve task to model |
| `bun run src/cli.ts pr --base <branch>` | Generate PR description |
| `bun run check:imports` | Verify dependency boundaries |
| `bun test` | Run full test suite |
| `bun run build` | Compile TypeScript cleanly |
