# Spec: Quota-aware task orchestrator for Claude Code / Antigravity sessions

Status: **Approved** — 2026-08-03. All open questions resolved; see
Resolved Questions below.

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

**Scope, clarified after drafting:** this is not just "resume the leftover
tasks of an already-written plan." Chōwa itself becomes the driver of its own
spec → plan → execute pipeline: it hands a raw instruction to an agent
session to assess complexity and draft `spec.md`, pauses for the same human
approval gate the pipeline already mandates, hands the approved spec to an
agent to draft `implementation_plan.md`, pauses again for approval, then
breaks the approved plan's tasks apart and dispatches each to an agent
session — tracking every dispatch (this stage included) with the same
completion/quota-correlation/resume mechanism throughout, not only during
the final execute stage. In other words: everything that currently requires
a human to sit inside a live Claude Code chat driving each pipeline stage by
hand (as happened for every spec in this repo, including this one) becomes
something Chōwa can drive itself, with the human still gating the two
approval points the pipeline has always required.

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

**Pipeline stages — Chōwa drives, human still gates:**

- **G1.** Accept a raw instruction from the user and dispatch it to an agent
  session to assess complexity and draft `spec.md`, following this repo's
  existing spec conventions (`specs/<date>-<slug>/`, `specs/INDEX.md` row).
- **G2.** Pause after the spec is drafted and wait for explicit human
  approval — the same Stage 1 → Stage 2 gate the pipeline already mandates.
  Does not proceed to planning without it (see Open Questions for exactly how
  the human signals approval to a process that isn't a live chat turn).
- **G3.** Once approved, dispatch to an agent to draft
  `implementation_plan.md` against the approved spec.
- **G4.** Pause again for explicit human approval — the Stage 2 → Stage 3
  gate — before any task dispatch begins.
- **G5.** Once approved, break the plan's tasks (its acceptance-criteria
  checklist / discrete units of work) into a queue, each carrying enough
  persisted state (which plan step, expected next action) that a resumed
  session can be told concretely what to continue — not a bare "continue"
  prompt (verified necessary — see "Verified via POC").

**Task dispatch and tracking — applies at every stage above, not just G5:**

- **G6.** Dispatch each unit of work (spec drafting, plan drafting, or an
  individual task) via `claude -p --resume <session-id> --permission-mode
  dontAsk <stage-or-task-specific prompt>` (or a fresh session per dispatch,
  if that turns out to be the right shape — see Open Questions).
- **G7.** Task → model/agent assignment reuses Chōwa's existing router
  (`chowa.config.ts`, `resolve()` in `src/router/`) rather than inventing a
  new decision mechanism — the same `kind`/`estimatedComplexity` profile the
  router already uses for `mechanical`/`architecture`/`security`/etc.
  determines which model handles a given task.
- **G8.** After each dispatch, read the terminal `result` message's
  `is_error` field to determine whether it actually completed. Do not infer
  completion from prose.
- **G9.** On `is_error: true`, immediately probe quota via the zero-token
  `get_usage` control request. Only treat the failure as quota-caused if the
  probe confirms a window is exhausted at that moment — **correlate two
  independently-reliable structured signals**, never infer "this was a quota
  failure" from the dispatch's own error text alone.
- **G10.** If quota-caused: schedule an automatic resume at `resets_at` (+ a
  safety margin), re-attempting the *same* dispatch with concrete state
  re-injected into the resume prompt.
- **G11.** If not quota-caused: surface the failure as a normal failure. Do
  not retry indefinitely on the theory that it might be quota-related.
- **G12.** Default dispatch is sequential — one unit of work at a time.
  Parallel dispatch across independent tasks is a supported capability, not
  the default: a single subscription's quota is one shared pool across
  everything running against it, so parallelism doesn't buy more headroom
  and needs to be opted into deliberately, not assumed safe by default.
