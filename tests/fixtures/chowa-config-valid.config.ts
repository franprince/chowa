import type { ChowaConfig } from '../../src/core/types.js';

const config: ChowaConfig = {
  routing: {
    rules: [
      {
        match: { kind: 'mechanical' },
        target: {
          provider: 'gemini',
          model: 'gemini-3.6-flash',
          fallbacks: [{ provider: 'anthropic', model: 'claude-haiku' }],
        },
        priority: 10,
      },
    ],
    defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
  },
};

export default config;
