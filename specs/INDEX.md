# Spec Index

Chōwa's own spec → plan → execute pipeline (see `.agents/skills/chowa/SKILL.md`
/ `.claude/skills/chowa/SKILL.md`) persists every iteration's `spec.md` and
`implementation_plan.md` under a dated, slugged directory here, instead of
loose files at the repo root. This is the fix for a gap the pipeline itself
had: root-level `spec.md`/`implementation_plan.md` would get silently
overwritten by the next feature's docs, with no record of what was actually
approved or why — intent drifting across iterations with nothing to check it
against. Every entry below is a permanent record; once a spec is superseded,
it stays here as history rather than being deleted or overwritten.

## Convention

- Directory: `specs/<YYYY-MM-DD>-<kebab-slug>/`, date = the day the spec was
  first drafted (not necessarily approved or shipped).
- Contains `spec.md` and `implementation_plan.md`. Both carry a `Status:`
  line at the top: `Draft`, `Approved`, `In Progress`, `Done`, `Dismissed`,
  or `Superseded by <link>`.
- On approval, update `Status:` in place — don't create a new copy.
- On completion, set `Status: Done` and add the shipping commit/PR link.
- If a direction is decided against with nothing carrying it forward, set
  `Status: Dismissed` with a brief reason — distinct from `Superseded by
  <link>`, which points at the spec that replaced it. Both stay in the
  index as history rather than being deleted.
- Add exactly one row below per spec directory, kept in chronological order.

## Specs

| Date | Slug | Status | Summary |
|---|---|---|---|
| 2026-08-01 | [routing-config-wiring](2026-08-01-routing-config-wiring/spec.md) | Done | `chowa.config.ts` is never actually loaded by the CLI; `RoutingTargetConfig` doesn't match what the file contains; router-resolved fallbacks never reach `ChowaClient.call()`. |
| 2026-08-01 | [portable-global-skill-sync](2026-08-01-portable-global-skill-sync/spec.md) | Done | `chowa commit`/`pr`/`check-update` silently overwrite `~/.gemini/config/` with self-dev-only instructions and a false "applies to all projects" claim on every invocation; `.agents/skills/chowa/SKILL.md` needs the same mode-detection already applied to the Claude Code skill. |
| 2026-08-01 | [pr-type-templates](2026-08-01-pr-type-templates/spec.md) | Approved | `chowa pr` always emits the same 4-section description regardless of branch flow; adds branch-prefix PR-type detection (`standard` vs. `release`/`hotfix`) with a rollout/rollback plan section for release-flow PRs, wired into both the CLI and the Claude Code bridge. |
| 2026-08-01 | [plugin-distribution](2026-08-01-plugin-distribution/spec.md) | Draft | Chōwa has no install story — clone the repo and hand-copy SKILL.md into two home directories. Makes the (private) repo itself the distribution channel: a marketplace at the root serving a self-contained Claude Code plugin that bundles the skill, push-protection hooks, and the engine compiled to a single committed `cli.js`. No npm; drops the unsupported library surface. Confines the bundle to `main` with a CI freshness check, and fixes a defect it surfaced: `chowa.config.ts` is loaded by runtime `import()` and fails on any Node without type stripping, despite `engines.node` claiming `>=20`. |
| 2026-08-02 | [widen-project-opt-in-detection](2026-08-02-widen-project-opt-in-detection/spec.md) | Done | Step 0's Mode 2 detection only recognizes a literal `chowa.config.*` file, and Mode 3 is a dead-end stop with no path forward. Adds three more per-project opt-in signals, a personal `chowa always-on` preference for users who want Chōwa applied everywhere, and a one-time onboarding offer (backed by new `chowa init` / `chowa always-on` commands) instead of the flat stop. |
| 2026-08-02 | [mechanical-task-model-delegation](2026-08-02-mechanical-task-model-delegation/spec.md) | Done | `chowa.config.ts`'s router only governs LLM calls Chōwa's own CLI makes directly (commit messages, PR descriptions) — it has no bearing on the model running the live Claude Code agent that executes the pipeline itself. Adds a `chowa-mechanical` subagent (pinned to `haiku`) that the pipeline delegates fully-specified, checkably-correct sub-tasks to, plus the `sync-skill.ts` change needed to keep that Claude-Code-only mechanism out of the portable Gemini/Antigravity copy. |
| 2026-08-02 | [quota-resume-orchestrator](2026-08-02-quota-resume-orchestrator/spec.md) | Dismissed | A Claude Code Skill can't act after its own session is quota-blocked (abrupt cutoff, read-only `StopFailure` hook, session-scoped scheduled tasks) — only an external daemon can. Proposed Chōwa driving its own spec → plan → execute pipeline via a long-lived daemon dispatching each stage to `claude -p --resume`, pausing for human approval, routing dispatch through Chōwa's router, and correlating failures against a zero-token `get_usage` quota probe. Dismissed: Chōwa stays a harness kit, not a wrapper/daemon — nothing here carries forward, though the router-dispatch and quota-probe mechanisms it verified informed the lighter successors below. |
| 2026-08-03 | [manual-quota-resume](2026-08-03-manual-quota-resume/spec.md) | Superseded by [session-ledger-autoresume](2026-08-03-session-ledger-autoresume/spec.md) | A human-in-the-loop `chowa resume claude [sessionId] --message "..." in 5h`, scheduling a detached `tmux` session via `at`. Superseded because it requires the human to notice the limit and schedule the resume themselves; the successor keeps its verified mechanics (interactive `tmux` resume, `at` scheduling, `SessionStart` session-ID capture) and removes the human trigger. Retained as the record of what was decided about the interactive-resume approach. |
| 2026-08-03 | [session-ledger-autoresume](2026-08-03-session-ledger-autoresume/spec.md) | Approved | Quota-blocked work is lost because nothing records that it was in flight. A `SessionStart` hook opens a ledger entry per task; `StopFailure` stamps `quota` on it as the session dies; a recurring sweep at the reported `resets_at` reopens every entry stamped quota-blocked inside the window that just reset. Deliberately abandoned tasks are stamped with a reason and skipped, and the 5-hour window itself bounds eligibility, so nothing stale is resurrected. |
| 2026-08-04 | [cross-repo-skill-source-of-truth](2026-08-04-cross-repo-skill-source-of-truth/spec.md) | Approved | `franprince/skills-marketplace`'s `chowa-skill` was a one-time hand-adapted copy of this repo's own skill, and already drifted (this repo gained a PR closing-line convention `chowa-skill` never got). A new template in `skills-marketplace`, tagging every paragraph `shared`/`chowa-only`/`chowa-skill-only`, becomes the real source of truth — both `chowa-skill` and chowa's own three skill files become generated outputs of it, chowa's fetched via a pinned commit SHA (deterministic CI, no submodule onboarding tax). |
