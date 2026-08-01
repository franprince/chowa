# Chōwa Workspace Rules

- Follow the 3-stage lifecycle: **Spec (`spec.md`) → Plan (`implementation_plan.md`) → Execute**.
- Persist specs under `specs/<YYYY-MM-DD>-<slug>/` (never as loose root-level
  files) and add an entry to `specs/INDEX.md` — see that file for the
  convention. This keeps intent from drifting or being overwritten across
  iterations.
- Use the `chowa` skill (`.agents/skills/chowa/SKILL.md`) for all spec, plan, branching, commit, PR, routing, quality, and architecture conventions.
- Never push directly to `main`, `master`, or `develop`. Always work on dedicated feature branches and ask user before creating PRs.
