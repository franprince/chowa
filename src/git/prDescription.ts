/**
 * PR Description Generator
 *
 * Generates structured PR descriptions from a branch's commit history
 * and diffs. The "Changes" section is derived from the atomic commit
 * messages (not re-summarized from scratch), while the "Summary",
 * "Testing", and "Breaking Changes" sections use the LLM.
 */

import type { ChowaClient, CallOptions } from '../client.js';
import type { RoutingPolicy } from '../router/types.js';
import { resolve } from '../router/router.js';
import type { CommitInfo, PRDescription, PRType } from './types.js';

// ---------------------------------------------------------------------------
// PR type detection
// ---------------------------------------------------------------------------

/**
 * Classify a branch into a PR type using the documented branch-flow
 * convention: `release/*` / `hotfix/*` → `release`, everything else
 * (including unrecognized prefixes) → `standard`.
 */
export function detectPRType(branchName: string): PRType {
  return branchName.startsWith('release/') || branchName.startsWith('hotfix/')
    ? 'release'
    : 'standard';
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const STANDARD_PR_SYSTEM_PROMPT = `You are a PR description generator. Given a list of commit messages and a diff, generate a structured PR description.

You will receive:
1. A list of commit messages (already in Conventional Commits format)
2. The full diff against the base branch

Generate a JSON response with this exact structure:
{
  "summary": "A 2-3 sentence high-level summary of what this PR accomplishes",
  "testing": "Testing notes — what was tested, how to verify, any manual testing needed",
  "breakingChanges": "Description of breaking changes, or null if none"
}

Rules:
- The summary should explain the WHY, not just the WHAT
- Testing notes should be actionable and specific
- Only include breakingChanges if there are actual breaking changes (API changes, removed features, etc.)
- Respond with ONLY the JSON, no markdown fences or extra text`;

const RELEASE_PR_SYSTEM_PROMPT = `You are a PR description generator for a release/hotfix branch. Given a list of commit messages and a diff, generate a structured PR description.

You will receive:
1. A list of commit messages (already in Conventional Commits format)
2. The full diff against the base branch

Generate a JSON response with this exact structure:
{
  "summary": "A 2-3 sentence high-level summary of what this PR accomplishes",
  "testing": "Testing notes — what was tested, how to verify, any manual testing needed",
  "breakingChanges": "Description of breaking changes, or null if none",
  "rolloutPlan": "How this release/hotfix will be rolled out, and if something goes wrong, how to roll it back — required, never null"
}

Rules:
- The summary should explain the WHY, not just the WHAT
- Testing notes should be actionable and specific
- Only include breakingChanges if there are actual breaking changes (API changes, removed features, etc.)
- rolloutPlan is required — always provide concrete rollout and rollback steps
- Respond with ONLY the JSON, no markdown fences or extra text`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a structured PR description from commit history.
 *
 * The "changes" list is derived directly from commit messages —
 * the LLM generates summary, testing notes, and breaking change detection.
 *
 * @param commits - Array of commits on this branch
 * @param baseBranchDiff - Full diff between the branch and its base
 * @param client - The Chowa unified client
 * @param policy - Routing policy for model selection
 * @param branchName - Current branch name, used to select the PR template
 * @returns A structured PRDescription
 */
export async function generatePRDescription(
  commits: readonly CommitInfo[],
  baseBranchDiff: string,
  client: ChowaClient,
  policy: RoutingPolicy,
  branchName: string,
): Promise<PRDescription> {
  const prType = detectPRType(branchName);

  // Derive the changes list directly from commit messages
  const changes = commits.map((commit) => commit.message);

  // Use the router — PR description is a mechanical task
  const decision = resolve(
    { kind: 'mechanical', estimatedComplexity: 'medium' },
    policy,
  );

  const commitList = commits
    .map((c) => `- ${c.message}`)
    .join('\n');

  const callOptions: CallOptions = {
    provider: decision.target.provider,
    model: decision.target.model,
    fallbacks: decision.target.fallbacks,
    tools: [],
    messages: [
      {
        role: 'user',
        content: prType === 'release' ? RELEASE_PR_SYSTEM_PROMPT : STANDARD_PR_SYSTEM_PROMPT,
      },
      {
        role: 'assistant',
        content: 'I understand. Send me the commits and diff.',
      },
      {
        role: 'user',
        content: [
          'Commits:',
          commitList,
          '',
          'Diff:',
          baseBranchDiff.slice(0, 8000), // truncate to avoid token limits
        ].join('\n'),
      },
    ],
  };

  const result = await client.call(callOptions);
  const responseText = result.text?.trim() ?? '';

  // Parse the LLM's JSON response
  const llmDescription = parseLLMResponse(responseText);

  return {
    type: prType,
    summary: llmDescription.summary,
    changes,
    testing: llmDescription.testing,
    breakingChanges: llmDescription.breakingChanges ?? undefined,
    rolloutPlan: prType === 'release' ? (llmDescription.rolloutPlan ?? ROLLOUT_PLAN_FALLBACK) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const ROLLOUT_PLAN_FALLBACK =
  'Rollout/rollback plan not generated — document manually before merging.';

interface LLMPRResponse {
  summary: string;
  testing: string;
  breakingChanges: string | null;
  rolloutPlan: string | null;
}

function parseLLMResponse(text: string): LLMPRResponse {
  try {
    // Try to extract JSON from the response (handle markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        summary: typeof parsed['summary'] === 'string' ? parsed['summary'] : 'No summary generated',
        testing: typeof parsed['testing'] === 'string' ? parsed['testing'] : 'No testing notes generated',
        breakingChanges: typeof parsed['breakingChanges'] === 'string' ? parsed['breakingChanges'] : null,
        rolloutPlan: typeof parsed['rolloutPlan'] === 'string' ? parsed['rolloutPlan'] : null,
      };
    }
  } catch {
    // Fall through to default
  }

  // Fallback if parsing fails
  return {
    summary: text || 'No summary generated',
    testing: 'Manual testing recommended',
    breakingChanges: null,
    rolloutPlan: null,
  };
}
