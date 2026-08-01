/**
 * Chowa Core Types
 *
 * Canonical types that form the lingua franca of the Chowa library.
 * All provider-specific formats are normalized to and from these types.
 */

// ---------------------------------------------------------------------------
// JSON Schema (subset used for tool parameter definitions)
// ---------------------------------------------------------------------------

/**
 * Minimal JSON Schema type for tool parameter definitions.
 * We use this instead of importing a full JSON Schema library to keep
 * the core dependency-free. Zod schemas are compiled to this format
 * via zod-to-json-schema at the boundary.
 */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  $ref?: string;
  definitions?: Record<string, JSONSchema>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Canonical Tool Definition
// ---------------------------------------------------------------------------

/** A tool definition in provider-agnostic canonical form. */
export interface CanonicalTool {
  /** Unique tool name (snake_case by convention). */
  readonly name: string;

  /** Human-readable description of what the tool does. */
  readonly description: string;

  /** JSON Schema describing the tool's input parameters. */
  readonly parameters: JSONSchema;
}

// ---------------------------------------------------------------------------
// Canonical Tool Call
// ---------------------------------------------------------------------------

/** A decoded tool invocation from an LLM response, in canonical form. */
export interface CanonicalToolCall {
  /** Unique identifier for this tool call (provider-assigned or synthesized). */
  readonly id: string;

  /** Name of the tool being called. */
  readonly name: string;

  /** Parsed arguments as a plain object. */
  readonly arguments: Record<string, unknown>;

  /**
   * The original provider-native payload for this tool call.
   * Preserved for debugging and logging — never inspected by core logic.
   */
  readonly raw: unknown;
}

// ---------------------------------------------------------------------------
// Canonical Messages
// ---------------------------------------------------------------------------

/** Content block types within a message. */
export interface TextContentBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ToolUseContentBlock {
  readonly type: 'tool_use';
  readonly toolCall: CanonicalToolCall;
}

export interface ToolResultContentBlock {
  readonly type: 'tool_result';
  readonly toolCallId: string;
  readonly result: unknown;
  readonly isError?: boolean;
}

export type CanonicalContentBlock =
  | TextContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock;

/** Unified chat message type covering all turn types. */
export interface CanonicalMessage {
  /** The role of the message sender. */
  readonly role: 'user' | 'assistant' | 'tool_result';

  /**
   * Message content — either a simple string (for plain text turns)
   * or an array of content blocks (for multi-part turns with tool calls).
   */
  readonly content: string | readonly CanonicalContentBlock[];

  /** Tool calls in this message (assistant turns only). Convenience accessor. */
  readonly toolCalls?: readonly CanonicalToolCall[];

  /** The tool call ID this message is responding to (tool_result turns only). */
  readonly toolCallId?: string;
}

// ---------------------------------------------------------------------------
// Provider Adapter Contract
// ---------------------------------------------------------------------------

/** The interface every provider adapter must implement. */
export interface ProviderAdapter {
  /** Unique identifier for this provider (e.g. 'anthropic', 'openai', 'gemini'). */
  readonly providerId: string;

  /** Encode canonical tools into the provider's native tool format. */
  encodeTools(tools: readonly CanonicalTool[]): unknown;

  /** Encode canonical messages into the provider's native message format. */
  encodeMessages(messages: readonly CanonicalMessage[]): unknown;

  /** Decode tool calls from the provider's native response format. */
  decodeToolCalls(response: unknown): CanonicalToolCall[];

  /** Extract text content from the provider's native response format. */
  decodeTextContent(response: unknown): string | undefined;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** Request payload for the transport layer. */
export interface TransportRequest {
  readonly provider: string;
  readonly model: string;
  readonly tools: unknown;
  readonly messages: unknown;
  readonly options?: Record<string, unknown>;
}

/** Response from the transport layer — the raw provider response. */
export interface TransportResponse {
  readonly data: unknown;
  readonly status: number;
  readonly headers?: Record<string, string>;
}

/** Pluggable transport interface — swap between real HTTP and test mocks. */
export interface Transport {
  send(request: TransportRequest): Promise<TransportResponse>;
}

// ---------------------------------------------------------------------------
// Client Result
// ---------------------------------------------------------------------------

/** The result of a ChowaClient.call() invocation. */
export interface CallResult {
  /** Decoded tool calls in canonical form. */
  readonly toolCalls: readonly CanonicalToolCall[];

  /** Text content from the response, if any. */
  readonly text?: string;

  /** Number of validation retries that were needed. */
  readonly retriesUsed: number;

  /** Which provider handled this call. */
  readonly provider: string;

  /** Which model handled this call. */
  readonly model: string;

  /** Whether a fallback target was used to serve this request. */
  readonly usedFallback?: boolean;

  /** Number of provider attempts executed. */
  readonly attemptCount?: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Top-level Chowa configuration. */
export interface ChowaConfig {
  readonly routing: {
    readonly rules: readonly RoutingRuleConfig[];
    readonly defaultTarget: RoutingTargetConfig;
  };
}

export interface RoutingRuleConfig {
  readonly match: {
    readonly kind?: string;
    readonly estimatedComplexity?: string;
  };
  readonly target: RoutingTargetConfig;
  readonly priority: number;
}

export interface RoutingTargetConfig {
  readonly provider: string;
  readonly model: string;
  readonly fallbacks?: readonly Omit<RoutingTargetConfig, 'fallbacks'>[];
}
