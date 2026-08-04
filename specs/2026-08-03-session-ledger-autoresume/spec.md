# Spec: Session-ledger auto-resume

Status: **Approved** — 2026-08-04. All open questions resolved; see
Resolved Questions below. Proceeding to Stage 2 (implementation plan).

Supersedes: [`2026-08-03-manual-quota-resume`](../2026-08-03-manual-quota-resume/spec.md)
Sibling: [`2026-08-02-quota-resume-orchestrator`](../2026-08-02-quota-resume-orchestrator/spec.md) (unaffected)

## Problem Statement

When a Claude Code session is cut off mid-task by a usage limit, the work
isn't lost — the session is fully resumable with `claude --resume <id>`.
What's lost is the *knowledge that it was in flight*. Five hours later the
quota is back, and nothing anywhere records that a task was interrupted,
which task it was, or which session ID would restore it. The human has to
remember, find the session, and restart it by hand.

Two prior specs bracket this problem without solving it at the right size:

- `2026-08-02-quota-resume-orchestrator` solves it autonomously, but only as
  part of a long-lived daemon that also drives the entire spec → plan →
  execute pipeline: a state machine, an approval channel, IPC, notifications.
  Large, and blocked on much more than resume.
- `2026-08-03-manual-quota-resume` (superseded by this spec) solves the
  resume mechanics correctly and minimally, but requires the human to
  *notice the limit and schedule the resume themselves*, in the moment. Its
  Non-Goals state this outright: "Nothing watches for quota exhaustion on
  its own." That's precisely the moment a human is least able to act —
  the cutoff is abrupt, and the terminal is already dead.

This spec keeps the superseded spec's verified mechanics and removes its
human trigger, without taking on the orchestrator's scope. The unit of
state is a **ledger**: a task is recorded when it starts, stamped when it
dies, and swept when quota returns.

## Design

Three moving parts, each small:

1. **Open** — a `SessionStart` hook writes a ledger entry (task name, session
   ID, cwd, branch, timestamp) the moment a session begins.
2. **Stamp** — a `StopFailure` hook stamps the entry with the reason the
   session died. `quota` is the reason that matters; anything else is
   recorded but not acted on.
3. **Sweep** — a recurring job wakes at the reported `resets_at`, finds
   entries stamped `quota` inside the window that just reset, and reopens
   each in a detached `tmux` session running `claude --resume`.

### Why `StopFailure` works here

`2026-08-02-quota-resume-orchestrator` correctly established that
`StopFailure` is read-only: its stdout and exit code are ignored, so it
cannot influence the dying session — it can't schedule anything, block the
stop, or inject context. That spec concluded from this that only an external
daemon could act.

That conclusion holds for *acting*, but not for *recording*. A hook is a
command; read-only means its **output** is discarded, not that its **side
effects** are. Writing a file is a side effect. `StopFailure` can therefore
stamp the ledger before the session dies, which is all this design needs
from it — the acting is done later, by the sweep, from outside any session.

This is the load-bearing claim of the spec and **must be verified against
the shipped binary before implementation** (see Open Questions), not
inherited from this reasoning.

### Why "not marked success" is the wrong sweep condition

The obvious ledger design marks entries `success` on completion and
resurrects everything else. It fails in a specific way: it conflates *was
interrupted* with *is unfinished*. Experiments deliberately abandoned,
tasks reconsidered, branches walked away from — all are "not success", and
all would be reopened unbidden, hours later, with no human present.

The sweep condition here is positive and bounded instead: an entry is
eligible only if it was **explicitly stamped quota-blocked** and its
interruption falls **inside the token window that just reset**. Both
conditions must hold. A task nobody stamped is never resurrected, and an
entry that ages out of its window is never resurrected, so a stalled or
forgotten ledger decays to inert rather than to noise.

## Verified on this machine

Confirmed directly against `claude` 2.1.220 and this host, not assumed:

