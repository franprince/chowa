import { describe, test, expect } from 'vitest';
import { ClaudeCodeBridge } from '../../src/integrations/claude-code/bridge.js';
import { ChowaClient } from '../../src/client.js';
import type { RoutingPolicy } from '../../src/router/types.js';

const mockPolicy: RoutingPolicy = {
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
    {
      match: { kind: 'refactor' },
      target: {
        provider: 'gemini',
        model: 'fast',
        fallbacks: [{ provider: 'anthropic', model: 'claude-sonnet-4.6' }],
      },
      priority: 30,
    },
  ],
  defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
};

describe('ClaudeCodeBridge', () => {
  test('handle models action > should list available models', async () => {
    const client = new ChowaClient();
    const bridge = new ClaudeCodeBridge(client, mockPolicy);

    const response = await bridge.handle({ action: 'models' });

    expect(response.success).toBe(true);
    expect(response.action).toBe('models');
    expect(response.data).toHaveProperty('models');
    const data = response.data as { models: Array<{ id: string }> };
    expect(data.models.length).toBeGreaterThan(0);
  });

  test('handle route action > should resolve routing target and model tiers', async () => {
    const client = new ChowaClient();
    const bridge = new ClaudeCodeBridge(client, mockPolicy);

    const response = await bridge.handle({
      action: 'route',
      taskProfile: { kind: 'refactor', estimatedComplexity: 'high' },
    });

    expect(response.success).toBe(true);
    expect(response.action).toBe('route');
    expect(response.data).toHaveProperty('target');
    const data = response.data as { target: { provider: string; model: string } };
    expect(data.target.model).toBe('gemini-3.6-flash');
  });

  test('handle call action > should execute call via ChowaClient', async () => {
    const client = new ChowaClient();
    const bridge = new ClaudeCodeBridge(client, mockPolicy);

    const response = await bridge.handle({
      action: 'call',
      provider: 'anthropic',
      model: 'claude-sonnet-4.6',
      tools: [],
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(response.success).toBe(true);
    expect(response.action).toBe('call');
    expect(response.data).toHaveProperty('toolCalls');
  });

  test('handle commit action > should execute commit analysis', async () => {
    const client = new ChowaClient();
    const bridge = new ClaudeCodeBridge(client, mockPolicy);

    const response = await bridge.handle({ action: 'commit' });

    expect(response.success).toBe(true);
    expect(response.action).toBe('commit');
    expect(response.data).toHaveProperty('clusters');
  });

  test('handle pr action > should generate pr description', async () => {
    const client = new ChowaClient();
    const bridge = new ClaudeCodeBridge(client, mockPolicy);

    const response = await bridge.handle({ action: 'pr', baseBranch: 'develop' });

    expect(response.success).toBe(true);
    expect(response.action).toBe('pr');
    expect(response.data).toHaveProperty('prDescription');
  });

  test('handle unknown action > should return error response', async () => {
    const client = new ChowaClient();
    const bridge = new ClaudeCodeBridge(client, mockPolicy);

    const response = await bridge.handle({ action: 'invalid' as any });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Unknown action');
  });
});
