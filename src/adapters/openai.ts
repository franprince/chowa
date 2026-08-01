/**
 * OpenAI Provider Adapter (Stub)
 *
 * TODO: Implement full OpenAI adapter matching the Anthropic adapter's interface.
 *
 * Key quirks to handle:
 * - `function.arguments` arrives as a JSON **string** — parse it, and if
 *   JSON.parse fails, run a repair pass (try jsonrepair first, fall back
 *   to a corrective re-prompt)
 * - Tool calls live at `choices[0].message.tool_calls[]`
 * - Each tool call has `{ id, type: 'function', function: { name, arguments } }`
 * - Tool definitions use `{ type: 'function', function: { name, description, parameters } }`
 * - Tool results go in separate messages with `role: 'tool'` and `tool_call_id`
 */

import type {
  ProviderAdapter,
  CanonicalTool,
  CanonicalToolCall,
  CanonicalMessage,
} from '../core/types.js';

export class OpenAIAdapter implements ProviderAdapter {
  readonly providerId = 'openai' as const;

  encodeTools(_tools: readonly CanonicalTool[]): unknown {
    // TODO: Map CanonicalTool[] → OpenAI tool definitions
    // Format: { type: 'function', function: { name, description, parameters } }
    throw new Error('OpenAI adapter not yet implemented — see TODO comments');
  }

  encodeMessages(_messages: readonly CanonicalMessage[]): unknown {
    // TODO: Map CanonicalMessage[] → OpenAI message format
    // - user → { role: 'user', content: string }
    // - assistant → { role: 'assistant', content: string, tool_calls?: [...] }
    // - tool_result → { role: 'tool', tool_call_id, content: string }
    throw new Error('OpenAI adapter not yet implemented — see TODO comments');
  }

  decodeToolCalls(_response: unknown): CanonicalToolCall[] {
    // TODO: Extract from choices[0].message.tool_calls
    // IMPORTANT: Parse function.arguments from JSON string to object
    // Use jsonrepair as fallback if JSON.parse fails
    throw new Error('OpenAI adapter not yet implemented — see TODO comments');
  }

  decodeTextContent(_response: unknown): string | undefined {
    // TODO: Extract choices[0].message.content
    throw new Error('OpenAI adapter not yet implemented — see TODO comments');
  }
}
