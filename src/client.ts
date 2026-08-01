/**
 * Chowa Unified Client
 *
 * The primary interface for application code. Picks the right adapter,
 * encodes tools and messages, sends the request via a pluggable transport,
 * decodes the response, validates tool calls, and handles retries.
 *
 * The transport layer is injectable so tests can mock API calls without
 * hitting real provider endpoints.
 */

import type { ZodSchema } from 'zod';

import type {
  CanonicalTool,
  CanonicalToolCall,
  CanonicalMessage,
  CallResult,
  Transport,
  TransportRequest,
  TransportResponse,
} from './core/types.js';
import { validateToolCall } from './core/validate.js';
import { getAdapter } from './adapters/registry.js';

// ---------------------------------------------------------------------------
// Call options
// ---------------------------------------------------------------------------

export interface CallOptions {
  /** Provider ID (e.g. 'anthropic', 'openai', 'gemini'). */
  readonly provider: string;

  /** Model identifier (e.g. 'claude-sonnet-4-20250514'). */
  readonly model: string;

  /** Tools available for this call. */
  readonly tools: readonly CanonicalTool[];

  /** Conversation messages. */
  readonly messages: readonly CanonicalMessage[];

  /** Maximum validation retries before giving up. Defaults to 2. */
  readonly maxRetries?: number;

  /**
   * Zod schemas for tool argument validation, keyed by tool name.
   * If provided, decoded tool calls are validated against these schemas
   * and retried with correction messages on failure.
   */
  readonly toolSchemas?: ReadonlyMap<string, ZodSchema>;
}

// ---------------------------------------------------------------------------
// Mock transport (default — no real API calls)
// ---------------------------------------------------------------------------

/**
 * A no-op transport that always returns an empty response.
 * Used as the default so the client is safe to construct without
 * configuring a real transport.
 */
class MockTransport implements Transport {
  async send(request: TransportRequest): Promise<TransportResponse> {
    if (request.provider === 'gemini') {
      return {
        data: {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [],
              },
            },
          ],
        },
        status: 200,
      };
    }

    return {
      data: { content: [] },
      status: 200,
    };
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ChowaClient {
  private readonly transport: Transport;

  constructor(transport?: Transport) {
    this.transport = transport ?? new MockTransport();
  }

  /**
   * Make a tool-calling LLM request through the normalization layer.
   *
   * Flow:
   * 1. Look up the adapter for the requested provider
   * 2. Encode tools and messages into provider-native format
   * 3. Send via transport
   * 4. Decode response into canonical tool calls + text
   * 5. Validate tool call arguments against zod schemas (if provided)
   * 6. On validation failure, append correction message and retry
   * 7. Return the final result with retry count
   */
  async call(options: CallOptions): Promise<CallResult> {
    const {
      provider,
      model,
      tools,
      messages,
      maxRetries = 2,
      toolSchemas,
    } = options;

    const adapter = getAdapter(provider);
    const encodedTools = adapter.encodeTools(tools);

    let currentMessages = [...messages];
    let retriesUsed = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const encodedMessages = adapter.encodeMessages(currentMessages);

      const response = await this.transport.send({
        provider,
        model,
        tools: encodedTools,
        messages: encodedMessages,
      });

      const toolCalls = adapter.decodeToolCalls(response.data);
      const text = adapter.decodeTextContent(response.data);

      // If no schemas to validate against, return immediately
      if (!toolSchemas || toolCalls.length === 0) {
        return { toolCalls, text, retriesUsed, provider, model };
      }

      // Validate each tool call
      const failures = this.findValidationFailures(toolCalls, toolSchemas);

      if (failures.length === 0) {
        return { toolCalls, text, retriesUsed, provider, model };
      }

      // On last attempt, return what we have (caller decides what to do)
      if (attempt === maxRetries) {
        return { toolCalls, text, retriesUsed, provider, model };
      }

      // Append the assistant's response and correction messages for retry
      currentMessages = this.appendRetryMessages(
        currentMessages,
        toolCalls,
        text,
        failures,
      );
      retriesUsed++;
    }

    // Unreachable, but TypeScript needs it
    return { toolCalls: [], retriesUsed, provider, model };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private findValidationFailures(
    toolCalls: readonly CanonicalToolCall[],
    schemas: ReadonlyMap<string, ZodSchema>,
  ): Array<{ call: CanonicalToolCall; correctionMessage: string }> {
    const failures: Array<{ call: CanonicalToolCall; correctionMessage: string }> = [];

    for (const call of toolCalls) {
      const schema = schemas.get(call.name);
      if (!schema) continue; // no schema = no validation

      const result = validateToolCall(call, schema);
      if (!result.valid) {
        failures.push({
          call,
          correctionMessage: result.error.correctionMessage,
        });
      }
    }

    return failures;
  }

  private appendRetryMessages(
    messages: readonly CanonicalMessage[],
    toolCalls: readonly CanonicalToolCall[],
    text: string | undefined,
    failures: ReadonlyArray<{ call: CanonicalToolCall; correctionMessage: string }>,
  ): CanonicalMessage[] {
    const updated = [...messages];

    // Add the assistant's response as a message
    const assistantContent = text ?? '';
    updated.push({
      role: 'assistant',
      content: assistantContent,
      toolCalls,
    });

    // Add a correction message for each failed tool call
    const correctionText = failures
      .map((f) => f.correctionMessage)
      .join('\n\n');

    updated.push({
      role: 'user',
      content: correctionText,
    });

    return updated;
  }
}
