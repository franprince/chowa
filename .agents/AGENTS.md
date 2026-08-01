# Chōwa Workspace Rules

- Follow the 3-stage lifecycle: **Spec (`spec.md`) → Plan (`implementation_plan.md`) → Execute**.
- Persist specs under `specs/<YYYY-MM-DD>-<slug>/` (never as loose root-level
  files) and add an entry to `specs/INDEX.md` — see that file for the
  convention. This keeps intent from drifting or being overwritten across
  iterations.
- Use the `chowa` skill (`.agents/skills/chowa/SKILL.md`) for all spec, plan, branching, commit, PR, routing, quality, and architecture conventions.
- Branch flow (unless told otherwise): `fix/*`/`feat/*`/`docs/*`/`chore/*` branch
  from `develop` and PR against `develop`; `release/*`/`hotfix/*` branch from
  `develop` and PR to `main`. Never push or PR directly to `main`/`master`
  outside of a `release/*` or `hotfix/*` branch. Always ask the user before
  creating a PR.
