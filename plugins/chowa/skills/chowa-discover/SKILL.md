---
name: chowa-discover
description: >
  Codebase Discovery & Architecture Investigation skill for Chōwa.
  Systematically audits codebases to discover tech stack, build gates,
  repository customs/rules (.agents/AGENTS.md, CLAUDE.md, git style),
  directory layout, layer boundaries, domain entities, design patterns, data flows,
  and technical debt. Outputs a structured ARCHITECTURE_PROFILE.md for Chōwa planning.
---

# Chōwa Codebase Discovery Skill (`chowa-discover`)

Use this skill when exploring an unfamiliar codebase, starting work on a new repository, or preparing to plan complex features/refactors. Its goal is to audit and discover the project's architecture, conventions, and repository rules without making assumptions or writing feature code.

## Discovery Workflow (5-Step Audit)

### Step 1: Project Metadata & Quality Gates Discovery
- Inspect root manifest files: `package.json`, `bun.lock`, `cargo.toml`, `go.mod`, `pyproject.toml`.
- Identify runtime engines, primary frameworks, type checking configurations (`tsconfig.json`), linters (`.eslintrc`, `biome.json`), and build scripts.
- Document quality gate verification commands (e.g. `bun test`, `npm run lint`, `cargo test`, `bun run verify`).

### Step 2: Repository Customs & Workflow Rules Inspection
- Search for and parse project rule files: `.agents/AGENTS.md`, `.claude/CLAUDE.md`, `CONTRIBUTING.md`, `.cursorrules`, `.windsurfrules`, `.github/` issue/PR templates.
- Run `git log -n 15 --oneline` to detect commit message conventions (e.g. Conventional Commits `type(scope): description`, custom scopes).
- Identify branch flow conventions (e.g., `fix/*`, `feat/*`, `docs/*` target `develop`; `release/*`, `hotfix/*` target `main`).
- Note testing and quality constraints (e.g. user interaction focus over implementation details, required test runners, strict type safety rules).

### Step 3: Structural Breakdown & Module Boundaries
- Map directory hierarchy and identify architectural layers (e.g., `core/`, `adapters/`, `cli/`, `components/`, `routes/`, `services/`).
- Trace entry points (e.g., `src/index.ts`, `src/cli.ts`, `main.go`, `app/page.tsx`).
- Identify primary domain types, interfaces, data schemas, and state management mechanisms.

### Step 4: Architectural Flow & Pattern Analysis
- Trace primary control flows from user/CLI inputs through services down to side effects (storage, API calls, external tools).
- Identify established design patterns (Factory, Adapter, Strategy, Event Emitter, Dependency Injection).
- Highlight system constraints, fragile modules, known anti-patterns, and technical debt areas.

### Step 5: Generate `specs/ARCHITECTURE_PROFILE.md`
Write or update `specs/ARCHITECTURE_PROFILE.md` using the following standardized schema:

```markdown
# Project Architecture Profile

## 1. Executive Summary & Tech Stack
- **Primary Languages & Runtimes**: ...
- **Frameworks & Core Dependencies**: ...
- **Quality Gates & Build Commands**: ...

## 2. Repository Customs & Workflow Rules
- **Rule Files Detected**: ...
- **Branching Strategy**: ...
- **Commit Conventions**: ...
- **Testing Guidelines**: ...

## 3. Directory Layout & Layer Boundaries
- `src/...`: ...

## 4. Core Entities & Schemas
- Key interfaces and types.

## 5. Architectural Patterns & Data Flows
- Control flows and design patterns in use.

## 6. System Constraints & Technical Debt
- Invariants that must be preserved; areas of debt or fragility.

## 7. Recommendations for Chōwa Feature Planning
- **Extension Points**: Where to add new capabilities.
- **Testing Alignment**: How to structure new tests.
- **Convention Checklist**: Rules to enforce during Stage 1 (spec.md) and Stage 2 (implementation_plan.md).
```
