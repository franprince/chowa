# Spec: Manual quota-resume scheduling (`chowa resume`)

Status: **Superseded by
[`2026-08-03-session-ledger-autoresume`](../2026-08-03-session-ledger-autoresume/spec.md)**

> Superseded because this design requires the human to notice the limit and
> schedule the resume themselves — the one moment they are least able to,
> since the cutoff is abrupt and the terminal is already gone. The successor
> keeps this spec's verified mechanics wholesale (interactive `tmux` resume,
> `at`-based OS-level scheduling, `SessionStart` capture of `session_id`
> from the hook payload, and the finding that a bare "continue" prompt
> fails) and replaces only the trigger: a ledger stamped at cutoff and swept
> when quota returns. Retained as the record of what was decided about the
> interactive-resume approach and why it was chosen over headless resume.

## Problem Statement

`specs/2026-08-02-quota-resume-orchestrator/` designs a fully autonomous
daemon that drives Chōwa's whole spec → plan → execute pipeline and
auto-detects/auto-resumes quota-blocked work. That's a large, ambitious
system — a daemon process, a pipeline state machine, an approval-signaling
channel, IPC, desktop notifications.

There's a much smaller, immediately useful version of just the "resume
later" part: the human, hitting the limit live right now, already knows
exactly what they want continued. Rather than have a system reconstruct
that context after the fact, let the human write it down once, then
schedule the resume themselves:

```
chowa resume claude <sessionId> --message "continue refactoring the router tests" in 5h
```

This is a deliberately manual, human-in-the-loop tool — not a replacement
for the orchestrator spec, a smaller and separate thing that can ship first.
The two aren't mutually exclusive; this one just doesn't attempt the
autonomous parts.

## Why This Avoids Most of Tonight's Complexity

- **No headless-permission problem.** The scheduled action runs `claude
  --resume <id>` *interactively*, in a real terminal/session with a real
  TTY — not `-p` print mode. No `--permission-mode`, no
  `--dangerously-skip-permissions`, nothing — it behaves exactly as if the
  user typed it themselves, because they effectively did (in advance).
- **No "bare continue isn't enough" problem.** Verified in the orchestrator
  POC that a generic "continue" prompt fails because the resumed agent has
  no idea what was in flight. Here, the human supplies `--message` while
  they still have full context — better information than any system could
  reconstruct later.
- **No daemon, no persistence-across-restart design.** This is one
  fire-and-forget scheduled OS-level action, not a long-lived process
  tracking multi-stage state.

## Verified on this machine (not assumed)

- `at`, `atd` (active, enabled, running as a systemd service — survives
  reboot), `systemd-run`, and `tmux` are all present.
- Session IDs are literally the `.jsonl` filenames under
  `~/.claude/projects/<slugified-cwd>/` — one file per session. (Confirmed
  directly: this very session's own ID is visible throughout its own file
  paths tonight.)
- **`SessionStart` is a real, actionable Claude Code hook — not read-only
  like `StopFailure`.** Confirmed against the shipped binary's own schema:
  its structured output can set `additionalContext`, `sessionTitle`,
  `watchPaths`, etc., and its command runs with full shell execution
  regardless. More importantly: **every hook payload — `SessionStart`
  included — receives `session_id`, `transcript_path`, and `cwd` directly as
  structured JSON on stdin.** No mtime-based guessing is needed to know a
  session's own ID; it's handed to the hook outright, at the moment the
  session starts.

## Goals

- **G1.** `chowa resume <agent> [sessionId] [--message "..."] (in <duration> | at <time>)`
  — schedules a one-time future resume of a `claude` (or, once/if a safe
  non-bypass headless mode exists for it, `agy`) session.
