# Implementation Plan: Session-ledger auto-resume

Status: **In Progress** — Phases A–D implemented on `feat/session-ledger-hooks`
(Phase A already merged via PR #21; B/C/D pending PR). Not yet "Done": the
two real-world-only checklist items below (a genuine quota cutoff
confirming `StopFailure` fires, and installing the systemd timer on an
actual machine) are still open. See the Phase C note below on a design
refinement made during Phase A that changes that section from what was
originally sketched here.

## Overview

Phased into four increments, each independently testable, each building
only on what's already proven in the prior phase:

| Phase | Delivers | Depends on |
|---|---|---|
| A | Ledger core: schema, atomic file I/O, open/stamp/abandon/query | Nothing new — pure, portable logic |
| B | `SessionStart`/`StopFailure` hooks wired to the ledger, SKILL.md docs | Phase A |
| C | Sweep: reset-time resolution, window-eligibility, `tmux` resume dispatch, systemd timer | Phase A (B not required, but the ledger needs real entries to sweep meaningfully) |
| D | CLI surface: `chowa abandon`, `chowa ledger status` | Phase A |

**Recommendation:** land Phase A as its own PR first, same reasoning as the
(dismissed) orchestrator plan used successfully — it's pure, portable,
fully unit-testable logic with no subprocess/hook involvement, and
everything else calls into it. B, C, D can follow as separate branches or
stay as sequential commits on this one — decide at Stage 3.

## Module Placement

- **`src/ledger/`** — the portable core (Phase A): ledger schema, atomic
  read/write, `open`/`stamp`/`abandon`/`query` operations, window-eligibility
  logic. Pure functions operating on data — no Claude-Code assumptions, no
  subprocess calls, no hook-payload parsing. Fully unit-testable without
  mocking any external tool.
- **`src/integrations/claude-code/`** — the hook-glue scripts (Phase B):
  thin scripts invoked directly by `plugins/chowa/hooks/hooks.json`, which
  parse the hook's stdin JSON and call into `src/ledger/`. This is where
  Claude-Code-specific assumptions (the hook payload shape, `tmux`,
  `systemd-run`) live, mirroring the existing `core` vs. `integrations`
  boundary already enforced by `check-imports.ts` elsewhere in this repo.
- **`src/cli.ts`** — new subcommands (Phase D) for `chowa abandon` and the
  sweep entry point, thin wrappers over `src/ledger/`.

`src/ledger/` isn't in `check-imports.ts`'s protected list
(`core`/`adapters`/`router`/`git`), so no boundary-check changes are needed
— but keeping it dependency-free of `src/integrations/` by convention (not
by enforcement) is worth doing anyway, since Phase A's whole value is being
testable without any of that.

## Phase A: Ledger Core

**File: `src/ledger/types.ts`**

```ts
export type StampReason = 'quota' | 'abandoned';

export interface LedgerEntry {
  readonly sessionId: string;
  readonly repoPath: string;   // absolute path — resume is directory-scoped
  readonly branch: string;
  readonly sessionName?: string;
  readonly taskDescription?: string; // filled by Phase B from SessionStart context
  readonly startedAt: string;        // ISO 8601
  readonly status: 'open' | 'quota_blocked' | 'abandoned' | 'resumed';
  readonly blockedWindow?: 'five_hour' | 'seven_day';
  readonly resetsAt?: string;        // ISO 8601, captured at stamp time
  readonly stampedAt?: string;
  readonly abandonReason?: string;
  readonly resumeAttempts: number;   // G8's re-stamp loop guard (Edge Cases)
}

export interface Ledger {
  readonly entries: Readonly<Record<string, LedgerEntry>>; // keyed by `${repoPath}#${branch}`
}
```

**File: `src/ledger/store.ts`**

Atomic read/write (Resolved Question 4): write to a temp file in the same
directory, then `rename()` over the target — rename is atomic on the same
filesystem, so a concurrent reader never observes a partial write.

```ts
export interface LedgerStoreOptions {
  readonly path?: string; // default: ~/.chowa/sessions.json
}

