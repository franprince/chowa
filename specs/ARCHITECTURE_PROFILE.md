# Project Architecture Profile

## 1. Executive Summary & Tech Stack
- **Primary Languages & Runtimes**: TypeScript (ESM), Bun (>= 1.1), Node.js (>= 20.0.0).
- **Frameworks & Core Dependencies**: `zod` (runtime schema validation), `zod-to-json-schema`, `simple-git` (git client), `jsonrepair`.
- **Testing & Quality Gates**: Vitest (`bun test`), TypeScript compiler (`tsc`, `tsc --noEmit -p tsconfig.lint.json`), import boundary checker (`bun run scripts/check-imports.ts`), skill template sync checker (`bun run scripts/sync-skill.ts --check`).
- **All-in-one Quality Command**: `bun run verify`.

## 2. Repository Customs & Workflow Rules
- **Rule Files Detected**:
  - `.agents/AGENTS.md`: Defines 3-stage lifecycle (`spec.md` → `implementation_plan.md` → Execute), specs persistence under `specs/<YYYY-MM-DD>-<slug>/`, and git branching rules.
  - `.agents/skills/chowa/SKILL.md`: Main harness skill defining Step 0 project mode detection (Modes 1, 2, 3), atomic commit workflow, model routing, and PR generation.
  - `specs/INDEX.md`: Chronological spec index tracking status (`Draft`, `Approved`, `In Progress`, `Done`, `Dismissed`, `Superseded`).
- **Branching Strategy**:
  - `fix/*`, `feat/*`, `docs/*`, `chore/*` branch from `develop` and PR against `develop`.
  - `release/*` and `hotfix/*` branch from `develop` (or `main`) and PR against `main`.
  - Direct pushes/PRs to `main` outside release/hotfix branches are strictly forbidden.
- **Commit Conventions**:
  - Conventional Commits: `type(scope): concise imperative description`.
  - Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`, `style`, `revert`.
  - Valid scopes: `core`, `adapters`, `router`, `git`, `cli`, `integrations`, `chowa`.
- **PR Closing Signature**:
  - Every PR body must end with the trailer line:
    `調和 (Chōwa) — spec → plan → execute, verified before merge`

## 3. Directory Layout & Layer Boundaries
- `src/core/`: Base types, `ChowaClient` wrapper, provider abstractions, call options.
- `src/adapters/`: Provider-specific LLM adapters (`GeminiAdapter`, `ClaudeAdapter`).
- `src/router/`: Policy loading (`loadPolicy.ts`), complexity resolution, model tier selection (`router.ts`).
- `src/git/`: Git diff parsing (`diffParser.ts`), commit message formatting (`commitMessage.ts`), PR description generator (`prDescription.ts`).
- `src/integrations/`: Claude Code session ledger (`ledger.ts`), auto-resume hooks (`sessionStart.ts`, `stopFailure.ts`), background timer dispatch (`sweep.ts`).
- `scripts/`: Shared template sync scripts (`fetchSharedTemplate.ts`, `renderSharedVariant.ts`, `sync-skill.ts`), import boundary checker (`check-imports.ts`).
- `plugins/chowa/`: Self-contained Claude Code plugin marketplace distribution (bundles compiled engine `dist/cli.js`).
- `specs/`: Spec storage directory (`<YYYY-MM-DD>-<slug>/`) and `INDEX.md`.

## 4. Core Entities & Schemas
- `RoutingPolicy`: Schema defining primary/fallback providers and models per task kind (`mechanical`, `refactor`, `architecture`, `security`, `debug`) and complexity (`low`, `medium`, `high`).
- `ChowaClient`: Central API dispatcher managing provider execution, retries, and fallback failover loops.
- `SessionLedger`: Persistent ledger tracking active agent sessions (`open`, `quota_blocked`, `resumed`, `abandoned`).
- `DiffCluster`: Logical change group parsed from `git diff` output.

## 5. Architectural Patterns & Data Flows
- **Adapter Pattern**: Standardizes different LLM provider APIs (Gemini, Claude) behind a unified interface (`ProviderAdapter`).
- **Strategy Pattern**: Configurable routing policy resolves task metadata (`kind`, `complexity`) to model choices dynamically.
- **Spec → Plan → Execute Pipeline**: Structured harness pipeline governing feature lifecycle and intent tracking.
- **Template Generation & Sync**: `sync-skill.ts` fetches pinned template from `franprince/chowa-skill` and renders canonical, self-hosted, and portable skill variants deterministically.

## 6. System Constraints & Technical Debt
- **Plugin Bundle Isolation**: `develop` branch never carries compiled `plugins/chowa/dist/` (enforced by CI `no-bundle-off-main` job); plugin bundles are compiled and committed exclusively on `release/*` branches.
- **Mergeability Check**: Release PRs from `release/*` to `main` must check mergeability against `main` (`gh pr view --json mergeable,mergeStateStatus`) and resolve version/dist collisions before merge.

## 7. Recommendations for Chōwa Feature Planning
- **Extension Points**: Add new capabilities by defining new CLI commands in `src/cli.ts` or new integrations under `src/integrations/`.
- **Testing Alignment**: Add unit tests under `tests/` matching module subdirectories (`tests/router/`, `tests/git/`, `tests/integrations/`).
- **Convention Checklist**: Always run `bun run verify` before committing, maintain atomic conventional commits, and update `specs/INDEX.md` upon spec status change.
