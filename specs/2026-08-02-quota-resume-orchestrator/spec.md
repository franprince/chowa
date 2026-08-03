# Spec: Quota-aware task orchestrator for Claude Code / Antigravity sessions

Status: **Draft**

## Problem Statement

Long-running work on a subscription (not API-key) plan gets interrupted when
the underlying `claude` or `agy` CLI hits its usage/rate limit. Today that
means the human has to notice, wait, and manually resume — there is no
supervision that survives the interruption and continues automatically once
quota resets.

**A Claude Code Skill cannot solve this.** It only exists inside a running
session; once that session is quota-blocked, nothing is left running to act.
Confirmed by direct research against current docs (`code.claude.com/docs/en/errors.md`,
`hooks.md`, `scheduled-tasks.md`):

- The cutoff is abrupt — no pre-warning the agent could act on before being
  blocked.
- The one hook that can observe a rate-limit cutoff (`StopFailure`) is
  **read-only** — its output/exit code are ignored, so it cannot itself
  schedule anything.
- Native scheduled tasks (`/schedule`, `CronCreate`) are **session-scoped and
  die with the session** — even if the about-to-be-cut-off session could
  schedule a resume (it can't, per the point above), the task wouldn't
  outlive it anyway.

So this genuinely requires something outside any single session: an external
wrapper/orchestrator process. That's the correct instinct behind the
`feat/quota-limit-detection` branch's original goal ("no outer wrapper
harness... no supervisor to intercept quota limits") — but that branch's
implementation of the idea (`AgentSubprocessTransport`,
`src/transport/subprocess.ts`) got the mechanics wrong in ways a same-repo
review caught tonight:

- It added `--dangerously-skip-permissions` to stop the headless subprocess
  from hanging on permission prompts — a real security violation, since it
  disables permission checking entirely rather than solving the actual
  problem.
- Quota detection was fragile stdout/stderr string-matching (`'RESOURCE_EXHAUSTED'`,
  `'quota exceeded'`, `'hit your turn limit'`, ...) — easy to false-positive
  or miss entirely, and not tied to anything the CLI actually guarantees.
- It bundled this concern into a much larger, tangled scope (an interactive
  REPL, live tool-activity streaming, Antigravity/`agy` bridging, positional
  prompt mapping) spread across `specs/2026-08-02-quota-limit-detection/`
  goals G1–G12, making the one genuinely valuable piece (auto-resume on
  quota reset) hard to build or review in isolation.

This spec scopes down to exactly that one piece, built on mechanisms actually
verified against the live CLI tonight (see "Verified via POC" below), and
explicitly **does not** touch or supersede the rest of `feat/quota-limit-detection`'s
scope (REPL UX, streaming, Antigravity bridging) — that branch is left alone
for its author to reconcile separately.

## Hard Constraint: Subscription Only

Non-negotiable, stated directly by the user: this must drive the `claude` /
`agy` CLIs so all model usage bills against the existing Pro/Max
subscription — **no `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`, no
`FetchTransport`, no metered API spend of any kind.** A design that quietly
falls back to a direct API call under any circumstance fails this spec.

## Verified via POC (tonight, against the real CLI — not assumed)

- **Zero-token quota probe.** `claude`'s `stream-json` control channel accepts
  a `{"type":"control_request","request":{"subtype":"get_usage"}}` message and
  returns structured `rate_limits` — e.g. `five_hour: {utilization: 51,
  resets_at: "2026-08-03T06:59:59Z"}` — with `total_cost_usd: 0` and empty
  `model_usage`. Confirmed live: this costs no tokens, so it can be polled
  freely. **Caveat:** the SDK method backing this is literally named
  `..._DONT_RELY_ON_THIS_API_YET()` and its schema says "Experimental — the
  response shape may change." Must fail loudly on an unrecognized shape, not
  silently assume quota is fine.
- **Safe headless resume.** `claude -p --resume <session-id> --permission-mode
  dontAsk <prompt>` runs with piped stdio (no TTY) and does **not** need
  `--dangerously-skip-permissions`. `--permission-mode` is a real, documented,
  non-bypassing flag (choices: `acceptEdits`, `auto`, `bypassPermissions`,
  `manual`, `dontAsk`, `plan`).
- **Context genuinely restored.** A session that discussed a `ledger-sync`
  refactor, then resumed headlessly via `--resume`, correctly recalled it —
  confirmed by asking "which module did I say I was refactoring?" and getting
  the right answer back.
- **A bare "continue" is not enough.** Live test: resuming with a generic
  "quota has reset, continue the work" prompt got *"I don't have context
  about what work was interrupted... there's no prior work shown"* — even
  though the conversation history was genuinely present. The resume prompt
  must re-inject concrete state (which task/plan step, current `git status`),
  not just say "continue."
- **Task completion is a structured signal, not something to parse from
  prose.** The `stream-json` terminal `result` message carries `is_error:
  boolean` and `subtype` (`success | error_during_execution | error_max_turns
  | error_max_budget_usd | error_max_structured_output_retries`). Reliable,
  no text-scraping needed.
- **But there's no dedicated "quota" result subtype.** A quota-caused failure
  and any other failure both land in the generic `error_during_execution`
  bucket, distinguishable (per static analysis of the shipped binary, not a
  live-observed quota exhaustion — none occurred during the POC) only by
  digging into nested `errors[]`/`terminal_reason` content. That's the same
  fragile parsing this spec is trying to avoid — so the design does **not**
  rely on it (see Goals, G3–G4).
- **`agy` cannot do this safely today.** It has `--conversation`/`-c` for
  resume and `stream-json` output, but its only non-interactive
  permission-bypass is `--dangerously-skip-permissions` — the exact flag
  this spec exists to avoid. No `agy` equivalent of `--permission-mode
  dontAsk` was found.

POC code (not part of this repo, throwaway verification only): `probe.ts`
(quota probe) and `supervisor.ts` (single-task wait-and-resume), both run
successfully end-to-end during this session.

## Goals

- **G1.** A task queue: an ordered list of discrete units of work, each with
  enough persisted state (which spec/plan step, expected next action) that a
  resumed session can be told concretely what to continue — not a bare
  "continue" prompt.
- **G2.** Dispatch each task via `claude -p --resume <session-id>
  --permission-mode dontAsk <task-specific prompt>` (or a fresh session per
  task, if that turns out to be the right shape — see Open Questions).
- **G3.** After each dispatch, read the terminal `result` message's
  `is_error` field to determine whether the task actually completed. Do not
  infer completion from prose.
- **G4.** On `is_error: true`, immediately probe quota via the zero-token
  `get_usage` control request. Only treat the failure as quota-caused if the
  probe confirms a window is exhausted at that moment — **correlate two
  independently-reliable structured signals**, never infer "this was a quota
  failure" from the task's own error text alone.
- **G5.** If quota-caused: schedule an automatic resume at `resets_at` (+ a
  safety margin), re-attempting the *same* task with concrete state
  re-injected into the resume prompt.
- **G6.** If not quota-caused: surface the failure as a normal failure. Do
  not retry indefinitely on the theory that it might be quota-related.
- **G7.** Subscription-only, per the Hard Constraint above — enforced as a
  design invariant, not just documented as intent.

## Non-Goals

- Not a REPL, not a streaming UI, not Antigravity/`agy` bridging for general
  conversational routing — that remains `feat/quota-limit-detection`'s scope,
  untouched by this spec.
- Not `agy` support in v1 — no safe non-interactive permission mode was
  found for it. Revisit if/when one exists; until then this targets `claude`
  only.
- Not resurrecting or fixing `AgentSubprocessTransport` /
  `src/transport/subprocess.ts` — this is a clean, separate mechanism, not a
  patch to that file.
- Not a generic retry-on-any-failure system — G6 is explicit that non-quota
  failures are surfaced, not retried.
- Not guaranteeing the experimental `get_usage` shape stays stable —
  acceptance criteria require failing loudly if it changes, not silently
  degrading.

## Affected Interfaces

To be finalized in the implementation plan once the Open Questions below are
resolved. Likely shape, based on the POC:

- A quota-probe module (POC: `probe.ts`) — `probeUsage()`, structured
  `UsageSnapshot`, defensive parsing that throws on an unrecognized shape.
- A resume/dispatch module (POC: `supervisor.ts`) — spawns `claude -p
  --resume <id> --permission-mode dontAsk`, reads `stream-json` output,
  extracts the terminal `result` message.
- A task-queue layer (not yet POC'd) — the part Goals G1/G3/G6 depend on;
  shape depends on Open Question 1 below.
- Persistence for the queue itself, so the orchestrator process can be
  killed/restarted without losing track of pending/in-flight tasks (depends
  on Open Question 2).

## Edge Cases

- The scheduled resume itself immediately hits quota again (e.g. `resets_at`
  was wrong, or something else consumed the freshly-reset window first) —
  needs a retry-the-retry path, not a one-shot assumption that waiting once
  is sufficient.
- A persistently broken task (fails for a real, non-quota reason every time)
  must not retry forever — needs a cap on total attempts, separate from the
  quota-wait logic (G6 already says non-quota failures surface rather than
  retry, but a task could plausibly alternate between a real bug and
  incidental quota exhaustion — cap total attempts regardless of cause).
- Orchestrator process itself is killed/restarted (machine reboot, crash)
  while a task is queued or a resume is scheduled — depends on Open Question
  2 (daemon vs. invoked run) for how state survives this.
- `get_usage`'s experimental shape changes in a future Claude Code release —
  probe must fail loudly (as the POC already does), not silently report
  "quota fine" and let the caller misattribute a real failure as transient.
- Multiple tasks queued where an earlier one is quota-blocked — does a later,
  independent task proceed in the meantime, or does the whole queue serialize
  behind the blocked one? (Depends on Open Question 1/4.)

## Acceptance Criteria

- [ ] A queued task that completes successfully (`is_error: false`) is marked
      done and the queue advances — no unnecessary quota probe fired on the
      success path.
- [ ] A queued task that fails with `is_error: true` triggers an immediate
      `get_usage` probe.
- [ ] If that probe shows a window at/above the blocked threshold, the task
      is rescheduled for `resets_at` (+ safety margin) with concrete
      resume-state in the prompt — not a bare "continue".
- [ ] If that probe shows quota is clear, the task is surfaced as a genuine
      failure, not silently retried.
- [ ] No code path constructs `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or
      `FetchTransport` — grep-able as a CI check, not just a code-review
      note.
- [ ] No code path passes `--dangerously-skip-permissions` (or the `agy`
      equivalent) anywhere.
- [ ] `get_usage` parsing throws a clear, distinct error on an unrecognized
      response shape rather than defaulting to "quota available."
- [ ] A total-attempts cap exists independent of the quota-wait logic (Edge
      Cases).
- [ ] All new code has tests; `bun test`, `bun run check:imports`, `bun run
      build` clean.

## Open Questions for Approval

1. **Where do tasks come from?** Should the queue be sourced from Chōwa's
   own `implementation_plan.md` checklists (each unchecked acceptance item
   becomes a task, naturally giving "concrete state" for free — G1/G5) or is
   this a more generic, standalone task list unrelated to the spec/plan
   pipeline? This materially changes both the task-state shape and how
   "resume with concrete state" gets implemented.
2. **Daemon or invoked-once?** Does the orchestrator run as a long-lived
   background process the user starts once (needs its own lifecycle: start,
   survive logout, logging, restart-safety), or is it invoked and runs until
   the queue empties, then exits (simpler, but doesn't survive the user's
   machine going to sleep/rebooting across a multi-hour quota wait)?
3. **Where does this live?** A new module inside Chōwa's existing `src/`
   (alongside the router/client it already has), or a separate,
   more standalone script/tool that Chōwa ships but doesn't deeply integrate
   into the existing provider-routing architecture? The POC scripts are
   currently standalone — deciding this affects whether they get adapted in
   place or rewritten against Chōwa's existing module boundaries.
4. **Task independence / serialization.** If task queues are per-project or
   per-conversation, should independent tasks proceed while one is
   quota-blocked, or does everything serialize behind the block? (Relates to
   Edge Cases.) Given a single subscription's quota is shared across
   everything running against it, parallel dispatch may not even help — but
   worth confirming rather than assuming serial is correct by default.