- **`~/.claude.json` → `cachedUsageUtilization`** carries
  `utilization.five_hour.resets_at`, `utilization.seven_day.resets_at`, and a
  `limits[]` array with `kind`/`group`/`percent`/`severity`/`resets_at`/
  `is_active`. Read live during drafting. **It is a cache** — it carries its
  own `fetchedAtMs`, and is written when a session last fetched it, so a
  sweep polling it while no session is running may read a stale value.
- **No `claude usage` subcommand exists.** `/usage` is in-session only. The
  full subcommand list is `agents`, `auth`, `auto-mode`, `doctor`,
  `gateway`, `install`, `mcp`, `plugin`, `project`, `setup-token`,
  `ultrareview`, `update`. Any design assuming a CLI usage command is wrong.
- **Zero-token `get_usage` probe** — a `{"type":"control_request","request":
  {"subtype":"get_usage"}}` message on the `stream-json` control channel
  returns structured `rate_limits` with `resets_at` and `total_cost_usd: 0`.
  Verified live by the orchestrator spec's POC. Its backing SDK method is
  named `..._DONT_RELY_ON_THIS_API_YET()` and documents its shape as
  experimental.
- **Hook events present in the shipped binary**: `SessionStart`,
  `SessionEnd`, `Stop`, `StopFailure`, `SubagentStop`, `PreToolUse`,
  `PostToolUse`, `UserPromptSubmit`, `PreCompact`, `Notification`.
- **Every hook payload receives `session_id`, `transcript_path`, and `cwd`**
  as structured JSON on stdin. Session IDs never need to be guessed from
  file mtimes.
- **Claude Code already keeps a partial live registry** at
  `~/.claude/sessions/<pid>.json`:
  `{pid, sessionId, cwd, startedAt, version, kind, entrypoint, name,
  nameSource}`. It is keyed by PID and scoped to live processes, with no
  task or outcome state — useful as a cross-check, not as the ledger.
- **Session IDs are the `.jsonl` filenames** under
  `~/.claude/projects/<slugified-cwd>/`.
- **`claude --resume <id>` restores full conversation history**, including
  tool calls and results, when run from the same directory.
- **A bare `"continue"` prompt is not enough** — verified in the
  orchestrator POC: the resumed agent has no idea what was in flight. The
  ledger entry must carry a short description of the work, and the resume
  must send it.
- **Scheduling primitives present**: `at`, `atd` (systemd unit, `enabled`
  and `active`, so it survives reboot), `systemd-run`, `tmux`, `crontab`.
- **Native `/schedule` and `CronCreate` are session-scoped and die with the
  session** — unusable for this, per the orchestrator spec's research.

## Goals

- **G1.** A `SessionStart` hook opens a ledger entry containing at minimum:
  session ID, absolute repo path, git branch, session name, start timestamp,
  and a task description slot. Written from the hook's own stdin payload —
  no mtime guessing.
- **G2.** A `StopFailure` hook stamps the matching entry with a structured
  reason and a timestamp. The reason vocabulary is closed and explicit:
  `quota` is the only value the sweep acts on.
- **G3.** A `chowa abandon [--reason <text>]` command stamps the current
  branch's entry as deliberately abandoned, permanently excluding it from
  every future sweep regardless of how it died.
- **G4.** A sweep command (`chowa resume --sweep`, or equivalent) selects
  entries where **both**: the entry is stamped `quota`, **and** its
  interruption timestamp falls inside the token window that just reset.
  Entries failing either condition are left untouched.
- **G5.** The sweep resolves the real reset time rather than guessing:
  `cachedUsageUtilization` first (free, no subprocess), falling back to the
  `get_usage` probe. Both parsed defensively — an unrecognized shape fails
  loudly and skips the sweep, never silently assumes quota is available.
- **G6.** Each eligible entry is reopened in its **own detached `tmux`
  session** running `claude --resume <id>` from the entry's recorded cwd,
  fully interactively — no `-p`, no `--permission-mode`, and never
  `--dangerously-skip-permissions`. A real TTY sidesteps the entire
  headless-permission problem. The recorded task description is sent as the
  opening message.
- **G7.** The recurring schedule is OS-level (`systemd` user timer, or
  `at` re-armed by the sweep itself — decided in the implementation plan),
  not a Chōwa daemon and not a session-scoped task.
