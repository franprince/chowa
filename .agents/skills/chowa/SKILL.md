---
name: chowa
description: >
  Chōwa coding harness skill — mandatory guidelines for all coding, git branching,
  commit workflows, PR creation, code quality verification, architecture boundaries,
  and model routing decisions in this repository.
---

# Chōwa Skill (Self-Hosted)

Chōwa is installed in this workspace and is used to develop itself (dogfooding).

## Workflow Rules

When making changes to this codebase, **always follow these conventions**:

### 1. Branching & PR Workflow

- **Always create a new branch** for new features, fixes, or tasks before making changes (never work or push directly on `main`, `master`, or `develop`).
- **Never push directly to `main`, `master`, or `develop`**.
- Always create a **Pull Request (PR)** against the target base branch (`develop` or `main`).
- **Always ask the user** if they want to create a PR (with PR description and all) whenever creating a new branch and committing.

### 2. Remote Update Checks

- Before starting work or committing, check if the local branch is up to date with the remote:
  ```bash
  bun run src/cli.ts check-update
  ```

### 3. Commit Workflow & Messages

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

### 4. Code Quality & Build Verification

Before committing changes, verify quality and safety:
- Run `bun test` to ensure all tests pass.
- Run `bun run check:imports` to verify one-way dependency boundaries (`integrations → core`, never reverse).
- Run `bun run build` to verify TypeScript compiles cleanly.

### 5. Model Routing

Check which model Chōwa recommends for a task:
```bash
bun run src/cli.ts route --kind <type> --complexity <level>
```
- Task kinds: `mechanical`, `refactor`, `architecture`, `security`, `debug`
- Complexity: `low`, `medium`, `high`

### 6. PR Description Generation

Generate PR descriptions from commit history:
```bash
bun run src/cli.ts pr --base <branch>
```

## Chōwa CLI Reference

| Command | Description |
|---------|-------------|
| `bun run src/cli.ts check-update` | Check if local branch is behind remote |
| `bun run src/cli.ts commit` | Scan diff, split into atomic clusters |
| `bun run src/cli.ts route --kind <k> --complexity <c>` | Resolve task to model |
| `bun run src/cli.ts pr --base <branch>` | Generate PR description |
| `bun run check:imports` | Verify dependency boundaries |
| `bun test` | Run full test suite |
| `bun run build` | Compile TypeScript cleanly |
