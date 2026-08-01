# Implementation Plan: PR templates by branch flow

Status: **Approved**

Spec: [spec.md](spec.md)

## Files to modify

### 1. `src/git/types.ts`

Extend `PRDescription`:

```ts
export type PRType = 'standard' | 'release';

export interface PRDescription {
  readonly type: PRType;
  readonly summary: string;
  readonly changes: readonly string[];
  readonly testing: string;
  readonly breakingChanges?: string;
  readonly rolloutPlan?: string; // present only when type === 'release'
}
```

`PRType` is exported here (types module) rather than from
`prDescription.ts`, consistent with how `CommitInfo`/`PRDescription`
already live in `types.ts` and `prDescription.ts` only has behavior.

### 2. `src/git/prDescription.ts`

- Add `export function detectPRType(branchName: string): PRType`:
  ```ts
  export function detectPRType(branchName: string): PRType {
    return branchName.startsWith('release/') || branchName.startsWith('hotfix/')
      ? 'release'
      : 'standard';
  }
  ```
- Split the existing `PR_DESCRIPTION_SYSTEM_PROMPT` into two prompts:
  - `STANDARD_PR_SYSTEM_PROMPT` — exactly today's prompt/JSON contract
    (`summary`, `testing`, `breakingChanges`), unchanged wording.
  - `RELEASE_PR_SYSTEM_PROMPT` — same contract plus a required
    `rolloutPlan` string field. Prompt instructs: "rolloutPlan: how this
    release/hotfix will be rolled out and, if something goes wrong, how
    to roll it back — required, never null."
- `generatePRDescription` signature becomes:
  ```ts
  export async function generatePRDescription(
    commits: readonly CommitInfo[],
    baseBranchDiff: string,
    client: ChowaClient,
    policy: RoutingPolicy,
    branchName: string,
  ): Promise<PRDescription>
  ```
  (`branchName` appended at the end to minimize positional-arg churn in
  existing call sites' other arguments — call sites updated in this plan
  regardless since the param is required.)
  - Compute `const prType = detectPRType(branchName);` at the top.
  - Select system prompt based on `prType`.
  - Update `parseLLMResponse` (or add a sibling) to also extract
    `rolloutPlan` when present, defaulting to a fixed fallback string
    (`'Rollout/rollback plan not generated — document manually before
    merging.'`) if the LLM response is malformed or omits it **and**
    `prType === 'release'`. For `prType === 'standard'`, `rolloutPlan` is
    never set (stays `undefined`), regardless of what the LLM returns.
  - Return object includes `type: prType` and, conditionally,
    `rolloutPlan`.

### 3. `src/cli.ts` (`handlePR`)

- Pass `currentBranch` (already fetched at the top of `handlePR`) as the
  5th argument to `generatePRDescription`.
- After the existing `Breaking Changes` console output, add:
  ```ts
  if (pr.type === 'release' && pr.rolloutPlan) {
    console.log(`## Rollout / Rollback Plan\n${pr.rolloutPlan}\n`);
  }
  ```

### 4. `src/integrations/claude-code/bridge.ts` (`handlePR`)

- Add `const currentBranch = await gitOps.getCurrentBranch();` (not
  currently called in this method — `getCommitHistory`/
  `getDiffAgainstBase` are called against `baseBranch`, but the *current*
  branch is never fetched here today).
- Pass `currentBranch` as the 5th argument to `generatePRDescription`.
- No other changes — `data: { baseBranch, prDescription }` already
  forwards the whole object, so `type`/`rolloutPlan` reach the caller for
  free.

### 5. `tests/git/prDescription.test.ts`

Add cases (using the existing `createMockTransport` helper):

- `detectPRType` unit tests (import it directly): `'release/1.4.0'` →
  `'release'`, `'hotfix/login-500'` → `'release'`, `'feat/foo'` →
  `'standard'`, `'fix/bar'` → `'standard'`, `'docs/baz'` → `'standard'`,
  `'main'` → `'standard'`, `'random-name'` → `'standard'`.
- `generatePRDescription(..., 'feat/foo')` with a mock response containing
  no `rolloutPlan` → `pr.type === 'standard'`, `pr.rolloutPlan ===
  undefined`. (Matches today's existing tests — update their call sites
  to pass the new 5th arg with a `'feat/foo'`-style branch name so the
  existing assertions keep passing unchanged.)
- `generatePRDescription(..., 'release/1.4.0')` with a mock response
  containing `rolloutPlan: 'Deploy via canary, rollback by reverting the
  tag.'` → `pr.type === 'release'`, `pr.rolloutPlan` equals that string.
- `generatePRDescription(..., 'hotfix/login-500')` with a malformed
  (non-JSON) mock response → `pr.type === 'release'`, `pr.rolloutPlan`
  equals the fixed fallback string, no throw (mirrors the existing
  "malformed LLM response" test for `summary`/`testing`).
- Existing 6 tests: update their `generatePRDescription(...)` calls to
  pass a 5th `branchName` argument (`'feat/foo'` is fine for all of
  them since none test type-specific behavior) — no assertion changes
  needed otherwise.

### 6. `src/integrations/antigravity/bridge.ts` (`handlePR`)

Confirmed (grepped) to call `generatePRDescription` with the exact same
shape as the Claude Code bridge (`src/integrations/antigravity/bridge.ts:206-218`).
Same change as item 4:

- Add `const currentBranch = await gitOps.getCurrentBranch();`.
- Pass `currentBranch` as the 5th argument to `generatePRDescription`.
- No other changes — `data: { baseBranch, prDescription }` already
  forwards the whole object.

## Test Plan

1. `bun test tests/git/prDescription.test.ts` — new + updated cases pass.
2. `bun test` — full suite green (catches any other call site of
   `generatePRDescription` broken by the new required param, e.g. the
   antigravity bridge if it exists).
3. `bun run check:imports` — no new boundary violations (all changes stay
   within `git`/`cli`/`integrations`, consistent with existing layering).
4. `bun run build` — clean TypeScript compile.
5. Manual smoke test:
   - On a `fix/*` branch: `bun run src/cli.ts pr --base develop` → 4
     sections, no Rollout/Rollback Plan.
   - On a `release/*` or `hotfix/*` branch (create a throwaway one if
     needed): `bun run src/cli.ts pr --base main` → 5 sections including
     Rollout/Rollback Plan.
