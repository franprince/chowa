/**
 * Core barrel export.
 *
 * Re-exports all public types, errors, and validation utilities
 * from the core module.
 */

export type {
  JSONSchema,
  CanonicalTool,
  CanonicalToolCall,
  CanonicalMessage,
  CanonicalContentBlock,
  TextContentBlock,
  ToolUseContentBlock,
  ToolResultContentBlock,
  ProviderAdapter,
  Transport,
  TransportRequest,
  TransportResponse,
  CallResult,
  ChowaConfig,
  RoutingRuleConfig,
  RoutingTargetConfig,
} from './types.js';

export {
  ChowaError,
  ValidationError,
  AdapterError,
  ProviderError,
  RoutingError,
} from './errors.js';

export type { ValidationIssue } from './errors.js';

export {
  validateToolCall,
  validateToolCalls,
} from './validate.js';

export type {
  ValidationResult,
  ValidationSuccess,
  ValidationFailure,
} from './validate.js';