export function readLedger(options?: LedgerStoreOptions): Ledger;
export function writeLedger(ledger: Ledger, options?: LedgerStoreOptions): void;
export function ledgerKey(repoPath: string, branch: string): string;
```

`readLedger` returns an empty `{entries: {}}` when the file doesn't exist
yet (first run) — no separate "initialize" step needed.

**File: `src/ledger/operations.ts`**

```ts
export function openEntry(ledger: Ledger, entry: Omit<LedgerEntry, 'status' | 'resumeAttempts'>): Ledger;
export function stampQuota(ledger: Ledger, key: string, window: 'five_hour' | 'seven_day', resetsAt: string): Ledger;
export function abandonEntry(ledger: Ledger, key: string, reason?: string): Ledger;
export function markResumed(ledger: Ledger, key: string): Ledger; // clears quota_blocked, increments resumeAttempts (G8)

/** Both conditions from the spec's "why not-marked-success is wrong" section. */
export function eligibleForSweep(
  ledger: Ledger,
  window: 'five_hour' | 'seven_day',
  windowResetAt: string,
): readonly LedgerEntry[];
```

`eligibleForSweep` implements the spec's core selection rule precisely:
`status === 'quota_blocked' AND blockedWindow === window AND stampedAt` falls
inside the window that just reset — both conditions, not either. This is
the function the weekly-vs-session bug (Edge Cases) lives or dies on, so
its test coverage is the most important in this phase.

**Verification:** pure unit tests — no filesystem mocking beyond a temp
directory, no subprocess mocking at all. Cover: open/stamp/abandon/resume
transitions; `eligibleForSweep` with a five_hour-blocked entry during a
seven_day sweep (must be excluded — the weekly/session bug); an entry just
inside vs. just outside the window boundary; `resumeAttempts` capping
(Edge Cases: "left alone and surfaced, not retried forever" — pick and
document a concrete cap, e.g. 3).

## Phase B: Hooks

**File: `src/integrations/claude-code/hooks/sessionStart.ts`**

Reads stdin JSON (`{session_id, transcript_path, cwd, ...}`), resolves the
current git branch at `cwd` (`simple-git`, already a dependency), and calls
`openEntry`. Must never throw uncaught — a failure here is logged (stderr)
and swallowed, per the spec's Affected Interfaces constraint ("must never
block or slow a session start").

**File: `src/integrations/claude-code/hooks/stopFailure.ts`**

Reads stdin JSON (adds `error`, `error_details?`, `last_assistant_message?`
to the base payload). If `error !== 'rate_limit'`, exits immediately,
no-op. If `error === 'rate_limit'`:
1. Probes `get_usage` (the zero-token control-channel request, POC-proven)
   to determine *which* window is actually at ~100% utilization (Resolved
   Question 2 — `error_details` isn't trusted for this) and its `resetsAt`.
2. Calls `stampQuota(ledger, key, window, resetsAt)`.
3. Writes the ledger. Same swallow-failure discipline as `sessionStart.ts`.

**File: `plugins/chowa/hooks/hooks.json`**

```diff
   "hooks": {
     "PreToolUse": [ ... existing push-protection entry, unchanged ... ],
+    "SessionStart": [
+      {
+        "hooks": [
+          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}\"/dist/hooks/sessionStart.js" }
+        ]
+      }
+    ],
+    "StopFailure": [
+      {
+        "hooks": [
+          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}\"/dist/hooks/stopFailure.js" }
+        ]
+      }
+    ]
   }