- **G8.** Reopening an entry clears its `quota` stamp, so a sweep that fires
  twice cannot open two `tmux` sessions for the same task.
- **G9.** Subscription-only. No API keys constructed anywhere, ever.

## Non-Goals

- **Not the orchestrator.** No pipeline state machine, no approval gates, no
  IPC, no daemon, no autonomous multi-stage dispatch. That stays in
  `2026-08-02-quota-resume-orchestrator`, untouched and still viable.
- **Not a general task tracker.** The ledger records what is needed to
  resume a session. It is not a todo list, has no priorities or
  dependencies, and is not a reporting surface.
- **Not a success/completion signal.** This spec deliberately does not
  define what "done" means or try to detect it. Entries leave the sweep's
  attention by being abandoned (G3) or by aging out of their window (G4),
  never by being marked complete.
- **Not `agy` support in v1** — same reasoning as both prior specs.
- **Not headless resume.** Every resume is interactive in `tmux`. If a
  resumed session needs a permission decision, it waits for a human, which
  is correct behavior, not a defect to engineer around.
- **Not a fix for `feat/quota-limit-detection`.** That branch's
  `--dangerously-skip-permissions` handoff (commit `45d8f55`) is out of
  scope here and should not be merged on the strength of this spec.

## Affected Interfaces

- **New hooks** in `plugins/chowa/hooks/hooks.json` — `SessionStart` and
  `StopFailure` entries, distributed by the same mechanism as the existing
  push-protection hook. Both must be fast and must never block or slow a
  session start; a failure to write the ledger is logged and swallowed, not
  raised.
- **New ledger file** — a single JSON document outside the repo (e.g.
  `~/.chowa/sessions.json`), keyed by absolute repo path + branch, so it
  isn't committed accidentally and survives re-cloning.
- **New CLI surface** — `chowa abandon`, and the sweep entry point. Both
  thin wrappers over a new ledger module.
- **New module** for ledger read/modify/write, window-eligibility
  evaluation, reset-time resolution, and `tmux`/scheduler command
  construction. Small enough to live beside `src/cli.ts` rather than
  becoming a top-level package.
- **`scripts/sync-skill.ts`** — the hooks are Claude-Code-specific and must
  not leak into the portable Gemini/Antigravity skill copy, the same
  constraint the `chowa-mechanical` subagent already handles.

## Edge Cases

- **Weekly limit, not session limit.** A task blocked by `seven_day` won't
  be resumable for up to seven days, so "the window that just reset" must be
  evaluated per-window: a `five_hour` reset makes only `five_hour`-blocked
  entries eligible. The stamp must record *which* limit blocked the session,
  or the sweep will keep reopening weekly-blocked work into an exhausted
  quota every five hours.
- **Machine asleep or off at reset time.** `at` jobs queue and fire once
  `atd` is back; systemd timers support `Persistent=true`. Late is
  acceptable; silently dropped is not. Whichever mechanism is chosen must be
  confirmed to catch up rather than skip.
- **Two sessions on the same branch.** The ledger is branch-keyed, so the
  second `SessionStart` overwrites the first. Acceptable for v1
  (branch-per-task is the existing convention) but must be stated in the
  ledger's own documentation rather than being a silent last-write-wins.
- **Quota still exhausted when the sweep fires** — a stale cached
  `resets_at`, or consumption by another machine on the same account. The
  reopened session will immediately fail again. The sweep must not loop: an
  entry that has been reopened and re-stamped `quota` more than a small
  number of times is left alone and surfaced, not retried forever.
- **`StopFailure` never fires** — the session is SIGKILLed, the machine
  loses power, the terminal is closed hard. The entry stays open and
  unstamped, and is therefore never swept. This is the intended failure
  direction: the cost is a missed resume the human can trigger manually, not
  an unwanted one.
- **The cache is stale and reports a reset already in the past.** Must be
  treated as "unknown", triggering the probe fallback, not as "quota is
  available right now".
- **`tmux` session name collision** across concurrent sweeps — names must
  carry a unique suffix, not just the task or agent name.
