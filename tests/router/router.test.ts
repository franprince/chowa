import { describe, it, expect } from 'vitest';

import { resolve } from '../../src/router/router.js';
import type { RoutingPolicy, TaskProfile } from '../../src/router/types.js';

// ---------------------------------------------------------------------------
// Test policy
// ---------------------------------------------------------------------------

const testPolicy: RoutingPolicy = {
  rules: [
    {
      match: { kind: 'mechanical' },
      target: { provider: 'gemini', model: 'gemini-3-flash' },
      priority: 10,
    },
    {
      match: { kind: 'security' },
      target: { provider: 'anthropic', model: 'claude-opus-4.6' },
      priority: 100,
    },
    {
      match: { kind: 'architecture', estimatedComplexity: 'high' },
      target: { provider: 'anthropic', model: 'claude-opus-4.6' },
      priority: 50,
    },
    {
      match: { kind: 'refactor', estimatedComplexity: 'high' },
      target: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
      priority: 40,
    },
    {
      match: { kind: 'debug' },
      target: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
      priority: 20,
    },
  ],
  defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('router.resolve', () => {
  it('should route mechanical tasks to Gemini Flash', () => {
    const profile: TaskProfile = { kind: 'mechanical', estimatedComplexity: 'low' };
    const decision = resolve(profile, testPolicy);

    expect(decision.target.provider).toBe('gemini');
    expect(decision.target.model).toBe('gemini-3-flash');
    expect(decision.matchedRule).not.toBeNull();
  });

  it('should route security tasks to Claude Opus regardless of complexity', () => {
    const lowSecurity: TaskProfile = { kind: 'security', estimatedComplexity: 'low' };
    const highSecurity: TaskProfile = { kind: 'security', estimatedComplexity: 'high' };

    const decisionLow = resolve(lowSecurity, testPolicy);
    const decisionHigh = resolve(highSecurity, testPolicy);

    expect(decisionLow.target.model).toBe('claude-opus-4.6');
    expect(decisionHigh.target.model).toBe('claude-opus-4.6');
  });

  it('should route high-complexity architecture to Claude Opus', () => {
    const profile: TaskProfile = { kind: 'architecture', estimatedComplexity: 'high' };
    const decision = resolve(profile, testPolicy);

    expect(decision.target.model).toBe('claude-opus-4.6');
  });

  it('should fall back to default for unmatched profiles', () => {
    const profile: TaskProfile = { kind: 'architecture', estimatedComplexity: 'low' };
    const decision = resolve(profile, testPolicy);

    // No rule matches architecture/low specifically
    expect(decision.matchedRule).toBeNull();
    expect(decision.target).toEqual(testPolicy.defaultTarget);
    expect(decision.reason).toContain('default');
  });

  it('should respect priority ordering (higher priority wins)', () => {
    // Security (priority 100) should beat everything
    const profile: TaskProfile = { kind: 'security', estimatedComplexity: 'high' };
    const decision = resolve(profile, testPolicy);

    expect(decision.matchedRule!.priority).toBe(100);
  });

  it('should include human-readable reason in every decision', () => {
    const profile: TaskProfile = { kind: 'mechanical', estimatedComplexity: 'low' };
    const decision = resolve(profile, testPolicy);

    expect(decision.reason).toBeTruthy();
    expect(typeof decision.reason).toBe('string');
    expect(decision.reason.length).toBeGreaterThan(10);
  });

  it('should apply exact kind override when provided', () => {
    const profile: TaskProfile = { kind: 'mechanical', estimatedComplexity: 'low' };
    const overrides = new Map([
      ['mechanical', { provider: 'openai', model: 'gpt-4o' }],
    ]);

    const decision = resolve(profile, testPolicy, overrides);

    expect(decision.target.provider).toBe('openai');
    expect(decision.target.model).toBe('gpt-4o');
    expect(decision.reason).toContain('Override');
  });

  it('should apply global wildcard override when no exact match', () => {
    const profile: TaskProfile = { kind: 'debug', estimatedComplexity: 'medium' };
    const overrides = new Map([
      ['*', { provider: 'local', model: 'llama-3' }],
    ]);

    const decision = resolve(profile, testPolicy, overrides);

    expect(decision.target.provider).toBe('local');
    expect(decision.target.model).toBe('llama-3');
    expect(decision.reason).toContain('Global override');
  });

  it('should prefer exact override over global wildcard', () => {
    const profile: TaskProfile = { kind: 'debug', estimatedComplexity: 'low' };
    const overrides = new Map([
      ['debug', { provider: 'anthropic', model: 'claude-opus-4.6' }],
      ['*', { provider: 'local', model: 'llama-3' }],
    ]);

    const decision = resolve(profile, testPolicy, overrides);

    expect(decision.target.provider).toBe('anthropic');
    expect(decision.target.model).toBe('claude-opus-4.6');
  });

  it('should route refactor/high to Claude Sonnet', () => {
    const profile: TaskProfile = { kind: 'refactor', estimatedComplexity: 'high' };
    const decision = resolve(profile, testPolicy);

    expect(decision.target.model).toBe('claude-sonnet-4.6');
    expect(decision.matchedRule!.priority).toBe(40);
  });
});
