/**
 * Commit Message Generator
 *
 * Generates Conventional Commits messages from diff clusters using the
 * LLM client. This is the first end-to-end use of the router — commit
 * message generation is a "mechanical" task profile, so it routes to
 * the cheapest/fastest available model.
 */

import type { ChowaClient, CallOptions } from '../client.js';
import type { RoutingPolicy } from '../router/types.js';
import { resolve } from '../router/router.js';
import type { DiffCluster } from './types.js';

// ---------------------------------------------------------------------------
// Conventional Commits format
// ---------------------------------------------------------------------------

/**
 * Regex for validating Conventional Commits format.
 * Matches: type(scope): description  OR  type: description
 */
export const CONVENTIONAL_COMMIT_REGEX =
  /^(feat|fix|chore|docs|refactor|test|perf|ci|build|style|revert)(\(.+\))?!?: .+$/;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const COMMIT_MESSAGE_SYSTEM_PROMPT = `You are a commit message generator. Given a diff, generate a single-line commit message in Conventional Commits format.

Rules:
1. Use one of these types: feat, fix, chore, docs, refactor, test, perf, ci, build, style, revert
2. Optionally include a scope in parentheses: feat(adapter): ...
3. Use imperative mood: "add" not "added" or "adds"
4. Keep the description concise (max 72 chars for the whole message)
5. Do NOT include a body or footer — just the single subject line
6. Respond with ONLY the commit message, nothing else

Examples:
- feat(adapter): add gemini tool decoding
- fix: handle malformed JSON in tool call arguments
- refactor(router): extract rule matching into separate function
- docs: update README with architecture diagram
- chore: update dependency versions`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a Conventional Commits message for a diff cluster.
 *
 * Routes the task as `mechanical/low` to pick the cheapest model,
 * then validates the output matches Conventional Commits format.
 *
 * @param cluster - The diff cluster to generate a message for
 * @param client - The Chowa unified client
 * @param policy - Routing policy for model selection
 * @returns A Conventional Commits formatted message string
 */
export async function generateCommitMessage(
  cluster: DiffCluster,
  client: ChowaClient,
  policy: RoutingPolicy,
): Promise<string> {
  const decision = resolve(
    { kind: 'mechanical', estimatedComplexity: 'low' },
    policy,
  );

  const diffContent = cluster.hunks.map((h) => h.content).join('\n\n');
  const filesChanged = cluster.files.join(', ');

  const callOptions: CallOptions = {
    provider: decision.target.provider,
    model: decision.target.model,
    fallbacks: decision.target.fallbacks,
    tools: [],
    // Inject system prompt via a leading user message
    // (system prompt handling varies by provider, but a user message always works)
    messages: [
      { role: 'user', content: COMMIT_MESSAGE_SYSTEM_PROMPT },
      { role: 'assistant', content: 'I understand. Send me the diff and I will generate a commit message.' },
      {
        role: 'user',
        content: `Generate a commit message for the following changes:\n\nFiles changed: ${filesChanged}\n\nDiff:\n${diffContent}`,
      },
    ],
  };

  const result = await client.call(callOptions);
  const message = result.text?.trim() ?? '';

  // Validate the message matches Conventional Commits format
  if (!CONVENTIONAL_COMMIT_REGEX.test(message)) {
    // If the model didn't follow the format, attempt a basic extraction
    const lines = message.split('\n');
    const firstLine = lines[0]?.trim() ?? '';

    if (CONVENTIONAL_COMMIT_REGEX.test(firstLine)) {
      return firstLine;
    }

    // Fall back to a generic chore message with the files
    return `chore: update ${cluster.files[0] ?? 'files'}`;
  }

  return message;
}
