/**
 * Chowa Error Types
 *
 * Structured errors that carry enough context for callers to
 * auto-retry or surface meaningful diagnostics without catching
 * generic Error instances.
 */

/** Base class for all Chowa errors. */
export class ChowaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ChowaError';
  }
}

// ---------------------------------------------------------------------------
// Validation Errors
// ---------------------------------------------------------------------------

/** A single field-level validation issue. */
export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly expected?: string;
  readonly received?: string;
}

/**
 * Thrown/returned when a tool call's arguments don't match the expected schema.
 * Carries a pre-formatted correction message ready to send back to the LLM.
 */
export class ValidationError extends ChowaError {
  constructor(
    public readonly toolName: string,
    public readonly issues: readonly ValidationIssue[],
    public readonly correctionMessage: string,
  ) {
    super(
      `Tool call "${toolName}" failed validation: ${issues.map((i) => i.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
    this.name = 'ValidationError';
  }
}

// ---------------------------------------------------------------------------
// Adapter Errors
// ---------------------------------------------------------------------------

/**
 * Encoding or decoding failure within an adapter.
 * Carries the raw payload that caused the problem.
 */
export class AdapterError extends ChowaError {
  constructor(
    public readonly providerId: string,
    public readonly phase: 'encode' | 'decode',
    message: string,
    public readonly rawPayload?: unknown,
  ) {
    super(`[${providerId}] ${phase}: ${message}`, 'ADAPTER_ERROR');
    this.name = 'AdapterError';
  }
}

// ---------------------------------------------------------------------------
// Provider Errors
// ---------------------------------------------------------------------------

/** Upstream API error from a provider. */
export class ProviderError extends ChowaError {
  constructor(
    public readonly providerId: string,
    public readonly statusCode: number,
    message: string,
    public readonly retryable: boolean = false,
    public readonly rawResponse?: unknown,
  ) {
    super(`[${providerId}] HTTP ${statusCode}: ${message}`, 'PROVIDER_ERROR');
    this.name = 'ProviderError';
  }
}

// ---------------------------------------------------------------------------
// Router Errors
// ---------------------------------------------------------------------------

/** No matching routing rule and no default target configured. */
export class RoutingError extends ChowaError {
  constructor(message: string) {
    super(message, 'ROUTING_ERROR');
    this.name = 'RoutingError';
  }
}
