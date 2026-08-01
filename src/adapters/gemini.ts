/**
 * Gemini Provider Adapter (Stub)
 *
 * TODO: Implement full Gemini adapter matching the Anthropic adapter's interface.
 *
 * Key quirks to handle:
 * - Tool definitions use `functionDeclarations` array with `{ name, description, parameters }`
 * - `functionCall.args` is already an object (no string parsing needed)
 * - **No native call ID** — synthesize one deterministically using a hash of
 *   `name + turnIndex + position` so downstream code can treat it like other providers
 * - Response structure: `candidates[0].content.parts[]` where each part can be
 *   `{ text }` or `{ functionCall: { name, args } }`
 * - Tool results go as `{ functionResponse: { name, response } }` parts
 */

import type {
  ProviderAdapter,
  CanonicalTool,
  CanonicalToolCall,
  CanonicalMessage,
} from '../core/types.js';

export class GeminiAdapter implements ProviderAdapter {
  readonly providerId = 'gemini' as const;

  encodeTools(_tools: readonly CanonicalTool[]): unknown {
    // TODO: Map CanonicalTool[] → Gemini functionDeclarations
    // Format: { functionDeclarations: [{ name, description, parameters }] }
    throw new Error('Gemini adapter not yet implemented — see TODO comments');
  }

  encodeMessages(_messages: readonly CanonicalMessage[]): unknown {
    // TODO: Map CanonicalMessage[] → Gemini contents format
    // - user → { role: 'user', parts: [{ text }] }
    // - assistant → { role: 'model', parts: [{ text } | { functionCall }] }
    // - tool_result → { role: 'user', parts: [{ functionResponse: { name, response } }] }
    throw new Error('Gemini adapter not yet implemented — see TODO comments');
  }

  decodeToolCalls(_response: unknown): CanonicalToolCall[] {
    // TODO: Extract from candidates[0].content.parts where part has functionCall
    // IMPORTANT: Synthesize deterministic ID — no native call ID from Gemini
    // Use crypto.createHash('sha256').update(`${name}:${turnIndex}:${position}`).digest('hex').slice(0, 24)
    throw new Error('Gemini adapter not yet implemented — see TODO comments');
  }

  decodeTextContent(_response: unknown): string | undefined {
    // TODO: Extract text parts from candidates[0].content.parts
    throw new Error('Gemini adapter not yet implemented — see TODO comments');
  }
}
