import { describe, test, expect } from 'vitest';
import { AntigravityBridge } from '../../src/integrations/antigravity/bridge.js';
import { ChowaClient } from '../../src/client.js';
import type { RoutingPolicy } from '../../src/router/types.js';

const mockPolicy: RoutingPolicy = {
  rules: [
    {
      match: { kind: 'mechanical' },
      target: { provider: 'gemini', model: 'gemini-3-flash' },
      priority: 10,
    },
    {
      match: { kind: 'architecture', estimatedComplexity: 'high' },
      target: { provider: 'anthropic', model: 'claude-opus-4.6' },
      priority: 50,
    },
  ],
  defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
};

describe('AntigravityBridge', () => {
  test('handle route action > should resolve routing target', async () => {
    const client = new ChowaClient();
    const bridge = new AntigravityBridge(client, mockPolicy);

    const response = await bridge.handle({
      action: 'route',
      taskProfile: { kind: 'architecture', estimatedComplexity: 'high' },
    });

    expect(response.success).toBe(true);
    expect(response.action).toBe('route');
    expect(response.data).toHaveProperty('target');
    const data = response.data as { target: { provider: string; model: string } };
    expect(data.target.provider).toBe('anthropic');
    expect(data.target.model).toBe('claude-opus-4.6');
  });

  test('handle call action > should return call result from client', async () => {
    const client = new ChowaClient();
    const bridge = new AntigravityBridge(client, mockPolicy);

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

  test('handle commit action > should execute commit analysis without error', async () => {
    const client = new ChowaClient();
    const bridge = new AntigravityBridge(client, mockPolicy);

    const response = await bridge.handle({ action: 'commit' });

    expect(response.success).toBe(true);
    expect(response.action).toBe('commit');
    expect(response.data).toHaveProperty('clusters');
  });

  test('handle pr action > should generate pr description output', async () => {
    const client = new ChowaClient();
    const bridge = new AntigravityBridge(client, mockPolicy);

    const response = await bridge.handle({
      action: 'pr',
      baseBranch: 'develop',
    });

    expect(response.success).toBe(true);
    expect(response.action).toBe('pr');
    expect(response.data).toHaveProperty('prDescription');
  });

  test('handle unknown action > should return success: false with error message', async () => {
    const client = new ChowaClient();
    const bridge = new AntigravityBridge(client, mockPolicy);

    const response = await bridge.handle({
      action: 'unknown' as any,
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Unknown action');
  });
});
