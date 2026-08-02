# Spec: Delegate mechanical sub-tasks to a cheaper model during live pipeline execution

Status: **Draft**

## Problem Statement

Claude Code Skills support a `model:` frontmatter field that overrides which
model runs the *current turn* of the invoking session (accepts an alias like
`haiku`, a full model ID, or `inherit`; reverts on the session's next prompt).
None of Chōwa's SKILL.md files (`.claude/skills/chowa/SKILL.md`,
`.agents/skills/chowa/SKILL.md`, `plugins/chowa/skills/chowa/SKILL.md`) use
this field, despite the skill's own description advertising "model routing"
as one of its concerns.

Separately, Chōwa already has a real model-routing system —
`chowa.config.ts` + `src/router/` — that routes a `mechanical`-kind
`TaskProfile` to a fast/cheap target (`gemini-3.6-flash`, with a
`claude-haiku` fallback). That system is correctly wired end-to-end as of
`specs/2026-08-01-routing-config-wiring/` (Done): `loadPolicy()` genuinely
loads the config, and the resolved target reaches `ChowaClient.call()`.

The catch: that router only governs LLM calls **Chōwa's own CLI makes
directly** — `generateCommitMessage` and `generatePRDescription`, both of
which call `ChowaClient.call()` out-of-band from any live coding session.
It has no bearing on the model running the **live Claude Code agent** that is
actually following the SKILL.md pipeline and making the code edits (renames,
formatting passes, boilerplate scaffolding, etc.) — that always runs on
whatever model the human picked for the session, for the full multi-turn
duration of the work.

This spec is about whether/how to close that second gap: giving the live
pipeline a way to hand genuinely mechanical, self-contained sub-tasks to a
cheaper model, instead of always executing them inline on the primary
session's model.

## Why the Skill-level `model:` frontmatter doesn't fit this

Confirmed via current Claude Code docs: the override is scoped to a single
turn and reverts automatically on the session's next prompt. Chōwa's
pipeline (spec → plan → execute → commit → PR) spans many turns and mixes
task kinds (mechanical *and* architecture *and* debug) within one
invocation. A single `model:` field on the existing chowa SKILL.md can't
selectively downgrade just the mechanical portions — it would either do
nothing (if set on a skill invoked once at the start) or downgrade the
entire pipeline including the parts that need the strongest reasoning. This
mechanism is a non-goal below, not an oversight.

The lever that *does* fit — already documented and already used elsewhere in
this codebase's own tooling context — is a **subagent** definition
(`.claude/agents/*.md`), which supports a per-agent `model:` frontmatter
field and can be invoked mid-session via the `Agent` tool for a bounded,
self-contained piece of work, then returns control to the primary session
unaffected.

## Goals

- **G1.** Decide, explicitly, whether the live pipeline should delegate
  genuinely mechanical, self-contained sub-tasks to a cheaper-model subagent
  rather than executing them inline — and document that decision (adopt or
  reject, with rationale) in the SKILL.md files instead of leaving it
  unaddressed.
- **G2.** If adopted: define the delegation mechanism concretely enough to
  follow consistently — a new subagent definition with a pinned cheap model,
  and a workflow-rule subsection stating what qualifies as "mechanical
  enough to delegate."
- **G3.** Keep this scoped to workflow documentation / agent definitions
  only — `chowa.config.ts` and `src/router/*` already correctly solve the
  adjacent (but distinct) problem of routing Chōwa's own outbound CLI calls,
  and are out of scope here.

## Non-Goals

- Not adding a `model:` field to the existing pipeline-spanning chowa
  SKILL.md files — established above as the wrong lever for a multi-turn,
  mixed-task-kind workflow.
- Not building automatic task-kind classification. Any delegation rule
  reuses the same `mechanical | refactor | architecture | security | debug`
  vocabulary the router already uses (`src/router/types.ts`); the primary
  agent still makes the judgment call of which kind a given sub-task is.
- Not modifying `chowa.config.ts`, `src/router/*`, or any adapter/client
  code — this track touches only SKILL.md / agent-definition files.
- Not guaranteeing cost/latency wins are measured — this spec defines the
  mechanism and delegation criteria; benchmarking is separate follow-up work
  if pursued.

## Affected Interfaces

- Possibly new: `.claude/agents/chowa-mechanical.md` — a subagent definition
  scoped to mechanical edits, with `model: haiku` (or equivalent alias) in
  frontmatter and a minimal tool list (likely `Read`, `Edit`, `Bash` for
  running verification commands — no `Agent` access, to prevent nested
  delegation).
- `.claude/skills/chowa/SKILL.md` — new workflow-rule subsection describing
  when and how to delegate (or an explicit "considered and rejected"
  note if G1 resolves the other way).
- Open question (see below) whether the canonical, user-distributed
  `plugins/chowa/skills/chowa/SKILL.md` (and its generated
  `.agents/skills/chowa/SKILL.md` copy) should carry the same guidance for
  other projects, or whether this stays self-hosted-only.

## Edge Cases

- A delegated mechanical task turns out to need judgment mid-way (e.g. a
  "pure rename" touches a call site with non-obvious semantics) — the
  subagent should stop and hand back rather than making the call itself.
- The user gives an explicit instruction to handle a specific step directly
  (not delegate) — that overrides the default delegation behavior for that
  step only.
- Trivial one-line mechanical edits shouldn't force an `Agent`-tool
  round-trip — the delegation criteria needs a rough lower bound (e.g. by
  file count or edit scope) so the overhead of spawning a subagent doesn't
  exceed the work being delegated.
- A mechanical task's output needs to feed directly into the next pipeline
  step (e.g. a rename whose result the primary agent immediately builds on)
  — delegation must return a clear, structured summary of what changed, not
  just "done," so the primary session doesn't need to re-read every file to
  find out.

## Acceptance Criteria

- [ ] SKILL.md contains an explicit, documented decision on G1 — not
      silence.
- [ ] If adopted: `.claude/agents/chowa-mechanical.md` exists, has a pinned
      cheap-model `model:` frontmatter value, and a tool list that excludes
      `Agent` (no nested delegation).
- [ ] If adopted: the new SKILL.md subsection states concrete delegation
      criteria (task-kind + rough scope threshold) that a reader could apply
      consistently without further clarification.
- [ ] No changes to `src/router/*`, `chowa.config.ts`, or any `.ts` source
      file under `src/` — this track is documentation/agent-definition only.
- [ ] `bun test`, `bun run check:imports`, `bun run build` remain clean
      (expected to be a no-op check, since no TypeScript changes).

## Open Questions for Approval

1. Do we adopt delegation at all (G1), or is the honest conclusion that
   `chowa.config.ts`'s existing router already covers the cases that
   matter — Chōwa's own generated commit messages and PR descriptions — and
   the live agent's own inline edits aren't worth this additional
   complexity?
2. If adopted, does the delegation guidance belong only in the self-hosted
   `.claude/skills/chowa/SKILL.md`, or also in the canonical
   `plugins/chowa/skills/chowa/SKILL.md` so other projects using the
   distributed Chōwa skill get the same behavior?
3. What's the concrete "mechanical enough to delegate" bar — a file/line
   count threshold, a specific verb list (rename, reformat, boilerplate
   scaffold), explicit exclusions (test assertions, public API signatures,
   anything security-sensitive), or some combination?
4. Which cheap model alias should the subagent pin to — `haiku` outright, or
   should it mirror `chowa.config.ts`'s own choice of fast/cheap target so
   the two systems don't disagree about what "cheap" means?
