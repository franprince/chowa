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
| 2026-08-01 | [portable-global-skill-sync](2026-08-01-portable-global-skill-sync/spec.md) | Draft | `chowa commit`/`pr`/`check-update` silently overwrite `~/.gemini/config/` with self-dev-only instructions and a false "applies to all projects" claim on every invocation; `.agents/skills/chowa/SKILL.md` needs the same mode-detection already applied to the Claude Code skill. |
