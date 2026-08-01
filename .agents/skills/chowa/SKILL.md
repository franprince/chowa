---
name: chowa
description: >
  Chowa coding harness — use for all commit workflows, model routing decisions,
  and PR description generation within this workspace. Chowa enforces atomic
  commits, Conventional Commits format, and routes tasks to the right model.
---

# Chowa Skill (Self-Hosted)

Chowa is installed in this workspace and is used to develop itself (dogfooding).

## Workflow Rules

When making changes to this codebase, **always follow these conventions**:

### 1. Branching & PRs

- **Always create a new branch** for new features, fixes, or tasks before making changes.
- **Never push directly to `main`, `master`, or `develop`**.
- Always create a **Pull Request (PR)** against the target branch (`develop` or `main`).
- **Always ask the user** if they want to create a PR (with description and all) when creating a new branch and committing.

### 2. Before Committing

Run Chowa's diff splitter to check if your changes should be split:

```bash
bun run src/cli.ts commit
```

If Chowa reports multiple clusters, **commit each cluster separately** as an atomic commit.

### 2. Commit Messages

All commits **must** use Conventional Commits format:

```
type(scope): concise imperative description
```

Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`, `style`, `revert`

Scope should match the module: `core`, `adapters`, `router`, `git`, `cli`, `integrations`

Examples:
- `feat(adapters): implement OpenAI tool-call decoding`
- `fix(core): handle empty arguments in validation`
- `test(router): add edge case for wildcard overrides`
- `docs: update README with new architecture diagram`

### 3. Model Routing

Check which model Chowa recommends for a task:

```bash
bun run src/cli.ts route --kind <type> --complexity <level>
```

Task kinds: `mechanical`, `refactor`, `architecture`, `security`, `debug`
Complexity: `low`, `medium`, `high`

### 4. PR Descriptions

Generate PR descriptions from commit history:

```bash
bun run src/cli.ts pr --base main
```

### 5. Dependency Boundary

After any changes, verify the one-way dependency rule holds:

```bash
bun run check:imports
```

Core modules (`src/core/`, `src/adapters/`, `src/router/`, `src/git/`) must never import from `src/integrations/`.

## Chowa CLI Reference

| Command | Description |
|---------|-------------|
| `bun run src/cli.ts commit` | Scan diff, split into atomic clusters |
| `bun run src/cli.ts route --kind <k> --complexity <c>` | Resolve task to model |
| `bun run src/cli.ts pr --base <branch>` | Generate PR description |
| `bun run check:imports` | Verify dependency boundaries |
| `bun test` | Run full test suite |
