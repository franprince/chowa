/**
 * Local Model Provider Adapter (Stub)
 *
 * For models running via Ollama, llama.cpp, or similar local inference
 * servers that may not have native tool-calling support.
 *
 * TODO: Implement full local adapter matching the Anthropic adapter's interface.
 *
 * Strategy:
 * - Force structured JSON output via a system prompt that describes the
 *   expected tool-call format as JSON
 * - If using llama.cpp, use GBNF grammar constraints to enforce valid JSON
 *   output at the token level
 * - Decode by strict JSON parse with jsonrepair fallback
 * - Tool definitions are embedded in the system prompt as a JSON schema
 *   description, not sent as native tool parameters
 *
 * Expected JSON output format from the model:
 * ```json
 * {
 *   "tool_calls": [
 *     { "name": "tool_name", "arguments": { ... } }
 *   ]
 * }
 * ```
 */

import type {
  ProviderAdapter,
  CanonicalTool,
  CanonicalToolCall,
  CanonicalMessage,
} from '../core/types.js';

export class LocalAdapter implements ProviderAdapter {
  readonly providerId = 'local' as const;

  encodeTools(_tools: readonly CanonicalTool[]): unknown {
    // TODO: Embed tool definitions in a system prompt as JSON schema descriptions
    // No native tool format — the prompt IS the tool definition
    throw new Error('Local adapter not yet implemented — see TODO comments');
  }

  encodeMessages(_messages: readonly CanonicalMessage[]): unknown {
    // TODO: Map to a simple chat format compatible with Ollama/llama.cpp
    // Inject structured output instructions in the system prompt
    throw new Error('Local adapter not yet implemented — see TODO comments');
  }

  decodeToolCalls(_response: unknown): CanonicalToolCall[] {
    // TODO: Parse JSON from model output text
    // 1. Try strict JSON.parse on the response text
    // 2. If that fails, try jsonrepair
    // 3. Extract tool_calls array from parsed JSON
    // 4. Synthesize IDs (no native IDs from local models)
    throw new Error('Local adapter not yet implemented — see TODO comments');
  }

  decodeTextContent(_response: unknown): string | undefined {
    // TODO: Extract non-tool-call text content from the response
    throw new Error('Local adapter not yet implemented — see TODO comments');
  }
}
