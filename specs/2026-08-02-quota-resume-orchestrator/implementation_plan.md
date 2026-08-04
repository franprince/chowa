# Implementation Plan: Quota-aware pipeline orchestrator

Status: **Dismissed** — 2026-08-04. Along with its spec — see that file's
Status line for why. Never reached Stage 3.

## Overview

This is large enough that building it as one PR would be unreviewable and
would violate Chōwa's own atomic-commit ethos. It's phased into four
increments, each independently shippable and testable, each building only on
what the previous phase already proved:

| Phase | Delivers | Depends on |
|---|---|---|
| A | Dispatch + quota-correlation + resume, generalized from the POC | Nothing new — promotes proven mechanisms |
| B | Router integration for dispatch target selection | Phase A |
| C | Pipeline state machine + task queue (spec → plan → execute, approval gates) | Phase A, B |
| D | Daemon process, `chowa daemon attach`, desktop notifications | Phase A, B, C |

Recommendation, not a requirement: **land Phase A as its own PR first.** It's
the part with zero design ambiguity left (every mechanism in it was verified
live tonight) and the part every later phase depends on — reviewing it in
isolation is strictly easier than reviewing it embedded in a 2000-line daemon
PR. Phases B–D can follow as separate branches off `develop` once A merges,
or all four can stay on `feat/quota-resume-orchestrator` as sequential
commits if you'd rather review it as one PR — your call at Stage 3.

## Directory & Package Structure

Per the spec's resolution: a separate product inside this repo, not folded
into `src/`. Concretely:

```
orchestrator/
  package.json        # own name, own deps, own scripts (test/build/lint)
  tsconfig.json        # own rootDir: "./src", own include — root tsconfig.json
                        #   only includes "src/**/*.ts" (repo root's src/), so
                        #   this needs to be fully separate, not an extension
  src/
    quota/probe.ts               # Phase A
    dispatch/dispatch.ts         # Phase A
    dispatch/resume.ts           # Phase A
    router-bridge.ts             # Phase B
    pipeline/state-machine.ts    # Phase C
    pipeline/task-queue.ts       # Phase C
    daemon.ts                    # Phase D
    cli.ts                       # Phase D — `chowa daemon attach` entry point
  tests/
    ...mirrors src/
```

**Cross-package imports use relative paths, not the `@chowa/*` aliases.**
Root `tsconfig.json`'s `paths` (`@chowa/router`, `@chowa/core`, etc.) are
scoped to that tsconfig only — a separate `orchestrator/tsconfig.json`
wouldn't inherit them without extending the root config, which would
re-couple the two "separate for now" products more tightly than intended.
`orchestrator/src/router-bridge.ts` importing
`../../../src/router/router.js` directly is more honest about the current
coupling, and is exactly what gets swapped for a real package dependency
(`@chowa/router` as a workspace or published package) if/when this is
extracted later — a smaller, more obvious diff than un-picking a shared
tsconfig.

**Verification stays a single command.** Root `package.json`'s `verify`
script (`bun test && bun run check:imports && bun run build && bun run
lint`) gets one more chained step so `bun run verify` at the repo root still
catches everything:

```diff
- "verify": "bun test && bun run check:imports && bun run build && bun run lint"
+ "verify": "bun test && bun run check:imports && bun run build && bun run lint && (cd orchestrator && bun run verify)"
```

`orchestrator/package.json` defines its own equivalent `verify` script.

## Phase A: Dispatch + Quota-Correlation + Resume

