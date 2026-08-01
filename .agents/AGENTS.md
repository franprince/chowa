# Chōwa Workspace Rules

## Branching & PR Workflow
- Always create a new feature/fix branch before making changes (never work or push directly on `main`, `master`, or `develop`)
- Always create a Pull Request (PR) for merging changes into the target base branch (`develop` or `main`)
- Never push directly to `main`, `master`, or `develop`
- When creating a new branch and committing changes, **always ask the user if they want to create a PR** (including generating the PR description and submitting the PR)

## Commit Workflow
- Before every commit, run `bun run src/cli.ts commit` to check for logical clusters
- If multiple clusters are found, commit each one separately as an atomic commit
- All commit messages must follow Conventional Commits format: `type(scope): description`
- Valid scopes: `core`, `adapters`, `router`, `git`, `cli`, `integrations`

## Code Quality
- Run `bun test` before committing to ensure all tests pass
- Run `bun run check:imports` to verify dependency boundaries after any structural changes
- Run `bun run build` to verify TypeScript compiles cleanly

## Architecture
- Dependencies flow one direction: `integrations → core`, never reverse
- No file under `src/core/`, `src/adapters/`, `src/router/`, or `src/git/` may import from `src/integrations/`
- New provider adapters must implement the `ProviderAdapter` interface from `src/core/types.ts`
- New integrations go under `src/integrations/<name>/` following the Antigravity pattern