- **G13.** Subscription-only, per the Hard Constraint above — enforced as a
  design invariant, not just documented as intent.
- **G14.** Runs as a long-lived daemon, not a one-shot invocation — the user
  can continually interact with it (new instructions, approvals, status
  checks) across its whole lifetime, and it proactively surfaces state
  transitions (stage complete and awaiting approval, quota-blocked until a
  specific time, resumed, task failed) rather than requiring the user to
  poll for status.

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
- Not a generic retry-on-any-failure system — G11 is explicit that non-quota
  failures are surfaced, not retried.
- Not guaranteeing the experimental `get_usage` shape stays stable —
  acceptance criteria require failing loudly if it changes, not silently
  degrading.
- Not building a scheduler optimized for parallel throughput — G12 says
  parallel dispatch must be *possible*, not that v1 needs sophisticated
  concurrency management. A basic opt-in is sufficient.
- Not a multi-repo/multi-project orchestration model — scoped to one working
  directory at a time, matching how the rest of Chōwa already works.

## Affected Interfaces

To be finalized in the implementation plan once the Open Questions below are
resolved. Likely shape, based on the POC and G1–G13:

- A quota-probe module (POC: `probe.ts`) — `probeUsage()`, structured
  `UsageSnapshot`, defensive parsing that throws on an unrecognized shape.
- A dispatch module (POC: `supervisor.ts`) — spawns `claude -p --resume <id>
  --permission-mode dontAsk`, reads `stream-json` output, extracts the
  terminal `result` message. Used for spec dispatch, plan dispatch, and each
  individual task dispatch alike (G6) — one mechanism, not three.