Promotes `probe.ts` / `supervisor.ts` from tonight's scratchpad POC into
tested, reusable primitives. This is the part every later phase calls into —
get it right once, use it everywhere (spec dispatch, plan dispatch, task
dispatch alike — spec's G6).

**File: `orchestrator/src/quota/probe.ts`**

Near-verbatim promotion of the POC's `probe.ts`: `probeUsage()`,
`UsageSnapshot`, `tightestWindow()`, defensive parsing that throws on an
unrecognized `get_usage` response shape (the experimental-API caveat from
the spec — must fail loudly, not default to "quota available").

**File: `orchestrator/src/dispatch/dispatch.ts`**

A single, uniform dispatch primitive — not "one for tasks, another for
specs." Wraps `claude -p --resume <id> --permission-mode dontAsk <prompt>`
(or a fresh session when no `id` is given — needed for the very first
dispatch of a new instruction, where there's no prior session to resume),
captures `stream-json` output, and extracts the terminal `result` message
(`is_error`, `subtype`, `session_id`). Never passes
`--dangerously-skip-permissions` — enforced by construction (the function
signature has no parameter that could smuggle it in), not just by
convention.

```ts
export interface DispatchOptions {
  readonly prompt: string;
  readonly sessionId?: string; // omit for a fresh session
  readonly model?: string;
  readonly cwd?: string;
}

export interface DispatchResult {
  readonly isError: boolean;
  readonly subtype: 'success' | 'error_during_execution' | 'error_max_turns'
    | 'error_max_budget_usd' | 'error_max_structured_output_retries';
  readonly sessionId: string;
  readonly rawResult: unknown; // full result message, for callers that need more
}

export function dispatch(options: DispatchOptions): Promise<DispatchResult>;
```

**File: `orchestrator/src/dispatch/resume.ts`**

The quota-correlation + scheduling logic from the POC's `supervisor.ts`,
generalized to wrap *any* `dispatch()` call, not just a task:

```ts
export interface ResumeOnQuotaOptions {
  readonly blockedAtPercent?: number; // default 100
  readonly safetyMarginMs?: number;   // default 30_000
  readonly maxWaitMs?: number;        // default 8h
}

// Runs `attempt`; on is_error, probes quota; if quota-blocked, waits and
// retries with `buildResumePrompt` re-invoked for concrete state; if not
// quota-blocked, rejects with the original failure (no blind retry — G11).
export function dispatchWithQuotaResume(
  attempt: () => Promise<DispatchResult>,
  buildResumePrompt: (previous: DispatchResult) => string,
  options?: ResumeOnQuotaOptions,
): Promise<DispatchResult>;
```

**Verification:** port the POC's manual test sequence into real tests —
mock the `claude` binary (a fake script exiting with a controlled
`stream-json` payload) rather than spawning the real CLI in CI, per the
existing test-suite convention (`MockTransport` pattern already used
elsewhere in this repo). One test does still exercise the real `probeUsage()`
against the actual local `claude` binary, guarded to skip in CI/no-binary
environments, mirroring how this session verified it manually.

## Phase B: Router Integration

**File: `orchestrator/src/router-bridge.ts`**

Thin wrapper — no new decision logic (spec G7):

```ts
import { resolve } from '../../../src/router/router.js';
import { loadPolicy } from '../../../src/router/loadPolicy.js';
import type { TaskProfile } from '../../../src/router/types.js';

export async function resolveDispatchTarget(profile: TaskProfile, cwd?: string) {
  const policy = await loadPolicy({ cwd });
  return resolve(profile, policy); // reuses existing rules, existing chowa.config.ts
}
```

Each dispatch (spec-drafting, plan-drafting, or a task) gets a `TaskProfile`
(`kind`/`estimatedComplexity`) assigned by whatever created it — how that
assignment happens (heuristic? does the assigning stage itself get to pick?)
is a Phase C concern, since it's tied to how tasks get their state.

**Verification:** a test asserting `resolveDispatchTarget` produces the same
decision `resolve()` would directly — a thin-wrapper regression test, not a
re-test of the router itself (already covered by the router's own test
suite).

## Phase C: Pipeline State Machine + Task Queue

The biggest phase — this is where the spec's G1–G5 (stage dispatch +
approval gates) and G8 (persisted task state) live.

**File: `orchestrator/src/pipeline/state-machine.ts`**

Tracks one instruction's progress through:
`drafting-spec → awaiting-spec-approval → drafting-plan →
awaiting-plan-approval → executing-tasks → done`. Each transition is driven
by either a `dispatch()` completing successfully, or an approval signal
arriving (Phase D provides the actual channel; this phase defines the state
shape and transition rules independent of how approval is signaled).

**File: `orchestrator/src/pipeline/task-queue.ts`**

Once a plan is approved, its acceptance-criteria checklist becomes the task
queue — each unchecked item is one task, carrying: the plan file path, the
specific checklist line, and current `git status`/`git diff` at
queue-creation time, so a resumed dispatch has concrete state to work from
(the POC's proven finding that a bare "continue" isn't enough).

**File: `orchestrator/src/pipeline/persistence.ts`**

Serializes pipeline + queue state to disk (JSON under e.g.
`.chowa-orchestrator/` in the target repo, gitignored) so the daemon (Phase
D) can restart without losing track — spec's Edge Cases requirement.

**Verification:** state-machine transition tests (valid/invalid transitions
rejected), task-queue extraction tests against fixture `implementation_plan.md`
files (checked/unchecked items parsed correctly), persistence round-trip
tests (serialize → kill → reload → same state).

## Phase D: Daemon Process + CLI Attach + Notifications

**File: `orchestrator/src/daemon.ts`**

The long-lived process (spec G14): owns one or more pipeline instances,
runs the dispatch/resume/queue loop, and exposes a control surface for
Phase D's CLI to attach to. Needs a concrete IPC mechanism — **not yet
chosen**; a Unix domain socket (simple, standard for this kind of local
daemon, no extra dependency) is the default assumption carried over from
the spec's resolved interaction-channel question, but pin this down at the
start of Phase D specifically, since it's the one piece of Phase D with any
remaining ambiguity.

**File: `orchestrator/src/cli.ts`**

`chowa daemon start` / `chowa daemon attach` / `chowa daemon stop`. Attach
shows a running status/log and accepts input (new instructions, approvals).

**Notifications:** OS-level desktop notifications on major transitions
(awaiting approval, quota-blocked until HH:MM, task failed, done). Platform
mechanism to be confirmed at Phase D start (Linux: likely `notify-send` via
a child process, matching this environment; needs a documented no-op
fallback on platforms/environments without a notification daemon, rather
than crashing the whole daemon over a missing notify mechanism).

**Verification:** daemon start/stop/restart-with-persisted-state tests; CLI
attach tests against a running test-instance daemon (not the real `claude`
binary — reuses Phase A's mocking approach).

## Test Plan Summary

| Area | New tests |
|---|---|
| `quota/probe.ts` | Mocked `get_usage` responses (success, malformed, missing fields → throws); one real-binary smoke test, skipped without `claude` on `PATH` |
| `dispatch/dispatch.ts` | Mocked `claude` subprocess: success, `error_during_execution`, various `result.subtype` values; asserts `--dangerously-skip-permissions` never appears in spawned args |
| `dispatch/resume.ts` | Quota-blocked → waits → retries with rebuilt prompt; not-blocked → rejects without retry; wait exceeding `maxWaitMs` → aborts |
| `router-bridge.ts` | Matches direct `resolve()` calls |
| `pipeline/state-machine.ts` | Valid/invalid transitions; approval-gate blocking behavior |
| `pipeline/task-queue.ts` | Fixture `implementation_plan.md` parsing, concrete-state attachment |
| `pipeline/persistence.ts` | Serialize/reload round-trip |
| `daemon.ts` / `cli.ts` | Start/stop/attach/restart against mocked dispatch layer |

## Verification Checklist (Stage 3 exit criteria, per phase)

- [ ] Phase A: `orchestrator` package's own `bun test` / `build` / `lint`
      clean; root `bun run verify` (with the chained step) clean.
- [ ] Phase A: grep-able confirmation no code path constructs
      `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`FetchTransport` anywhere in
      `orchestrator/` (spec's Hard Constraint, CI-checkable).
- [ ] Phase B: `resolveDispatchTarget` regression test passes.
- [ ] Phase C: state-machine + task-queue + persistence tests pass;
      approval gates verified to actually block (not just log a warning).
- [ ] Phase D: daemon lifecycle tests pass; manual smoke test of
      `chowa daemon attach` against a real (not mocked) local daemon
      instance, since some of this — actual IPC, actual desktop
      notifications — can't be fully proven by unit tests alone.
- [ ] All phases: root `bun test`, `bun run check:imports`, `bun run build`
      remain clean throughout (existing `src/` untouched by this work).

## Rollout

Continuing on `feat/quota-resume-orchestrator` for Phase A (already holds
the approved spec). Suggested commit breakdown for Phase A:

1. `feat(orchestrator): scaffold package (package.json, tsconfig, verify script wiring)`
2. `feat(orchestrator): add zero-token quota probe`
3. `feat(orchestrator): add dispatch primitive`
4. `feat(orchestrator): add quota-correlated resume wrapper`
5. `test(orchestrator): cover dispatch/resume/probe with mocked claude binary`

Ask before opening a PR (target: `develop`) once Phase A is verified. Phases
B–D: decide branch strategy (continue same branch vs. new branches per
phase) once Phase A is actually reviewed — no need to commit to that now.
