/**
 * Model Router
 *
 * Pure function that resolves a TaskProfile to a RoutingTarget
 * based on a RoutingPolicy. Every decision is logged with the
 * matched rule so routing is auditable and overridable.
 */

import type {
  TaskProfile,
  RoutingPolicy,
  RoutingDecision,
  RoutingRule,
  RoutingTarget,
} from './types.js';

// ---------------------------------------------------------------------------
// Override map
// ---------------------------------------------------------------------------

/**
 * Optional overrides that take precedence over policy rules.
 * Keyed by task kind (e.g. 'mechanical') or '*' for a global override.
 */
export type RoutingOverrides = ReadonlyMap<string, RoutingTarget>;

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a task profile to a routing target.
 *
 * Evaluation order:
 * 1. Check overrides (exact kind match, then '*' wildcard)
 * 2. Evaluate policy rules in priority order (highest first)
 * 3. Fall back to policy's default target
 *
 * This is a pure function — no side effects, fully unit-testable.
 */
export function resolve(
  profile: TaskProfile,
  policy: RoutingPolicy,
  overrides?: RoutingOverrides,
): RoutingDecision {
  // 1. Check overrides first
  if (overrides) {
    const exactOverride = overrides.get(profile.kind);
    if (exactOverride) {
      return {
        target: exactOverride,
        matchedRule: null,
        reason: `Override applied for task kind "${profile.kind}" → ${exactOverride.provider}/${exactOverride.model}`,
      };
    }

    const globalOverride = overrides.get('*');
    if (globalOverride) {
      return {
        target: globalOverride,
        matchedRule: null,
        reason: `Global override applied → ${globalOverride.provider}/${globalOverride.model}`,
      };
    }
  }

  // 2. Evaluate rules in priority order (sort descending by priority)
  const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (matchesRule(profile, rule)) {
      return {
        target: rule.target,
        matchedRule: rule,
        reason: buildMatchReason(profile, rule),
      };
    }
  }

  // 3. Fall back to default
  return {
    target: policy.defaultTarget,
    matchedRule: null,
    reason: `No matching rule for ${profile.kind}/${profile.estimatedComplexity} — using default target ${policy.defaultTarget.provider}/${policy.defaultTarget.model}`,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function matchesRule(profile: TaskProfile, rule: RoutingRule): boolean {
  if (rule.match.kind !== undefined && rule.match.kind !== profile.kind) {
    return false;
  }

  if (
    rule.match.estimatedComplexity !== undefined &&
    rule.match.estimatedComplexity !== profile.estimatedComplexity
  ) {
    return false;
  }

  return true;
}

function buildMatchReason(profile: TaskProfile, rule: RoutingRule): string {
  const matchParts: string[] = [];

  if (rule.match.kind !== undefined) {
    matchParts.push(`kind=${rule.match.kind}`);
  }
  if (rule.match.estimatedComplexity !== undefined) {
    matchParts.push(`complexity=${rule.match.estimatedComplexity}`);
  }

  const matchDesc = matchParts.length > 0
    ? matchParts.join(', ')
    : 'wildcard (matches all)';

  return `Rule [priority=${rule.priority}, ${matchDesc}] matched ${profile.kind}/${profile.estimatedComplexity} → ${rule.target.provider}/${rule.target.model}`;
}