- A pipeline-stage state machine (not yet POC'd) — tracks where a given
  instruction currently sits: `drafting-spec → awaiting-spec-approval →
  drafting-plan → awaiting-plan-approval → executing-tasks → done`, per G1–G5.
- A task-queue layer (not yet POC'd) — the part G5/G8/G11 depend on, sourced
  from the approved plan's checklist.
- Router integration (G7) — calls Chōwa's existing `resolve()` /
  `chowa.config.ts` to pick each dispatch's target model; no new
  decision logic duplicated here.
- Persistence for pipeline + queue state, so the daemon can be
  killed/restarted without losing track of which stage an instruction is in,
  or which tasks are pending/in-flight.
- A daemon process with a start/stop/attach lifecycle (G14) — exact shape
  (socket/IPC-backed CLI attach, desktop notifications, or something else)
  depends on Open Question 1.

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
- Daemon process itself is killed/restarted (machine reboot, crash) while a
  task is queued or a resume is scheduled — persisted pipeline/queue state
  (Affected Interfaces) must let it pick back up, not lose track silently.
- A client is attached (per Open Question 1's working assumption) when the
  daemon restarts — the attach channel must reconnect or clearly report
  "daemon restarted, reattaching" rather than silently going stale, since
  G14 promises continual interaction and proactive updates, not just
  eventual consistency after the fact.
- `get_usage`'s experimental shape changes in a future Claude Code release —
  probe must fail loudly (as the POC already does), not silently report
  "quota fine" and let the caller misattribute a real failure as transient.
- Multiple tasks queued where an earlier one is quota-blocked — per G12,
  serial is the default, so later tasks wait too unless parallel dispatch was
  explicitly opted into for that run.
- **How does a human actually approve a stage** (G2/G4) when the thing
  waiting isn't a live chat turn but a background/dispatched process? Not yet
  resolved — see Open Questions. Whatever the mechanism, it must be
  distinguishable from "the process is still working" (a stuck approval wait
  and a stuck task must not look identical to the human checking status).
- A dispatched spec/plan-drafting stage itself gets quota-blocked mid-draft —
  the same G9/G10 correlation-and-resume logic must apply here too, not just
  to task-stage dispatches (this is why G6/G7/G8/G9/G10/G11 are written as
  "each dispatch," not "each task").

## Acceptance Criteria

- [ ] A raw instruction dispatched for spec drafting produces a `spec.md`
      under `specs/<date>-<slug>/` following this repo's existing convention,
      with an `INDEX.md` row.
- [ ] The pipeline halts after spec drafting and does not dispatch plan
      drafting until an explicit approval signal is observed.
- [ ] The same halt-and-wait applies between plan drafting and task
      execution.
- [ ] Each task dispatch's target model is resolved via Chōwa's existing
      `resolve()`/router — no parallel/duplicate routing logic introduced.
- [ ] A dispatch (spec, plan, or task) that completes successfully
      (`is_error: false`) is marked done and the pipeline/queue advances — no
      unnecessary quota probe fired on the success path.
- [ ] A dispatch that fails with `is_error: true` triggers an immediate
      `get_usage` probe.
- [ ] If that probe shows a window at/above the blocked threshold, the
      dispatch is rescheduled for `resets_at` (+ safety margin) with concrete
      resume-state in the prompt — not a bare "continue".
- [ ] If that probe shows quota is clear, the dispatch is surfaced as a
      genuine failure, not silently retried.
- [ ] This applies uniformly to spec-drafting and plan-drafting dispatches,
      not only task dispatches.
- [ ] No code path constructs `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or
      `FetchTransport` — grep-able as a CI check, not just a code-review
      note.
- [ ] No code path passes `--dangerously-skip-permissions` (or the `agy`
      equivalent) anywhere.
- [ ] `get_usage` parsing throws a clear, distinct error on an unrecognized
      response shape rather than defaulting to "quota available."
- [ ] A total-attempts cap exists independent of the quota-wait logic (Edge
      Cases).
- [ ] Parallel dispatch is reachable via explicit opt-in only; the default
      path for an unmodified invocation is sequential.
- [ ] All new code has tests; `bun test`, `bun run check:imports`, `bun run
      build` clean.

## Resolved Questions

1. **Where do tasks come from?** Resolved: Chōwa drives the full pipeline
   itself — spec drafting → plan drafting → task execution — dispatching
   each stage to an agent session (G1–G5), rather than consuming an
   already-written plan handed to it externally.
2. **Task independence / serialization.** Resolved: sequential by default
   (G12). Parallel dispatch is a supported capability, not the default,
   since a single subscription's quota is one shared pool regardless of how
   many sessions draw on it concurrently.
3. **Daemon or invoked-once?** Resolved: a long-lived background process
   ("daemon"), not something invoked once per instruction that exits when
   done. Two explicit requirements that drove this: the user needs to be
   able to **continually interact with it** (not just fire-and-forget an
   instruction), and it must **proactively keep the user updated** — state
   changes get pushed out, not left for the user to poll for. This also
   settles most of former Open Question 1 (how approval gets signaled): the
   same persistent channel the daemon uses to interact and push updates is
   the natural place approvals flow through too, rather than a separate
   file/commit-watching mechanism.

4. **Interaction/update channel.** Resolved: the proposed default — a
   persistent process the user attaches to via a CLI command (e.g. `chowa
   daemon attach`) showing a running status/log and accepting input
   (approvals, new instructions), plus OS-level desktop notifications for
   major state transitions (awaiting approval, quota-blocked until HH:MM,
   task failed).
5. **Where this lives.** Resolved: a separate product inside this repo, not
   folded into `src/`'s existing module tree — for now, with the explicit
   understanding this may be extracted further (its own package, its own
   repo) later. Confirmed against `scripts/check-imports.ts`: the boundary
   check only scans inside `src/{core,adapters,router,git}` for imports from
   `src/integrations/` — a new top-level directory sits entirely outside
   what it enforces, so this placement has no friction with existing
   tooling. No workspaces/monorepo tooling exists in `package.json` yet;
   the implementation plan decides whether this needs one or can stay a
   plain sibling directory with its own `package.json`.

No open questions remain.