```

No `matcher` field — per the spec's own finding, filtering happens inside
`stopFailure.ts` itself (`error === 'rate_limit'`), since matcher support
for the `error` field specifically was never confirmed either way.

**File: `plugins/chowa/skills/chowa/SKILL.md`** (and `.claude/skills/chowa/SKILL.md`)

New section documenting the feature, wrapped in a **new** marked region —
extending `scripts/sync-skill.ts`'s existing `REGION_SWAPS` array (already
designed for exactly this in the mechanical-delegation work) with a third
entry:

```ts
{
  label: 'autoresume',
  start: '<!-- chowa:autoresume:start -->',
  end: '<!-- chowa:autoresume:end -->',
  replacement: '', // no hooks.json equivalent on Gemini/Antigravity
},
```

Mirrors exactly how the `delegation` region was added — same reasoning
(Claude-Code-only mechanism, must not leak into the portable copy), same
pattern, no new design needed here.

**Verification:** hook scripts tested by invoking them as child processes
with fixture stdin (real subprocess spawn, since these need to behave
correctly as actual CLI entry points, not just as importable functions) —
asserting ledger state before/after, and that a non-`rate_limit` error
leaves the ledger untouched. `sync-skill.ts` tests extended the same way
the `delegation` region's were: region removed correctly, never leaks
`hooks.json`/`StopFailure` references into the portable copy.

## Phase C: Sweep

**Design refinement made during Phase A, superseding this section's
original `resetTime.ts` sketch:** `eligibleForSweep(ledger, window, now)`
shipped comparing each entry's own probe-captured `resetsAt` (stamped by
`StopFailure` at the moment it blocked) against wall-clock `now`, rather
than taking an externally-resolved `windowResetAt` as a parameter. That
timestamp is already the authoritative one — it came from the same
`get_usage` probe G5 describes, captured at the most accurate possible
moment (stamp time) rather than re-resolved later at sweep time. A
separate `src/ledger/resetTime.ts` (cache-then-probe, re-resolving "the
current reset time for window X" on every sweep tick) would have nothing
to feed it: it's dead code. The risk G5 was guarding against — a stale or
wrong probe reading — is instead bounded by `MAX_RESUME_ATTEMPTS`: a
resume dispatched on a bad `resetsAt` just hits the wall again and
re-stamps a corrected one on its next `StopFailure`. **`resetTime.ts` is
dropped; not built.**

**Fix-up also folded into this phase:** Phase B shipped without a way to
satisfy the spec's own acceptance criterion "the reopened session receives
the recorded task description, not a bare 'continue'" — `SessionStart`
never has a task description to give, and Phase B's `stopFailure.ts`
wasn't capturing `last_assistant_message` either. `stampQuota` gained an
optional 6th `taskDescription` parameter (additive, doesn't disturb Phase
A's existing call sites/tests), and `stopFailure.ts` now passes
`payload.last_assistant_message` through it. This is the only real
"what was in flight" signal available to the sweep.

**File: `src/integrations/claude-code/sweep.ts`** (built)

1. `readLedger()`, then for each of `five_hour`/`seven_day`: call
   `eligibleForSweep(ledger, window, now)` directly — no reset-time
   resolution step, per the refinement above.
2. For each eligible entry: `buildDispatch(entry)` (pure, unit-tested argv
   construction) produces a `tmux new-session -d -s chowa-resume-<hash>
   claude --resume <sessionId>` argv plus a `tmux send-keys -t <name>
   <message> Enter` argv — `<message>` is `entry.taskDescription`, falling
   back to an explicit non-"continue" message when absent. `dispatchResume`
   runs both for real, with a short pause between them so `claude` has
   booted its interactive input handling before the message is typed in.
3. `markResumed()` immediately after a successful dispatch (not after the
   `tmux` session finishes — G8 only needs the *dispatch* to be
   idempotent, not the outcome). A failed dispatch leaves the entry
   `quota_blocked` for retry on the next sweep tick, bounded by
   `MAX_RESUME_ATTEMPTS`, and doesn't abort the rest of that sweep pass —
   one repo's `tmux` failure shouldn't block another eligible entry.

**File: install script for the systemd user timer** (exact path TBD —
likely alongside `plugins/chowa/hooks/hooks.json`'s own install path,
invoked once e.g. by `chowa init` or a dedicated `chowa ledger install`):
a `.timer` + `.service` unit pair, `Persistent=true`, calling
`chowa ledger sweep` (Phase D) on a short interval (e.g. every 5 minutes —
frequent enough to catch a reset promptly, and each firing is cheap since
`eligibleForSweep` is a pure in-memory filter over the ledger, no probe
involved).

**Verification:** `sweep.ts` tested against a fixture ledger with an
injected `dispatch` mock (same DI pattern the hooks established) —
asserting exact `tmux` argv via `buildDispatch`, not just "it runs." A
separate, explicitly-labeled manual test: install the real timer unit on
this machine and confirm `systemctl --user list-timers` shows it with the
right cadence — this one can't be meaningfully unit-tested.

## Phase D: CLI Surface

**File: `src/cli.ts`** additions:

```bash
chowa abandon [--reason <text>]   # abandonEntry() for the current branch
chowa ledger status               # human-readable dump of all entries
chowa ledger sweep                # Phase C's sweep, as a directly-invokable command
```

`ledger sweep` is what the systemd timer actually calls — Phase C's
`sweep.ts` logic exposed as a CLI subcommand rather than a standalone
script, consistent with how every other Chōwa capability is exposed.

**Verification:** CLI argument-parsing tests, consistent with existing
`cli.ts` test coverage patterns elsewhere in this repo.

## Test Plan Summary

| Area | New tests |
|---|---|
| `ledger/types.ts`, `store.ts` | Atomic write correctness (temp+rename), missing-file → empty ledger |
| `ledger/operations.ts` | Open/stamp/abandon/resume transitions; **weekly-vs-session eligibility bug** (highest priority); window-boundary edge; `resumeAttempts` cap |
| `hooks/sessionStart.ts` | Fixture stdin → correct entry opened; never throws |
| `hooks/stopFailure.ts` | `rate_limit` → stamped with probed window; any other `error` → untouched; never throws |
| `sync-skill.ts` | New `autoresume` region stripped from portable copy, same pattern as `delegation` |
| `sweep.ts` | Exact `tmux` argv for eligible entries (`buildDispatch`); idempotent on double-fire (G8); failed dispatch leaves the entry retryable |
| `cli.ts` | New subcommand parsing |

## Verification Checklist (Stage 3 exit criteria, per phase)

- [x] Phase A: `bun test` covers the weekly-vs-session eligibility case
      explicitly — this is the one bug that would silently misfire in
      production if untested.
- [x] Phase B: hook scripts never throw uncaught; a forced-failure test
      (fixture that makes the ledger write fail) confirms the session-start
      path still completes normally.
- [x] Phase B: `bun run check:skill` clean — `autoresume` region absent
      from `.agents/skills/chowa/SKILL.md`.
- [ ] Phase C: manual confirmation the systemd timer installs and appears
      in `systemctl --user list-timers` with `Persistent=true` set. Not run
      against a real user session yet — `chowa ledger install` genuinely
      enables a recurring background job, so it's left for the user to run
      deliberately rather than fired during automated verification.
- [x] All phases: no code path passes `--dangerously-skip-permissions` or
      `--permission-mode` (grep-able — the only match is `sweep.ts`'s own
      doc comment explaining they're deliberately *not* used); no code
      path constructs `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` (grep-able, zero
      matches).
- [x] All phases: root `bun test`, `bun run check:imports`, `bun run build`
      remain clean (one pre-existing, unrelated failure in
      `router.test.ts` — a `require()` in an ESM test file predating this
      feature — left untouched).
- [ ] **Open Question 1's real-world verification**: the first genuine
      quota cutoff encountered after Phase B ships is used to confirm
      `StopFailure` actually stamps the ledger — noted here so it isn't
      forgotten once the code is merged and attention moves on.

## Rollout

Continuing on `feat/session-ledger-autoresume` for Phase A (already holds
the approved spec). Suggested commit breakdown for Phase A:

1. `feat(ledger): add ledger schema and atomic store`
2. `feat(ledger): add open/stamp/abandon/eligibility operations`
3. `test(ledger): cover weekly-vs-session eligibility and resume-attempt cap`

Ask before opening a PR (target: `develop`) once Phase A is verified.
