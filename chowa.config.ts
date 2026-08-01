/**
 * Chowa Default Configuration
 *
 * Starter routing policy using models available in Antigravity IDE.
 * This config treats all providers equally — Gemini is used where it's
 * genuinely the best fit (fast/cheap tasks), not because of any platform preference.
 *
 * Model mapping:
 *   mechanical/*        → gemini-3-flash     (fastest, cheapest)
 *   security/*          → claude-opus-4.6    (strongest reasoning, pinned)
 *   architecture/high   → claude-opus-4.6    (complex design decisions)
 *   refactor/high       → claude-sonnet-4.6  (strong reasoning, moderate cost)
 *   debug/*             → claude-sonnet-4.6  (good balance)
 *   default             → claude-sonnet-4.6  (safe general-purpose)
 */

import type { ChowaConfig } from './src/core/types.js';

const config: ChowaConfig = {
  routing: {
    rules: [
      // Fast/cheap model for mechanical tasks (formatting, renaming, commit messages)
      {
        match: { kind: 'mechanical' },
        target: { provider: 'gemini', model: 'gemini-3-flash' },
        priority: 10,
      },

      // Strongest model for security-sensitive changes — pinned regardless of cost
      {
        match: { kind: 'security' },
        target: { provider: 'anthropic', model: 'claude-opus-4.6' },
        priority: 100,
      },

      // Complex architecture decisions need the best reasoning
      {
        match: { kind: 'architecture', estimatedComplexity: 'high' },
        target: { provider: 'anthropic', model: 'claude-opus-4.6' },
        priority: 50,
      },

      // High-complexity refactors benefit from strong reasoning
      {
        match: { kind: 'refactor', estimatedComplexity: 'high' },
        target: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
        priority: 40,
      },

      // Debug tasks: good balance of reasoning and speed
      {
        match: { kind: 'debug' },
        target: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
        priority: 20,
      },
    ],

    // Safe general-purpose default
    defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
  },
};

export default config;
