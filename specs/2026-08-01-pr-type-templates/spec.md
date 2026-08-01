# Spec: PR templates by branch flow (standard vs. release/hotfix)

Status: **Approved** — both open questions resolved as proposed: (1)
single `rolloutPlan` field, not split into `rolloutPlan`/`rollbackPlan`;
(2) `branchName` is a required parameter on `generatePRDescription`, no
default.

## Problem Statement

`chowa pr --base <branch>` (`generatePRDescription` in
`src/git/prDescription.ts`) always produces the same four-section shape —
Summary, Changes, Testing Notes, Breaking Changes — no matter what kind of
PR it is. The branch-flow convention Chōwa already documents and expects
every consumer project to follow (`fix/*`, `feat/*`, `docs/*`, `chore/*`
etc. → `develop`; `release/*` and `hotfix/*` → `main`) has no structural
reflection in the generated description. A release/hotfix PR — which needs
a rollout/rollback plan reviewers can act on — reads identically to a
routine docs fix.

This is a portable gap, not a self-dev one: any project that installs
Chōwa and calls `chowa pr` (via the CLI or the Claude Code bridge's `pr`
action) hits the same one-size-fits-all output. Fixing it in
`generatePRDescription` fixes it for every consumer at once, without
needing `chowa.config.ts` (which, per `specs/2026-08-01-routing-config-wiring/`,
isn't actually loaded yet — so a config-driven template registry would be
inert today).

## Goals

- **G1.** Classify the current branch into a PR type using the same prefix
  convention already documented for branch flow: `release/*` and
  `hotfix/*` → `release`; everything else → `standard` (default/fallback,
  matching today's behavior exactly).
- **G2.** Give the `release` type one additional required section — a
  rollout/rollback plan — that the `standard` type does not have. Both
  types keep Summary, Changes (derived from commits, unchanged), Testing
  Notes, and optional Breaking Changes.
- **G3.** Wire classification into both call sites that build a PR
  description: `handlePR` in `src/cli.ts` and `handlePR` in
  `src/integrations/claude-code/bridge.ts` — both already have the current
  branch name (via `GitOps.getCurrentBranch()`) available or easily
  obtainable.
- **G4.** No config file, no new CLI flag: classification is derived
  purely from the branch name Git already reports, so it works the same
  in this repo and in any consumer project on day one.

## Non-Goals

- Not adding `.github/PULL_REQUEST_TEMPLATE/*.md` files — explicitly
  deferred; this spec covers Chōwa's own `pr` command output only.
- Not covering per-commit-type templates (`feat` vs `fix` vs `docs` etc.)
  — only the two flows already documented (standard vs. release/hotfix).
- Not making templates configurable via `chowa.config.ts` — blocked on
  the routing-config-wiring gap; convention-based detection ships now,
  configurability can be a follow-up once config loading actually works.
- Not changing `chowa commit` / commit message generation.
- Not changing the `changes` section's derivation (still verbatim commit
  messages) or the Breaking Changes section's semantics.

## Affected Interfaces

- `src/git/types.ts`: `PRDescription` gains `readonly type: 'standard' |
  'release'` and `readonly rolloutPlan?: string` (present only when
  `type === 'release'`).
- `src/git/prDescription.ts`:
  - New exported `detectPRType(branchName: string): 'standard' |
    'release'` — prefix match on `release/` / `hotfix/`.
  - `generatePRDescription` gains a required `branchName: string`
    parameter (inserted after `commits`, before `baseBranchDiff` — exact
    position decided in the implementation plan), used to pick between
    two system prompts (existing one for `standard`, a new one for
    `release` that also asks for `rolloutPlan`) and to set `type` /
    `rolloutPlan` on the returned `PRDescription`.
- `src/cli.ts` (`handlePR`): pass `currentBranch` (already fetched) into
  `generatePRDescription`; extend the console output to print a
  `## Rollout / Rollback Plan` section when `pr.type === 'release'`.
- `src/integrations/claude-code/bridge.ts` (`handlePR`) and
  `src/integrations/antigravity/bridge.ts` (`handlePR`): both fetch
  `currentBranch` via `GitOps.getCurrentBranch()` (not currently called
  in either) and pass it into `generatePRDescription`; each response's
  `data` already forwards the full `prDescription` object, so `type` /
  `rolloutPlan` reach bridge consumers with no shape change beyond the
  new fields.
- `tests/git/prDescription.test.ts`: extend with cases for both branches
  of `detectPRType` and for `rolloutPlan` presence/absence.

## Edge Cases

- Branch name with no recognized prefix (`main`, `my-experiment`,
  anything not matching `release/*` / `hotfix/*`) → `standard`, identical
  to today's output. This is the fallback, not an error.
- `hotfix/*` branching from `main` directly (per the documented exception
  in the branch-flow rule) still classifies as `release` — classification
  reads the current branch's own prefix, not the base branch argument.
- LLM omits `rolloutPlan` in a malformed/non-JSON response for a
  `release`-type PR: falls back to a fixed default string (mirroring the
  existing fallback pattern for `summary`/`testing`), never throws.
- Case sensitivity: match prefixes case-sensitively (`Release/*` is not a
  recognized prefix) — consistent with Git's own case-sensitive ref
  naming and the branch-flow doc's lowercase convention.

## Acceptance Criteria

- [ ] `detectPRType('release/1.4.0')` and `detectPRType('hotfix/login-500')`
      return `'release'`; `detectPRType('feat/foo')`,
      `detectPRType('fix/bar')`, `detectPRType('docs/baz')`,
      `detectPRType('main')`, `detectPRType('random-name')` return
      `'standard'`.
- [ ] `generatePRDescription(commits, diff, client, policy, 'feat/foo')`
      returns `type: 'standard'` and no `rolloutPlan`, with `summary` /
      `testing` / `breakingChanges` behavior unchanged from today.
- [ ] `generatePRDescription(commits, diff, client, policy, 'release/1.4.0')`
      returns `type: 'release'` and a non-empty `rolloutPlan`.
- [ ] `bun run src/cli.ts pr --base develop` run from a `fix/*` branch
      prints the current 4-section output (no rollout section).
- [ ] `bun run src/cli.ts pr --base main` run from a `release/*` or
      `hotfix/*` branch prints an additional `## Rollout / Rollback Plan`
      section.
- [ ] Claude Code bridge and Antigravity bridge `pr` action responses
      (`data.prDescription`) both include `type` and, for release
      branches, `rolloutPlan`.
- [ ] `bun test`, `bun run check:imports`, `bun run build` all pass.

## Decisions

1. Single `rolloutPlan` field (not split into `rolloutPlan` +
   `rollbackPlan`) — covers both "how this goes out" and "how to undo it"
   in one prompt/field.
2. `branchName` is a required parameter on `generatePRDescription` — both
   call sites must pass it explicitly; no implicit `'standard'` default
   that a future call site could silently fall into.
