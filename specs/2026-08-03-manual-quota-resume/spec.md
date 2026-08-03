# Spec: Manual quota-resume scheduling (`chowa resume`)

Status: **Draft**

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
  `~/.claude/projects/<slugified-cwd>/` — one file per session. The most
  recently modified one in the current project's directory is the current
  session. (Confirmed directly: this very session's own ID is visible
  throughout its own file paths tonight.)

## Goals

- **G1.** `chowa resume <agent> [sessionId] [--message "..."] (in <duration> | at <time>)`
  — schedules a one-time future resume of a `claude` (or, once/if a safe
  non-bypass headless mode exists for it, `agy`) session.
- **G2.** `sessionId` is optional — when omitted, defaults to the most
  recently modified session file for the current project directory (Verified
  finding above), so the common case ("resume *this* session") doesn't
  require the user to go find and paste a UUID.
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

- New CLI command: `chowa resume <agent> [sessionId] [--message <text>]
  (in <duration> | at <time> | --auto)`.
- New module (location TBD in implementation plan — likely `src/cli.ts`
  addition + a small new file, this is far too small to warrant its own
  top-level package the way the orchestrator does) that:
  - Resolves `sessionId` (explicit arg, or most-recent-`.jsonl` lookup).
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
- `sessionId` auto-detection (G2) picks the wrong session if multiple Claude
  Code sessions are active in the same project directory concurrently — the
  "most recently modified" heuristic could be wrong if another session
  writes to its own file after the intended one but before the scheduled
  command reads the directory. Explicit `sessionId` avoids this; document
  the ambiguity rather than silently trusting the heuristic when precision
  matters.
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

- [ ] `chowa resume claude --message "..." in 5h` schedules a detached tmux
      session via `at`, targeting the current project's most-recent session.
- [ ] `chowa resume claude <explicit-session-id> --message "..." at 18:30`
      works with an explicit session ID and absolute time.
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
