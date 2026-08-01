/**
 * Router Types
 *
 * Type definitions for the model routing system.
 */

// ---------------------------------------------------------------------------
// Task Profile
// ---------------------------------------------------------------------------

/** Describes the nature and complexity of a task for routing purposes. */
export interface TaskProfile {
  /** The kind of task. */
  readonly kind: 'mechanical' | 'refactor' | 'architecture' | 'security' | 'debug';

  /** Estimated complexity of the task. */
  readonly estimatedComplexity: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Model Tiers & Information
// ---------------------------------------------------------------------------

/** Semantic model performance/capability tier. */
export type ModelTier = 'fast' | 'balanced' | 'reasoning' | 'opus';

export interface AvailableModelInfo {
  readonly id: string;
  readonly provider: string;
  readonly tier: ModelTier;
  readonly displayName?: string;
}

// ---------------------------------------------------------------------------
// Routing Target
// ---------------------------------------------------------------------------

/** A provider + model pair (or semantic tier) that a task should be routed to. */
export interface RoutingTarget {
  readonly provider: string;
  readonly model: string | ModelTier;
  readonly fallbacks?: readonly Omit<RoutingTarget, 'fallbacks'>[];
}

// ---------------------------------------------------------------------------
// Routing Rule
// ---------------------------------------------------------------------------

/**
 * A single routing rule. The `match` object specifies which task profiles
 * this rule applies to — fields left undefined act as wildcards.
 */
export interface RoutingRule {
  /** Partial match against task profiles. Undefined fields match anything. */
  readonly match: {
    readonly kind?: TaskProfile['kind'];
    readonly estimatedComplexity?: TaskProfile['estimatedComplexity'];
  };

  /** Where to route matching tasks. */
  readonly target: RoutingTarget;

  /** Higher priority rules are evaluated first. */
  readonly priority: number;
}

// ---------------------------------------------------------------------------
// Routing Policy
// ---------------------------------------------------------------------------

/** Complete routing policy: ordered rules + fallback default. */
export interface RoutingPolicy {
  readonly rules: readonly RoutingRule[];
  readonly defaultTarget: RoutingTarget;
}

// ---------------------------------------------------------------------------
// Routing Decision
// ---------------------------------------------------------------------------

/** The result of resolving a task profile against a routing policy. */
export interface RoutingDecision {
  /** The provider + model selected. */
  readonly target: RoutingTarget;

  /** The rule that matched, or null if the default was used. */
  readonly matchedRule: RoutingRule | null;

  /** Human-readable explanation of why this target was selected. */
  readonly reason: string;
}
