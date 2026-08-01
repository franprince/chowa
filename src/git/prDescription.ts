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
import type { CommitInfo, PRDescription } from './types.js';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const PR_DESCRIPTION_SYSTEM_PROMPT = `You are a PR description generator. Given a list of commit messages and a diff, generate a structured PR description.

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
 * @returns A structured PRDescription
 */
export async function generatePRDescription(
  commits: readonly CommitInfo[],
  baseBranchDiff: string,
  client: ChowaClient,
  policy: RoutingPolicy,
): Promise<PRDescription> {
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
    tools: [],
    messages: [
      { role: 'user', content: PR_DESCRIPTION_SYSTEM_PROMPT },
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
    summary: llmDescription.summary,
    changes,
    testing: llmDescription.testing,
    breakingChanges: llmDescription.breakingChanges ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface LLMPRResponse {
  summary: string;
  testing: string;
  breakingChanges: string | null;
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
  };
}
