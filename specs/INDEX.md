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
  line at the top: `Draft`, `Approved`, `In Progress`, `Done`, or
  `Superseded by <link>`.
- On approval, update `Status:` in place — don't create a new copy.
- On completion, set `Status: Done` and add the shipping commit/PR link.
- Add exactly one row below per spec directory, kept in chronological order.

## Specs

| Date | Slug | Status | Summary |
|---|---|---|---|
| 2026-08-01 | [routing-config-wiring](2026-08-01-routing-config-wiring/spec.md) | Done | `chowa.config.ts` is never actually loaded by the CLI; `RoutingTargetConfig` doesn't match what the file contains; router-resolved fallbacks never reach `ChowaClient.call()`. |
| 2026-08-01 | [portable-global-skill-sync](2026-08-01-portable-global-skill-sync/spec.md) | Done | `chowa commit`/`pr`/`check-update` silently overwrite `~/.gemini/config/` with self-dev-only instructions and a false "applies to all projects" claim on every invocation; `.agents/skills/chowa/SKILL.md` needs the same mode-detection already applied to the Claude Code skill. |
| 2026-08-01 | [pr-type-templates](2026-08-01-pr-type-templates/spec.md) | Approved | `chowa pr` always emits the same 4-section description regardless of branch flow; adds branch-prefix PR-type detection (`standard` vs. `release`/`hotfix`) with a rollout/rollback plan section for release-flow PRs, wired into both the CLI and the Claude Code bridge. |
| 2026-08-01 | [plugin-distribution](2026-08-01-plugin-distribution/spec.md) | Draft | Chōwa has no install story — clone the repo and hand-copy SKILL.md into two home directories. Makes the (private) repo itself the distribution channel: a marketplace at the root serving a self-contained Claude Code plugin that bundles the skill, push-protection hooks, and the engine compiled to a single committed `cli.js`. No npm; drops the unsupported library surface. Confines the bundle to `main` with a CI freshness check, and fixes a defect it surfaced: `chowa.config.ts` is loaded by runtime `import()` and fails on any Node without type stripping, despite `engines.node` claiming `>=20`. |
| 2026-08-02 | [widen-project-opt-in-detection](2026-08-02-widen-project-opt-in-detection/spec.md) | Done | Step 0's Mode 2 detection only recognizes a literal `chowa.config.*` file, and Mode 3 is a dead-end stop with no path forward. Adds three more per-project opt-in signals, a personal `chowa always-on` preference for users who want Chōwa applied everywhere, and a one-time onboarding offer (backed by new `chowa init` / `chowa always-on` commands) instead of the flat stop. |
| 2026-08-02 | [quota-resume-orchestrator](2026-08-02-quota-resume-orchestrator/spec.md) | Draft | A Claude Code Skill can't act after its own session is quota-blocked (abrupt cutoff, read-only `StopFailure` hook, session-scoped scheduled tasks) — only an external daemon can. Chōwa drives its own spec → plan → execute pipeline by dispatching each stage to `claude -p --resume --permission-mode dontAsk` (no `--dangerously-skip-permissions`, subscription-only), pausing for human approval at the usual gates, routing task dispatch through Chōwa's existing router, and correlating any dispatch failure against a zero-token `get_usage` quota probe before scheduling an auto-resume — running as a long-lived daemon the user can continually interact with and that proactively surfaces status. |