- **Repo moved or branch deleted** between stamping and sweeping. The entry
  records an absolute cwd; if it no longer exists, `claude --resume` cannot
  restore the session (resume is directory-scoped). Skip and surface.

## Acceptance Criteria

- [ ] `SessionStart` fires, reads `session_id`/`cwd` from its stdin payload,
      and opens a correctly-keyed ledger entry.
- [ ] `StopFailure` fires on a real quota cutoff and stamps the matching
      entry with reason `quota` and the blocking window — **verified against
      a genuine cutoff or a faithful reproduction**, not assumed from the
      hook's documented existence.
- [ ] An entry stamped `quota` inside the just-reset window is swept and
      reopened in a detached `tmux` session.
- [ ] An entry stamped `quota` whose timestamp predates the just-reset
      window is **not** reopened.
- [ ] An entry stamped abandoned via `chowa abandon` is **not** reopened,
      even when it is inside the window and stamped `quota`.
- [ ] An entry blocked by `seven_day` is not reopened by a `five_hour`
      sweep.
- [ ] Reset-time resolution prefers the cache, falls back to the probe, and
      fails loudly (skipping the sweep) on an unrecognized shape.
- [ ] A sweep firing twice in a row opens exactly one `tmux` session per
      eligible entry.
- [ ] The reopened session receives the recorded task description, not a
      bare "continue".
- [ ] No code path passes `--dangerously-skip-permissions` or
      `--permission-mode` — grep-able.
- [ ] No code path constructs `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` — Hard
      Constraint, grep-able.
- [ ] Hook failures never block or measurably delay session start.
- [ ] The new hooks do not appear in the synced portable skill copy
      (`bun run check:skill` clean).
- [ ] Tests cover: ledger open/stamp/abandon transitions, window-eligibility
      selection (including the weekly-vs-session case), reset-time
      resolution against fixture JSON with a deliberately malformed variant,
      and exact `tmux`/scheduler argv construction.
- [ ] `bun test`, `bun run check:imports`, `bun run build` clean.

## Resolved Questions

1. **Does `StopFailure` actually fire on a usage-limit cutoff, and does its
   command's file write survive session teardown?** Partially de-risked,
   not fully closed, and deliberately not blocking on full closure: static
   inspection of the shipped binary confirms the hook dispatch is `await`ed
   with a real timeout budget (observed values from 1s–20s for comparable
   hooks) — not fire-and-forget, so a fast ledger-write command has a
   genuine window to complete. What's *not* provable without living through
   a real cutoff: whether a genuine rate-limit death actually reaches this
   code path with `error: "rate_limit"`. Decision: proceed to the
   implementation plan on this evidence, verify for real during Stage 3
   (the next natural cutoff, not an artificially forced one), and keep the
   documented fallback (`SessionEnd` stamp + transcript classification) as
   the contingency if it turns out not to fire reliably — the plan should
   note this explicitly as a thing Stage 3 confirms, not assumes.
2. **Does the `StopFailure` payload identify which window blocked the
   session** (`five_hour` vs. `seven_day`)? No — the confirmed schema has
   no structured field for it; `error` is the closed enum, `error_details`
   is unstructured free text not safe to parse against. Resolved: the stamp
   step correlates against a `get_usage` probe *at stamp time* (same probe
   G5 already uses for `resets_at`) to determine which window is actually
   implicated, rather than trusting anything in `error_details`.
3. **Recurring schedule mechanism.** Resolved: a systemd user timer with
   `Persistent=true` for the *sweep's own trigger* — the more robust choice
   for something that must catch up after the machine was off, and
   `systemd-run`/`systemd` are already confirmed present on this host. The
   *resume action itself* keeps using `tmux` (already fully verified) —
   each tool used for the job it's actually suited to, not one mechanism
   stretched to cover both.
4. **Ledger concurrency.** Resolved: a single JSON file with an atomic
   write pattern (write to a temp file, then rename) is sufficient for v1 —
   write frequency is inherently low (only on `SessionStart`/`StopFailure`/
   sweep events, never a hot path), so per-entry file sharding would add
   complexity the actual concurrency risk doesn't justify.
