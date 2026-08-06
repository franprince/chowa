# Implementation Plan: Reverse Engineering & Architecture Investigation Skill (`chowa-reverse-engineer`)

**Status:** Draft  
**Date:** 2026-08-06  
**Spec Reference:** `specs/2026-08-06-reverse-engineering-skill/spec.md`  

---

## 1. Overview & Components to Modify/Create

1. **Skill Template Creation**:
   - Create skill definition file for reverse engineering (`.agents/skills/chowa-reverse-engineer/SKILL.md` and `.claude/skills/chowa-reverse-engineer/SKILL.md`).
   - Define systematic exploration instructions, file inspection patterns, schema extraction techniques, and output formatting.
2. **Harness Integration**:
   - Update main `chowa` skill (`.agents/skills/chowa/SKILL.md` and `.claude/skills/chowa/SKILL.md`) to include `chowa-reverse-engineer` in Stage 0 / pre-planning recommendations.
   - Instruct Stage 1 (`spec.md`) drafting to automatically check for `specs/ARCHITECTURE_PROFILE.md` if present and incorporate its architectural constraints.
3. **Spec Index & Documentation**:
   - Record `2026-08-06-reverse-engineering-skill` in `specs/INDEX.md`.

---

## 2. Step-by-Step Implementation Strategy

### Phase 1: Reverse Engineering Skill Instruction Design
- Draft `.agents/skills/chowa-reverse-engineer/SKILL.md` covering:
  - Step 1: Project Metadata & Quality Gate Discovery (`package.json`, `tsconfig.json`, build scripts).
  - Step 2: Layer & Module Boundary Discovery (finding entry points, directory maps, exports).
  - Step 3: Architectural Flow & Data Model Analysis (tracking major APIs, state managers, DB schemas).
  - Step 4: Generating `specs/ARCHITECTURE_PROFILE.md`.

### Phase 2: Chōwa Main Harness Integration
- Wire recommendation into Stage 1 of `chowa` SKILL.md.
- Ensure `sync-skill.ts` handles multi-skill sync if applicable or syncs `chowa-reverse-engineer` across canonical/self-hosted/portable paths.

### Phase 3: Testing & Verification
- Test running `chowa-reverse-engineer` analysis on this codebase itself as a verification test.
- Verify `bun run verify` passes cleanly with all skill sync checks.
