/**
 * Chowa — Top-level barrel export
 *
 * Re-exports the public API surface for library consumers.
 */

// Core types and utilities
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
} from './core/types.js';

export {
  ChowaError,
  ValidationError,
  AdapterError,
  ProviderError,
  RoutingError,
} from './core/errors.js';

export { validateToolCall, validateToolCalls } from './core/validate.js';

// Client
export { ChowaClient } from './client.js';
export type { CallOptions } from './client.js';

// Adapters
export { AnthropicAdapter } from './adapters/anthropic.js';
export { OpenAIAdapter } from './adapters/openai.js';
export { GeminiAdapter } from './adapters/gemini.js';
export { LocalAdapter } from './adapters/local.js';
export { getAdapter, registerAdapter, clearAdapterRegistry } from './adapters/registry.js';

// Router
export type {
  TaskProfile,
  RoutingTarget,
  RoutingRule,
  RoutingPolicy,
  RoutingDecision,
} from './router/types.js';
export { resolve as resolveRoute } from './router/router.js';

// Git
export type {
  DiffHunk,
  DiffCluster,
  CommitInfo,
  PRDescription,
  ClusterStrategy,
} from './git/types.js';
export { splitDiff, parseDiff, FileBasedClusterStrategy } from './git/diffSplitter.js';
export { generateCommitMessage, CONVENTIONAL_COMMIT_REGEX } from './git/commitMessage.js';
export { generatePRDescription } from './git/prDescription.js';
export { GitOps } from './git/gitOps.js';
