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
import type { RoutingTarget, AvailableModelInfo } from './router/types.js';
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

  /** Fallback provider + model targets if primary fails. */
  readonly fallbacks?: readonly RoutingTarget[];

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
   * Get available models reported by the provider or environment.
   */
  getAvailableModels(provider?: string): AvailableModelInfo[] {
    const defaultModels: AvailableModelInfo[] = [
      { id: 'gemini-3.6-flash', provider: 'gemini', tier: 'fast', displayName: 'Gemini 3.6 Flash' },
      { id: 'gemini-3.6-pro', provider: 'gemini', tier: 'balanced', displayName: 'Gemini 3.6 Pro' },
      { id: 'claude-haiku', provider: 'anthropic', tier: 'fast', displayName: 'Claude Haiku' },
      { id: 'claude-sonnet-4.6', provider: 'anthropic', tier: 'balanced', displayName: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4.6', provider: 'anthropic', tier: 'opus', displayName: 'Claude Opus 4.6' },
    ];

    if (!provider) return defaultModels;
    return defaultModels.filter((m) => m.provider === provider);
  }

  /**
   * Make a tool-calling LLM request through the normalization layer with automatic failover.
   */
  async call(options: CallOptions): Promise<CallResult> {
    const targets: RoutingTarget[] = [
      { provider: options.provider, model: options.model },
      ...(options.fallbacks ?? []),
    ];

    let lastError: unknown;
    let attemptCount = 0;

    for (let tIndex = 0; tIndex < targets.length; tIndex++) {
      const target = targets[tIndex]!;
      attemptCount++;

      try {
        const result = await this.executeCallWithTarget(target, options);
        return {
          ...result,
          usedFallback: tIndex > 0,
          attemptCount,
        };
      } catch (error) {
        lastError = error;
        if (tIndex === targets.length - 1) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error('All provider targets failed');
  }

  private async executeCallWithTarget(
    target: RoutingTarget,
    options: CallOptions,
  ): Promise<CallResult> {
    const {
      tools,
      messages,
      maxRetries = 2,
      toolSchemas,
    } = options;

    const provider = target.provider;
    const model = target.model;

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