- **G2.** `sessionId` is optional. Primary resolution: a `SessionStart` hook
  (shipped alongside Chōwa's existing hooks, same distribution mechanism as
  the push-protection hook) captures `session_id` directly from its own
  stdin payload — no guessing — and persists a `task → sessionId` mapping
  the moment the session begins, keyed by the current git branch (Chōwa's
  existing convention: one task/feature = one branch) at that `cwd`. `chowa
  resume` then looks this up by branch name — exact, no ambiguity, no
  race window, because the mapping was written by the session itself,
  immediately, not reconstructed later from file-modification times.
  **Fallback** for sessions predating the hook (or where it isn't
  installed): most-recently-modified `.jsonl` under the current project's
  `~/.claude/projects/<slug>/` directory — same heuristic as originally
  proposed, explicitly lower-confidence, and only used when no hook-recorded
  mapping exists for the current branch.
- **G3.** `--message` is optional prose the user supplies now, while they
  have context, sent into the resumed session once it reopens. Omitting it
  just reopens the session without auto-sending anything — still useful
  (the human types the continuation themselves once they're back).
- **G4.** The scheduled action opens a **detached `tmux` session**
  (`tmux new-session -d -s chowa-resume-<id> "claude --resume <sessionId>"`),
  not a GUI terminal window. Reasoning: GUI-terminal spawning
  (`gnome-terminal`, `x-terminal-emulator`, ...) is desktop-environment
  specific and assumes the user is at the machine and wants a window
  appearing unprompted; a detached tmux session is portable, scriptable, and
  waits quietly until the user runs `tmux attach -t chowa-resume-<id>`
  whenever they're actually back.
- **G5.** The scheduling mechanism itself is OS-level (`at` by default,
  already verified present and running) — not a custom Chōwa-managed
  scheduler or daemon. Survives the originating terminal closing and, since
  `atd` is an enabled systemd service, survives reboot.
- **G6.** `chowa resume` also accepts an exact `resets_at` lookup instead of
  a human-guessed duration, reusing the zero-token `get_usage` probe already
  proven in the orchestrator POC — `chowa resume claude --auto` schedules for
  the actual reported reset time rather than a guessed "in 5h". Both forms
  are supported; `in <duration>`/`at <time>` remains the simple, always-available
  path when the probe isn't wanted or the agent isn't `claude`.
- **G7.** Subscription-only — same hard constraint as the orchestrator spec.
  No API keys, ever, for any part of this.

## Non-Goals

- Not the daemon, not the pipeline state machine, not approval gates, not
  autonomous quota detection during a live task — all of that stays in
  `specs/2026-08-02-quota-resume-orchestrator/`, untouched by this spec.
- Not automatic invocation — the human runs `chowa resume` deliberately,
  once, when they notice or anticipate hitting a limit. Nothing watches for
  quota exhaustion on its own.
- Not `agy` support in v1, same reasoning as the orchestrator spec: no safe
  non-interactive/bypass-free permission mode was found for it. (Less
  relevant here than in the daemon design, since this runs interactively
  anyway — worth re-checking whether `agy` in a real interactive `tmux`
  session sidesteps the concern entirely, but not assumed without checking.)
- Not managing multiple concurrent scheduled resumes with any sophistication
  beyond "each gets its own uniquely-named tmux session" — no queue, no
  dependency tracking.

## Affected Interfaces

- New CLI command: `chowa resume [agent] [sessionId] [--message <text>]
  (in <duration> | at <time> | --auto)`. `sessionId` stays a positional
  override; the common path is `chowa resume --message "..." in 5h`, letting
  branch-based lookup (G2) resolve everything else.
- A `SessionStart` hook, distributed the same way Chōwa's existing
  push-protection hook is (`plugins/chowa/hooks/hooks.json` — same
  mechanism, new entry). Reads its own `session_id`/`cwd` from stdin, reads
  the current git branch at that `cwd`, and appends/updates a mapping in a
  local, gitignored record.
- Persistence for that mapping — a small JSON file (e.g.
  `~/.chowa/sessions.json`, keyed by absolute repo path + branch name; not
  per-project inside the repo itself, so it isn't accidentally committed and
  survives the repo being re-cloned).
- New module (location TBD in implementation plan — likely `src/cli.ts`
  addition + a small new file, this is far too small to warrant its own
  top-level package the way the orchestrator does) that:
  - Resolves `sessionId`: explicit arg → hook-recorded mapping for the
    current branch → most-recent-`.jsonl` fallback, in that order.
  - Builds the `tmux new-session -d ...` command line.
  - Builds the `at`/`systemd-run` invocation that runs that command line at
    the requested time.
  - For `--auto`: reuses the orchestrator POC's `probeUsage()`/`get_usage`
    logic (or a copy of it, if the orchestrator package isn't a dependency
    yet — decide in the implementation plan) to resolve `resets_at`.

## Edge Cases

- User schedules a resume, then the machine is off/asleep at the scheduled
  time — `at` jobs queue and fire once the machine is back and `atd` is
  running again (standard `at` behavior); not instant-if-missed, but not
  silently dropped either. Worth confirming this behavior explicitly rather
  than assuming.
- **Solved, not just mitigated, for hook-tracked sessions**: since the
  `SessionStart` hook records `session_id` the moment a session begins (not
  reconstructed later from file timestamps), there's no race window —
  concurrent sessions on different branches each get their own correct
  mapping. The ambiguity risk is real only for the **fallback** path
  (sessions that started before the hook existed, or in a repo where it
  isn't installed): "most recently modified `.jsonl`" could pick the wrong
  session if multiple Claude Code sessions are active in the same project
  directory concurrently. Explicit `sessionId` always avoids this
  regardless of which resolution path would otherwise apply.
- Two sessions on the *same* branch, both hook-tracked — the mapping is
  keyed by branch, so the second SessionStart overwrites the first's
  recorded `session_id`. Acceptable for v1 (branch-per-task is the existing
  convention, so this implies genuinely working on two things under one
  branch name, which is already an edge case) but worth stating plainly
  rather than leaving as a silent last-write-wins surprise.
- `tmux` session name collision if `chowa resume` is invoked twice for
  related work — session names must be unique (e.g. suffix with a short
  random id or timestamp, not just the agent name).
- The resumed session's quota is *still* exhausted at the scheduled time
  (guessed duration was wrong, or `--auto`'s probe was stale by the time it
  actually fires) — v1 doesn't need to solve this elegantly (it's a manual
  tool; the human can just reschedule), but shouldn't silently fail either —
  worth deciding whether the tmux session prints something visible on
  failure rather than just exiting.

## Acceptance Criteria

- [ ] The `SessionStart` hook fires on session start, correctly reads
      `session_id`/`cwd` from its stdin payload (not re-derived), and
      writes/updates the branch-keyed mapping.
- [ ] `chowa resume --message "..." in 5h` (no explicit session/agent)
      resolves the session via the hook-recorded mapping for the current
      branch and schedules a detached tmux session via `at`.
- [ ] With no hook-recorded mapping for the current branch, resolution falls
      back to most-recently-modified `.jsonl` and the command still works
      (just with the documented lower-confidence caveat).
- [ ] `chowa resume claude <explicit-session-id> --message "..." at 18:30`
      works with an explicit session ID and absolute time, bypassing both
      resolution paths entirely.
- [ ] `chowa resume claude --auto` resolves the real `resets_at` via the
      zero-token probe and schedules for that time instead of a guess.
- [ ] No code path passes `--dangerously-skip-permissions` or
      `--permission-mode` at all — the resumed session runs fully
      interactively, permission model untouched.
- [ ] No code path constructs `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` — Hard
      Constraint, grep-able.
- [ ] Tests cover: session-ID auto-detection against fixture directories,
      `at`/tmux command construction (asserting exact argv, not just "it
      runs"), and `--auto`'s probe integration (mocked, per the
      orchestrator POC's existing test approach).
- [ ] `bun test`, `bun run check:imports`, `bun run build` clean.

## Relationship to the Orchestrator Spec

Both specs live side by side. This one is scoped to ship independently and
first — it doesn't block on, and isn't blocked by,
`specs/2026-08-02-quota-resume-orchestrator/`. If the orchestrator is later
built, this command could become one of its building blocks (the daemon
could call the same tmux/at scheduling logic internally) rather than being
thrown away.
