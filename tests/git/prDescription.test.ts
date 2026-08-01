import { describe, it, expect, vi } from 'vitest';

import { generatePRDescription } from '../../src/git/prDescription.js';
import type { CommitInfo } from '../../src/git/types.js';
import type { RoutingPolicy } from '../../src/router/types.js';
import { ChowaClient } from '../../src/client.js';
import type { Transport, TransportRequest, TransportResponse } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Mock transport
// ---------------------------------------------------------------------------

function createMockTransport(responseJson: Record<string, unknown>): Transport {
  return {
    send: vi.fn(async (): Promise<TransportResponse> => ({
      data: {
        content: [{ type: 'text', text: JSON.stringify(responseJson) }],
      },
      status: 200,
    })),
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const testCommits: CommitInfo[] = [
  {
    hash: 'abc1234',
    message: 'feat(utils): add date formatting with patterns',
    diff: '+export function formatDate(date: Date, pattern: string): string {',
  },
  {
    hash: 'def5678',
    message: 'refactor(utils): use Intl.NumberFormat for currency',
    diff: '+return new Intl.NumberFormat("en-US", { style: "currency" }).format(amount);',
  },
  {
    hash: 'ghi9012',
    message: 'docs: update README with installation section',
    diff: '+## Installation\n+\n+Run `npm install` to get started.',
  },
];

const testPolicy: RoutingPolicy = {
  rules: [],
  defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generatePRDescription', () => {
  it('should derive changes list from commit messages', async () => {
    const transport = createMockTransport({
      summary: 'Improves utility formatting functions and updates documentation.',
      testing: 'Run unit tests for formatDate and formatCurrency. Verify README renders correctly.',
      breakingChanges: null,
    });
    const client = new ChowaClient(transport);

    const pr = await generatePRDescription(testCommits, 'mock-diff', client, testPolicy);

    // Changes should come directly from commit messages, not re-summarized
    expect(pr.changes).toHaveLength(3);
    expect(pr.changes[0]).toBe('feat(utils): add date formatting with patterns');
    expect(pr.changes[1]).toBe('refactor(utils): use Intl.NumberFormat for currency');
    expect(pr.changes[2]).toBe('docs: update README with installation section');
  });

  it('should include LLM-generated summary', async () => {
    const transport = createMockTransport({
      summary: 'Modernizes formatting utilities to use platform-standard APIs.',
      testing: 'Run tests.',
      breakingChanges: null,
    });
    const client = new ChowaClient(transport);

    const pr = await generatePRDescription(testCommits, 'mock-diff', client, testPolicy);

    expect(pr.summary).toBe('Modernizes formatting utilities to use platform-standard APIs.');
  });

  it('should include testing notes', async () => {
    const transport = createMockTransport({
      summary: 'Updates',
      testing: 'Run `bun test` and verify formatting output matches snapshots.',
      breakingChanges: null,
    });
    const client = new ChowaClient(transport);

    const pr = await generatePRDescription(testCommits, 'mock-diff', client, testPolicy);

    expect(pr.testing).toContain('bun test');
  });

  it('should omit breaking changes when none detected', async () => {
    const transport = createMockTransport({
      summary: 'Minor update',
      testing: 'Run tests',
      breakingChanges: null,
    });
    const client = new ChowaClient(transport);

    const pr = await generatePRDescription(testCommits, 'mock-diff', client, testPolicy);

    expect(pr.breakingChanges).toBeUndefined();
  });

  it('should include breaking changes when detected', async () => {
    const transport = createMockTransport({
      summary: 'API change',
      testing: 'Test all consumers',
      breakingChanges: 'formatDate now requires a pattern parameter (was optional).',
    });
    const client = new ChowaClient(transport);

    const pr = await generatePRDescription(testCommits, 'mock-diff', client, testPolicy);

    expect(pr.breakingChanges).toBe('formatDate now requires a pattern parameter (was optional).');
  });

  it('should handle malformed LLM response gracefully', async () => {
    const transport: Transport = {
      send: vi.fn(async (): Promise<TransportResponse> => ({
        data: {
          content: [{ type: 'text', text: 'This is not JSON at all' }],
        },
        status: 200,
      })),
    };
    const client = new ChowaClient(transport);

    const pr = await generatePRDescription(testCommits, 'mock-diff', client, testPolicy);

    // Should fall back gracefully
    expect(pr.summary).toBeTruthy();
    expect(pr.changes).toHaveLength(3); // changes always come from commits
    expect(pr.testing).toBeTruthy();
  });

  it('should use the routing target fallback when the primary target fails', async () => {
    const policyWithFallback: RoutingPolicy = {
      rules: [
        {
          match: { kind: 'mechanical' },
          target: {
            provider: 'anthropic',
            model: 'claude-haiku',
            fallbacks: [{ provider: 'anthropic', model: 'claude-sonnet-4.6' }],
          },
          priority: 10,
        },
      ],
      defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
    };

    const send = vi.fn(async (request: TransportRequest): Promise<TransportResponse> => {
      if (request.model === 'claude-haiku') {
        throw new Error('primary model unavailable');
      }
      return {
        data: {
          content: [{
            type: 'text',
            text: JSON.stringify({ summary: 'Recovered via fallback', testing: 'n/a', breakingChanges: null }),
          }],
        },
        status: 200,
      };
    });
    const transport: Transport = { send };
    const client = new ChowaClient(transport);

    const pr = await generatePRDescription(testCommits, 'mock-diff', client, policyWithFallback);

    expect(pr.summary).toBe('Recovered via fallback');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0]!.model).toBe('claude-haiku');
    expect(send.mock.calls[1]![0]!.model).toBe('claude-sonnet-4.6');
  });
});
