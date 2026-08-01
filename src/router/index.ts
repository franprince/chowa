/**
 * Router barrel export.
 */

export type {
  TaskProfile,
  RoutingTarget,
  RoutingRule,
  RoutingPolicy,
  RoutingDecision,
  ModelTier,
  AvailableModelInfo,
} from './types.js';

export { resolve, resolveModelTier } from './router.js';
export type { RoutingOverrides } from './router.js';

export { loadPolicy, DEFAULT_POLICY } from './loadPolicy.js';
export type { LoadPolicyOptions } from './loadPolicy.js';
